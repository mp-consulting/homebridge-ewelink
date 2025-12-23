import { DEVICE_CATALOG, type DeviceCategoryType } from './constants/device-catalog.js';

/**
 * Platform name - used in config.json
 */
export const PLATFORM_NAME = 'eWeLink';

/**
 * Plugin name - must match the package.json name
 */
export const PLUGIN_NAME = '@mp-consulting/homebridge-ewelink';

/**
 * Plugin version
 */
export const PLUGIN_VERSION = '1.0.0';

/**
 * eWeLink API credentials (from original plugin)
 */
export const EWELINK_APP_ID = 'Uw83EKZFxdif7XFXEsrpduz5YyjP7nTl';
export const EWELINK_APP_SECRET = 'mXLOjea0woSMvK9gw7Fjsy7YlFO4iSu6';

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
 * Device categories enum
 * Used for device routing in platform.ts
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
 * Maps catalog category type to DeviceCategory enum
 */
const CATEGORY_TYPE_TO_ENUM: Record<DeviceCategoryType, DeviceCategory> = {
  single_switch: DeviceCategory.SINGLE_SWITCH,
  multi_switch: DeviceCategory.MULTI_SWITCH,
  outlet: DeviceCategory.OUTLET,
  light: DeviceCategory.LIGHT,
  fan: DeviceCategory.FAN,
  curtain: DeviceCategory.CURTAIN,
  garage: DeviceCategory.GARAGE,
  thermostat: DeviceCategory.THERMOSTAT,
  sensor: DeviceCategory.SENSOR,
  air_conditioner: DeviceCategory.AIR_CONDITIONER,
  humidifier: DeviceCategory.HUMIDIFIER,
  diffuser: DeviceCategory.DIFFUSER,
  panel: DeviceCategory.PANEL,
  rf_bridge: DeviceCategory.RF_BRIDGE,
  zigbee_bridge: DeviceCategory.RF_BRIDGE, // Zigbee bridges use RF_BRIDGE category
  virtual: DeviceCategory.VIRTUAL,
  group: DeviceCategory.GROUP,
  programmable_switch: DeviceCategory.SINGLE_SWITCH, // Programmable switches use SINGLE_SWITCH category
};

/**
 * Get DeviceCategory enum from catalog category type
 */
export function getCategoryFromType(categoryType: DeviceCategoryType): DeviceCategory {
  return CATEGORY_TYPE_TO_ENUM[categoryType] ?? DeviceCategory.UNKNOWN;
}

/**
 * Get DeviceCategory for a UIID
 */
export function getDeviceCategory(uiid: number): DeviceCategory {
  const device = DEVICE_CATALOG[uiid];
  if (!device) {
    return DeviceCategory.UNKNOWN;
  }
  return getCategoryFromType(device.category);
}

/**
 * Device UI IDs mapped to device types
 * NOTE: Now derived from device catalog. Use getDeviceCategory() for new code.
 */
export const DEVICE_UIID_MAP: Record<number, DeviceCategory> = Object.fromEntries(
  Object.entries(DEVICE_CATALOG).map(([uiid, entry]) => [
    Number(uiid),
    getCategoryFromType(entry.category),
  ]),
);
