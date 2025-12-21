import {
  API,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME, DEFAULTS, DEVICE_UIID_MAP, DeviceCategory } from './settings.js';
import { EWeLinkPlatformConfig, EWeLinkDevice, AccessoryContext, DeviceParams } from './types/index.js';
import { EWeLinkAPI } from './api/ewelink-api.js';
import { LANControl } from './api/lan-control.js';
import { WSClient } from './api/ws-client.js';
import { EveCharacteristics } from './utils/eve-characteristics.js';

// Accessory handlers
import { SwitchAccessory } from './accessories/switch.js';
import { SwitchMiniAccessory } from './accessories/switch-mini.js';
import { SwitchMateAccessory } from './accessories/switch-mate.js';
import { OutletAccessory } from './accessories/outlet.js';
import { LightAccessory } from './accessories/light.js';
import { ThermostatAccessory } from './accessories/thermostat.js';
import { THSensorAccessory } from './accessories/th-sensor.js';
import { FanAccessory } from './accessories/fan.js';
import { SensorAccessory } from './accessories/sensor.js';
import { CurtainAccessory } from './accessories/curtain.js';
import { GarageAccessory } from './accessories/garage.js';
import { AirConditionerAccessory } from './accessories/air-conditioner.js';
import { HumidifierAccessory } from './accessories/humidifier.js';
import { DiffuserAccessory } from './accessories/diffuser.js';
import { PanelAccessory } from './accessories/panel.js';
import { VirtualAccessory } from './accessories/virtual.js';
import { MotorAccessory } from './accessories/motor.js';
import { GroupAccessory } from './accessories/group.js';
import { RFBridgeAccessory } from './accessories/rf-bridge.js';
import { RFButtonAccessory } from './accessories/rf-button.js';
import { RFSensorAccessory } from './accessories/rf-sensor.js';

// Simulation accessory handlers
import { LockAccessory } from './accessories/simulations/lock.js';
import { ValveAccessory } from './accessories/simulations/valve.js';
import { TapAccessory } from './accessories/simulations/tap.js';
import { THHeaterAccessory } from './accessories/simulations/th-heater.js';
import { THCoolerAccessory } from './accessories/simulations/th-cooler.js';
import { THHumidifierAccessory } from './accessories/simulations/th-humidifier.js';
import { THDehumidifierAccessory } from './accessories/simulations/th-dehumidifier.js';
import { THThermostatAccessory } from './accessories/simulations/th-thermostat.js';
import { HeaterAccessory } from './accessories/simulations/heater.js';
import { CoolerAccessory } from './accessories/simulations/cooler.js';
import { PurifierAccessory } from './accessories/simulations/purifier.js';
import { BlindAccessory } from './accessories/simulations/blind.js';
import { DoorAccessory } from './accessories/simulations/door.js';
import { WindowAccessory } from './accessories/simulations/window.js';
import { DoorbellAccessory } from './accessories/simulations/doorbell.js';
import { LightFanAccessory } from './accessories/simulations/light-fan.js';
import { TVAccessory } from './accessories/simulations/tv.js';
import { ProgrammableButtonAccessory } from './accessories/simulations/p-button.js';
import { RFBlindAccessory } from './accessories/simulations/rf-blind.js';
import { RFDoorAccessory } from './accessories/simulations/rf-door.js';
import { RFWindowAccessory } from './accessories/simulations/rf-window.js';
import { SensorAccessory as SimSensorAccessory } from './accessories/simulations/sensor.js';
import { SensorLeakAccessory } from './accessories/simulations/sensor-leak.js';
import { SensorVisibleAccessory } from './accessories/simulations/sensor-visible.js';

/**
 * eWeLink Platform Plugin
 */
