import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TokenStorage } from '../../src/utils/token-storage.js';

// Real filesystem tests for token file permissions (token-storage.spec.ts mocks fs)
describe.skipIf(process.platform === 'win32')('TokenStorage file permissions', () => {
  let dir: string;
  let filePath: string;

  const tokens = {
    accessToken: 'at',
    refreshToken: 'rt',
    apiKey: 'key',
    region: 'eu',
  };

  const modeOf = (path: string) => statSync(path).mode & 0o777;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ewelink-tokens-'));
    filePath = join(dir, 'ewelink-tokens.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('should create the token file with mode 0600', () => {
    new TokenStorage(dir).save(tokens);

    expect(modeOf(filePath)).toBe(0o600);
  });

  it('should tighten permissions of an existing world-readable file', () => {
    writeFileSync(filePath, '{}', { mode: 0o644 });
    expect(modeOf(filePath)).not.toBe(0o600);

    new TokenStorage(dir).save(tokens);

    expect(modeOf(filePath)).toBe(0o600);
  });

  it('should keep mode 0600 when clearing', () => {
    writeFileSync(filePath, '{}', { mode: 0o644 });

    new TokenStorage(dir).clear();

    expect(modeOf(filePath)).toBe(0o600);
  });

  it('should round-trip tokens through loadValid', () => {
    const storage = new TokenStorage(dir);
    storage.save(tokens);

    expect(storage.loadValid()).toMatchObject(tokens);
  });
});
