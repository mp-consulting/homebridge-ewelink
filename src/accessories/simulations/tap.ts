import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import { EWeLinkPlatform } from '../../platform.js';
import { AccessoryContext, DeviceParams, SingleDeviceConfig, MultiDeviceConfig } from '../../types/index.js';
import { SwitchHelper } from '../../utils/switch-helper.js';

/**
 * Tap/Faucet Simulation Accessory
 * Simulates a tap/faucet using a switch device
 */
export class TapAccessory extends BaseAccessory {
  /** Channel index for multi-channel devices */
  private readonly channelIndex: number;

  /** Device configuration */
  private readonly deviceConfig?: SingleDeviceConfig | MultiDeviceConfig;

  /** Disable timer functionality */
  private readonly disableTimer: boolean;

  /** Timer for auto-off */
  private timer?: NodeJS.Timeout;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    this.channelIndex = accessory.context.channelIndex || 0;

    // Get device-specific config
    this.deviceConfig = platform.config.singleDevices?.find(
      d => d.deviceId === this.deviceId,
    ) || platform.config.multiDevices?.find(
      d => d.deviceId === this.deviceId,
    );

    // Check timer configuration
    this.disableTimer = this.deviceConfig?.disableTimer || false;

    // Set up the valve service (faucets use valve service)
    this.service = this.getOrAddService(this.Service.Valve);

    // Set valve type to faucet (3)
    this.service.updateCharacteristic(this.Characteristic.ValveType, 3);

    // Configure Active characteristic
    this.service.getCharacteristic(this.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    // Configure InUse characteristic
    this.service.getCharacteristic(this.Characteristic.InUse)
      .onGet(this.getInUse.bind(this));

    // Configure duration characteristics if timer not disabled
    if (!this.disableTimer) {
      // Set default duration to 120 seconds
      this.service.updateCharacteristic(this.Characteristic.SetDuration, 120);
      this.service.addCharacteristic(this.Characteristic.RemainingDuration);

      this.service.getCharacteristic(this.Characteristic.SetDuration)
        .onSet(this.setDuration.bind(this));
    } else {
      // Remove duration characteristics if timer disabled
      if (this.service.testCharacteristic(this.Characteristic.SetDuration)) {
        this.service.removeCharacteristic(
          this.service.getCharacteristic(this.Characteristic.SetDuration)!,
        );
      }
      if (this.service.testCharacteristic(this.Characteristic.RemainingDuration)) {
        this.service.removeCharacteristic(
          this.service.getCharacteristic(this.Characteristic.RemainingDuration)!,
        );
      }
    }

    // Set initial state
    this.updateState(this.deviceParams);
  }

  /**
   * Get active state
   */
  private async getActive(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      const isOn = SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);
      return isOn ? this.Characteristic.Active.ACTIVE : this.Characteristic.Active.INACTIVE;
    }, 'Active');
  }

  /**
   * Set active state
   */
  private async setActive(value: CharacteristicValue): Promise<void> {
    await this.handleSet(value as number, 'Active', async (active) => {
      const on = active === this.Characteristic.Active.ACTIVE;
      const params = SwitchHelper.buildSwitchParams(this.deviceParams, this.channelIndex, on);

      // Update InUse to match Active
      this.service.updateCharacteristic(
        this.Characteristic.InUse,
        on ? this.Characteristic.InUse.IN_USE : this.Characteristic.InUse.NOT_IN_USE,
      );

      // Start timer if activating and timer not disabled
      if (on && !this.disableTimer) {
        const duration = this.service.getCharacteristic(this.Characteristic.SetDuration).value as number || 120;
        this.service.updateCharacteristic(this.Characteristic.RemainingDuration, duration);

        // Clear existing timer
        if (this.timer) {
          clearTimeout(this.timer);
        }

        // Set new timer
        this.timer = setTimeout(() => {
          this.service.setCharacteristic(this.Characteristic.Active, this.Characteristic.Active.INACTIVE);
        }, duration * 1000);
      } else {
        // Clear timer if deactivating
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = undefined;
        }
        if (!this.disableTimer) {
          this.service.updateCharacteristic(this.Characteristic.RemainingDuration, 0);
        }
      }

      return await this.sendCommand(params);
    });
  }

  /**
   * Get in use state
   */
  private async getInUse(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      const isOn = SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);
      return isOn ? this.Characteristic.InUse.IN_USE : this.Characteristic.InUse.NOT_IN_USE;
    }, 'InUse');
  }

  /**
   * Set duration (only updates timer if tap is active)
   */
  private async setDuration(value: CharacteristicValue): Promise<void> {
    const duration = value as number;
    const isActive = this.service.getCharacteristic(this.Characteristic.Active).value;

    if (isActive === this.Characteristic.Active.ACTIVE) {
      // Update remaining duration
      this.service.updateCharacteristic(this.Characteristic.RemainingDuration, duration);

      // Clear existing timer
      if (this.timer) {
        clearTimeout(this.timer);
      }

      // Set new timer with updated duration
      this.timer = setTimeout(() => {
        this.service.setCharacteristic(this.Characteristic.Active, this.Characteristic.Active.INACTIVE);
      }, duration * 1000);

      this.logDebug(`Tap duration updated to ${duration}s while active`);
    }
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    Object.assign(this.deviceParams, params);

    // Update tap state
    const isOn = SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);
    this.service.updateCharacteristic(
      this.Characteristic.Active,
      isOn ? this.Characteristic.Active.ACTIVE : this.Characteristic.Active.INACTIVE,
    );
    this.service.updateCharacteristic(
      this.Characteristic.InUse,
      isOn ? this.Characteristic.InUse.IN_USE : this.Characteristic.InUse.NOT_IN_USE,
    );

    this.logDebug(`Tap state updated: ${isOn ? 'ACTIVE' : 'INACTIVE'}`);
  }
}
