/**
 * Comprehensive Device Catalog
 * Maps all supported eWeLink devices with their characteristics, capabilities, and HomeKit mappings
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** HomeKit service types supported by the plugin */
export type HomeKitServiceType =
  | 'Switch'
  | 'Outlet'
  | 'Lightbulb'
  | 'Fan'
  | 'Fanv2'
  | 'WindowCovering'
  | 'GarageDoorOpener'
  | 'LockMechanism'
  | 'Thermostat'
  | 'HeaterCooler'
  | 'HumidifierDehumidifier'
  | 'AirPurifier'
  | 'Valve'
  | 'TemperatureSensor'
  | 'HumiditySensor'
  | 'MotionSensor'
  | 'ContactSensor'
  | 'LeakSensor'
  | 'SmokeSensor'
  | 'CarbonMonoxideSensor'
  | 'OccupancySensor'
  | 'StatelessProgrammableSwitch'
  | 'Doorbell'
  | 'Television'
  | 'Battery';

/** Device category for routing */
export type DeviceCategoryType =
  | 'single_switch'
  | 'multi_switch'
  | 'outlet'
  | 'light'
  | 'fan'
  | 'curtain'
  | 'garage'
  | 'thermostat'
  | 'sensor'
  | 'air_conditioner'
  | 'humidifier'
  | 'diffuser'
  | 'panel'
  | 'rf_bridge'
  | 'zigbee_bridge'
  | 'virtual'
  | 'group'
  | 'programmable_switch';

/** Light capability types */
export type LightType =
  | 'switch_only'      // On/Off only
  | 'dimmable'         // On/Off + Brightness
  | 'cct'              // On/Off + Brightness + Color Temperature
  | 'rgb'              // On/Off + Brightness + RGB Color
  | 'rgbcct';          // On/Off + Brightness + RGB Color + Color Temperature

/** Power monitoring capability levels */
export type PowerMonitoringType =
  | 'none'             // No power monitoring
  | 'basic'            // Power (Watts) only
  | 'full';            // Power + Voltage + Current

/** Switch parameter style used by device */
export type SwitchParamStyle =
  | 'single'           // { switch: 'on'/'off' }
  | 'multi'            // { switches: [{outlet: n, switch: 'on'/'off'}] }
  | 'state';           // { state: 'on'/'off' }

/** Device parameters definition */
export interface DeviceParamsDef {
  /** Parameter style for switch control */
  switchStyle?: SwitchParamStyle;
  /** On/off parameter name */
  onOffParam?: string;
  /** Brightness parameter name and range */
  brightness?: { param: string; min: number; max: number };
  /** Color temperature parameter */
  colorTemp?: { param: string; min: number; max: number };
  /** RGB color parameters */
  rgb?: { r: string; g: string; b: string; br?: string };
  /** Position parameter for curtains */
  position?: { current: string; target: string; inverted?: boolean };
  /** Temperature parameter */
  temperature?: string;
  /** Humidity parameter */
  humidity?: string;
  /** Power monitoring parameters */
  power?: { power: string; voltage?: string; current?: string };
  /** Fan speed parameter */
  fanSpeed?: { param: string; min: number; max: number };
  /** Motor turn parameter */
  motorTurn?: string;
}

/** Device capability flags */
export interface DeviceCapabilities {
  /** Light type if applicable */
  lightType?: LightType;
  /** Power monitoring level */
  powerMonitoring: PowerMonitoringType;
  /** Has temperature sensor */
  hasTemperature?: boolean;
  /** Has humidity sensor */
  hasHumidity?: boolean;
  /** Has battery */
  hasBattery?: boolean;
  /** Has relay/switch control */
  hasRelay?: boolean;
  /** Number of channels (1 for single, 2-4 for multi) */
  channels: number;
  /** Supports inching mode */
  supportsInching?: boolean;
  /** Supports LAN control */
  supportsLAN?: boolean;
  /** Is a sensor device */
  isSensor?: boolean;
  /** Is a bridge device */
  isBridge?: boolean;
}

/** Complete device catalog entry */
export interface DeviceCatalogEntry {
  /** Unique Interface ID */
  uiid: number;
  /** Device category */
  category: DeviceCategoryType;
  /** Human-readable device name */
  name: string;
  /** Alternative names/model numbers */
  models?: string[];
  /** Brand name if specific */
  brand?: string;
  /** Primary HomeKit service */
  primaryService: HomeKitServiceType;
  /** Additional HomeKit services */
  additionalServices?: HomeKitServiceType[];
  /** Device capabilities */
  capabilities: DeviceCapabilities;
  /** Device parameters definition */
  params: DeviceParamsDef;
  /** Supported showAs simulation types */
  supportedSimulations?: string[];
  /** Notes about the device */
  notes?: string;
}

// ============================================================================
// DEVICE CATALOG
// ============================================================================

/**
 * Complete catalog of all supported eWeLink devices
 * Indexed by UIID for fast lookup
 */
