import axios, { AxiosInstance } from 'axios';
import { createHmac } from 'crypto';
import { EWeLinkPlatform } from '../platform.js';
import { API_REGIONS, EWELINK_APP_ID, EWELINK_APP_SECRET } from '../settings.js';
import { TokenStorage } from '../utils/token-storage.js';
import { CryptoUtils } from '../utils/crypto-utils.js';
import { API_TIMEOUTS, WEBSOCKET_HOST_MAPPING, WEBSOCKET_FALLBACK_HOSTS } from '../constants/api-constants.js';
import { getRegionFromCountryCode } from '../constants/region-constants.js';
import {
  EWeLinkDevice,
  APIResponse,
  LoginResponse,
  DeviceListResponse,
  RefreshTokenResponse,
} from '../types/index.js';

/**
 * eWeLink HTTP API Client
 */
export class EWeLinkAPI {
  private readonly platform: EWeLinkPlatform;
  private readonly httpClient: AxiosInstance;
  private httpHost: string;
  private readonly tokenStorage: TokenStorage;
  public apiKey = '';
  public accessToken = '';
  public refreshToken = '';
  public region: keyof typeof API_REGIONS;
  private triedBase64 = false;

  constructor(platform: EWeLinkPlatform) {
    this.platform = platform;

    // Initialize token storage
    const storagePath = platform.api?.user?.storagePath?.() || platform.api?.user?.persistPath?.() || '/tmp';
    this.tokenStorage = new TokenStorage(storagePath);

    // Determine region from country code
    this.region = getRegionFromCountryCode(platform.config.countryCode) as keyof typeof API_REGIONS;
    this.httpHost = API_REGIONS[this.region].httpHost;

    // Create HTTP client
    this.httpClient = axios.create({
      baseURL: `https://${this.httpHost}`,
      timeout: API_TIMEOUTS.HTTP_REQUEST,
      headers: {
        'Content-Type': 'application/json',
        'X-CK-Appid': EWELINK_APP_ID,
      },
    });

    // Add response interceptor for token refresh
    this.httpClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // If 401 and we haven't retried yet, refresh token
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            await this.refreshAccessToken();
            originalRequest.headers['Authorization'] = `Bearer ${this.accessToken}`;
            return this.httpClient(originalRequest);
          } catch (refreshError) {
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      },
    );
  }


  /**
   * Generate signature for API requests
   */
  private generateSignature(data: string): string {
    return createHmac('sha256', EWELINK_APP_SECRET)
      .update(data)
      .digest('base64');
  }

  /** Current password (may be decoded from base64) */
  private currentPassword = '';

  /**
   * Login to eWeLink API
   */
  async login(): Promise<void> {
    this.platform.log.debug('=== LOGIN START ===');
    const { username, password } = this.platform.config;

    this.platform.log.debug(`Username: ${username ? username.substring(0, 3) + '***' : 'EMPTY'}`);
    this.platform.log.debug(`Password: ${password ? '***' + password.substring(password.length - 3) : 'EMPTY'}`);

    if (!username || !password) {
      throw new Error('Username and password are required');
    }

    // Use current password or original
    if (!this.currentPassword) {
      this.currentPassword = password;
      this.platform.log.debug('Using original password');
    } else {
      this.platform.log.debug('Using modified password (possibly base64 decoded)');
    }

    const nonce = CryptoUtils.generateNonce();
    this.platform.log.debug(`Nonce: ${nonce}`);

    // Determine if username is email or phone
    const isEmail = username.includes('@');
    this.platform.log.debug(`Login method: ${isEmail ? 'EMAIL' : 'PHONE'}`);

    // Build login data with specific key order (important for signature!)
    // Must be: countryCode, password, then email/phoneNumber
    const loginData: Record<string, string> = {
      countryCode: this.platform.config.countryCode || '1',
      password: this.currentPassword,
    };

    // Add email or phoneNumber AFTER countryCode and password
    if (isEmail) {
      loginData.email = username;
    } else {
      loginData.phoneNumber = username;
    }

    const dataToSign = JSON.stringify(loginData);
    this.platform.log.debug(`Data to sign: ${dataToSign}`);
    this.platform.log.debug(`Password in data (first 5 chars): ${this.currentPassword.substring(0, 5)}`);
    this.platform.log.debug(`Password length: ${this.currentPassword.length}`);

    const signature = this.generateSignature(dataToSign);
    this.platform.log.debug(`FULL Signature: ${signature}`);

    this.platform.log.debug(`Full URL: https://${this.httpHost}/v2/user/login`);
    this.platform.log.debug(`Headers - X-CK-Appid: ${EWELINK_APP_ID}`);
    this.platform.log.debug(`Headers - X-CK-Nonce: ${nonce}`);
    this.platform.log.debug(`Headers - Authorization: Sign ${signature.substring(0, 20)}...`);

    try {
      this.platform.log.debug('Sending HTTP POST request...');

      const response = await this.httpClient.post<APIResponse<LoginResponse>>(
        '/v2/user/login',
        loginData,
        {
          headers: {
            'X-CK-Nonce': nonce,
            'Authorization': `Sign ${signature}`,
          },
        },
      );

      this.platform.log.debug('HTTP request completed');
      const body = response.data;

      this.platform.log.debug(`Response status: ${response.status}`);
      this.platform.log.debug(`Response error code: ${body.error}`);
      this.platform.log.debug(`Response message: ${body.msg || 'none'}`);
      this.platform.log.debug(`Full response: ${JSON.stringify(body, null, 2)}`);

      // Handle region redirect (error 10004)
      if (body.error === 10004 && body.data?.region) {
        const givenRegion = body.data.region as string;
        this.platform.log.info(`Region redirect required: ${this.httpHost} -> ${givenRegion}`);

        // Update http host based on region
        switch (givenRegion) {
          case 'eu':
          case 'us':
          case 'as':
            this.httpHost = `${givenRegion}-apia.coolkit.cc`;
            break;
          case 'cn':
            this.httpHost = 'cn-apia.coolkit.cn';
            break;
          default:
            throw new Error(`Unknown region received: ${givenRegion}`);
        }

        this.httpClient.defaults.baseURL = `https://${this.httpHost}`;
        this.platform.log.debug(`Retrying login with new host: ${this.httpHost}`);
        return await this.login();
      }

      // Handle incorrect password - try base64 decode once
      if ([10001, 10014].includes(body.error) && !this.triedBase64) {
        this.platform.log.warn(`Password error (${body.error}), attempting base64 decode...`);
        this.triedBase64 = true;
        const originalPassword = this.currentPassword;
        this.currentPassword = Buffer.from(password, 'base64')
          .toString('utf8')
          .replace(/\r\n|\n|\r/g, '')
          .trim();
        this.platform.log.debug(`Password changed from ${originalPassword.length} to ${this.currentPassword.length} chars`);
        return await this.login();
      }

      // Check for successful login
      if (body.data?.at) {
        this.platform.log.debug('Login successful - extracting tokens');
        this.accessToken = body.data.at;
        this.refreshToken = body.data.rt;
        this.apiKey = body.data.user.apikey;

        this.platform.log.debug(`Access token: ${this.accessToken.substring(0, 20)}...`);
        this.platform.log.debug(`Refresh token: ${this.refreshToken.substring(0, 20)}...`);
        this.platform.log.debug(`API Key: ${this.apiKey.substring(0, 8)}...`);

        // Set default authorization header
        this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;

        // Save tokens to shared storage
        this.tokenStorage.save({
          accessToken: this.accessToken,
          refreshToken: this.refreshToken,
          apiKey: this.apiKey,
          region: this.region,
        });
        this.platform.log.debug('Tokens saved to shared storage');

        this.platform.log.info('✓ Successfully logged in to eWeLink');
        this.platform.log.debug('=== LOGIN END (SUCCESS) ===');
        return;
      }

      // Handle other errors
      this.platform.log.error('Login failed - no access token in response');
      if (body.msg) {
        throw new Error(`${body.msg} [${body.error}]`);
      } else {
        throw new Error(`Login failed: ${JSON.stringify(body)}`);
      }

    } catch (error) {
      this.platform.log.debug('=== LOGIN END (ERROR) ===');
      if (axios.isAxiosError(error)) {
        this.platform.log.error('HTTP Error Details:');
        this.platform.log.error(`  Status: ${error.response?.status}`);
        this.platform.log.error(`  Status Text: ${error.response?.statusText}`);
        this.platform.log.error(`  Response Data: ${JSON.stringify(error.response?.data, null, 2)}`);
        this.platform.log.error(`  Request URL: ${error.config?.url}`);
        this.platform.log.error(`  Request Method: ${error.config?.method}`);
        throw new Error(`Login failed: ${error.response?.data?.msg || error.message}`);
      }
      this.platform.log.error(`Non-HTTP Error: ${error}`);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  private async refreshAccessToken(): Promise<void> {
    const response = await this.httpClient.post<APIResponse<RefreshTokenResponse>>(
      '/v2/user/refresh',
      {
        rt: this.refreshToken,
      },
    );

    if (response.data.error !== 0) {
      throw new Error('Failed to refresh token');
    }

    this.accessToken = response.data.data!.at;
    this.refreshToken = response.data.data!.rt;
    this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;

    this.platform.log.debug('Token refreshed successfully');
  }

  /**
   * Get list of homes/families
   */
  async getHomes(): Promise<string[]> {
    try {
      const response = await this.httpClient.get<APIResponse<{ familyList: Array<{ id: string; name: string }> }>>(
        '/v2/family',
      );

      if (response.data.error !== 0 || !response.data.data?.familyList) {
        throw new Error(response.data.msg || 'Failed to get family list');
      }

      const homes = response.data.data.familyList.map(family => {
        this.platform.log.debug(`Found home: ${family.name} [${family.id}]`);
        return family.id;
      });

      this.platform.log.debug(`Retrieved ${homes.length} homes from API`);
      return homes;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to get homes: ${error.response?.data?.msg || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get list of devices and groups
   */
  async getDevices(): Promise<{ devices: EWeLinkDevice[]; groups: any[] }> {
    try {
      // First get the list of homes
      const homeIds = await this.getHomes();

      if (homeIds.length === 0) {
        this.platform.log.warn('No homes found in eWeLink account');
        return { devices: [], groups: [] };
      }

      const allDevices: EWeLinkDevice[] = [];
      const allGroups: any[] = [];

      // Get devices for each home
      for (const homeId of homeIds) {
        this.platform.log.debug(`Fetching devices for home: ${homeId}`);

        const response = await this.httpClient.get<APIResponse<{ thingList: Array<{ itemType: number; itemData: EWeLinkDevice }> }>>(
          '/v2/device/thing',
          {
            params: {
              num: 0,
              familyid: homeId,
            },
          },
        );

        if (response.data.error !== 0) {
          this.platform.log.warn(`Failed to get devices for home ${homeId}: ${response.data.msg}`);
          continue;
        }

        // Extract devices and groups from thingList
        const thingList = response.data.data?.thingList || [];
        for (const thing of thingList) {
          if (thing.itemData?.extra?.uiid) {
            // Regular device (has uiid)
            allDevices.push(thing.itemData);
          } else if (thing.itemType === 3) {
            // Group (itemType === 3)
            allGroups.push(thing.itemData);
          }
        }
      }

      this.platform.log.debug(`Retrieved ${allDevices.length} devices and ${allGroups.length} groups from API`);
      return { devices: allDevices, groups: allGroups };

    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to get devices: ${error.response?.data?.msg || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get single device
   */
  async getDevice(deviceId: string): Promise<EWeLinkDevice | null> {
    try {
      const response = await this.httpClient.get<APIResponse<{ thingList: Array<{ itemData: EWeLinkDevice }> }>>(
        '/v2/device/thing',
        {
          params: {
            thingList: JSON.stringify([{ itemType: 1, id: deviceId }]),
          },
        },
      );

      if (response.data.error !== 0) {
        return null;
      }

      const things = response.data.data?.thingList || [];
      return things[0]?.itemData || null;

    } catch (error) {
      this.platform.log.error('Failed to get device:', deviceId, error);
      return null;
    }
  }

  /**
   * Update device state
   */
  async updateDevice(deviceId: string, params: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await this.httpClient.post<APIResponse>(
        '/v2/device/thing/status',
        {
          type: 1,
          id: deviceId,
          params,
        },
      );

      return response.data.error === 0;

    } catch (error) {
      this.platform.log.error('Failed to update device:', deviceId, error);
      return false;
    }
  }

  /**
   * Update group state (groups use a different API endpoint)
   */
  async updateGroup(groupId: string, params: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await this.httpClient.post<APIResponse>(
        '/v2/device/thing/status',
        {
          type: 2, // Type 2 indicates group update
          id: groupId,
          params,
        },
      );

      return response.data.error === 0;

    } catch (error) {
      this.platform.log.error('Failed to update group:', groupId, error);
      return false;
    }
  }

  /**
   * Get API key
   */
  getApiKey(): string {
    return this.apiKey;
  }

  /**
   * Get access token
   */
  getAccessToken(): string {
    return this.accessToken;
  }

  /**
   * Get current http host
   */
  getHttpHost(): string {
    return this.httpHost;
  }

  /**
   * Get WebSocket host from dispatch endpoint
   */
  async getWsHost(): Promise<string> {
    try {
      // The dispatch endpoint is on the same host as the API
      // Note: .replace('-api', '-disp') won't match '-apia', so we use httpHost directly
      this.platform.log.debug(`Fetching WebSocket host from: https://${this.httpHost}/dispatch/app`);

      const response = await this.httpClient.post<{ domain: string }>(
        '/dispatch/app',
        {
          appid: EWELINK_APP_ID,
          nonce: CryptoUtils.generateNonce(),
          ts: Math.floor(Date.now() / 1000),
          version: 8,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.data?.domain) {
        throw new Error('No WebSocket host received from dispatch endpoint');
      }

      const wsHost = `wss://${response.data.domain}:8080/api/ws`;
      this.platform.log.debug(`WebSocket host received: ${wsHost}`);

      return wsHost;

    } catch (error) {
      // Fallback to static mapping if dispatch fails
      if (axios.isAxiosError(error)) {
        this.platform.log.warn(`Failed to get WebSocket host from dispatch: ${error.response?.status} - ${error.response?.data?.msg || error.message}`);
        this.platform.log.debug(`Dispatch error details: ${JSON.stringify(error.response?.data, null, 2)}`);
      } else {
        this.platform.log.warn(`Failed to get WebSocket host from dispatch: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Since dispatch is failing, use numbered pconnect hosts which do exist
      // Try to get WebSocket host from mapping
      let wsHost: string | undefined;

      for (const [prefix, host] of Object.entries(WEBSOCKET_HOST_MAPPING)) {
        if (this.httpHost.includes(prefix)) {
          wsHost = host;
          break;
        }
      }

      // If no mapping found, try fallback hosts for the region
      if (!wsHost && WEBSOCKET_FALLBACK_HOSTS[this.region]) {
        wsHost = WEBSOCKET_FALLBACK_HOSTS[this.region][2]; // Use pconnect3 (index 2)
      }

      // Last resort fallback
      if (!wsHost) {
        wsHost = this.httpHost
          .replace('-apia.', '-pconnect3.')
          .replace('.cc', '.cc:8080')
          .replace('.cn', '.cn:8080');
      }

      this.platform.log.debug(`Using fallback WebSocket host: wss://${wsHost}/api/ws`);
      return `wss://${wsHost}/api/ws`;
    }
  }

  /**
   * Reload tokens from storage (for use when UI updates tokens)
   */
  async reloadTokensFromStorage(): Promise<boolean> {
    const tokens = this.tokenStorage.load();

    if (!tokens || !this.tokenStorage.isValid()) {
      this.platform.log.debug('No valid tokens found in storage');
      return false;
    }

    this.platform.log.debug('Reloading tokens from storage');
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.apiKey = tokens.apiKey;
    this.region = tokens.region as keyof typeof API_REGIONS;

    // Update HTTP client
    this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;

    this.platform.log.debug(`Reloaded tokens - Access token: ${this.accessToken.substring(0, 20)}...`);
    return true;
  }

  /**
   * Set authentication credentials (for use by UI server)
   */
  setCredentials(accessToken: string, apiKey?: string, refreshToken?: string): void {
    this.accessToken = accessToken;
    if (apiKey) {
      this.apiKey = apiKey;
    }
    if (refreshToken) {
      this.refreshToken = refreshToken;
    }
    this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;
  }

  /**
   * Set device state
   */
  async setDeviceState(deviceId: string, params: Record<string, unknown>): Promise<boolean> {
    try {
      this.platform.log.debug(`Setting device state for ${deviceId}:`, JSON.stringify(params));

      const response = await this.httpClient.post<APIResponse<unknown>>(
        '/v2/device/thing/status',
        {
          type: 1,
          id: deviceId,
          params,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        },
      );

      if (response.data.error === 0) {
        this.platform.log.debug(`Successfully updated device ${deviceId}`);
        return true;
      } else {
        this.platform.log.error(`Failed to update device ${deviceId}: ${response.data.msg || 'Unknown error'}`);
        return false;
      }

    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.platform.log.error(`HTTP error setting device state: ${error.response?.status} - ${error.response?.data?.msg || error.message}`);
      } else {
        this.platform.log.error(`Error setting device state: ${error instanceof Error ? error.message : String(error)}`);
      }
      return false;
    }
  }
}
