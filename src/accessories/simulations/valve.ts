import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import { EWeLinkPlatform } from '../../platform.js';
import { AccessoryContext, DeviceParams, SingleDeviceConfig, MultiDeviceConfig } from '../../types/index.js';
import { SwitchHelper } from '../../utils/switch-helper.js';
import { EVE_CHARACTERISTIC_UUIDS } from '../../utils/eve-characteristics.js';
import { POLLING } from '../../constants/timing-constants.js';
import { hasPowerMonitoring, hasFullPowerReadings as hasFullPowerReadingsUIID } from '../../constants/device-constants.js';

/**
 * Valve Simulation Accessory
 * Simulates a valve using a switch device
 */
export class ValveAccessory extends BaseAccessory {
  /** Channel index for multi-channel devices */
  private readonly channelIndex: number;

  /** Device configuration */
  private readonly deviceConfig?: SingleDeviceConfig | MultiDeviceConfig;

  /** Disable timer functionality */
  private readonly disableTimer: boolean;

  /** Timer for auto-off */
  private timer?: NodeJS.Timeout;

  /** Power monitoring support */
  private readonly powerReadings: boolean;

  /** Full power readings (voltage + current) */
  private readonly hasFullPowerReadings: boolean;

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

    // Check for power monitoring
    const uiid = this.device.extra?.uiid || 0;
    this.powerReadings = hasPowerMonitoring(uiid) || this.supportsPowerMonitoring();
    this.hasFullPowerReadings = hasFullPowerReadingsUIID(uiid);

    // Set up the valve service
    this.service = this.getOrAddService(this.Service.Valve);

    // Set valve type to generic valve
    this.service.updateCharacteristic(this.Characteristic.ValveType, 1);

    // Configure Active characteristic
    this.service.getCharacteristic(this.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    // Configure InUse characteristic
    this.service.getCharacteristic(this.Characteristic.InUse)
      .onGet(this.getInUse.bind(this));

    // Configure duration characteristics if timer not disabled
    if (!this.disableTimer) {
      // Set default duration
      this.service.updateCharacteristic(this.Characteristic.SetDuration, POLLING.VALVE_DEFAULT_DURATION_S);
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

    // Add Eve power characteristics if supported
    if (this.powerReadings) {
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
    const { CurrentConsumption, Voltage, ElectricCurrent } = this.platform.eveCharacteristics;

    if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption)) {
      this.service.addCharacteristic(CurrentConsumption);
    }

    if (this.hasFullPowerReadings) {
      if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage)) {
        this.service.addCharacteristic(Voltage);
      }
      if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent)) {
        this.service.addCharacteristic(ElectricCurrent);
      }
    }

    this.logDebug(`Power monitoring enabled (full readings: ${this.hasFullPowerReadings})`);
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
        const durationChar = this.service.getCharacteristic(this.Characteristic.SetDuration);
        const duration = durationChar.value as number || POLLING.VALVE_DEFAULT_DURATION_S;
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
   * Set duration (only updates timer if valve is active)
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

      this.logDebug(`Valve duration updated to ${duration}s while active`);
    }
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    // Update valve state
    const isOn = SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);
    this.service.updateCharacteristic(
      this.Characteristic.Active,
      isOn ? this.Characteristic.Active.ACTIVE : this.Characteristic.Active.INACTIVE,
    );
    this.service.updateCharacteristic(
      this.Characteristic.InUse,
      isOn ? this.Characteristic.InUse.IN_USE : this.Characteristic.InUse.NOT_IN_USE,
    );

    // Update Eve power characteristics if supported
    if (this.powerReadings) {
      if (params.power !== undefined) {
        const power = parseFloat(String(params.power));
        this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption, power);
      }

      if (this.hasFullPowerReadings) {
        if (params.voltage !== undefined) {
          const voltage = parseFloat(String(params.voltage));
          this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage, voltage);
        }
        if (params.current !== undefined) {
          const current = parseFloat(String(params.current));
          this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent, current);
        }
      }
    }

    this.logDebug(`Valve state updated: ${isOn ? 'ACTIVE' : 'INACTIVE'}`);
  }
}