export const DEVICE_CATALOG: Record<number, DeviceCatalogEntry> = {
  // ==========================================================================
  // SINGLE CHANNEL SWITCHES
  // ==========================================================================

  1: {
    uiid: 1,
    category: 'single_switch',
    name: 'Single Channel Switch',
    models: ['BASIC', 'MINI', 'S20', 'S26', 'S55', 'RF', 'RFR2', 'RFR3'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsInching: true,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
    supportedSimulations: ['outlet', 'light', 'valve', 'tap', 'lock', 'garage', 'gate', 'sensor', 'p_button'],
  },

  6: {
    uiid: 6,
    category: 'single_switch',
    name: 'Single Channel Wall Switch',
    models: ['T1-1C', 'TX1C', 'G1'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsInching: true,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
    supportedSimulations: ['outlet', 'light', 'valve', 'tap', 'lock', 'garage', 'gate', 'sensor', 'p_button'],
  },

  14: {
    uiid: 14,
    category: 'single_switch',
    name: 'Switch Change',
    models: ['SV', 'Sonoff SV'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsInching: true,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
    supportedSimulations: ['outlet', 'light', 'valve', 'tap', 'lock', 'garage', 'gate'],
  },

  24: {
    uiid: 24,
    category: 'single_switch',
    name: 'GSM Socket',
    models: ['GSM Socket'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
    supportedSimulations: ['outlet'],
  },

  27: {
    uiid: 27,
    category: 'single_switch',
    name: 'GSM Unlimit Socket',
    models: ['GSM Unlimit Socket'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
    supportedSimulations: ['outlet'],
  },

  77: {
    uiid: 77,
    category: 'single_switch',
    name: 'Single Socket Multiple',
    models: ['Micro'],
    notes: '1 socket using 4-channel data structure',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet', 'valve', 'tap', 'lock', 'garage', 'gate'],
  },

  78: {
    uiid: 78,
    category: 'single_switch',
    name: 'Single Switch Multiple',
    models: ['Micro Switch'],
    notes: '1 switch using 4-channel data structure',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet', 'valve', 'tap', 'lock', 'garage', 'gate'],
  },

  81: {
    uiid: 81,
    category: 'single_switch',
    name: 'GSM Socket No Flow',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
    supportedSimulations: ['outlet'],
  },

  107: {
    uiid: 107,
    category: 'single_switch',
    name: 'GSM Socket No Flow',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
    supportedSimulations: ['outlet'],
  },

  112: {
    uiid: 112,
    category: 'single_switch',
    name: 'Single Channel Switch',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
    supportedSimulations: ['outlet', 'valve', 'tap', 'lock', 'garage', 'gate'],
  },

  138: {
    uiid: 138,
    category: 'single_switch',
    name: 'WLAN Smart Switch',
    models: ['MINIR3', 'WOOLLEY'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
    supportedSimulations: ['outlet', 'valve', 'tap', 'lock', 'garage', 'gate'],
  },

  160: {
    uiid: 160,
    category: 'single_switch',
    name: 'SwitchMan Smart Wall Switch M5',
    models: ['M5-1C'],
    brand: 'SONOFF',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
    supportedSimulations: ['outlet', 'light'],
  },

  209: {
    uiid: 209,
    category: 'single_switch',
    name: 'Ultimate Switch T5',
    models: ['T5-1C-86'],
    brand: 'SONOFF',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
    supportedSimulations: ['outlet', 'light'],
  },

  // ==========================================================================
  // OUTLETS WITH POWER MONITORING
  // ==========================================================================

  5: {
    uiid: 5,
    category: 'outlet',
    name: 'Power Monitoring Socket',
    models: ['POW', 'S31'],
    brand: 'SONOFF',
    primaryService: 'Outlet',
    capabilities: {
      powerMonitoring: 'basic',
      channels: 1,
      supportsInching: true,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      power: { power: 'power' },
    },
    supportedSimulations: ['switch'],
  },

  32: {
    uiid: 32,
    category: 'outlet',
    name: 'Power Detection Socket',
    models: ['POW R2', 'S31', 'IW101'],
    brand: 'SONOFF',
    primaryService: 'Outlet',
    capabilities: {
      powerMonitoring: 'full',
      channels: 1,
      supportsInching: true,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      power: { power: 'power', voltage: 'voltage', current: 'current' },
    },
    supportedSimulations: ['switch'],
  },

  182: {
    uiid: 182,
    category: 'outlet',
    name: 'Power Detection Plug S40',
    models: ['S40'],
    brand: 'SONOFF',
    primaryService: 'Outlet',
    capabilities: {
      powerMonitoring: 'full',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      power: { power: 'power', voltage: 'voltage', current: 'current' },
    },
    supportedSimulations: ['switch'],
  },

  190: {
    uiid: 190,
    category: 'outlet',
    name: 'Power Monitoring Switch',
    models: ['POWR316', 'POWR316D', 'POWR320D'],
    brand: 'SONOFF',
    primaryService: 'Outlet',
    capabilities: {
      powerMonitoring: 'full',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      power: { power: 'power', voltage: 'voltage', current: 'current' },
    },
    supportedSimulations: ['switch'],
  },

  191: {
    uiid: 191,
    category: 'outlet',
    name: 'Power Monitoring Switch',
    models: ['POWR3'],
    brand: 'SONOFF',
    primaryService: 'Outlet',
    capabilities: {
      powerMonitoring: 'full',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      power: { power: 'power', voltage: 'voltage', current: 'current' },
    },
    supportedSimulations: ['switch'],
  },

  225: {
    uiid: 225,
    category: 'outlet',
    name: 'Single Switch with Power Monitoring',
    models: ['CK-BL602-PCSW-01'],
    primaryService: 'Outlet',
    capabilities: {
      powerMonitoring: 'basic',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      power: { power: 'power' },
    },
    supportedSimulations: ['switch'],
  },

  // ==========================================================================
  // MULTI-CHANNEL SWITCHES
  // ==========================================================================

  2: {
    uiid: 2,
    category: 'multi_switch',
    name: '2-Channel Socket',
    models: ['SOCKET_2', 'S20'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 2,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet'],
  },

  3: {
    uiid: 3,
    category: 'multi_switch',
    name: '3-Channel Socket',
    models: ['SOCKET_3'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 3,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet'],
  },

  4: {
    uiid: 4,
    category: 'multi_switch',
    name: '4-Channel Socket',
    models: ['SOCKET_4', '4CH', '4CH Pro', '4CH Pro R2'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 4,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet'],
  },

  7: {
    uiid: 7,
    category: 'multi_switch',
    name: '2-Channel Wall Switch',
    models: ['T1-2C', 'TX2C'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 2,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet', 'light'],
  },

  8: {
    uiid: 8,
    category: 'multi_switch',
    name: '3-Channel Wall Switch',
    models: ['T1-3C', 'TX3C'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 3,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet', 'light'],
  },

  9: {
    uiid: 9,
    category: 'multi_switch',
    name: '4-Channel Wall Switch',
    models: ['T1-4C'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 4,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet', 'light'],
  },

  29: {
    uiid: 29,
    category: 'multi_switch',
    name: '2-Channel GSM Socket',
    models: ['GSM_SOCKET_2'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 2,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet'],
  },

  30: {
    uiid: 30,
    category: 'multi_switch',
    name: '3-Channel GSM Socket',
    models: ['GSM_SOCKET_3'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 3,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet'],
  },

  31: {
    uiid: 31,
    category: 'multi_switch',
    name: '4-Channel GSM Socket',
    models: ['GSM_SOCKET_4'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 4,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet'],
  },

  82: {
    uiid: 82,
    category: 'multi_switch',
    name: '2-Channel GSM Socket No Flow',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 2,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet'],
  },

  83: {
    uiid: 83,
    category: 'multi_switch',
    name: '3-Channel GSM Socket No Flow',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 3,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet'],
  },

  84: {
    uiid: 84,
    category: 'multi_switch',
    name: '4-Channel GSM Socket No Flow',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 4,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet'],
  },

  113: {
    uiid: 113,
    category: 'multi_switch',
    name: '2-Channel Switch',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 2,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet'],
  },

  114: {
    uiid: 114,
    category: 'multi_switch',
    name: '3-Channel Switch',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 3,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet'],
  },

  126: {
    uiid: 126,
    category: 'multi_switch',
    name: 'DUALR3',
    models: ['DUALR3'],
    brand: 'SONOFF',
    notes: 'Can be multi-switch OR curtain depending on params',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'basic',
      channels: 2,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
      power: { power: 'power' },
      position: { current: 'currLocation', target: 'location' },
      motorTurn: 'motorTurn',
    },
    supportedSimulations: ['outlet', 'blind', 'door', 'window'],
  },

  139: {
    uiid: 139,
    category: 'multi_switch',
    name: '2-Channel WLAN Switch',
    models: ['MINIR3-2'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 2,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet'],
  },

  140: {
    uiid: 140,
    category: 'multi_switch',
    name: '3-Channel WLAN Switch',
    models: ['MINIR3-3'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 3,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet'],
  },

  141: {
    uiid: 141,
    category: 'multi_switch',
    name: '4-Channel WLAN Switch',
    models: ['MINIR3-4'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 4,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet'],
  },

  161: {
    uiid: 161,
    category: 'multi_switch',
    name: 'SwitchMan Smart Wall Switch M5 2-Gang',
    models: ['M5-2C'],
    brand: 'SONOFF',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 2,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet', 'light'],
  },

  162: {
    uiid: 162,
    category: 'multi_switch',
    name: 'SwitchMan Smart Wall Switch M5 3-Gang',
    models: ['M5-3C'],
    brand: 'SONOFF',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 3,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet', 'light'],
  },

  165: {
    uiid: 165,
    category: 'multi_switch',
    name: 'DUALR3 Lite',
    models: ['DUALR3 Lite'],
    brand: 'SONOFF',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'basic',
      channels: 2,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
      power: { power: 'power' },
    },
    supportedSimulations: ['outlet', 'blind', 'door', 'window'],
  },

  210: {
    uiid: 210,
    category: 'multi_switch',
    name: 'Ultimate Switch T5 2-Gang',
    models: ['T5-2C-86'],
    brand: 'SONOFF',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 2,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet', 'light'],
  },

  211: {
    uiid: 211,
    category: 'multi_switch',
    name: 'Ultimate Switch T5 3-Gang',
    models: ['T5-3C-86'],
    brand: 'SONOFF',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 3,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet', 'light'],
  },

  212: {
    uiid: 212,
    category: 'multi_switch',
    name: 'Ultimate Switch T5 4-Gang',
    models: ['T5-4C-86'],
    brand: 'SONOFF',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 4,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
    supportedSimulations: ['outlet', 'light'],
  },

  262: {
    uiid: 262,
    category: 'multi_switch',
    name: '4-Channel Switch with Power Monitoring',
    models: ['CK-BL602-SWP1-02'],
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'basic',
      channels: 4,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
      power: { power: 'power' },
    },
    supportedSimulations: ['outlet'],
  },

  // ==========================================================================
  // LIGHTS - DIMMABLE ONLY
  // ==========================================================================

  36: {
    uiid: 36,
    category: 'light',
    name: 'Single Channel Dimmer',
    models: ['KING-M4', 'D1'],
    primaryService: 'Lightbulb',
    capabilities: {
      lightType: 'dimmable',
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      brightness: { param: 'bright', min: 10, max: 100 },
    },
    supportedSimulations: ['fan'],
    notes: 'Brightness scale 10-100 maps to HomeKit 0-100',
  },

  44: {
    uiid: 44,
    category: 'light',
    name: 'D1 Dimmer',
    models: ['D1'],
    brand: 'SONOFF',
    primaryService: 'Lightbulb',
    capabilities: {
      lightType: 'dimmable',
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      brightness: { param: 'brightness', min: 0, max: 100 },
    },
    supportedSimulations: ['fan'],
    notes: 'mode: 0 required for brightness control',
  },

  57: {
    uiid: 57,
    category: 'light',
    name: 'Monochromatic Ball Light',
    models: ['Mosquito Killer'],
    primaryService: 'Lightbulb',
    capabilities: {
      lightType: 'dimmable',
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'state',
      onOffParam: 'state',
      brightness: { param: 'channel0', min: 25, max: 255 },
    },
    supportedSimulations: ['fan'],
    notes: 'channel0 scale 25-255 maps to HomeKit 0-100',
  },

  // ==========================================================================
  // LIGHTS - RGB ONLY
  // ==========================================================================

  22: {
    uiid: 22,
    category: 'light',
    name: 'RGB Ball Light',
    models: ['B1', 'B1_R2'],
    brand: 'SONOFF',
    primaryService: 'Lightbulb',
    capabilities: {
      lightType: 'rgb',
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      brightness: { param: 'color.br', min: 0, max: 100 },
      rgb: { r: 'color.r', g: 'color.g', b: 'color.b', br: 'color.br' },
    },
    notes: 'ltype: "color" for RGB mode',
  },

  // ==========================================================================
  // LIGHTS - COLOR TEMPERATURE (CCT)
  // ==========================================================================

  103: {
    uiid: 103,
    category: 'light',
    name: 'CCT Light',
    models: ['B02-F'],
    primaryService: 'Lightbulb',
    capabilities: {
      lightType: 'cct',
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      brightness: { param: 'white.br', min: 0, max: 100 },
      colorTemp: { param: 'white.ct', min: 0, max: 100 },
    },
    notes: 'ct 0-100 maps to mireds 140-500',
  },

  // ==========================================================================
  // LIGHTS - RGB + COLOR TEMPERATURE (RGBCCT)
  // ==========================================================================

  33: {
    uiid: 33,
    category: 'light',
    name: 'Light Belt',
    models: ['L1', 'B1'],
    primaryService: 'Lightbulb',
    capabilities: {
      lightType: 'rgbcct',
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      brightness: { param: 'white.br', min: 0, max: 100 },
      colorTemp: { param: 'white.ct', min: 0, max: 100 },
      rgb: { r: 'color.r', g: 'color.g', b: 'color.b', br: 'color.br' },
    },
    notes: 'ltype: "color" for RGB, "white" for CCT',
  },

  59: {
    uiid: 59,
    category: 'light',
    name: 'Music Light Belt',
    models: ['L1'],
    brand: 'SONOFF',
    primaryService: 'Lightbulb',
    capabilities: {
      lightType: 'rgbcct',
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      brightness: { param: 'white.br', min: 0, max: 100 },
      colorTemp: { param: 'white.ct', min: 0, max: 100 },
      rgb: { r: 'color.r', g: 'color.g', b: 'color.b', br: 'color.br' },
    },
    notes: 'ltype: "color" for RGB, "white" for CCT',
  },

  104: {
    uiid: 104,
    category: 'light',
    name: 'RGB CCT Light',
    primaryService: 'Lightbulb',
    capabilities: {
      lightType: 'rgbcct',
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      brightness: { param: 'white.br', min: 0, max: 100 },
      colorTemp: { param: 'white.ct', min: 0, max: 100 },
      rgb: { r: 'color.r', g: 'color.g', b: 'color.b', br: 'color.br' },
    },
  },

  135: {
    uiid: 135,
    category: 'light',
    name: 'RGB Five-Color Light',
    notes: 'Supports 2.4G eWeLink-Remote',
    primaryService: 'Lightbulb',
    capabilities: {
      lightType: 'rgbcct',
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      brightness: { param: 'white.br', min: 0, max: 100 },
      colorTemp: { param: 'white.ct', min: 0, max: 100 },
      rgb: { r: 'color.r', g: 'color.g', b: 'color.b', br: 'color.br' },
    },
  },

  136: {
    uiid: 136,
    category: 'light',
    name: 'RGB Five-Color Light',
    notes: 'Supports 2.4G eWeLink-Remote',
    primaryService: 'Lightbulb',
    capabilities: {
      lightType: 'rgbcct',
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      brightness: { param: 'white.br', min: 0, max: 100 },
      colorTemp: { param: 'white.ct', min: 0, max: 100 },
      rgb: { r: 'color.r', g: 'color.g', b: 'color.b', br: 'color.br' },
    },
  },

  137: {
    uiid: 137,
    category: 'light',
    name: 'L2 Spider Controller',
    models: ['L2'],
    brand: 'SONOFF',
    primaryService: 'Lightbulb',
    capabilities: {
      lightType: 'rgbcct',
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      brightness: { param: 'white.br', min: 0, max: 100 },
      colorTemp: { param: 'white.ct', min: 0, max: 100 },
      rgb: { r: 'color.r', g: 'color.g', b: 'color.b', br: 'color.br' },
    },
  },

  173: {
    uiid: 173,
    category: 'light',
    name: 'L3 Light Strip',
    models: ['L3'],
    brand: 'SONOFF',
    primaryService: 'Lightbulb',
    capabilities: {
      lightType: 'rgbcct',
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      brightness: { param: 'white.br', min: 0, max: 100 },
      colorTemp: { param: 'white.ct', min: 0, max: 100 },
      rgb: { r: 'color.r', g: 'color.g', b: 'color.b', br: 'color.br' },
    },
  },

  // ==========================================================================
  // FANS
  // ==========================================================================

  34: {
    uiid: 34,
    category: 'fan',
    name: 'Fan with Light',
    models: ['iFan02', 'iFan03', 'iFan04'],
    brand: 'SONOFF',
    primaryService: 'Fanv2',
    additionalServices: ['Lightbulb'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 4,
      hasRelay: true,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
      fanSpeed: { param: 'speed', min: 0, max: 4 },
    },
    notes: 'Outlet 0: Light, Outlet 1: Fan. Speed 0-4 maps to 0%, 25%, 50%, 75%, 100%',
  },

  // ==========================================================================
  // CURTAINS / MOTORS
  // ==========================================================================

  11: {
    uiid: 11,
    category: 'curtain',
    name: 'King Q4 Cover',
    models: ['King Q4'],
    primaryService: 'WindowCovering',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      position: { current: 'setclose', target: 'setclose', inverted: true },
    },
    notes: 'setclose: 0=open, 100=closed (inverted from HomeKit)',
  },

  67: {
    uiid: 67,
    category: 'curtain',
    name: 'Rolling Door',
    primaryService: 'WindowCovering',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      position: { current: 'per', target: 'per' },
    },
  },

  91: {
    uiid: 91,
    category: 'curtain',
    name: 'Rolling Door/Cover',
    primaryService: 'WindowCovering',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      position: { current: 'currLocation', target: 'location' },
      motorTurn: 'motorTurn',
    },
  },

  258: {
    uiid: 258,
    category: 'curtain',
    name: 'Cover Device',
    primaryService: 'WindowCovering',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      position: { current: 'currLocation', target: 'location' },
      motorTurn: 'motorTurn',
    },
  },

  // ==========================================================================
  // THERMOSTATS & TEMPERATURE SENSORS
  // ==========================================================================

  15: {
    uiid: 15,
    category: 'thermostat',
    name: 'TH Sensor',
    models: ['TH10', 'TH16'],
    brand: 'SONOFF',
    primaryService: 'TemperatureSensor',
    additionalServices: ['HumiditySensor', 'Switch'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      hasTemperature: true,
      hasHumidity: true,
      hasRelay: true,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      temperature: 'currentTemperature',
      humidity: 'currentHumidity',
    },
    supportedSimulations: ['heater', 'cooler', 'humidifier', 'dehumidifier', 'thermostat'],
    notes: 'mainSwitch and deviceType params for relay control',
  },

  18: {
    uiid: 18,
    category: 'thermostat',
    name: 'Sensor Center',
    models: ['SC'],
    brand: 'SONOFF',
    primaryService: 'TemperatureSensor',
    additionalServices: ['HumiditySensor'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      hasTemperature: true,
      hasHumidity: true,
      supportsLAN: true,
    },
    params: {
      temperature: 'temperature',
      humidity: 'humidity',
    },
  },

  127: {
    uiid: 127,
    category: 'thermostat',
    name: 'Smart Thermostat',
    models: ['GTTA127'],
    primaryService: 'Thermostat',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      hasTemperature: true,
      hasRelay: true,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      temperature: 'temperature',
    },
    notes: 'targetTemp, workState: 0=idle, 1=heating, 2=auto',
  },

  181: {
    uiid: 181,
    category: 'thermostat',
    name: 'TH Elite',
    models: ['THR316', 'THR320'],
    brand: 'SONOFF',
    primaryService: 'TemperatureSensor',
    additionalServices: ['HumiditySensor', 'Switch'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      hasTemperature: true,
      hasHumidity: true,
      hasRelay: true,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      temperature: 'temperature',
      humidity: 'humidity',
    },
    supportedSimulations: ['heater', 'cooler', 'humidifier', 'dehumidifier', 'thermostat'],
  },

  // ==========================================================================
  // SENSORS
  // ==========================================================================

  102: {
    uiid: 102,
    category: 'sensor',
    name: 'Door/Window Sensor',
    models: ['DW2', 'OPL-DMA'],
    primaryService: 'ContactSensor',
    additionalServices: ['Battery'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      isSensor: true,
      hasBattery: true,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
  },

  154: {
    uiid: 154,
    category: 'sensor',
    name: 'Door/Window Sensor WiFi',
    models: ['DW2-Wi-Fi-L'],
    primaryService: 'ContactSensor',
    additionalServices: ['Battery'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      isSensor: true,
      hasBattery: true,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
  },

  130: {
    uiid: 130,
    category: 'sensor',
    name: 'SPM Sub Unit',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'basic',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      power: { power: 'power' },
    },
  },

  // ==========================================================================
  // AIR CONDITIONER
  // ==========================================================================

  151: {
    uiid: 151,
    category: 'air_conditioner',
    name: 'Air Conditioner',
    primaryService: 'HeaterCooler',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      hasTemperature: true,
      supportsLAN: false,
    },
    params: {
      temperature: 'indoor_temperature',
    },
    notes: 'power, mode (auto/heat/cool), temperature, wind_speed (0/101/102/103)',
  },

  // ==========================================================================
  // HUMIDIFIER
  // ==========================================================================

  19: {
    uiid: 19,
    category: 'humidifier',
    name: 'Humidifier',
    primaryService: 'Fan',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
    notes: 'Uses Fan service. state: 1=low, 2=medium, 3=high',
  },

  // ==========================================================================
  // DIFFUSER
  // ==========================================================================

  25: {
    uiid: 25,
    category: 'diffuser',
    name: 'Aromatherapy Diffuser',
    models: ['Komeito 1515-X'],
    primaryService: 'Fan',
    additionalServices: ['Lightbulb'],
    capabilities: {
      lightType: 'rgb',
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      rgb: { r: 'lightRcolor', g: 'lightGcolor', b: 'lightBcolor' },
      brightness: { param: 'lightbright', min: 0, max: 100 },
    },
    notes: 'Fan: state 0/1/2 (off/low/high). Light: lightswitch 0/1',
  },

  // ==========================================================================
  // PANELS
  // ==========================================================================

  133: {
    uiid: 133,
    category: 'panel',
    name: 'NSPanel',
    models: ['NSPanel'],
    brand: 'SONOFF',
    primaryService: 'TemperatureSensor',
    additionalServices: ['Switch', 'Switch'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 2,
      hasTemperature: true,
      supportsLAN: true,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
      temperature: 'temperature',
    },
    notes: 'Temperature sensor + 2 switch buttons',
  },

  195: {
    uiid: 195,
    category: 'panel',
    name: 'NSPanel Pro',
    models: ['NSPanel Pro'],
    brand: 'SONOFF',
    primaryService: 'TemperatureSensor',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      hasTemperature: true,
      supportsLAN: true,
    },
    params: {
      temperature: 'temperature',
    },
    notes: 'Temperature sensor only, no switches',
  },

  // ==========================================================================
  // RF BRIDGES
  // ==========================================================================

  28: {
    uiid: 28,
    category: 'rf_bridge',
    name: 'RF Bridge',
    models: ['RF Bridge', 'RFBridge'],
    brand: 'SONOFF',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      isBridge: true,
      supportsLAN: false,
    },
    params: {},
    notes: 'Creates sub-devices for learned RF buttons/sensors',
  },

  98: {
    uiid: 98,
    category: 'rf_bridge',
    name: 'Doorbell RF Bridge',
    primaryService: 'Doorbell',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      isBridge: true,
      supportsLAN: false,
    },
    params: {},
  },

  // ==========================================================================
  // ZIGBEE BRIDGES
  // ==========================================================================

  66: {
    uiid: 66,
    category: 'zigbee_bridge',
    name: 'Zigbee Bridge',
    brand: 'SONOFF',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      isBridge: true,
      supportsLAN: false,
    },
    params: {},
  },

  128: {
    uiid: 128,
    category: 'zigbee_bridge',
    name: 'SPM Main Unit / Zigbee Bridge',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      isBridge: true,
      supportsLAN: false,
    },
    params: {},
  },

  168: {
    uiid: 168,
    category: 'zigbee_bridge',
    name: 'Zigbee Bridge Pro',
    models: ['ZBBridge-P'],
    brand: 'SONOFF',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      isBridge: true,
      supportsLAN: false,
    },
    params: {},
  },

  243: {
    uiid: 243,
    category: 'zigbee_bridge',
    name: 'Zigbee Bridge Ultra',
    brand: 'SONOFF',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      isBridge: true,
      supportsLAN: false,
    },
    params: {},
  },

  // ==========================================================================
  // PROGRAMMABLE SWITCHES
  // ==========================================================================

  174: {
    uiid: 174,
    category: 'programmable_switch',
    name: 'SwitchMan R5',
    models: ['R5'],
    brand: 'SONOFF',
    primaryService: 'StatelessProgrammableSwitch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 6,
      supportsLAN: true,
    },
    params: {},
    notes: '6 channels, outlet 0-5 with key 0=single, 1=double, 2=long press',
  },

  177: {
    uiid: 177,
    category: 'programmable_switch',
    name: 'Switch Mate',
    models: ['S-MATE'],
    brand: 'SONOFF',
    primaryService: 'StatelessProgrammableSwitch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: true,
    },
    params: {},
    notes: 'outlet 0=single, 1=double, 2=long press',
  },

  // ==========================================================================
  // VIRTUAL & GROUP DEVICES
  // ==========================================================================

  265: {
    uiid: 265,
    category: 'virtual',
    name: 'Virtual Device',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
  },

  5000: {
    uiid: 5000,
    category: 'group',
    name: 'Device Group',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
    notes: 'Virtual UIID for device groups',
  },

  // ==========================================================================
  // ZIGBEE DEVICES
  // ==========================================================================

  1000: {
    uiid: 1000,
    category: 'single_switch',
    name: 'Zigbee Switch',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
  },

  1009: {
    uiid: 1009,
    category: 'single_switch',
    name: 'Zigbee Single Switch',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
  },

  1256: {
    uiid: 1256,
    category: 'single_switch',
    name: 'Zigbee Single Switch',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
  },

  1257: {
    uiid: 1257,
    category: 'light',
    name: 'Zigbee White Light',
    primaryService: 'Lightbulb',
    capabilities: {
      lightType: 'dimmable',
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      brightness: { param: 'brightness', min: 0, max: 100 },
    },
  },

  1258: {
    uiid: 1258,
    category: 'light',
    name: 'Zigbee CCT Light',
    primaryService: 'Lightbulb',
    capabilities: {
      lightType: 'cct',
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      brightness: { param: 'brightness', min: 0, max: 100 },
      colorTemp: { param: 'colorTemp', min: 0, max: 100 },
    },
  },

  1514: {
    uiid: 1514,
    category: 'curtain',
    name: 'Zigbee Curtain/Shade',
    models: ['Graywind Zigbee Shades'],
    primaryService: 'WindowCovering',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      position: { current: 'currLocation', target: 'location' },
    },
  },

  1770: {
    uiid: 1770,
    category: 'sensor',
    name: 'Zigbee Temperature Sensor',
    primaryService: 'TemperatureSensor',
    additionalServices: ['HumiditySensor', 'Battery'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      hasTemperature: true,
      hasHumidity: true,
      hasBattery: true,
      isSensor: true,
      supportsLAN: false,
    },
    params: {
      temperature: 'temperature',
      humidity: 'humidity',
    },
  },

  1771: {
    uiid: 1771,
    category: 'sensor',
    name: 'Zigbee Temperature Sensor',
    primaryService: 'TemperatureSensor',
    additionalServices: ['HumiditySensor', 'Battery'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      hasTemperature: true,
      hasHumidity: true,
      hasBattery: true,
      isSensor: true,
      supportsLAN: false,
    },
    params: {
      temperature: 'temperature',
      humidity: 'humidity',
    },
  },

  2026: {
    uiid: 2026,
    category: 'sensor',
    name: 'Zigbee Motion Sensor',
    primaryService: 'MotionSensor',
    additionalServices: ['Battery'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      isSensor: true,
      hasBattery: true,
      supportsLAN: false,
    },
    params: {},
  },

  2256: {
    uiid: 2256,
    category: 'multi_switch',
    name: 'Zigbee 2-Channel Switch',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 2,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
  },

  3026: {
    uiid: 3026,
    category: 'sensor',
    name: 'Zigbee Door/Window Sensor',
    primaryService: 'ContactSensor',
    additionalServices: ['Battery'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      isSensor: true,
      hasBattery: true,
      supportsLAN: false,
    },
    params: {},
  },

  3256: {
    uiid: 3256,
    category: 'multi_switch',
    name: 'Zigbee 3-Channel Switch',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 3,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
  },

  3258: {
    uiid: 3258,
    category: 'light',
    name: 'Zigbee RGB Light',
    primaryService: 'Lightbulb',
    capabilities: {
      lightType: 'rgbcct',
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      brightness: { param: 'brightness', min: 0, max: 100 },
      colorTemp: { param: 'colorTemp', min: 0, max: 100 },
      rgb: { r: 'color.r', g: 'color.g', b: 'color.b' },
    },
  },

  4026: {
    uiid: 4026,
    category: 'sensor',
    name: 'Zigbee Water Sensor',
    primaryService: 'LeakSensor',
    additionalServices: ['Battery'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      isSensor: true,
      hasBattery: true,
      supportsLAN: false,
    },
    params: {},
  },

  4256: {
    uiid: 4256,
    category: 'multi_switch',
    name: 'Zigbee 4-Channel Switch',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 4,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'multi',
      onOffParam: 'switches',
    },
  },

  5026: {
    uiid: 5026,
    category: 'sensor',
    name: 'Zigbee Smoke Sensor',
    primaryService: 'SmokeSensor',
    additionalServices: ['Battery'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      isSensor: true,
      hasBattery: true,
      supportsLAN: false,
    },
    params: {},
  },

  7000: {
    uiid: 7000,
    category: 'programmable_switch',
    name: 'Zigbee Button',
    primaryService: 'StatelessProgrammableSwitch',
    additionalServices: ['Battery'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      hasBattery: true,
      supportsLAN: false,
    },
    params: {},
  },

  7002: {
    uiid: 7002,
    category: 'sensor',
    name: 'Zigbee Human Body Sensor',
    notes: 'Supports OTA',
    primaryService: 'MotionSensor',
    additionalServices: ['Battery'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      isSensor: true,
      hasBattery: true,
      supportsLAN: false,
    },
    params: {},
  },

  7003: {
    uiid: 7003,
    category: 'sensor',
    name: 'Zigbee Door Magnet',
    notes: 'Supports OTA',
    primaryService: 'ContactSensor',
    additionalServices: ['Battery'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      isSensor: true,
      hasBattery: true,
      supportsLAN: false,
    },
    params: {},
  },

  7004: {
    uiid: 7004,
    category: 'single_switch',
    name: 'Zigbee Single-Channel Switch',
    notes: 'Supports OTA',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
  },

  7005: {
    uiid: 7005,
    category: 'single_switch',
    name: 'Zigbee Switch',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
  },

  7006: {
    uiid: 7006,
    category: 'curtain',
    name: 'Zigbee Curtain',
    notes: 'Supports OTA',
    primaryService: 'WindowCovering',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      position: { current: 'currLocation', target: 'location' },
    },
  },

  7010: {
    uiid: 7010,
    category: 'single_switch',
    name: 'Zigbee Micro',
    primaryService: 'Switch',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
  },

  7014: {
    uiid: 7014,
    category: 'sensor',
    name: 'Zigbee Sensor',
    primaryService: 'TemperatureSensor',
    additionalServices: ['HumiditySensor', 'Battery'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      hasTemperature: true,
      hasHumidity: true,
      hasBattery: true,
      isSensor: true,
      supportsLAN: false,
    },
    params: {
      temperature: 'temperature',
      humidity: 'humidity',
    },
  },

  7016: {
    uiid: 7016,
    category: 'sensor',
    name: 'Zigbee Occupancy Sensor',
    primaryService: 'OccupancySensor',
    additionalServices: ['Battery'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      isSensor: true,
      hasBattery: true,
      supportsLAN: false,
    },
    params: {},
  },

  7017: {
    uiid: 7017,
    category: 'thermostat',
    name: 'Zigbee Thermostat',
    primaryService: 'Thermostat',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      hasTemperature: true,
      supportsLAN: false,
    },
    params: {
      temperature: 'temperature',
    },
  },

  7019: {
    uiid: 7019,
    category: 'sensor',
    name: 'Zigbee Water Sensor',
    primaryService: 'LeakSensor',
    additionalServices: ['Battery'],
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      isSensor: true,
      hasBattery: true,
      supportsLAN: false,
    },
    params: {},
  },

  7027: {
    uiid: 7027,
    category: 'single_switch',
    name: 'Zigbee Smart Water Valve',
    primaryService: 'Valve',
    capabilities: {
      powerMonitoring: 'none',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
    },
  },

  7032: {
    uiid: 7032,
    category: 'outlet',
    name: 'Zigbee Power Monitoring Switch',
    primaryService: 'Outlet',
    capabilities: {
      powerMonitoring: 'basic',
      channels: 1,
      supportsLAN: false,
    },
    params: {
      switchStyle: 'single',
      onOffParam: 'switch',
      power: { power: 'power' },
    },
  },
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get device catalog entry by UIID
 */
