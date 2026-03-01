import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import axios from 'axios';
import { EWeLinkAPI } from '../../src/api/ewelink-api.js';
import { createMockPlatform } from '../__mocks__/homebridge.js';

// Mock axios
vi.mock('axios');

// Mock token storage
vi.mock('../../src/utils/token-storage.js', () => ({
  TokenStorage: class MockTokenStorage {
    save = vi.fn();
    load = vi.fn().mockReturnValue(null);
    isValid = vi.fn().mockReturnValue(false);
  },
}));

// Mock crypto utils
vi.mock('../../src/utils/crypto-utils.js', () => ({
  CryptoUtils: {
    generateNonce: vi.fn().mockReturnValue('test-nonce-123'),
  },
}));

describe('EWeLinkAPI', () => {
  let api: EWeLinkAPI;
  let mockPlatform: ReturnType<typeof createMockPlatform>;
  let mockAxiosInstance: {
    defaults: { headers: { common: Record<string, string> }; baseURL: string };
    post: Mock;
    get: Mock;
    interceptors: { response: { use: Mock } };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPlatform = createMockPlatform({
      username: 'test@example.com',
      password: 'testpassword',
      countryCode: '1',
    });

    // Mock user storage path
    (mockPlatform.api!.user as { storagePath: () => string }).storagePath = () => '/tmp/test';

    mockAxiosInstance = {
      defaults: { headers: { common: {} }, baseURL: '' },
      post: vi.fn(),
      get: vi.fn(),
      interceptors: {
        response: { use: vi.fn() },
      },
    };

    (axios.create as Mock).mockReturnValue(mockAxiosInstance);

    api = new EWeLinkAPI(mockPlatform as any);
  });

  describe('constructor', () => {
    it('should create axios instance with correct config', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.stringContaining('https://'),
          timeout: expect.any(Number),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should set up response interceptor', () => {
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            at: 'access-token-123',
            rt: 'refresh-token-123',
            user: { apikey: 'api-key-123' },
          },
        },
      });

      await api.login();

      expect(api.accessToken).toBe('access-token-123');
      expect(api.refreshToken).toBe('refresh-token-123');
      expect(api.apiKey).toBe('api-key-123');
    });

    it('should throw error when credentials are missing', async () => {
      const platformNoCredentials = createMockPlatform({
        username: '',
        password: '',
      });
      (platformNoCredentials.api!.user as { storagePath: () => string }).storagePath = () => '/tmp/test';
      (axios.create as Mock).mockReturnValue(mockAxiosInstance);

      const apiNoCredentials = new EWeLinkAPI(platformNoCredentials as any);

      await expect(apiNoCredentials.login()).rejects.toThrow('Username and password are required');
    });

    it('should handle region redirect (error 10004)', async () => {
      // First call returns region redirect
      mockAxiosInstance.post
        .mockResolvedValueOnce({
          data: {
            error: 10004,
            data: { region: 'eu' },
          },
        })
        // Second call succeeds
        .mockResolvedValueOnce({
          data: {
            error: 0,
            data: {
              at: 'access-token-123',
              rt: 'refresh-token-123',
              user: { apikey: 'api-key-123' },
            },
          },
        });

      await api.login();

      expect(mockAxiosInstance.defaults.baseURL).toBe('https://eu-apia.coolkit.cc');
      expect(api.accessToken).toBe('access-token-123');
    });

    it('should throw error on unknown region redirect', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 10004,
          data: { region: 'unknown' },
        },
      });

      await expect(api.login()).rejects.toThrow('Unknown region received: unknown');
    });

    it('should throw error on login failure', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 10001,
          msg: 'Invalid password',
        },
      });

      // After base64 decode retry fails
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 10001,
          msg: 'Invalid password',
        },
      });

      await expect(api.login()).rejects.toThrow('Invalid password [10001]');
    });
  });

  describe('getHomes', () => {
    beforeEach(async () => {
      // Setup authenticated state
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            at: 'access-token-123',
            rt: 'refresh-token-123',
            user: { apikey: 'api-key-123' },
          },
        },
      });
      await api.login();
    });

    it('should return list of home IDs', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            familyList: [
              { id: 'home-1', name: 'Home 1' },
              { id: 'home-2', name: 'Home 2' },
            ],
          },
        },
      });

      const homes = await api.getHomes();

      expect(homes).toEqual(['home-1', 'home-2']);
    });

    it('should throw error on failure', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          error: 500,
          msg: 'Server error',
        },
      });

      await expect(api.getHomes()).rejects.toThrow('Server error');
    });
  });

  describe('getDevices', () => {
    beforeEach(async () => {
      // Setup authenticated state
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            at: 'access-token-123',
            rt: 'refresh-token-123',
            user: { apikey: 'api-key-123' },
          },
        },
      });
      await api.login();
    });

    it('should return devices from all homes', async () => {
      // Mock getHomes response
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            familyList: [{ id: 'home-1', name: 'Home' }],
          },
        },
      });

      // Mock device list response
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            thingList: [
              {
                itemType: 1,
                itemData: {
                  deviceid: 'device-1',
                  name: 'Switch',
                  extra: { uiid: 1 },
                },
              },
              {
                itemType: 1,
                itemData: {
                  deviceid: 'device-2',
                  name: 'Light',
                  extra: { uiid: 22 },
                },
              },
            ],
          },
        },
      });

      const result = await api.getDevices();

      expect(result.devices).toHaveLength(2);
      expect(result.devices[0].deviceid).toBe('device-1');
      expect(result.devices[1].deviceid).toBe('device-2');
    });

    it('should return empty when no homes found', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            familyList: [],
          },
        },
      });

      const result = await api.getDevices();

      expect(result.devices).toHaveLength(0);
      expect(result.groups).toHaveLength(0);
    });
  });

  describe('updateDevice', () => {
    beforeEach(async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            at: 'access-token-123',
            rt: 'refresh-token-123',
            user: { apikey: 'api-key-123' },
          },
        },
      });
      await api.login();
    });

    it('should return true on success', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { error: 0 },
      });

      const result = await api.updateDevice('device-1', { switch: 'on' });

      expect(result).toBe(true);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/v2/device/thing/status',
        expect.objectContaining({
          type: 1,
          id: 'device-1',
          params: { switch: 'on' },
        }),
      );
    });

    it('should return false on failure', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { error: 500 },
      });

      const result = await api.updateDevice('device-1', { switch: 'on' });

      expect(result).toBe(false);
    });
  });

  describe('getApiKey', () => {
    it('should return empty string when not logged in', () => {
      expect(api.getApiKey()).toBe('');
    });

    it('should return API key after login', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            at: 'access-token-123',
            rt: 'refresh-token-123',
            user: { apikey: 'api-key-123' },
          },
        },
      });

      await api.login();

      expect(api.getApiKey()).toBe('api-key-123');
    });
  });

  describe('getAccessToken', () => {
    it('should return empty string when not logged in', () => {
      expect(api.getAccessToken()).toBe('');
    });

    it('should return access token after login', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            at: 'access-token-123',
            rt: 'refresh-token-123',
            user: { apikey: 'api-key-123' },
          },
        },
      });

      await api.login();

      expect(api.getAccessToken()).toBe('access-token-123');
    });
  });

  describe('setCredentials', () => {
    it('should set credentials correctly', () => {
      api.setCredentials('new-access-token', 'new-api-key', 'new-refresh-token');

      expect(api.getAccessToken()).toBe('new-access-token');
      expect(api.getApiKey()).toBe('new-api-key');
    });

    it('should update authorization header', () => {
      api.setCredentials('new-access-token');

      expect(mockAxiosInstance.defaults.headers.common.Authorization).toBe('Bearer new-access-token');
    });
  });

  describe('getHttpHost', () => {
    it('should return the current HTTP host', () => {
      const host = api.getHttpHost();

      expect(host).toContain('apia.coolkit');
    });
  });

  describe('getDevice', () => {
    beforeEach(async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            at: 'access-token-123',
            rt: 'refresh-token-123',
            user: { apikey: 'api-key-123' },
          },
        },
      });
      await api.login();
    });

    it('should return device when found', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            thingList: [
              {
                itemData: {
                  deviceid: 'device-123',
                  name: 'Test Switch',
                  extra: { uiid: 1 },
                },
              },
            ],
          },
        },
      });

      const device = await api.getDevice('device-123');

      expect(device).toEqual({
        deviceid: 'device-123',
        name: 'Test Switch',
        extra: { uiid: 1 },
      });
    });

    it('should return null when device not found', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            thingList: [],
          },
        },
      });

      const device = await api.getDevice('unknown-device');

      expect(device).toBeNull();
    });

    it('should return null on API error', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          error: 500,
          msg: 'Server error',
        },
      });

      const device = await api.getDevice('device-123');

      expect(device).toBeNull();
    });

    it('should return null on network error', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('Network error'));

      const device = await api.getDevice('device-123');

      expect(device).toBeNull();
      expect(mockPlatform.log.error).toHaveBeenCalled();
    });
  });

  describe('updateGroup', () => {
    beforeEach(async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            at: 'access-token-123',
            rt: 'refresh-token-123',
            user: { apikey: 'api-key-123' },
          },
        },
      });
      await api.login();
    });

    it('should return true on success', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { error: 0 },
      });

      const result = await api.updateGroup('group-1', { switch: 'on' });

      expect(result).toBe(true);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/v2/device/thing/status',
        expect.objectContaining({
          type: 2, // Group type
          id: 'group-1',
          params: { switch: 'on' },
        }),
      );
    });

    it('should return false on failure', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { error: 500 },
      });

      const result = await api.updateGroup('group-1', { switch: 'on' });

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce(new Error('Network error'));

      const result = await api.updateGroup('group-1', { switch: 'on' });

      expect(result).toBe(false);
      expect(mockPlatform.log.error).toHaveBeenCalled();
    });
  });

  describe('getWsHost', () => {
    beforeEach(async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            at: 'access-token-123',
            rt: 'refresh-token-123',
            user: { apikey: 'api-key-123' },
          },
        },
      });
      await api.login();
    });

    it('should return WebSocket host from dispatch endpoint', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          domain: 'us-pconnect3.coolkit.cc',
        },
      });

      const wsHost = await api.getWsHost();

      expect(wsHost).toBe('wss://us-pconnect3.coolkit.cc:8080/api/ws');
    });

    it('should use fallback when dispatch fails', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce(new Error('Service unavailable'));

      const wsHost = await api.getWsHost();

      expect(wsHost).toContain('wss://');
      expect(wsHost).toContain('/api/ws');
    });

    it('should throw when dispatch returns no domain', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {},
      });

      const wsHost = await api.getWsHost();

      // Should fall back to static mapping
      expect(wsHost).toContain('wss://');
    });
  });

  describe('setDeviceState', () => {
    beforeEach(async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            at: 'access-token-123',
            rt: 'refresh-token-123',
            user: { apikey: 'api-key-123' },
          },
        },
      });
      await api.login();
    });

    it('should return true on success', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { error: 0 },
      });

      const result = await api.setDeviceState('device-1', { switch: 'on' });

      expect(result).toBe(true);
    });

    it('should return false on API error', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { error: 500, msg: 'Server error' },
      });

      const result = await api.setDeviceState('device-1', { switch: 'on' });

      expect(result).toBe(false);
      expect(mockPlatform.log.error).toHaveBeenCalled();
    });

    it('should return false on network error', async () => {
      const axiosError = new Error('Network error') as any;
      axiosError.isAxiosError = true;
      axiosError.response = { status: 500, data: { msg: 'Internal server error' } };
      mockAxiosInstance.post.mockRejectedValueOnce(axiosError);

      // Mock axios.isAxiosError
      vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const result = await api.setDeviceState('device-1', { switch: 'on' });

      expect(result).toBe(false);
    });
  });

  describe('reloadTokensFromStorage', () => {
    it('should return false when no valid tokens', async () => {
      const result = await api.reloadTokensFromStorage();

      expect(result).toBe(false);
    });
  });

  describe('getDevices - groups', () => {
    beforeEach(async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            at: 'access-token-123',
            rt: 'refresh-token-123',
            user: { apikey: 'api-key-123' },
          },
        },
      });
      await api.login();
    });

    it('should return devices and groups separately', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            familyList: [{ id: 'home-1', name: 'Home' }],
          },
        },
      });

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            thingList: [
              {
                itemType: 1,
                itemData: {
                  deviceid: 'device-1',
                  name: 'Switch',
                  extra: { uiid: 1 },
                },
              },
              {
                itemType: 3, // Group
                itemData: {
                  id: 'group-1',
                  name: 'Living Room',
                },
              },
            ],
          },
        },
      });

      const result = await api.getDevices();

      expect(result.devices).toHaveLength(1);
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].name).toBe('Living Room');
    });
  });

  describe('login - cn region', () => {
    it('should handle cn region redirect', async () => {
      mockAxiosInstance.post
        .mockResolvedValueOnce({
          data: {
            error: 10004,
            data: { region: 'cn' },
          },
        })
        .mockResolvedValueOnce({
          data: {
            error: 0,
            data: {
              at: 'access-token-123',
              rt: 'refresh-token-123',
              user: { apikey: 'api-key-123' },
            },
          },
        });

      await api.login();

      expect(mockAxiosInstance.defaults.baseURL).toBe('https://cn-apia.coolkit.cn');
    });
  });

  describe('login - as region', () => {
    it('should handle as region redirect', async () => {
      mockAxiosInstance.post
        .mockResolvedValueOnce({
          data: {
            error: 10004,
            data: { region: 'as' },
          },
        })
        .mockResolvedValueOnce({
          data: {
            error: 0,
            data: {
              at: 'access-token-123',
              rt: 'refresh-token-123',
              user: { apikey: 'api-key-123' },
            },
          },
        });

      await api.login();

      expect(mockAxiosInstance.defaults.baseURL).toBe('https://as-apia.coolkit.cc');
    });
  });

  describe('login - no msg error', () => {
    it('should throw full response when no msg in error', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 999,
        },
      });

      // After retry
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 999,
        },
      });

      await expect(api.login()).rejects.toThrow('Login failed:');
    });
  });

  describe('updateDevice - network error', () => {
    beforeEach(async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            at: 'access-token-123',
            rt: 'refresh-token-123',
            user: { apikey: 'api-key-123' },
          },
        },
      });
      await api.login();
    });

    it('should return false on network error', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce(new Error('Network error'));

      const result = await api.updateDevice('device-1', { switch: 'on' });

      expect(result).toBe(false);
      expect(mockPlatform.log.error).toHaveBeenCalled();
    });
  });

  describe('getDevices - home fetch error', () => {
    beforeEach(async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            at: 'access-token-123',
            rt: 'refresh-token-123',
            user: { apikey: 'api-key-123' },
          },
        },
      });
      await api.login();
    });

    it('should continue when device fetch fails for a home', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            familyList: [{ id: 'home-1', name: 'Home 1' }, { id: 'home-2', name: 'Home 2' }],
          },
        },
      });

      // First home fails
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          error: 500,
          msg: 'Server error',
        },
      });

      // Second home succeeds
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            thingList: [
              {
                itemType: 1,
                itemData: {
                  deviceid: 'device-1',
                  name: 'Switch',
                  extra: { uiid: 1 },
                },
              },
            ],
          },
        },
      });

      const result = await api.getDevices();

      expect(result.devices).toHaveLength(1);
      expect(mockPlatform.log.warn).toHaveBeenCalled();
    });
  });

  describe('login - phone number', () => {
    it('should use phoneNumber field for non-email login', async () => {
      const platformWithPhone = createMockPlatform({
        username: '1234567890',
        password: 'testpassword',
        countryCode: '1',
      });
      (platformWithPhone.api!.user as { storagePath: () => string }).storagePath = () => '/tmp/test';
      (axios.create as Mock).mockReturnValue(mockAxiosInstance);

      const apiWithPhone = new EWeLinkAPI(platformWithPhone as any);

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          error: 0,
          data: {
            at: 'access-token-123',
            rt: 'refresh-token-123',
            user: { apikey: 'api-key-123' },
          },
        },
      });

      await apiWithPhone.login();

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/v2/user/login',
        expect.objectContaining({
          phoneNumber: '1234567890',
          password: 'testpassword',
        }),
        expect.any(Object),
      );
    });
  });
});
