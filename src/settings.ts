/**
 * Platform name - used in config.json
 */
export const PLATFORM_NAME = 'eWeLink';

/**
 * Plugin name - must match the package.json name
 */
export const PLUGIN_NAME = '@homebridge-plugins/homebridge-ewelink';

/**
 * Plugin version
 */
export const PLUGIN_VERSION = '1.0.0';

/**
 * eWeLink API credentials
 */
export const EWELINK_APP_ID = 'vBXTs5I0auE972GexaJeR2P4zQWOBoze';
export const EWELINK_APP_SECRET = 'NLA0arkjuFyGI7CtHeBMbxL1v0AGG4WE';

/**
 * eWeLink API regions
 */
export const API_REGIONS = {
  cn: {
    httpHost: 'cn-apia.coolkit.cn',
    wsHost: 'wss://cn-pconnect.coolkit.cn:8080/api/ws',
  },
  as: {
    httpHost: 'as-apia.coolkit.cc',
    wsHost: 'wss://as-pconnect.coolkit.cc:8080/api/ws',
  },
  us: {
    httpHost: 'us-apia.coolkit.cc',
    wsHost: 'wss://us-pconnect.coolkit.cc:8080/api/ws',
  },
  eu: {
    httpHost: 'eu-apia.coolkit.cc',
    wsHost: 'wss://eu-pconnect.coolkit.cc:8080/api/ws',
  },
} as const;

/**
 * Default configuration values
 */
export const DEFAULTS = {
  mode: 'auto',
  hideDevFromHB: false,
  hideMasters: false,
  hideFromHB: false,
  outlineInLog: true,
  debug: false,
  debugFakegato: false,
  disableDeviceLogging: false,
  offlineAsOff: false,
  singleDevices: [],
  multiDevices: [],
  thDevices: [],
  fanDevices: [],
  lightDevices: [],
  sensorDevices: [],
  rfDevices: [],
  bridgeSensors: [],
  groups: [],
  ignoredDevices: [],
} as const;

/**
 * Device categories
 */
export enum DeviceCategory {
  SINGLE_SWITCH = 'single',
  MULTI_SWITCH = 'multi',
  THERMOSTAT = 'thermostat',
  FAN = 'fan',
  LIGHT = 'light',
  SENSOR = 'sensor',
  RF_BRIDGE = 'rf_bridge',
  OUTLET = 'outlet',
  CURTAIN = 'curtain',
  GARAGE = 'garage',
  LOCK = 'lock',
  AIR_CONDITIONER = 'air_conditioner',
  HUMIDIFIER = 'humidifier',
  DIFFUSER = 'diffuser',
  PANEL = 'panel',
  VIRTUAL = 'virtual',
  MOTOR = 'motor',
  GROUP = 'group',
  UNKNOWN = 'unknown',
}

/**
 * Device UI IDs mapped to device types
 * Based on original homebridge-ewelink constants
 */
