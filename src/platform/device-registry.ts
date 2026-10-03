import type { PlatformAccessory } from 'homebridge';
import type { AccessoryContext, EWeLinkDevice } from '../types/index.js';
import type { BaseAccessory } from '../accessories/base.js';

/**
 * In-memory state shared by the platform modules: device cache, Homebridge
 * accessories, accessory handlers, temperature cache and memoized UUIDs.
 */
export class DeviceRegistry {
  /** Accessories known to Homebridge (cached or registered), by UUID */
  public readonly accessories = new Map<string, PlatformAccessory<AccessoryContext>>();

  /** Device list from the cloud (or restored from the accessory cache), by device ID */
  public readonly deviceCache = new Map<string, EWeLinkDevice>();

  /** Accessory handlers, by accessory UUID */
  private readonly handlers = new Map<string, BaseAccessory>();

  /** Temperature cache for cross-device temperature sharing (heater/cooler simulations) */
  private readonly temperatureCache = new Map<string, number>();

  /** Memoized deviceId → UUID */
  private readonly uuids = new Map<string, string>();

  /** Memoized parent deviceId → channel sub-accessory UUIDs (SW0..SWn) */
  private readonly channelUuidCache = new Map<string, string[]>();

  constructor(private readonly generateUuid: (id: string) => string) {}

  /**
   * UUID for a (sub-)device ID, memoized
   */
  uuidFor(deviceId: string): string {
    let uuid = this.uuids.get(deviceId);
    if (uuid === undefined) {
      uuid = this.generateUuid(deviceId);
      this.uuids.set(deviceId, uuid);
    }
    return uuid;
  }

  /**
   * UUIDs of the channel sub-accessories (index = channel, 0 = master), memoized
   */
  channelUuids(deviceId: string, channelCount: number): string[] {
    const cached = this.channelUuidCache.get(deviceId);
    if (cached && cached.length === channelCount + 1) {
      return cached;
    }
    const uuids: string[] = [];
    for (let channel = 0; channel <= channelCount; channel++) {
      uuids.push(this.uuidFor(`${deviceId}SW${channel}`));
    }
    this.channelUuidCache.set(deviceId, uuids);
    return uuids;
  }

  getAccessoryHandler(uuid: string): BaseAccessory | undefined {
    return this.handlers.get(uuid);
  }

  /**
   * Set the handler for an accessory, destroying any different previous handler
   */
  setHandler(uuid: string, handler: BaseAccessory): void {
    const previous = this.handlers.get(uuid);
    if (previous && previous !== handler) {
      previous.destroy();
    }
    this.handlers.set(uuid, handler);
  }

  /**
   * Remove and destroy the handler for an accessory (no-op if none)
   */
  removeHandler(uuid: string): void {
    const handler = this.handlers.get(uuid);
    if (handler) {
      this.handlers.delete(uuid);
      handler.destroy();
    }
  }

  /**
   * Destroy and forget every handler (shutdown)
   */
  destroyAllHandlers(): void {
    const handlers = [...this.handlers.values()];
    this.handlers.clear();
    for (const handler of handlers) {
      handler.destroy();
    }
  }

  /**
   * Device display name for logging (name, or the ID if unknown)
   */
  getDeviceDisplayName(deviceId: string): string {
    return this.deviceCache.get(deviceId)?.name || deviceId;
  }

  setDeviceTemperature(deviceId: string, temperature: number): void {
    this.temperatureCache.set(deviceId, temperature);
  }

  getDeviceTemperature(deviceId: string): number | undefined {
    return this.temperatureCache.get(deviceId);
  }
}
