import type {
  API,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import { PLATFORM_NAME, DEFAULTS } from './settings.js';
import type { EWeLinkPlatformConfig, EWeLinkDevice, AccessoryContext, DeviceParams } from './types/index.js';
import { EWeLinkAPI } from './api/ewelink-api.js';
import { LANControl } from './api/lan-control.js';
import { WSClient } from './api/ws-client.js';
import { EveCharacteristics } from './utils/eve-characteristics.js';
import type { BaseAccessory } from './accessories/base.js';
import { DeviceRegistry } from './platform/device-registry.js';
import { AccessoryFactory } from './platform/accessory-factory.js';
import { StateRouter } from './platform/state-router.js';
import { CommandDispatcher } from './platform/command-dispatcher.js';
import { DeviceDiscoveryService } from './platform/device-discovery.js';
import { ConnectionManager, type ClientFactory } from './platform/connection-manager.js';

/** Optional collaborators, overridable for tests */
export interface PlatformDependencies {
  clients: Partial<ClientFactory>;
}

/**
 * eWeLink Platform Plugin
 *
 * Homebridge-facing facade. The work is done by the modules in ./platform/:
 * DeviceRegistry (state), AccessoryFactory (accessories/handlers), StateRouter
 * (incoming updates), CommandDispatcher (outgoing commands), DeviceDiscoveryService
 * (device list reconciliation) and ConnectionManager (client lifecycle).
 */
export class EWeLinkPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly api: API;
  public readonly log: Logging;
  public readonly config: EWeLinkPlatformConfig;

  /** Eve Home custom characteristics */
  public readonly eveCharacteristics: EveCharacteristics;

  public readonly registry: DeviceRegistry;
  public readonly factory: AccessoryFactory;
  public readonly router: StateRouter;
  public readonly dispatcher: CommandDispatcher;
  public readonly discovery: DeviceDiscoveryService;
  public readonly connection: ConnectionManager;

  constructor(log: Logging, config: PlatformConfig, api: API, deps: Partial<PlatformDependencies> = {}) {
    this.log = log;
    this.api = api;
    this.config = this.validateConfig(config as EWeLinkPlatformConfig);
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.eveCharacteristics = new EveCharacteristics(api);

    this.registry = new DeviceRegistry((id) => api.hap.uuid.generate(id));
    this.factory = new AccessoryFactory(this, this.registry);
    this.router = new StateRouter({
      log,
      api,
      registry: this.registry,
      isCloudEnabled: () => !!this.wsClient,
    });
    this.dispatcher = new CommandDispatcher({
      log,
      config: this.config,
      registry: this.registry,
      getLan: () => this.lanControl,
      getCloud: () => this.wsClient,
      getGroupApi: () => this.ewelinkApi,
    });
    this.discovery = new DeviceDiscoveryService({
      log,
      api,
      config: this.config,
      registry: this.registry,
      factory: this.factory,
    });
    this.connection = new ConnectionManager({
      log,
      config: this.config,
      registry: this.registry,
      factory: this.factory,
      discovery: this.discovery,
      clients: {
        createApi: () => new EWeLinkAPI(this),
        createLan: () => new LANControl(this),
        createWs: () => new WSClient(this),
        ...deps.clients,
      },
    });

    // Bind the method to preserve 'this' context
    this.configureAccessory = this.configureAccessory.bind(this);

    this.log.debug('Finished initializing platform:', PLATFORM_NAME);

    // Wait for Homebridge to finish loading cached accessories
    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      void this.discoverDevices();
    });

    this.api.on('shutdown', () => {
      this.log.info('Shutting down eWeLink platform...');
      this.shutdown();
    });
  }

  /** Cached accessories, by UUID */
  get accessories(): Map<string, PlatformAccessory<AccessoryContext>> {
    return this.registry.accessories;
  }

  /** Device cache, by device ID */
  get deviceCache(): Map<string, EWeLinkDevice> {
    return this.registry.deviceCache;
  }

  /** eWeLink API client */
  get ewelinkApi(): EWeLinkAPI | undefined {
    return this.connection.ewelinkApi;
  }

  /** LAN control */
  get lanControl(): LANControl | undefined {
    return this.connection.lanControl;
  }

  /** WebSocket client */
  get wsClient(): WSClient | undefined {
    return this.connection.wsClient;
  }

  /**
   * Validate and apply defaults to config
   */
  private validateConfig(config: EWeLinkPlatformConfig): EWeLinkPlatformConfig {
    return {
      ...config,
      mode: config.mode || DEFAULTS.mode,
      hideDevFromHB: config.hideDevFromHB ?? DEFAULTS.hideDevFromHB,
      hideMasters: config.hideMasters ?? DEFAULTS.hideMasters,
      hideFromHB: config.hideFromHB ?? DEFAULTS.hideFromHB,
      outlineInLog: config.outlineInLog ?? DEFAULTS.outlineInLog,
      debug: config.debug ?? DEFAULTS.debug,
      debugFakegato: config.debugFakegato ?? DEFAULTS.debugFakegato,
      disableDeviceLogging: config.disableDeviceLogging ?? DEFAULTS.disableDeviceLogging,
      offlineAsOff: config.offlineAsOff ?? DEFAULTS.offlineAsOff,
      singleDevices: config.singleDevices || [],
      multiDevices: config.multiDevices || [],
      thDevices: config.thDevices || [],
      fanDevices: config.fanDevices || [],
      lightDevices: config.lightDevices || [],
      sensorDevices: config.sensorDevices || [],
      rfDevices: config.rfDevices || [],
      bridgeSensors: config.bridgeSensors || [],
      groups: config.groups || [],
      ignoredDevices: config.ignoredDevices || [],
    };
  }

  /**
   * Called by Homebridge for each cached accessory
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.factory.sanitizeAccessoryNames(accessory);
    this.registry.accessories.set(accessory.UUID, accessory as PlatformAccessory<AccessoryContext>);
  }

  /**
   * Restore cached accessories, then log in and discover devices (retrying until it succeeds)
   */
  async discoverDevices(): Promise<void> {
    try {
      await this.connection.start();
    } catch (error) {
      this.log.error('Failed to start eWeLink platform:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Add or update an accessory
   */
  async addAccessory(device: EWeLinkDevice): Promise<void> {
    return this.factory.addAccessory(device);
  }

  /**
   * Handle device state updates
   */
  public handleDeviceUpdate(deviceId: string, params: DeviceParams): void {
    this.router.handleDeviceUpdate(deviceId, params);
  }

  /**
   * Send command to device (LAN first, then queued cloud command)
   */
  public sendDeviceCommand(deviceId: string, params: DeviceParams): Promise<boolean> {
    return this.dispatcher.sendDeviceCommand(deviceId, params);
  }

  /**
   * Query device state and update accessory with retry logic
   */
  public queryDeviceState(deviceId: string): Promise<boolean> {
    return this.dispatcher.queryDeviceState(deviceId);
  }

  /**
   * Staggered delay for curtain state refresh (1s, 2s, 3s, ...)
   */
  public getCurtainStaggerDelay(): number {
    return this.dispatcher.getCurtainStaggerDelay();
  }

  /**
   * Get device display name for logging (name or ID if not found)
   */
  public getDeviceDisplayName(deviceId: string): string {
    return this.registry.getDeviceDisplayName(deviceId);
  }

  /**
   * Set cached temperature for a device (read by heater/cooler simulations)
   */
  public setDeviceTemperature(deviceId: string, temperature: number): void {
    this.registry.setDeviceTemperature(deviceId, temperature);
  }

  /**
   * Get cached temperature for a device (undefined if none cached)
   */
  public getDeviceTemperature(deviceId: string): number | undefined {
    return this.registry.getDeviceTemperature(deviceId);
  }

  /**
   * Get accessory handler by UUID (used by RF bridges to trigger sub-device updates)
   */
  public getAccessoryHandler(uuid: string): BaseAccessory | undefined {
    return this.registry.getAccessoryHandler(uuid);
  }

  /**
   * Shutdown: stop discovery retries, clients and command queue, destroy all handlers
   */
  private shutdown(): void {
    this.connection.shutdown();
    this.dispatcher.clear();
    this.registry.destroyAllHandlers();
  }

  /**
   * Log with optional outline
   */
  public logMessage(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
    if (this.config.outlineInLog) {
      const divider = '═'.repeat(60);
      this.log[level](`╔${divider}╗`);
      this.log[level](`║ ${message}`, ...args);
      this.log[level](`╚${divider}╝`);
    } else {
      this.log[level](message, ...args);
    }
  }
}
