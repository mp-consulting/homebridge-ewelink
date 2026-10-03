import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { createMockPlatform } from '../__mocks__/homebridge.js';

// Use globalThis for shared mock state (accessible from mocks)
declare global {
  var __lanControlMockState: {
    udpMessageCallback: ((msg: Buffer, rinfo: any) => void) | null;
    udpErrorCallback: ((error: Error) => void) | null;
    bonjourServiceCallback: ((service: any) => void) | null;
    bonjourDownCallback: ((service: any) => void) | null;
  };
}

// Initialize global state
globalThis.__lanControlMockState = {
  udpMessageCallback: null,
  udpErrorCallback: null,
  bonjourServiceCallback: null,
  bonjourDownCallback: null,
};

// Mock dgram with proper callback capture
vi.mock('dgram', () => ({
  default: {
    createSocket: () => ({
      on: (event: string, callback: any) => {
        if (event === 'message') {
          globalThis.__lanControlMockState.udpMessageCallback = callback;
        } else if (event === 'error') {
          globalThis.__lanControlMockState.udpErrorCallback = callback;
        }
      },
      bind: (_port: number, callback: () => void) => callback(),
      close: () => {},
    }),
  },
}));

// Mock bonjour-service with a proper class
vi.mock('bonjour-service', () => {
  class MockBonjour {
    find(_opts: any, callback: any) {
      globalThis.__lanControlMockState.bonjourServiceCallback = callback;
      return {
        on: (event: string, cb: any) => {
          if (event === 'down') {
            globalThis.__lanControlMockState.bonjourDownCallback = cb;
          }
        },
        stop: () => {},
      };
    }
    destroy() {}
  }
  return { Bonjour: MockBonjour };
});

// Mock fetch globally
global.fetch = vi.fn();

// Import after mocking
import { LANControl } from '../../src/api/lan-control.js';

// Alias for easier access in tests
const mockState = globalThis.__lanControlMockState;

