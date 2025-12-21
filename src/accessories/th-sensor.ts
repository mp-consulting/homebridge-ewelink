import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams, ThermostatDeviceConfig } from '../types/index.js';

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
      let temp = this.parseTemperature();

      // Apply offset if configured
      if (this.deviceConfig?.tempOffset) {
        temp += this.deviceConfig.tempOffset;
      }

      // Clamp to valid range (-270 to 100)
      return this.clamp(temp, -270, 100);
    }, 'CurrentTemperature');
  }

  /**
   * Get current humidity
   */
  private async getCurrentHumidity(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      let humidity = this.parseHumidity();

      // Apply offset if configured
      if (this.deviceConfig?.humidityOffset) {
        humidity += this.deviceConfig.humidityOffset;
      }

      // Clamp to valid range (0-100)
      return this.clamp(humidity, 0, 100);
    }, 'CurrentRelativeHumidity');
  }

  /**
   * Parse temperature from device params
   */
  private parseTemperature(): number {
    // Some devices send temperature * 100
    if (this.deviceParams.currentTemperature !== undefined) {
      const temp = parseFloat(String(this.deviceParams.currentTemperature));
      return temp > 1000 ? temp / 100 : temp;
    }

    if (this.deviceParams.temperature !== undefined) {
      const temp = parseFloat(String(this.deviceParams.temperature));
      return temp > 1000 ? temp / 100 : temp;
    }

    return 20; // Default temperature
  }

  /**
   * Parse humidity from device params
   */
  private parseHumidity(): number {
    // Some devices send humidity * 100
    if (this.deviceParams.currentHumidity !== undefined) {
      const humidity = parseFloat(String(this.deviceParams.currentHumidity));
      return humidity > 100 ? humidity / 100 : humidity;
    }

    if (this.deviceParams.humidity !== undefined) {
      const humidity = parseFloat(String(this.deviceParams.humidity));
      return humidity > 100 ? humidity / 100 : humidity;
    }

    return 50; // Default humidity
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    Object.assign(this.deviceParams, params);

    // Update temperature
    if (this.temperatureService) {
      let temp = this.parseTemperature();
      if (this.deviceConfig?.tempOffset) {
        temp += this.deviceConfig.tempOffset;
      }
      temp = this.clamp(temp, -270, 100);

      this.temperatureService.updateCharacteristic(
        this.Characteristic.CurrentTemperature,
        temp,
      );
      this.logDebug(`Temperature updated: ${temp}°C`);
    }

    // Update humidity
    if (this.humidityService) {
      let humidity = this.parseHumidity();
      if (this.deviceConfig?.humidityOffset) {
        humidity += this.deviceConfig.humidityOffset;
      }
      humidity = this.clamp(humidity, 0, 100);

      this.humidityService.updateCharacteristic(
        this.Characteristic.CurrentRelativeHumidity,
        humidity,
      );
      this.logDebug(`Humidity updated: ${humidity}%`);
    }
  }
}
