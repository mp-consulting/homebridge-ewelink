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
    return randomBytes(4).toString('hex'); // 4 bytes = 8 hex chars, as required by the API
  }
}
