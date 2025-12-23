/**
 * Device-related constants
 *
 * NOTE: Device UIID mappings, channel counts, and sensor/power monitoring UIIDs
 * are now derived from the centralized device catalog in device-catalog.ts.
 * This file re-exports those for backward compatibility.
 */

// Re-export catalog-derived constants for backward compatibility
export {
  // Channel count map (use getChannelCount() function for new code)
  DEVICE_CHANNEL_COUNT_MAP as DEVICE_CHANNEL_COUNT,
  // Power monitoring UIIDs
  ALL_POWER_MONITORING_UIIDS as POWER_MONITORING_UIIDS,
  FULL_POWER_MONITORING_UIIDS as FULL_POWER_READINGS_UIIDS,
  // Sensor UIIDs
  MOTION_SENSOR_UIIDS,
  CONTACT_SENSOR_UIIDS,
  LEAK_SENSOR_UIIDS as WATER_LEAK_SENSOR_UIIDS,
  // Helper functions
  getChannelCount,
  hasPowerMonitoring,
  hasFullPowerReadings,
  isMotionSensor,
  isContactSensor,
  isLeakSensor,
  isTHSensorDevice,
  isDualR3Device,
  isDimmableLightForFan,
  hasBattery,
  getBatteryType,
  isProgrammableSwitch,
  isGroupDevice,
  isNSPanelPro,
  isPanelDevice,
  getBrightnessParams,
  getPositionParams,
  getMotorTurnParam,
  getSwitchParamName,
  getSwitchStyle,
  isCurtainDevice,
  normalizeBrightness,
  denormalizeBrightness,
} from './device-catalog.js';

// Temperature ranges
export const TEMPERATURE_MIN = -270;
export const TEMPERATURE_MAX = 100;
export const DEFAULT_TEMPERATURE = 20;

// Humidity ranges
export const HUMIDITY_MIN = 0;
export const HUMIDITY_MAX = 100;
export const DEFAULT_HUMIDITY = 50;

// Battery
export const BATTERY_MIN = 0;
export const BATTERY_MAX = 100;
export const DEFAULT_BATTERY = 100;

// Color temperature (in mireds)
export const COLOR_TEMP_MIN_MIRED = 140;
export const COLOR_TEMP_MAX_MIRED = 500;
export const COLOR_TEMP_RANGE = 360;

// Timeouts
export const COMMAND_TIMEOUT_MS = 10000;
export const GARAGE_PULSE_DURATION_MS = 500;
export const POSITION_UPDATE_DEBOUNCE_MS = 500;

// Default UIID
export const DEFAULT_UIID = 0;

// Power reading divisors (raw values need division by these)
export const POWER_DIVISOR = 100;
export const VOLTAGE_DIVISOR = 100;
export const CURRENT_DIVISOR = 100;

// Air Conditioner wind speeds (eWeLink values)
export const AC_WIND_SPEED = {
  OFF: 0,
  LOW: 101,
  MEDIUM: 102,
  HIGH: 103,
} as const;

// HomeKit rotation speed percentages for AC
export const AC_ROTATION_SPEED = {
  OFF: 0,
  LOW: 25,
  MEDIUM: 50,
  HIGH: 75,
  LOW_THRESHOLD: 33,
  HIGH_THRESHOLD: 66,
} as const;

// Diffuser speed values
export const DIFFUSER_SPEED = {
  OFF: 0,
  LOW: 50,
  HIGH: 100,
} as const;

// Thermostat ranges
export const THERMOSTAT_TEMP_MIN = 5;
export const THERMOSTAT_TEMP_MAX = 45;
export const THERMOSTAT_TEMP_STEP = 0.5;
