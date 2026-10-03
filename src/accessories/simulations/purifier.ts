import type { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import type { EWeLinkPlatform } from '../../platform.js';
import type { AccessoryContext, DeviceParams } from '../../types/index.js';
import { SwitchHelper } from '../../utils/switch-helper.js';
import { DeviceValueParser } from '../../utils/device-parsers.js';
import { getChannelPower } from './shared/channel-power.js';
import type { ChannelPower } from './shared/channel-power.js';

/**
 * Air Purifier Simulation Accessory
 * Uses a switch to simulate an air purifier
 */
export class PurifierAccessory extends BaseAccessory {
  /** Channel index for multi-channel devices */
  private readonly channelIndex: number;

  /** Power monitoring capabilities */
  private readonly power: ChannelPower;

  /** Cached state */
  private cacheState: 'on' | 'off' = 'off';

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    this.channelIndex = accessory.context.channelIndex || 0;

    this.power = getChannelPower(this.device.extra?.uiid || 0, this.channelIndex);

    // Set up AirPurifier service
    this.service = this.getOrAddService(this.Service.AirPurifier);

    // Add power monitoring characteristics if supported
    if (this.power.enabled) {
      this.setupPowerMonitoringCharacteristics(this.service, this.power.fullReadings);
      if (!this.power.isDualR3 || platform.config.mode !== 'lan') {
        this.setupUiActivePolling(this.power.uiActiveOutlet);
      }
    }

    // Configure active characteristic
    this.service.getCharacteristic(this.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    // Configure target state (auto only)
    this.service.getCharacteristic(this.Characteristic.TargetAirPurifierState)
      .setProps({
        minValue: 1,
        maxValue: 1,
        validValues: [1],
      })
      .updateValue(1)
      .onGet(() => this.Characteristic.TargetAirPurifierState.AUTO);

    // Configure current state
    this.service.getCharacteristic(this.Characteristic.CurrentAirPurifierState)
      .onGet(this.getCurrentState.bind(this));

    // Initialize cache state
    this.cacheState = this.service.getCharacteristic(this.Characteristic.Active).value === 1 ? 'on' : 'off';

    // Set initial state
    this.applyInitialState();
  }

  /**
   * Get active state
   */
  private async getActive(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.cacheState === 'on'
        ? this.Characteristic.Active.ACTIVE
        : this.Characteristic.Active.INACTIVE;
    }, 'Active');
  }

  /**
   * Set active state
   */
  private async setActive(value: CharacteristicValue): Promise<void> {
    await this.handleSet(value as number, 'Active', async (active) => {
      const on = active === 1;
      const params = SwitchHelper.buildSwitchParams(this.deviceParams, this.channelIndex, on);
      if (!(await this.sendCommand(params))) {
        this.revertCharacteristicLater(this.service, this.Characteristic.Active, this.cacheState === 'on' ? 1 : 0);
        return false;
      }

      this.cacheState = DeviceValueParser.boolToSwitch(on);
      this.service.updateCharacteristic(
        this.Characteristic.CurrentAirPurifierState,
        on ? 2 : 0,
      );
      this.logDebug(`Purifier: ${this.cacheState}`);
      return true;
    });
  }

  /**
   * Get current state
   */
  private async getCurrentState(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.cacheState === 'on'
        ? this.Characteristic.CurrentAirPurifierState.PURIFYING_AIR
        : this.Characteristic.CurrentAirPurifierState.INACTIVE;
    }, 'CurrentAirPurifierState');
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    // Update switch state
    const isOn = SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);

    if (isOn !== (this.cacheState === 'on')) {
      this.cacheState = DeviceValueParser.boolToSwitch(isOn);
      this.service.updateCharacteristic(this.Characteristic.Active, isOn ? 1 : 0);
      this.service.updateCharacteristic(
        this.Characteristic.CurrentAirPurifierState,
        isOn ? 2 : 0,
      );
      this.logDebug(`Purifier state updated: ${this.cacheState}`);
    }

    if (this.power.enabled) {
      this.updateDualR3PowerReadings(this.service, params, {
        suffix: this.power.suffix,
        fullReadings: this.power.fullReadings,
      });
    }
  }
}
