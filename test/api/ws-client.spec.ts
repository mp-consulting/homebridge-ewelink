import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockPlatform } from '../__mocks__/homebridge.js';

// Store event handlers for simulation - these need to be module-level for the mock
const eventHandlers: Map<string, ((...args: unknown[]) => void)[]> = new Map();

// Mock functions need to be declared as hoistable
const mockWsSend = vi.fn();
const mockWsClose = vi.fn();
const mockWsOn = vi.fn();
const mockWsOff = vi.fn();

// Mock WebSocket module with class defined inside the factory
vi.mock('ws', () => {
  class MockWebSocket {
    send: typeof mockWsSend;
    close: typeof mockWsClose;
    on: typeof mockWsOn;
    off: typeof mockWsOff;

    constructor(_url: string, _options?: object) {
      this.send = mockWsSend;
      this.close = mockWsClose;
      this.on = mockWsOn;
      this.off = mockWsOff;
    }
  }

  return {
    default: MockWebSocket,
  };
});

// Helper to trigger WebSocket events
function triggerWsEvent(event: string, ...args: unknown[]) {
  const handlers = eventHandlers.get(event);
  if (handlers) {
    handlers.forEach(handler => handler(...args));
  }
}

// Import after mocking
import { WSClient } from '../../src/api/ws-client.js';

