import dgram from 'dgram';
import crypto from 'crypto';
import mdns from 'multicast-dns';
import { EWeLinkPlatform } from '../platform.js';
import { LANDevice, DeviceParams } from '../types/index.js';

const MDNS_SERVICE_TYPE = '_ewelink._tcp.local';

/**
 * LAN Control for local device communication
 */
export class LANControl {
  private readonly platform: EWeLinkPlatform;
  private readonly devices: Map<string, LANDevice> = new Map();
  private mdnsClient: ReturnType<typeof mdns> | null = null;
  private udpSocket: dgram.Socket | null = null;
  private running = false;

  constructor(platform: EWeLinkPlatform) {
    this.platform = platform;
  }

  /**
   * Start LAN discovery and control
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.platform.log.debug('Starting LAN control...');

    // Start mDNS discovery
    await this.startMdnsDiscovery();

    // Start UDP listener for device announcements
    await this.startUdpListener();

    this.platform.log.info('LAN control started');
  }

  /**
   * Start mDNS discovery
   */
  private async startMdnsDiscovery(): Promise<void> {
    return new Promise((resolve) => {
      this.mdnsClient = mdns();

      this.mdnsClient.on('response', (response) => {
        this.handleMdnsResponse(response);
      });

      this.mdnsClient.on('error', (error) => {
        this.platform.log.error('mDNS error:', error.message);
      });

      // Query for eWeLink devices
      this.mdnsClient.query({
        questions: [{
          name: MDNS_SERVICE_TYPE,
          type: 'PTR',
        }],
      });

      // Periodic re-query
      setInterval(() => {
        if (this.mdnsClient && this.running) {
          this.mdnsClient.query({
            questions: [{
              name: MDNS_SERVICE_TYPE,
              type: 'PTR',
            }],
          });
        }
      }, 60000);

      resolve();
    });
  }

  /**
   * Handle mDNS response
   */
  private handleMdnsResponse(response: mdns.ResponsePacket): void {
    try {
      // Look for eWeLink device TXT records
      for (const answer of response.answers) {
        if (answer.type === 'TXT' && answer.data) {
          const txtData = this.parseTxtRecord(answer.data);

          if (txtData.id && txtData.type === 'diy_plug' || txtData.type === undefined) {
            const deviceId = txtData.id;
            const encrypt = txtData.encrypt === 'true';

            // Find A record for IP
            const aRecord = response.additionals?.find(
              (a) => a.type === 'A' && a.name.includes(deviceId),
            );

            if (aRecord && 'data' in aRecord) {
              const lanDevice: LANDevice = {
                deviceId,
                ip: aRecord.data as string,
                port: parseInt(txtData.port || '8081', 10),
                encrypt,
                iv: txtData.iv,
              };

              // Get device key from cache
              const cachedDevice = this.platform.deviceCache.get(deviceId);
              if (cachedDevice) {
                lanDevice.deviceKey = cachedDevice.devicekey;
              }

              this.devices.set(deviceId, lanDevice);
              this.platform.log.debug(`Discovered LAN device: ${deviceId} at ${lanDevice.ip}:${lanDevice.port}`);
            }
          }
        }
      }
    } catch (error) {
      this.platform.log.debug('Error parsing mDNS response:', error);
    }
  }

  /**
   * Parse TXT record data
   */
  private parseTxtRecord(data: string | Buffer | (string | Buffer)[]): Record<string, string> {
    const result: Record<string, string> = {};

    const items = Array.isArray(data) ? data : [data];

    for (const item of items) {
      const str = typeof item === 'string' ? item : item.toString();
      const eqIndex = str.indexOf('=');
      if (eqIndex > 0) {
        const key = str.substring(0, eqIndex);
        const value = str.substring(eqIndex + 1);
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Start UDP listener for device announcements
   */
  private async startUdpListener(): Promise<void> {
    return new Promise((resolve, reject) => {
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
    const device = this.devices.get(deviceId);

    if (!device) {
      this.platform.log.debug('Device not found in LAN cache:', deviceId);
      return false;
    }

    try {
      const payload = this.buildPayload(device, params);
      const response = await this.sendHttpRequest(device.ip, device.port, payload);

      if (response && response.error === 0) {
        this.platform.log.debug('LAN command successful for device:', deviceId);
        return true;
      }

      return false;

    } catch (error) {
      this.platform.log.debug('LAN command failed for device:', deviceId, error);
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

    if (this.mdnsClient) {
      this.mdnsClient.destroy();
      this.mdnsClient = null;
    }

    if (this.udpSocket) {
      this.udpSocket.close();
      this.udpSocket = null;
    }

    this.devices.clear();
    this.platform.log.debug('LAN control stopped');
  }
}
