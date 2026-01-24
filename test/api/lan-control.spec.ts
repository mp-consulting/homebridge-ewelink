import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

    it('should not encrypt when deviceKey is missing', async () => {
      // Register device with encryption but no key
      lanControl.registerDevice('no-key-device', '192.168.1.100', 8081, '', true);

      (global.fetch as any).mockResolvedValueOnce({
        json: () => Promise.resolve({ error: 0 }),
      });

      await lanControl.sendCommand('no-key-device', { switch: 'on' });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      // Without a device key, encryption is skipped
      expect(body.encrypt).toBeUndefined();
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
});
