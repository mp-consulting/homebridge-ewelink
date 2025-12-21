import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams, SingleDeviceConfig } from '../types/index.js';
import { SwitchHelper } from '../utils/switch-helper.js';

/**
 * Switch Accessory with optional inching mode support
 */
export class SwitchAccessory extends BaseAccessory {
  /** Channel index for multi-channel devices */
  private readonly channelIndex: number;

  /** Inching mode enabled */
  private readonly isInched: boolean;

  /** Cached state for inching mode (toggles internally) */
  private cacheState: boolean = false;

  /** Ignore updates flag for inching mode debouncing */
  private ignoreUpdates: boolean = false;

  /** Device configuration */
  private readonly deviceConfig?: SingleDeviceConfig;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    this.channelIndex = accessory.context.channelIndex || 0;

    // Get device-specific config
    this.deviceConfig = platform.config.singleDevices?.find(
      d => d.deviceId === this.deviceId,
    );

    // Check if inching mode is enabled
    this.isInched = this.deviceConfig?.isInched || false;

    // Set up the switch service
    this.service = this.getOrAddService(this.Service.Switch);

    // Configure On characteristic
    this.service.getCharacteristic(this.Characteristic.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.setOn.bind(this));

    // Initialize cache state for inching mode
    if (this.isInched) {
      this.cacheState = this.getCurrentState();
    }

    // Set initial state
    this.updateState(this.deviceParams);
  }

  /**
   * Get switch state
   */
  private async getOn(): Promise<CharacteristicValue> {
    if (this.isInched) {
      return this.cacheState;
    }
    return this.handleGet(() => this.getCurrentState(), 'On');
  }

  /**
   * Set switch state
   */
  private async setOn(value: CharacteristicValue): Promise<void> {
    if (this.isInched) {
      await this.handleInchingModeSet(value as boolean);
    } else {
      await this.handleSet(value as boolean, 'On', async (on) => {
        const params = SwitchHelper.buildSwitchParams(this.deviceParams, this.channelIndex, on);
        return await this.sendCommand(params);
      });
    }
  }

  /**
   * Handle inching mode set - always sends "on", toggles internal state
   */
  private async handleInchingModeSet(value: boolean): Promise<void> {
    try {
      // Toggle the cached state
      const newState = !this.cacheState;

      // Always send "on" command for inching mode
      const params = SwitchHelper.buildSwitchParams(this.deviceParams, this.channelIndex, true);

      // Set ignore flag to prevent echo updates
      this.ignoreUpdates = true;
      setTimeout(() => {
        this.ignoreUpdates = false;
      }, 1500);

      await this.sendCommand(params);

      // Update cached state
      this.cacheState = newState;
      this.service.updateCharacteristic(this.Characteristic.On, this.cacheState);

      this.logDebug(`Inching mode state toggled: ${this.cacheState ? 'ON' : 'OFF'}`);
    } catch (err) {
      this.logError('Failed to set inching mode state', err);
      // Revert characteristic to previous state
      setTimeout(() => {
        this.service.updateCharacteristic(this.Characteristic.On, this.cacheState);
      }, 2000);
      throw err;
    }
  }

  /**
   * Get current switch state from params
   */
  private getCurrentState(): boolean {
    return SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    // Update local cache
    Object.assign(this.deviceParams, params);

    if (this.isInched) {
      // In inching mode, check for "on" command and toggle cached state
      const isSCM = SwitchHelper.isSCMDevice(this.deviceParams);
      const receivedOn = isSCM
        ? params.switches?.[this.channelIndex]?.switch === 'on'
        : params.switch === 'on';

      if (receivedOn && !this.ignoreUpdates) {
        // Set ignore flag
        this.ignoreUpdates = true;
        setTimeout(() => {
          this.ignoreUpdates = false;
        }, 1500);

        // Toggle cached state
        this.cacheState = !this.cacheState;
        this.service.updateCharacteristic(this.Characteristic.On, this.cacheState);
        this.logDebug(`Inching mode state toggled (external): ${this.cacheState ? 'ON' : 'OFF'}`);
      }
    } else {
      // Standard mode - update from device state
      const isOn = this.getCurrentState();
      this.service.updateCharacteristic(this.Characteristic.On, isOn);
      this.logDebug(`State updated: ${isOn ? 'ON' : 'OFF'}`);
    }
  }
}
