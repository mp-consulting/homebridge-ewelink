import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import { EWeLinkPlatform } from '../../platform.js';
import { AccessoryContext, DeviceParams, ThermostatDeviceConfig } from '../../types/index.js';
import { DeviceValueParser } from '../../utils/device-parsers.js';
import { POLLING } from '../../constants/timing-constants.js';

/**
 * TH Thermostat Simulation Accessory
 * Uses a TH sensor to control heating/cooling switches based on temperature thresholds
 */
export class THThermostatAccessory extends BaseAccessory {
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

  /** Show heat/cool toggle */
  private readonly showHeatCool: boolean;

  /** Cached temperature */
  private cacheTemp: number;

  /** Cached humidity */
  private cacheHumi?: number;

  /** Cached target temperature */
  private cacheTarget: number;

  /** Cached state */
  private cacheState: 'on' | 'off' = 'off';

  /** Cached heating state */
  private cacheHeat?: 'on' | 'off';

  /** Cached cooling state */
  private cacheCool?: 'on' | 'off';

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

    // Show heat/cool toggle option
    this.showHeatCool = this.deviceConfig?.showHeatCool || false;

    // Set up the accessory with default target temp when added the first time
    if (!accessory.context.cacheTarget) {
      accessory.context.cacheTarget = 20;
    }
    this.cacheTarget = accessory.context.cacheTarget as number;

    // Save showHeatCool preference to context
    if (accessory.context.showHeatCool === undefined) {
      accessory.context.showHeatCool = false;
    }

    // Reset service if showHeatCool has changed
    if (this.showHeatCool && !accessory.context.showHeatCool) {
      accessory.context.showHeatCool = true;
      this.removeServiceIfExists(this.Service.Thermostat);
    }

    if (!this.showHeatCool && accessory.context.showHeatCool) {
      accessory.context.showHeatCool = false;
      this.removeServiceIfExists(this.Service.Thermostat);
    }

    // Set up Thermostat service
    this.service = this.getOrAddService(this.Service.Thermostat);

    // Check sensor type for humidity support
    const sensorType = accessory.context.device?.extra?.model;
    if (sensorType === 'DS18B20') {
      // Remove humidity characteristic for DS18B20
      if (this.service.testCharacteristic(this.Characteristic.CurrentRelativeHumidity)) {
        const humidityChar = this.service.getCharacteristic(this.Characteristic.CurrentRelativeHumidity);
        if (humidityChar) {
          this.service.removeCharacteristic(humidityChar);
        }
      }
    } else {
      // Add humidity characteristic for other sensors
      if (!this.service.testCharacteristic(this.Characteristic.CurrentRelativeHumidity)) {
        this.service.addCharacteristic(this.Characteristic.CurrentRelativeHumidity);
      }

      this.service.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
        .onGet(this.getCurrentHumidity.bind(this));
    }

    // Configure current temperature characteristic
    this.service.getCharacteristic(this.Characteristic.CurrentTemperature)
      .setProps({ minStep: 0.1 })
      .onGet(this.getCurrentTemperature.bind(this));

    this.cacheTemp = this.service.getCharacteristic(this.Characteristic.CurrentTemperature).value as number;

    // Configure target heating/cooling state
    this.service.getCharacteristic(this.Characteristic.TargetHeatingCoolingState)
      .setProps({
        validValues: this.showHeatCool ? [0, 1, 2] : [0, 3],
      })
      .onGet(this.getTargetState.bind(this))
      .onSet(this.setTargetState.bind(this));

    // Configure current heating/cooling state
    this.service.getCharacteristic(this.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.getCurrentState.bind(this));

    // Configure target temperature
    this.service.getCharacteristic(this.Characteristic.TargetTemperature)
      .updateValue(this.cacheTarget)
      .setProps({
        minValue: this.minTarget,
        maxValue: this.maxTarget,
        minStep: 0.5,
      })
      .onSet(this.setTargetTemperature.bind(this));

