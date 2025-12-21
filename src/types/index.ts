import type { PlatformConfig } from 'homebridge';

/**
 * Plugin configuration interface
 */
export interface EWeLinkPlatformConfig extends PlatformConfig {
  /** eWeLink username (email) */
  username?: string;
  /** eWeLink password */
  password?: string;
  /** API region: cn, as, us, eu */
  countryCode?: string;
  /** Connection mode: auto, lan, wan */
  mode?: 'auto' | 'lan' | 'wan';
  /** Language for localization */
  language?: string;
  /** Disable "No Response" errors */
  disableNoResponse?: boolean;
  /** Hide device from Homebridge */
  hideDevFromHB?: boolean;
  /** Hide master/parent devices */
  hideMasters?: boolean;
  /** Hide from Homebridge completely */
  hideFromHB?: boolean;
  /** Outline messages in log */
  outlineInLog?: boolean;
  /** Debug mode */
  debug?: boolean;
  /** Debug Fakegato history */
  debugFakegato?: boolean;
  /** Disable device-level logging */
  disableDeviceLogging?: boolean;
  /** Show offline devices as off */
  offlineAsOff?: boolean;
  /** Ignored home IDs */
  ignoredHomes?: string[];
  /** Internal API server host */
  httpHost?: string;
  /** Internal API server port */
  apiPort?: number;
  /** Custom eWeLink app ID */
  appId?: string;
  /** Custom eWeLink app secret */
  appSecret?: string;
  /** Single switch device configurations */
  singleDevices?: SingleDeviceConfig[];
  /** Multi-switch device configurations */
  multiDevices?: MultiDeviceConfig[];
  /** Thermostat device configurations */
  thDevices?: ThermostatDeviceConfig[];
  /** Fan device configurations */
  fanDevices?: FanDeviceConfig[];
  /** Light device configurations */
  lightDevices?: LightDeviceConfig[];
  /** Sensor device configurations */
  sensorDevices?: SensorDeviceConfig[];
  /** RF bridge device configurations */
  rfDevices?: RFDeviceConfig[];
  /** RF bridge sensor configurations */
  bridgeSensors?: BridgeSensorConfig[];
  /** Device groups */
  groups?: GroupConfig[];
  /** Ignored device IDs */
  ignoredDevices?: string[];
}

/**
 * Base device configuration
 */
export interface BaseDeviceConfig {
  /** eWeLink device ID */
  deviceId: string;
  /** Custom device name */
  label?: string;
  /** IP address for LAN control */
  ipAddress?: string;
  /** Ignore this device */
  ignoreDevice?: boolean;
  /** Disable logging for this device */
  disableDeviceLogging?: boolean;
}

/**
 * Single switch device configuration
 */
export interface SingleDeviceConfig extends BaseDeviceConfig {
  /** Show as different accessory type */
  showAs?: 'default' | 'outlet' | 'switch' | 'valve' | 'sensor' | 'heater' | 'cooler' | 'purifier' | 'lock' | 'tap';
  /** Override device model */
  deviceModel?: string;
  /** Temperature sensor device ID for heater/cooler */
  tempSource?: string;
  /** Humidity sensor device ID */
  humiditySource?: string;
  /** Enable inching mode (always sends "on", toggles state internally) */
  isInched?: boolean;
  /** Use inching mode as on/off state (deprecated, use isInched) */
  showAsInching?: boolean;
  /** Sensor type for sensor mode */
  sensorType?: 'motion' | 'leak' | 'smoke' | 'co' | 'contact';
  /** Invert open/close state */
  sensorInvert?: boolean;
  /** Timer for auto-off in seconds */
  operationTime?: number;
  /** Operation time for valve */
  operationTimeDown?: number;
  /** Temperature offset in degrees */
  offset?: number;
  /** Temperature offset multiplier factor */
  offsetFactor?: number;
  /** Power threshold for "in use" state (outlets) */
  inUsePowerThreshold?: number;
  /** Sensor device ID for garage doors */
  sensorId?: string;
  /** Show as motor/curtain */
  showAsMotor?: boolean;
  /** Eachen garage door variant */
  showAsEachen?: boolean;
  /** Disable timer functionality */
  disableTimer?: boolean;
  /** Hide sensor in garage simulation */
  hideSensor?: boolean;
  /** Obstruction sensor device ID */
  obstructId?: string;
  /** Lock type for lock simulation */
  type?: string;
  /** Override logging level */
  overrideLogging?: string;
  /** Garage door type */
  garageType?: string;
}

/**
 * Multi-switch device configuration
 */