describe('WSClient', () => {
  let wsClient: WSClient;
  let mockPlatform: ReturnType<typeof createMockPlatform>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    eventHandlers.clear();

    // Set up the mock implementations for event handling
    mockWsOn.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }
      eventHandlers.get(event)!.push(handler);
    });
    mockWsOff.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      const handlers = eventHandlers.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    });

    mockPlatform = createMockPlatform();

    // Setup mock ewelinkApi
    (mockPlatform as any).ewelinkApi = {
      getWsHost: vi.fn().mockResolvedValue('wss://test-ws-host.com:8080/api/ws'),
      getAccessToken: vi.fn().mockReturnValue('test-access-token'),
      getApiKey: vi.fn().mockReturnValue('test-api-key'),
      reloadTokensFromStorage: vi.fn().mockResolvedValue(undefined),
      login: vi.fn().mockResolvedValue(undefined),
    };

    // Setup device cache
    mockPlatform.deviceCache.set('test-device', {
      apikey: 'device-api-key',
      name: 'Test Device',
    } as any);

    // Setup getDeviceDisplayName
    (mockPlatform as any).getDeviceDisplayName = vi.fn((id: string) => `Device ${id}`);

    wsClient = new WSClient(mockPlatform as any);
  });

  afterEach(() => {
    // Clean up any pending connections/timers
    try {
      wsClient.disconnect();
    } catch {
      // Ignore errors during cleanup
    }
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create WSClient instance', () => {
      expect(wsClient).toBeDefined();
    });
  });

  describe('isConnected', () => {
    it('should return false initially', () => {
      expect(wsClient.isConnected()).toBe(false);
    });

    it('should return true when connected', () => {
      (wsClient as any).connected = true;
      expect(wsClient.isConnected()).toBe(true);
    });
  });

  describe('connect', () => {
    it('should throw error when API not initialized', async () => {
      (mockPlatform as any).ewelinkApi = null;
      wsClient = new WSClient(mockPlatform as any);

      await expect(wsClient.connect()).rejects.toThrow('API not initialized');
    });

    it('should get WebSocket host from API', async () => {
      const connectPromise = wsClient.connect();

      // Simulate successful connection and authentication
      await vi.advanceTimersByTimeAsync(0);
      triggerWsEvent('open');

      // Simulate auth response
      const authResponse = JSON.stringify({
        error: 0,
        config: { hbInterval: 90 },
      });
      triggerWsEvent('message', authResponse);

      await connectPromise;

      expect((mockPlatform as any).ewelinkApi.getWsHost).toHaveBeenCalled();
    });

    it('should reject on WebSocket error before connection', async () => {
      const connectPromise = wsClient.connect();

      await vi.advanceTimersByTimeAsync(0);
      triggerWsEvent('error', new Error('Connection failed'));

      await expect(connectPromise).rejects.toThrow('Connection failed');
    });

    it('should log error on WebSocket error', async () => {
      const connectPromise = wsClient.connect();

      await vi.advanceTimersByTimeAsync(0);
      triggerWsEvent('error', new Error('Connection failed'));

      await connectPromise.catch(() => {});

      expect(mockPlatform.log.error).toHaveBeenCalledWith(
        'WebSocket error:',
        'Connection failed',
      );
    });

    it('should handle WebSocket close event and schedule reconnect', async () => {
      const connectPromise = wsClient.connect();

      // Complete connection
      await vi.advanceTimersByTimeAsync(0);
      triggerWsEvent('open');
      triggerWsEvent('message', JSON.stringify({ error: 0, config: { hbInterval: 90 } }));
      await connectPromise;

      expect(wsClient.isConnected()).toBe(true);

      // Trigger close
      triggerWsEvent('close', 1000, Buffer.from('Normal closure'));

      expect(wsClient.isConnected()).toBe(false);
      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        'WebSocket closed:',
        1000,
        'Normal closure',
      );
    });

    it('should reset reconnect attempts on successful connection', async () => {
      (wsClient as any).reconnectAttempts = 5;

      const connectPromise = wsClient.connect();

      await vi.advanceTimersByTimeAsync(0);
      triggerWsEvent('open');
      triggerWsEvent('message', JSON.stringify({ error: 0, config: { hbInterval: 90 } }));

      await connectPromise;

      expect((wsClient as any).reconnectAttempts).toBe(0);
    });
  });

  describe('disconnect', () => {
    it('should close WebSocket connection', () => {
      (wsClient as any).ws = { close: mockWsClose };
      (wsClient as any).connected = true;

      wsClient.disconnect();

      expect(mockWsClose).toHaveBeenCalled();
      expect(wsClient.isConnected()).toBe(false);
    });

    it('should clear pending requests and reject them', () => {
      const resolve = vi.fn();
      const reject = vi.fn();
      const timeout = setTimeout(() => {}, 10000);

      (wsClient as any).pendingRequests.set('test-seq', { resolve, reject, timeout });
      (wsClient as any).ws = { close: mockWsClose };

      wsClient.disconnect();

      expect(reject).toHaveBeenCalledWith(new Error('WebSocket disconnected'));
      expect((wsClient as any).pendingRequests.size).toBe(0);
    });

    it('should stop heartbeat and reconnect timers', () => {
      const heartbeatInterval = setInterval(() => {}, 1000);
      const reconnectTimeout = setTimeout(() => {}, 1000);

      (wsClient as any).heartbeatInterval = heartbeatInterval;
      (wsClient as any).reconnectTimeout = reconnectTimeout;
      (wsClient as any).ws = { close: mockWsClose };

      wsClient.disconnect();

      expect((wsClient as any).heartbeatInterval).toBeNull();
      expect((wsClient as any).reconnectTimeout).toBeNull();
    });

    it('should handle null ws gracefully', () => {
      (wsClient as any).ws = null;

      expect(() => wsClient.disconnect()).not.toThrow();
    });
  });

  describe('sendCommand', () => {
    it('should return false when not connected', async () => {
      const result = await wsClient.sendCommand('test-device', { switch: 'on' });

      expect(result).toBe(false);
    });

    it('should warn when WebSocket not ready', async () => {
      await wsClient.sendCommand('test-device', { switch: 'on' });

      expect(mockPlatform.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cannot send command'),
      );
    });

    it('should warn when device not in cache', async () => {
      (wsClient as any).connected = true;
      (wsClient as any).ws = { send: mockWsSend };

      await wsClient.sendCommand('unknown-device', { switch: 'on' });

      expect(mockPlatform.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('Device not in cache'),
      );
    });

    it('should send command successfully when connected', async () => {
      (wsClient as any).connected = true;
      (wsClient as any).ws = { send: mockWsSend };

      const commandPromise = wsClient.sendCommand('test-device', { switch: 'on' });

      // Get the pending request and simulate success response
      await vi.advanceTimersByTimeAsync(0);

      const pendingKeys = Array.from((wsClient as any).pendingRequests.keys());
      expect(pendingKeys.length).toBe(1);

      const sequence = pendingKeys[0];
      const pending = (wsClient as any).pendingRequests.get(sequence);
      pending.resolve(true);

      const result = await commandPromise;
      expect(result).toBe(true);
      expect(mockWsSend).toHaveBeenCalledWith(expect.stringContaining('"action":"update"'));
    });

    it('should strip channel suffix from device ID', async () => {
      (wsClient as any).connected = true;
      (wsClient as any).ws = { send: mockWsSend };

      // Add device with parent ID
      mockPlatform.deviceCache.set('parent-device', {
        apikey: 'device-api-key',
        name: 'Parent Device',
      } as any);

      const commandPromise = wsClient.sendCommand('parent-deviceSW1', { switch: 'on' });
      await vi.advanceTimersByTimeAsync(0);

      // Should look up parent-device, not parent-deviceSW1
      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"deviceid":"parent-device"'),
      );

      // Cleanup
      const pendingKeys = Array.from((wsClient as any).pendingRequests.keys());
      const pending = (wsClient as any).pendingRequests.get(pendingKeys[0]);
      pending.resolve(true);
      await commandPromise;
    });

    it('should handle command timeout', async () => {
      (wsClient as any).connected = true;
      (wsClient as any).ws = { send: mockWsSend };

      // Attach catch handler immediately to prevent unhandled rejection
      let caughtError: Error | undefined;
      const commandPromise = wsClient.sendCommand('test-device', { switch: 'on' }).catch((err: Error) => {
        caughtError = err;
      });

      // Fast-forward past command timeout (10s) - use runAllTimersAsync for Promise-based timeouts
      await vi.runAllTimersAsync();

      await commandPromise;

      expect(caughtError).toBeDefined();
      expect(caughtError?.message).toBe('Command timeout');
      expect(mockPlatform.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('Command timeout'),
      );
    });

    it('should handle send error', async () => {
      (wsClient as any).connected = true;
      (wsClient as any).ws = {
        send: vi.fn().mockImplementation(() => {
          throw new Error('Send failed');
        }),
      };

      await expect(
        wsClient.sendCommand('test-device', { switch: 'on' }),
      ).rejects.toThrow('Send failed');

      expect(mockPlatform.log.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send WebSocket command'),
        expect.any(Error),
      );
    });
  });

  describe('queryDeviceState', () => {
    it('should return false when not connected', async () => {
      const result = await wsClient.queryDeviceState('test-device');

      expect(result).toBe(false);
    });

    it('should warn when WebSocket not connected', async () => {
      await wsClient.queryDeviceState('test-device');

      expect(mockPlatform.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('WebSocket not connected'),
      );
    });

    it('should warn when no API key available', async () => {
      (wsClient as any).connected = true;
      (wsClient as any).ws = { send: mockWsSend };
      (mockPlatform as any).ewelinkApi.getApiKey = vi.fn().mockReturnValue('');

      await wsClient.queryDeviceState('test-device');

      expect(mockPlatform.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('No API key available'),
      );
    });

    it('should send query message successfully', async () => {
      (wsClient as any).connected = true;
      (wsClient as any).ws = { send: mockWsSend };

      const queryPromise = wsClient.queryDeviceState('test-device');

      await vi.advanceTimersByTimeAsync(0);

      // Verify query was sent
      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"action":"query"'),
      );

      // Resolve the pending request
      const pendingKeys = Array.from((wsClient as any).pendingRequests.keys());
      const pending = (wsClient as any).pendingRequests.get(pendingKeys[0]);
      pending.resolve(true);

      const result = await queryPromise;
      expect(result).toBe(true);
    });

    it('should handle query timeout', async () => {
      (wsClient as any).connected = true;
      (wsClient as any).ws = { send: mockWsSend };

      // Attach catch handler immediately to prevent unhandled rejection
      let caughtError: Error | undefined;
      const queryPromise = wsClient.queryDeviceState('test-device').catch((err: Error) => {
        caughtError = err;
      });

      // Use runAllTimersAsync for Promise-based timeouts
      await vi.runAllTimersAsync();

      await queryPromise;

      expect(caughtError).toBeDefined();
      expect(caughtError?.message).toBe('Query timeout');
    });

    it('should handle query send error', async () => {
      (wsClient as any).connected = true;
      (wsClient as any).ws = {
        send: vi.fn().mockImplementation(() => {
          throw new Error('Query send failed');
        }),
      };

      await expect(
        wsClient.queryDeviceState('test-device'),
      ).rejects.toThrow('Query send failed');
    });
  });

  describe('message handling', () => {
    beforeEach(() => {
      (wsClient as any).connected = true;
      (wsClient as any).ws = {
        send: mockWsSend,
        on: mockWsOn,
        off: mockWsOff,
      };
    });

    it('should handle plain text pong message', () => {
      (wsClient as any).handleMessage('pong');

      expect(mockPlatform.log.debug).toHaveBeenCalledWith('Heartbeat pong received');
    });

    it('should handle JSON pong message', () => {
      (wsClient as any).handleMessage(JSON.stringify({ action: 'pong' }));

      expect(mockPlatform.log.debug).toHaveBeenCalledWith('Heartbeat pong received');
    });

    it('should handle device update message', () => {
      const message = {
        action: 'update',
        deviceid: 'test-device',
        params: { switch: 'on' },
      };

      (wsClient as any).handleMessage(JSON.stringify(message));

      expect(mockPlatform.handleDeviceUpdate).toHaveBeenCalledWith('test-device', { switch: 'on' });
    });

    it('should handle Zigbee reportSubDevice message', () => {
      const message = {
        action: 'reportSubDevice',
        deviceid: 'zigbee-bridge',
      };

      (wsClient as any).handleMessage(JSON.stringify(message));

      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('Zigbee sub-device report'),
      );
    });

    it('should handle Zigbee subDevice message', () => {
      const message = {
        action: 'subDevice',
        deviceid: 'zigbee-bridge',
      };

      (wsClient as any).handleMessage(JSON.stringify(message));

      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('Zigbee sub-device report'),
      );
    });

    it('should handle command success response', () => {
      const sequence = '123456789';
      const resolve = vi.fn();
      const reject = vi.fn();
      const timeout = setTimeout(() => {}, 10000);

      (wsClient as any).pendingRequests.set(sequence, { resolve, reject, timeout });

      const message = {
        error: 0,
        sequence,
        deviceid: 'test-device',
        params: { switch: 'on' },
      };

      (wsClient as any).handleMessage(JSON.stringify(message));

      expect(resolve).toHaveBeenCalledWith(true);
      expect(mockPlatform.handleDeviceUpdate).toHaveBeenCalledWith('test-device', { switch: 'on' });
    });

    it('should handle command success without params', () => {
      const sequence = '123456789';
      const resolve = vi.fn();
      const reject = vi.fn();
      const timeout = setTimeout(() => {}, 10000);

      (wsClient as any).pendingRequests.set(sequence, { resolve, reject, timeout });

      const message = {
        error: 0,
        sequence,
      };

      (wsClient as any).handleMessage(JSON.stringify(message));

      expect(resolve).toHaveBeenCalledWith(true);
      expect(mockPlatform.handleDeviceUpdate).not.toHaveBeenCalled();
    });

    it('should handle command failure response', () => {
      const sequence = '123456789';
      const resolve = vi.fn();
      const reject = vi.fn();
      const timeout = setTimeout(() => {}, 10000);

      (wsClient as any).pendingRequests.set(sequence, { resolve, reject, timeout });

      const message = {
        error: 500,
        sequence,
      };

      (wsClient as any).handleMessage(JSON.stringify(message));

      expect(reject).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle unknown sequence with device params', () => {
      const message = {
        error: 0,
        sequence: 'unknown-sequence',
        deviceid: 'test-device',
        params: { switch: 'off' },
      };

      (wsClient as any).handleMessage(JSON.stringify(message));

      expect(mockPlatform.handleDeviceUpdate).toHaveBeenCalledWith('test-device', { switch: 'off' });
    });

    it('should not update device for unknown sequence with error', () => {
      const message = {
        error: 500,
        sequence: 'unknown-sequence',
        deviceid: 'test-device',
        params: { switch: 'off' },
      };

      (wsClient as any).handleMessage(JSON.stringify(message));

      expect(mockPlatform.handleDeviceUpdate).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON gracefully', () => {
      (wsClient as any).handleMessage('invalid json {');

      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        'Failed to parse WebSocket message:',
        'invalid json {',
      );
    });

    it('should log non-heartbeat messages for debugging', () => {
      const message = {
        action: 'update',
        deviceid: 'test-device',
        params: { switch: 'on' },
      };

      (wsClient as any).handleMessage(JSON.stringify(message));

      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        'WebSocket message received:',
        expect.any(String),
      );
    });
  });

  describe('heartbeat', () => {
    beforeEach(() => {
      (wsClient as any).connected = true;
      (wsClient as any).ws = {
        send: mockWsSend,
        on: mockWsOn,
        off: mockWsOff,
      };
    });

    it('should send ping on heartbeat interval', () => {
      (wsClient as any).startHeartbeat();

      vi.advanceTimersByTime(90000);

      expect(mockWsSend).toHaveBeenCalledWith('ping');
    });

    it('should not send ping if not connected', () => {
      (wsClient as any).connected = false;
      (wsClient as any).startHeartbeat();

      vi.advanceTimersByTime(90000);

      expect(mockWsSend).not.toHaveBeenCalled();
    });

    it('should stop heartbeat when called', () => {
      (wsClient as any).startHeartbeat();
      (wsClient as any).stopHeartbeat();

      mockWsSend.mockClear();

      vi.advanceTimersByTime(100000);

      expect(mockWsSend).not.toHaveBeenCalled();
    });

    it('should use custom heartbeat interval from config', () => {
      (wsClient as any).heartbeatIntervalMs = 60000;
      (wsClient as any).startHeartbeat();

      vi.advanceTimersByTime(59999);
      expect(mockWsSend).not.toHaveBeenCalledWith('ping');

      vi.advanceTimersByTime(1);
      expect(mockWsSend).toHaveBeenCalledWith('ping');
    });
  });

  describe('reconnection', () => {
    it('should not reconnect if already reconnecting', () => {
      (wsClient as any).reconnecting = true;

      (wsClient as any).scheduleReconnect();

      expect(mockPlatform.log.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Scheduling WebSocket reconnection'),
      );
    });

    it('should stop after max reconnection attempts', () => {
      (wsClient as any).reconnectAttempts = 10;

      (wsClient as any).scheduleReconnect();

      expect(mockPlatform.log.error).toHaveBeenCalledWith(
        expect.stringContaining('max reconnection attempts'),
      );
    });

    it('should use exponential backoff for reconnection delay', () => {
      (wsClient as any).reconnectAttempts = 0;

      (wsClient as any).scheduleReconnect();

      expect(mockPlatform.log.info).toHaveBeenCalledWith(
        expect.stringContaining('Scheduling WebSocket reconnection attempt 1/10'),
      );
    });

    it('should attempt reconnection after delay', async () => {
      (wsClient as any).reconnectAttempts = 0;

      (wsClient as any).scheduleReconnect();

      // First attempt uses base delay (5s)
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockPlatform.log.info).toHaveBeenCalledWith(
        'Attempting to reconnect to WebSocket...',
      );
    });

    it('should reload tokens before reconnect', async () => {
      (wsClient as any).reconnectAttempts = 0;

      (wsClient as any).scheduleReconnect(false);

      await vi.advanceTimersByTimeAsync(5000);

      expect((mockPlatform as any).ewelinkApi.reloadTokensFromStorage).toHaveBeenCalled();
    });

    it('should force login when forceLogin is true', async () => {
      (wsClient as any).reconnectAttempts = 0;

      (wsClient as any).scheduleReconnect(true);

      await vi.advanceTimersByTimeAsync(5000);

      expect((mockPlatform as any).ewelinkApi.login).toHaveBeenCalled();
    });

    it('should handle reconnection error and schedule another attempt', async () => {
      (wsClient as any).reconnectAttempts = 0;

      // Mock connect to fail
      const originalConnect = wsClient.connect.bind(wsClient);
      wsClient.connect = vi.fn().mockRejectedValue(new Error('Connection failed'));

      (wsClient as any).scheduleReconnect();

      await vi.advanceTimersByTimeAsync(5000);

      expect(mockPlatform.log.error).toHaveBeenCalledWith(
        'Reconnection failed:',
        'Connection failed',
      );

      // Restore
      wsClient.connect = originalConnect;
    });

    it('should cap exponential backoff at 300 seconds', () => {
      (wsClient as any).reconnectAttempts = 10;
      (wsClient as any).reconnecting = false;

      // Reset max attempts for this test
      (wsClient as any).maxReconnectAttempts = 20;

      (wsClient as any).scheduleReconnect();

      // With 11 attempts, the delay would be 5 * 2^10 = 5120s, but capped at 300s
      expect(mockPlatform.log.info).toHaveBeenCalledWith(
        expect.stringContaining('in 300s'),
      );
    });
  });

  describe('authentication', () => {
    it('should send auth message on connection open', async () => {
      const connectPromise = wsClient.connect();

      await vi.advanceTimersByTimeAsync(0);
      triggerWsEvent('open');

      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"action":"userOnline"'),
      );

      triggerWsEvent('message', JSON.stringify({
        error: 0,
        config: { hbInterval: 90 },
      }));

      await connectPromise;
    });

    it('should reject on authentication timeout', async () => {
      // Attach catch handler immediately to prevent unhandled rejection
      let caughtError: Error | undefined;
      const connectPromise = wsClient.connect().catch((err: Error) => {
        caughtError = err;
      });

      await vi.advanceTimersByTimeAsync(0);
      triggerWsEvent('open');

      // Use runAllTimersAsync to properly handle Promise-based timeouts
      await vi.runAllTimersAsync();

      // Wait for promise to settle
      await connectPromise;

      expect(caughtError).toBeDefined();
      expect(caughtError?.message).toBe('Authentication timeout');
    });

    it('should update heartbeat interval from auth response', async () => {
      const connectPromise = wsClient.connect();

      await vi.advanceTimersByTimeAsync(0);
      triggerWsEvent('open');

      triggerWsEvent('message', JSON.stringify({
        error: 0,
        config: { hbInterval: 120 },
      }));

      await connectPromise;

      expect((wsClient as any).heartbeatIntervalMs).toBe(120000);
    });

    it('should reject on auth error 406 (token invalidated)', async () => {
      const connectPromise = wsClient.connect();

      await vi.advanceTimersByTimeAsync(0);
      triggerWsEvent('open');

      triggerWsEvent('message', JSON.stringify({
        error: 406,
      }));

      await expect(connectPromise).rejects.toThrow();
      expect(mockPlatform.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('Token invalidated'),
      );
    });

    it('should reject on other auth errors', async () => {
      const connectPromise = wsClient.connect();

      await vi.advanceTimersByTimeAsync(0);
      triggerWsEvent('open');

      triggerWsEvent('message', JSON.stringify({
        error: 500,
      }));

      await expect(connectPromise).rejects.toThrow('Authentication failed: 500');
    });

    it('should throw if authenticate called without ws', async () => {
      (wsClient as any).ws = null;

      await expect((wsClient as any).authenticate()).rejects.toThrow(
        'WebSocket or API not initialized',
      );
    });

    it('should throw if authenticate called without API', async () => {
      (wsClient as any).ws = { send: mockWsSend, on: mockWsOn };
      (mockPlatform as any).ewelinkApi = null;
      wsClient = new WSClient(mockPlatform as any);
      (wsClient as any).ws = { send: mockWsSend, on: mockWsOn };

      await expect((wsClient as any).authenticate()).rejects.toThrow(
        'WebSocket or API not initialized',
      );
    });
  });
});
