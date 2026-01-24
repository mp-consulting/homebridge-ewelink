import { describe, it, expect } from 'vitest';
import { DeviceValueParser } from '../../src/utils/device-parsers.js';
import type { DeviceParams } from '../../src/types/index.js';

describe('DeviceValueParser', () => {
  describe('parseTemperature', () => {
    it('should parse currentTemperature field', () => {
      const params: DeviceParams = { currentTemperature: 25 };
      expect(DeviceValueParser.parseTemperature(params)).toBe(25);
    });

    it('should parse temperature field when currentTemperature is missing', () => {
      const params: DeviceParams = { temperature: 22 };
      expect(DeviceValueParser.parseTemperature(params)).toBe(22);
    });

    it('should divide by 100 when value > 1000 (currentTemperature)', () => {
      const params: DeviceParams = { currentTemperature: 2500 };
      expect(DeviceValueParser.parseTemperature(params)).toBe(25);
    });

    it('should divide by 100 when value > 1000 (temperature)', () => {
      const params: DeviceParams = { temperature: 2200 };
      expect(DeviceValueParser.parseTemperature(params)).toBe(22);
    });

    it('should return default value when field is missing', () => {
      const params: DeviceParams = {};
      expect(DeviceValueParser.parseTemperature(params)).toBe(20);
    });

    it('should use custom default value', () => {
      const params: DeviceParams = {};
      expect(DeviceValueParser.parseTemperature(params, 25)).toBe(25);
    });

    it('should handle string values', () => {
      const params: DeviceParams = { currentTemperature: '23.5' };
      expect(DeviceValueParser.parseTemperature(params)).toBe(23.5);
    });

    it('should return default for NaN values', () => {
      const params: DeviceParams = { currentTemperature: 'invalid' };
      expect(DeviceValueParser.parseTemperature(params)).toBe(20);
    });

    it('should prefer currentTemperature over temperature', () => {
      const params: DeviceParams = { currentTemperature: 25, temperature: 22 };
      expect(DeviceValueParser.parseTemperature(params)).toBe(25);
    });
  });

  describe('parseHumidity', () => {
    it('should parse currentHumidity field', () => {
      const params: DeviceParams = { currentHumidity: 60 };
      expect(DeviceValueParser.parseHumidity(params)).toBe(60);
    });

    it('should parse humidity field when currentHumidity is missing', () => {
      const params: DeviceParams = { humidity: 55 };
      expect(DeviceValueParser.parseHumidity(params)).toBe(55);
    });

    it('should divide by 100 when value > 100 (currentHumidity)', () => {
      const params: DeviceParams = { currentHumidity: 6500 };
      expect(DeviceValueParser.parseHumidity(params)).toBe(65);
    });

    it('should divide by 100 when value > 100 (humidity)', () => {
      const params: DeviceParams = { humidity: 5500 };
      expect(DeviceValueParser.parseHumidity(params)).toBe(55);
    });

    it('should return default value when field is missing', () => {
      const params: DeviceParams = {};
      expect(DeviceValueParser.parseHumidity(params)).toBe(50);
    });

    it('should use custom default value', () => {
      const params: DeviceParams = {};
      expect(DeviceValueParser.parseHumidity(params, 60)).toBe(60);
    });

    it('should handle string values', () => {
      const params: DeviceParams = { currentHumidity: '70.5' };
      expect(DeviceValueParser.parseHumidity(params)).toBe(70.5);
    });

    it('should return default for NaN values', () => {
      const params: DeviceParams = { currentHumidity: 'invalid' };
      expect(DeviceValueParser.parseHumidity(params)).toBe(50);
    });

    it('should prefer currentHumidity over humidity', () => {
      const params: DeviceParams = { currentHumidity: 60, humidity: 55 };
      expect(DeviceValueParser.parseHumidity(params)).toBe(60);
    });
  });

  describe('parseBattery', () => {
    it('should parse battery field', () => {
      const params: DeviceParams = { battery: 85 };
      expect(DeviceValueParser.parseBattery(params)).toBe(85);
    });

    it('should return default value when field is missing', () => {
      const params: DeviceParams = {};
      expect(DeviceValueParser.parseBattery(params)).toBe(100);
    });

    it('should use custom default value', () => {
      const params: DeviceParams = {};
      expect(DeviceValueParser.parseBattery(params, 50)).toBe(50);
    });

    it('should return default for NaN values', () => {
      const params: DeviceParams = { battery: NaN };
      expect(DeviceValueParser.parseBattery(params)).toBe(100);
    });
  });

  describe('parseNumber', () => {
    it('should parse number values', () => {
      expect(DeviceValueParser.parseNumber(42)).toBe(42);
    });

    it('should parse string number values', () => {
      expect(DeviceValueParser.parseNumber('42.5')).toBe(42.5);
    });

    it('should return default for undefined', () => {
      expect(DeviceValueParser.parseNumber(undefined)).toBe(0);
    });

    it('should return default for null', () => {
      expect(DeviceValueParser.parseNumber(null)).toBe(0);
    });

    it('should use custom default value', () => {
      expect(DeviceValueParser.parseNumber(undefined, 10)).toBe(10);
    });

    it('should return default for NaN', () => {
      expect(DeviceValueParser.parseNumber('invalid')).toBe(0);
    });
  });

  describe('parseSwitch', () => {
    it('should return true for "on"', () => {
      expect(DeviceValueParser.parseSwitch('on')).toBe(true);
    });

    it('should return false for "off"', () => {
      expect(DeviceValueParser.parseSwitch('off')).toBe(false);
    });

    it('should return true for boolean true', () => {
      expect(DeviceValueParser.parseSwitch(true)).toBe(true);
    });

    it('should return false for boolean false', () => {
      expect(DeviceValueParser.parseSwitch(false)).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(DeviceValueParser.parseSwitch('ON')).toBe(true);
      expect(DeviceValueParser.parseSwitch('On')).toBe(true);
      expect(DeviceValueParser.parseSwitch('OFF')).toBe(false);
    });

    it('should return false for other strings', () => {
      expect(DeviceValueParser.parseSwitch('maybe')).toBe(false);
    });
  });

  describe('parseBoolean', () => {
    it('should return true for boolean true', () => {
      expect(DeviceValueParser.parseBoolean(true)).toBe(true);
    });

    it('should return false for boolean false', () => {
      expect(DeviceValueParser.parseBoolean(false)).toBe(false);
    });

    it('should return true for number 1', () => {
      expect(DeviceValueParser.parseBoolean(1)).toBe(true);
    });

    it('should return false for number 0', () => {
      expect(DeviceValueParser.parseBoolean(0)).toBe(false);
    });

    it('should return false for other numbers', () => {
      expect(DeviceValueParser.parseBoolean(2)).toBe(false);
      expect(DeviceValueParser.parseBoolean(-1)).toBe(false);
    });

    it('should return true for string "on"', () => {
      expect(DeviceValueParser.parseBoolean('on')).toBe(true);
    });

    it('should return true for string "true"', () => {
      expect(DeviceValueParser.parseBoolean('true')).toBe(true);
    });

    it('should return true for string "1"', () => {
      expect(DeviceValueParser.parseBoolean('1')).toBe(true);
    });

    it('should return false for other strings', () => {
      expect(DeviceValueParser.parseBoolean('off')).toBe(false);
      expect(DeviceValueParser.parseBoolean('false')).toBe(false);
      expect(DeviceValueParser.parseBoolean('0')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(DeviceValueParser.parseBoolean('ON')).toBe(true);
      expect(DeviceValueParser.parseBoolean('TRUE')).toBe(true);
    });
  });

  describe('hasTemperature', () => {
    it('should return true when currentTemperature exists', () => {
      const params: DeviceParams = { currentTemperature: 25 };
      expect(DeviceValueParser.hasTemperature(params)).toBe(true);
    });

    it('should return true when temperature exists', () => {
      const params: DeviceParams = { temperature: 25 };
      expect(DeviceValueParser.hasTemperature(params)).toBe(true);
    });

    it('should return false when neither field exists', () => {
      const params: DeviceParams = {};
      expect(DeviceValueParser.hasTemperature(params)).toBe(false);
    });
  });

  describe('hasHumidity', () => {
    it('should return true when currentHumidity exists', () => {
      const params: DeviceParams = { currentHumidity: 60 };
      expect(DeviceValueParser.hasHumidity(params)).toBe(true);
    });

    it('should return true when humidity exists', () => {
      const params: DeviceParams = { humidity: 60 };
      expect(DeviceValueParser.hasHumidity(params)).toBe(true);
    });

    it('should return false when neither field exists', () => {
      const params: DeviceParams = {};
      expect(DeviceValueParser.hasHumidity(params)).toBe(false);
    });
  });

  describe('hasBattery', () => {
    it('should return true when battery exists', () => {
      const params: DeviceParams = { battery: 85 };
      expect(DeviceValueParser.hasBattery(params)).toBe(true);
    });

    it('should return false when battery is missing', () => {
      const params: DeviceParams = {};
      expect(DeviceValueParser.hasBattery(params)).toBe(false);
    });
  });

  describe('hasPowerReadings', () => {
    it('should return true when power exists', () => {
      const params: DeviceParams = { power: 100 };
      expect(DeviceValueParser.hasPowerReadings(params)).toBe(true);
    });

    it('should return true when voltage exists', () => {
      const params: DeviceParams = { voltage: 220 };
      expect(DeviceValueParser.hasPowerReadings(params)).toBe(true);
    });

    it('should return true when current exists', () => {
      const params: DeviceParams = { current: 0.5 };
      expect(DeviceValueParser.hasPowerReadings(params)).toBe(true);
    });

    it('should return false when no power readings exist', () => {
      const params: DeviceParams = {};
      expect(DeviceValueParser.hasPowerReadings(params)).toBe(false);
    });
  });

  describe('parsePowerReadings', () => {
    it('should parse all power readings', () => {
      const params: DeviceParams = { power: 100, voltage: 220, current: 0.5 };
      const result = DeviceValueParser.parsePowerReadings(params);
      expect(result).toEqual({ power: 100, voltage: 220, current: 0.5 });
    });

    it('should return undefined for missing fields', () => {
      const params: DeviceParams = { power: 100 };
      const result = DeviceValueParser.parsePowerReadings(params);
      expect(result.power).toBe(100);
      expect(result.voltage).toBeUndefined();
      expect(result.current).toBeUndefined();
    });

    it('should handle string values', () => {
      const params: DeviceParams = { power: '100', voltage: '220', current: '0.5' };
      const result = DeviceValueParser.parsePowerReadings(params);
      expect(result).toEqual({ power: 100, voltage: 220, current: 0.5 });
    });
  });

  describe('parseMotionState', () => {
    it('should return true when switch is on', () => {
      const params: DeviceParams = { switch: 'on' };
      expect(DeviceValueParser.parseMotionState(params)).toBe(true);
    });

    it('should return true when state is 1', () => {
      const params: DeviceParams = { state: 1 };
      expect(DeviceValueParser.parseMotionState(params)).toBe(true);
    });

    it('should return false when switch is off', () => {
      const params: DeviceParams = { switch: 'off' };
      expect(DeviceValueParser.parseMotionState(params)).toBe(false);
    });

    it('should return false when state is 0', () => {
      const params: DeviceParams = { state: 0 };
      expect(DeviceValueParser.parseMotionState(params)).toBe(false);
    });

    it('should return false when both are absent', () => {
      const params: DeviceParams = {};
      expect(DeviceValueParser.parseMotionState(params)).toBe(false);
    });
  });

  describe('parseContactState', () => {
    it('should return true when switch is on (open)', () => {
      const params: DeviceParams = { switch: 'on' };
      expect(DeviceValueParser.parseContactState(params)).toBe(true);
    });

    it('should return true when state is 1 (open)', () => {
      const params: DeviceParams = { state: 1 };
      expect(DeviceValueParser.parseContactState(params)).toBe(true);
    });

    it('should return false when switch is off (closed)', () => {
      const params: DeviceParams = { switch: 'off' };
      expect(DeviceValueParser.parseContactState(params)).toBe(false);
    });

    it('should return false when state is 0 (closed)', () => {
      const params: DeviceParams = { state: 0 };
      expect(DeviceValueParser.parseContactState(params)).toBe(false);
    });
  });

  describe('boolToSwitch', () => {
    it('should return "on" for true', () => {
      expect(DeviceValueParser.boolToSwitch(true)).toBe('on');
    });

    it('should return "off" for false', () => {
      expect(DeviceValueParser.boolToSwitch(false)).toBe('off');
    });
  });

  describe('switchToBool', () => {
    it('should return true for "on"', () => {
      expect(DeviceValueParser.switchToBool('on')).toBe(true);
    });

    it('should return false for "off"', () => {
      expect(DeviceValueParser.switchToBool('off')).toBe(false);
    });

    it('should return false for other strings', () => {
      expect(DeviceValueParser.switchToBool('maybe')).toBe(false);
    });
  });
});