export function getDeviceByUIID(uiid: number): DeviceCatalogEntry | undefined {
  return DEVICE_CATALOG[uiid];
}

/**
 * Get all devices of a specific category
 */
export function getDevicesByCategory(category: DeviceCategoryType): DeviceCatalogEntry[] {
  return Object.values(DEVICE_CATALOG).filter(device => device.category === category);
}

/**
 * Get all devices with power monitoring
 */
export function getDevicesWithPowerMonitoring(level?: PowerMonitoringType): DeviceCatalogEntry[] {
  return Object.values(DEVICE_CATALOG).filter(device => {
    if (level) {
      return device.capabilities.powerMonitoring === level;
    }
    return device.capabilities.powerMonitoring !== 'none';
  });
}

/**
 * Get all devices of a specific light type
 */
export function getDevicesByLightType(lightType: LightType): DeviceCatalogEntry[] {
  return Object.values(DEVICE_CATALOG).filter(
    device => device.capabilities.lightType === lightType,
  );
}

/**
 * Get all devices that support a specific simulation
 */
export function getDevicesSupportingSimulation(simulation: string): DeviceCatalogEntry[] {
  return Object.values(DEVICE_CATALOG).filter(
    device => device.supportedSimulations?.includes(simulation),
  );
}

/**
 * Get all UIIDs for a specific category
 */
