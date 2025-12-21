import { DeviceParams } from '../types/index.js';

/**
 * Utility class for parsing device parameter values
 */
export class DeviceValueParser {
  /**
   * Parse temperature from device params
   * Handles both temperature and currentTemperature fields
   * Automatically divides by 100 if value > 1000
   */
  static parseTemperature(params: DeviceParams, defaultValue = 20): number {
    // Try currentTemperature first
    if (params.currentTemperature !== undefined) {
      const temp = parseFloat(String(params.currentTemperature));
      if (!isNaN(temp)) {
        // Some devices send temperature * 100
        return temp > 1000 ? temp / 100 : temp;
      }
    }

    // Fall back to temperature field
    if (params.temperature !== undefined) {
      const temp = parseFloat(String(params.temperature));
      if (!isNaN(temp)) {
        return temp > 1000 ? temp / 100 : temp;
      }
    }

    return defaultValue;
  }

  /**
   * Parse humidity from device params
   * Handles both humidity and currentHumidity fields
   * Automatically divides by 100 if value > 100
   */
  static parseHumidity(params: DeviceParams, defaultValue = 50): number {
    // Try currentHumidity first
    if (params.currentHumidity !== undefined) {
      const humidity = parseFloat(String(params.currentHumidity));
      if (!isNaN(humidity)) {
        // Some devices send humidity * 100
        return humidity > 100 ? humidity / 100 : humidity;
      }
    }

    // Fall back to humidity field
    if (params.humidity !== undefined) {
      const humidity = parseFloat(String(params.humidity));
      if (!isNaN(humidity)) {
        return humidity > 100 ? humidity / 100 : humidity;
      }
    }

    return defaultValue;
  }

  /**
   * Parse battery level from device params
   */
  static parseBattery(params: DeviceParams, defaultValue = 100): number {
    if (params.battery !== undefined) {
      const battery = parseFloat(String(params.battery));
      return isNaN(battery) ? defaultValue : battery;
    }
    return defaultValue;
  }
}
