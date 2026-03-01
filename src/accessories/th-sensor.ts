import type { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import type { EWeLinkPlatform } from '../platform.js';
import type { AccessoryContext, DeviceParams, ThermostatDeviceConfig } from '../types/index.js';
import { DeviceValueParser } from '../utils/device-parsers.js';

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
      const rawTemp = DeviceValueParser.parseTemperature(this.deviceParams);
      return this.applyTemperatureOffset(rawTemp, this.deviceConfig?.tempOffset || 0);
    }, 'CurrentTemperature');
  }

  /**
   * Get current humidity
   */
  private async getCurrentHumidity(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      const rawHumidity = DeviceValueParser.parseHumidity(this.deviceParams);
      return this.applyHumidityOffset(rawHumidity, this.deviceConfig?.humidityOffset || 0);
    }, 'CurrentRelativeHumidity');
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    // Update temperature
    if (this.temperatureService) {
      const rawTemp = DeviceValueParser.parseTemperature(this.deviceParams);
      const temp = this.applyTemperatureOffset(rawTemp, this.deviceConfig?.tempOffset || 0);

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
      const rawHumidity = DeviceValueParser.parseHumidity(this.deviceParams);
      const humidity = this.applyHumidityOffset(rawHumidity, this.deviceConfig?.humidityOffset || 0);

      this.humidityService.updateCharacteristic(
        this.Characteristic.CurrentRelativeHumidity,
        humidity,
      );
      this.logDebug(`Humidity updated: ${humidity}%`);
    }
  }
}
