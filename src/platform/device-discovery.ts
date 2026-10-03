import type { API, Logging } from 'homebridge';
import type { DeviceCategory } from '../settings.js';
import { PLATFORM_NAME, PLUGIN_NAME } from '../settings.js';
import type { EWeLinkDevice, EWeLinkPlatformConfig } from '../types/index.js';
import { CHANNEL_SUFFIX_PATTERN } from '../constants/device-constants.js';
import type { DeviceRegistry } from './device-registry.js';
import type { AccessoryFactory } from './accessory-factory.js';
import { getDeviceConfig, isDeviceIgnored } from './device-config.js';

/** Subset of EWeLinkAPI used for discovery */
export interface DiscoveryApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDevices(): Promise<{ devices: EWeLinkDevice[]; groups: any[] }>;
  getApiKey(): string;
}

export interface DeviceDiscoveryOptions {
  log: Logging;
  api: API;
  config: EWeLinkPlatformConfig;
  registry: DeviceRegistry;
  factory: AccessoryFactory;
}

/**
 * Fetches the device list and reconciles Homebridge accessories with it
 */
export class DeviceDiscoveryService {
  constructor(private readonly opts: DeviceDiscoveryOptions) {}

  /**
   * Fetch devices and groups from the cloud and cache the devices
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async fetchDevices(cloudApi: DiscoveryApi): Promise<{ devices: EWeLinkDevice[]; groups: any[] }> {
    const { devices, groups } = await cloudApi.getDevices();
    this.opts.log.info(`Discovered ${devices.length} devices and ${groups.length} groups from eWeLink`);
    for (const device of devices) {
      this.opts.registry.deviceCache.set(device.deviceid, device);
    }
    return { devices, groups };
  }

  /**
   * Register/update accessories for the discovered devices and groups, then remove stale ones
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async registerAccessories(devices: EWeLinkDevice[], groups: any[], cloudApi: DiscoveryApi): Promise<void> {
    // Per-device isolation: a bug initializing one accessory must not leave later devices unhandled
    for (const device of devices) {
      try {
        await this.opts.factory.addAccessory(device);
      } catch (error) {
        this.opts.log.error(
          `Failed to initialize accessory for ${device.name} [${device.deviceid}]: ` +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }

    const groupDevices = await this.processGroups(groups, cloudApi);
    // Groups are current devices too - otherwise they would be removed as stale right after creation
    this.removeStaleAccessories([...devices, ...groupDevices]);
  }

  /**
   * Create accessories for eWeLink cloud device groups
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async processGroups(groups: any[], cloudApi: DiscoveryApi): Promise<EWeLinkDevice[]> {
    if (groups.length === 0) {
      return [];
    }

    this.opts.log.info(`Processing ${groups.length} group(s) from eWeLink account`);

    const groupDevices: EWeLinkDevice[] = [];
    for (const group of groups) {
      const groupDevice = {
        ...group,
        extra: { uiid: 5000 }, // Groups use UIID 5000
        deviceid: group.id,
        productModel: 'Group [5000]',
        brandName: 'eWeLink',
        online: true,
        params: group.params || {},
        devicekey: '', // Groups don't have device keys
        apikey: cloudApi.getApiKey(),
        name: group.name || `Group ${group.id}`,
        deviceStatus: 'online',
        createdAt: new Date().toISOString(),
      } as EWeLinkDevice;

      // Cache it so commands and updates for the group can find it
      this.opts.registry.deviceCache.set(groupDevice.deviceid, groupDevice);
      groupDevices.push(groupDevice);
      try {
        await this.opts.factory.addAccessory(groupDevice);
      } catch (error) {
        this.opts.log.error(
          `Failed to initialize group ${groupDevice.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return groupDevices;
  }

  isDeviceIgnored(deviceId: string): boolean {
    return isDeviceIgnored(this.opts.config, deviceId);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDeviceConfig(deviceId: string, category: DeviceCategory): any {
    return getDeviceConfig(this.opts.config, deviceId, category);
  }

  /**
   * Remove accessories (and destroy their handlers) that are no longer in the device list
   */
  removeStaleAccessories(currentDevices: EWeLinkDevice[]): void {
    const { registry, api, log } = this.opts;
    const currentDeviceIds = new Set(currentDevices.map(d => d.deviceid));

    for (const [uuid, accessory] of registry.accessories) {
      const deviceId = accessory.context.deviceId;

      if (accessory.context.isGroup) {
        continue;
      }

      // RF and multi-channel sub-devices are kept while their parent device exists
      const isSubDevice = accessory.context.rfButtonIndex !== undefined || accessory.context.switchNumber !== undefined;
      if (isSubDevice && currentDeviceIds.has(deviceId.replace(CHANNEL_SUFFIX_PATTERN, ''))) {
        continue;
      }

      if (!currentDeviceIds.has(deviceId)) {
        log.info('Removing stale accessory:', accessory.displayName);
        api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        registry.accessories.delete(uuid);
        registry.removeHandler(uuid);
      }
    }
  }
}
