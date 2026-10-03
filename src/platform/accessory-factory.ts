import type { PlatformAccessory } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME, DEVICE_UIID_MAP, DeviceCategory } from '../settings.js';
import type { EWeLinkDevice, AccessoryContext } from '../types/index.js';
import type { EWeLinkPlatform } from '../platform.js';
import { isRFButtonType, isRFSensorType, isRFCurtainType } from '../constants/device-constants.js';
import {
  isTHSensorDevice,
  isDimmableLightForFan,
  isProgrammableSwitch,
  isWaterValveDevice,
  getChannelCount,
  hasCurtainParams,
} from '../constants/device-catalog.js';
import { sanitizeHomeKitName } from '../utils/name-utils.js';
import type { BaseAccessory } from '../accessories/base.js';
import type { DeviceRegistry } from './device-registry.js';
import { getDeviceConfig, isDeviceIgnored } from './device-config.js';

// Core accessory handlers
import { SwitchAccessory } from '../accessories/switch.js';
import { SwitchMiniAccessory } from '../accessories/switch-mini.js';
import { SwitchMateAccessory } from '../accessories/switch-mate.js';
import { OutletAccessory } from '../accessories/outlet.js';
import { LightAccessory } from '../accessories/light.js';
import { ThermostatAccessory } from '../accessories/thermostat.js';
import { THSensorAccessory } from '../accessories/th-sensor.js';
import { FanAccessory } from '../accessories/fan.js';
import { SensorAccessory } from '../accessories/sensor.js';
import { CurtainAccessory } from '../accessories/curtain.js';
import { GarageAccessory } from '../accessories/garage.js';
import { AirConditionerAccessory } from '../accessories/air-conditioner.js';
import { HumidifierAccessory } from '../accessories/humidifier.js';
import { DiffuserAccessory } from '../accessories/diffuser.js';
import { PanelAccessory } from '../accessories/panel.js';
import { VirtualAccessory } from '../accessories/virtual.js';
import { MotorAccessory } from '../accessories/motor.js';
import { GroupAccessory } from '../accessories/group.js';
import { RFBridgeAccessory } from '../accessories/rf-bridge.js';
import { RFButtonAccessory } from '../accessories/rf-button.js';
import { RFSensorAccessory } from '../accessories/rf-sensor.js';

// Simulation accessory handlers
import { LockAccessory } from '../accessories/simulations/lock.js';
import { ValveAccessory } from '../accessories/simulations/valve.js';
import { TapAccessory } from '../accessories/simulations/tap.js';
import { THHeaterAccessory } from '../accessories/simulations/th-heater.js';
import { THCoolerAccessory } from '../accessories/simulations/th-cooler.js';
import { THHumidifierAccessory } from '../accessories/simulations/th-humidifier.js';
import { THDehumidifierAccessory } from '../accessories/simulations/th-dehumidifier.js';
import { THThermostatAccessory } from '../accessories/simulations/th-thermostat.js';
import { HeaterAccessory } from '../accessories/simulations/heater.js';
import { CoolerAccessory } from '../accessories/simulations/cooler.js';
import { PurifierAccessory } from '../accessories/simulations/purifier.js';
import { BlindAccessory } from '../accessories/simulations/blind.js';
import { DoorAccessory } from '../accessories/simulations/door.js';
import { WindowAccessory } from '../accessories/simulations/window.js';
import { DoorbellAccessory } from '../accessories/simulations/doorbell.js';
import { LightFanAccessory } from '../accessories/simulations/light-fan.js';
import { TVAccessory } from '../accessories/simulations/tv.js';
import { ProgrammableButtonAccessory } from '../accessories/simulations/p-button.js';
import { SensorAccessory as SimSensorAccessory } from '../accessories/simulations/sensor.js';
import { SensorLeakAccessory } from '../accessories/simulations/sensor-leak.js';
import { RFBlindAccessory } from '../accessories/simulations/rf-blind.js';
import { RFDoorAccessory } from '../accessories/simulations/rf-door.js';
import { RFWindowAccessory } from '../accessories/simulations/rf-window.js';

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

