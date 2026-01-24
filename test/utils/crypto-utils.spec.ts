import { describe, it, expect } from 'vitest';
import { CryptoUtils } from '../../src/utils/crypto-utils.js';

describe('CryptoUtils', () => {
  describe('generateNonce', () => {
    it('should return string of length 8', () => {
      const nonce = CryptoUtils.generateNonce();
      expect(nonce).toHaveLength(8);
    });

    it('should only contain lowercase letters and digits', () => {
      const nonce = CryptoUtils.generateNonce();
      expect(nonce).toMatch(/^[a-z0-9]+$/);
    });

    it('should generate different nonces on multiple calls', () => {
      const nonces = new Set<string>();
      for (let i = 0; i < 100; i++) {
        nonces.add(CryptoUtils.generateNonce());
      }
      // With random strings, we should get mostly unique values
      expect(nonces.size).toBeGreaterThan(90);
    });

    it('should be suitable for API authentication', () => {
      const nonce = CryptoUtils.generateNonce();

      // Should be URL-safe (no special characters)
      expect(encodeURIComponent(nonce)).toBe(nonce);

      // Should be non-empty
      expect(nonce.length).toBeGreaterThan(0);
    });

    it('should not contain uppercase letters', () => {
      for (let i = 0; i < 50; i++) {
        const nonce = CryptoUtils.generateNonce();
        expect(nonce).not.toMatch(/[A-Z]/);
      }
    });

    it('should not contain special characters', () => {
      for (let i = 0; i < 50; i++) {
        const nonce = CryptoUtils.generateNonce();
        expect(nonce).not.toMatch(/[^a-z0-9]/);
      }
    });
  });
});