export interface MultiDeviceConfig extends BaseDeviceConfig {
  /** Show as different accessory type */
  showAs?: 'default' | 'outlet' | 'switch' | 'valve' | 'blind' | 'garage' | 'door' | 'window' | 'lock';
  /** Override device model */
  deviceModel?: string;
  /** Temperature source device ID for climate simulations */
  tempSource?: string;
  /** Humidity sensor device ID */
  humiditySource?: string;
  /** Hide specific channels (0-indexed) */
  hideChannels?: string;
  /** Operation time in seconds */
  operationTime?: number;
  /** Operation time for down movement */
  operationTimeDown?: number;
  /** Invert open/close state */
  invert?: boolean;
  /** Sensor device ID for garage doors */
  sensorId?: string;
  /** Hide sensor in garage simulation */
  hideSensor?: boolean;
  /** Obstruction sensor device ID */
  obstructId?: string;
  /** Lock type for lock simulation */
  type?: string;
  /** Sensor type */
  sensorType?: string;
  /** Low battery threshold */
  lowBattThreshold?: number;
  /** Scale battery percentage */
  scaleBattery?: boolean;
  /** Disable timer functionality */
  disableTimer?: boolean;
  /** Override logging level */
  overrideLogging?: string;
}

/**
 * Thermostat device configuration
 */
export interface ThermostatDeviceConfig extends BaseDeviceConfig {
  /** Show as different accessory type */
  showAs?: 'default' | 'thermostat' | 'heater' | 'cooler' | 'humidifier' | 'dehumidifier';
  /** Override device model */
  deviceModel?: string;
  /** Show heat/cool toggle */
  showHeatCool?: boolean;
  /** Hide main switch */
  hideSwitch?: boolean;
  /** Offset temperature */
  tempOffset?: number;
  /** Temperature offset multiplier factor */
  offsetFactor?: number;
  /** Humidity offset */
  humidityOffset?: number;
  /** Humidity offset multiplier factor */
  humidityOffsetFactor?: number;
  /** Minimum target temperature */
  minTarget?: number;
  /** Maximum target temperature */
  maxTarget?: number;
  /** Temperature threshold */
  targetTempThreshold?: number;
  /** Override logging level */
  overrideLogging?: string;
}

/**
 * Fan device configuration
 */
export interface FanDeviceConfig extends BaseDeviceConfig {
  /** Show as different accessory type */
  showAs?: 'default' | 'switch';
  /** Override device model */
  deviceModel?: string;
  /** Hide light */
  hideLight?: boolean;
  /** Override logging level */
  overrideLogging?: string;
}

/**
 * Light device configuration
 */
export interface LightDeviceConfig extends BaseDeviceConfig {
  /** Override device model */
  deviceModel?: string;
  /** Override brightness step */
  brightnessStep?: number;
  /** Use adaptive lighting */
  adaptiveLightingShift?: number;
  /** Override logging level */
  overrideLogging?: string;
}

/**
 * Sensor device configuration
 */
export interface SensorDeviceConfig extends BaseDeviceConfig {
  /** Hide temperature sensor */
  hideTemp?: boolean;
  /** Hide humidity sensor */
  hideHumidity?: boolean;
  /** Hide switch service (for sensors with relay control) */
  hideSwitch?: boolean;
  /** Temperature offset */
  tempOffset?: number;
  /** Humidity offset */
  humidityOffset?: number;
  /** Low battery threshold */
  lowBattery?: number;
  /** Hide long/double press events */
  hideLongDouble?: boolean;
  /** Scale battery percentage */
  scaleBattery?: boolean;
  /** Time difference threshold for sensors */
  sensorTimeDifference?: number;
  /** Override device model */
  deviceModel?: string;
  /** Override logging level */
  overrideLogging?: string;
}

/**
 * RF Bridge device configuration
 */
export interface RFDeviceConfig extends BaseDeviceConfig {
  /** Override device model */
  deviceModel?: string;
  /** Reset RF bridge on plugin startup */
  resetOnStartup?: boolean;
  /** Custom subdevice configurations */
  subdevices?: RFSubdeviceConfig[];
  /** Override logging level */
  overrideLogging?: string;
}

/**
 * RF Bridge subdevice configuration
 */
export interface RFSubdeviceConfig {
  /** RF subdevice button index */
  index: number;
  /** Custom label */
  label?: string;
  /** Show as different sensor type */
  showAs?: 'motion' | 'contact' | 'smoke' | 'water' | 'co' | 'occupancy' | 'button' | 'doorbell' | 'curtain' | 'garage';
  /** Reset time in seconds */
  resetTime?: number;
}

