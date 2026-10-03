import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Logging } from 'homebridge';
import { CommandDispatcher } from '../../src/platform/command-dispatcher.js';
import { WSClient } from '../../src/api/ws-client.js';
import { DeviceRegistry } from '../../src/platform/device-registry.js';
import type { EWeLinkPlatformConfig } from '../../src/types/index.js';
import { createMockLogging } from '../__mocks__/homebridge.js';
import { createMockDevice } from '../__mocks__/ewelink-device.js';
import { createFakeApi, createFakeLan, createFakeWs } from './helpers.js';

describe('CommandDispatcher', () => {
  let log: Logging;
  let registry: DeviceRegistry;
  let lan: ReturnType<typeof createFakeLan> | undefined;
  let cloud: ReturnType<typeof createFakeWs> | undefined;
  let groupApi: ReturnType<typeof createFakeApi>;
  let config: EWeLinkPlatformConfig;
  let sleep: ReturnType<typeof vi.fn>;

  const create = (extra: Partial<ConstructorParameters<typeof CommandDispatcher>[0]> = {}) => new CommandDispatcher({
    log,
    config,
    registry,
    getLan: () => lan,
    getCloud: () => cloud,
    getGroupApi: () => groupApi,
    sleep: sleep as unknown as (ms: number) => Promise<void>,
    ...extra,
  });

  beforeEach(() => {
    log = createMockLogging();
    registry = new DeviceRegistry((id) => `uuid-${id}`);
    registry.deviceCache.set('dev1', createMockDevice({ deviceid: 'dev1', name: 'Lamp' }));
    lan = createFakeLan();
    cloud = createFakeWs();
    groupApi = createFakeApi();
    config = { platform: 'eWeLink', mode: 'auto', commandQueueInterval: 0 } as EWeLinkPlatformConfig;
    sleep = vi.fn().mockResolvedValue(undefined);
  });

  describe('sendDeviceCommand routing', () => {
    it('uses LAN first and skips the cloud when LAN succeeds', async () => {
      lan!.sendCommand.mockResolvedValue(true);
      await expect(create().sendDeviceCommand('dev1', { switch: 'on' })).resolves.toBe(true);
      expect(lan!.sendCommand).toHaveBeenCalledWith('dev1', { switch: 'on' });
      expect(cloud!.sendCommand).not.toHaveBeenCalled();
    });

    it('falls back to the cloud when LAN fails', async () => {
      lan!.sendCommand.mockResolvedValue(false);
      await expect(create().sendDeviceCommand('dev1', { switch: 'on' })).resolves.toBe(true);
      expect(cloud!.sendCommand).toHaveBeenCalledWith('dev1', { switch: 'on' });
    });

    it('goes straight to the cloud when LAN is unavailable', async () => {
      lan = undefined;
      await expect(create().sendDeviceCommand('dev1', { switch: 'on' })).resolves.toBe(true);
      expect(cloud!.sendCommand).toHaveBeenCalledTimes(1);
    });

    it('skips LAN in WAN mode', async () => {
      config.mode = 'wan';
      await create().sendDeviceCommand('dev1', { switch: 'on' });
      expect(lan!.sendCommand).not.toHaveBeenCalled();
      expect(cloud!.sendCommand).toHaveBeenCalledTimes(1);
    });

    it('resolves channel sub-devices against the parent device', async () => {
      lan = undefined;
      await expect(create().sendDeviceCommand('dev1SW2', { switches: [] })).resolves.toBe(true);
      expect(cloud!.sendCommand).toHaveBeenCalledWith('dev1SW2', { switches: [] });
    });

    it('returns false for unknown devices', async () => {
      await expect(create().sendDeviceCommand('nope', { switch: 'on' })).resolves.toBe(false);
      expect(log.error).toHaveBeenCalledWith('Device not found in cache:', 'nope');
    });

    it('sends group commands over HTTP', async () => {
      registry.deviceCache.set('grp', createMockDevice({ deviceid: 'grp', extra: { uiid: 5000 } as never }));
      await expect(create().sendDeviceCommand('grp', { switch: 'on' })).resolves.toBe(true);
      expect(groupApi.updateGroup).toHaveBeenCalledWith('grp', { switch: 'on' });
      expect(lan!.sendCommand).not.toHaveBeenCalled();
    });

    it('fails when no cloud transport exists (LAN mode)', async () => {
      config.mode = 'lan';
      await expect(create().sendDeviceCommand('dev1', { switch: 'on' })).resolves.toBe(false);
      expect(log.error).toHaveBeenCalledWith('No available control method for device:', 'dev1');
    });
  });

  describe('cloud retry rules', () => {
    beforeEach(() => {
      lan = undefined;
    });

    it('retries when the socket was not open for sending (never delivered)', async () => {
      cloud!.sendCommand
        .mockRejectedValueOnce(new Error('WebSocket is not open: readyState 0 (CONNECTING)'))
        .mockRejectedValueOnce(new Error('WebSocket is not open: readyState 0 (CONNECTING)'))
        .mockResolvedValueOnce(true);
      await expect(create().sendDeviceCommand('dev1', { switch: 'on' })).resolves.toBe(true);
      expect(cloud!.sendCommand).toHaveBeenCalledTimes(3);
      expect(sleep).toHaveBeenCalledTimes(2);
    });

    it('does not resend a command lost in flight when the socket closed before the reply', async () => {
      cloud!.sendCommand
        .mockRejectedValueOnce(new Error(WSClient.IN_FLIGHT_LOST_MESSAGE))
        .mockResolvedValueOnce(true);
      await expect(create().sendDeviceCommand('dev1', { switch: 'on' })).resolves.toBe(false);
      expect(cloud!.sendCommand).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(log.error).toHaveBeenCalledWith('[Lamp] Failed to send command: WebSocket closed before response');
    });

    it('retries when the socket was not open (send returned false)', async () => {
      cloud!.sendCommand.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      await expect(create().sendDeviceCommand('dev1', { switch: 'on' })).resolves.toBe(true);
      expect(cloud!.sendCommand).toHaveBeenCalledTimes(2);
    });

    it('gives up after the maximum attempts when never connected', async () => {
      cloud!.sendCommand.mockResolvedValue(false);
      await expect(create().sendDeviceCommand('dev1', { switch: 'on' })).resolves.toBe(false);
      expect(cloud!.sendCommand).toHaveBeenCalledTimes(3);
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('cloud connection unavailable'));
    });

    it('retries at most once on timeout', async () => {
      cloud!.sendCommand.mockRejectedValue(new Error('Command timeout'));
      await expect(create().sendDeviceCommand('dev1', { switch: 'on' })).resolves.toBe(false);
      expect(cloud!.sendCommand).toHaveBeenCalledTimes(2);
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('after 2 attempts: Command timeout'));
    });

    it('does not retry when the server rejected the command', async () => {
      cloud!.sendCommand.mockRejectedValue(new Error('Command failed: 504'));
      await expect(create().sendDeviceCommand('dev1', { switch: 'on' })).resolves.toBe(false);
      expect(cloud!.sendCommand).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith('[Lamp] Failed to send command: Command failed: 504');
    });

    it('does not retry after a shutdown disconnect', async () => {
      cloud!.sendCommand.mockRejectedValue(new Error('WebSocket disconnected'));
      await expect(create().sendDeviceCommand('dev1', { switch: 'on' })).resolves.toBe(false);
      expect(cloud!.sendCommand).toHaveBeenCalledTimes(1);
    });

    it('uses the default timer-based sleep between retries', async () => {
      vi.useFakeTimers();
      cloud!.sendCommand.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const promise = create({ sleep: undefined }).sendDeviceCommand('dev1', { switch: 'on' });
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe(true);
    });
  });

  describe('queue bound', () => {
    it('drops the oldest pending cloud command beyond the max size', async () => {
      lan = undefined;
      config.commandQueueConcurrency = 1;
      let release!: (v: boolean) => void;
      cloud!.sendCommand.mockImplementationOnce(() => new Promise<boolean>(r => {
        release = r;
      }));
      const dispatcher = create({ maxQueueSize: 1 });

      const inFlight = dispatcher.sendDeviceCommand('dev1', { switch: 'on' });
      await Promise.resolve();
      const oldest = dispatcher.sendDeviceCommand('dev1', { switch: 'off' });
      const newest = dispatcher.sendDeviceCommand('dev1', { switch: 'on' });

      await expect(oldest).resolves.toBe(false);
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Command queue full'));

      release(true);
      await expect(inFlight).resolves.toBe(true);
      await expect(newest).resolves.toBe(true);
    });

    it('rejects pending commands on clear()', async () => {
      lan = undefined;
      config.commandQueueConcurrency = 1;
      cloud!.sendCommand.mockImplementationOnce(() => new Promise<boolean>(() => {}));
      const dispatcher = create();
      void dispatcher.sendDeviceCommand('dev1', { switch: 'on' });
      await Promise.resolve();
      const pending = dispatcher.sendDeviceCommand('dev1', { switch: 'off' });
      dispatcher.clear();
      await expect(pending).resolves.toBe(false);
    });
  });

  describe('queryDeviceState', () => {
    it('returns false when the cloud is not connected', async () => {
      cloud!.isConnected.mockReturnValue(false);
      await expect(create().queryDeviceState('dev1')).resolves.toBe(false);
      expect(cloud!.queryDeviceState).not.toHaveBeenCalled();
    });

    it('returns false without a cloud transport', async () => {
      cloud = undefined;
      await expect(create().queryDeviceState('dev1')).resolves.toBe(false);
    });

    it('retries failed queries', async () => {
      cloud!.queryDeviceState.mockRejectedValueOnce(new Error('Query timeout')).mockResolvedValueOnce(true);
      await expect(create().queryDeviceState('dev1')).resolves.toBe(true);
      expect(cloud!.queryDeviceState).toHaveBeenCalledTimes(2);
    });

    it('warns after the maximum attempts', async () => {
      cloud!.queryDeviceState.mockRejectedValue(new Error('Query timeout'));
      await expect(create().queryDeviceState('dev1')).resolves.toBe(false);
      expect(cloud!.queryDeviceState).toHaveBeenCalledTimes(3);
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('after 3 attempts: Query timeout'));
    });
  });

  it('staggers curtain refresh delays', () => {
    const dispatcher = create();
    expect(dispatcher.getCurtainStaggerDelay()).toBe(1000);
    expect(dispatcher.getCurtainStaggerDelay()).toBe(2000);
  });
});
