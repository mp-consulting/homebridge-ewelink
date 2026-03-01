import dgram from 'dgram';
import crypto from 'crypto';
import { Bonjour, type Service, type Browser } from 'bonjour-service';
import type { EWeLinkPlatform } from '../platform.js';
import type { LANDevice, DeviceParams } from '../types/index.js';
import { CHANNEL_SUFFIX_PATTERN } from '../constants/device-constants.js';

/**
 * LAN Control for local device communication
 * Uses bonjour-service for mDNS discovery which works better with mDNS proxies/reflectors
 */
export class LANControl {
  private readonly platform: EWeLinkPlatform;
  private readonly devices: Map<string, LANDevice> = new Map();
  private bonjour: InstanceType<typeof Bonjour> | null = null;
  private browser: Browser | null = null;
  private udpSocket: dgram.Socket | null = null;
  private running = false;

  constructor(platform: EWeLinkPlatform) {
    this.platform = platform;
  }

  /**
   * Register a device for LAN control using IP from API response
   * This allows controlling devices before mDNS discovery finds them
   */
  registerDevice(deviceId: string, ip: string, port: number, deviceKey: string, encrypt: boolean = true): void {
    if (!ip || !port) {
      return;
    }

    // Only add if not already discovered via mDNS
    if (this.devices.has(deviceId)) {
      return;
    }

    const device: LANDevice = {
      deviceId,
      ip,
      port,
      deviceKey,
      encrypt,
    };

    this.devices.set(deviceId, device);
    const cachedDevice = this.platform.deviceCache.get(deviceId);
    const deviceName = cachedDevice?.name || deviceId;
    this.platform.log.debug(`[LAN] Registered ${deviceName} at ${ip}:${port} from API`);
  }

  /**
   * Start LAN discovery and control
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.platform.log.info('Starting LAN control (mDNS discovery)...');

    // Start mDNS discovery using bonjour-service
    this.startBonjourDiscovery();

    // Start UDP listener for device announcements
    await this.startUdpListener();

    this.platform.log.info('LAN control started - listening for device announcements');

    // Log discovery status after initial discovery period
    setTimeout(() => {
      this.logDiscoveryStatus();
    }, 10000);
  }

  /**
   * Log LAN discovery status for diagnostics
   */
  private logDiscoveryStatus(): void {
    const discoveredCount = this.devices.size;

    if (discoveredCount === 0) {
      this.platform.log.warn(
        'LAN discovery: No devices found via mDNS after 10 seconds. ' +
        'This is normal if your devices don\'t support LAN mode or are on a different network segment. ' +
        'Commands will use cloud (WebSocket) instead.',
      );
    } else {
      this.platform.log.info(
        `LAN discovery: Found ${discoveredCount} device(s) available for local control`,
      );

      // Log which devices were found
      for (const [deviceId, device] of this.devices) {
        const cachedDevice = this.platform.deviceCache.get(deviceId);
        const deviceName = cachedDevice?.name || deviceId;
        this.platform.log.info(`  - ${deviceName} at ${device.ip}:${device.port}`);
      }

      // Log devices NOT found on LAN
      const notFoundOnLan: string[] = [];
      for (const [deviceId, device] of this.platform.deviceCache) {
        if (!this.devices.has(deviceId)) {
          notFoundOnLan.push(device.name || deviceId);
        }
      }

      if (notFoundOnLan.length > 0) {
        this.platform.log.debug(
          `Devices NOT available via LAN (will use cloud): ${notFoundOnLan.join(', ')}`,
        );
      }
    }
  }

