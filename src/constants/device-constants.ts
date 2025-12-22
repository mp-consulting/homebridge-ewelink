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

// Channel counts per UIID (number of switches/outlets in multi-channel devices)
// Channel 0 is the master switch, channels 1-N are individual outlets
export const DEVICE_CHANNEL_COUNT: Record<number, number> = {
  1: 1, // SOCKET (MINI, BASIC, S20, S26, S55, RF, RF_R2)
  2: 2, // SOCKET_2
  3: 3, // SOCKET_3
  4: 4, // SOCKET_4
  5: 1, // SOCKET_POWER (Sonoff Pow)
  6: 1, // SWITCH (T1 1C, TX1C, G1)
  7: 2, // SWITCH_2 (T1 2C, TX2C)
  8: 3, // SWITCH_3 (T1 3C, TX3C)
  9: 4, // SWITCH_4
  11: 1, // CURTAIN (King Q4 Cover)
  14: 1, // SWITCH_CHANGE (Sonoff SV)
  15: 1, // THERMOSTAT (TH10, TH16)
  18: 1, // SENSORS_CENTER (Sonoff SC)
  19: 1, // HUMIDIFIER
  22: 1, // RGB_BALL_LIGHT (B1, B1_R2)
  24: 1, // GSM_SOCKET
  25: 1, // AROMATHERAPY (Diffuser, Komeito 1515-X)
  27: 1, // GSM_UNLIMIT_SOCKET
  28: 1, // RF_BRIDGE (RFBridge, RF_Bridge)
  29: 2, // GSM_SOCKET_2
  30: 3, // GSM_SOCKET_3
  31: 4, // GSM_SOCKET_4
  32: 1, // POWER_DETECTION_SOCKET (Pow_R2, S31, IW101)
  33: 1, // LIGHT_BELT
  34: 4, // FAN_LIGHT (iFan02, iFan)
  36: 1, // SINGLE_CHANNEL_DIMMER_SWITCH (KING-M4)
  41: 4, // CUN_YOU_DOOR
  44: 1, // SNOFF_LIGHT (D1)
  57: 1, // MONOCHROMATIC_BALL_LIGHT (mosquito killer)
  59: 1, // MUSIC_LIGHT_BELT (L1)
  66: 1, // ZIGBEE_MAIN_DEVICE
  67: 1, // RollingDoor
  77: 4, // SINGLE_SOCKET_MULTIPLE (1 socket device using data structure of four)
  78: 4, // SINGLE_SWITCH_MULTIPLE (1 switch device using data structure of four)
  81: 1, // GSM_SOCKET_NO_FLOW (1 socket device using data structure of four)
  82: 2, // GSM_SOCKET_2_NO_FLOW
  83: 3, // GSM_SOCKET_3_NO_FLOW
  84: 4, // GSM_SOCKET_4_NO_FLOW
  87: 1, // EWELINK_IOT_CAMERA (GK-200MP2B)
  91: 1, // ROLLING_DOOR (Cover/Curtain device)
  98: 1, // DOORBELL_RFBRIDGE
  102: 1, // DOOR_MAGNETIC (OPL-DMA, DW2)
  103: 1, // WOTEWODE_TEM_LIGHT (B02-F)
  104: 1, // WOTEWODE_RGB_TEM_LIGHT
  107: 1, // GSM_SOCKET_NO_FLOW
  112: 1,
  113: 2,
  114: 3,
  126: 2, // DUALR3
  127: 1, // GTTA127
  128: 1, // SPM Main Unit (same data structure as zigbee bridge)
  130: 1, // SPM Sub Unit
  133: 1, // NSPANEL
  135: 1,
  136: 1, // RGB Five-Color Light_Support 2.4G eWeLink-Remote
  137: 1, // L2/SPIDER CONTROLLER
  138: 1, // MINIR3? (WOOLLEY WLAN SMART SWITCH)
  139: 2, // MINIR3?
  140: 3, // MINIR3?
  141: 4, // MINIR3?
  154: 1, // DW2-Wi-Fi-L
  160: 1, // SwitchMan Smart Wall Switch-M5 - 1 Gang
  161: 2, // SwitchMan Smart Wall Switch-M5 - 2 Gang
  162: 3, // SwitchMan Smart Wall Switch-M5 - 3 Gang
  165: 2, // DUALR3 Lite
  168: 1, // Zigbee Bridge Pro
  173: 1, // Sonoff L3
  174: 1, // SwitchMan R5 - 6 Gang
  177: 1, // Switch Mate
  181: 1, // Sonoff TH Elite THR316 and THR320
  182: 1, // Power Detection Plug Overload Alarm-Multi-Channel Protocols (S40)
  190: 1, // POWR316 POWR316D POWR320D
  191: 1, // Like the above 190
  195: 1, // NSPANEL Pro
  209: 1, // Sonoff Ultimate Switch T5-1C-86
  210: 2, // Sonoff Ultimate Switch T5-2C-86
  211: 3, // Sonoff Ultimate Switch T5-3C-86
  212: 4, // Sonoff Ultimate Switch T5-4C-86
  225: 1, // CK-BL602-PCSW-01 (Single switch with power monitoring)
  226: 1,
  243: 1, // Zigbee Bridge Ultra
  258: 1, // Additional Cover device
  262: 4, // CK-BL602-SWP1-02 (4-channel switch with power monitoring)
  1000: 1, // zigbee_ON_OFF_SWITCH_1000 (button device)
  1009: 1, // Some sort of single switch device
  1256: 1, // ZIGBEE_SINGLE_SWITCH
  1257: 1, // ZigbeeWhiteLight
  1258: 1,
  1514: 1, // Graywind Zigbee Shades
  1770: 1, // ZIGBEE_TEMPERATURE_SENSOR
  1771: 1,
  2026: 1, // ZIGBEE_MOBILE_SENSOR
  2256: 2, // ZIGBEE_SWITCH_2
  3026: 1, // ZIGBEE_DOOR_AND_WINDOW_SENSOR
  3256: 3, // ZIGBEE_SWITCH_3
  3258: 1, // ZigbeeRGBLight
  4026: 1, // ZIGBEE_WATER_SENSOR
  4256: 4, // ZIGBEE_SWITCH_4
  5000: 1, // Custom uiid for groups
  5026: 1, // Zigbee Smoke Sensor
  7000: 1, // Zigbee Button?
  7002: 1, // Zigbee Human Body Sensor_Support OTA
  7003: 1, // Zigbee Door Magnet_Support OTA
  7004: 1, // Zigbee Single-Channel Switch ­_Support OTA
  7005: 1, // Some switch, not entirely sure
  7006: 1, // Zigbee Curtain_Support OTA
  7010: 1, // Zigbee Micro
  7014: 1, // some sensor
  7016: 1,
  7017: 1,
  7019: 1, // Zigbee Water Sensor
  7027: 1, // Zigbee Smart Water Valve
  7032: 1, // Zigbee Power Monitoring Switch
};
