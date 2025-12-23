import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import { EWeLinkPlatform } from '../../platform.js';
import { AccessoryContext, DeviceParams, ThermostatDeviceConfig } from '../../types/index.js';
import { DeviceValueParser } from '../../utils/device-parsers.js';
import { POLLING } from '../../constants/timing-constants.js';

/**
 * TH Cooler Simulation Accessory
 * Uses a TH sensor to control a cooler switch based on temperature thresholds
 */
export class THCoolerAccessory extends BaseAccessory {
  /** Humidity sensor service */
  private humidityService?: ReturnType<typeof this.getOrAddService>;

  /** Device configuration */
  private readonly deviceConfig?: ThermostatDeviceConfig;

  /** Temperature offset */
  private readonly tempOffset: number;

  /** Temperature offset factor */
  private readonly tempOffsetFactor: boolean;

  /** Humidity offset */
  private readonly humidityOffset: number;

  /** Humidity offset factor */
  private readonly humidityOffsetFactor: boolean;

  /** Min target temperature */
  private readonly minTarget: number;

  /** Max target temperature */
  private readonly maxTarget: number;

  /** Cached temperature */
  private cacheTemp: number;

  /** Cached humidity */
  private cacheHumi?: number;

  /** Cached target temperature */
  private cacheTarget: number;

  /** Cached state */
  private cacheState: 'on' | 'off' = 'off';

  /** Cached cooling state */
  private cacheCool: 'on' | 'off' = 'off';

  /** Update interval */
  private intervalPoll?: NodeJS.Timeout;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Get device-specific config
    this.deviceConfig = platform.config.thDevices?.find(
      d => d.deviceId === this.deviceId,
    );

    // Set up temperature/humidity offsets
    this.tempOffset = this.deviceConfig?.tempOffset || 0;
    this.tempOffsetFactor = this.deviceConfig?.offsetFactor !== undefined;
    this.humidityOffset = this.deviceConfig?.humidityOffset || 0;
    this.humidityOffsetFactor = this.deviceConfig?.humidityOffsetFactor !== undefined;

    // Set up target temperature range
    this.minTarget = this.deviceConfig?.minTarget || 10;
    this.maxTarget = Math.max(this.deviceConfig?.maxTarget || 30, this.minTarget + 1);

    // Set up the accessory with default target temp when added the first time
    if (!accessory.context.cacheTarget) {
      accessory.context.cacheTarget = 20;
    }
    this.cacheTarget = accessory.context.cacheTarget as number;

    // Set up HeaterCooler service
    this.service = this.getOrAddService(this.Service.HeaterCooler);

    // Check sensor type for humidity support
    const sensorType = accessory.context.device?.extra?.model;
    if (sensorType !== 'DS18B20') {
      this.humidityService = this.getOrAddService(
        this.Service.HumiditySensor,
        `${accessory.displayName} Humidity`,
        'humidity',
      );

      this.humidityService.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
        .onGet(this.getCurrentHumidity.bind(this));
    } else {
      this.removeServiceIfExists(this.Service.HumiditySensor, 'humidity');
    }

    // Set cooler as primary service
    this.service.setPrimaryService();

    // Configure current temperature characteristic
    this.service.getCharacteristic(this.Characteristic.CurrentTemperature)
      .setProps({ minStep: 0.1 })
      .onGet(this.getCurrentTemperature.bind(this));

    this.cacheTemp = this.service.getCharacteristic(this.Characteristic.CurrentTemperature).value as number;

