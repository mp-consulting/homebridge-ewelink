import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import { EWeLinkPlatform } from '../../platform.js';
import { AccessoryContext, DeviceParams, SingleDeviceConfig, MultiDeviceConfig } from '../../types/index.js';
import { SwitchHelper } from '../../utils/switch-helper.js';
import { DeviceValueParser } from '../../utils/device-parsers.js';
import { EVE_CHARACTERISTIC_UUIDS } from '../../utils/eve-characteristics.js';
import { POWER_DIVISOR, VOLTAGE_DIVISOR, CURRENT_DIVISOR } from '../../constants/device-constants.js';
import {
  hasPowerMonitoring,
  hasFullPowerReadings as hasFullPowerReadingsUIID,
  isDualR3Device,
} from '../../constants/device-catalog.js';
import { POLLING } from '../../constants/timing-constants.js';

/**
 * Air Purifier Simulation Accessory
 * Uses a switch to simulate an air purifier
 */
export class PurifierAccessory extends BaseAccessory {
  /** Channel index for multi-channel devices */
  private readonly channelIndex: number;

  /** Device configuration */
  private readonly deviceConfig?: SingleDeviceConfig | MultiDeviceConfig;

  /** Supports power monitoring */
  private readonly powerReadings: boolean;

  /** Has full power readings (voltage/current) */
  private readonly hasFullPowerReadings: boolean;

  /** Is Dual R3 device */
  private readonly isDualR3: boolean;

  /** Cached state */
  private cacheState: 'on' | 'off' = 'off';

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

    // Determine power monitoring capabilities
    const uiid = this.device.extra?.uiid || 0;
    this.powerReadings = hasPowerMonitoring(uiid);
    this.hasFullPowerReadings = hasFullPowerReadingsUIID(uiid);
    this.isDualR3 = isDualR3Device(uiid);

    // Set up AirPurifier service
    this.service = this.getOrAddService(this.Service.AirPurifier);

    // Add power monitoring characteristics if supported
    if (this.powerReadings) {
      this.setupPowerMonitoringCharacteristics(this.service, this.hasFullPowerReadings);
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

    // Set up polling interval for power updates
    if (this.powerReadings && (!this.isDualR3 || platform.config.mode !== 'lan')) {
      this.setupPollingInterval(() => this.requestUpdate());
    }

    // Set initial state
    this.updateState(this.deviceParams);
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
      this.cacheState = DeviceValueParser.boolToSwitch(on);

      this.service.updateCharacteristic(
        this.Characteristic.CurrentAirPurifierState,
        on ? 2 : 0,
      );

      this.logDebug(`Purifier: ${this.cacheState}`);

      const params = SwitchHelper.buildSwitchParams(this.deviceParams, this.channelIndex, on);
      return await this.sendCommand(params);
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
   * Request power update from device
   */
  private async requestUpdate(): Promise<void> {
    try {
      if (this.isDualR3) {
        await this.sendCommand({ uiActive: { outlet: this.channelIndex, time: POLLING.UI_ACTIVE_DURATION_S } });
      } else {
        await this.sendCommand({ uiActive: POLLING.UI_ACTIVE_DURATION_S });
      }
    } catch {
      // Suppress errors for polling
    }
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

    // Update power readings if supported
    if (!this.powerReadings) {
      return;
    }

    // Update power
    if (params.actPow_00 !== undefined) {
      const power = parseInt(String(params.actPow_00), 10) / POWER_DIVISOR;
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption, power);
      this.logDebug(`Power: ${power}W`);
    } else if (params.power !== undefined) {
      const power = parseFloat(String(params.power));
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption, power);
      this.logDebug(`Power: ${power}W`);
    }

    if (!this.hasFullPowerReadings) {
      return;
    }

    // Update voltage
    if (params.voltage_00 !== undefined) {
      const voltage = parseInt(String(params.voltage_00), 10) / VOLTAGE_DIVISOR;
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage, voltage);
      this.logDebug(`Voltage: ${voltage}V`);
    } else if (params.voltage !== undefined) {
      const voltage = parseFloat(String(params.voltage));
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage, voltage);
      this.logDebug(`Voltage: ${voltage}V`);
    }

    // Update current
    if (params.current_00 !== undefined) {
      const current = parseInt(String(params.current_00), 10) / CURRENT_DIVISOR;
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent, current);
      this.logDebug(`Current: ${current}A`);
    } else if (params.current !== undefined) {
      const current = parseFloat(String(params.current));
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent, current);
      this.logDebug(`Current: ${current}A`);
    }
  }
}
