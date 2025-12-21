/**
 * Device-related constants
 */

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

// Sensor UIIDs
export const MOTION_SENSOR_UIIDS = [102, 107, 136];
export const CONTACT_SENSOR_UIIDS = [102, 137, 154];
export const WATER_LEAK_SENSOR_UIIDS = [138];

// Thermostat ranges
export const THERMOSTAT_TEMP_MIN = 5;
export const THERMOSTAT_TEMP_MAX = 45;
export const THERMOSTAT_TEMP_STEP = 0.5;
