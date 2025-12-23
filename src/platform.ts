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
import {
  DEVICE_CHANNEL_COUNT,
  isTHSensorDevice,
  isDimmableLightForFan,
  isGroupDevice,
} from './constants/device-constants.js';
import { QUERY_RETRY } from './constants/api-constants.js';
import { EWeLinkAPI } from './api/ewelink-api.js';
import { LANControl } from './api/lan-control.js';
import { WSClient } from './api/ws-client.js';
import { EveCharacteristics } from './utils/eve-characteristics.js';
import { BaseAccessory } from './accessories/base.js';

// Core accessory handlers
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
import { SensorAccessory as SimSensorAccessory } from './accessories/simulations/sensor.js';
import { SensorLeakAccessory } from './accessories/simulations/sensor-leak.js';

/** Accessory handler constructor type */
type AccessoryConstructor = new (
  platform: EWeLinkPlatform,
  accessory: PlatformAccessory<AccessoryContext>,
) => BaseAccessory;

/** Simulation handler mapping (showAs → constructor) */
const SIMULATION_HANDLERS: Record<string, AccessoryConstructor> = {
  blind: BlindAccessory,
  door: DoorAccessory,
  window: WindowAccessory,
  garage: GarageAccessory,
  gate: GarageAccessory,
  lock: LockAccessory,
  valve: ValveAccessory,
  switch_valve: ValveAccessory,
  tap: TapAccessory,
  sensor: SimSensorAccessory,
  sensor_leak: SensorLeakAccessory,
  p_button: ProgrammableButtonAccessory,
  doorbell: DoorbellAccessory,
  purifier: PurifierAccessory,
  tv: TVAccessory,
};

/** TH sensor simulation handlers (showAs → constructor, for UIID 15/181) */
const TH_SIMULATION_HANDLERS: Record<string, AccessoryConstructor> = {
  heater: THHeaterAccessory,
  cooler: THCoolerAccessory,
  humidifier: THHumidifierAccessory,
  dehumidifier: THDehumidifierAccessory,
  thermostat: THThermostatAccessory,
};

