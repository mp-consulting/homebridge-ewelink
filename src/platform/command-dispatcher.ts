import type { Logging } from 'homebridge';
import type { DeviceParams, EWeLinkPlatformConfig } from '../types/index.js';
import { CHANNEL_SUFFIX_PATTERN } from '../constants/device-constants.js';
import { isGroupDevice } from '../constants/device-catalog.js';
import { QUERY_RETRY } from '../constants/api-constants.js';
import { CommandQueue } from '../utils/command-queue.js';
import type { DeviceRegistry } from './device-registry.js';
import type { CloudTransport, GroupTransport, LanTransport } from './transports.js';

export interface CommandDispatcherOptions {
  log: Logging;
  config: EWeLinkPlatformConfig;
  registry: DeviceRegistry;
  /** Current LAN transport (undefined until started / in WAN mode) */
  getLan: () => LanTransport | undefined;
  /** Current cloud transport (undefined until started / in LAN mode) */
  getCloud: () => CloudTransport | undefined;
  /** HTTP API used for group commands */
  getGroupApi: () => GroupTransport | undefined;
  /** Delay between retries (overridable for tests) */
  sleep?: (ms: number) => Promise<void>;
  /** Max pending cloud commands (default 100) */
  maxQueueSize?: number;
}

/**
 * Errors meaning the command never reached the server, so resending cannot cause a duplicate.
 * Deliberately excludes WSClient.IN_FLIGHT_LOST_MESSAGE ('WebSocket closed before response'):
 * that request was already sent and may have been executed, so it is never retried.
 */
const NOT_DELIVERED_PATTERN = /not connected|not ready|not open/i;
const TIMEOUT_PATTERN = /timeout/i;
/** At most this many retries after a timeout (the command may have been executed) */
const MAX_TIMEOUT_RETRIES = 1;

/**
 * Routes device commands: groups via HTTP, otherwise LAN first and cloud
 * (WebSocket, through a throttled bounded queue) as fallback.
 */
export class CommandDispatcher {
  private readonly queue: CommandQueue;
  private readonly sleep: (ms: number) => Promise<void>;
  private curtainInitCounter = 0;

  constructor(private readonly opts: CommandDispatcherOptions) {
    this.sleep = opts.sleep ?? ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
    // Conservative settings to prevent eWeLink API timeouts on bulk commands (configurable)
    this.queue = new CommandQueue({
      minInterval: opts.config.commandQueueInterval ?? 250,
      concurrency: opts.config.commandQueueConcurrency ?? 3,
      maxSize: opts.maxQueueSize ?? 100,
      log: (message) => opts.log.debug(`[CommandQueue] ${message}`),
      getDeviceName: (deviceId) => opts.registry.getDeviceDisplayName(deviceId),
    });
  }