export function getUIIDsForCategory(category: DeviceCategoryType): number[] {
  return Object.values(DEVICE_CATALOG)
    .filter(device => device.category === category)
    .map(device => device.uiid);
}

/**
 * Check if a UIID supports LAN control
 */
export function supportsLANControl(uiid: number): boolean {
  const device = DEVICE_CATALOG[uiid];
  return device?.capabilities.supportsLAN ?? false;
}

/**
 * Get channel count for a UIID
 */
export function getChannelCount(uiid: number): number {
  const device = DEVICE_CATALOG[uiid];
  return device?.capabilities.channels ?? 1;
}

/**
 * Check if a UIID is a bridge device
 */
export function isBridgeDevice(uiid: number): boolean {
  const device = DEVICE_CATALOG[uiid];
  return device?.capabilities.isBridge ?? false;
}

/**
 * Check if a UIID is a sensor device
 */
export function isSensorDevice(uiid: number): boolean {
  const device = DEVICE_CATALOG[uiid];
  return device?.capabilities.isSensor ?? false;
}

// ============================================================================
// SIMULATION TYPES CATALOG
// ============================================================================

/**
 * Supported simulation types (showAs configuration)
 */
export const SIMULATION_TYPES = {
  // Basic simulations (available for most switches)
  outlet: {
    name: 'Outlet',
    service: 'Outlet' as HomeKitServiceType,
    description: 'Show as outlet with optional power monitoring',
  },
  light: {
    name: 'Light',
    service: 'Lightbulb' as HomeKitServiceType,
    description: 'Show as a simple on/off light',
  },
  valve: {
    name: 'Valve',
    service: 'Valve' as HomeKitServiceType,
    description: 'Show as a generic valve',
  },
  tap: {
    name: 'Tap/Faucet',
    service: 'Valve' as HomeKitServiceType,
    description: 'Show as a faucet/tap valve',
  },
  lock: {
    name: 'Lock',
    service: 'LockMechanism' as HomeKitServiceType,
    description: 'Show as a lock mechanism',
  },
  garage: {
    name: 'Garage Door',
    service: 'GarageDoorOpener' as HomeKitServiceType,
    description: 'Show as a garage door opener',
  },
  gate: {
    name: 'Gate',
    service: 'GarageDoorOpener' as HomeKitServiceType,
    description: 'Show as a gate (uses garage door service)',
  },
  sensor: {
    name: 'Occupancy Sensor',
    service: 'OccupancySensor' as HomeKitServiceType,
    description: 'Show as an occupancy sensor',
  },
  sensor_leak: {
    name: 'Leak Sensor',
    service: 'LeakSensor' as HomeKitServiceType,
    description: 'Show as a leak sensor',
  },
  p_button: {
    name: 'Programmable Button',
    service: 'StatelessProgrammableSwitch' as HomeKitServiceType,
    description: 'Show as a stateless programmable switch',
  },
  doorbell: {
    name: 'Doorbell',
    service: 'Doorbell' as HomeKitServiceType,
    description: 'Show as a doorbell',
  },
  purifier: {
    name: 'Air Purifier',
    service: 'AirPurifier' as HomeKitServiceType,
    description: 'Show as an air purifier',
  },
  tv: {
    name: 'Television',
    service: 'Television' as HomeKitServiceType,
    description: 'Show as a TV/receiver',
  },
  fan: {
    name: 'Fan',
    service: 'Fan' as HomeKitServiceType,
    description: 'Show dimmable light as a fan with speed control',
    availableFor: [36, 44, 57], // Dimmable lights only
  },
  blind: {
    name: 'Blind',
    service: 'WindowCovering' as HomeKitServiceType,
    description: 'Show as motorized blind/shade',
  },
  door: {
    name: 'Door',
    service: 'WindowCovering' as HomeKitServiceType,
    description: 'Show as motorized door',
  },
  window: {
    name: 'Window',
    service: 'WindowCovering' as HomeKitServiceType,
    description: 'Show as motorized window',
  },

  // TH sensor specific simulations (UIID 15/181)
  heater: {
    name: 'Heater',
    service: 'HeaterCooler' as HomeKitServiceType,
    description: 'Show TH sensor as heater controller',
    availableFor: [15, 181],
  },
  cooler: {
    name: 'Cooler',
    service: 'HeaterCooler' as HomeKitServiceType,
    description: 'Show TH sensor as cooler controller',
    availableFor: [15, 181],
  },
  humidifier: {
    name: 'Humidifier',
    service: 'HumidifierDehumidifier' as HomeKitServiceType,
    description: 'Show TH sensor as humidifier controller',
    availableFor: [15, 181],
  },
  dehumidifier: {
    name: 'Dehumidifier',
    service: 'HumidifierDehumidifier' as HomeKitServiceType,
    description: 'Show TH sensor as dehumidifier controller',
    availableFor: [15, 181],
  },
  thermostat: {
    name: 'Thermostat',
    service: 'Thermostat' as HomeKitServiceType,
    description: 'Show TH sensor as full thermostat',
    availableFor: [15, 181],
  },
} as const;