/** Category to handler mapping */
const CATEGORY_HANDLERS: Partial<Record<DeviceCategory, AccessoryConstructor>> = {
  [DeviceCategory.OUTLET]: OutletAccessory,
  [DeviceCategory.LIGHT]: LightAccessory,
  [DeviceCategory.FAN]: FanAccessory,
  [DeviceCategory.SENSOR]: SensorAccessory,
  [DeviceCategory.CURTAIN]: CurtainAccessory,
  [DeviceCategory.GARAGE]: GarageAccessory,
  [DeviceCategory.AIR_CONDITIONER]: AirConditionerAccessory,
  [DeviceCategory.HUMIDIFIER]: HumidifierAccessory,
  [DeviceCategory.DIFFUSER]: DiffuserAccessory,
  [DeviceCategory.PANEL]: PanelAccessory,
  [DeviceCategory.VIRTUAL]: VirtualAccessory,
  [DeviceCategory.MOTOR]: MotorAccessory,
  [DeviceCategory.GROUP]: GroupAccessory,
  [DeviceCategory.RF_BRIDGE]: RFBridgeAccessory,
};

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
  private readonly accessoryHandlers: Map<string, BaseAccessory> = new Map();

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

      // Get device list and groups
      const { devices, groups } = await this.ewelinkApi.getDevices();
      this.log.info(`Discovered ${devices.length} devices and ${groups.length} groups from eWeLink`);

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
      await this.processGroups(groups);

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

    // Create RF sub-devices if this is an RF Bridge
    if (category === DeviceCategory.RF_BRIDGE) {
      await this.createRFSubDevices(device);
      return; // RF Bridge doesn't need single accessory
    }

    // Create multi-channel sub-devices if this is a multi-switch device
    if (category === DeviceCategory.MULTI_SWITCH) {
      await this.createMultiChannelSubDevices(device, category);
      return; // Multi-switch creates its own sub-accessories
    }
  }

  /**
   * Create RF sub-devices for RF Bridge
   */
  private async createRFSubDevices(bridgeDevice: EWeLinkDevice): Promise<void> {
    // Check if bridge has learned RF devices
    if (!bridgeDevice.tags?.zyx_info || bridgeDevice.tags.zyx_info.length === 0) {
      this.log.debug(`RF Bridge ${bridgeDevice.name} has no learned RF devices`);
      return;
    }

    this.log.info(`Creating RF sub-devices for bridge ${bridgeDevice.name}...`);

    let channelCounter = 0;

    // Process each learned RF device
    for (const rfDevice of bridgeDevice.tags.zyx_info) {
      const swNumber = channelCounter + 1;
      const fullDeviceId = `${bridgeDevice.deviceid}SW${swNumber}`;
      const uuid = this.api.hap.uuid.generate(fullDeviceId);

      // Determine sub-device type based on remote_type
      let subType: string;
      let handler: RFButtonAccessory | RFSensorAccessory | any;
      const remoteType = rfDevice.remote_type;

      // Parse button names from the buttonName array
      // buttonName is an array of objects like [{0: "Button 1"}, {1: "Button 2"}]
      const buttons: Record<string, string> = {};
      if (rfDevice.buttonName && Array.isArray(rfDevice.buttonName)) {
        rfDevice.buttonName.forEach((btnMap) => {
          Object.assign(buttons, btnMap);
        });
      }

      this.log.debug(`RF sub-device ${rfDevice.name}: buttons=${JSON.stringify(buttons)}`);

      // Determine type: 1-4 = button, 5 = curtain, 6-7 = sensor
      if (['1', '2', '3', '4'].includes(remoteType)) {
        subType = 'button';
      } else if (remoteType === '5') {
        // Curtain - check config for simulation type
        const deviceConfig = this.config.bridgeSensors?.find(
          s => s.fullDeviceId === fullDeviceId,
        );
        if (deviceConfig?.curtainType && ['blind', 'door', 'window'].includes(deviceConfig.curtainType)) {
          subType = deviceConfig.curtainType;
        } else {
          subType = 'curtain';
        }
      } else if (['6', '7'].includes(remoteType)) {
        subType = 'sensor';
      } else {
        this.log.warn(`Unknown RF device type ${remoteType} for ${rfDevice.name}, skipping`);
        continue;
      }

      // Create or update accessory
      let subAccessory = this.accessories.get(uuid);

      if (!subAccessory) {
        // Create new sub-accessory
        this.log.info(`Adding RF sub-device: ${rfDevice.name} (type: ${subType})`);

        subAccessory = new this.api.platformAccessory<AccessoryContext>(
          rfDevice.name,
          uuid,
        );

        // Set context
        subAccessory.context.device = bridgeDevice;
        subAccessory.context.deviceId = fullDeviceId;
        subAccessory.context.rfButtonIndex = channelCounter;
        subAccessory.context.buttons = buttons;
        subAccessory.context.subType = subType;
        subAccessory.context.hbDeviceId = fullDeviceId;
        subAccessory.context.name = rfDevice.name;

        // Set accessory info
        const infoService = subAccessory.getService(this.Service.AccessoryInformation);
        if (infoService) {
          infoService
            .setCharacteristic(this.Characteristic.Name, rfDevice.name)
            .setCharacteristic(this.Characteristic.ConfiguredName, rfDevice.name)
            .setCharacteristic(this.Characteristic.Manufacturer, bridgeDevice.brandName || 'eWeLink')
            .setCharacteristic(this.Characteristic.Model, `RF ${subType}`)
            .setCharacteristic(this.Characteristic.SerialNumber, fullDeviceId)
            .setCharacteristic(this.Characteristic.FirmwareRevision, bridgeDevice.params?.fwVersion || '1.0.0');
        }

        // Register accessory
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [subAccessory]);
        this.accessories.set(uuid, subAccessory);
      } else {
        // Update existing
        this.log.info(`Restoring RF sub-device: ${rfDevice.name} (type: ${subType})`);

        // Update display name if it changed
        if (subAccessory.displayName !== rfDevice.name) {
          subAccessory.displayName = rfDevice.name;
          const infoService = subAccessory.getService(this.Service.AccessoryInformation);
          if (infoService) {
            infoService
              .setCharacteristic(this.Characteristic.Name, rfDevice.name)
              .setCharacteristic(this.Characteristic.ConfiguredName, rfDevice.name);
          }
        }

        subAccessory.context.device = bridgeDevice;
        subAccessory.context.deviceId = fullDeviceId;
        subAccessory.context.rfButtonIndex = channelCounter;
        subAccessory.context.buttons = buttons;
        subAccessory.context.subType = subType;
        subAccessory.context.hbDeviceId = fullDeviceId;
        subAccessory.context.name = rfDevice.name;
      }

      // Initialize appropriate handler
      if (subType === 'button' || subType === 'curtain') {
        handler = new RFButtonAccessory(this, subAccessory);
      } else if (subType === 'sensor') {
        handler = new RFSensorAccessory(this, subAccessory);
      } else if (subType === 'blind') {
        const { RFBlindAccessory } = await import('./accessories/simulations/rf-blind.js');
        handler = new RFBlindAccessory(this, subAccessory);
      } else if (subType === 'door') {
        const { RFDoorAccessory } = await import('./accessories/simulations/rf-door.js');
        handler = new RFDoorAccessory(this, subAccessory);
      } else if (subType === 'window') {
        const { RFWindowAccessory } = await import('./accessories/simulations/rf-window.js');
        handler = new RFWindowAccessory(this, subAccessory);
      }

      if (handler) {
        this.accessoryHandlers.set(subAccessory.UUID, handler);
        this.api.updatePlatformAccessories([subAccessory]);
      }

      // Increment channel counter by number of buttons
      channelCounter += Object.keys(buttons).length;
    }

    this.log.info(`Created ${bridgeDevice.tags.zyx_info.length} RF sub-devices for bridge ${bridgeDevice.name}`);
  }

  /**
   * Create sub-accessories for multi-channel devices
   */
  private async createMultiChannelSubDevices(device: EWeLinkDevice, category: DeviceCategory): Promise<void> {
    const uiid = device.extra?.uiid || 0;
    const channelCount = DEVICE_CHANNEL_COUNT[uiid];

    if (!channelCount || channelCount === 1) {
      // Single channel device, no sub-accessories needed
      return;
    }

    this.log.info(`Creating ${channelCount + 1} channels for multi-switch device ${device.name}...`);

    // Get device configuration
    const deviceConfig = this.config.multiDevices?.find(d => d.deviceId === device.deviceid);
    const hideChannels = deviceConfig?.hideChannels?.split(',').map(c => c.trim()) || [];
    const inchChannels = deviceConfig?.inchChannels || false;

    // Remove any leftover single accessory from a previous simulation
    const singleUuid = this.api.hap.uuid.generate(device.deviceid);
    if (this.accessories.has(singleUuid)) {
      const oldAccessory = this.accessories.get(singleUuid)!;
      this.log.info(`Removing old single accessory for ${device.name}`);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [oldAccessory]);
      this.accessories.delete(singleUuid);
      this.accessoryHandlers.delete(oldAccessory.UUID);
    }

    // Create sub-accessories for each channel (0 = master, 1-N = individual channels)
    for (let channel = 0; channel <= channelCount; channel++) {
      const fullDeviceId = `${device.deviceid}SW${channel}`;
      const uuid = this.api.hap.uuid.generate(fullDeviceId);
      const isHidden = hideChannels.includes(`${device.deviceid}SW${channel}`)
        || (channel === 0 && inchChannels);

      let subAccessory = this.accessories.get(uuid);

      // Determine if we need to create or update the accessory
      if (!subAccessory) {
        // Create new sub-accessory
        const displayName = channel === 0
          ? device.name
          : `${device.name} ${channel}`;

        subAccessory = new this.api.platformAccessory<AccessoryContext>(displayName, uuid);

        // Register with Homebridge
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [subAccessory]);
        this.accessories.set(uuid, subAccessory);
      }

      // Update context
      subAccessory.context.device = device;
      subAccessory.context.deviceId = fullDeviceId;
      subAccessory.context.switchNumber = channel;
      subAccessory.context.channelCount = channelCount;
      subAccessory.context.category = category;

      // Add metadata context (following original implementation)
      subAccessory.context.firmware = device.params?.fwVersion;
      subAccessory.context.reachableWAN = !!this.wsClient && device.online;
      subAccessory.context.reachableLAN = !!this.lanControl; // Will be updated when LAN discovers device
      subAccessory.context.eweBrandName = device.brandName;
      subAccessory.context.eweBrandLogo = device.brandLogoUrl;
      subAccessory.context.eweShared = device.sharedTo && device.sharedTo.length > 0 ? device.sharedTo[0] : false;
      subAccessory.context.macAddress = device.extra?.staMac?.replace(/:+/g, '').replace(/..\B/g, '$&:');
      subAccessory.context.lanKey = device.devicekey;

      // Update accessory information
      this.updateAccessoryInfo(subAccessory, device);

      // Initialize handler based on showAs config
      const showAs = deviceConfig?.showAs || 'default';

      if (showAs === 'outlet') {
        // Create outlet handler
        const { OutletAccessory } = await import('./accessories/outlet.js');
        const handler = new OutletAccessory(this, subAccessory);
        this.accessoryHandlers.set(subAccessory.UUID, handler);
      } else {
        // Create switch handler
        const { SwitchAccessory } = await import('./accessories/switch.js');
        const handler = new SwitchAccessory(this, subAccessory);
        this.accessoryHandlers.set(subAccessory.UUID, handler);
      }

      // Update the accessory
      this.api.updatePlatformAccessories([subAccessory]);

      // Mark accessory as hidden if configured
      if (isHidden && channel === 0) {
        this.log.debug(`Channel ${channel} (master) is hidden for ${device.name}`);
      } else if (isHidden) {
        this.log.debug(`Channel ${channel} is hidden for ${device.name}`);
      }
    }

    this.log.info(`Created ${channelCount + 1} channel accessories for ${device.name}`);
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
    const showAs = deviceConfig?.showAs || 'default';
    const uiid = device.extra?.uiid || 0;

    // Create handler based on showAs simulation or device category
    const handler = this.createHandler(accessory, showAs, uiid, category);
    this.accessoryHandlers.set(accessory.UUID, handler);
  }

  /**
   * Create appropriate handler based on showAs simulation or device category
   */
  private createHandler(
    accessory: PlatformAccessory<AccessoryContext>,
    showAs: string,
    uiid: number,
    category: DeviceCategory,
  ): BaseAccessory {
    // 1. Check for simulation handlers (showAs config)
    const SimHandler = SIMULATION_HANDLERS[showAs];
    if (SimHandler) {
      return new SimHandler(this, accessory);
    }

    // 2. Check for TH sensor simulations (UIID 15/181 with showAs)
    if (isTHSensorDevice(uiid)) {
      const THSimHandler = TH_SIMULATION_HANDLERS[showAs];
      if (THSimHandler) {
        return new THSimHandler(this, accessory);
      }
    }

    // 3. Check for special showAs cases
    if (showAs === 'heater') {
      return new HeaterAccessory(this, accessory);
    }
    if (showAs === 'cooler') {
      return new CoolerAccessory(this, accessory);
    }
    if (showAs === 'fan' && isDimmableLightForFan(uiid)) {
      return new LightFanAccessory(this, accessory);
    }

    // 4. Use category-based handler mapping
    const CategoryHandler = CATEGORY_HANDLERS[category];
    if (CategoryHandler) {
      return new CategoryHandler(this, accessory);
    }

    // 5. Handle thermostat category specially (UIID 15/181 = TH sensor, UIID 127 = thermostat)
    if (category === DeviceCategory.THERMOSTAT) {
      return isTHSensorDevice(uiid)
        ? new THSensorAccessory(this, accessory)
        : new ThermostatAccessory(this, accessory);
    }

    // 6. Handle switch category (including special UIIDs and outlet simulation)
    if (uiid === 174) {
      return new SwitchMiniAccessory(this, accessory);
    }
    if (uiid === 177) {
      return new SwitchMateAccessory(this, accessory);
    }
    if (showAs === 'outlet') {
      return new OutletAccessory(this, accessory);
    }

    // Default: regular switch
    return new SwitchAccessory(this, accessory);
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
   * Process device groups from eWeLink cloud
   */
  private async processGroups(groups: any[]): Promise<void> {
    if (!this.ewelinkApi || groups.length === 0) {
      return;
    }

    this.log.info(`Processing ${groups.length} group(s) from eWeLink account`);

    // Process each group and create as a device
    for (const group of groups) {
      // Create a pseudo-device object for the group
      const groupDevice: EWeLinkDevice = {
        ...group,
        extra: { uiid: 5000 }, // Groups use UIID 5000
        deviceid: group.id,
        productModel: 'Group [5000]',
        brandName: 'eWeLink',
        online: true,
        params: group.params || {},
        devicekey: '', // Groups don't have device keys
        apikey: this.ewelinkApi!.getApiKey(),
        name: group.name || `Group ${group.id}`,
        deviceStatus: 'online',
        createdAt: new Date().toISOString(),
      } as EWeLinkDevice;

      // Initialize the group as a regular device
      await this.addAccessory(groupDevice);
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

      // Skip RF sub-devices (check if parent bridge exists)
      if (accessory.context.rfButtonIndex !== undefined) {
        // Extract parent device ID (remove SWx suffix)
        const parentId = deviceId.replace(/SW\d+$/, '');
        if (currentDeviceIds.has(parentId)) {
          continue;
        }
      }

      // Skip multi-channel sub-devices (check if parent device exists)
      if (accessory.context.switchNumber !== undefined) {
        // Extract parent device ID (remove SWx suffix)
        const parentId = deviceId.replace(/SW\d+$/, '');
        if (currentDeviceIds.has(parentId)) {
          continue;
        }
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
    // Check if this is a multi-channel device
    const device = this.deviceCache.get(deviceId);
    if (!device) {
      this.log.debug('Device not found in cache for update:', deviceId);
      return;
    }

    const uiid = device.extra?.uiid || 0;
    const channelCount = DEVICE_CHANNEL_COUNT[uiid];

    // For multi-channel devices, broadcast to all sub-accessories
    if (channelCount && channelCount > 1) {
      // Update all channel sub-accessories (SW0, SW1, SW2, etc.)
      for (let channel = 0; channel <= channelCount; channel++) {
        const subDeviceId = `${deviceId}SW${channel}`;
        const subUuid = this.api.hap.uuid.generate(subDeviceId);
        const subHandler = this.accessoryHandlers.get(subUuid);

        if (subHandler) {
          subHandler.updateState(params);

          // Mark online/offline status
          if (params.online !== undefined && 'markStatus' in subHandler && typeof subHandler.markStatus === 'function') {
            subHandler.markStatus(params.online === true);
          }

          // Update reachability context for sub-accessories
          const subAccessory = this.accessories.get(subUuid);
          if (subAccessory) {
            subAccessory.context.reachableWAN = !!this.wsClient && device.online;
            if (params.updateSource === 'LAN') {
              subAccessory.context.reachableLAN = true;
            }
            this.api.updatePlatformAccessories([subAccessory]);
          }
        }
      }
    } else {
      // Single-channel device or RF Bridge - update directly
      const uuid = this.api.hap.uuid.generate(deviceId);
      const handler = this.accessoryHandlers.get(uuid);

      if (handler) {
        handler.updateState(params);

        // Mark online/offline status
        if (params.online !== undefined && 'markStatus' in handler && typeof handler.markStatus === 'function') {
          handler.markStatus(params.online === true);
        }
      } else {
        this.log.debug('No handler found for device update:', deviceId);
      }
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

    // Groups must use HTTP API with type=2
    if (isGroupDevice(device.extra?.uiid || 0) && this.ewelinkApi) {
      this.log.debug(`Sending group command to ${deviceId} via HTTP API`);
      return await this.ewelinkApi.updateGroup(deviceId, params);
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
   * Get device display name for logging (name or ID if not found)
   */
  public getDeviceDisplayName(deviceId: string): string {
    const device = this.deviceCache.get(deviceId);
    return device?.name || deviceId;
  }

  /**
   * Query device state and update accessory with retry logic
   */
  async queryDeviceState(deviceId: string): Promise<boolean> {
    const displayName = this.getDeviceDisplayName(deviceId);

    if (!this.wsClient || !this.wsClient.isConnected()) {
      this.log.debug(`Cannot query ${displayName}: WebSocket not connected`);
      return false;
    }

    for (let attempt = 1; attempt <= QUERY_RETRY.MAX_ATTEMPTS; attempt++) {
      try {
        await this.wsClient.queryDeviceState(deviceId);
        return true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (attempt < QUERY_RETRY.MAX_ATTEMPTS) {
          this.log.debug(`Query attempt ${attempt}/${QUERY_RETRY.MAX_ATTEMPTS} failed for ${displayName}: ${errorMsg}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, QUERY_RETRY.DELAY_MS));
        } else {
          this.log.warn(`Failed to query device ${displayName} after ${QUERY_RETRY.MAX_ATTEMPTS} attempts: ${errorMsg}`);
        }
      }
    }

    return false;
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