/** RF sub-device handlers (subType → constructor) */
const RF_SUB_HANDLERS: Record<string, AccessoryConstructor> = {
  button: RFButtonAccessory,
  curtain: RFButtonAccessory,
  sensor: RFSensorAccessory,
  blind: RFBlindAccessory,
  door: RFDoorAccessory,
  window: RFWindowAccessory,
};

/**
 * Resolve the category of a device from its UIID (and params for UIID 126)
 */
export function resolveCategory(device: EWeLinkDevice): DeviceCategory {
  const uiid = device.extra?.uiid || 0;
  // UIID 126 can be multi-switch OR curtain: curtain params (currLocation, setclose, location) win
  if (uiid === 126 && hasCurtainParams(device.params)) {
    return DeviceCategory.CURTAIN;
  }
  return DEVICE_UIID_MAP[uiid] || DeviceCategory.UNKNOWN;
}

/**
 * Creates/updates Homebridge accessories and their handlers
 */
export class AccessoryFactory {
  /**
   * Identity (constructor + config-relevant inputs) each installed handler was built from,
   * used to keep a live handler when it would be rebuilt identically
   */
  private readonly handlerIdentities = new WeakMap<BaseAccessory, string>();

  constructor(
    private readonly platform: EWeLinkPlatform,
    private readonly registry: DeviceRegistry,
  ) {}

  private get api() {
    return this.platform.api;
  }

  private get log() {
    return this.platform.log;
  }

  /**
   * Add or update an accessory
   */
  async addAccessory(device: EWeLinkDevice): Promise<void> {
    if (isDeviceIgnored(this.platform.config, device.deviceid)) {
      this.log.debug('Device is ignored:', device.name);
      return;
    }

    const uuid = this.registry.uuidFor(device.deviceid);
    const existingAccessory = this.registry.accessories.get(uuid);
    const uiid = device.extra?.uiid || 0;
    const category = resolveCategory(device);
    if (uiid === 126 && category === DeviceCategory.CURTAIN) {
      this.log.debug(`UIID 126 device "${device.name}" has curtain params, treating as curtain`);
    }

    this.log.debug(`Device "${device.name}" [${device.deviceid}] - UIID: ${uiid}, Category: ${category}`);

    // RF/Zigbee bridges are not exposed to HomeKit themselves, only their sub-devices.
    // They still need a handler for event routing.
    if (category === DeviceCategory.RF_BRIDGE) {
      if (existingAccessory) {
        this.log.info(`Removing bridge device from HomeKit (not user-facing): ${device.name}`);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        this.registry.accessories.delete(uuid);
      }
      this.createBridgeHandler(device);
      await this.createRFSubDevices(device);
      return;
    }

    // Multi-switch devices are exposed as one accessory per channel, unless a single-accessory
    // simulation (e.g. a DUALR3 shown as a blind) is configured
    if (category === DeviceCategory.MULTI_SWITCH) {
      if (this.exposesChannels(device, category)) {
        await this.createMultiChannelSubDevices(device, category);
        return;
      }
      this.removeChannelAccessories(device);
    }

    if (existingAccessory) {
      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

      // Category changed - remove all services except AccessoryInformation
      const oldCategory = existingAccessory.context.category;
      if (oldCategory && oldCategory !== category) {
        this.log.warn(`Category changed for ${device.name}: ${oldCategory} → ${category}. Removing old services.`);
        existingAccessory.services
          .filter(service => service.UUID !== this.api.hap.Service.AccessoryInformation.UUID)
          .forEach(service => existingAccessory.removeService(service));
      }

      existingAccessory.context.device = device;
      existingAccessory.context.deviceId = device.deviceid;
      existingAccessory.context.category = category;
      this.updateAccessoryInfo(existingAccessory, device);
      this.initializeAccessoryHandler(existingAccessory, device, category);
    } else {
      this.log.info('Adding new accessory:', device.name);

      const accessory = new this.api.platformAccessory<AccessoryContext>(sanitizeHomeKitName(device.name), uuid);
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceid;
      accessory.context.category = category;
      this.updateAccessoryInfo(accessory, device);
      this.initializeAccessoryHandler(accessory, device, category);

      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.registry.accessories.set(uuid, accessory);
    }
  }

