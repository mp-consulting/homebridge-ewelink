import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams } from '../types/index.js';

/**
 * Air Conditioner Accessory (UIID 151)
 * Provides HeaterCooler service for AC control
 */
export class AirConditionerAccessory extends BaseAccessory {
  private cacheMode: 'auto' | 'heat' | 'cool' = 'cool';
  private cacheTargetTemp = 24;
  private cacheCurrentTemp = 20;
  private cacheWindSpeed = 102; // Default to medium

  // Temperature offset configuration
  private tempOffset: number;
  private tempOffsetFactor?: number;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Get device-specific configuration
    this.tempOffset = this.deviceConfig?.offset || 0;
    this.tempOffsetFactor = this.deviceConfig?.offsetFactor;

    // Set up the heater cooler service
    this.service = this.getOrAddService(this.Service.HeaterCooler);

    // Configure current temperature characteristic
    this.service.getCharacteristic(this.Characteristic.CurrentTemperature)
      .setProps({ minStep: 0.1 })
      .onGet(this.getCurrentTemperature.bind(this));

    // Configure active characteristic
    this.service.getCharacteristic(this.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    // Configure target heater cooler state characteristic
    this.service.getCharacteristic(this.Characteristic.TargetHeaterCoolerState)
      .setProps({
        minValue: 0,
        maxValue: 2,
        validValues: [0, 1, 2], // Auto, Heat, Cool
      })
      .onGet(this.getTargetState.bind(this))
      .onSet(this.setTargetState.bind(this));

    // Configure current heater cooler state characteristic
    this.service.getCharacteristic(this.Characteristic.CurrentHeaterCoolerState)
      .onGet(this.getCurrentState.bind(this));

    // Configure cooling threshold temperature characteristic
    this.service.getCharacteristic(this.Characteristic.CoolingThresholdTemperature)
      .setProps({
        minValue: 16,
        maxValue: 32,
        minStep: 1,
      })
      .onGet(this.getTargetTemperature.bind(this))
      .onSet((value) => this.setTargetTemperature(value, 'cool'));

    // Configure heating threshold temperature characteristic
    this.service.getCharacteristic(this.Characteristic.HeatingThresholdTemperature)
      .setProps({
        minValue: 16,
        maxValue: 32,
        minStep: 1,
      })
      .onGet(this.getTargetTemperature.bind(this))
      .onSet((value) => this.setTargetTemperature(value, 'heat'));

    // Configure rotation speed characteristic (for fan speed)
    this.service.getCharacteristic(this.Characteristic.RotationSpeed)
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 25,
      })
      .onGet(this.getRotationSpeed.bind(this))
      .onSet(this.setRotationSpeed.bind(this));

    // Initialize from device params
    this.initializeFromParams();
  }

  /**
   * Initialize state from device params
   */
  private initializeFromParams(): void {
    if (this.deviceParams.power !== undefined) {
      const isActive = this.deviceParams.power === 'on' ? 1 : 0;
      this.service.updateCharacteristic(this.Characteristic.Active, isActive);
    }

    if (this.deviceParams.mode !== undefined) {
      this.cacheMode = this.deviceParams.mode as 'auto' | 'heat' | 'cool';
      const targetState = this.modeToTargetState(this.cacheMode);
      this.service.updateCharacteristic(this.Characteristic.TargetHeaterCoolerState, targetState);
    }

    if (this.deviceParams.temperature !== undefined) {
      this.cacheTargetTemp = this.deviceParams.temperature as number;
      this.service.updateCharacteristic(this.Characteristic.CoolingThresholdTemperature, this.cacheTargetTemp);
      this.service.updateCharacteristic(this.Characteristic.HeatingThresholdTemperature, this.cacheTargetTemp);
    }

    if (this.deviceParams.indoor_temperature !== undefined) {
      let temp = Number(this.deviceParams.indoor_temperature);
      if (this.tempOffsetFactor) {
        temp *= this.tempOffsetFactor;
      }
      temp += this.tempOffset;
      this.cacheCurrentTemp = Math.round(temp * 10) / 10;
      this.service.updateCharacteristic(this.Characteristic.CurrentTemperature, this.cacheCurrentTemp);
    }

    if (this.deviceParams.wind_speed !== undefined) {
      this.cacheWindSpeed = this.deviceParams.wind_speed as number;
      const rotationSpeed = this.windSpeedToRotationSpeed(this.cacheWindSpeed);
      this.service.updateCharacteristic(this.Characteristic.RotationSpeed, rotationSpeed);
    }

    this.updateCurrentState();
  }

  /**
   * Get active state
   */
  private async getActive(): Promise<CharacteristicValue> {
    return this.handleGet(
      () => this.service.getCharacteristic(this.Characteristic.Active).value,
      'Active',
    );
  }

  /**
   * Set active state
   */
  private async setActive(value: CharacteristicValue): Promise<void> {
    const newValue = value === 1 ? 'on' : 'off';
    const prevState = this.service.getCharacteristic(this.Characteristic.Active).value === 1 ? 'on' : 'off';

    if (prevState === newValue) {
      return;
    }

    this.logInfo(`Setting power state to ${newValue}`);

    const success = await this.sendCommand({ power: newValue });

    if (!success) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    this.updateCurrentState();
  }

  /**
   * Get target heater cooler state
   */
  private async getTargetState(): Promise<CharacteristicValue> {
    return this.handleGet(
      () => this.modeToTargetState(this.cacheMode),
      'TargetHeaterCoolerState',
    );
  }

  /**
   * Set target heater cooler state
   */
  private async setTargetState(value: CharacteristicValue): Promise<void> {
    let newMode: 'auto' | 'heat' | 'cool';

    switch (value) {
      case 0: // Auto
        newMode = 'auto';
        break;
      case 1: // Heat
        newMode = 'heat';
        break;
      case 2: // Cool
        newMode = 'cool';
        break;
      default:
        return;
    }

    if (this.cacheMode === newMode) {
      return;
    }

    this.logInfo(`Setting mode to ${newMode}`);

    const success = await this.sendCommand({ mode: newMode });

    if (!success) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    this.cacheMode = newMode;
    this.updateCurrentState();
  }

  /**
   * Get current heater cooler state
   */
  private async getCurrentState(): Promise<CharacteristicValue> {
    const isActive = this.service.getCharacteristic(this.Characteristic.Active).value === 1;

    if (!isActive) {
      return this.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }

    switch (this.cacheMode) {
      case 'heat':
        return this.Characteristic.CurrentHeaterCoolerState.HEATING;
      case 'cool':
        return this.Characteristic.CurrentHeaterCoolerState.COOLING;
      case 'auto':
      default:
        return this.Characteristic.CurrentHeaterCoolerState.IDLE;
    }
  }

  /**
   * Get current temperature
   */
  private async getCurrentTemperature(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.cacheCurrentTemp, 'CurrentTemperature');
  }

  /**
   * Get target temperature
   */
  private async getTargetTemperature(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.cacheTargetTemp, 'TargetTemperature');
  }

  /**
   * Set target temperature
   */
  private async setTargetTemperature(value: CharacteristicValue, mode: 'heat' | 'cool'): Promise<void> {
    const newTemp = value as number;

    // Only update if this is the active mode or auto mode
    if (this.cacheMode !== mode && this.cacheMode !== 'auto') {
      return;
    }

    if (this.cacheTargetTemp === newTemp) {
      return;
    }

    this.logInfo(`Setting target temperature to ${newTemp}°C`);

    const success = await this.sendCommand({ temperature: newTemp });

    if (!success) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    this.cacheTargetTemp = newTemp;

    // Update both thresholds to stay in sync
    this.service.updateCharacteristic(this.Characteristic.CoolingThresholdTemperature, newTemp);
    this.service.updateCharacteristic(this.Characteristic.HeatingThresholdTemperature, newTemp);
  }

  /**
   * Get rotation speed (fan speed)
   */
  private async getRotationSpeed(): Promise<CharacteristicValue> {
    return this.handleGet(
      () => this.windSpeedToRotationSpeed(this.cacheWindSpeed),
      'RotationSpeed',
    );
  }

  /**
   * Set rotation speed (fan speed)
   */
  private async setRotationSpeed(value: CharacteristicValue): Promise<void> {
    const rotationSpeed = value as number;

    // Map HomeKit 0-100 to eWeLink wind speed values
    // 101 = low, 102 = medium, 103 = high
    let windSpeed: number;
    if (rotationSpeed === 0) {
      windSpeed = 0;
    } else if (rotationSpeed <= 33) {
      windSpeed = 101;
    } else if (rotationSpeed <= 66) {
      windSpeed = 102;
    } else {
      windSpeed = 103;
    }

    if (this.cacheWindSpeed === windSpeed) {
      return;
    }

    this.logInfo(`Setting fan speed to ${rotationSpeed}%`);

    const success = await this.sendCommand({ wind_speed: windSpeed });

    if (!success) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    this.cacheWindSpeed = windSpeed;
  }

  /**
   * Update current state based on power and mode
   */
  private updateCurrentState(): void {
    const isActive = this.service.getCharacteristic(this.Characteristic.Active).value === 1;

    let currentState: number;
    if (!isActive) {
      currentState = this.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    } else {
      switch (this.cacheMode) {
        case 'heat':
          currentState = this.Characteristic.CurrentHeaterCoolerState.HEATING;
          break;
        case 'cool':
          currentState = this.Characteristic.CurrentHeaterCoolerState.COOLING;
          break;
        case 'auto':
        default:
          currentState = this.Characteristic.CurrentHeaterCoolerState.IDLE;
          break;
      }
    }

    this.service.updateCharacteristic(this.Characteristic.CurrentHeaterCoolerState, currentState);
  }

  /**
   * Convert mode to target state value
   */
  private modeToTargetState(mode: 'auto' | 'heat' | 'cool'): number {
    switch (mode) {
      case 'auto':
        return 0;
      case 'heat':
        return 1;
      case 'cool':
        return 2;
      default:
        return 2; // Default to cool
    }
  }

  /**
   * Convert eWeLink wind speed to HomeKit rotation speed
   */
  private windSpeedToRotationSpeed(windSpeed: number): number {
    if (windSpeed === 0) {
      return 0;
    } else if (windSpeed === 101) {
      return 25;
    } else if (windSpeed === 102) {
      return 50;
    } else if (windSpeed === 103) {
      return 75;
    }
    return 50; // Default to medium
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    // Update local cache
    Object.assign(this.deviceParams, params);

    // Update power state
    if (params.power !== undefined) {
      const isActive = params.power === 'on' ? 1 : 0;
      this.service.updateCharacteristic(this.Characteristic.Active, isActive);
      this.updateCurrentState();
      this.logDebug(`Power state updated to ${params.power}`);
    }

    // Update mode
    if (params.mode !== undefined) {
      this.cacheMode = params.mode as 'auto' | 'heat' | 'cool';
      const targetState = this.modeToTargetState(this.cacheMode);
      this.service.updateCharacteristic(this.Characteristic.TargetHeaterCoolerState, targetState);
      this.updateCurrentState();
      this.logDebug(`Mode updated to ${this.cacheMode}`);
    }

    // Update target temperature
    if (params.temperature !== undefined) {
      this.cacheTargetTemp = params.temperature as number;
      this.service.updateCharacteristic(this.Characteristic.CoolingThresholdTemperature, this.cacheTargetTemp);
      this.service.updateCharacteristic(this.Characteristic.HeatingThresholdTemperature, this.cacheTargetTemp);
      this.logDebug(`Target temperature updated to ${this.cacheTargetTemp}°C`);
    }

    // Update current temperature
    if (params.indoor_temperature !== undefined) {
      let temp = Number(params.indoor_temperature);
      if (this.tempOffsetFactor) {
        temp *= this.tempOffsetFactor;
      }
      temp += this.tempOffset;
      this.cacheCurrentTemp = Math.round(temp * 10) / 10;
      this.service.updateCharacteristic(this.Characteristic.CurrentTemperature, this.cacheCurrentTemp);
      this.logDebug(`Current temperature updated to ${this.cacheCurrentTemp}°C`);
    }

    // Update wind speed
    if (params.wind_speed !== undefined) {
      this.cacheWindSpeed = params.wind_speed as number;
      const rotationSpeed = this.windSpeedToRotationSpeed(this.cacheWindSpeed);
      this.service.updateCharacteristic(this.Characteristic.RotationSpeed, rotationSpeed);
      this.logDebug(`Wind speed updated to ${rotationSpeed}%`);
    }
  }
}
