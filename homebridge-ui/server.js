import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';
import { Bonjour } from 'bonjour-service';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

const PLUGIN_NAME = '@mp-consulting/homebridge-ewelink';

/**
 * eWeLink Plugin UI Server
 */
class EWeLinkUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    this.onRequest('/login', this.handleLogin.bind(this));
    this.onRequest('/get-tokens', this.handleGetTokens.bind(this));
    this.onRequest('/get-devices', this.handleGetDevices.bind(this));
    this.onRequest('/test-device', this.handleTestDevice.bind(this));
    this.onRequest('/getCachedAccessories', this.handleGetCachedAccessories.bind(this));

    this.ready();
  }

  /**
   * Create an authenticated API instance
   */
  async createApi(config, accessToken = null) {
    const { EWeLinkAPI } = await import(path.join(distDir, 'api', 'ewelink-api.js'));
    const api = new EWeLinkAPI({
      log: console,
      config,
    });

    if (accessToken) {
      api.setCredentials(accessToken);
    }

    return api;
  }

  /**
   * Validate required payload fields
   */
  validate(payload, fields) {
    const missing = fields.filter(f => !payload[f]);
    if (missing.length > 0) {
      throw new RequestError(`Missing required fields: ${missing.join(', ')}`, { status: 400 });
    }
  }

  /**
   * Handle login request
   */
  async handleLogin(payload) {
    this.validate(payload, ['username', 'password']);

    try {
      const api = await this.createApi(payload);
      await api.login();

      return {
        success: true,
        apiKey: api.apiKey,
        accessToken: api.accessToken,
        refreshToken: api.refreshToken,
        region: api.region,
      };
    } catch (error) {
      throw new RequestError(error.message || 'Login failed', { status: 401 });
    }
  }

  /**
   * Handle get tokens request
   */
  async handleGetTokens() {
    try {
      const { TokenStorage } = await import(path.join(distDir, 'utils', 'token-storage.js'));
      const storage = new TokenStorage(this.homebridgeStoragePath);
      const tokens = storage.load();

      if (!tokens || !storage.isValid()) {
        return { success: false, message: 'No valid session found' };
      }

      return {
        success: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        apiKey: tokens.apiKey,
        region: tokens.region,
      };
    } catch {
      return { success: false, message: 'Failed to get tokens' };
    }
  }

  /**
   * Discover LAN devices via mDNS (quick scan)
   * Returns a map of deviceId -> { ip, port }
   */
  async discoverLanDevices(timeoutMs = 3000) {
    return new Promise((resolve) => {
      const lanDevices = new Map();
      let bonjour;

      try {
        bonjour = new Bonjour();
        const browser = bonjour.find({ type: 'ewelink' }, (service) => {
          // Extract device ID from service name (e.g., "eWeLink_1001edbf36" -> "1001edbf36")
          const match = service.name?.match(/eWeLink_([a-f0-9]+)/i);
          if (match) {
            const deviceId = match[1];
            const ip = service.addresses?.find((addr) => addr && !addr.includes(':'));
            if (ip) {
              lanDevices.set(deviceId, { ip, port: service.port || 8081 });
            }
          }
        });

        // Stop after timeout
        setTimeout(() => {
          browser.stop();
          bonjour.destroy();
          resolve(lanDevices);
        }, timeoutMs);
      } catch {
        if (bonjour) {
          bonjour.destroy();
        }
        resolve(lanDevices);
      }
    });
  }

  /**
   * Handle get devices request
   */
  async handleGetDevices(payload) {
    this.validate(payload, ['accessToken']);

    try {
      // Start LAN discovery first (takes 3 seconds)
      const lanDiscoveryPromise = this.discoverLanDevices();

      // Fetch devices from cloud API
      const api = await this.createApi({ countryCode: payload.region || 'us' }, payload.accessToken);
      const result = await api.getDevices();
      const devices = Array.isArray(result) ? result : (result.devices || []);

      // Wait for LAN discovery to complete
      const lanDevices = await lanDiscoveryPromise;

      return {
        success: true,
        devices: devices.map(d => {
          const lanInfo = lanDevices.get(d.deviceid);
          const lanIp = lanInfo?.ip || d.ip || null;
          // Consider LAN-enabled if API says so OR if we discovered it via mDNS
          const lanEnabled = d.localtype === 1 || !!lanInfo;
          return {
            deviceId: d.deviceid,
            name: d.name,
            brand: d.brandName,
            model: d.productModel || d.extra?.model,
            uiid: d.extra?.uiid,
            online: d.online,
            lanEnabled,
            lanIp,
            lanPort: lanInfo?.port || d.port || null,
          };
        }),
        total: devices.length,
      };
    } catch (error) {
      throw new RequestError(error.message || 'Failed to get devices', { status: 500 });
    }
  }

  /**
   * Handle test device request
   */
  async handleTestDevice(payload) {
    this.validate(payload, ['accessToken', 'deviceId']);

    try {
      const api = await this.createApi({ countryCode: payload.region }, payload.accessToken);
      const success = await api.setDeviceState(payload.deviceId, payload.params || { switch: 'on' });

      return {
        success,
        message: success ? 'Command sent successfully' : 'Failed to send command',
      };
    } catch (error) {
      throw new RequestError(error.message || 'Failed to test device', { status: 500 });
    }
  }

  /**
   * Handle get cached accessories request
   */
  async handleGetCachedAccessories() {
    try {
      const accFile = `${this.homebridgeStoragePath}/accessories/cachedAccessories`;

      if (!fs.existsSync(accFile)) {
        return [];
      }

      const data = await fs.promises.readFile(accFile, 'utf8');
      const accessories = JSON.parse(data);

      return accessories.filter(a => a.plugin === PLUGIN_NAME);
    } catch {
      return [];
    }
  }
}

(() => new EWeLinkUiServer())();