  /**
   * Whether a multi-switch device is exposed as per-channel accessories (default/outlet)
   * rather than as a single simulated accessory (blind, garage, lock, ...)
   */
  private exposesChannels(device: EWeLinkDevice, category: DeviceCategory): boolean {
    const showAs = getDeviceConfig(this.platform.config, device.deviceid, category)?.showAs;
    return !showAs || !(showAs in SIMULATION_HANDLERS);
  }

  /**
   * Remove leftover channel sub-accessories (e.g. after switching a multi-switch device to a simulation)
   */
  private removeChannelAccessories(device: EWeLinkDevice): void {
    const channelCount = getChannelCount(device.extra?.uiid || 0);
    const stale = this.registry.channelUuids(device.deviceid, channelCount)
      .map(uuid => this.registry.accessories.get(uuid))
      .filter((accessory): accessory is PlatformAccessory<AccessoryContext> => !!accessory);
    if (stale.length === 0) {
      return;
    }

    this.log.info(`Removing ${stale.length} channel accessories for ${device.name}`);
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
    for (const accessory of stale) {
      this.registry.accessories.delete(accessory.UUID);
      this.registry.removeHandler(accessory.UUID);
    }
  }

  /**
   * Create the (unregistered) RF bridge accessory and handler used to route RF events
   */
  private createBridgeHandler(device: EWeLinkDevice): void {
    const uuid = this.registry.uuidFor(device.deviceid);
    const bridgeAccessory = new this.api.platformAccessory<AccessoryContext>(device.name, uuid);
    bridgeAccessory.context.device = device;
    bridgeAccessory.context.deviceId = device.deviceid;
    bridgeAccessory.context.category = DeviceCategory.RF_BRIDGE;
    this.registry.setHandler(uuid, new RFBridgeAccessory(this.platform, bridgeAccessory));
  }

  /**
   * Determine the sub-device type of a learned RF device (undefined if unsupported)
   */
  private getRFSubType(remoteType: string, fullDeviceId: string): string | undefined {
    if (isRFButtonType(remoteType)) {
      return 'button';
    }
    if (isRFCurtainType(remoteType)) {
      // Curtain - check config for simulation type
      const deviceConfig = this.platform.config.bridgeSensors?.find(s => s.fullDeviceId === fullDeviceId);
      if (deviceConfig?.curtainType && ['blind', 'door', 'window'].includes(deviceConfig.curtainType)) {
        return deviceConfig.curtainType;
      }
      return 'curtain';
    }
    if (isRFSensorType(remoteType)) {
      return 'sensor';
    }
    return undefined;
  }

