import { writeFileSync, readFileSync, existsSync, chmodSync } from 'fs';
import { join } from 'path';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  apiKey: string;
  region: string;
  timestamp: number;
}

/** Owner read/write only - the file contains account credentials */
const TOKEN_FILE_MODE = 0o600;

/** Maximum age of stored tokens before they are considered stale (24 hours) */
const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
      this.writeSecure(JSON.stringify(data, null, 2));
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
   * Load tokens only if they are still valid (single file read)
   */
  loadValid(): StoredTokens | null {
    const tokens = this.load();
    return this.isValid(tokens) ? tokens : null;
  }

  /**
   * Check if stored tokens are still valid (not older than 24 hours)
   * Pass already-loaded tokens to avoid reading the file again
   */
  isValid(tokens: StoredTokens | null = this.load()): boolean {
    if (!tokens || typeof tokens.timestamp !== 'number') {
      return false;
    }

    const age = Date.now() - tokens.timestamp;
    return age < TOKEN_MAX_AGE_MS;
  }

  /**
   * Clear stored tokens
   */
  clear(): void {
    try {
      if (existsSync(this.storagePath)) {
        this.writeSecure('{}');
      }
    } catch (error) {
      console.error('Failed to clear tokens:', error);
    }
  }

  /**
   * Write the token file with owner-only permissions
   * The mode option only applies on creation, so existing files are chmod'ed as well
   */
  private writeSecure(content: string): void {
    writeFileSync(this.storagePath, content, { encoding: 'utf8', mode: TOKEN_FILE_MODE });
    chmodSync(this.storagePath, TOKEN_FILE_MODE);
  }
}
