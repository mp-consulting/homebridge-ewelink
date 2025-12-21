import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams, SingleDeviceConfig } from '../types/index.js';
import { SwitchHelper } from '../utils/switch-helper.js';

/**
 * Outlet Accessory with power monitoring support and optional inching mode
 */
export class OutletAccessory extends BaseAccessory {
  /** Channel index for multi-channel devices */
  private readonly channelIndex: number;

  /** Power monitoring service */
  private powerService?: ReturnType<typeof this.getOrAddService>;

  /** Inching mode enabled */
  private readonly isInched: boolean;

  /** Cached state for inching mode (toggles internally) */
  private cacheState: boolean = false;

  /** Ignore updates flag for inching mode debouncing */
  private ignoreUpdates: boolean = false;

  /** Device configuration */
  private readonly deviceConfig?: SingleDeviceConfig;

  /** Power threshold for "in use" state */
  private readonly inUsePowerThreshold: number;

  /** Power reading UIIDs (5: wattage only, 32/182/190: wattage+voltage+current) */
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
    );

    // Check if inching mode is enabled
    this.isInched = this.deviceConfig?.isInched || false;

    // Power threshold configuration
    this.inUsePowerThreshold = this.deviceConfig?.inUsePowerThreshold || 0;

    // Check if device has full power readings (voltage + current)
    const uiid = this.device.extra?.uiid || 0;
    this.hasFullPowerReadings = [32, 182, 190].includes(uiid);

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

    // Initialize cache state for inching mode
    if (this.isInched) {
      this.cacheState = this.getCurrentState();
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

    // UUID constants
    const CurrentConsumptionUUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';
    const VoltageUUID = 'E863F10A-079E-48FF-8F27-9C2605A29F52';
    const ElectricCurrentUUID = 'E863F126-079E-48FF-8F27-9C2605A29F52';

    // Add Current Consumption (Watts) - available on all power monitoring devices
    if (!this.service.testCharacteristic(CurrentConsumptionUUID)) {
      this.service.addCharacteristic(CurrentConsumption);
    }

    // Add Voltage and Current for devices with full power readings
    if (this.hasFullPowerReadings) {
      if (!this.service.testCharacteristic(VoltageUUID)) {
        this.service.addCharacteristic(Voltage);
      }
      if (!this.service.testCharacteristic(ElectricCurrentUUID)) {
        this.service.addCharacteristic(ElectricCurrent);
      }
    } else {
      // Remove voltage/current if not supported
      if (this.service.testCharacteristic(VoltageUUID)) {
        const voltageCh = this.service.getCharacteristic(VoltageUUID);
        if (voltageCh) {
          this.service.removeCharacteristic(voltageCh);
        }
      }
      if (this.service.testCharacteristic(ElectricCurrentUUID)) {
        const currentCh = this.service.getCharacteristic(ElectricCurrentUUID);
        if (currentCh) {
          this.service.removeCharacteristic(currentCh);
        }
      }
    }

    this.logDebug(`Power monitoring enabled (full readings: ${this.hasFullPowerReadings})`);
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
   * Get outlet in use state (based on power consumption)
   */
  private async getOutletInUse(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      // If power monitoring is available, use it with threshold
      if (this.deviceParams.power !== undefined) {
        const power = parseFloat(String(this.deviceParams.power));
        return power > this.inUsePowerThreshold;
      }
      // Otherwise, outlet is in use if it's on
      return this.isInched ? this.cacheState : SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);
    }, 'OutletInUse');
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

      // Update OutletInUse based on power or cache state
      let inUse = this.cacheState;
      if (params.power !== undefined) {
        const power = parseFloat(String(params.power));
        inUse = power > this.inUsePowerThreshold;
      }
      this.service.updateCharacteristic(this.Characteristic.OutletInUse, inUse);
    } else {
      // Standard mode - update from device state
      const isOn = this.getCurrentState();
      this.service.updateCharacteristic(this.Characteristic.On, isOn);

      // Update OutletInUse
      let inUse = isOn;
      if (params.power !== undefined) {
        const power = parseFloat(String(params.power));
        inUse = power > this.inUsePowerThreshold;
      }
      this.service.updateCharacteristic(this.Characteristic.OutletInUse, inUse);

      this.logDebug(`State updated: ${isOn ? 'ON' : 'OFF'}, In Use: ${inUse}`);
    }

    // Update Eve power monitoring characteristics if supported
    if (this.supportsPowerMonitoring()) {
      // UUID constants
      const CurrentConsumptionUUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';
      const VoltageUUID = 'E863F10A-079E-48FF-8F27-9C2605A29F52';
      const ElectricCurrentUUID = 'E863F126-079E-48FF-8F27-9C2605A29F52';

      if (params.power !== undefined) {
        const power = parseFloat(String(params.power));
        this.service.updateCharacteristic(CurrentConsumptionUUID, power);
      }

      if (this.hasFullPowerReadings) {
        if (params.voltage !== undefined) {
          const voltage = parseFloat(String(params.voltage));
          this.service.updateCharacteristic(VoltageUUID, voltage);
        }
        if (params.current !== undefined) {
          const current = parseFloat(String(params.current));
          this.service.updateCharacteristic(ElectricCurrentUUID, current);
        }
      }
    }
  }
}
