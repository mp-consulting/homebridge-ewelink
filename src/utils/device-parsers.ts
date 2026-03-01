import type { DeviceParams } from '../types/index.js';

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

  /**
   * Parse a generic number from device params
   * @param value - The value to parse
   * @param defaultValue - Default value if parsing fails
   * @returns Parsed number or default
   */
  static parseNumber(value: unknown, defaultValue = 0): number {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    const num = parseFloat(String(value));
    return isNaN(num) ? defaultValue : num;
  }

  /**
   * Parse switch state to boolean
   * @param value - Switch state ('on'/'off' or boolean)
   * @returns true if 'on', false if 'off'
   */
  static parseSwitch(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    return String(value).toLowerCase() === 'on';
  }

  /**
   * Parse generic boolean value
   * @param value - Value to parse (boolean, number, or string)
   * @returns Parsed boolean value
   */
  static parseBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value === 1;
    }
    const str = String(value).toLowerCase();
    return str === 'on' || str === 'true' || str === '1';
  }

  /**
   * Check if device params have temperature data
   */
  static hasTemperature(params: DeviceParams): boolean {
    return params.currentTemperature !== undefined || params.temperature !== undefined;
  }

  /**
   * Check if device params have humidity data
   */
  static hasHumidity(params: DeviceParams): boolean {
    return params.currentHumidity !== undefined || params.humidity !== undefined;
  }

  /**
   * Check if device params have battery data
   */
  static hasBattery(params: DeviceParams): boolean {
    return params.battery !== undefined;
  }

  /**
   * Check if device params have power monitoring data
   */
  static hasPowerReadings(params: DeviceParams): boolean {
    return params.power !== undefined ||
           params.voltage !== undefined ||
           params.current !== undefined;
  }

  /**
   * Parse power monitoring readings from device params
   * @returns Object with power, voltage, and current values
   */
  static parsePowerReadings(params: DeviceParams): {
    power: number | undefined;
    voltage: number | undefined;
    current: number | undefined;
  } {
    return {
      power: params.power !== undefined ? parseFloat(String(params.power)) : undefined,
      voltage: params.voltage !== undefined ? parseFloat(String(params.voltage)) : undefined,
      current: params.current !== undefined ? parseFloat(String(params.current)) : undefined,
    };
  }

  /**
   * Parse motion sensor state from device params
   * Motion is typically indicated by switch='on' or state=1
   */
  static parseMotionState(params: DeviceParams): boolean {
    return params.switch === 'on' || params.state === 1;
  }

  /**
   * Parse contact sensor state from device params
   * Contact is typically indicated by switch='on' or state=1 (open)
   */
  static parseContactState(params: DeviceParams): boolean {
    return params.switch === 'on' || params.state === 1;
  }

  /**
   * Convert boolean to switch state string
   */
  static boolToSwitch(value: boolean): 'on' | 'off' {
    return value ? 'on' : 'off';
  }

  /**
   * Convert switch state string to boolean
   */
  static switchToBool(value: 'on' | 'off' | string): boolean {
    return value === 'on';
  }
}