export type SimulationType = keyof typeof SIMULATION_TYPES;

// ============================================================================
// DERIVED CONSTANTS (for backward compatibility)
// ============================================================================

/**
 * Derived channel count map from catalog
 * Use getChannelCount() function instead when possible
 */
export const DEVICE_CHANNEL_COUNT_MAP: Record<number, number> = Object.fromEntries(
  Object.entries(DEVICE_CATALOG).map(([uiid, entry]) => [
    Number(uiid),
    entry.capabilities.channels,
  ]),
);

/**
 * UIIDs with basic power monitoring (wattage only)
 */
export const BASIC_POWER_MONITORING_UIIDS: number[] = Object.values(DEVICE_CATALOG)
  .filter(d => d.capabilities.powerMonitoring === 'basic')
  .map(d => d.uiid);

/**
 * UIIDs with full power monitoring (wattage + voltage + current)
 */
export const FULL_POWER_MONITORING_UIIDS: number[] = Object.values(DEVICE_CATALOG)
  .filter(d => d.capabilities.powerMonitoring === 'full')
  .map(d => d.uiid);

/**
 * All UIIDs with any power monitoring
 */
export const ALL_POWER_MONITORING_UIIDS: number[] = Object.values(DEVICE_CATALOG)
  .filter(d => d.capabilities.powerMonitoring !== 'none')
  .map(d => d.uiid);

