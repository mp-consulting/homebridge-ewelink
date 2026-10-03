import type { API, Logging, PlatformAccessory } from 'homebridge';
import type { AccessoryContext, DeviceParams } from '../types/index.js';
import type { BaseAccessory } from '../accessories/base.js';
import { getChannelCount, hasCurtainParams } from '../constants/device-catalog.js';
import type { DeviceRegistry } from './device-registry.js';

export interface StateRouterOptions {
  log: Logging;
  api: API;
  registry: DeviceRegistry;
  /** Whether a cloud (WebSocket) client exists */
  isCloudEnabled: () => boolean;
}

/**
 * Routes device state updates (WebSocket, LAN, query responses) to accessory handlers
 */
export class StateRouter {
  constructor(private readonly opts: StateRouterOptions) {}

  handleDeviceUpdate(deviceId: string, params: DeviceParams): void {
    const { log, registry } = this.opts;
    const device = registry.deviceCache.get(deviceId);
    if (!device) {
      log.debug('Device not found in cache for update:', deviceId);
      return;
    }

    const uiid = device.extra?.uiid || 0;
    const channelCount = getChannelCount(uiid);
    // UIID 126 configured as curtain is registered with the plain deviceId
    const isCurtainDevice = uiid === 126 && hasCurtainParams(device.params);

    // Multi-switch devices shown as a single simulated accessory also use the plain deviceId
    const singleHandler = registry.getAccessoryHandler(registry.uuidFor(deviceId));
    if (channelCount <= 1 || isCurtainDevice || singleHandler) {
      // Single-channel device, single-accessory simulation or RF Bridge - update directly
      const handler = singleHandler;
      if (handler) {
        this.applyUpdate(handler, params);
      } else {
        log.debug('No handler found for device update:', deviceId);
      }
      return;
    }

    // Multi-channel: broadcast to every channel sub-accessory (SW0, SW1, ...)
    const reachableWAN = this.opts.isCloudEnabled() && device.online;
    const changed: PlatformAccessory<AccessoryContext>[] = [];
    for (const subUuid of registry.channelUuids(deviceId, channelCount)) {
      const subHandler = registry.getAccessoryHandler(subUuid);
      if (!subHandler) {
        continue;
      }
      this.applyUpdate(subHandler, params);

      // Persist reachability context only when it actually changed
      const subAccessory = registry.accessories.get(subUuid);
      if (subAccessory) {
        let dirty = false;
        if (subAccessory.context.reachableWAN !== reachableWAN) {
          subAccessory.context.reachableWAN = reachableWAN;
          dirty = true;
        }
        if (params.updateSource === 'LAN' && subAccessory.context.reachableLAN !== true) {
          subAccessory.context.reachableLAN = true;
          dirty = true;
        }
        if (dirty) {
          changed.push(subAccessory);
        }
      }
    }
    if (changed.length > 0) {
      this.opts.api.updatePlatformAccessories(changed);
    }
  }

  private applyUpdate(handler: BaseAccessory, params: DeviceParams): void {
    handler.updateState(params);
    // Mark online/offline status
    if (params.online !== undefined && 'markStatus' in handler && typeof handler.markStatus === 'function') {
      handler.markStatus(params.online === true);
    }
  }
}
