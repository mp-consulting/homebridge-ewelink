import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams } from '../types/index.js';

/**
 * Outlet Accessory with power monitoring support
 */
export class OutletAccessory extends BaseAccessory {
  /** Channel index for multi-channel devices */
  private readonly channelIndex: number;

  /** Power monitoring service */
  private powerService?: ReturnType<typeof this.getOrAddService>;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    this.channelIndex = accessory.context.channelIndex || 0;

    // Set up the outlet service
    this.service = this.getOrAddService(this.Service.Outlet);

    // Configure On characteristic
    this.service.getCharacteristic(this.Characteristic.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.setOn.bind(this));

    // Configure OutletInUse characteristic
    this.service.getCharacteristic(this.Characteristic.OutletInUse)
      .onGet(this.getOutletInUse.bind(this));

    // Add power monitoring if device supports it
    if (this.supportsPowerMonitoring()) {
      this.setupPowerMonitoring();
    }

    // Set initial state
    this.updateState(this.deviceParams);
  }

  /**
   * Check if device supports power monitoring
   */
  private supportsPowerMonitoring(): boolean {
    return this.deviceParams.power !== undefined ||
           this.deviceParams.voltage !== undefined ||
           this.deviceParams.current !== undefined;
  }

  /**
   * Setup power monitoring characteristics
   */
  private setupPowerMonitoring(): void {
    // Eve Energy uses custom characteristics for power monitoring
    // We'll add them to the main outlet service
    this.logDebug('Power monitoring supported');
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
      const params = this.buildSwitchParams(on);
      return await this.sendCommand(params);
    });
  }

  /**
   * Get outlet in use state (based on power consumption)
   */
  private async getOutletInUse(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      // If power monitoring is available, use it
      if (this.deviceParams.power !== undefined) {
        const power = parseFloat(String(this.deviceParams.power));
        return power > 0;
      }
      // Otherwise, outlet is in use if it's on
      return this.getCurrentState();
    }, 'OutletInUse');
  }

  /**
   * Get current switch state from params
   */
  private getCurrentState(): boolean {
    // Multi-channel device
    if (this.deviceParams.switches) {
      const switchState = this.deviceParams.switches.find(
        s => s.outlet === this.channelIndex,
      );
      return switchState?.switch === 'on';
    }

    // Single channel device
    return this.deviceParams.switch === 'on';
  }

  /**
   * Build switch command params
   */
  private buildSwitchParams(on: boolean): DeviceParams {
    const state = on ? 'on' : 'off';

    // Multi-channel device
    if (this.deviceParams.switches) {
      const switches = [...this.deviceParams.switches];
      const index = switches.findIndex(s => s.outlet === this.channelIndex);

      if (index >= 0) {
        switches[index] = { ...switches[index], switch: state };
      } else {
        switches.push({ outlet: this.channelIndex, switch: state });
      }

      return { switches };
    }

    // Single channel device
    return { switch: state };
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    // Update local cache
    Object.assign(this.deviceParams, params);

    // Update On characteristic
    const isOn = this.getCurrentState();
    this.service.updateCharacteristic(this.Characteristic.On, isOn);

    // Update OutletInUse
    let inUse = isOn;
    if (params.power !== undefined) {
      const power = parseFloat(String(params.power));
      inUse = power > 0;
    }
    this.service.updateCharacteristic(this.Characteristic.OutletInUse, inUse);

    this.logDebug(`State updated: ${isOn ? 'ON' : 'OFF'}, In Use: ${inUse}`);
  }
}
