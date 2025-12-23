import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams, SingleDeviceConfig } from '../types/index.js';
import { TIMING } from '../constants/timing-constants.js';
import { SwitchHelper } from '../utils/switch-helper.js';
import { DeviceValueParser } from '../utils/device-parsers.js';
import { EVE_CHARACTERISTIC_UUIDS } from '../utils/eve-characteristics.js';
import { hasFullPowerReadings as hasFullPowerReadingsUIID } from '../constants/device-constants.js';

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

  /** Ignore updates flag for inching mode debouncing (wrapped in object for reference passing) */
  private ignoreUpdatesRef = { value: false };

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
    this.deviceConfig = this.getSingleDeviceConfig();

    // Check if inching mode is enabled
    this.isInched = this.deviceConfig?.isInched || false;

    // Power threshold configuration
    this.inUsePowerThreshold = this.deviceConfig?.inUsePowerThreshold || 0;

    // Check if device has full power readings (voltage + current)
    const uiid = this.device.extra?.uiid || 0;
    this.hasFullPowerReadings = hasFullPowerReadingsUIID(uiid);

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
    return DeviceValueParser.hasPowerReadings(this.deviceParams);
  }

  /**
   * Setup power monitoring characteristics
   */
  private setupPowerMonitoring(): void {
    const { CurrentConsumption, Voltage, ElectricCurrent } = this.platform.eveCharacteristics;

    // Add Current Consumption (Watts) - available on all power monitoring devices
    if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption)) {
      this.service.addCharacteristic(CurrentConsumption);
    }

    // Add Voltage and Current for devices with full power readings
    if (this.hasFullPowerReadings) {
      if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage)) {
        this.service.addCharacteristic(Voltage);
      }
      if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent)) {
        this.service.addCharacteristic(ElectricCurrent);
      }
    } else {
      // Remove voltage/current if not supported
      if (this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage)) {
        const voltageCh = this.service.getCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage);
        if (voltageCh) {
          this.service.removeCharacteristic(voltageCh);
        }
      }
      if (this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent)) {
        const currentCh = this.service.getCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent);
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
   * Get outlet in use state (based on power consumption)
   */
  private async getOutletInUse(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      // If power monitoring is available, use it with threshold
      const { power } = DeviceValueParser.parsePowerReadings(this.deviceParams);
      if (power !== undefined) {
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
    this.mergeDeviceParams(params);

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

      // Update OutletInUse based on power or cache state
      let inUse = this.cacheState;
      const { power: powerValue } = DeviceValueParser.parsePowerReadings(params);
      if (powerValue !== undefined) {
        inUse = powerValue > this.inUsePowerThreshold;
      }
      this.service.updateCharacteristic(this.Characteristic.OutletInUse, inUse);
    } else {
      // Standard mode - update from device state
      const isOn = this.getCurrentState();
      this.service.updateCharacteristic(this.Characteristic.On, isOn);

      // Update OutletInUse
      let inUse = isOn;
      const { power: powerVal } = DeviceValueParser.parsePowerReadings(params);
      if (powerVal !== undefined) {
        inUse = powerVal > this.inUsePowerThreshold;
      }
      this.service.updateCharacteristic(this.Characteristic.OutletInUse, inUse);

      this.logDebug(`State updated: ${isOn ? 'ON' : 'OFF'}, In Use: ${inUse}`);
    }

    // Update Eve power monitoring characteristics if supported
    if (this.supportsPowerMonitoring()) {
      const { power, voltage, current } = DeviceValueParser.parsePowerReadings(params);

      if (power !== undefined) {
        this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption, power);
      }

      if (this.hasFullPowerReadings) {
        if (voltage !== undefined) {
          this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage, voltage);
        }
        if (current !== undefined) {
          this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent, current);
        }
      }
    }
  }
}
