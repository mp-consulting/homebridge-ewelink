import WebSocket from 'ws';
import type { EWeLinkPlatform } from '../platform.js';
import type { WSMessage, DeviceParams } from '../types/index.js';
import { WebSocketAuthError } from '../types/index.js';
import { EWELINK_APP_ID } from '../settings.js';
import { CryptoUtils } from '../utils/crypto-utils.js';
import { API_TIMEOUTS } from '../constants/api-constants.js';
import { NETWORK_INTERVALS } from '../constants/network-constants.js';
import { CHANNEL_SUFFIX_PATTERN } from '../constants/device-constants.js';

/**
 * WebSocket client for real-time device updates
 */
export class WSClient {
  /** Upper bound for the reconnect backoff delay */
  private static readonly MAX_RECONNECT_DELAY_MS = 300000;
  /** Random +/- fraction applied to reconnect delays to avoid thundering herds */
  private static readonly RECONNECT_JITTER = 0.2;
  /** Rejection message for requests already sent when the socket closed (not safe to resend) */
  static readonly IN_FLIGHT_LOST_MESSAGE = 'WebSocket closed before response';

  private readonly platform: EWeLinkPlatform;
  private ws: WebSocket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatIntervalMs: number = NETWORK_INTERVALS.WEBSOCKET_HEARTBEAT;
  private reconnecting = false;
  private connected = false;
  private reconnectAttempts = 0;
  /** After this many attempts, keep retrying at the maximum backoff delay */
  private maxReconnectAttempts = 10;
  /**
   * Set by disconnect() - suppresses any further reconnects until start() or connect() is
   * called. Internal reconnect paths never clear it.
   */
  private stopped = false;
  /** Time of the last message received (any message counts as liveness) */
  private lastMessageAt = 0;
  /** Last sequence number issued (keeps sequences unique and increasing) */
  private lastSequence = 0;
  /** Reject function of an in-progress connect(), so disconnect() can abort it */
  private pendingConnectReject: ((reason: Error) => void) | null = null;
  private pendingRequests: Map<string, {
    resolve: (value: boolean) => void;
    reject: (reason?: unknown) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(platform: EWeLinkPlatform) {
    this.platform = platform;
  }

  /**
   * Connect in the background: on failure, keep retrying with backoff until
   * connected or disconnect() is called. Never rejects; resolves once the first
   * attempt has settled (successfully or not).
   */
  async start(): Promise<void> {
    this.stopped = false;
    try {
      await this.openSocket();
    } catch (error) {
      if (this.stopped) {
        return;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      const tokenInvalidated = (error instanceof WebSocketAuthError && error.code === 406)
        || errorMessage.includes('AUTH_TOKEN_INVALIDATED');
      this.platform.log.warn(`WebSocket connection failed: ${errorMessage} - retrying in the background`);
      this.scheduleReconnect(tokenInvalidated);
    }
  }

  /**
   * Connect to WebSocket server (explicit user call: re-enables reconnects after disconnect())
   */
  async connect(): Promise<void> {
    this.stopped = false;
    return this.openSocket();
  }

  /**
   * Open and authenticate a socket. Does not touch `stopped`, so a reconnect racing with
   * disconnect() cannot revive the client.
   */
  private async openSocket(): Promise<void> {
    if (!this.platform.ewelinkApi) {
      throw new Error('API not initialized');
    }

    const wsHost = await this.platform.ewelinkApi.getWsHost();
    if (this.stopped) {
      throw new Error('WebSocket disconnected');
    }
    this.platform.log.debug('Connecting to WebSocket:', wsHost);

    // Never leave a previous socket (and its listeners) alive
    this.closeSocket();
    this.connected = false;

    return new Promise<void>((resolve, reject) => {
      const settle = (error?: Error) => {
        this.pendingConnectReject = null;
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      this.pendingConnectReject = settle;

      try {
        const ws = new WebSocket(wsHost, {
          handshakeTimeout: 30000,
        });
        this.ws = ws;

        ws.on('open', () => {
          this.platform.log.debug('WebSocket connection opened');
          this.authenticate()
            .then(() => {
              this.connected = true;
              this.reconnectAttempts = 0; // Reset on successful connection
              this.startHeartbeat();
              settle();
            })
            .catch((error: Error) => {
              // Tear down the half-open socket; the caller decides whether to retry
              if (this.ws === ws) {
                this.closeSocket();
              }
              settle(error);
            });
        });

        ws.on('message', (data) => {
          this.lastMessageAt = Date.now();
          this.handleMessage(data.toString());
        });

        ws.on('error', (error) => {
          this.platform.log.error('WebSocket error:', error.message);
          if (!this.connected) {
            settle(error);
          }
        });

        ws.on('close', (code, reason) => {
          this.platform.log.debug('WebSocket closed:', code, reason.toString());
          this.connected = false;
          this.stopHeartbeat();
          // These requests were already sent: the device may have executed them, so they
          // must not be resent blindly (see CommandDispatcher retry rules)
          this.rejectPendingRequests(new Error(WSClient.IN_FLIGHT_LOST_MESSAGE));
          if (this.ws === ws) {
            this.ws = null;
          }
          if (!this.stopped) {
            this.scheduleReconnect();
          }
        });

      } catch (error) {
        settle(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Detach listeners from the current socket and terminate it
   */
  private closeSocket(): void {
    const ws = this.ws;
    if (!ws) {
      return;
    }
    this.ws = null;
    ws.removeAllListeners();
    // ws may emit 'error' while aborting a handshake - swallow it instead of crashing
    ws.on('error', () => {});
    ws.terminate();
  }

  /**
   * Reject and clear all in-flight command/query requests
   */
  private rejectPendingRequests(reason: Error): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(reason);
    }
    this.pendingRequests.clear();
  }

  /**
   * Generate a unique, increasing sequence number (millisecond timestamp format)
   */
  private nextSequence(): string {
    this.lastSequence = Math.max(Date.now(), this.lastSequence + 1);
    return String(this.lastSequence);
  }

  /**
   * Whether the socket is authenticated and open for sending
   */
  private isSocketReady(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Authenticate with the WebSocket server
   */
  private async authenticate(): Promise<void> {
    if (!this.ws || !this.platform.ewelinkApi) {
      throw new Error('WebSocket or API not initialized');
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = CryptoUtils.generateNonce();

    const authMessage = {
      action: 'userOnline',
      at: this.platform.ewelinkApi.getAccessToken(),
      apikey: this.platform.ewelinkApi.getApiKey(),
      appid: EWELINK_APP_ID,
      nonce,
      ts: timestamp,
      userAgent: 'app',
      sequence: this.nextSequence(),
      version: 8,
    };

    return new Promise((resolve, reject) => {
      // On timeout the caller (connect) tears the socket down, removing handleAuth with it
      const timeout = setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, API_TIMEOUTS.WEBSOCKET_AUTH);

      const handleAuth = (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString()) as WSMessage;

          if (message.error === 0 && message.config) {
            clearTimeout(timeout);
            this.ws?.off('message', handleAuth);

            // Update heartbeat interval if provided
            if (message.config.hbInterval) {
              this.heartbeatIntervalMs = message.config.hbInterval * 1000;
            }

            this.platform.log.info('WebSocket authenticated successfully');
            resolve();
          } else if (message.error !== undefined && message.error !== 0) {
            clearTimeout(timeout);
            this.ws?.off('message', handleAuth);

            // Error 406 means token invalidated (concurrent session/login elsewhere)
            if (message.error === 406) {
              this.platform.log.warn('WebSocket authentication failed: Token invalidated (concurrent session detected)');
              reject(new WebSocketAuthError('AUTH_TOKEN_INVALIDATED', 406));
            } else {
              reject(new Error(`Authentication failed: ${message.error}`));
            }
          }
        } catch (error) {
          // Not a JSON message, ignore
        }
      };

      this.ws!.on('message', handleAuth);
      this.ws!.send(JSON.stringify(authMessage));
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    // Handle plain text heartbeat response
    if (data === 'pong') {
      this.platform.log.debug('Heartbeat pong received');
      return;
    }

    try {
      const message = JSON.parse(data) as WSMessage;

      // Log all non-heartbeat messages for debugging
      if (message.action !== 'pong') {
        this.platform.log.debug('WebSocket message received:', JSON.stringify(message));
      }

      // Handle JSON heartbeat response (some servers send JSON)
      if (message.action === 'pong') {
        this.platform.log.debug('Heartbeat pong received');
        return;
      }

      // Handle device update
      if (message.action === 'update' && message.deviceid && message.params) {
        this.platform.log.debug('Device update received:', message.deviceid);
        this.platform.handleDeviceUpdate(message.deviceid, message.params);
        return;
      }

      // Handle Zigbee bridge sub-device reports
      // These messages are sent by Zigbee bridges when sub-devices report state changes
      if (message.action === 'reportSubDevice' || message.action === 'subDevice') {
        this.platform.log.debug(`Zigbee sub-device report received (${message.action})`);
        // These are informational - the actual device updates come via 'update' messages
        return;
      }

      // Handle response to our commands
      if (message.sequence) {
        const pending = this.pendingRequests.get(message.sequence);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(message.sequence);

          if (message.error === 0) {
            this.platform.log.debug(`Command response received: success (error: ${message.error})`);

            // If response includes device params, update the device state
            if (message.deviceid && message.params) {
              this.platform.log.debug(`Updating device ${message.deviceid} with query response params`);
              this.platform.handleDeviceUpdate(message.deviceid, message.params);
            }

            pending.resolve(true);
          } else {
            this.platform.log.error(`Command response received: failed (error: ${message.error})`);
            pending.reject(new Error(`Command failed: ${message.error}`));
          }
        } else {
          this.platform.log.debug(`Received response for unknown sequence: ${message.sequence}`);

          // Even for unknown sequences, if we have device params, update the device
          // This handles cases where responses come with different sequence numbers
          if (message.error === 0 && message.deviceid && message.params) {
            this.platform.log.debug(`Updating device ${message.deviceid} from unmatched sequence response`);
            this.platform.handleDeviceUpdate(message.deviceid, message.params);
          }
        }
      }

    } catch (error) {
      this.platform.log.debug('Failed to parse WebSocket message:', data);
    }
  }

  /**
   * Send command to device
   */
  async sendCommand(deviceId: string, params: DeviceParams): Promise<boolean> {
    if (!this.isSocketReady() || !this.platform.ewelinkApi) {
      this.platform.log.warn(`Cannot send command to ${deviceId}: WebSocket not ready`);
      return false;
    }

    // Strip channel suffix (e.g., SW1) to get the parent device ID
    const parentDeviceId = deviceId.replace(CHANNEL_SUFFIX_PATTERN, '');

    const device = this.platform.deviceCache.get(parentDeviceId);
    if (!device) {
      this.platform.log.warn(`Cannot send command to ${deviceId}: Device not in cache`);
      return false;
    }

    const sequence = this.nextSequence();

    const message = {
      action: 'update',
      deviceid: parentDeviceId,
      apikey: device.apikey,
      selfApikey: this.platform.ewelinkApi.getApiKey(),
      params,
      sequence,
      userAgent: 'app',
    };

    this.platform.log.debug(`Sending WebSocket command to ${deviceId}:`, JSON.stringify(params));

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(sequence);
        this.platform.log.warn(`Command timeout for ${deviceId}`);
        reject(new Error('Command timeout'));
      }, API_TIMEOUTS.WEBSOCKET_COMMAND);

      this.pendingRequests.set(sequence, { resolve, reject, timeout });

      try {
        this.ws!.send(JSON.stringify(message));
        this.platform.log.debug(`WebSocket command sent successfully for ${deviceId}`);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(sequence);
        this.platform.log.error(`Failed to send WebSocket command to ${deviceId}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastMessageAt = Date.now();

    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.connected) {
        // Nothing received for two intervals - the connection is dead even if TCP hasn't noticed.
        // Terminating triggers the close handler, which schedules a reconnect.
        const silenceMs = Date.now() - this.lastMessageAt;
        if (silenceMs > this.heartbeatIntervalMs * 2) {
          this.platform.log.warn(`WebSocket silent for ${Math.round(silenceMs / 1000)}s, reconnecting...`);
          this.ws.terminate();
          return;
        }

        this.ws.send('ping');
        this.platform.log.debug('Heartbeat ping sent');
      }
    }, this.heartbeatIntervalMs);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(forceLogin = false): void {
    if (this.reconnecting || this.stopped) {
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;

    // Never give up: past the max attempts, keep retrying at the capped delay
    if (this.reconnectAttempts === this.maxReconnectAttempts + 1) {
      this.platform.log.error(
        `WebSocket still disconnected after ${this.maxReconnectAttempts} attempts. ` +
        `Will keep retrying every ~${WSClient.MAX_RECONNECT_DELAY_MS / 1000}s - please check your credentials and network.`,
      );
    }

    // Exponential backoff: 5s, 10s, 20s, 40s, 80s, ... (capped at 300s), with +/-20% jitter
    const baseDelay = NETWORK_INTERVALS.WEBSOCKET_RECONNECT;
    const exponent = Math.min(this.reconnectAttempts - 1, this.maxReconnectAttempts);
    const backoffDelay = Math.min(baseDelay * Math.pow(2, exponent), WSClient.MAX_RECONNECT_DELAY_MS);
    const delay = Math.round(backoffDelay * (1 - WSClient.RECONNECT_JITTER + Math.random() * 2 * WSClient.RECONNECT_JITTER));

    this.platform.log.info(
      `Scheduling WebSocket reconnection attempt ${this.reconnectAttempts} ` +
      `in ${Math.round(delay / 1000)}s...`,
    );

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      if (this.stopped) {
        this.reconnecting = false;
        return;
      }
      this.platform.log.info('Attempting to reconnect to WebSocket...');

      try {
        if (this.platform.ewelinkApi) {
          if (forceLogin) {
            // Force fresh login when token was invalidated (406 error)
            this.platform.log.info('Performing fresh login due to token invalidation...');
            await this.platform.ewelinkApi.login();
          } else {
            // Normal reconnect - reload tokens in case they were updated
            this.platform.log.debug('Reloading tokens from storage before reconnect...');
            await this.platform.ewelinkApi.reloadTokensFromStorage();
          }
        }

        // disconnect() may have been called while logging in / reloading tokens
        if (this.stopped) {
          this.reconnecting = false;
          return;
        }

        await this.openSocket();
        this.reconnecting = false;
      } catch (error) {
        if (this.stopped) {
          this.reconnecting = false;
          return;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isAuthError = error instanceof WebSocketAuthError;

        // Check if this is a 406 token invalidation error
        if ((isAuthError && error.code === 406) || errorMessage.includes('AUTH_TOKEN_INVALIDATED')) {
          this.platform.log.error(
            'Reconnection failed: Token invalidated. ' +
            'This usually means you logged in elsewhere. Will retry with fresh login...',
          );
          this.reconnecting = false;
          this.scheduleReconnect(true); // Force login on next attempt
        } else {
          this.platform.log.error('Reconnection failed:', errorMessage);
          this.reconnecting = false;
          this.scheduleReconnect(false); // Normal retry
        }
      }
    }, delay);
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.stopped = true;
    this.reconnecting = false;
    this.stopHeartbeat();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Detach listeners first so the close event cannot schedule a reconnect
    this.closeSocket();
    this.connected = false;

    // Abort an in-progress connect() and reject all pending requests
    this.pendingConnectReject?.(new Error('WebSocket disconnected'));
    this.rejectPendingRequests(new Error('WebSocket disconnected'));
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Query device state to get current parameters
   */
  async queryDeviceState(deviceId: string): Promise<boolean> {
    const displayName = this.platform.getDeviceDisplayName(deviceId);

    if (!this.isSocketReady() || !this.platform.ewelinkApi) {
      this.platform.log.warn(`Cannot query device ${displayName}: WebSocket not connected`);
      return false;
    }

    const apiKey = this.platform.ewelinkApi.getApiKey();
    if (!apiKey) {
      this.platform.log.warn(`Cannot query device ${displayName}: No API key available`);
      return false;
    }

    const sequence = this.nextSequence();
    const message = {
      action: 'query',
      apikey: apiKey,
      deviceid: deviceId,
      params: [],
      sequence,
      ts: 0,
      userAgent: 'app',
    };

    this.platform.log.debug(`Querying device state for ${displayName}`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(sequence);
        this.platform.log.warn(`Query timeout for ${displayName}`);
        reject(new Error('Query timeout'));
      }, API_TIMEOUTS.WEBSOCKET_COMMAND);

      this.pendingRequests.set(sequence, { resolve, reject, timeout });

      try {
        this.ws!.send(JSON.stringify(message));
        this.platform.log.debug(`Query sent for ${displayName}`);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(sequence);
        this.platform.log.error(`Failed to query device ${displayName}:`, error);
        reject(error);
      }
    });
  }

}
