import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams, SingleDeviceConfig } from '../types/index.js';
import { TIMING } from '../constants/timing-constants.js';
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

  /** Ignore updates flag for inching mode debouncing (wrapped in object for reference passing) */
  private ignoreUpdatesRef = { value: false };

  /** Device configuration */
  private readonly deviceConfig?: SingleDeviceConfig;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // For multi-channel devices, use switchNumber from context
    this.channelIndex = accessory.context.switchNumber ?? accessory.context.channelIndex ?? 0;

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
      this.cacheState = await this.handleInchingModeSet(
        this.service,
        this.Characteristic.On,
        this.deviceParams,
        this.channelIndex,
        this.cacheState,
        this.ignoreUpdatesRef,
      );
    } else {
      await this.handleSet(value as boolean, 'On', async (on) => {
        const params = SwitchHelper.buildSwitchParams(this.deviceParams, this.channelIndex, on);
        return await this.sendCommand(params);
      });
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

      if (receivedOn && !this.ignoreUpdatesRef.value) {
        // Set ignore flag
        this.ignoreUpdatesRef.value = true;
        setTimeout(() => {
          this.ignoreUpdatesRef.value = false;
        }, TIMING.INCHING_DEBOUNCE_MS);

        // Toggle cached state
        this.cacheState = !this.cacheState;
        this.service.updateCharacteristic(this.Characteristic.On, this.cacheState);
        this.logDebug(`Inching mode state toggled (external): ${this.cacheState ? 'ON' : 'OFF'}`);
      }
    } else {
      // Standard mode - update from device state
      let isOn = this.getCurrentState();

      // For multi-channel devices, master switch (channel 0) shows ON if ANY channel is ON
      if (this.channelIndex === 0 && this.accessory.context.channelCount) {
        const isSCM = SwitchHelper.isSCMDevice(this.deviceParams);
        if (isSCM && params.switches) {
          // Check if ANY switch is on (primary state logic)
          isOn = params.switches.some(sw => sw.switch === 'on');
        }
      }

      this.service.updateCharacteristic(this.Characteristic.On, isOn);
      this.logDebug(`State updated: ${isOn ? 'ON' : 'OFF'}${this.channelIndex === 0 && this.accessory.context.channelCount ? ' (primary state)' : ''}`);
    }
  }
}