    // Configure active characteristic
    this.service.getCharacteristic(this.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    // Configure target state (cooling only)
    this.service.getCharacteristic(this.Characteristic.TargetHeaterCoolerState)
      .setProps({
        minValue: 2,
        maxValue: 2,
        validValues: [2],
      })
      .onGet(() => this.Characteristic.TargetHeaterCoolerState.COOL);

    // Configure current state
    this.service.getCharacteristic(this.Characteristic.CurrentHeaterCoolerState)
      .onGet(this.getCurrentState.bind(this));

    // Configure cooling threshold temperature
    this.service.getCharacteristic(this.Characteristic.CoolingThresholdTemperature)
      .updateValue(this.cacheTarget)
      .setProps({
        minValue: this.minTarget,
        maxValue: this.maxTarget,
        minStep: 0.5,
      })
      .onSet(this.setTargetTemperature.bind(this));

    // Initialize cache states
    this.cacheState = this.service.getCharacteristic(this.Characteristic.Active).value === 1 ? 'on' : 'off';
    this.cacheCool = this.cacheState === 'on' &&
      this.service.getCharacteristic(this.Characteristic.CurrentHeaterCoolerState).value === 3
      ? 'on'
      : 'off';

    // Set up polling interval
    if (platform.config.mode !== 'lan') {
      setTimeout(() => {
        this.requestUpdate();
        this.intervalPoll = setInterval(() => this.requestUpdate(), POLLING.UPDATE_INTERVAL_MS);
      }, POLLING.INITIAL_DELAY_MS);

      platform.api.on('shutdown', () => {
        if (this.intervalPoll) {
          clearInterval(this.intervalPoll);
        }
      });
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
      const params: DeviceParams = { deviceType: 'normal' };
      let newState: 'on' | 'off';
      let newCool: 'on' | 'off';

      if (active === 0) {
        // Turning off
        params.mainSwitch = 'off';
        params.switch = 'off';
        newState = 'off';
        newCool = 'off';
      } else if (this.cacheTemp > this.cacheTarget) {
        // Temperature above target, turn on cooler
        params.mainSwitch = 'on';
        params.switch = 'on';
        newState = 'on';
        newCool = 'on';
      } else {
        // Temperature at or below target, turn off cooler
        params.mainSwitch = 'off';
        params.switch = 'off';
        newState = 'on';
        newCool = 'off';
      }

      if (newState !== this.cacheState) {
        this.cacheState = newState;
        this.logDebug(`Cooler state: ${this.cacheState}`);
      }

      if (newCool !== this.cacheCool) {
        this.cacheCool = newCool;
        this.logDebug(`Cooling: ${this.cacheCool}`);
      }

      // Update current state
      const hapState = this.cacheCool === 'on' ? 3 : 1;
      this.service.updateCharacteristic(
        this.Characteristic.CurrentHeaterCoolerState,
        active === 1 ? hapState : 0,
      );

      // Only send update if needed
      if ((active === 0 && this.cacheCool === 'on') || (active === 1 && newCool === 'on')) {
        return await this.sendCommand(params);
      }
      return true;
    });
  }

  /**
   * Get current state
   */
  private async getCurrentState(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      if (this.cacheState === 'off') {
        return this.Characteristic.CurrentHeaterCoolerState.INACTIVE;
      }
      return this.cacheCool === 'on'
        ? this.Characteristic.CurrentHeaterCoolerState.COOLING
        : this.Characteristic.CurrentHeaterCoolerState.IDLE;
    }, 'CurrentHeaterCoolerState');
  }

  /**
   * Set target temperature
   */
  private async setTargetTemperature(value: CharacteristicValue): Promise<void> {
    const target = value as number;

    if (target === this.cacheTarget) {
      return;
    }

    this.cacheTarget = target;
    this.accessory.context.cacheTarget = target;
    this.logDebug(`Target temperature: ${target}°C`);

    if (this.cacheState === 'off') {
      return;
    }

    // Update cooling state based on new target
    await this.updateCoolingState();
  }

  /**
   * Get current temperature
   */
  private async getCurrentTemperature(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.cacheTemp;
    }, 'CurrentTemperature');
  }

  /**
   * Get current humidity
   */
  private async getCurrentHumidity(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.cacheHumi || 0;
    }, 'CurrentRelativeHumidity');
  }

  /**
   * Update cooling state based on current temperature vs target
   */
  private async updateCoolingState(): Promise<void> {
    try {
      if (this.cacheState === 'off') {
        return;
      }

      const params: DeviceParams = { deviceType: 'normal' };
      let newCool: 'on' | 'off';

      if (this.cacheTemp > this.cacheTarget) {
        params.mainSwitch = 'on';
        params.switch = 'on';
        newCool = 'on';
      } else {
        params.mainSwitch = 'off';
        params.switch = 'off';
        newCool = 'off';
      }

      if (newCool === this.cacheCool) {
        return;
      }

      await this.sendCommand(params);
      this.cacheCool = newCool;
      this.logDebug(`Cooling: ${this.cacheCool}`);

      this.service.updateCharacteristic(
        this.Characteristic.CurrentHeaterCoolerState,
        this.cacheCool === 'on' ? 3 : 1,
      );
    } catch (err) {
      this.logError('Failed to update cooling state', err);
    }
  }

  /**
   * Request temperature/humidity update from device
   */
  private async requestUpdate(): Promise<void> {
    try {
      await this.sendCommand({ uiActive: POLLING.UI_ACTIVE_DURATION_S });
    } catch {
      // Suppress errors for polling
    }
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    // Update temperature
    if (params.currentTemperature !== undefined && params.currentTemperature !== 'unavailable') {
      let newTemp = DeviceValueParser.parseTemperature(this.deviceParams);
      if (this.tempOffsetFactor) {
        newTemp *= this.tempOffset;
      } else {
        newTemp += this.tempOffset;
      }

      if (newTemp !== this.cacheTemp) {
        this.cacheTemp = newTemp;
        this.service.updateCharacteristic(this.Characteristic.CurrentTemperature, this.cacheTemp);
        this.logDebug(`Temperature: ${this.cacheTemp}°C`);

        // Update cooling state when temperature changes
        this.updateCoolingState();
      }
    }

    // Update humidity
    if (this.humidityService && params.currentHumidity !== undefined && params.currentHumidity !== 'unavailable') {
      let newHumi = DeviceValueParser.parseHumidity(this.deviceParams);
      if (this.humidityOffsetFactor) {
        newHumi *= this.humidityOffset;
      } else {
        newHumi += this.humidityOffset;
      }
      newHumi = Math.max(Math.min(Math.round(newHumi), 100), 0);

      if (newHumi !== this.cacheHumi) {
        this.cacheHumi = newHumi;
        this.humidityService.updateCharacteristic(
          this.Characteristic.CurrentRelativeHumidity,
          this.cacheHumi,
        );
        this.logDebug(`Humidity: ${this.cacheHumi}%`);
      }
    }
  }
}
