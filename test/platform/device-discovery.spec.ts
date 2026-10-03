import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { API, Logging, PlatformAccessory } from 'homebridge';
import { DeviceDiscoveryService } from '../../src/platform/device-discovery.js';
import { DeviceRegistry } from '../../src/platform/device-registry.js';
import type { AccessoryFactory } from '../../src/platform/accessory-factory.js';
import type { BaseAccessory } from '../../src/accessories/base.js';
import { DeviceCategory } from '../../src/settings.js';
import type { AccessoryContext, EWeLinkDevice, EWeLinkPlatformConfig } from '../../src/types/index.js';
import { createMockAccessory, createMockAPI, createMockLogging } from '../__mocks__/homebridge.js';
import { createMockDevice } from '../__mocks__/ewelink-device.js';
import { createFakeApi } from './helpers.js';

describe('DeviceDiscoveryService', () => {
  let log: Logging;
  let api: ReturnType<typeof createMockAPI>;
  let registry: DeviceRegistry;
  let factory: { addAccessory: ReturnType<typeof vi.fn> };
  let config: EWeLinkPlatformConfig;
  let service: DeviceDiscoveryService;

  beforeEach(() => {
    log = createMockLogging();
    api = createMockAPI();
    registry = new DeviceRegistry((id) => `uuid-${id}`);
    factory = { addAccessory: vi.fn().mockResolvedValue(undefined) };
    config = {
      platform: 'eWeLink',
      ignoredDevices: ['ignored1'],
      singleDevices: [{ deviceId: 's1', showAs: 'outlet' }],
      multiDevices: [{ deviceId: 'm1' }],
      thDevices: [{ deviceId: 't1' }],
      fanDevices: [{ deviceId: 'f1' }],
      lightDevices: [{ deviceId: 'l1' }],
      sensorDevices: [{ deviceId: 'se1' }],
      rfDevices: [{ deviceId: 'rf1' }],
    } as unknown as EWeLinkPlatformConfig;
    service = new DeviceDiscoveryService({
      log,
      api: api as unknown as API,
      config,
      registry,
      factory: factory as unknown as AccessoryFactory,
    });
  });

  const addAccessory = (deviceId: string, context: Partial<AccessoryContext> = {}) => {
    const uuid = `uuid-${deviceId}`;
    const accessory = createMockAccessory<AccessoryContext>(deviceId, uuid, { deviceId, ...context } as AccessoryContext);
    registry.accessories.set(uuid, accessory as PlatformAccessory<AccessoryContext>);
    const handler = { destroy: vi.fn(), updateState: vi.fn() } as unknown as BaseAccessory;
    registry.setHandler(uuid, handler);
    return { accessory, handler };
  };

  it('fetches and caches devices', async () => {
    const cloud = createFakeApi([createMockDevice({ deviceid: 'a' }), createMockDevice({ deviceid: 'b' })]);
    const { devices } = await service.fetchDevices(cloud);
    expect(devices).toHaveLength(2);
    expect(registry.deviceCache.has('a')).toBe(true);
    expect(registry.deviceCache.has('b')).toBe(true);
  });

  it('keeps registering devices when one fails', async () => {
    factory.addAccessory.mockRejectedValueOnce(new Error('boom'));
    const devices = [createMockDevice({ deviceid: 'a', name: 'A' }), createMockDevice({ deviceid: 'b' })];
    await service.registerAccessories(devices, [], createFakeApi());
    expect(factory.addAccessory).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Failed to initialize accessory for A [a]: boom'));
  });

  it('creates, caches and keeps group accessories', async () => {
    const { handler } = addAccessory('grp1');
    await service.registerAccessories([], [{ id: 'grp1', name: 'Living', params: { switch: 'on' } }], createFakeApi());

    const groupDevice = factory.addAccessory.mock.calls[0][0] as EWeLinkDevice;
    expect(groupDevice).toMatchObject({ deviceid: 'grp1', name: 'Living', apikey: 'user-api-key', extra: { uiid: 5000 } });
    expect(registry.deviceCache.get('grp1')).toBe(groupDevice);
    expect(api.unregisterPlatformAccessories).not.toHaveBeenCalled();
    expect(handler.destroy).not.toHaveBeenCalled();
  });

  it('names unnamed groups and survives a failing group', async () => {
    factory.addAccessory.mockRejectedValueOnce(new Error('bad group'));
    const groups = await service.processGroups([{ id: 'g9' }], createFakeApi());
    expect(groups[0].name).toBe('Group g9');
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('bad group'));
  });

  describe('removeStaleAccessories', () => {
    it('removes accessories whose device is gone and destroys their handler', () => {
      const { accessory, handler } = addAccessory('gone');
      addAccessory('kept');
      service.removeStaleAccessories([createMockDevice({ deviceid: 'kept' })]);

      expect(api.unregisterPlatformAccessories).toHaveBeenCalledWith(expect.any(String), expect.any(String), [accessory]);
      expect(registry.accessories.has('uuid-gone')).toBe(false);
      expect(registry.accessories.has('uuid-kept')).toBe(true);
      expect(registry.getAccessoryHandler('uuid-gone')).toBeUndefined();
      expect(handler.destroy).toHaveBeenCalled();
    });

    it('keeps channel and RF sub-devices while the parent exists', () => {
      addAccessory('m1SW0', { switchNumber: 0 });
      addAccessory('m1SW1', { switchNumber: 1 });
      addAccessory('rfSW1', { rfButtonIndex: 0 });
      service.removeStaleAccessories([createMockDevice({ deviceid: 'm1' }), createMockDevice({ deviceid: 'rf' })]);
      expect(api.unregisterPlatformAccessories).not.toHaveBeenCalled();
    });

    it('removes sub-devices whose parent is gone', () => {
      addAccessory('m1SW1', { switchNumber: 1 });
      addAccessory('rfSW1', { rfButtonIndex: 0 });
      service.removeStaleAccessories([]);
      expect(api.unregisterPlatformAccessories).toHaveBeenCalledTimes(2);
      expect(registry.accessories.size).toBe(0);
    });

    it('skips accessories flagged as groups', () => {
      addAccessory('g1', { isGroup: true });
      service.removeStaleAccessories([]);
      expect(api.unregisterPlatformAccessories).not.toHaveBeenCalled();
    });
  });

  it('reports ignored devices', () => {
    expect(service.isDeviceIgnored('ignored1')).toBe(true);
    expect(service.isDeviceIgnored('other')).toBe(false);
  });

  it('looks up per-category device config', () => {
    expect(service.getDeviceConfig('s1', DeviceCategory.SINGLE_SWITCH)).toEqual({ deviceId: 's1', showAs: 'outlet' });
    expect(service.getDeviceConfig('m1', DeviceCategory.MULTI_SWITCH)).toBeDefined();
    expect(service.getDeviceConfig('t1', DeviceCategory.THERMOSTAT)).toBeDefined();
    expect(service.getDeviceConfig('f1', DeviceCategory.FAN)).toBeDefined();
    expect(service.getDeviceConfig('l1', DeviceCategory.LIGHT)).toBeDefined();
    expect(service.getDeviceConfig('se1', DeviceCategory.SENSOR)).toBeDefined();
    expect(service.getDeviceConfig('rf1', DeviceCategory.RF_BRIDGE)).toBeDefined();
    expect(service.getDeviceConfig('s1', DeviceCategory.OUTLET)).toBeUndefined();
  });
});