export class EWeLinkPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly api: API;
  public readonly log: Logging;
  public readonly config: EWeLinkPlatformConfig;

  /** Eve Home custom characteristics */
  public readonly eveCharacteristics: EveCharacteristics;

  /** Cached accessories */
  public readonly accessories: Map<string, PlatformAccessory<AccessoryContext>> = new Map();

  /** Accessory handlers */
  private readonly accessoryHandlers: Map<
    string,
    | SwitchAccessory
    | SwitchMiniAccessory
    | SwitchMateAccessory
    | OutletAccessory
    | LightAccessory
    | ThermostatAccessory
    | THSensorAccessory
    | FanAccessory
    | SensorAccessory
    | CurtainAccessory
    | GarageAccessory
    | AirConditionerAccessory
    | HumidifierAccessory
    | DiffuserAccessory
    | PanelAccessory
    | VirtualAccessory
    | MotorAccessory
    | GroupAccessory
    | RFBridgeAccessory
    | RFButtonAccessory
    | RFSensorAccessory
    | LockAccessory
    | ValveAccessory
    | TapAccessory
    | THHeaterAccessory
    | THCoolerAccessory
    | THHumidifierAccessory
    | THDehumidifierAccessory
    | THThermostatAccessory
    | HeaterAccessory
    | CoolerAccessory
    | PurifierAccessory
    | BlindAccessory
    | DoorAccessory
    | WindowAccessory
    | DoorbellAccessory
    | LightFanAccessory
    | TVAccessory
    | ProgrammableButtonAccessory
    | RFBlindAccessory
    | RFDoorAccessory
    | RFWindowAccessory
    | SimSensorAccessory
    | SensorLeakAccessory
    | SensorVisibleAccessory
  > = new Map();

  /** eWeLink API client */
  public ewelinkApi?: EWeLinkAPI;

  /** LAN control */
  public lanControl?: LANControl;

  /** WebSocket client */
  public wsClient?: WSClient;

  /** Device cache */
  public deviceCache: Map<string, EWeLinkDevice> = new Map();

  /** Initialization complete */
  private initialized = false;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.api = api;
    this.config = this.validateConfig(config as EWeLinkPlatformConfig);
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    // Initialize Eve characteristics
    this.eveCharacteristics = new EveCharacteristics(api);

    // Bind the method to preserve 'this' context
    this.configureAccessory = this.configureAccessory.bind(this);

    this.log.debug('Finished initializing platform:', PLATFORM_NAME);

    // Wait for Homebridge to finish loading cached accessories
    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      this.discoverDevices();
    });

    // Handle shutdown
    this.api.on('shutdown', () => {
      this.log.info('Shutting down eWeLink platform...');
      this.shutdown();
    });
  }

  /**
   * Validate and apply defaults to config
   */
  private validateConfig(config: EWeLinkPlatformConfig): EWeLinkPlatformConfig {
    return {
      ...config,
      mode: config.mode || DEFAULTS.mode,
      hideDevFromHB: config.hideDevFromHB ?? DEFAULTS.hideDevFromHB,
      hideMasters: config.hideMasters ?? DEFAULTS.hideMasters,
      hideFromHB: config.hideFromHB ?? DEFAULTS.hideFromHB,
      outlineInLog: config.outlineInLog ?? DEFAULTS.outlineInLog,
      debug: config.debug ?? DEFAULTS.debug,
      debugFakegato: config.debugFakegato ?? DEFAULTS.debugFakegato,
      disableDeviceLogging: config.disableDeviceLogging ?? DEFAULTS.disableDeviceLogging,
      offlineAsOff: config.offlineAsOff ?? DEFAULTS.offlineAsOff,
      singleDevices: config.singleDevices || [],
      multiDevices: config.multiDevices || [],
      thDevices: config.thDevices || [],
      fanDevices: config.fanDevices || [],
      lightDevices: config.lightDevices || [],
      sensorDevices: config.sensorDevices || [],
      rfDevices: config.rfDevices || [],
      bridgeSensors: config.bridgeSensors || [],
      groups: config.groups || [],
      ignoredDevices: config.ignoredDevices || [],
    };
  }

  /**
   * Called by Homebridge for each cached accessory
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory as PlatformAccessory<AccessoryContext>);
  }

  /**
   * Discover eWeLink devices
   */
  async discoverDevices(): Promise<void> {
    this.log.info('=== DISCOVER DEVICES START ===');
    try {
      // Validate credentials
      this.log.debug(`Config username: ${this.config.username ? 'SET' : 'NOT SET'}`);
      this.log.debug(`Config password: ${this.config.password ? 'SET' : 'NOT SET'}`);

      if (!this.config.username || !this.config.password) {
        this.log.warn('eWeLink credentials not configured. Please configure the plugin.');
        return;
      }

      // Initialize API
      this.log.info('Initializing eWeLink API...');
      this.ewelinkApi = new EWeLinkAPI(this);

      this.log.info('Attempting login...');
      await this.ewelinkApi.login();

      // Get device list
      const devices = await this.ewelinkApi.getDevices();
      this.log.info(`Discovered ${devices.length} devices from eWeLink`);

      // Cache devices
      for (const device of devices) {
        this.deviceCache.set(device.deviceid, device);
      }

      // Initialize LAN control if not WAN-only mode
      if (this.config.mode !== 'wan') {
        this.lanControl = new LANControl(this);
        await this.lanControl.start();
      }

      // Initialize WebSocket client if not LAN-only mode
      if (this.config.mode !== 'lan') {
        this.wsClient = new WSClient(this);
        await this.wsClient.connect();
      }

      // Register/update accessories
      for (const device of devices) {
        await this.addAccessory(device);
      }

      // Process device groups
      await this.processGroups();

      // Remove stale accessories
      this.removeStaleAccessories(devices);

      this.initialized = true;
      this.log.info('eWeLink platform initialization complete');

    } catch (error) {
      this.log.error('Failed to discover devices:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Add or update an accessory
   */
  async addAccessory(device: EWeLinkDevice): Promise<void> {
    // Check if device should be ignored
    if (this.isDeviceIgnored(device.deviceid)) {
      this.log.debug('Device is ignored:', device.name);
      return;
    }

    const uuid = this.api.hap.uuid.generate(device.deviceid);
    const existingAccessory = this.accessories.get(uuid);

    // Determine device category
    const uiid = device.extra?.uiid || 0;
    let category = DEVICE_UIID_MAP[uiid] || DeviceCategory.UNKNOWN;

    // Special handling for UIID 126 - can be multi-switch OR curtain depending on params
    // If device has curtain-specific params (currLocation, setclose), treat as curtain
    if (uiid === 126 && device.params) {
      const hasCurtainParams = device.params.currLocation !== undefined ||
                               device.params.setclose !== undefined ||
                               device.params.location !== undefined;
      if (hasCurtainParams) {
        category = DeviceCategory.CURTAIN;
        this.log.debug(`UIID 126 device "${device.name}" has curtain params, treating as curtain`);
      }
    }

    // Log device UIID for debugging
    this.log.debug(`Device "${device.name}" [${device.deviceid}] - UIID: ${uiid}, Category: ${category}`);

    if (existingAccessory) {
      // Update existing accessory
      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

      // Check if category changed - if so, remove old services
      const oldCategory = existingAccessory.context.category;
      if (oldCategory && oldCategory !== category) {
        this.log.warn(`Category changed for ${device.name}: ${oldCategory} → ${category}. Removing old services.`);
        // Remove all services except AccessoryInformation
        existingAccessory.services
          .filter(service => service.UUID !== this.api.hap.Service.AccessoryInformation.UUID)
          .forEach(service => existingAccessory.removeService(service));
      }

      existingAccessory.context.device = device;
      existingAccessory.context.deviceId = device.deviceid;
      existingAccessory.context.category = category;

      // Update accessory info
      this.updateAccessoryInfo(existingAccessory, device);

      // Initialize handler
      this.initializeAccessoryHandler(existingAccessory, device, category);

    } else {
      // Create new accessory
      this.log.info('Adding new accessory:', device.name);

      const accessory = new this.api.platformAccessory<AccessoryContext>(
        device.name,
        uuid,
      );

      accessory.context.device = device;
      accessory.context.deviceId = device.deviceid;
      accessory.context.category = category;

      // Set accessory info
      this.updateAccessoryInfo(accessory, device);

      // Initialize handler
      this.initializeAccessoryHandler(accessory, device, category);

      // Register accessory
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.set(uuid, accessory);
    }
  }

  /**
   * Update accessory information service
   */
  private updateAccessoryInfo(accessory: PlatformAccessory<AccessoryContext>, device: EWeLinkDevice): void {
    const infoService = accessory.getService(this.Service.AccessoryInformation);
    if (infoService) {
      infoService
        .setCharacteristic(this.Characteristic.Manufacturer, device.brandName || 'eWeLink')
        .setCharacteristic(this.Characteristic.Model, device.productModel || device.extra?.model || 'Unknown')
        .setCharacteristic(this.Characteristic.SerialNumber, device.deviceid)
        .setCharacteristic(this.Characteristic.FirmwareRevision, device.params?.fwVersion || '1.0.0');
    }
  }

  /**
   * Initialize the appropriate handler for an accessory
   */
  private initializeAccessoryHandler(
    accessory: PlatformAccessory<AccessoryContext>,
    device: EWeLinkDevice,
    category: DeviceCategory,
  ): void {
    // Remove existing handler if any
    this.accessoryHandlers.delete(accessory.UUID);

    // Get device-specific config
    const deviceConfig = this.getDeviceConfig(device.deviceid, category);

    // Determine what to show as
    const showAs = deviceConfig?.showAs || 'default';
    const uiid = device.extra?.uiid || 0;

    // Create appropriate handler based on category and showAs
    let handler:
      | SwitchAccessory
      | SwitchMiniAccessory
      | SwitchMateAccessory
      | OutletAccessory
      | LightAccessory
      | ThermostatAccessory
      | FanAccessory
      | SensorAccessory
      | CurtainAccessory
      | GarageAccessory
      | AirConditionerAccessory
      | HumidifierAccessory
      | DiffuserAccessory
      | PanelAccessory
      | VirtualAccessory
      | MotorAccessory
      | GroupAccessory
      | LockAccessory
      | ValveAccessory
      | TapAccessory
      | THHeaterAccessory
      | THCoolerAccessory
      | THHumidifierAccessory
      | THDehumidifierAccessory
      | THThermostatAccessory
      | HeaterAccessory
      | CoolerAccessory
      | PurifierAccessory
      | BlindAccessory
      | DoorAccessory
      | WindowAccessory
      | DoorbellAccessory
      | LightFanAccessory
      | TVAccessory
      | ProgrammableButtonAccessory
      | SimSensorAccessory
      | SensorLeakAccessory
      | SensorVisibleAccessory;

    // Check for simulation accessories first (based on showAs config)
    if (showAs === 'blind') {
      handler = new BlindAccessory(this, accessory);
    } else if (showAs === 'door') {
      handler = new DoorAccessory(this, accessory);
    } else if (showAs === 'window') {
      handler = new WindowAccessory(this, accessory);
    } else if (showAs === 'garage' || showAs === 'gate') {
      handler = new GarageAccessory(this, accessory);
    } else if (showAs === 'lock') {
      handler = new LockAccessory(this, accessory);
    } else if (showAs === 'valve' || showAs === 'switch_valve') {
      handler = new ValveAccessory(this, accessory);
    } else if (showAs === 'tap') {
      handler = new TapAccessory(this, accessory);
    } else if (showAs === 'sensor') {
      handler = new SimSensorAccessory(this, accessory);
    } else if (showAs === 'sensor_leak') {
      handler = new SensorLeakAccessory(this, accessory);
    } else if (showAs === 'p_button') {
      handler = new ProgrammableButtonAccessory(this, accessory);
    } else if (showAs === 'doorbell') {
      handler = new DoorbellAccessory(this, accessory);
    } else if (showAs === 'purifier') {
      handler = new PurifierAccessory(this, accessory);
    } else if (showAs === 'heater' && [15, 181].includes(uiid)) {
      // TH sensor with heater simulation
      handler = new THHeaterAccessory(this, accessory);
    } else if (showAs === 'cooler' && [15, 181].includes(uiid)) {
      // TH sensor with cooler simulation
      handler = new THCoolerAccessory(this, accessory);
    } else if (showAs === 'humidifier' && [15, 181].includes(uiid)) {
      // TH sensor with humidifier simulation
      handler = new THHumidifierAccessory(this, accessory);
    } else if (showAs === 'dehumidifier' && [15, 181].includes(uiid)) {
      // TH sensor with dehumidifier simulation
      handler = new THDehumidifierAccessory(this, accessory);
    } else if (showAs === 'thermostat' && [15, 181].includes(uiid)) {
      // TH sensor with thermostat simulation
      handler = new THThermostatAccessory(this, accessory);
    } else if (showAs === 'heater') {
      // Switch with heater simulation (climate control from external temp source)
      handler = new HeaterAccessory(this, accessory);
    } else if (showAs === 'cooler') {
      // Switch with cooler simulation (climate control from external temp source)
      handler = new CoolerAccessory(this, accessory);
    } else if (showAs === 'fan' && [36, 44, 57].includes(uiid)) {
      // Dimmable light as fan
      handler = new LightFanAccessory(this, accessory);
    } else if (showAs === 'tv') {
      handler = new TVAccessory(this, accessory);
    } else {
      // No simulation requested, use default routing
      switch (category) {
        case DeviceCategory.OUTLET:
          handler = new OutletAccessory(this, accessory);
          break;

        case DeviceCategory.LIGHT:
          handler = new LightAccessory(this, accessory);
          break;

        case DeviceCategory.THERMOSTAT:
        // UIID 15 is TH sensor (temp/humidity only), UIID 127 is actual thermostat with heating control
          if (device.extra?.uiid === 15) {
            handler = new THSensorAccessory(this, accessory) as any;
          } else {
            handler = new ThermostatAccessory(this, accessory);
          }
          break;

        case DeviceCategory.FAN:
          handler = new FanAccessory(this, accessory);
          break;

        case DeviceCategory.SENSOR:
          handler = new SensorAccessory(this, accessory);
          break;

        case DeviceCategory.CURTAIN:
          handler = new CurtainAccessory(this, accessory);
          break;

        case DeviceCategory.GARAGE:
          handler = new GarageAccessory(this, accessory);
          break;

        case DeviceCategory.AIR_CONDITIONER:
          handler = new AirConditionerAccessory(this, accessory);
          break;

        case DeviceCategory.HUMIDIFIER:
          handler = new HumidifierAccessory(this, accessory);
          break;

        case DeviceCategory.DIFFUSER:
          handler = new DiffuserAccessory(this, accessory);
          break;

        case DeviceCategory.PANEL:
          handler = new PanelAccessory(this, accessory);
          break;

        case DeviceCategory.VIRTUAL:
          handler = new VirtualAccessory(this, accessory);
          break;

        case DeviceCategory.MOTOR:
          handler = new MotorAccessory(this, accessory);
          break;

        case DeviceCategory.GROUP:
          handler = new GroupAccessory(this, accessory);
          break;

        case DeviceCategory.RF_BRIDGE:
        // RF Bridge acts as coordinator for RF sub-devices
          handler = new RFBridgeAccessory(this, accessory) as any;
          break;

        case DeviceCategory.SINGLE_SWITCH:
        case DeviceCategory.MULTI_SWITCH:
        default:
          // Check for SONOFF Mini (UIID 174) - 6-channel programmable switch
          if (uiid === 174) {
            handler = new SwitchMiniAccessory(this, accessory) as any;
          } else if (uiid === 177) {
            // SONOFF Mate (UIID 177) - 3-button programmable switch
            handler = new SwitchMateAccessory(this, accessory) as any;
          } else if (showAs === 'outlet') {
            // Regular outlet
            handler = new OutletAccessory(this, accessory);
          } else {
            // Regular switch
            handler = new SwitchAccessory(this, accessory);
          }
          break;
      }
    }

    this.accessoryHandlers.set(accessory.UUID, handler);
  }

  /**
   * Get device-specific configuration
   */
  private getDeviceConfig(deviceId: string, category: DeviceCategory): any {
    switch (category) {
      case DeviceCategory.SINGLE_SWITCH:
        return this.config.singleDevices?.find(d => d.deviceId === deviceId);
      case DeviceCategory.MULTI_SWITCH:
        return this.config.multiDevices?.find(d => d.deviceId === deviceId);
      case DeviceCategory.THERMOSTAT:
        return this.config.thDevices?.find(d => d.deviceId === deviceId);
      case DeviceCategory.FAN:
        return this.config.fanDevices?.find(d => d.deviceId === deviceId);
      case DeviceCategory.LIGHT:
        return this.config.lightDevices?.find(d => d.deviceId === deviceId);
      case DeviceCategory.SENSOR:
        return this.config.sensorDevices?.find(d => d.deviceId === deviceId);
      case DeviceCategory.RF_BRIDGE:
        return this.config.rfDevices?.find(d => d.deviceId === deviceId);
      default:
        return undefined;
    }
  }

  /**
   * Process device groups
   */
  private async processGroups(): Promise<void> {
    if (!this.config.groups || this.config.groups.length === 0) {
      return;
    }

    for (const group of this.config.groups) {
      this.log.debug('Processing group:', group.label || group.type);
      // Group processing logic would go here
      // This creates virtual accessories that control multiple devices
    }
  }

  /**
   * Check if a device should be ignored
   */
  private isDeviceIgnored(deviceId: string): boolean {
    return this.config.ignoredDevices?.includes(deviceId) ?? false;
  }

  /**
   * Remove accessories that are no longer in the device list
   */
  private removeStaleAccessories(currentDevices: EWeLinkDevice[]): void {
    const currentDeviceIds = new Set(currentDevices.map(d => d.deviceid));

    for (const [uuid, accessory] of this.accessories) {
      const deviceId = accessory.context.deviceId;

      // Skip group devices
      if (accessory.context.isGroup) {
        continue;
      }

      if (!currentDeviceIds.has(deviceId)) {
        this.log.info('Removing stale accessory:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.delete(uuid);
        this.accessoryHandlers.delete(uuid);
      }
    }
  }

  /**
   * Handle device state updates
   */
  public handleDeviceUpdate(deviceId: string, params: DeviceParams): void {
    const uuid = this.api.hap.uuid.generate(deviceId);
    const handler = this.accessoryHandlers.get(uuid);

    if (handler) {
      handler.updateState(params);
    } else {
      this.log.debug('No handler found for device update:', deviceId);
    }
  }

  /**
   * Send command to device
   */
  public async sendDeviceCommand(deviceId: string, params: DeviceParams): Promise<boolean> {
    const device = this.deviceCache.get(deviceId);
    if (!device) {
      this.log.error('Device not found in cache:', deviceId);
      return false;
    }

    // Try LAN control first (if available and device supports it)
    if (this.lanControl && this.config.mode !== 'wan') {
      const lanSuccess = await this.lanControl.sendCommand(deviceId, params);
      if (lanSuccess) {
        return true;
      }
    }

    // Fall back to WebSocket/cloud control
    if (this.wsClient && this.config.mode !== 'lan') {
      return await this.wsClient.sendCommand(deviceId, params);
    }

    this.log.error('No available control method for device:', deviceId);
    return false;
  }

  /**
   * Query device state and update accessory
   */
  async queryDeviceState(deviceId: string): Promise<boolean> {
    if (!this.wsClient || !this.wsClient.isConnected()) {
      this.log.debug(`Cannot query ${deviceId}: WebSocket not connected`);
      return false;
    }

    try {
      await this.wsClient.queryDeviceState(deviceId);
      return true;
    } catch (error) {
      this.log.warn(`Failed to query device ${deviceId}:`, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Shutdown the platform
   */
  private shutdown(): void {
    if (this.wsClient) {
      this.wsClient.disconnect();
    }
    if (this.lanControl) {
      this.lanControl.stop();
    }
  }

  /**
   * Log with optional outline
   */
  public logMessage(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
    if (this.config.outlineInLog) {
      const divider = '═'.repeat(60);
      this.log[level](`╔${divider}╗`);
      this.log[level](`║ ${message}`, ...args);
      this.log[level](`╚${divider}╝`);
    } else {
      this.log[level](message, ...args);
    }
  }
}