/**
 * Bridge sensor configuration
 */
export interface BridgeSensorConfig {
  /** Device ID of the RF Bridge */
  deviceId: string;
  /** Full button ID (deviceId + button code) */
  fullButtonId: string;
  /** Full device ID (alias for fullButtonId) */
  fullDeviceId?: string;
  /** Sensor type */
  sensorType?: 'motion' | 'contact' | 'smoke' | 'water' | 'co' | 'occupancy' | 'button' | 'doorbell';
  /** Device type (alias for sensorType) */
  deviceType?: string;
  /** Type (alias for sensorType) */
  type?: string;
  /** Custom label */
  label?: string;
  /** Reset time in seconds (alias for sensorTimeLength) */
  resetTime?: number;
  /** Sensor time length in seconds */
  sensorTimeLength?: number;
  /** Time difference threshold for duplicate detection */
  sensorTimeDifference?: number;
  /** Webhook URL for sensor triggers */
  sensorWebHook?: string;
  /** Curtain type for RF curtains */
  curtainType?: string;
  /** Operation time in seconds */
  operationTime?: number;
  /** Down operation time in seconds */
  operationTimeDown?: number;
}

/**
 * Device group configuration
 */
export interface GroupConfig {
  /** Group type */
  type: 'blind' | 'garage' | 'garage_one' | 'garage_two' | 'garage_four' | 'lock' | 'switch_valve' | 'tap' | 'tap_one' | 'valve' | 'valve_one' | 'valve_two' | 'valve_four';
  /** Device IDs in the group */
  deviceIds: string[];
  /** Custom name */
  label?: string;
  /** Operation time */
  operationTime?: number;
  /** Operation time down */
  operationTimeDown?: number;
  /** Invert open/close */
  invert?: boolean;
  /** Sensor ID for garage door */
  sensorId?: string;
}

/**
 * eWeLink device from API
 */
export interface EWeLinkDevice {
  /** Device ID */
  deviceid: string;
  /** Device name */
  name: string;
  /** Device type (uiid) */
  extra: {
    uiid: number;
    model: string;
    manufacturer: string;
    brandId: string;
    brandLogoUrl: string;
    description: string;
    modelInfo?: string;
    staMac?: string;
    chipid?: string;
    [key: string]: unknown;
  };
  /** Device brand name */
  brandName: string;
  /** Device brand logo URL */
  brandLogoUrl: string;
  /** Show brand */
  showBrand: boolean;
  /** Device model name */
  productModel: string;
  /** Device params (state) */
  params: DeviceParams;
  /** Online status */
  online: boolean;
  /** API key */
  apikey: string;
  /** Device group info */
  deviceGroup?: string;
  /** Tags */
  tags?: {
    m_2180_ops?: number;
    m_2186_ops?: number;
    [key: string]: unknown;
  };
  /** Device family */
  family?: {
    familyid: string;
    index: number;
  };
  /** Shared to */
  sharedTo?: string[];
  /** Shareable */
  shareable: boolean;
  /** Share permission */
  sharePermission?: number;
  /** Device key */
  devicekey: string;
  /** Created at */
  createdAt: string;
  /** Device URL */
  deviceUrl?: string;
  /** Deny */
  deny?: number;
  /** Settings */
  settings?: {
    opsNotify?: number;
    opsHistory?: number;
    alarmNotify?: number;
  };
  /** Denyfeatures */
  denyFeatures?: string[];
  /** Channel count */
  channelCount?: number;
}

/**
 * Device parameters (state)
 */