    // Initialize cache states
    const curState = this.service.getCharacteristic(this.Characteristic.TargetHeatingCoolingState).value as number;
    this.cacheState = curState > 0 ? 'on' : 'off';

    const targetTemp = this.service.getCharacteristic(this.Characteristic.TargetTemperature).value as number;
    const currentTemp = this.service.getCharacteristic(this.Characteristic.CurrentTemperature).value as number;

    const heatTest = targetTemp > currentTemp ? 'on' : 'off';
    this.cacheHeat = this.cacheState === 'on' && [1, 3].includes(curState) ? heatTest : undefined;

    const coolTest = targetTemp < currentTemp ? 'on' : 'off';
    this.cacheCool = this.cacheState === 'on' && curState === 2 ? coolTest : undefined;

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
   * Get target heating/cooling state
   */
  private async getTargetState(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      const currentState = this.service.getCharacteristic(this.Characteristic.TargetHeatingCoolingState).value;
      return currentState as number;
    }, 'TargetHeatingCoolingState');
  }

  /**
   * Set target heating/cooling state
   */
  private async setTargetState(value: CharacteristicValue): Promise<void> {
    await this.handleSet(value as number, 'TargetHeatingCoolingState', async (targetState) => {
      const params: DeviceParams = { deviceType: 'normal' };
      let newState: 'on' | 'off';
      let newHeat: 'on' | 'off' | undefined;
      let newCool: 'on' | 'off' | undefined;

      switch (targetState) {
        case 0:
          // Turning off
          params.mainSwitch = 'off';
          params.switch = 'off';
          newState = 'off';
          newHeat = 'off';
          newCool = 'off';
          break;

        case 1:
          // Heat mode
          if (!this.showHeatCool) {
            return true;
          }
          if (this.cacheTemp < this.cacheTarget) {
            params.mainSwitch = 'on';
            params.switch = 'on';
            newState = 'on';
            newHeat = 'on';
            newCool = 'off';
          } else {
            params.mainSwitch = 'off';
            params.switch = 'off';
            newState = 'on';
            newHeat = 'off';
            newCool = 'off';
          }
          break;

        case 2:
          // Cool mode
          if (!this.showHeatCool) {
            return true;
          }
          if (this.cacheTemp > this.cacheTarget) {
            params.mainSwitch = 'on';
            params.switch = 'on';
            newState = 'on';
            newHeat = 'off';
            newCool = 'on';
          } else {
            params.mainSwitch = 'off';
            params.switch = 'off';
            newState = 'on';
            newHeat = 'off';
            newCool = 'off';
          }
          break;

        case 3:
          // Auto mode
          if (this.showHeatCool) {
            return true;
          }
          if (this.cacheTemp < this.cacheTarget) {
            params.mainSwitch = 'on';
            params.switch = 'on';
            newState = 'on';
            newHeat = 'on';
            newCool = 'off';
          } else {
            params.mainSwitch = 'off';
            params.switch = 'off';
            newState = 'on';
            newHeat = 'off';
            newCool = 'off';
          }
          break;

        default:
          return true;
      }

      if (newState !== this.cacheState) {
        this.cacheState = newState;
        this.cacheHeat = undefined;
        this.cacheCool = undefined;
        this.logDebug(`Thermostat state: ${this.cacheState}`);
      }

      if ([1, 3].includes(targetState) && newHeat !== this.cacheHeat) {
        this.cacheHeat = newHeat;
        this.cacheCool = undefined;
        this.logDebug(`Heating: ${this.cacheHeat}`);
      }

      if (targetState === 2 && newCool !== this.cacheCool) {
        this.cacheCool = newCool;
        this.cacheHeat = undefined;
        this.logDebug(`Cooling: ${this.cacheCool}`);
      }

      // Update current state
      const hapState = this.cacheHeat === 'on' ? 1 : 0;
      this.service.updateCharacteristic(
        this.Characteristic.CurrentHeatingCoolingState,
        this.cacheCool === 'on' ? 2 : hapState,
      );

      // Only send update if needed
      if (
        (targetState === 0 && (this.cacheHeat === 'on' || this.cacheCool === 'on')) ||
        ([1, 3].includes(targetState) && newHeat !== this.cacheHeat) ||
        (targetState === 2 && newCool !== this.cacheCool)
      ) {
        return await this.sendCommand(params);
      }
      return true;
    });
  }

  /**
   * Get current heating/cooling state
   */
  private async getCurrentState(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      const currentState = this.service.getCharacteristic(this.Characteristic.CurrentHeatingCoolingState).value;
      return currentState as number;
    }, 'CurrentHeatingCoolingState');
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

    // Update heating/cooling state based on new target
    await this.updateThermostatState();
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
   * Update thermostat state based on current temperature vs target
   */
  private async updateThermostatState(): Promise<void> {
    try {
      if (this.cacheState === 'off') {
        return;
      }

      const params: DeviceParams = { deviceType: 'normal' };
      let newHeat: 'on' | 'off' | undefined;
      let newCool: 'on' | 'off' | undefined;

      const curMode = this.service.getCharacteristic(this.Characteristic.TargetHeatingCoolingState).value as number;

      switch (curMode) {
        case 1:
        case 3:
          // Heating or auto mode
          if (this.cacheTemp < this.cacheTarget) {
            params.mainSwitch = 'on';
            params.switch = 'on';
            newHeat = 'on';
            newCool = 'off';
          } else {
            params.mainSwitch = 'off';
            params.switch = 'off';
            newHeat = 'off';
            newCool = 'off';
          }
          break;

        case 2:
          // Cooling mode
          if (this.cacheTemp > this.cacheTarget) {
            params.mainSwitch = 'on';
            params.switch = 'on';
            newHeat = 'off';
            newCool = 'on';
          } else {
            params.mainSwitch = 'off';
            params.switch = 'off';
            newHeat = 'off';
            newCool = 'off';
          }
          break;

        default:
          return;
      }

      if (
        ([1, 3].includes(curMode) && newHeat !== this.cacheHeat) ||
        (curMode === 2 && newCool !== this.cacheCool)
      ) {
        await this.sendCommand(params);
      }

      if ([1, 3].includes(curMode) && newHeat !== this.cacheHeat) {
        this.cacheHeat = newHeat;
        this.cacheCool = undefined;
        this.logDebug(`Heating: ${this.cacheHeat}`);
      }

      if (curMode === 2 && newCool !== this.cacheCool) {
        this.cacheCool = newCool;
        this.cacheHeat = undefined;
        this.logDebug(`Cooling: ${this.cacheCool}`);
      }

      const hapState = this.cacheHeat === 'on' ? 1 : 0;
      this.service.updateCharacteristic(
        this.Characteristic.CurrentHeatingCoolingState,
        this.cacheCool === 'on' ? 2 : hapState,
      );
    } catch (err) {
      this.logError('Failed to update thermostat state', err);
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
    Object.assign(this.deviceParams, params);

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

        // Update thermostat state when temperature changes
        this.updateThermostatState();
      }
    }

    // Update humidity
    if (params.currentHumidity !== undefined && params.currentHumidity !== 'unavailable') {
      let newHumi = DeviceValueParser.parseHumidity(this.deviceParams);
      if (this.humidityOffsetFactor) {
        newHumi *= this.humidityOffset;
      } else {
        newHumi += this.humidityOffset;
      }
      newHumi = Math.max(Math.min(Math.round(newHumi), 100), 0);

      if (newHumi !== this.cacheHumi) {
        this.cacheHumi = newHumi;
        if (this.service.testCharacteristic(this.Characteristic.CurrentRelativeHumidity)) {
          this.service.updateCharacteristic(
            this.Characteristic.CurrentRelativeHumidity,
            this.cacheHumi,
          );
        }
        this.logDebug(`Humidity: ${this.cacheHumi}%`);
      }
    }
  }
}
