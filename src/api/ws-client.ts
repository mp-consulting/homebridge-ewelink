import WebSocket from 'ws';
import { EWeLinkPlatform } from '../platform.js';
import { WSMessage, DeviceParams } from '../types/index.js';
import { EWELINK_APP_ID } from '../settings.js';
import { CryptoUtils } from '../utils/crypto-utils.js';
import { API_TIMEOUTS } from '../constants/api-constants.js';
import { NETWORK_INTERVALS } from '../constants/network-constants.js';

/**
 * WebSocket client for real-time device updates
 */
export class WSClient {
  private readonly platform: EWeLinkPlatform;
  private ws: WebSocket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatIntervalMs: number = NETWORK_INTERVALS.WEBSOCKET_HEARTBEAT;
  private reconnecting = false;
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private pendingRequests: Map<string, {
    resolve: (value: boolean) => void;
    reject: (reason?: unknown) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(platform: EWeLinkPlatform) {
    this.platform = platform;
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (!this.platform.ewelinkApi) {
      throw new Error('API not initialized');
    }

    const wsHost = await this.platform.ewelinkApi.getWsHost();
    this.platform.log.debug('Connecting to WebSocket:', wsHost);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsHost, {
          handshakeTimeout: 30000,
        });

        this.ws.on('open', () => {
          this.platform.log.debug('WebSocket connection opened');
          this.authenticate()
            .then(() => {
              this.connected = true;
              this.reconnectAttempts = 0; // Reset on successful connection
              this.startHeartbeat();
              resolve();
            })
            .catch(reject);
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('error', (error) => {
          this.platform.log.error('WebSocket error:', error.message);
          if (!this.connected) {
            reject(error);
          }
        });

        this.ws.on('close', (code, reason) => {
          this.platform.log.debug('WebSocket closed:', code, reason.toString());
          this.connected = false;
          this.stopHeartbeat();
          this.scheduleReconnect();
        });

      } catch (error) {
        reject(error);
      }
    });
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
      sequence: String(Date.now()),
      version: 8,
    };

    return new Promise((resolve, reject) => {
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
              const error = new Error('AUTH_TOKEN_INVALIDATED');
              (error as any).code = 406;
              reject(error);
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
    if (!this.ws || !this.connected || !this.platform.ewelinkApi) {
      this.platform.log.warn(`Cannot send command to ${deviceId}: WebSocket not ready`);
      return false;
    }

    const device = this.platform.deviceCache.get(deviceId);
    if (!device) {
      this.platform.log.warn(`Cannot send command to ${deviceId}: Device not in cache`);
      return false;
    }

    const sequence = String(Date.now());

    const message = {
      action: 'update',
      deviceid: deviceId,
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

    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.connected) {
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
    if (this.reconnecting) {
      return;
    }

    // Check if max reconnect attempts reached
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.platform.log.error(
        `WebSocket max reconnection attempts (${this.maxReconnectAttempts}) reached. ` +
        'Please check your credentials or restart Homebridge.',
      );
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;

    // Exponential backoff: 5s, 10s, 20s, 40s, 80s, ... (capped at 300s)
    const baseDelay = NETWORK_INTERVALS.WEBSOCKET_RECONNECT;
    const backoffDelay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), 300000);

    this.platform.log.info(
      `Scheduling WebSocket reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} ` +
      `in ${Math.round(backoffDelay / 1000)}s...`,
    );

    this.reconnectTimeout = setTimeout(async () => {
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

        await this.connect();
        this.reconnecting = false;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = (error as any)?.code;

        // Check if this is a 406 token invalidation error
        if (errorCode === 406 || errorMessage.includes('AUTH_TOKEN_INVALIDATED')) {
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
    }, backoffDelay);
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.stopHeartbeat();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;

    // Reject all pending requests
    for (const [sequence, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('WebSocket disconnected'));
    }
    this.pendingRequests.clear();
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
    if (!this.ws || !this.connected || !this.platform.ewelinkApi) {
      this.platform.log.warn(`Cannot query device ${deviceId}: WebSocket not connected`);
      return false;
    }

    const apiKey = this.platform.ewelinkApi.getApiKey();
    if (!apiKey) {
      this.platform.log.warn(`Cannot query device ${deviceId}: No API key available`);
      return false;
    }

    const sequence = String(Date.now());
    const message = {
      action: 'query',
      apikey: apiKey,
      deviceid: deviceId,
      params: [],
      sequence,
      ts: 0,
      userAgent: 'app',
    };

    this.platform.log.debug(`Querying device state for ${deviceId}`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(sequence);
        this.platform.log.warn(`Query timeout for ${deviceId}`);
        reject(new Error('Query timeout'));
      }, API_TIMEOUTS.WEBSOCKET_COMMAND);

      this.pendingRequests.set(sequence, { resolve, reject, timeout });

      try {
        this.ws!.send(JSON.stringify(message));
        this.platform.log.debug(`Query sent for ${deviceId}`);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(sequence);
        this.platform.log.error(`Failed to query device ${deviceId}:`, error);
        reject(error);
      }
    });
  }

}