  /**
   * Start mDNS discovery using bonjour-service
   * This works better with mDNS proxies/reflectors (like UniFi) than raw multicast-dns
   */
  private startBonjourDiscovery(): void {
    try {
      this.bonjour = new Bonjour();

      // Browse for eWeLink devices
      this.browser = this.bonjour.find({ type: 'ewelink' }, (service: Service) => {
        this.handleServiceDiscovery(service);
      });

      this.browser?.on('down', (service: Service) => {
        // Device went offline - optionally remove from devices map
        const deviceId = this.extractDeviceIdFromService(service);
        if (deviceId) {
          const cachedDevice = this.platform.deviceCache.get(deviceId);
          const deviceName = cachedDevice?.name || deviceId;
          this.platform.log.debug(`[LAN] Device went offline: ${deviceName}`);
          // Don't remove - device might still be reachable
        }
      });

      this.platform.log.debug('[LAN] Bonjour browser started for _ewelink._tcp services');

    } catch (error) {
      this.platform.log.error('Failed to start Bonjour discovery:', error);
    }
  }

  /**
   * Extract device ID from service name (e.g., "eWeLink_1001edbf36" -> "1001edbf36")
   */
  private extractDeviceIdFromService(service: Service): string | null {
    const match = service.name?.match(/eWeLink_([a-f0-9]+)/i);
    return match ? match[1] : null;
  }

  /**
   * Handle discovered service
   */
  private handleServiceDiscovery(service: Service): void {
    try {
      const deviceId = this.extractDeviceIdFromService(service);

      if (!deviceId) {
        this.platform.log.debug(`[LAN] Ignoring service without device ID: ${service.name}`);
        return;
      }

      // Get IP address from service
      const ip = service.addresses?.find((addr: string) => {
        // Prefer IPv4 addresses
        return addr && !addr.includes(':');
      }) || service.addresses?.[0];

      if (!ip) {
        this.platform.log.debug(`[LAN] No IP address for device ${deviceId}`);
        return;
      }

      const port = service.port || 8081;

      // Parse TXT records for encryption info
      const txt = service.txt || {};
      const encrypt = txt.encrypt === 'true';

      // Get device key from cache
      const cachedDevice = this.platform.deviceCache.get(deviceId);
      const deviceKey = cachedDevice?.devicekey;
      const deviceName = cachedDevice?.name || deviceId;

      // Check if we already have this device
      const existing = this.devices.get(deviceId);
      if (existing && existing.ip === ip && existing.port === port) {
        // No change
        return;
      }

      const lanDevice: LANDevice = {
        deviceId,
        ip,
        port,
        encrypt,
        deviceKey,
        iv: txt.iv,
      };

      this.devices.set(deviceId, lanDevice);
      this.platform.log.debug(`[LAN] Discovered device: ${deviceName} at ${ip}:${port}`);

    } catch (error) {
      this.platform.log.debug('[LAN] Error handling service discovery:', error);
    }
  }

  /**
   * Start UDP listener for device announcements
   */
  private async startUdpListener(): Promise<void> {
    return new Promise((resolve) => {
      try {
        this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        this.udpSocket.on('message', (msg, rinfo) => {
          this.handleUdpMessage(msg, rinfo);
        });

        this.udpSocket.on('error', (error) => {
          this.platform.log.error('UDP socket error:', error.message);
        });

        this.udpSocket.bind(8082, () => {
          this.platform.log.debug('UDP listener started on port 8082');
          resolve();
        });

      } catch (error) {
        this.platform.log.error('Failed to start UDP listener:', error);
        resolve(); // Don't fail if UDP can't start
      }
    });
  }

  /**
   * Handle UDP message from device
   */
  private handleUdpMessage(msg: Buffer, _rinfo: dgram.RemoteInfo): void {
    try {
      const data = JSON.parse(msg.toString());

      if (data.deviceid && data.action === 'update') {
        const deviceId = data.deviceid;
        const device = this.devices.get(deviceId);

        if (device) {
          let params = data.params;

          // Decrypt if encrypted
          if (device.encrypt && data.encrypt && device.deviceKey) {
            params = this.decryptPayload(data.data, device.deviceKey, data.iv);
          }

          if (params) {
            this.platform.handleDeviceUpdate(deviceId, params);
          }
        }
      }
    } catch (error) {
      this.platform.log.debug('Error parsing UDP message:', error);
    }
  }