  /**
   * Create RF sub-devices for an RF Bridge
   */
  private async createRFSubDevices(bridgeDevice: EWeLinkDevice): Promise<void> {
    if (!bridgeDevice.tags?.zyx_info || bridgeDevice.tags.zyx_info.length === 0) {
      this.log.debug(`RF Bridge ${bridgeDevice.name} has no learned RF devices`);
      return;
    }

    const { Service, Characteristic } = this.platform;
    this.log.info(`Creating RF sub-devices for bridge ${bridgeDevice.name}...`);

    let channelCounter = 0;
    for (const rfDevice of bridgeDevice.tags.zyx_info) {
      const fullDeviceId = `${bridgeDevice.deviceid}SW${channelCounter + 1}`;
      const uuid = this.registry.uuidFor(fullDeviceId);

      // buttonName is an array of objects like [{0: "Button 1"}, {1: "Button 2"}]
      const buttons: Record<string, string> = {};
      if (rfDevice.buttonName && Array.isArray(rfDevice.buttonName)) {
        rfDevice.buttonName.forEach((btnMap) => {
          Object.assign(buttons, btnMap);
        });
      }
      this.log.debug(`RF sub-device ${rfDevice.name}: buttons=${JSON.stringify(buttons)}`);

      const subType = this.getRFSubType(rfDevice.remote_type, fullDeviceId);
      if (!subType) {
        this.log.warn(`Unknown RF device type ${rfDevice.remote_type} for ${rfDevice.name}, skipping`);
        continue;
      }

      let subAccessory = this.registry.accessories.get(uuid);
      const safeRfName = sanitizeHomeKitName(rfDevice.name);

      if (!subAccessory) {
        this.log.info(`Adding RF sub-device: ${rfDevice.name} (type: ${subType})`);
        subAccessory = new this.api.platformAccessory<AccessoryContext>(safeRfName, uuid);
        this.setRFContext(subAccessory, bridgeDevice, fullDeviceId, channelCounter, buttons, subType, rfDevice.name);

        const infoService = subAccessory.getService(Service.AccessoryInformation);
        if (infoService) {
          infoService
            .setCharacteristic(Characteristic.Name, safeRfName)
            .setCharacteristic(Characteristic.ConfiguredName, safeRfName)
            .setCharacteristic(Characteristic.Manufacturer, bridgeDevice.brandName || 'eWeLink')
            .setCharacteristic(Characteristic.Model, `RF ${subType}`)
            .setCharacteristic(Characteristic.SerialNumber, fullDeviceId)
            .setCharacteristic(Characteristic.FirmwareRevision, bridgeDevice.params?.fwVersion || '1.0.0');
        }

        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [subAccessory]);
        this.registry.accessories.set(uuid, subAccessory);
      } else {
        this.log.info(`Restoring RF sub-device: ${rfDevice.name} (type: ${subType})`);

        if (subAccessory.displayName !== safeRfName) {
          subAccessory.displayName = safeRfName;
          const infoService = subAccessory.getService(Service.AccessoryInformation);
          if (infoService) {
            infoService
              .setCharacteristic(Characteristic.Name, safeRfName)
              .setCharacteristic(Characteristic.ConfiguredName, safeRfName);
          }
        }
        this.setRFContext(subAccessory, bridgeDevice, fullDeviceId, channelCounter, buttons, subType, rfDevice.name);
      }

      if (this.initializeRFHandler(subAccessory)) {
        this.api.updatePlatformAccessories([subAccessory]);
      }

      // Increment channel counter by number of buttons
      channelCounter += Object.keys(buttons).length;
    }

