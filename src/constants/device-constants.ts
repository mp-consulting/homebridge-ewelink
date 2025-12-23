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
  hasCurtainParams,
  isCurtainByParams,
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
export const DEFAULT_COLOR_TEMP_MIRED = 320; // Neutral white

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

// RF Bridge remote types (from zyx_info.remote_type)
export const RF_REMOTE_TYPE = {
  BUTTON_1: '1',
  BUTTON_2: '2',
  BUTTON_3: '3',
  BUTTON_4: '4',
  CURTAIN: '5',
  SENSOR_MOTION: '6',
  SENSOR_CONTACT: '7',
} as const;

// RF remote type categories
export const RF_BUTTON_TYPES = ['1', '2', '3', '4'] as const;
export const RF_SENSOR_TYPES = ['6', '7'] as const;

// HomeKit programmable switch events
export const SWITCH_EVENT = {
  SINGLE_PRESS: 0,
  DOUBLE_PRESS: 1,
  LONG_PRESS: 2,
} as const;

// Multi-channel device suffix pattern
export const CHANNEL_SUFFIX_PATTERN = /SW\d+$/;

// Helper to check RF remote type category
export function isRFButtonType(remoteType: string): boolean {
  return RF_BUTTON_TYPES.includes(remoteType as typeof RF_BUTTON_TYPES[number]);
}

export function isRFSensorType(remoteType: string): boolean {
  return RF_SENSOR_TYPES.includes(remoteType as typeof RF_SENSOR_TYPES[number]);
}

export function isRFCurtainType(remoteType: string): boolean {
  return remoteType === RF_REMOTE_TYPE.CURTAIN;
}
