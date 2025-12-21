/* eslint-disable no-console */
import fs from 'node:fs';
import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';

/**
 * eWeLink Plugin UI Server
 * This server uses the compiled TypeScript API from the main plugin
 */
class EWeLinkUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    // Register request handlers
    this.onRequest('/login', this.handleLogin.bind(this));
    this.onRequest('/get-tokens', this.handleGetTokens.bind(this));
    this.onRequest('/get-devices', this.handleGetDevices.bind(this));
    this.onRequest('/test-device', this.handleTestDevice.bind(this));
    this.onRequest('/getCachedAccessories', this.handleGetCachedAccessories.bind(this));

    // Signal that we're ready
    this.ready();
  }

  /**
   * Create a mock platform object for API usage
   * @param {object} config - Configuration options
   * @returns {object} Mock platform with logger and config
   */
  createMockPlatform(config = {}) {
    return {
      log: {
        info: (...args) => console.log('[API INFO]', ...args),
        debug: (...args) => console.log('[API DEBUG]', ...args),
        warn: (...args) => console.warn('[API WARN]', ...args),
        error: (...args) => console.error('[API ERROR]', ...args),
      },
      config,
    };
  }

  /**
   * Create an authenticated API instance
   * @param {object} config - Configuration options
   * @param {string} accessToken - Optional access token for authentication
   * @returns {Promise<object>} Configured API instance
   */
  async createApiInstance(config, accessToken = null) {
    const { EWeLinkAPI } = await import('./api/ewelink-api.js');
    const mockPlatform = this.createMockPlatform(config);
    const api = new EWeLinkAPI(mockPlatform);

    if (accessToken) {
      api.setCredentials(accessToken);
    }

    return api;
  }

  /**
   * Validate required payload fields
   * @param {object} payload - Request payload
   * @param {string[]} requiredFields - Array of required field names
   * @throws {RequestError} If any required field is missing
   */
  validatePayload(payload, requiredFields) {
    const missingFields = requiredFields.filter(field => !payload[field]);

    if (missingFields.length > 0) {
      throw new RequestError(
        `Missing required fields: ${missingFields.join(', ')}`,
        { status: 400 },
      );
    }
  }

  /**
   * Handle errors consistently across all handlers
   * @param {Error} error - The error to handle
   * @param {string} defaultMessage - Default error message
   * @throws {RequestError} Formatted error for client
   */
  handleError(error, defaultMessage) {
    if (error instanceof RequestError) {
      throw error;
    }

    const message = error.message || defaultMessage;
    const status = error.response?.status || 500;
    throw new RequestError(message, { status });
  }

  /**
   * Handle login request
   * Creates a mock platform instance to use the EWeLinkAPI class
   */
  async handleLogin(payload) {
    this.validatePayload(payload, ['username', 'password']);

    const { username, password, countryCode } = payload;

    try {
      const api = await this.createApiInstance({
        username,
        password,
        countryCode,
      });

      await api.login();

      return {
        success: true,
        apiKey: api.apiKey,
        accessToken: api.accessToken,
        refreshToken: api.refreshToken,
        region: api.region,
      };
    } catch (error) {
      this.handleError(error, 'Login failed');
    }
  }

  /**
   * Handle get tokens request
   * Returns the currently stored tokens from the plugin
   */
  async handleGetTokens() {
    try {
      const { TokenStorage } = await import('./utils/token-storage.js');
      const tokenStorage = new TokenStorage(this.homebridgeStoragePath);

      const tokens = tokenStorage.load();

      if (!tokens) {
        return {
          success: false,
          message: 'No tokens found. Please login from the plugin first.',
        };
      }

      if (!tokenStorage.isValid()) {
        return {
          success: false,
          message: 'Tokens expired. Please restart Homebridge to refresh tokens.',
        };
      }

      return {
        success: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        apiKey: tokens.apiKey,
        region: tokens.region,
      };
    } catch (error) {
      this.handleError(error, 'Failed to get tokens');
    }
  }

  /**
   * Handle get devices request
   */
  async handleGetDevices(payload) {
    this.validatePayload(payload, ['accessToken']);

    const { accessToken, region } = payload;

    try {
      const api = await this.createApiInstance(
        { countryCode: region || 'us' },
        accessToken,
      );

      const devices = await api.getDevices();

      return {
        success: true,
        devices: devices.map(device => ({
          deviceId: device.deviceid,
          name: device.name,
          brand: device.brandName,
          model: device.productModel || device.extra?.model,
          uiid: device.extra?.uiid,
          online: device.online,
          params: device.params,
        })),
        total: devices.length,
      };
    } catch (error) {
      this.handleError(error, 'Failed to get devices');
    }
  }

  /**
   * Handle test device request
   */
  async handleTestDevice(payload) {
    this.validatePayload(payload, ['accessToken', 'deviceId']);

    const { accessToken, region, deviceId, params } = payload;

    try {
      const api = await this.createApiInstance(
        { countryCode: region },
        accessToken,
      );

      const success = await api.setDeviceState(
        deviceId,
        params || { switch: 'on' },
      );

      return {
        success,
        error: success ? 0 : 1,
        message: success ? 'Command sent successfully' : 'Failed to send command',
      };
    } catch (error) {
      this.handleError(error, 'Failed to test device');
    }
  }

  /**
   * Handle get cached accessories request
   * Provides backward compatibility with older config-ui-x versions
   */
  async handleGetCachedAccessories() {
    try {
      const plugin = '@mp-consulting/homebridge-ewelink';
      const devicesToReturn = [];

      // The path and file of the cached accessories
      const accFile = `${this.homebridgeStoragePath}/accessories/cachedAccessories`;

      // Check the file exists
      if (fs.existsSync(accFile)) {
        // Read the cached accessories file
        let cachedAccessories = await fs.promises.readFile(accFile);

        // Parse the JSON
        cachedAccessories = JSON.parse(cachedAccessories);

        // We only want the accessories for this plugin
        cachedAccessories
          .filter(accessory => accessory.plugin === plugin)
          .forEach(accessory => devicesToReturn.push(accessory));
      }

      // Return the array
      return devicesToReturn;
    } catch {
      // Just return an empty accessory list in case of any errors
      return [];
    }
  }
}

// Start the server
(() => new EWeLinkUiServer())();
