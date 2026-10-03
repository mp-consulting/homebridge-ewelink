import { vi } from 'vitest';
import type { API, PlatformAccessory, PlatformConfig } from 'homebridge';
import { EWeLinkPlatform } from '../../src/platform.js';
import type { ClientFactory } from '../../src/platform/connection-manager.js';
import type { AccessoryContext, EWeLinkDevice } from '../../src/types/index.js';
import { createMockAccessory, createMockAPI, createMockLogging } from '../__mocks__/homebridge.js';
import { createMockDevice } from '../__mocks__/ewelink-device.js';

/** Fake EWeLinkAPI (login/getDevices resolve by default) */
export function createFakeApi(devices: EWeLinkDevice[] = [], groups: unknown[] = []) {
  return {
    login: vi.fn().mockResolvedValue(undefined),
    getDevices: vi.fn().mockResolvedValue({ devices, groups }),
    getApiKey: vi.fn().mockReturnValue('user-api-key'),
    updateGroup: vi.fn().mockResolvedValue(true),
    getWsHost: vi.fn().mockResolvedValue('wss://example.invalid/api/ws'),
    getAccessToken: vi.fn().mockReturnValue('at'),
    reloadTokensFromStorage: vi.fn().mockResolvedValue(true),
  };
}

export function createFakeLan() {
  return {
    registerDevice: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    sendCommand: vi.fn().mockResolvedValue(false),
  };
}

export function createFakeWs() {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    sendCommand: vi.fn().mockResolvedValue(true),
    queryDeviceState: vi.fn().mockResolvedValue(true),
    isConnected: vi.fn().mockReturnValue(true),
  };
}

export interface PlatformHarnessOptions {
  config?: Record<string, unknown>;
  devices?: EWeLinkDevice[];
  groups?: unknown[];
  /** Override client factories (default: fakes above) */
  clients?: Partial<ClientFactory>;
}

/**
 * Build a real EWeLinkPlatform against the homebridge mocks with fake API/LAN/WS clients
 */
export function createPlatformHarness(options: PlatformHarnessOptions = {}) {
  const api = createMockAPI();
  // new api.platformAccessory(name, uuid) → mock accessory
  (api as unknown as { platformAccessory: unknown }).platformAccessory = function (name: string, uuid: string) {
    return createMockAccessory<AccessoryContext>(name, uuid, {} as AccessoryContext);
  };
  const log = createMockLogging();
  const fakeApi = createFakeApi(options.devices ?? [], options.groups ?? []);
  const fakeLan = createFakeLan();
  const fakeWs = createFakeWs();

  const config = {
    platform: 'eWeLink',
    username: 'user@example.com',
    password: 'secret',
    countryCode: '1',
    ...options.config,
  } as PlatformConfig;

  const platform = new EWeLinkPlatform(log, config, api as unknown as API, {
    clients: {
      createApi: () => fakeApi as never,
      createLan: () => fakeLan as never,
      createWs: () => fakeWs as never,
      ...options.clients,
    },
  });

  /** Simulate Homebridge loading an accessory from its cache */
  const addCachedAccessory = (device: EWeLinkDevice, context: Partial<AccessoryContext> = {}, deviceId?: string) => {
    const id = deviceId ?? device.deviceid;
    const accessory = createMockAccessory<AccessoryContext>(device.name, `uuid-${id}`, {
      device,
      deviceId: id,
      ...context,
    } as AccessoryContext);
    platform.configureAccessory(accessory as unknown as PlatformAccessory);
    return accessory;
  };

  return { api, log, platform, fakeApi, fakeLan, fakeWs, addCachedAccessory };
}

export { createMockDevice };
