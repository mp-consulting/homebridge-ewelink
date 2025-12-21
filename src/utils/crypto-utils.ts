/**
 * Cryptography and security utilities
 */
export class CryptoUtils {
  private static readonly NONCE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
  private static readonly NONCE_LENGTH = 8;

  /**
   * Generate a random nonce string
   * Used for API authentication and WebSocket connections
   */
  static generateNonce(): string {
    let result = '';
    for (let i = 0; i < this.NONCE_LENGTH; i++) {
      result += this.NONCE_CHARS.charAt(
        Math.floor(Math.random() * this.NONCE_CHARS.length),
      );
    }
    return result;
  }
}