  /**
   * Send command to device (cloud commands are queued to prevent bulk command overload)
   */
  async sendDeviceCommand(deviceId: string, params: DeviceParams): Promise<boolean> {
    const { log, config, registry } = this.opts;
    // Strip channel suffix (e.g., SW1) to get the parent device ID for cache lookup
    const parentDeviceId = deviceId.replace(CHANNEL_SUFFIX_PATTERN, '');
    const device = registry.deviceCache.get(parentDeviceId);
    const displayName = registry.getDeviceDisplayName(parentDeviceId);

    if (!device) {
      log.error('Device not found in cache:', deviceId);
      return false;
    }

    // Groups must use HTTP API with type=2 (not queued - different path)
    const groupApi = this.opts.getGroupApi();
    if (isGroupDevice(device.extra?.uiid || 0) && groupApi) {
      log.debug(`Sending group command to ${deviceId} via HTTP API`);
      return await groupApi.updateGroup(deviceId, params);
    }

    // Try LAN first - no queue needed for local network (no rate limiting).
    // Note: LANControl reports any failure as `false` (it does not distinguish "never sent"
    // from "sent but no reply"), so a LAN timeout still falls back to the cloud.
    const lan = this.opts.getLan();
    if (lan && config.mode !== 'wan') {
      if (await lan.sendCommand(deviceId, params)) {
        return true;
      }
    }

    try {
      return await this.queue.enqueue(deviceId, () => this.executeCloudCommand(deviceId, params, displayName));
    } catch (error) {
      log.warn(`[${displayName}] Command not sent: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Execute a cloud command via WebSocket (called by the command queue).
   *
   * Retry rules (QUERY_RETRY.MAX_ATTEMPTS total attempts, QUERY_RETRY.DELAY_MS apart):
   * - not delivered (socket not open → `false`, or a "not connected/ready/open" error): retried,
   *   resending is safe
   * - timeout: retried at most once, since the device may already have executed it
   * - socket closed while the sent command awaited its reply ("closed before response"): not
   *   retried - the command may have been executed and resending could duplicate a
   *   non-idempotent action (e.g. a toggle or a pulse)
   * - any other error (server rejected the command): not retried
   */
  private async executeCloudCommand(deviceId: string, params: DeviceParams, displayName: string): Promise<boolean> {
    const { log, config } = this.opts;
    let timeoutRetries = 0;

    for (let attempt = 1; attempt <= QUERY_RETRY.MAX_ATTEMPTS; attempt++) {
      const cloud = this.opts.getCloud();
      if (!cloud || config.mode === 'lan') {
        log.error('No available control method for device:', deviceId);
        return false;
      }

      const isLast = attempt === QUERY_RETRY.MAX_ATTEMPTS;
      let reason: string;
      try {
        if (await cloud.sendCommand(deviceId, params)) {
          return true;
        }
        // Not sent: the socket is not open (likely reconnecting)
        if (isLast) {
          log.error(`[${displayName}] Failed to send command: cloud connection unavailable`);
          return false;
        }
        reason = 'cloud connection unavailable';
      } catch (error) {
        reason = error instanceof Error ? error.message : String(error);
        const retryable = NOT_DELIVERED_PATTERN.test(reason)
          || (TIMEOUT_PATTERN.test(reason) && timeoutRetries < MAX_TIMEOUT_RETRIES);
        if (!retryable || isLast) {
          log.error(attempt > 1
            ? `[${displayName}] Failed to send command after ${attempt} attempts: ${reason}`
            : `[${displayName}] Failed to send command: ${reason}`);
          return false;
        }
        if (TIMEOUT_PATTERN.test(reason)) {
          timeoutRetries++;
        }
      }

      log.debug(`Command attempt ${attempt}/${QUERY_RETRY.MAX_ATTEMPTS} failed for ${displayName}: ${reason}, retrying...`);
      await this.sleep(QUERY_RETRY.DELAY_MS);
    }
    return false;
  }

  /**
   * Query device state (the response updates the accessory) with retry logic
   */
  async queryDeviceState(deviceId: string): Promise<boolean> {
    const { log, registry } = this.opts;
    const displayName = registry.getDeviceDisplayName(deviceId);
    const cloud = this.opts.getCloud();

    if (!cloud || !cloud.isConnected()) {
      log.debug(`Cannot query ${displayName}: WebSocket not connected`);
      return false;
    }

    for (let attempt = 1; attempt <= QUERY_RETRY.MAX_ATTEMPTS; attempt++) {
      try {
        await cloud.queryDeviceState(deviceId);
        return true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (attempt < QUERY_RETRY.MAX_ATTEMPTS) {
          log.debug(`Query attempt ${attempt}/${QUERY_RETRY.MAX_ATTEMPTS} failed for ${displayName}: ${errorMsg}, retrying...`);
          await this.sleep(QUERY_RETRY.DELAY_MS);
        } else {
          log.warn(`Failed to query device ${displayName} after ${QUERY_RETRY.MAX_ATTEMPTS} attempts: ${errorMsg}`);
        }
      }
    }
    return false;
  }

  /**
   * Staggered delay for curtain state refresh (1s, 2s, 3s, ...) to avoid flooding the WebSocket
   */
  getCurtainStaggerDelay(): number {
    this.curtainInitCounter++;
    return this.curtainInitCounter * 1000;
  }

  /**
   * Reject all pending cloud commands (shutdown)
   */
  clear(): void {
    this.queue.clear();
  }
}