/**
 * UIIDs that are motion sensors
 */
export const MOTION_SENSOR_UIIDS: number[] = Object.values(DEVICE_CATALOG)
  .filter(d => d.primaryService === 'MotionSensor')
  .map(d => d.uiid);

/**
 * UIIDs that are contact sensors
 */
export const CONTACT_SENSOR_UIIDS: number[] = Object.values(DEVICE_CATALOG)
  .filter(d => d.primaryService === 'ContactSensor')
  .map(d => d.uiid);

/**
 * UIIDs that are leak sensors
 */
export const LEAK_SENSOR_UIIDS: number[] = Object.values(DEVICE_CATALOG)
  .filter(d => d.primaryService === 'LeakSensor')
  .map(d => d.uiid);

// ============================================================================
// ADDITIONAL HELPER FUNCTIONS
// ============================================================================

/** DualR3 device UIIDs (multi-channel with motor/curtain support) */
const DUAL_R3_UIIDS = [126, 165];

/** TH sensor UIIDs (read-only temperature/humidity with relay) */
const TH_SENSOR_UIIDS = [15, 181];

/** Dimmable light UIIDs that support fan simulation */
const DIMMABLE_FAN_UIIDS = [36, 44, 57];

/**
 * Check if UIID has any power monitoring capability
 */
