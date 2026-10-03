import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EWeLinkPlatform } from '../../src/platform.js';
import { WSClient } from '../../src/api/ws-client.js';
import { ConnectionManager } from '../../src/platform/connection-manager.js';
import { DeviceCategory } from '../../src/settings.js';
import { SwitchAccessory } from '../../src/accessories/switch.js';
import { CurtainAccessory, PositionState } from '../../src/accessories/curtain.js';
import { BlindAccessory } from '../../src/accessories/simulations/blind.js';
import type { MockService } from '../__mocks__/homebridge.js';
import { createMockDevice, createPlatformHarness } from './helpers.js';

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

describe('EWeLinkPlatform startup', () => {
  beforeEach(() => {
    // Neutral jitter (factor 1.0)
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('registers accessories without waiting for the WebSocket', async () => {
    const device = createMockDevice({ deviceid: 'd1', name: 'Lamp' });
    const h = createPlatformHarness({ devices: [device] });
    h.fakeWs.start.mockReturnValue(new Promise(() => {})); // never settles

    h.api.emit('didFinishLaunching');
    await flush();

    expect(h.fakeWs.start).toHaveBeenCalled();
    expect(h.api.registerPlatformAccessories).toHaveBeenCalledTimes(1);
    expect(h.platform.getAccessoryHandler('uuid-d1')).toBeDefined();
    expect(h.platform.connection.isInitialized).toBe(true);
  });

  it('registers accessories even when the real WebSocket connect rejects, and retries it', async () => {
    vi.useFakeTimers();
    const ref: { platform?: EWeLinkPlatform } = {};
    const h = createPlatformHarness({
      devices: [createMockDevice({ deviceid: 'd1' })],
      clients: { createWs: () => new WSClient(ref.platform!) },
    });
    ref.platform = h.platform;
    h.fakeApi.getWsHost.mockRejectedValue(new Error('dispatch unreachable'));

    await h.platform.discoverDevices();
    await flush();

    expect(h.platform.getAccessoryHandler('uuid-d1')).toBeDefined();
    expect(h.log.warn).toHaveBeenCalledWith(expect.stringContaining('dispatch unreachable'));
    expect(vi.getTimerCount()).toBeGreaterThan(0); // reconnect scheduled

    h.api.emit('shutdown');
    // Accessory polling/handler timers are destroyed and the reconnect timer cleared
    expect(h.platform.wsClient?.isConnected()).toBe(false);
  });

  it('does nothing without credentials', async () => {
    const createApi = vi.fn();
    const h = createPlatformHarness({ config: { username: '' }, clients: { createApi } });
    await h.platform.discoverDevices();
    expect(createApi).not.toHaveBeenCalled();
    expect(h.log.warn).toHaveBeenCalledWith(expect.stringContaining('credentials not configured'));
  });

  it('retries login with exponential backoff until it succeeds', async () => {
    vi.useFakeTimers();
    const h = createPlatformHarness({ devices: [createMockDevice({ deviceid: 'd1' })] });
    h.fakeApi.login
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(undefined);

    await h.platform.discoverDevices();
    expect(h.fakeApi.login).toHaveBeenCalledTimes(1);
    expect(h.platform.connection.hasPendingRetry).toBe(true);
    expect(h.log.warn).toHaveBeenCalledWith(expect.stringContaining('in 15s'));

    await vi.advanceTimersByTimeAsync(ConnectionManager.RETRY_BASE_MS);
    expect(h.fakeApi.login).toHaveBeenCalledTimes(2);
    expect(h.log.warn).toHaveBeenCalledWith(expect.stringContaining('in 30s'));

    await vi.advanceTimersByTimeAsync(ConnectionManager.RETRY_BASE_MS * 2);
    expect(h.fakeApi.login).toHaveBeenCalledTimes(3);
    expect(h.platform.getAccessoryHandler('uuid-d1')).toBeDefined();
    expect(h.platform.connection.hasPendingRetry).toBe(false);
    expect(h.fakeWs.start).toHaveBeenCalledTimes(1);
  });

  it('caps the retry delay and does not log in again when only discovery failed', async () => {
    vi.useFakeTimers();
    const h = createPlatformHarness();
    h.fakeApi.getDevices.mockRejectedValue(new Error('500'));

    await h.platform.discoverDevices();
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(ConnectionManager.RETRY_MAX_MS);
    }
    expect(h.fakeApi.login).toHaveBeenCalledTimes(1);
    expect(h.fakeApi.getDevices.mock.calls.length).toBeGreaterThan(5);
    expect(h.log.warn).toHaveBeenLastCalledWith(expect.stringContaining('in 300s'));
  });

  it('shutdown clears the retry timer, stops clients and destroys handlers', async () => {
    vi.useFakeTimers();
    const device = createMockDevice({ deviceid: 'd1', localtype: 1, ip: '10.0.0.5', port: 8081 });
    const h = createPlatformHarness();
    h.addCachedAccessory(device, { category: DeviceCategory.SINGLE_SWITCH });
    h.fakeApi.login.mockRejectedValue(new Error('down'));

    await h.platform.discoverDevices();
    const handler = h.platform.getAccessoryHandler('uuid-d1')!;
    const destroy = vi.spyOn(handler, 'destroy');
    expect(h.platform.connection.hasPendingRetry).toBe(true);

    h.api.emit('shutdown');

    expect(h.platform.connection.hasPendingRetry).toBe(false);
    expect(h.fakeLan.stop).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
    expect(h.platform.getAccessoryHandler('uuid-d1')).toBeUndefined();

    await vi.advanceTimersByTimeAsync(ConnectionManager.RETRY_MAX_MS * 2);
    expect(h.fakeApi.login).toHaveBeenCalledTimes(1);
  });

  it('disconnects the WebSocket on shutdown', async () => {
    const h = createPlatformHarness({ devices: [createMockDevice({ deviceid: 'd1' })] });
    await h.platform.discoverDevices();
    h.api.emit('shutdown');
    expect(h.fakeWs.disconnect).toHaveBeenCalled();
  });

  describe('offline-first restore', () => {
    it('gives cached accessories handlers and LAN control while the cloud is down', async () => {
      const device = createMockDevice({ deviceid: 'd1', name: 'Lamp', localtype: 1, ip: '10.0.0.5', port: 8081 });
      const h = createPlatformHarness();
      h.addCachedAccessory(device, { category: DeviceCategory.SINGLE_SWITCH });
      h.fakeApi.login.mockReturnValue(new Promise(() => {})); // cloud hangs
      h.fakeLan.sendCommand.mockResolvedValue(true);

      void h.platform.discoverDevices();
      await flush();

      expect(h.platform.getAccessoryHandler('uuid-d1')).toBeDefined();
      expect(h.platform.deviceCache.get('d1')).toBe(device);
      expect(h.fakeLan.registerDevice).toHaveBeenCalledWith('d1', '10.0.0.5', 8081, device.devicekey, true);
      expect(h.fakeLan.start).toHaveBeenCalled();
      await expect(h.platform.sendDeviceCommand('d1', { switch: 'on' })).resolves.toBe(true);
    });

    /** Harness whose login stays pending until resolveLogin() is called */
    const withDeferredLogin = (h: ReturnType<typeof createPlatformHarness>) => {
      let resolveLogin!: () => void;
      h.fakeApi.login.mockReturnValue(new Promise<void>(r => {
        resolveLogin = r;
      }));
      return () => resolveLogin();
    };

    it('replaces (and destroys) a restored handler when discovery changes its type', async () => {
      const cached = createMockDevice({ deviceid: 'd1', name: 'Old' });
      // Cloud now reports a curtain (UIID 11): different category → different handler class
      const fresh = createMockDevice({
        deviceid: 'd1',
        name: 'New',
        extra: { ...cached.extra, uiid: 11 },
        params: { setclose: 0 },
      });
      const h = createPlatformHarness({ devices: [fresh] });
      h.addCachedAccessory(cached, { category: DeviceCategory.SINGLE_SWITCH });
      const resolveLogin = withDeferredLogin(h);

      const started = h.platform.discoverDevices();
      await flush();
      const restored = h.platform.getAccessoryHandler('uuid-d1')!;
      expect(restored).toBeInstanceOf(SwitchAccessory);
      const destroy = vi.spyOn(restored, 'destroy');

      resolveLogin();
      await started;

      expect(destroy).toHaveBeenCalled();
      expect(h.platform.getAccessoryHandler('uuid-d1')).toBeInstanceOf(CurtainAccessory);
      expect(h.platform.accessories.get('uuid-d1')!.context.device).toBe(fresh);
      expect(h.api.registerPlatformAccessories).not.toHaveBeenCalled();
    });

    it('keeps a restored handler of the same type and re-syncs it with the fresh device', async () => {
      const cached = createMockDevice({ deviceid: 'd1', name: 'Lamp', params: { switch: 'off' } });
      const fresh = createMockDevice({ deviceid: 'd1', name: 'Lamp', params: { switch: 'on' } });
      const h = createPlatformHarness({ devices: [fresh] });
      const accessory = h.addCachedAccessory(cached, { category: DeviceCategory.SINGLE_SWITCH });
      const resolveLogin = withDeferredLogin(h);

      const started = h.platform.discoverDevices();
      await flush();
      const restored = h.platform.getAccessoryHandler('uuid-d1')!;
      const destroy = vi.spyOn(restored, 'destroy');
      const updateState = vi.spyOn(restored, 'updateState');

      resolveLogin();
      await started;

      expect(h.platform.getAccessoryHandler('uuid-d1')).toBe(restored);
      expect(destroy).not.toHaveBeenCalled();
      expect(updateState).toHaveBeenCalledWith({ switch: 'on' });
      expect(accessory.context.device).toBe(fresh);
      const service = accessory.getService(h.platform.Service.Switch) as unknown as MockService;
      expect(service.getCharacteristicValue(h.platform.Characteristic.On)).toBe(true);
    });

    it('lets a cover movement started before discovery finish (move timer survives)', async () => {
      vi.useFakeTimers();
      const cached = createMockDevice({ deviceid: 'd1', name: 'Blind' });
      const fresh = createMockDevice({ deviceid: 'd1', name: 'Blind' });
      const h = createPlatformHarness({
        devices: [fresh],
        config: { singleDevices: [{ deviceId: 'd1', showAs: 'blind' }] },
      });
      const accessory = h.addCachedAccessory(cached, { category: DeviceCategory.SINGLE_SWITCH });
      const resolveLogin = withDeferredLogin(h);
      const send = vi.spyOn(h.platform, 'sendDeviceCommand').mockResolvedValue(true);

      const started = h.platform.discoverDevices();
      await flush();
      const restored = h.platform.getAccessoryHandler('uuid-d1')!;
      expect(restored).toBeInstanceOf(BlindAccessory);
      const destroy = vi.spyOn(restored, 'destroy');
      const service = accessory.getService(h.platform.Service.WindowCovering) as unknown as MockService;

      // 120 s default full travel → 50% takes 60 s
      await service.getCharacteristic(h.platform.Characteristic.TargetPosition).triggerSet(50);
      expect(accessory.context.cachePositionState).toBe(PositionState.INCREASING);

      resolveLogin();
      await started;

      expect(h.platform.getAccessoryHandler('uuid-d1')).toBe(restored);
      expect(destroy).not.toHaveBeenCalled();
      // Not reset to STOPPED by a re-construction
      expect(accessory.context.cachePositionState).toBe(PositionState.INCREASING);

      send.mockClear();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(send).toHaveBeenCalledWith('d1', {
        switches: [{ switch: 'off', outlet: 0 }, { switch: 'off', outlet: 1 }],
      });
      expect(accessory.context.cachePositionState).toBe(PositionState.STOPPED);
      expect(accessory.context.cacheCurrentPosition).toBe(50);
    });

    it('does not bump the curtain stagger counter again when discovery keeps the handler', async () => {
      const curtain = createMockDevice({
        deviceid: 'c1',
        name: 'Curtain',
        extra: { ...createMockDevice().extra, uiid: 11 },
        params: { setclose: 0 },
      });
      const h = createPlatformHarness({ devices: [curtain] });
      h.addCachedAccessory(curtain, { category: DeviceCategory.CURTAIN });
      const resolveLogin = withDeferredLogin(h);
      const stagger = vi.spyOn(h.platform, 'getCurtainStaggerDelay');

      const started = h.platform.discoverDevices();
      await flush();
      const restored = h.platform.getAccessoryHandler('uuid-c1');
      expect(stagger).toHaveBeenCalledTimes(1);

      resolveLogin();
      await started;

      expect(h.platform.getAccessoryHandler('uuid-c1')).toBe(restored);
      expect(stagger).toHaveBeenCalledTimes(1);
    });

    it('restores multi-channel and RF sub-accessories, skipping ignored devices', async () => {
      const multi = createMockDevice({ deviceid: 'm1', extra: { uiid: 4 } as never });
      const bridge = createMockDevice({ deviceid: 'b1', extra: { uiid: 28 } as never });
      const ignored = createMockDevice({ deviceid: 'ig1' });
      const h = createPlatformHarness({ config: { ignoredDevices: ['ig1'], mode: 'wan' } });
      h.addCachedAccessory(multi, { switchNumber: 1, category: DeviceCategory.MULTI_SWITCH }, 'm1SW1');
      h.addCachedAccessory(bridge, { rfButtonIndex: 0, subType: 'button', buttons: { 0: 'A' } }, 'b1SW1');
      h.addCachedAccessory(bridge, { rfButtonIndex: 1, subType: 'weird' }, 'b1SW2');
      h.addCachedAccessory(ignored, { category: DeviceCategory.SINGLE_SWITCH });
      h.fakeApi.login.mockReturnValue(new Promise(() => {}));

      void h.platform.discoverDevices();
      await flush();

      expect(h.platform.getAccessoryHandler('uuid-m1SW1')).toBeDefined();
      expect(h.platform.getAccessoryHandler('uuid-b1SW1')).toBeDefined();
      expect(h.platform.getAccessoryHandler('uuid-b1')).toBeDefined(); // bridge router
      expect(h.platform.getAccessoryHandler('uuid-b1SW2')).toBeUndefined();
      expect(h.platform.getAccessoryHandler('uuid-ig1')).toBeUndefined();
      expect(h.platform.lanControl).toBeUndefined();
      expect(h.log.info).toHaveBeenCalledWith(expect.stringContaining('Restored 2 cached accessory handler(s)'));
    });
  });

  describe('accessory creation', () => {
    it('does not create accessories for ignored devices', async () => {
      const h = createPlatformHarness({
        config: { ignoredDevices: ['d2'] },
        devices: [createMockDevice({ deviceid: 'd1' }), createMockDevice({ deviceid: 'd2' })],
      });
      await h.platform.discoverDevices();
      expect(h.api.registerPlatformAccessories).toHaveBeenCalledTimes(1);
      expect(h.platform.accessories.has('uuid-d2')).toBe(false);
    });

    it('removes stale cached accessories and destroys their restored handler', async () => {
      const h = createPlatformHarness({ devices: [createMockDevice({ deviceid: 'd1' })] });
      h.addCachedAccessory(createMockDevice({ deviceid: 'old' }), { category: DeviceCategory.SINGLE_SWITCH });
      let destroy: ReturnType<typeof vi.spyOn> | undefined;
      h.fakeApi.login.mockImplementation(async () => {
        destroy = vi.spyOn(h.platform.getAccessoryHandler('uuid-old')!, 'destroy');
      });

      await h.platform.discoverDevices();

      expect(destroy).toHaveBeenCalled();
      expect(h.api.unregisterPlatformAccessories).toHaveBeenCalledTimes(1);
      expect(h.platform.accessories.has('uuid-old')).toBe(false);
      expect(h.platform.getAccessoryHandler('uuid-old')).toBeUndefined();
    });

    it('creates channel accessories for multi-channel devices and drops an old single accessory', async () => {
      const multi = createMockDevice({ deviceid: 'm1', name: 'Strip', extra: { uiid: 4 } as never });
      const h = createPlatformHarness({ devices: [multi], config: { multiDevices: [{ deviceId: 'm1', showAs: 'outlet', hideChannels: 'm1SW2', inchChannels: true }] } });

      h.addCachedAccessory(multi, { category: DeviceCategory.MULTI_SWITCH });

      await h.platform.discoverDevices();

      // the cached single accessory is dropped and replaced by SW0..SW4 (no throwaway re-registration)
      expect(h.api.unregisterPlatformAccessories).toHaveBeenCalledTimes(1);
      const registered = vi.mocked(h.api.registerPlatformAccessories!).mock.calls.flatMap(call => call[2]);
      expect(registered.map(a => a.UUID)).not.toContain('uuid-m1');
      expect(h.platform.accessories.has('uuid-m1')).toBe(false);
      for (let ch = 0; ch <= 4; ch++) {
        expect(h.platform.getAccessoryHandler(`uuid-m1SW${ch}`)).toBeDefined();
        expect(h.platform.accessories.get(`uuid-m1SW${ch}`)!.context.switchNumber).toBe(ch);
      }
      expect(h.platform.accessories.get('uuid-m1SW1')!.displayName).toBe('Strip 1');

      // Updates broadcast to channels without re-persisting unchanged context
      vi.mocked(h.api.updatePlatformAccessories!).mockClear();
      h.platform.handleDeviceUpdate('m1', { switches: [] });
      h.platform.handleDeviceUpdate('m1', { switches: [] });
      expect(h.api.updatePlatformAccessories).not.toHaveBeenCalled();
    });

    it('exposes a multi-switch device shown as a blind as one accessory and routes updates to it', async () => {
      const dual = createMockDevice({ deviceid: 'm2', name: 'Shutter', extra: { uiid: 126 } as never, params: { switches: [] } });
      const h = createPlatformHarness({ devices: [dual], config: { multiDevices: [{ deviceId: 'm2', showAs: 'blind' }] } });
      // leftover channel accessory from when the device was exposed per channel
      h.addCachedAccessory(dual, { category: DeviceCategory.MULTI_SWITCH, switchNumber: 1 }, 'm2SW1');

      await h.platform.discoverDevices();

      expect(h.platform.accessories.has('uuid-m2')).toBe(true);
      expect(h.platform.accessories.has('uuid-m2SW1')).toBe(false);
      const handler = h.platform.getAccessoryHandler('uuid-m2');
      expect(handler).toBeInstanceOf(BlindAccessory);

      const spy = vi.spyOn(handler!, 'updateState');
      h.platform.handleDeviceUpdate('m2', { switches: [{ outlet: 0, switch: 'off' }] });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('keeps the bridge out of HomeKit and creates RF sub-devices', async () => {
      const bridge = createMockDevice({
        deviceid: 'b1',
        name: 'Bridge',
        extra: { uiid: 28 } as never,
        tags: {
          zyx_info: [
            { name: 'Remote', remote_type: '2', buttonName: [{ 0: 'On' }, { 1: 'Off' }] },
            { name: 'Door', remote_type: '7', buttonName: [{ 2: 'Open' }] },
            { name: 'Shade', remote_type: '5', buttonName: [{ 3: 'Up' }] },
            { name: 'Mystery', remote_type: '99', buttonName: [] },
          ],
        } as never,
      });
      const h = createPlatformHarness({
        devices: [bridge],
        config: { bridgeSensors: [{ fullDeviceId: 'b1SW4', curtainType: 'blind' }] },
      });
      h.addCachedAccessory(bridge, { category: DeviceCategory.RF_BRIDGE });
      // A previously cached RF sub-device gets renamed
      h.addCachedAccessory(bridge, { rfButtonIndex: 0, subType: 'button' }, 'b1SW1');

      await h.platform.discoverDevices();

      expect(h.api.unregisterPlatformAccessories).toHaveBeenCalledTimes(1); // cached bridge removed
      expect(h.platform.accessories.has('uuid-b1')).toBe(false);
      expect(h.platform.getAccessoryHandler('uuid-b1')).toBeDefined();
      expect(h.platform.accessories.get('uuid-b1SW1')!.displayName).toBe('Remote');
      expect(h.platform.accessories.get('uuid-b1SW3')!.context.subType).toBe('sensor');
      expect(h.platform.accessories.get('uuid-b1SW4')!.context.subType).toBe('blind');
      expect(h.log.warn).toHaveBeenCalledWith(expect.stringContaining('Unknown RF device type 99'));
    });

    it('removes old services when a cached accessory changes category', async () => {
      const device = createMockDevice({ deviceid: 'd1', extra: { uiid: 1 } as never });
      const h = createPlatformHarness({ devices: [device], config: { mode: 'wan' } });
      const cached = h.addCachedAccessory(device, { category: DeviceCategory.LIGHT });
      const stale = cached.addService('stale-service' as never);

      await h.platform.discoverDevices();

      expect(h.log.warn).toHaveBeenCalledWith(expect.stringContaining('Category changed'));
      expect(cached.services).not.toContain(stale);
      expect(cached.context.category).toBe(DeviceCategory.SINGLE_SWITCH);
    });

    it('creates and keeps group accessories', async () => {
      const h = createPlatformHarness({ groups: [{ id: 'g1', name: 'All lights' }] });
      await h.platform.discoverDevices();
      expect(h.platform.accessories.has('uuid-g1')).toBe(true);
      expect(h.api.unregisterPlatformAccessories).not.toHaveBeenCalled();
      await expect(h.platform.sendDeviceCommand('g1', { switch: 'on' })).resolves.toBe(true);
      expect(h.fakeApi.updateGroup).toHaveBeenCalledWith('g1', { switch: 'on' });
    });

    it('selects handlers by showAs simulation and category', async () => {
      const devices = [
        createMockDevice({ deviceid: 'sim', extra: { uiid: 1 } as never }),
        createMockDevice({ deviceid: 'th', extra: { uiid: 15 } as never, params: { currentTemperature: 2000 } }),
        createMockDevice({ deviceid: 'heat', extra: { uiid: 1 } as never }),
        createMockDevice({ deviceid: 'out', extra: { uiid: 1 } as never }),
        createMockDevice({ deviceid: 'unk', extra: { uiid: 999999 } as never }),
      ];
      const h = createPlatformHarness({
        devices,
        config: {
          singleDevices: [
            { deviceId: 'sim', showAs: 'lock' },
            { deviceId: 'heat', showAs: 'heater' },
            { deviceId: 'out', showAs: 'outlet' },
          ],
        },
      });
      await h.platform.discoverDevices();
      expect(h.platform.getAccessoryHandler('uuid-sim')!.constructor.name).toBe('LockAccessory');
      expect(h.platform.getAccessoryHandler('uuid-th')!.constructor.name).toBe('THSensorAccessory');
      expect(h.platform.getAccessoryHandler('uuid-heat')!.constructor.name).toBe('HeaterAccessory');
      expect(h.platform.getAccessoryHandler('uuid-unk')!.constructor.name).toBe('SwitchAccessory');
    });
  });

  describe('facade', () => {
    it('sanitizes cached accessory names on load', () => {
      const h = createPlatformHarness();
      const accessory = h.addCachedAccessory(createMockDevice({ deviceid: 'd1', name: 'Bad*Name!' }));
      const svc = accessory.addService('svc' as never, 'Svc*Name' as never);
      svc.setCharacteristic(h.platform.Characteristic.Name, 'Bad*Name');
      svc.setCharacteristic(h.platform.Characteristic.ConfiguredName, 'Bad*Name');
      h.platform.configureAccessory(accessory);
      expect(accessory.displayName).not.toContain('*');
      expect(svc.displayName).not.toContain('*');
    });

    it('delegates temperatures, names and logging', () => {
      const h = createPlatformHarness({ config: { outlineInLog: true } });
      h.platform.setDeviceTemperature('t1', 21.5);
      expect(h.platform.getDeviceTemperature('t1')).toBe(21.5);
      expect(h.platform.getDeviceDisplayName('zzz')).toBe('zzz');
      expect(h.platform.getCurtainStaggerDelay()).toBe(1000);
      h.platform.logMessage('info', 'hello');
      expect(h.log.info).toHaveBeenCalledTimes(3);
    });

    it('queries device state through the cloud transport', async () => {
      const h = createPlatformHarness({ devices: [createMockDevice({ deviceid: 'd1' })] });
      await h.platform.discoverDevices();
      await expect(h.platform.queryDeviceState('d1')).resolves.toBe(true);
      expect(h.fakeWs.queryDeviceState).toHaveBeenCalledWith('d1');
    });

    it('logs (but survives) a failing LAN start', async () => {
      const h = createPlatformHarness();
      h.fakeLan.start.mockRejectedValue(new Error('EADDRINUSE'));
      await h.platform.discoverDevices();
      expect(h.log.error).toHaveBeenCalledWith('Failed to start LAN control:', 'EADDRINUSE');
      expect(h.platform.connection.isInitialized).toBe(true);
    });
  });
});