  /**
   * Send command to device via LAN
   */
  async sendCommand(deviceId: string, params: DeviceParams): Promise<boolean> {
    // Strip channel suffix (e.g., SW1) to get the parent device ID
    const parentDeviceId = deviceId.replace(CHANNEL_SUFFIX_PATTERN, '');
    const device = this.devices.get(parentDeviceId);
    const cachedDevice = this.platform.deviceCache.get(parentDeviceId);
    const displayName = cachedDevice?.name || deviceId;

    if (!device) {
      this.platform.log.debug(`[${displayName}] Not available via LAN, falling back to cloud`);
      return false;
    }

    try {
      this.platform.log.debug(`[${displayName}] Sending command via LAN to ${device.ip}:${device.port}`);
      const payload = this.buildPayload(device, params);
      const response = await this.sendHttpRequest(device.ip, device.port, payload);

      if (response && response.error === 0) {
        this.platform.log.debug(`[${displayName}] LAN command successful`);
        return true;
      }

      if (response) {
        this.platform.log.debug(`[${displayName}] LAN command failed with error code: ${response.error}`);
      } else {
        this.platform.log.debug(`[${displayName}] LAN command failed: no response`);
      }
      return false;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.platform.log.debug(`[${displayName}] LAN command failed: ${errorMsg}, falling back to cloud`);
      return false;
    }
  }

  /**
   * Build payload for LAN request
   */
  private buildPayload(device: LANDevice, params: DeviceParams): Record<string, unknown> {
    const sequence = String(Date.now());
    const selfApikey = this.platform.ewelinkApi?.getApiKey() || '';

    if (device.encrypt && device.deviceKey) {
      const iv = this.generateIv();
      const encryptedData = this.encryptPayload(params, device.deviceKey, iv);

      return {
        sequence,
        deviceid: device.deviceId,
        selfApikey,
        iv: iv.toString('base64'),
        encrypt: true,
        data: encryptedData,
      };
    }

    return {
      sequence,
      deviceid: device.deviceId,
      selfApikey,
      data: params,
    };
  }

  /**
   * Send HTTP request to device
   */
  private async sendHttpRequest(
    ip: string,
    port: number,
    payload: Record<string, unknown>,
  ): Promise<{ error: number } | null> {
    const url = `http://${ip}:${port}/zeroconf/switch`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      return await response.json() as { error: number };

    } catch (error) {
      this.platform.log.debug('HTTP request failed:', error);
      return null;
    }
  }

  /**
   * Encrypt payload
   */
  private encryptPayload(params: DeviceParams, deviceKey: string, iv: Buffer): string {
    const key = crypto.createHash('md5').update(Buffer.from(deviceKey)).digest();
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);

    let encrypted = cipher.update(JSON.stringify(params), 'utf8', 'base64');
    encrypted += cipher.final('base64');

    return encrypted;
  }

  /**
   * Decrypt payload
   */
  private decryptPayload(data: string, deviceKey: string, iv: string): DeviceParams | null {
    try {
      const key = crypto.createHash('md5').update(Buffer.from(deviceKey)).digest();
      const decipher = crypto.createDecipheriv('aes-128-cbc', key, Buffer.from(iv, 'base64'));

      let decrypted = decipher.update(data, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted) as DeviceParams;

    } catch (error) {
      this.platform.log.debug('Decryption failed:', error);
      return null;
    }
  }

  /**
   * Generate random IV
   */
  private generateIv(): Buffer {
    return crypto.randomBytes(16);
  }

  /**
   * Get LAN device info
   */
  getLanDevice(deviceId: string): LANDevice | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Check if device is available via LAN
   */
  isDeviceAvailable(deviceId: string): boolean {
    return this.devices.has(deviceId);
  }

  /**
   * Stop LAN control
   */
  stop(): void {
    this.running = false;

    if (this.browser) {
      this.browser.stop();
      this.browser = null;
    }

    if (this.bonjour) {
      this.bonjour.destroy();
      this.bonjour = null;
    }

    if (this.udpSocket) {
      this.udpSocket.close();
      this.udpSocket = null;
    }

    this.devices.clear();
    this.platform.log.debug('LAN control stopped');
  }
}
