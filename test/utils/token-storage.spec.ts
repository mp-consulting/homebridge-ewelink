import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenStorage, type StoredTokens } from '../../src/utils/token-storage.js';
import * as fs from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

describe('TokenStorage', () => {
  let tokenStorage: TokenStorage;
  const storagePath = '/tmp/test-storage';
  const expectedFilePath = '/tmp/test-storage/ewelink-tokens.json';

  const mockTokens = {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    apiKey: 'test-api-key',
    region: 'us',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tokenStorage = new TokenStorage(storagePath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with correct storage path', () => {
      expect(tokenStorage).toBeDefined();
    });
  });

  describe('save', () => {
    it('should write tokens to file with timestamp', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      tokenStorage.save(mockTokens);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expectedFilePath,
        JSON.stringify({ ...mockTokens, timestamp: now }, null, 2),
        'utf8',
      );
    });

    it('should handle write errors gracefully', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Write failed');
      });

      // Should not throw
      expect(() => tokenStorage.save(mockTokens)).not.toThrow();
      expect(consoleError).toHaveBeenCalledWith('Failed to save tokens:', expect.any(Error));

      consoleError.mockRestore();
    });
  });

  describe('load', () => {
    it('should return null if file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = tokenStorage.load();

      expect(result).toBeNull();
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should return parsed tokens if file exists', () => {
      const storedTokens: StoredTokens = { ...mockTokens, timestamp: Date.now() };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(storedTokens));

      const result = tokenStorage.load();

      expect(result).toEqual(storedTokens);
    });

    it('should return null and log error on parse failure', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

      const result = tokenStorage.load();

      expect(result).toBeNull();
      expect(consoleError).toHaveBeenCalledWith('Failed to load tokens:', expect.any(Error));

      consoleError.mockRestore();
    });

    it('should return null and log error on read failure', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read failed');
      });

      const result = tokenStorage.load();

      expect(result).toBeNull();
      expect(consoleError).toHaveBeenCalledWith('Failed to load tokens:', expect.any(Error));

      consoleError.mockRestore();
    });
  });

  describe('isValid', () => {
    it('should return false if no tokens exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(tokenStorage.isValid()).toBe(false);
    });

    it('should return true if tokens are less than 24 hours old', () => {
      const recentTimestamp = Date.now() - (23 * 60 * 60 * 1000); // 23 hours ago
      const storedTokens: StoredTokens = { ...mockTokens, timestamp: recentTimestamp };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(storedTokens));

      expect(tokenStorage.isValid()).toBe(true);
    });

    it('should return false if tokens are more than 24 hours old', () => {
      const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      const storedTokens: StoredTokens = { ...mockTokens, timestamp: oldTimestamp };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(storedTokens));

      expect(tokenStorage.isValid()).toBe(false);
    });

    it('should return false if tokens are exactly 24 hours old', () => {
      const exactTimestamp = Date.now() - (24 * 60 * 60 * 1000); // Exactly 24 hours ago
      const storedTokens: StoredTokens = { ...mockTokens, timestamp: exactTimestamp };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(storedTokens));

      expect(tokenStorage.isValid()).toBe(false);
    });

    it('should return true for tokens just created', () => {
      const storedTokens: StoredTokens = { ...mockTokens, timestamp: Date.now() };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(storedTokens));

      expect(tokenStorage.isValid()).toBe(true);
    });
  });

  describe('clear', () => {
    it('should write empty object to file if exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      tokenStorage.clear();

      expect(fs.writeFileSync).toHaveBeenCalledWith(expectedFilePath, '{}', 'utf8');
    });

    it('should not write if file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      tokenStorage.clear();

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Clear failed');
      });

      expect(() => tokenStorage.clear()).not.toThrow();
      expect(consoleError).toHaveBeenCalledWith('Failed to clear tokens:', expect.any(Error));

      consoleError.mockRestore();
    });
  });
});
