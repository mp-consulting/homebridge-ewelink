import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  apiKey: string;
  region: string;
  timestamp: number;
}

/**
 * Simple file-based token storage for sharing between plugin and UI
 */
export class TokenStorage {
  private readonly storagePath: string;

  constructor(storagePath: string) {
    this.storagePath = join(storagePath, 'ewelink-tokens.json');
  }

  /**
   * Save tokens to storage
   */
  save(tokens: Omit<StoredTokens, 'timestamp'>): void {
    const data: StoredTokens = {
      ...tokens,
      timestamp: Date.now(),
    };

    try {
      writeFileSync(this.storagePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to save tokens:', error);
    }
  }

  /**
   * Load tokens from storage
   */
  load(): StoredTokens | null {
    if (!existsSync(this.storagePath)) {
      return null;
    }

    try {
      const data = readFileSync(this.storagePath, 'utf8');
      return JSON.parse(data) as StoredTokens;
    } catch (error) {
      console.error('Failed to load tokens:', error);
      return null;
    }
  }

  /**
   * Check if stored tokens are still valid (not older than 24 hours)
   */
  isValid(): boolean {
    const tokens = this.load();
    if (!tokens) {
      return false;
    }

    const age = Date.now() - tokens.timestamp;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    return age < maxAge;
  }

  /**
   * Clear stored tokens
   */
  clear(): void {
    try {
      if (existsSync(this.storagePath)) {
        writeFileSync(this.storagePath, '{}', 'utf8');
      }
    } catch (error) {
      console.error('Failed to clear tokens:', error);
    }
  }
}