export function hasPowerMonitoring(uiid: number): boolean {
  const device = DEVICE_CATALOG[uiid];
  return device?.capabilities.powerMonitoring !== 'none';
}

/**
 * Check if UIID has full power readings (voltage + current)
 */
export function hasFullPowerReadings(uiid: number): boolean {
  const device = DEVICE_CATALOG[uiid];
  return device?.capabilities.powerMonitoring === 'full';
}

/**
 * Check if UIID is a DualR3 type device (multi-channel with motor support)
 */
export function isDualR3Device(uiid: number): boolean {
  return DUAL_R3_UIIDS.includes(uiid);
}

/**
 * Check if UIID is a TH sensor (read-only temp/humidity with optional relay)
 */
export function isTHSensorDevice(uiid: number): boolean {
  return TH_SENSOR_UIIDS.includes(uiid);
}

/**
 * Check if UIID is a dimmable light that supports fan simulation
 */
export function isDimmableLightForFan(uiid: number): boolean {
  return DIMMABLE_FAN_UIIDS.includes(uiid);
}

/**
 * Check if UIID is a motion sensor
 */
export function isMotionSensor(uiid: number): boolean {
  const device = DEVICE_CATALOG[uiid];
  return device?.primaryService === 'MotionSensor';
}

/**
 * Check if UIID is a contact sensor
 */
export function isContactSensor(uiid: number): boolean {
  const device = DEVICE_CATALOG[uiid];
  return device?.primaryService === 'ContactSensor';
}

/**
 * Check if UIID is a leak sensor
 */
export function isLeakSensor(uiid: number): boolean {
  const device = DEVICE_CATALOG[uiid];
  return device?.primaryService === 'LeakSensor';
}

/**
 * Check if UIID has temperature capability
 */
export function hasTemperature(uiid: number): boolean {
  const device = DEVICE_CATALOG[uiid];
  return device?.capabilities.hasTemperature ?? false;
}

/**
 * Check if UIID has humidity capability
 */
export function hasHumidity(uiid: number): boolean {
  const device = DEVICE_CATALOG[uiid];
  return device?.capabilities.hasHumidity ?? false;
}

/**
 * Check if UIID has battery
 */
export function hasBattery(uiid: number): boolean {
  const device = DEVICE_CATALOG[uiid];
  return device?.capabilities.hasBattery ?? false;
}

/**
 * Get light type for a UIID
 */
export function getLightType(uiid: number): LightType | undefined {
  const device = DEVICE_CATALOG[uiid];
  return device?.capabilities.lightType;
}