export interface DeviceParams {
  /** Switch state */
  switch?: 'on' | 'off';
  /** Multiple switch states */
  switches?: Array<{ switch: 'on' | 'off'; outlet: number }>;
  /** LED state */
  sledOnline?: 'on' | 'off';
  /** Firmware version */
  fwVersion?: string;
  /** RSSI signal strength */
  rssi?: number;
  /** Current temperature (x100) */
  currentTemperature?: number | string;
  /** Current humidity (x100) */
  currentHumidity?: number | string;
  /** Temperature in Celsius */
  temperature?: number | string;
  /** Humidity percentage */
  humidity?: number | string;
  /** Battery level */
  battery?: number;
  /** Last update time */
  lastUpdateTime?: string;
  /** State */
  state?: number | string;
  /** Power */
  power?: number | string;
  /** Voltage */
  voltage?: number | string;
  /** Current */
  current?: number | string;
  /** Brightness */
  bright?: number;
  /** Color temperature */
  colorTemp?: number;
  /** Light type */
  ltype?: string;
  /** White mode */
  white?: {
    br: number;
    ct: number;
  };
  /** Color mode */
  color?: {
    r: number;
    g: number;
    b: number;
    br: number;
  };
  /** Speed/fan mode */
  speed?: number;
  /** Fan mode */
  mode?: number | string;
  /** Pulse */
  pulse?: 'on' | 'off';
  /** Pulse width */
  pulseWidth?: number;
  /** Motor */
  motor?: number;
  /** Set close */
  setclose?: number;
  /** Lock state */
  lock?: number;
  /** Position */
  currLocation?: number;
  /** Zigbee specific */
  subDevices?: Array<{
    deviceid: string;
    type: string;
  }>;
  /** RF Bridge triggers */
  rfTrig0?: string;
  rfTrig1?: string;
  rfTrig2?: string;
  rfTrig3?: string;
  /** RF codes */
  rfChl?: number;
  /** Init state */
  init?: number;
  /** Additional params */
  [key: string]: unknown;
}

/**
 * LAN device discovery info
 */
export interface LANDevice {
  /** Device ID */
  deviceId: string;
  /** IP address */
  ip: string;
  /** Port */
  port: number;
  /** Is encrypted */
  encrypt: boolean;
  /** Encryption IV */
  iv?: string;
  /** Device key for decryption */
  deviceKey?: string;
}

/**
 * WebSocket message
 */
export interface WSMessage {
  /** Action */
  action?: string;
  /** Device ID */
  deviceid?: string;
  /** API key */
  apikey?: string;
  /** Error code */
  error?: number;
  /** Sequence number */
  sequence?: string;
  /** Parameters */
  params?: DeviceParams;
  /** User agent */
  userAgent?: string;
  /** Timestamp */
  ts?: number;
  /** From */
  from?: string;
  /** Config */
  config?: {
    hb?: number;
    hbInterval?: number;
  };
  /** Additional fields */
  [key: string]: unknown;
}

/**
 * HTTP API response
 */
export interface APIResponse<T = unknown> {
  /** Error code (0 = success) */
  error: number;
  /** Error message */
  msg?: string;
  /** Response data */
  data?: T;
}

/**
 * Login response
 */
export interface LoginResponse {
  /** Access token */
  at: string;
  /** Refresh token */
  rt: string;
  /** User info */
  user: {
    email?: string;
    phoneNumber?: string;
    countryCode?: string;
    apikey: string;
  };
  /** Region */
  region?: string;
}

/**
 * Device list response
 */
export interface DeviceListResponse {
  /** Device list */
  deviceList: EWeLinkDevice[];
  /** Total */
  total: number;
}

/**
 * Token refresh response
 */
export interface RefreshTokenResponse {
  /** Access token */
  at: string;
  /** Refresh token */
  rt: string;
}

/**
 * Accessory context stored in Homebridge
 */
export interface AccessoryContext {
  /** eWeLink device */
  device: EWeLinkDevice;
  /** Device ID */
  deviceId: string;
  /** Is group device */
  isGroup?: boolean;
  /** Group info */
  groupInfo?: GroupConfig;
  /** RF button index */
  rfButtonIndex?: number;
  /** Channel index for multi-switch */
  channelIndex?: number;
  /** Custom label */
  label?: string;
  /** Device category */
  category?: string;
  /** LAN info */
  lanInfo?: LANDevice;
  /** Last cached params */
  lastParams?: DeviceParams;
  /** Show as */
  showAs?: string;
  /** RF Bridge buttons (channel number -> button name) */
  buttons?: Record<string, string>;
  /** RF Bridge sensor type */
  subType?: string;
  /** Homebridge device ID for RF subdevices */
  hbDeviceId?: string;
  /** Cache last activation for RF sensors */
  cacheLastAct?: string;
  /** Cached target temperature/humidity for TH simulations */
  cacheTarget?: number;
  /** Show heat/cool toggle for thermostat */
  showHeatCool?: boolean;
  /** Cache type for TH simulations */
  cacheType?: string;
  /** Cached current position for blind/door/window simulations (0-100) */
  cacheCurrentPosition?: number;
  /** Cached target position for blind/door/window simulations (0-100) */
  cacheTargetPosition?: number;
  /** Cached position state for blind/door/window simulations (0=closing, 1=opening, 2=stopped) */
  cachePositionState?: number;
  /** Cache last start time for position calculations (in deciseconds) */
  cacheLastStartTime?: number;
}
