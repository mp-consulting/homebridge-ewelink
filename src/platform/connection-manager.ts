import type { Logging } from 'homebridge';
import type { EWeLinkDevice, EWeLinkPlatformConfig } from '../types/index.js';
import type { EWeLinkAPI } from '../api/ewelink-api.js';
import type { LANControl } from '../api/lan-control.js';
import type { WSClient } from '../api/ws-client.js';
import type { DeviceRegistry } from './device-registry.js';
import type { AccessoryFactory } from './accessory-factory.js';
import type { DeviceDiscoveryService } from './device-discovery.js';

/** Creates the API/transport clients (injectable for tests) */
export interface ClientFactory {
  createApi(): EWeLinkAPI;
  createLan(): LANControl;
  createWs(): WSClient;
}

export interface ConnectionManagerOptions {
  log: Logging;
  config: EWeLinkPlatformConfig;
  registry: DeviceRegistry;
  factory: AccessoryFactory;
  discovery: DeviceDiscoveryService;
  clients: ClientFactory;
  /** Random source for retry jitter (overridable for tests) */
  random?: () => number;
}

/**
 * Owns the cloud/LAN client lifecycle: offline-first restore of cached accessories,
 * login + discovery with retry, WebSocket/LAN start, and shutdown.
 */
export class ConnectionManager {
  /** First discovery retry delay */
  static readonly RETRY_BASE_MS = 15000;
  /** Upper bound for the discovery retry delay */
  static readonly RETRY_MAX_MS = 300000;
  /** Random +/- fraction applied to retry delays */
  static readonly RETRY_JITTER = 0.2;

  public ewelinkApi?: EWeLinkAPI;
  public lanControl?: LANControl;
  public wsClient?: WSClient;

  private loggedIn = false;
  private initialized = false;
  private stopped = false;
  private retryAttempts = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private readonly random: () => number;

  constructor(private readonly opts: ConnectionManagerOptions) {
    this.random = opts.random ?? Math.random;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  /** Whether a discovery retry is scheduled */
  get hasPendingRetry(): boolean {
    return this.retryTimer !== null;
  }

  /**
   * Start the platform: restore cached accessories (with LAN when enabled), then
   * log in and discover devices, retrying with backoff until it succeeds.
   */
  async start(): Promise<void> {
    const { log, config } = this.opts;
    log.info('=== DISCOVER DEVICES START ===');
    log.debug(`Config username: ${config.username ? 'SET' : 'NOT SET'}`);
    log.debug(`Config password: ${config.password ? 'SET' : 'NOT SET'}`);

    if (!config.username || !config.password) {
      log.warn('eWeLink credentials not configured. Please configure the plugin.');
      return;
    }

    log.info('Initializing eWeLink API...');
    this.ewelinkApi = this.opts.clients.createApi();

    // Offline-first: cached accessories get handlers from their cached device context
    // so HomeKit (and LAN control) work even when the cloud is unreachable.
    try {
      const restored = this.opts.factory.restoreCachedAccessories();
      if (restored > 0) {
        log.info(`Restored ${restored} cached accessory handler(s) - waiting for eWeLink cloud discovery`);
      }
    } catch (error) {
      log.warn('Failed to restore cached accessories:', error instanceof Error ? error.message : String(error));
    }

    if (config.mode !== 'wan') {
      this.lanControl = this.opts.clients.createLan();
      // Seed LAN with what the cache knows; refreshed with cloud data after discovery
      this.preRegisterLanDevices([...this.opts.registry.deviceCache.values()], false);
      await this.startLan();
    }

    await this.discover();
  }

  /**
   * One login + discovery attempt; schedules a retry on failure
   */
  private async discover(): Promise<void> {
    if (this.stopped || !this.ewelinkApi) {
      return;
    }
    const { log, config, discovery } = this.opts;
    const api = this.ewelinkApi;

    let devices: EWeLinkDevice[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let groups: any[];
    try {
      if (!this.loggedIn) {
        log.info('Attempting login...');
        await api.login();
        this.loggedIn = true;
      }
      ({ devices, groups } = await discovery.fetchDevices(api));
    } catch (error) {
      if (this.stopped) {
        return;
      }
      log.error('Failed to discover devices:', error instanceof Error ? error.message : String(error));
      this.scheduleRetry();
      return;
    }
    if (this.stopped) {
      return;
    }
    this.retryAttempts = 0;

    if (this.lanControl) {
      this.preRegisterLanDevices(devices, true);
    }

    // Real-time updates: connect in the background (retries on its own) - never blocks
    // accessory registration
    if (config.mode !== 'lan' && !this.wsClient) {
      this.wsClient = this.opts.clients.createWs();
      void this.wsClient.start();
    }

    await discovery.registerAccessories(devices, groups, api);

    this.initialized = true;
    log.info('eWeLink platform initialization complete');
  }

  /**
   * Schedule the next discovery attempt (exponential backoff with jitter, capped)
   */
  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer) {
      return;
    }
    this.retryAttempts++;
    const backoff = Math.min(
      ConnectionManager.RETRY_BASE_MS * Math.pow(2, this.retryAttempts - 1),
      ConnectionManager.RETRY_MAX_MS,
    );
    const jitter = 1 - ConnectionManager.RETRY_JITTER + this.random() * 2 * ConnectionManager.RETRY_JITTER;
    const delay = Math.round(backoff * jitter);
    this.opts.log.warn(`Retrying eWeLink login/discovery in ${Math.round(delay / 1000)}s (attempt ${this.retryAttempts + 1})`);

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.discover();
    }, delay);
  }

  /**
   * Register LAN-capable devices that have an IP address with LAN control
   */
  private preRegisterLanDevices(devices: EWeLinkDevice[], fromApi: boolean): void {
    const lan = this.lanControl;
    if (!lan) {
      return;
    }
    let registered = 0;
    let noIp = 0;
    for (const device of devices) {
      if (device.localtype !== 1) {
        continue;
      }
      if (device.ip && device.port) {
        lan.registerDevice(device.deviceid, device.ip, device.port, device.devicekey, true);
        registered++;
      } else {
        noIp++;
        if (fromApi) {
          this.opts.log.debug(
            `[${device.name}] LAN capable but no IP from API ` +
              `(localtype=${device.localtype}, ip=${device.ip}, port=${device.port})`,
          );
        }
      }
    }
    const source = fromApi ? 'API' : 'accessory cache';
    if (registered > 0) {
      this.opts.log.info(`Pre-registered ${registered} device(s) for LAN control from ${source}`);
    }
    if (noIp > 0 && fromApi) {
      this.opts.log.info(`${noIp} device(s) support LAN but API didn't provide IP addresses`);
    }
  }

  private async startLan(): Promise<void> {
    try {
      await this.lanControl?.start();
    } catch (error) {
      this.opts.log.error('Failed to start LAN control:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Stop retries and close the WebSocket and LAN control
   */
  shutdown(): void {
    this.stopped = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.wsClient?.disconnect();
    this.lanControl?.stop();
  }
}