describe('LANControl', () => {
  let lanControl: LANControl;
  let mockPlatform: ReturnType<typeof createMockPlatform>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock state between tests
    mockState.udpMessageCallback = null;
    mockState.udpErrorCallback = null;
    mockState.bonjourServiceCallback = null;
    mockState.bonjourDownCallback = null;

    mockPlatform = createMockPlatform();

    // Setup mock ewelinkApi
    (mockPlatform as any).ewelinkApi = {
      getApiKey: vi.fn().mockReturnValue('test-api-key'),
    };

    // Setup device cache
    mockPlatform.deviceCache.set('test-device', {
      name: 'Test Device',
      devicekey: 'test-device-key',
    } as any);

    mockPlatform.handleDeviceUpdate = vi.fn();

    lanControl = new LANControl(mockPlatform as any);
  });

  afterEach(() => {
    lanControl.stop();
  });

  describe('constructor', () => {
    it('should create LANControl instance', () => {
      expect(lanControl).toBeDefined();
    });
  });

  describe('registerDevice', () => {
    it('should register device for LAN control', () => {
      lanControl.registerDevice('device-1', '192.168.1.100', 8081, 'device-key', true);

      expect(lanControl.isDeviceAvailable('device-1')).toBe(true);
    });

    it('should not register device without IP', () => {
      lanControl.registerDevice('device-1', '', 8081, 'device-key', true);

      expect(lanControl.isDeviceAvailable('device-1')).toBe(false);
    });

    it('should not register device without port', () => {
      lanControl.registerDevice('device-1', '192.168.1.100', 0, 'device-key', true);

      expect(lanControl.isDeviceAvailable('device-1')).toBe(false);
    });

    it('should not overwrite existing device', () => {
      lanControl.registerDevice('device-1', '192.168.1.100', 8081, 'device-key', true);
      lanControl.registerDevice('device-1', '192.168.1.200', 8082, 'device-key-2', false);

      const device = lanControl.getLanDevice('device-1');
      expect(device?.ip).toBe('192.168.1.100');
      expect(device?.port).toBe(8081);
    });
  });

  describe('isDeviceAvailable', () => {
    it('should return false for unregistered device', () => {
      expect(lanControl.isDeviceAvailable('unknown-device')).toBe(false);
    });

    it('should return true for registered device', () => {
      lanControl.registerDevice('device-1', '192.168.1.100', 8081, 'device-key', true);

      expect(lanControl.isDeviceAvailable('device-1')).toBe(true);
    });
  });

  describe('getLanDevice', () => {
    it('should return undefined for unregistered device', () => {
      expect(lanControl.getLanDevice('unknown-device')).toBeUndefined();
    });

    it('should return device info for registered device', () => {
      lanControl.registerDevice('device-1', '192.168.1.100', 8081, 'device-key', true);

      const device = lanControl.getLanDevice('device-1');
      expect(device).toEqual({
        deviceId: 'device-1',
        ip: '192.168.1.100',
        port: 8081,
        deviceKey: 'device-key',
        encrypt: true,
      });
    });
  });

  describe('sendCommand', () => {
    it('should return false for unavailable device', async () => {
      const result = await lanControl.sendCommand('unknown-device', { switch: 'on' });

      expect(result).toBe(false);
    });

    it('should send HTTP request to registered device', async () => {
      lanControl.registerDevice('test-device', '192.168.1.100', 8081, 'device-key', false);

      (global.fetch as any).mockResolvedValueOnce({
        json: () => Promise.resolve({ error: 0 }),
      });

      const result = await lanControl.sendCommand('test-device', { switch: 'on' });

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://192.168.1.100:8081/zeroconf/switch',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should return false when HTTP request fails', async () => {
      lanControl.registerDevice('test-device', '192.168.1.100', 8081, 'device-key', false);

      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await lanControl.sendCommand('test-device', { switch: 'on' });

      expect(result).toBe(false);
    });

    it('should return false when device returns error', async () => {
      lanControl.registerDevice('test-device', '192.168.1.100', 8081, 'device-key', false);

      (global.fetch as any).mockResolvedValueOnce({
        json: () => Promise.resolve({ error: 500 }),
      });

      const result = await lanControl.sendCommand('test-device', { switch: 'on' });

      expect(result).toBe(false);
    });

    it('should strip channel suffix from device ID', async () => {
      lanControl.registerDevice('test-device', '192.168.1.100', 8081, 'device-key', false);

      (global.fetch as any).mockResolvedValueOnce({
        json: () => Promise.resolve({ error: 0 }),
      });

      const result = await lanControl.sendCommand('test-deviceSW1', { switch: 'on' });

      expect(result).toBe(true);
    });
  });

  describe('start', () => {
    it('should start LAN discovery', async () => {
      await lanControl.start();

      expect(mockPlatform.log.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting LAN control'),
      );
    });

    it('should not start twice', async () => {
      await lanControl.start();
      await lanControl.start();

      // Should only log once
      expect(mockPlatform.log.info).toHaveBeenCalledTimes(2); // Start + listening messages
    });
  });

  describe('stop', () => {
    it('should stop LAN control', async () => {
      await lanControl.start();
      lanControl.registerDevice('device-1', '192.168.1.100', 8081, 'device-key', true);

      lanControl.stop();

      expect(lanControl.isDeviceAvailable('device-1')).toBe(false);
    });

    it('should handle stop when not started', () => {
      expect(() => lanControl.stop()).not.toThrow();
    });
  });

  describe('sendCommand - encrypted', () => {
    it('should send encrypted payload when device requires encryption', async () => {
      lanControl.registerDevice('test-device', '192.168.1.100', 8081, 'test-device-key', true);

      (global.fetch as any).mockResolvedValueOnce({
        json: () => Promise.resolve({ error: 0 }),
      });

      const result = await lanControl.sendCommand('test-device', { switch: 'on' });

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://192.168.1.100:8081/zeroconf/switch',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('encrypt'),
        }),
      );
    });
  });

  describe('sendCommand - unregistered parent device', () => {
    it('should return false when parent device not found', async () => {
      // Don't register any device
      const result = await lanControl.sendCommand('device-1SW1', { switch: 'on' });

      expect(result).toBe(false);
      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('Not available via LAN'),
      );
    });
  });

  describe('sendCommand - null response', () => {
    it('should return false when fetch returns null', async () => {
      lanControl.registerDevice('test-device', '192.168.1.100', 8081, 'device-key', false);

      (global.fetch as any).mockResolvedValueOnce({
        json: () => Promise.resolve(null),
      });

      const result = await lanControl.sendCommand('test-device', { switch: 'on' });

      expect(result).toBe(false);
    });
  });

  describe('registerDevice - device name from cache', () => {
    it('should use device name from cache in log', () => {
      mockPlatform.deviceCache.set('cached-device', {
        name: 'My Cached Device',
        devicekey: 'cached-key',
      } as any);

      lanControl.registerDevice('cached-device', '192.168.1.100', 8081, 'cached-key', true);

      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('My Cached Device'),
      );
    });

    it('should use device ID when not in cache', () => {
      lanControl.registerDevice('uncached-device', '192.168.1.100', 8081, 'device-key', true);

      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('uncached-device'),
      );
    });
  });

  describe('start - logDiscoveryStatus', () => {
    it('should log discovery status after timeout', async () => {
      vi.useFakeTimers();

      await lanControl.start();

      // Fast-forward past discovery status timeout (10s)
      vi.advanceTimersByTime(10000);

      // Should log warning about no devices
      expect(mockPlatform.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('No devices found'),
      );

      vi.useRealTimers();
    });

    it('should log discovered devices after timeout', async () => {
      vi.useFakeTimers();

      lanControl.registerDevice('device-1', '192.168.1.100', 8081, 'device-key', true);

      await lanControl.start();

      vi.advanceTimersByTime(10000);

      expect(mockPlatform.log.info).toHaveBeenCalledWith(
        expect.stringContaining('Found 1 device'),
      );

      vi.useRealTimers();
    });
  });

  describe('multiple devices', () => {
    it('should handle multiple registered devices', () => {
      lanControl.registerDevice('device-1', '192.168.1.100', 8081, 'key-1', true);
      lanControl.registerDevice('device-2', '192.168.1.101', 8082, 'key-2', false);
      lanControl.registerDevice('device-3', '192.168.1.102', 8083, 'key-3', true);

      expect(lanControl.isDeviceAvailable('device-1')).toBe(true);
      expect(lanControl.isDeviceAvailable('device-2')).toBe(true);
      expect(lanControl.isDeviceAvailable('device-3')).toBe(true);

      const device2 = lanControl.getLanDevice('device-2');
      expect(device2?.encrypt).toBe(false);
    });
  });

  describe('sendCommand - display name', () => {
    it('should use device name from cache in logs', async () => {
      mockPlatform.deviceCache.set('named-device', {
        name: 'Living Room Switch',
        devicekey: 'named-key',
      } as any);

      lanControl.registerDevice('named-device', '192.168.1.100', 8081, 'named-key', false);

      (global.fetch as any).mockResolvedValueOnce({
        json: () => Promise.resolve({ error: 0 }),
      });

      await lanControl.sendCommand('named-device', { switch: 'on' });

      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('Living Room Switch'),
      );
    });
  });

  describe('logDiscoveryStatus - devices not on LAN', () => {
    it('should log devices not found on LAN', async () => {
      vi.useFakeTimers();

      // Add device to cache but NOT to LAN
      mockPlatform.deviceCache.set('cloud-only-device', {
        name: 'Cloud Only Device',
        devicekey: 'cloud-key',
      } as any);

      // Add another device to LAN
      lanControl.registerDevice('lan-device', '192.168.1.100', 8081, 'device-key', true);

      await lanControl.start();
      vi.advanceTimersByTime(10000);

      // Should log about devices not on LAN
      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('NOT available via LAN'),
      );

      vi.useRealTimers();
    });

    it('should log each discovered device', async () => {
      vi.useFakeTimers();

      // Add device to cache that matches LAN device
      mockPlatform.deviceCache.set('lan-device', {
        name: 'LAN Device',
        devicekey: 'device-key',
      } as any);

      lanControl.registerDevice('lan-device', '192.168.1.100', 8081, 'device-key', true);

      await lanControl.start();
      vi.advanceTimersByTime(10000);

      expect(mockPlatform.log.info).toHaveBeenCalledWith(
        expect.stringContaining('LAN Device'),
      );

      vi.useRealTimers();
    });
  });

  describe('sendCommand - error code logging', () => {
    it('should log error code when device returns non-zero error', async () => {
      lanControl.registerDevice('test-device', '192.168.1.100', 8081, 'device-key', false);

      (global.fetch as any).mockResolvedValueOnce({
        json: () => Promise.resolve({ error: 400 }),
      });

      const result = await lanControl.sendCommand('test-device', { switch: 'on' });

      expect(result).toBe(false);
      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('error code: 400'),
      );
    });
  });

  describe('sendCommand - no apiKey', () => {
    it('should handle missing ewelinkApi', async () => {
      lanControl.registerDevice('test-device', '192.168.1.100', 8081, 'device-key', false);

      // Remove ewelinkApi
      (mockPlatform as any).ewelinkApi = undefined;

      (global.fetch as any).mockResolvedValueOnce({
        json: () => Promise.resolve({ error: 0 }),
      });

      const result = await lanControl.sendCommand('test-device', { switch: 'on' });

      expect(result).toBe(true);
    });
  });

  describe('buildPayload - unencrypted', () => {
    it('should send unencrypted payload when encrypt is false', async () => {
      lanControl.registerDevice('test-device', '192.168.1.100', 8081, 'device-key', false);

      (global.fetch as any).mockResolvedValueOnce({
        json: () => Promise.resolve({ error: 0 }),
      });

      await lanControl.sendCommand('test-device', { switch: 'on' });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.encrypt).toBeUndefined();
      expect(body.data).toEqual({ switch: 'on' });
    });
  });

  describe('buildPayload - encrypted', () => {
    it('should include IV in encrypted payload', async () => {
      lanControl.registerDevice('test-device', '192.168.1.100', 8081, 'test-device-key', true);

      (global.fetch as any).mockResolvedValueOnce({
        json: () => Promise.resolve({ error: 0 }),
      });

      await lanControl.sendCommand('test-device', { switch: 'on' });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.encrypt).toBe(true);
      expect(body.iv).toBeDefined();
      expect(body.data).toBeDefined();
      expect(typeof body.data).toBe('string'); // encrypted base64
    });

    it('should fall back to cloud instead of sending plaintext when the deviceKey is unknown', async () => {
      // Register device with encryption but no key (and none in the device cache)
      lanControl.registerDevice('no-key-device', '192.168.1.100', 8081, '', true);

      await expect(lanControl.sendCommand('no-key-device', { switch: 'on' })).resolves.toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should resolve a missing deviceKey lazily from the device cache when sending', async () => {
      lanControl.registerDevice('late-key-device', '192.168.1.100', 8081, '', true);
      // Cloud discovery fills the device cache after LAN registration
      mockPlatform.deviceCache.set('late-key-device', { name: 'Late', devicekey: 'late-key' } as any);

      (global.fetch as any).mockResolvedValueOnce({
        json: () => Promise.resolve({ error: 0 }),
      });

      await expect(lanControl.sendCommand('late-key-device', { switch: 'on' })).resolves.toBe(true);

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.encrypt).toBe(true);
      expect(lanControl.getLanDevice('late-key-device')?.deviceKey).toBe('late-key');
    });

    it('should fill a missing deviceKey on an existing entry when registered again', () => {
      lanControl.registerDevice('refill-device', '192.168.1.100', 8081, '', true);
      lanControl.registerDevice('refill-device', '192.168.1.200', 9999, 'fresh-key', true);

      const device = lanControl.getLanDevice('refill-device');
      expect(device?.deviceKey).toBe('fresh-key');
      // Address of the existing entry is kept
      expect(device?.ip).toBe('192.168.1.100');
    });

    it('should not overwrite a known deviceKey when registered again', () => {
      lanControl.registerDevice('keyed-device', '192.168.1.100', 8081, 'original-key', true);
      lanControl.registerDevice('keyed-device', '192.168.1.100', 8081, 'other-key', true);

      expect(lanControl.getLanDevice('keyed-device')?.deviceKey).toBe('original-key');
    });
  });

  describe('mDNS service discovery', () => {
    it('should discover device from mDNS service', async () => {
      mockPlatform.deviceCache.set('1001edbf36', {
        name: 'mDNS Device',
        devicekey: 'mdns-device-key',
      } as any);

      await lanControl.start();

      // Simulate mDNS service discovery
      if (mockState.bonjourServiceCallback) {
        mockState.bonjourServiceCallback({
          name: 'eWeLink_1001edbf36',
          addresses: ['192.168.1.150'],
          port: 8081,
          txt: { encrypt: 'true' },
        });
      }

      expect(lanControl.isDeviceAvailable('1001edbf36')).toBe(true);
      const device = lanControl.getLanDevice('1001edbf36');
      expect(device?.ip).toBe('192.168.1.150');
      expect(device?.port).toBe(8081);
    });

    it('should fill a missing device key when the service is re-announced after cloud login', async () => {
      // mDNS finds the device before cloud discovery: no key in the cache yet
      await lanControl.start();
      const announce = () => mockState.bonjourServiceCallback!({
        name: 'eWeLink_1001edbf36',
        addresses: ['192.168.1.150'],
        port: 8081,
        txt: { encrypt: 'true' },
      });
      announce();
      expect(lanControl.getLanDevice('1001edbf36')?.deviceKey).toBeUndefined();

      // Same ip/port re-announcement once the cloud filled the cache
      mockPlatform.deviceCache.set('1001edbf36', { name: 'mDNS Device', devicekey: 'mdns-device-key' } as any);
      announce();
      expect(lanControl.getLanDevice('1001edbf36')?.deviceKey).toBe('mdns-device-key');
    });

    it('should fill a missing device key on an mDNS entry from API registration, keeping its encrypt flag', async () => {
      await lanControl.start();
      mockState.bonjourServiceCallback!({
        name: 'eWeLink_1001edbf36',
        addresses: ['192.168.1.150'],
        port: 8081,
        txt: { encrypt: 'true' },
      });

      lanControl.registerDevice('1001edbf36', '192.168.1.150', 8081, 'api-key', true);

      const device = lanControl.getLanDevice('1001edbf36');
      expect(device?.deviceKey).toBe('api-key');
      expect(device?.encrypt).toBe(true);
    });

    it('should prefer IPv4 addresses', async () => {
      mockPlatform.deviceCache.set('1001edbf36', {
        name: 'mDNS Device',
        devicekey: 'mdns-device-key',
      } as any);

      await lanControl.start();

      if (mockState.bonjourServiceCallback) {
        mockState.bonjourServiceCallback({
          name: 'eWeLink_1001edbf36',
          addresses: ['fe80::1', '192.168.1.150'],
          port: 8081,
          txt: {},
        });
      }

      const device = lanControl.getLanDevice('1001edbf36');
      expect(device?.ip).toBe('192.168.1.150');
    });

    it('should ignore service without device ID', async () => {
      await lanControl.start();

      if (mockState.bonjourServiceCallback) {
        mockState.bonjourServiceCallback({
          name: 'SomeOtherService',
          addresses: ['192.168.1.150'],
          port: 8081,
          txt: {},
        });
      }

      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring service without device ID'),
      );
    });

    it('should ignore service without IP address', async () => {
      await lanControl.start();

      if (mockState.bonjourServiceCallback) {
        mockState.bonjourServiceCallback({
          name: 'eWeLink_1001edbf36',
          addresses: [],
          port: 8081,
          txt: {},
        });
      }

      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('No IP address'),
      );
    });

    it('should not update device if IP and port unchanged', async () => {
      mockPlatform.deviceCache.set('1001edbf36', {
        name: 'mDNS Device',
        devicekey: 'mdns-device-key',
      } as any);

      await lanControl.start();

      // First discovery
      if (mockState.bonjourServiceCallback) {
        mockState.bonjourServiceCallback({
          name: 'eWeLink_1001edbf36',
          addresses: ['192.168.1.150'],
          port: 8081,
          txt: {},
        });
      }

      vi.clearAllMocks();

      // Second discovery with same IP/port
      if (mockState.bonjourServiceCallback) {
        mockState.bonjourServiceCallback({
          name: 'eWeLink_1001edbf36',
          addresses: ['192.168.1.150'],
          port: 8081,
          txt: {},
        });
      }

      // Should not log discovery again
      expect(mockPlatform.log.debug).not.toHaveBeenCalledWith(
        expect.stringContaining('Discovered device'),
      );
    });

    it('should use default port 8081 if not specified', async () => {
      mockPlatform.deviceCache.set('1001edbf36', {
        name: 'mDNS Device',
        devicekey: 'mdns-device-key',
      } as any);

      await lanControl.start();

      if (mockState.bonjourServiceCallback) {
        mockState.bonjourServiceCallback({
          name: 'eWeLink_1001edbf36',
          addresses: ['192.168.1.150'],
          port: undefined,
          txt: {},
        });
      }

      const device = lanControl.getLanDevice('1001edbf36');
      expect(device?.port).toBe(8081);
    });

    it('should handle device going offline', async () => {
      mockPlatform.deviceCache.set('1001edbf36', {
        name: 'mDNS Device',
        devicekey: 'mdns-device-key',
      } as any);

      await lanControl.start();

      // First discover the device
      if (mockState.bonjourServiceCallback) {
        mockState.bonjourServiceCallback({
          name: 'eWeLink_1001edbf36',
          addresses: ['192.168.1.150'],
          port: 8081,
          txt: {},
        });
      }

      // Then simulate device going offline
      if (mockState.bonjourDownCallback) {
        mockState.bonjourDownCallback({
          name: 'eWeLink_1001edbf36',
        });
      }

      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('went offline'),
      );
    });
  });

  describe('UDP message handling', () => {
    it('should handle UDP update message', async () => {
      lanControl.registerDevice('test-udp-device', '192.168.1.100', 8081, 'device-key', false);

      await lanControl.start();

      // Simulate UDP message
      if (mockState.udpMessageCallback) {
        const msg = Buffer.from(JSON.stringify({
          deviceid: 'test-udp-device',
          action: 'update',
          params: { switch: 'on' },
        }));
        mockState.udpMessageCallback(msg, { address: '192.168.1.100', port: 8082 });
      }

      expect(mockPlatform.handleDeviceUpdate).toHaveBeenCalledWith(
        'test-udp-device',
        { switch: 'on' },
      );
    });

    it('should ignore UDP message for unknown device', async () => {
      await lanControl.start();

      if (mockState.udpMessageCallback) {
        const msg = Buffer.from(JSON.stringify({
          deviceid: 'unknown-device',
          action: 'update',
          params: { switch: 'on' },
        }));
        mockState.udpMessageCallback(msg, { address: '192.168.1.100', port: 8082 });
      }

      expect(mockPlatform.handleDeviceUpdate).not.toHaveBeenCalled();
    });

    it('should handle malformed UDP message', async () => {
      await lanControl.start();

      if (mockState.udpMessageCallback) {
        const msg = Buffer.from('not valid json');
        mockState.udpMessageCallback(msg, { address: '192.168.1.100', port: 8082 });
      }

      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('Error parsing UDP message'),
        expect.anything(),
      );
    });

    it('should log UDP socket errors', async () => {
      await lanControl.start();

      if (mockState.udpErrorCallback) {
        mockState.udpErrorCallback(new Error('Socket error'));
      }

      expect(mockPlatform.log.error).toHaveBeenCalledWith(
        expect.stringContaining('UDP socket error'),
        'Socket error',
      );
    });

    it('should ignore UDP message without update action', async () => {
      lanControl.registerDevice('test-udp-device', '192.168.1.100', 8081, 'device-key', false);

      await lanControl.start();

      if (mockState.udpMessageCallback) {
        const msg = Buffer.from(JSON.stringify({
          deviceid: 'test-udp-device',
          action: 'query',
          params: { switch: 'on' },
        }));
        mockState.udpMessageCallback(msg, { address: '192.168.1.100', port: 8082 });
      }

      expect(mockPlatform.handleDeviceUpdate).not.toHaveBeenCalled();
    });
  });
  describe('UDP message validation', () => {
    // Mirror of the device-side AES-128-CBC scheme (key = md5(deviceKey))
    const encryptForDevice = (params: object, deviceKey: string) => {
      const iv = crypto.randomBytes(16);
      const key = crypto.createHash('md5').update(Buffer.from(deviceKey)).digest();
      const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
      const data = cipher.update(JSON.stringify(params), 'utf8', 'base64') + cipher.final('base64');
      return { data, iv: iv.toString('base64') };
    };

    const sendUdp = (payload: object, address = '192.168.1.100') => {
      mockState.udpMessageCallback!(Buffer.from(JSON.stringify(payload)), { address, port: 8082 });
    };

    it('should ignore UDP updates from an address other than the device IP', async () => {
      lanControl.registerDevice('test-udp-device', '192.168.1.100', 8081, 'device-key', false);
      await lanControl.start();

      sendUdp({ deviceid: 'test-udp-device', action: 'update', params: { switch: 'on' } }, '192.168.1.66');

      expect(mockPlatform.handleDeviceUpdate).not.toHaveBeenCalled();
      expect(mockPlatform.log.debug).toHaveBeenCalledWith(expect.stringContaining('unexpected address'));
    });

    it('should drop plaintext params for an encrypted device', async () => {
      lanControl.registerDevice('enc-device', '192.168.1.100', 8081, 'device-key', true);
      await lanControl.start();

      sendUdp({ deviceid: 'enc-device', action: 'update', params: { switch: 'on' } });

      expect(mockPlatform.handleDeviceUpdate).not.toHaveBeenCalled();
      expect(mockPlatform.log.debug).toHaveBeenCalledWith(expect.stringContaining('Dropping unencrypted'));
    });

    it('should accept a correctly encrypted update for an encrypted device', async () => {
      lanControl.registerDevice('enc-device', '192.168.1.100', 8081, 'device-key', true);
      await lanControl.start();

      const { data, iv } = encryptForDevice({ switch: 'off' }, 'device-key');
      sendUdp({ deviceid: 'enc-device', action: 'update', encrypt: true, data, iv, params: { switch: 'on' } });

      expect(mockPlatform.handleDeviceUpdate).toHaveBeenCalledWith('enc-device', { switch: 'off' });
    });

    it('should drop an encrypted update that fails to decrypt', async () => {
      lanControl.registerDevice('enc-device', '192.168.1.100', 8081, 'device-key', true);
      await lanControl.start();

      const { data, iv } = encryptForDevice({ switch: 'off' }, 'wrong-key');
      sendUdp({ deviceid: 'enc-device', action: 'update', encrypt: true, data, iv, params: { switch: 'on' } });

      expect(mockPlatform.handleDeviceUpdate).not.toHaveBeenCalled();
    });

    it('should drop encrypted-device updates when no device key is known', async () => {
      lanControl.registerDevice('enc-device', '192.168.1.100', 8081, '', true);
      await lanControl.start();

      const { data, iv } = encryptForDevice({ switch: 'off' }, 'device-key');
      sendUdp({ deviceid: 'enc-device', action: 'update', encrypt: true, data, iv });

      expect(mockPlatform.handleDeviceUpdate).not.toHaveBeenCalled();
    });

    it('should resolve a missing device key lazily from the device cache for UDP updates', async () => {
      lanControl.registerDevice('enc-device', '192.168.1.100', 8081, '', true);
      await lanControl.start();
      mockPlatform.deviceCache.set('enc-device', { name: 'Enc', devicekey: 'device-key' } as any);

      const { data, iv } = encryptForDevice({ switch: 'off' }, 'device-key');
      sendUdp({ deviceid: 'enc-device', action: 'update', encrypt: true, data, iv });

      expect(mockPlatform.handleDeviceUpdate).toHaveBeenCalledWith('enc-device', { switch: 'off' });
    });

    it('should accept an authenticated encrypted update from a new address and follow it', async () => {
      lanControl.registerDevice('enc-device', '192.168.1.100', 8081, 'device-key', true);
      await lanControl.start();

      const { data, iv } = encryptForDevice({ switch: 'off' }, 'device-key');
      sendUdp({ deviceid: 'enc-device', action: 'update', encrypt: true, data, iv }, '192.168.1.77');

      expect(mockPlatform.handleDeviceUpdate).toHaveBeenCalledWith('enc-device', { switch: 'off' });
      expect(lanControl.getLanDevice('enc-device')?.ip).toBe('192.168.1.77');
      expect(mockPlatform.log.debug).toHaveBeenCalledWith(expect.stringContaining('address changed'));
    });

    it('should not follow a new address when the encrypted update fails to decrypt', async () => {
      lanControl.registerDevice('enc-device', '192.168.1.100', 8081, 'device-key', true);
      await lanControl.start();

      const { data, iv } = encryptForDevice({ switch: 'off' }, 'wrong-key');
      sendUdp({ deviceid: 'enc-device', action: 'update', encrypt: true, data, iv }, '192.168.1.77');

      expect(mockPlatform.handleDeviceUpdate).not.toHaveBeenCalled();
      expect(lanControl.getLanDevice('enc-device')?.ip).toBe('192.168.1.100');
    });
  });

  describe('stale LAN entries / cooldown', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      lanControl.registerDevice('test-device', '192.168.1.100', 8081, 'device-key', false);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const failNext = (times: number) => {
      for (let i = 0; i < times; i++) {
        (global.fetch as any).mockRejectedValueOnce(new Error('timeout'));
      }
    };

    it('should skip LAN for 60s after 3 consecutive failures', async () => {
      failNext(3);
      for (let i = 0; i < 3; i++) {
        expect(await lanControl.sendCommand('test-device', { switch: 'on' })).toBe(false);
      }
      expect(global.fetch).toHaveBeenCalledTimes(3);

      // In cooldown: returns false without touching the network
      expect(await lanControl.sendCommand('test-device', { switch: 'on' })).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(3);

      // After cooldown LAN is tried again
      vi.advanceTimersByTime(60000);
      (global.fetch as any).mockResolvedValueOnce({ json: () => Promise.resolve({ error: 0 }) });
      expect(await lanControl.sendCommand('test-device', { switch: 'on' })).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('should reset the failure count after a successful command', async () => {
      failNext(2);
      await lanControl.sendCommand('test-device', { switch: 'on' });
      await lanControl.sendCommand('test-device', { switch: 'on' });

      (global.fetch as any).mockResolvedValueOnce({ json: () => Promise.resolve({ error: 0 }) });
      await lanControl.sendCommand('test-device', { switch: 'on' });

      failNext(2);
      await lanControl.sendCommand('test-device', { switch: 'on' });
      await lanControl.sendCommand('test-device', { switch: 'on' });

      // Only 2 failures since the success - still not in cooldown
      (global.fetch as any).mockResolvedValueOnce({ json: () => Promise.resolve({ error: 0 }) });
      expect(await lanControl.sendCommand('test-device', { switch: 'on' })).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(6);
    });

    it('should count device error responses as failures', async () => {
      for (let i = 0; i < 3; i++) {
        (global.fetch as any).mockResolvedValueOnce({ json: () => Promise.resolve({ error: 500 }) });
        await lanControl.sendCommand('test-device', { switch: 'on' });
      }

      expect(await lanControl.sendCommand('test-device', { switch: 'on' })).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should enter cooldown on a Bonjour down event and leave it on the next up event', async () => {
      await lanControl.start();
      // mDNS service names carry hex device ids
      mockPlatform.deviceCache.set('1001edbf36', { name: 'Hex Device' } as any);
      const hexService = { name: 'eWeLink_1001edbf36', addresses: ['192.168.1.150'], port: 8081, txt: {} };
      mockState.bonjourServiceCallback!(hexService);

      mockState.bonjourDownCallback!(hexService);
      expect(await lanControl.sendCommand('1001edbf36', { switch: 'on' })).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();

      mockState.bonjourServiceCallback!(hexService);
      (global.fetch as any).mockResolvedValueOnce({ json: () => Promise.resolve({ error: 0 }) });
      expect(await lanControl.sendCommand('1001edbf36', { switch: 'on' })).toBe(true);
    });

    it('should leave cooldown when a valid UDP update arrives', async () => {
      await lanControl.start();
      failNext(3);
      for (let i = 0; i < 3; i++) {
        await lanControl.sendCommand('test-device', { switch: 'on' });
      }

      mockState.udpMessageCallback!(
        Buffer.from(JSON.stringify({ deviceid: 'test-device', action: 'update', params: { switch: 'on' } })),
        { address: '192.168.1.100', port: 8082 },
      );

      (global.fetch as any).mockResolvedValueOnce({ json: () => Promise.resolve({ error: 0 }) });
      expect(await lanControl.sendCommand('test-device', { switch: 'on' })).toBe(true);
    });

    it('should use the LAN HTTP timeout constant', async () => {
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
      (global.fetch as any).mockResolvedValueOnce({ json: () => Promise.resolve({ error: 0 }) });

      await lanControl.sendCommand('test-device', { switch: 'on' });

      expect(timeoutSpy).toHaveBeenCalledWith(3000);
      timeoutSpy.mockRestore();
    });
  });
});
