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

    // Signal that we're ready
    this.ready();
  }

  /**
   * Handle login request
   * Creates a mock platform instance to use the EWeLinkAPI class
   */
  async handleLogin(payload) {
    const { username, password, countryCode } = payload;

    if (!username || !password) {
      throw new RequestError('Username and password are required', { status: 400 });
    }

    try {
      // Dynamically import the EWeLinkAPI class
      const { EWeLinkAPI } = await import('./api/ewelink-api.js');

      // Create a mock platform object with minimal required properties
      const mockPlatform = {
        log: {
          info: (...args) => console.log('[API INFO]', ...args),
          debug: (...args) => console.log('[API DEBUG]', ...args),
          warn: (...args) => console.warn('[API WARN]', ...args),
          error: (...args) => console.error('[API ERROR]', ...args),
        },
        config: {
          username,
          password,
          countryCode,
        },
      };

      // Create API instance and login
      const api = new EWeLinkAPI(mockPlatform);
      await api.login();

      // Get the credentials from the API
      const credentials = {
        success: true,
        apiKey: api.apiKey,
        accessToken: api.accessToken,
        refreshToken: api.refreshToken,
        region: api.region,
      };

      return credentials;

    } catch (error) {
      if (error instanceof RequestError) throw error;

      const message = error.message || 'Login failed';
      throw new RequestError(message, { status: error.response?.status || 500 });
    }
  }

  /**
   * Handle get tokens request
   * Returns the currently stored tokens from the plugin
   */
  async handleGetTokens() {
    try {
      // Dynamically import the TokenStorage class
      const { TokenStorage } = await import('./utils/token-storage.js');

      // Get the storage path from homebridge
      const storagePath = this.homebridgeStoragePath;
      const tokenStorage = new TokenStorage(storagePath);

      // Load tokens
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
      const message = error.message || 'Failed to get tokens';
      throw new RequestError(message, { status: 500 });
    }
  }

  /**
   * Handle get devices request
   */
  async handleGetDevices(payload) {
    const { accessToken, region } = payload;

    if (!accessToken) {
      throw new RequestError('Access token is required', { status: 400 });
    }

    try {
      // Dynamically import the EWeLinkAPI class and settings
      const { EWeLinkAPI } = await import('./api/ewelink-api.js');
      const { API_REGIONS } = await import('./settings.js');

      // Create a mock platform object with the correct region
      const mockPlatform = {
        log: {
          info: (...args) => console.log('[API INFO]', ...args),
          debug: (...args) => console.log('[API DEBUG]', ...args),
          warn: (...args) => console.warn('[API WARN]', ...args),
          error: (...args) => console.error('[API ERROR]', ...args),
        },
        config: {
          countryCode: region || 'us',
        },
      };

      // Create API instance (this will set up the httpClient with the correct region)
      const api = new EWeLinkAPI(mockPlatform);

      // Set the access token and configure authentication
      api.setCredentials(accessToken);

      // Get devices
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
      if (error instanceof RequestError) throw error;

      const message = error.message || 'Failed to get devices';
      throw new RequestError(message, { status: error.response?.status || 500 });
    }
  }

  /**
   * Handle test device request
   */
  async handleTestDevice(payload) {
    const { accessToken, region, deviceId, params } = payload;

    if (!accessToken || !deviceId) {
      throw new RequestError('Access token and device ID are required', { status: 400 });
    }

    try {
      // Dynamically import the EWeLinkAPI class
      const { EWeLinkAPI } = await import('./api/ewelink-api.js');

      // Create a mock platform object
      const mockPlatform = {
        log: {
          info: (...args) => console.log('[API INFO]', ...args),
          debug: (...args) => console.log('[API DEBUG]', ...args),
          warn: (...args) => console.warn('[API WARN]', ...args),
          error: (...args) => console.error('[API ERROR]', ...args),
        },
        config: {
          countryCode: region,
        },
      };

      // Create API instance (this will set up the httpClient with the correct region)
      const api = new EWeLinkAPI(mockPlatform);

      // Set the access token and configure authentication
      api.setCredentials(accessToken);

      // Send the device command
      const success = await api.setDeviceState(deviceId, params || { switch: 'on' });

      return {
        success,
        error: success ? 0 : 1,
        message: success ? 'Command sent successfully' : 'Failed to send command',
      };

    } catch (error) {
      if (error instanceof RequestError) throw error;

      const message = error.message || 'Failed to test device';
      throw new RequestError(message, { status: error.response?.status || 500 });
    }
  }
}

// Start the server
(() => new EWeLinkUiServer())();
