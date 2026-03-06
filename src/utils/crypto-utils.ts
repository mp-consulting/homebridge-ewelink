import { randomBytes } from 'node:crypto';

/**
 * Cryptography and security utilities
 */
export class CryptoUtils {
  /**
   * Generate a cryptographically secure random nonce string (8 hex bytes = 16 chars).
   * Used for API authentication and WebSocket connections.
   */
  static generateNonce(): string {
    return randomBytes(8).toString('hex');
  }
}
