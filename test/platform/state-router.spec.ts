import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { API, Logging, PlatformAccessory } from 'homebridge';
import { StateRouter } from '../../src/platform/state-router.js';
import { DeviceRegistry } from '../../src/platform/device-registry.js';
import type { BaseAccessory } from '../../src/accessories/base.js';
import type { AccessoryContext } from '../../src/types/index.js';
import { createMockAccessory, createMockAPI, createMockLogging } from '../__mocks__/homebridge.js';
import { createMockDevice } from '../__mocks__/ewelink-device.js';

function fakeHandler(withMarkStatus = true) {
  return {
    updateState: vi.fn(),
    destroy: vi.fn(),
    ...(withMarkStatus ? { markStatus: vi.fn() } : {}),
  } as unknown as BaseAccessory & { updateState: ReturnType<typeof vi.fn>; markStatus: ReturnType<typeof vi.fn> };
}

describe('StateRouter', () => {
  let log: Logging;
  let api: ReturnType<typeof createMockAPI>;
  let registry: DeviceRegistry;
  let generate: ReturnType<typeof vi.fn>;
  let cloudEnabled: boolean;
  let router: StateRouter;

  beforeEach(() => {
    log = createMockLogging();
    api = createMockAPI();
    generate = vi.fn((id: string) => `uuid-${id}`);
    registry = new DeviceRegistry(generate as unknown as (id: string) => string);
    cloudEnabled = true;
    router = new StateRouter({ log, api: api as unknown as API, registry, isCloudEnabled: () => cloudEnabled });
  });

  const addChannelAccessories = (deviceId: string, channels: number) => {
    const handlers = [];
    for (let ch = 0; ch <= channels; ch++) {
      const uuid = `uuid-${deviceId}SW${ch}`;
      const accessory = createMockAccessory<AccessoryContext>(`ch${ch}`, uuid, { deviceId: `${deviceId}SW${ch}` } as AccessoryContext);
      registry.accessories.set(uuid, accessory as PlatformAccessory<AccessoryContext>);
      const handler = fakeHandler();
      registry.setHandler(uuid, handler);
      handlers.push({ accessory, handler });
    }
    return handlers;
  };

  it('ignores updates for unknown devices', () => {
    router.handleDeviceUpdate('ghost', { switch: 'on' });
    expect(log.debug).toHaveBeenCalledWith('Device not found in cache for update:', 'ghost');
  });

  it('routes single-channel updates to the handler and marks status', () => {
    registry.deviceCache.set('d1', createMockDevice({ deviceid: 'd1' }));
    const handler = fakeHandler();
    registry.setHandler('uuid-d1', handler);

    router.handleDeviceUpdate('d1', { switch: 'on', online: false });

    expect(handler.updateState).toHaveBeenCalledWith({ switch: 'on', online: false });
    expect(handler.markStatus).toHaveBeenCalledWith(false);
    expect(api.updatePlatformAccessories).not.toHaveBeenCalled();
  });

  it('does not require markStatus on handlers', () => {
    registry.deviceCache.set('d1', createMockDevice({ deviceid: 'd1' }));
    const handler = fakeHandler(false);
    registry.setHandler('uuid-d1', handler);
    router.handleDeviceUpdate('d1', { online: true });
    expect(handler.updateState).toHaveBeenCalled();
  });

  it('logs when no handler exists', () => {
    registry.deviceCache.set('d1', createMockDevice({ deviceid: 'd1' }));
    router.handleDeviceUpdate('d1', { switch: 'on' });
    expect(log.debug).toHaveBeenCalledWith('No handler found for device update:', 'd1');
  });

  it('routes UIID 126 curtains to the plain device accessory', () => {
    registry.deviceCache.set('c1', createMockDevice({
      deviceid: 'c1',
      extra: { uiid: 126 } as never,
      params: { currLocation: 50 },
    }));
    const handler = fakeHandler();
    registry.setHandler('uuid-c1', handler);
    router.handleDeviceUpdate('c1', { currLocation: 20 });
    expect(handler.updateState).toHaveBeenCalledWith({ currLocation: 20 });
  });

  describe('multi-channel devices', () => {
    beforeEach(() => {
      registry.deviceCache.set('m1', createMockDevice({ deviceid: 'm1', extra: { uiid: 4 } as never, online: true }));
    });

    it('broadcasts updates to every channel sub-accessory', () => {
      const subs = addChannelAccessories('m1', 4);
      router.handleDeviceUpdate('m1', { switches: [], online: true });
      for (const { handler } of subs) {
        expect(handler.updateState).toHaveBeenCalledWith({ switches: [], online: true });
        expect(handler.markStatus).toHaveBeenCalledWith(true);
      }
    });

    it('persists reachability once, and not again when nothing changed', () => {
      const subs = addChannelAccessories('m1', 4);

      router.handleDeviceUpdate('m1', { switches: [] });
      expect(api.updatePlatformAccessories).toHaveBeenCalledTimes(1);
      expect(vi.mocked(api.updatePlatformAccessories!).mock.calls[0][0]).toHaveLength(5);
      expect(subs[1].accessory.context.reachableWAN).toBe(true);

      router.handleDeviceUpdate('m1', { switches: [] });
      router.handleDeviceUpdate('m1', { switches: [] });
      expect(api.updatePlatformAccessories).toHaveBeenCalledTimes(1);
    });

    it('persists when a LAN update first marks the channels LAN-reachable', () => {
      const subs = addChannelAccessories('m1', 4);
      router.handleDeviceUpdate('m1', { switches: [] });
      vi.mocked(api.updatePlatformAccessories!).mockClear();

      router.handleDeviceUpdate('m1', { switches: [], updateSource: 'LAN' });
      expect(api.updatePlatformAccessories).toHaveBeenCalledTimes(1);
      expect(subs[2].accessory.context.reachableLAN).toBe(true);

      router.handleDeviceUpdate('m1', { switches: [], updateSource: 'LAN' });
      expect(api.updatePlatformAccessories).toHaveBeenCalledTimes(1);
    });

    it('persists when WAN reachability changes', () => {
      addChannelAccessories('m1', 4);
      router.handleDeviceUpdate('m1', { switches: [] });
      vi.mocked(api.updatePlatformAccessories!).mockClear();

      cloudEnabled = false;
      router.handleDeviceUpdate('m1', { switches: [] });
      expect(api.updatePlatformAccessories).toHaveBeenCalledTimes(1);
    });

    it('computes channel UUIDs once instead of per message', () => {
      addChannelAccessories('m1', 4);
      for (let i = 0; i < 10; i++) {
        router.handleDeviceUpdate('m1', { switches: [] });
      }
      const channelCalls = generate.mock.calls.filter(([id]) => String(id).startsWith('m1SW'));
      expect(channelCalls).toHaveLength(5);
    });

    it('skips channels without a handler', () => {
      const subs = addChannelAccessories('m1', 4);
      registry.removeHandler('uuid-m1SW3');
      router.handleDeviceUpdate('m1', { switches: [] });
      expect(subs[3].handler.destroy).toHaveBeenCalled();
      expect(subs[3].handler.updateState).not.toHaveBeenCalled();
      expect(vi.mocked(api.updatePlatformAccessories!).mock.calls[0][0]).toHaveLength(4);
    });
  });
});
