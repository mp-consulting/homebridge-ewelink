import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams } from '../types/index.js';
import { SwitchHelper } from '../utils/switch-helper.js';

/**
 * Switch Accessory
 */
export class SwitchAccessory extends BaseAccessory {
  /** Channel index for multi-channel devices */
  private readonly channelIndex: number;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    this.channelIndex = accessory.context.channelIndex || 0;

    // Set up the switch service
    this.service = this.getOrAddService(this.Service.Switch);

    // Configure On characteristic
    this.service.getCharacteristic(this.Characteristic.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.setOn.bind(this));

    // Set initial state
    this.updateState(this.deviceParams);
  }

  /**
   * Get switch state
   */
  private async getOn(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.getCurrentState(), 'On');
  }

  /**
   * Set switch state
   */
  private async setOn(value: CharacteristicValue): Promise<void> {
    await this.handleSet(value as boolean, 'On', async (on) => {
      const params = SwitchHelper.buildSwitchParams(this.deviceParams, this.channelIndex, on);
      return await this.sendCommand(params);
    });
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

    // Update HomeKit characteristic
    const isOn = this.getCurrentState();
    this.service.updateCharacteristic(this.Characteristic.On, isOn);
    this.logDebug(`State updated: ${isOn ? 'ON' : 'OFF'}`);
  }
}