export const DEVICE_UIID_MAP: Record<number, DeviceCategory> = {
  // Single switches
  1: DeviceCategory.SINGLE_SWITCH,
  6: DeviceCategory.SINGLE_SWITCH,
  14: DeviceCategory.SINGLE_SWITCH,
  24: DeviceCategory.SINGLE_SWITCH,
  27: DeviceCategory.SINGLE_SWITCH,
  77: DeviceCategory.SINGLE_SWITCH,
  78: DeviceCategory.SINGLE_SWITCH,
  81: DeviceCategory.SINGLE_SWITCH,
  107: DeviceCategory.SINGLE_SWITCH,
  112: DeviceCategory.SINGLE_SWITCH,
  138: DeviceCategory.SINGLE_SWITCH,
  160: DeviceCategory.SINGLE_SWITCH,
  168: DeviceCategory.SINGLE_SWITCH,
  182: DeviceCategory.SINGLE_SWITCH,
  190: DeviceCategory.SINGLE_SWITCH,

  // Single switches with power monitoring (outlets)
  5: DeviceCategory.OUTLET,
  32: DeviceCategory.OUTLET,

  // Multi-channel switches
  2: DeviceCategory.MULTI_SWITCH,
  3: DeviceCategory.MULTI_SWITCH,
  4: DeviceCategory.MULTI_SWITCH,
  7: DeviceCategory.MULTI_SWITCH,
  8: DeviceCategory.MULTI_SWITCH,
  9: DeviceCategory.MULTI_SWITCH,
  29: DeviceCategory.MULTI_SWITCH,
  30: DeviceCategory.MULTI_SWITCH,
  31: DeviceCategory.MULTI_SWITCH,
  41: DeviceCategory.MULTI_SWITCH,
  82: DeviceCategory.MULTI_SWITCH,
  83: DeviceCategory.MULTI_SWITCH,
  84: DeviceCategory.MULTI_SWITCH,
  113: DeviceCategory.MULTI_SWITCH,
  114: DeviceCategory.MULTI_SWITCH,
  139: DeviceCategory.MULTI_SWITCH,
  140: DeviceCategory.MULTI_SWITCH,
  141: DeviceCategory.MULTI_SWITCH,
  161: DeviceCategory.MULTI_SWITCH,
  162: DeviceCategory.MULTI_SWITCH,
  163: DeviceCategory.MULTI_SWITCH,
  178: DeviceCategory.MULTI_SWITCH,
  210: DeviceCategory.MULTI_SWITCH,
  211: DeviceCategory.MULTI_SWITCH,
  212: DeviceCategory.MULTI_SWITCH,

  // Multi-channel switches (moved to proper section above)
  126: DeviceCategory.MULTI_SWITCH, // Multi with power monitoring
  165: DeviceCategory.MULTI_SWITCH, // Multi with power monitoring
  262: DeviceCategory.MULTI_SWITCH, // Multi with power monitoring

  // Lights - Dimmable
  36: DeviceCategory.LIGHT,
  44: DeviceCategory.LIGHT,
  57: DeviceCategory.LIGHT,

  // Lights - RGB
  22: DeviceCategory.LIGHT,

  // Lights - CCT (Color Temperature)
  103: DeviceCategory.LIGHT,

  // Lights - RGB+CCT
  33: DeviceCategory.LIGHT,
  59: DeviceCategory.LIGHT,
  104: DeviceCategory.LIGHT,
  135: DeviceCategory.LIGHT,
  136: DeviceCategory.LIGHT,
  137: DeviceCategory.LIGHT,
  173: DeviceCategory.LIGHT,

  // SONOFF Mini (S-MAN) - Programmable switch with 6 channels
  174: DeviceCategory.SINGLE_SWITCH,

  // SONOFF Mate (S-MATE) - Programmable switch with 3 button modes
  177: DeviceCategory.SINGLE_SWITCH,

  // Curtains/Motors
  11: DeviceCategory.CURTAIN,
  67: DeviceCategory.CURTAIN,
  91: DeviceCategory.CURTAIN,
  258: DeviceCategory.CURTAIN,

  // Contact/Door sensors
  102: DeviceCategory.SENSOR,
  154: DeviceCategory.SENSOR,

  // Temperature/Humidity sensors
  15: DeviceCategory.THERMOSTAT, // TH sensor (read-only)
  18: DeviceCategory.THERMOSTAT, // TH sensor
  181: DeviceCategory.THERMOSTAT, // Ambient sensor

  // Thermostat (with heating control)
  127: DeviceCategory.THERMOSTAT,

  // Fans
  34: DeviceCategory.FAN,

  // Air Conditioner
  151: DeviceCategory.AIR_CONDITIONER,

  // Humidifier
  19: DeviceCategory.HUMIDIFIER,

  // Diffuser
  25: DeviceCategory.DIFFUSER,

  // Panel (NSPanel, NSPanel Pro)
  133: DeviceCategory.PANEL,
  195: DeviceCategory.PANEL,

  // Virtual devices
  265: DeviceCategory.VIRTUAL,

  // Group devices (virtual UIID)
  5000: DeviceCategory.GROUP,

  // Other sensors
  130: DeviceCategory.SENSOR,
  191: DeviceCategory.SENSOR,

  // RF Bridge
  28: DeviceCategory.RF_BRIDGE,
  98: DeviceCategory.RF_BRIDGE,

  // Zigbee Bridge
  66: DeviceCategory.RF_BRIDGE, // Using RF_BRIDGE category for now
  128: DeviceCategory.RF_BRIDGE,

  // Zigbee devices
  1000: DeviceCategory.SINGLE_SWITCH, // ZB Switch
  1257: DeviceCategory.LIGHT, // ZB Light Dimmer
  1258: DeviceCategory.LIGHT, // ZB Light CCT
  1514: DeviceCategory.CURTAIN, // ZB Motor
  1770: DeviceCategory.THERMOSTAT, // ZB Sensor Ambient
  1771: DeviceCategory.THERMOSTAT, // ZB Sensor Ambient
  2026: DeviceCategory.SENSOR, // ZB Sensor Motion
  3026: DeviceCategory.SENSOR, // ZB Sensor Contact
  3258: DeviceCategory.LIGHT, // ZB Light RGB+CCT
  4026: DeviceCategory.SENSOR, // ZB Sensor Water
  5026: DeviceCategory.SENSOR, // ZB Sensor Smoke
  7000: DeviceCategory.SINGLE_SWITCH, // ZB Switch
  7002: DeviceCategory.SENSOR, // ZB Sensor Motion
  7003: DeviceCategory.SENSOR, // ZB Sensor Contact
  7006: DeviceCategory.CURTAIN, // ZB Motor
  7014: DeviceCategory.THERMOSTAT, // ZB Sensor Ambient
  7016: DeviceCategory.SENSOR, // ZB Sensor Occupancy
  7017: DeviceCategory.THERMOSTAT, // ZB Thermostat
  7019: DeviceCategory.SENSOR, // ZB Sensor Water
  7027: DeviceCategory.SINGLE_SWITCH, // ZB Valve/Switch
};