    this.log.info(`Created ${bridgeDevice.tags.zyx_info.length} RF sub-devices for bridge ${bridgeDevice.name}`);
  }

  private setRFContext(
    accessory: PlatformAccessory<AccessoryContext>,
    bridgeDevice: EWeLinkDevice,
    fullDeviceId: string,
    rfButtonIndex: number,
    buttons: Record<string, string>,
    subType: string,
    name: string,
  ): void {
    accessory.context.device = bridgeDevice;
    accessory.context.deviceId = fullDeviceId;
    accessory.context.rfButtonIndex = rfButtonIndex;
    accessory.context.buttons = buttons;
    accessory.context.subType = subType;
    accessory.context.hbDeviceId = fullDeviceId;
    accessory.context.name = name;
  }

  /**
   * Create the handler for an RF sub-accessory from its context.subType
   * @returns whether a handler was created
   */
  private initializeRFHandler(accessory: PlatformAccessory<AccessoryContext>): boolean {
    const subType = accessory.context.subType as string;
    const Handler = RF_SUB_HANDLERS[subType];
    if (!Handler) {
      return false;
    }
    const { rfButtonIndex, buttons } = accessory.context;
    this.installHandler(accessory, Handler, JSON.stringify(['rf', subType, rfButtonIndex, buttons]));
    return true;
  }

  /**
   * Create sub-accessories for multi-channel devices
   */
  private async createMultiChannelSubDevices(device: EWeLinkDevice, category: DeviceCategory): Promise<void> {
    const uiid = device.extra?.uiid || 0;
    const channelCount = getChannelCount(uiid);
    if (channelCount <= 1) {
      return;
    }

    this.log.info(`Creating ${channelCount + 1} channels for multi-switch device ${device.name}...`);

    const deviceConfig = this.platform.config.multiDevices?.find(d => d.deviceId === device.deviceid);
    const hideChannels = deviceConfig?.hideChannels?.split(',').map(c => c.trim()) || [];
    const inchChannels = deviceConfig?.inchChannels || false;

    // Remove any leftover single accessory from a previous simulation
    const singleUuid = this.registry.uuidFor(device.deviceid);
    const oldAccessory = this.registry.accessories.get(singleUuid);
    if (oldAccessory) {
      this.log.info(`Removing old single accessory for ${device.name}`);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [oldAccessory]);
      this.registry.accessories.delete(singleUuid);
      this.registry.removeHandler(oldAccessory.UUID);
    }

    // Precompute the channel UUIDs once (also used by the StateRouter for every update)
    const channelUuids = this.registry.channelUuids(device.deviceid, channelCount);

    // 0 = master, 1-N = individual channels
    for (let channel = 0; channel <= channelCount; channel++) {
      const fullDeviceId = `${device.deviceid}SW${channel}`;
      const uuid = channelUuids[channel];
      const isHidden = hideChannels.includes(fullDeviceId) || (channel === 0 && inchChannels);

      let subAccessory = this.registry.accessories.get(uuid);
      if (!subAccessory) {
        const safeName = sanitizeHomeKitName(device.name);
        const displayName = channel === 0 ? safeName : `${safeName} ${channel}`;
        subAccessory = new this.api.platformAccessory<AccessoryContext>(displayName, uuid);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [subAccessory]);
        this.registry.accessories.set(uuid, subAccessory);
      }

      subAccessory.context.device = device;
      subAccessory.context.deviceId = fullDeviceId;
      subAccessory.context.switchNumber = channel;
      subAccessory.context.channelCount = channelCount;
      subAccessory.context.category = category;

      // Metadata context (following original implementation)
      subAccessory.context.firmware = device.params?.fwVersion;
      subAccessory.context.reachableWAN = !!this.platform.wsClient && device.online;
      subAccessory.context.reachableLAN = !!this.platform.lanControl; // Updated when LAN discovers device
      subAccessory.context.eweBrandName = device.brandName;
      subAccessory.context.eweBrandLogo = device.brandLogoUrl;
      subAccessory.context.eweShared = device.sharedTo && device.sharedTo.length > 0 ? device.sharedTo[0] : false;
      subAccessory.context.macAddress = device.extra?.staMac?.replace(/:+/g, '').replace(/..\B/g, '$&:');
      subAccessory.context.lanKey = device.devicekey;

      this.updateAccessoryInfo(subAccessory, device);
      this.initializeChannelHandler(subAccessory);
      this.api.updatePlatformAccessories([subAccessory]);

      if (isHidden && channel === 0) {
        this.log.debug(`Channel ${channel} (master) is hidden for ${device.name}`);
      } else if (isHidden) {
        this.log.debug(`Channel ${channel} is hidden for ${device.name}`);
      }
    }

    this.log.info(`Created ${channelCount + 1} channel accessories for ${device.name}`);
  }

  /**
   * Create the handler for a multi-channel sub-accessory (outlet or switch per showAs)
   */
  private initializeChannelHandler(accessory: PlatformAccessory<AccessoryContext>): void {
    const deviceConfig = this.platform.config.multiDevices?.find(d => d.deviceId === accessory.context.device.deviceid);
    const Handler = deviceConfig?.showAs === 'outlet' ? OutletAccessory : SwitchAccessory;
    const { switchNumber, channelCount } = accessory.context;
    this.installHandler(accessory, Handler, JSON.stringify(['channel', switchNumber, channelCount, deviceConfig ?? null]));
  }

  /**
   * Install a handler for an accessory. An existing handler of the same class built from the
   * same identity is kept (and re-synced with the refreshed context.device) instead of being
   * destroyed, so its in-flight timers (auto-off, cover movement, garage pulse) survive a
   * re-initialization such as cloud discovery after a cache restore. Otherwise the previous
   * handler is destroyed and replaced.
   * @returns whether a new handler was created
   */
  private installHandler(
    accessory: PlatformAccessory<AccessoryContext>,
    Handler: AccessoryConstructor,
    identity: string,
  ): boolean {
    const existing = this.registry.getAccessoryHandler(accessory.UUID);
    if (existing && existing.constructor === Handler && this.handlerIdentities.get(existing) === identity) {
      existing.refreshFromDevice();
      return false;
    }
    this.registry.removeHandler(accessory.UUID);
    const handler = new Handler(this.platform, accessory);
    this.handlerIdentities.set(handler, identity);
    this.registry.setHandler(accessory.UUID, handler);
    return true;
  }

  /**
   * Update accessory information service
   */
  updateAccessoryInfo(accessory: PlatformAccessory<AccessoryContext>, device: EWeLinkDevice): void {
    const { Service, Characteristic } = this.platform;
    const infoService = accessory.getService(Service.AccessoryInformation);
    if (infoService) {
      infoService
        .setCharacteristic(Characteristic.Manufacturer, device.brandName || 'eWeLink')
        .setCharacteristic(Characteristic.Model, device.productModel || device.extra?.model || 'Unknown')
        .setCharacteristic(Characteristic.SerialNumber, device.deviceid)
        .setCharacteristic(Characteristic.FirmwareRevision, device.params?.fwVersion || '1.0.0');
    }
  }

  /**
   * Initialize the appropriate handler for an accessory. A live handler of the same class
   * and identity (category, showAs, UIID, device config) is kept and re-synced; otherwise
   * the previous handler is destroyed and replaced.
   */
  initializeAccessoryHandler(
    accessory: PlatformAccessory<AccessoryContext>,
    device: EWeLinkDevice,
    category: DeviceCategory,
  ): void {
    const deviceConfig = getDeviceConfig(this.platform.config, device.deviceid, category);
    const showAs = deviceConfig?.showAs || 'default';
    const uiid = device.extra?.uiid || 0;

    const Handler = this.resolveHandlerClass(showAs, uiid, category);
    this.installHandler(accessory, Handler, JSON.stringify(['device', category, showAs, uiid, deviceConfig ?? null]));
  }

  /**
   * Create appropriate handler based on showAs simulation or device category
   */
  createHandler(
    accessory: PlatformAccessory<AccessoryContext>,
    showAs: string,
    uiid: number,
    category: DeviceCategory,
  ): BaseAccessory {
    const Handler = this.resolveHandlerClass(showAs, uiid, category);
    return new Handler(this.platform, accessory);
  }

  /**
   * Resolve the handler class for a showAs simulation or device category
   */
  resolveHandlerClass(showAs: string, uiid: number, category: DeviceCategory): AccessoryConstructor {
    // 1. Simulation handlers (showAs config)
    const SimHandler = SIMULATION_HANDLERS[showAs];
    if (SimHandler) {
      return SimHandler;
    }

    // 2. TH sensor simulations (UIID 15/181 with showAs)
    if (isTHSensorDevice(uiid)) {
      const THSimHandler = TH_SIMULATION_HANDLERS[showAs];
      if (THSimHandler) {
        return THSimHandler;
      }
    }

    // 3. Special showAs cases
    if (showAs === 'heater') {
      return HeaterAccessory;
    }
    if (showAs === 'cooler') {
      return CoolerAccessory;
    }
    if (showAs === 'fan' && isDimmableLightForFan(uiid)) {
      return LightFanAccessory;
    }

    // 4. Category-based handler mapping
    const CategoryHandler = CATEGORY_HANDLERS[category];
    if (CategoryHandler) {
      return CategoryHandler;
    }

    // 5. Thermostat category (UIID 15/181 = TH sensor, UIID 127 = thermostat)
    if (category === DeviceCategory.THERMOSTAT) {
      return isTHSensorDevice(uiid) ? THSensorAccessory : ThermostatAccessory;
    }

    // 6. Programmable switches: multi-channel → SwitchMini, single-channel → SwitchMate
    if (isProgrammableSwitch(uiid)) {
      return getChannelCount(uiid) > 1 ? SwitchMiniAccessory : SwitchMateAccessory;
    }

    // 7. Outlet simulation
    if (showAs === 'outlet') {
      return OutletAccessory;
    }

    // 8. Water-valve devices (e.g. SWV-BSP UIID 7027) default to a HomeKit faucet,
    //    unless the user explicitly chose 'switch'.
    if (isWaterValveDevice(uiid) && showAs !== 'switch') {
      return TapAccessory;
    }

    return SwitchAccessory;
  }

  /**
   * Give cached accessories working handlers from their cached device context, before
   * (or without) cloud discovery, so LAN control and HomeKit state work while the
   * cloud is unreachable. Also seeds the device cache from the cached devices.
   * Discovery later refreshes these handlers with fresh data (keeping them unless the type changed).
   * @returns number of accessories that received a handler
   */
  restoreCachedAccessories(): number {
    let restored = 0;
    for (const accessory of this.registry.accessories.values()) {
      const device = accessory.context.device;
      if (!device?.deviceid || isDeviceIgnored(this.platform.config, device.deviceid)) {
        continue;
      }
      if (this.registry.getAccessoryHandler(accessory.UUID)) {
        continue;
      }
      if (!this.registry.deviceCache.has(device.deviceid)) {
        this.registry.deviceCache.set(device.deviceid, device);
      }

      try {
        if (accessory.context.rfButtonIndex !== undefined) {
          const bridgeUuid = this.registry.uuidFor(device.deviceid);
          if (!this.registry.getAccessoryHandler(bridgeUuid)) {
            this.createBridgeHandler(device);
          }
          if (!this.initializeRFHandler(accessory)) {
            continue;
          }
        } else if (accessory.context.switchNumber !== undefined) {
          this.initializeChannelHandler(accessory);
        } else {
          const category = (accessory.context.category as DeviceCategory | undefined) ?? resolveCategory(device);
          this.initializeAccessoryHandler(accessory, device, category);
        }
        restored++;
      } catch (error) {
        this.log.warn(
          `Could not restore cached accessory ${accessory.displayName}: ` +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }
    return restored;
  }

  /**
   * Replace any Name / ConfiguredName values that contain characters HAP-NodeJS
   * rejects. This silences the "invalid 'ConfiguredName' characteristic" warning
   * introduced in Homebridge 2.0 for accessories cached under older versions.
   */
  sanitizeAccessoryNames(accessory: PlatformAccessory): void {
    const { Characteristic } = this.platform;
    const safeDisplay = sanitizeHomeKitName(accessory.displayName);
    if (safeDisplay !== accessory.displayName) {
      accessory.displayName = safeDisplay;
    }

    for (const service of accessory.services) {
      const safeServiceName = sanitizeHomeKitName(service.displayName, safeDisplay);
      if (safeServiceName !== service.displayName) {
        service.displayName = safeServiceName;
      }

      for (const charType of [Characteristic.Name, Characteristic.ConfiguredName]) {
        const char = service.testCharacteristic(charType) ? service.getCharacteristic(charType) : undefined;
        // An empty ConfiguredName is left alone (Name is always sanitized)
        const skipEmpty = charType === Characteristic.ConfiguredName;
        if (char && typeof char.value === 'string' && (!skipEmpty || char.value.length > 0)) {
          const safe = sanitizeHomeKitName(char.value, safeDisplay);
          if (safe !== char.value) {
            service.updateCharacteristic(charType, safe);
          }
        }
      }
    }
  }
}
