import dgram from 'dgram';
import crypto from 'crypto';
import { Bonjour, type Service, type Browser } from 'bonjour-service';
import type { EWeLinkPlatform } from '../platform.js';
import type { LANDevice, DeviceParams } from '../types/index.js';
import { CHANNEL_SUFFIX_PATTERN } from '../constants/device-constants.js';
import { API_TIMEOUTS } from '../constants/api-constants.js';
import { LAN_FAILOVER } from '../constants/network-constants.js';

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
  /** Consecutive LAN command failures per device */
  private readonly failureCounts: Map<string, number> = new Map();
  /** Timestamp until which LAN is skipped for a device */
  private readonly cooldownUntil: Map<string, number> = new Map();

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

    // Only add if not already discovered via mDNS (or registered before), but fill a
    // device key that was unknown then (e.g. mDNS/cache entry seen before cloud login).
    // The encrypt flag of an existing entry is kept: mDNS TXT records are authoritative.
    const existing = this.devices.get(deviceId);
    if (existing) {
      if (!existing.deviceKey && deviceKey) {
        existing.deviceKey = deviceKey;
        this.platform.log.debug(`[LAN] Filled missing device key for ${this.platform.deviceCache.get(deviceId)?.name || deviceId}`);
      }
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
          // Don't remove - device might still be reachable; skip LAN until it is seen again
          this.startCooldown(deviceId, 'mDNS down event');
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

      // Device announced itself - LAN is usable again
      this.resetHealth(deviceId);

      // Check if we already have this device
      const existing = this.devices.get(deviceId);
      if (existing && existing.ip === ip && existing.port === port) {
        // No address change - just fill a key that was unknown when the entry was created
        if (!existing.deviceKey && deviceKey) {
          existing.deviceKey = deviceKey;
        }
        return;
      }

      const lanDevice: LANDevice = {
        deviceId,
        ip,
        port,
        encrypt,
        deviceKey: deviceKey || existing?.deviceKey,
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
  private handleUdpMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      const data = JSON.parse(msg.toString());

      if (data.deviceid && data.action === 'update') {
        const deviceId = data.deviceid;
        const device = this.devices.get(deviceId);

        if (device) {
          let params = data.params;

          if (device.encrypt) {
            // Encrypted devices must send encrypted payloads - never trust plaintext params
            const deviceKey = this.resolveDeviceKey(device);
            if (!data.encrypt || !deviceKey) {
              this.platform.log.debug(`[LAN] Dropping unencrypted UDP update for encrypted device ${deviceId}`);
              return;
            }
            params = this.decryptPayload(data.data, deviceKey, data.iv);
            if (!params) {
              this.platform.log.debug(`[LAN] Dropping UDP update for ${deviceId}: decryption failed`);
              return;
            }
            // Successful decryption with the device key authenticates the packet: follow an
            // address change (e.g. new DHCP lease) instead of dropping its updates
            if (device.ip !== rinfo.address) {
              this.platform.log.debug(`[LAN] ${deviceId} address changed: ${device.ip} -> ${rinfo.address}`);
              device.ip = rinfo.address;
            }
          } else if (device.ip && rinfo.address !== device.ip) {
            // Unauthenticated plaintext: only accept updates from the device's known address
            this.platform.log.debug(`[LAN] Ignoring UDP update for ${deviceId} from unexpected address ${rinfo.address}`);
            return;
          }

          if (params) {
            this.resetHealth(deviceId);
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

    if (this.isInCooldown(parentDeviceId)) {
      this.platform.log.debug(`[${displayName}] LAN in cooldown after recent failures, using cloud`);
      return false;
    }

    if (device.encrypt && !this.resolveDeviceKey(device)) {
      this.platform.log.debug(`[${displayName}] No device key for encrypted LAN control yet, using cloud`);
      return false;
    }

    try {
      this.platform.log.debug(`[${displayName}] Sending command via LAN to ${device.ip}:${device.port}`);
      const payload = this.buildPayload(device, params);
      const response = await this.sendHttpRequest(device.ip, device.port, payload);

      if (response && response.error === 0) {
        this.platform.log.debug(`[${displayName}] LAN command successful`);
        this.resetHealth(parentDeviceId);
        return true;
      }

      if (response) {
        this.platform.log.debug(`[${displayName}] LAN command failed with error code: ${response.error}`);
      } else {
        this.platform.log.debug(`[${displayName}] LAN command failed: no response`);
      }
      this.recordFailure(parentDeviceId);
      return false;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.platform.log.debug(`[${displayName}] LAN command failed: ${errorMsg}, falling back to cloud`);
      this.recordFailure(parentDeviceId);
      return false;
    }
  }

  /**
   * Device key of a LAN entry, resolved lazily from the platform device cache when the
   * entry was created before the key was known (LAN starts before cloud login)
   */
  private resolveDeviceKey(device: LANDevice): string | undefined {
    if (!device.deviceKey) {
      const key = this.platform.deviceCache.get(device.deviceId)?.devicekey;
      if (key) {
        device.deviceKey = key;
      }
    }
    return device.deviceKey || undefined;
  }

  /**
   * Record a failed LAN command; enter cooldown after too many in a row
   */
  private recordFailure(deviceId: string): void {
    const failures = (this.failureCounts.get(deviceId) ?? 0) + 1;
    if (failures >= LAN_FAILOVER.MAX_CONSECUTIVE_FAILURES) {
      this.startCooldown(deviceId, `${failures} consecutive failures`);
    } else {
      this.failureCounts.set(deviceId, failures);
    }
  }

  /**
   * Skip LAN for a device for a while so commands go straight to cloud
   */
  private startCooldown(deviceId: string, reason: string): void {
    this.failureCounts.delete(deviceId);
    this.cooldownUntil.set(deviceId, Date.now() + LAN_FAILOVER.COOLDOWN_MS);
    this.platform.log.debug(
      `[LAN] ${deviceId} unavailable (${reason}), using cloud for ${LAN_FAILOVER.COOLDOWN_MS / 1000}s`,
    );
  }

  /**
   * Clear failure tracking for a device (successful command or fresh announcement)
   */
  private resetHealth(deviceId: string): void {
    this.failureCounts.delete(deviceId);
    this.cooldownUntil.delete(deviceId);
  }

  /**
   * Check whether a device is currently in LAN cooldown
   */
  private isInCooldown(deviceId: string): boolean {
    const until = this.cooldownUntil.get(deviceId);
    if (until === undefined) {
      return false;
    }
    if (Date.now() >= until) {
      this.cooldownUntil.delete(deviceId);
      return false;
    }
    return true;
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
        signal: AbortSignal.timeout(API_TIMEOUTS.HTTP_REQUEST_LAN),
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
    this.failureCounts.clear();
    this.cooldownUntil.clear();
    this.platform.log.debug('LAN control stopped');
  }
}
