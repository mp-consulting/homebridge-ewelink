import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams, ThermostatDeviceConfig } from '../types/index.js';
import { DeviceValueParser } from '../utils/device-parsers.js';
import {
  TEMPERATURE_MIN,
  TEMPERATURE_MAX,
  HUMIDITY_MIN,
  HUMIDITY_MAX,
} from '../constants/device-constants.js';

/**
 * Temperature/Humidity Sensor Accessory (UIID 15)
 * For read-only temperature and humidity sensors
 */
export class THSensorAccessory extends BaseAccessory {
  /** Temperature sensor service */
  private temperatureService?: ReturnType<typeof this.getOrAddService>;

  /** Humidity sensor service */
  private humidityService?: ReturnType<typeof this.getOrAddService>;

  /** Device config */
  private readonly deviceConfig?: ThermostatDeviceConfig;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Get device-specific config
    this.deviceConfig = platform.config.thDevices?.find(
      d => d.deviceId === this.deviceId,
    );

    // Set up temperature sensor service
    this.temperatureService = this.getOrAddService(
      this.Service.TemperatureSensor,
      `${accessory.displayName} Temperature`,
    );

    this.temperatureService.getCharacteristic(this.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));

    // Set up humidity sensor service if device supports it
    if (this.supportsHumidity()) {
      this.humidityService = this.getOrAddService(
        this.Service.HumiditySensor,
        `${accessory.displayName} Humidity`,
      );

      this.humidityService.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
        .onGet(this.getCurrentHumidity.bind(this));
    }

    // Set the main service
    this.service = this.temperatureService;

    // Set initial state
    this.updateState(this.deviceParams);
  }

  /**
   * Check if device supports humidity
   */
  private supportsHumidity(): boolean {
    return this.deviceParams.currentHumidity !== undefined ||
           this.deviceParams.humidity !== undefined;
  }

  /**
   * Get current temperature
   */
  private async getCurrentTemperature(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      let temp = DeviceValueParser.parseTemperature(this.deviceParams);

      // Apply offset if configured
      if (this.deviceConfig?.tempOffset) {
        temp += this.deviceConfig.tempOffset;
      }

      return this.clamp(temp, TEMPERATURE_MIN, TEMPERATURE_MAX);
    }, 'CurrentTemperature');
  }

  /**
   * Get current humidity
   */
  private async getCurrentHumidity(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      let humidity = DeviceValueParser.parseHumidity(this.deviceParams);

      // Apply offset if configured
      if (this.deviceConfig?.humidityOffset) {
        humidity += this.deviceConfig.humidityOffset;
      }

      return this.clamp(humidity, HUMIDITY_MIN, HUMIDITY_MAX);
    }, 'CurrentRelativeHumidity');
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    Object.assign(this.deviceParams, params);

    // Update temperature
    if (this.temperatureService) {
      let temp = DeviceValueParser.parseTemperature(this.deviceParams);
      if (this.deviceConfig?.tempOffset) {
        temp += this.deviceConfig.tempOffset;
      }
      temp = this.clamp(temp, TEMPERATURE_MIN, TEMPERATURE_MAX);

      this.temperatureService.updateCharacteristic(
        this.Characteristic.CurrentTemperature,
        temp,
      );
      this.logDebug(`Temperature updated: ${temp}°C`);

      // Cache temperature for cross-device sharing (heater/cooler simulations)
      this.platform.setDeviceTemperature(this.deviceId, temp);
    }

    // Update humidity
    if (this.humidityService) {
      let humidity = DeviceValueParser.parseHumidity(this.deviceParams);
      if (this.deviceConfig?.humidityOffset) {
        humidity += this.deviceConfig.humidityOffset;
      }
      humidity = this.clamp(humidity, HUMIDITY_MIN, HUMIDITY_MAX);

      this.humidityService.updateCharacteristic(
        this.Characteristic.CurrentRelativeHumidity,
        humidity,
      );
      this.logDebug(`Humidity updated: ${humidity}%`);
    }
  }
}
