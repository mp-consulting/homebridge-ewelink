import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sleep, generateRandomString } from '../../src/utils/sleep.js';

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sleep', () => {
    it('should return a promise', () => {
      const result = sleep(100);
      expect(result).toBeInstanceOf(Promise);
    });

    it('should resolve after specified milliseconds', async () => {
      const resolved = vi.fn();

      sleep(1000).then(resolved);

      expect(resolved).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(999);
      expect(resolved).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(resolved).toHaveBeenCalled();
    });

    it('should resolve immediately for 0ms', async () => {
      const resolved = vi.fn();

      sleep(0).then(resolved);

      await vi.advanceTimersByTimeAsync(0);
      expect(resolved).toHaveBeenCalled();
    });

    it('should resolve with undefined', async () => {
      const promise = sleep(100);

      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result).toBeUndefined();
    });

    it('should handle multiple sleeps concurrently', async () => {
      const order: number[] = [];

      sleep(100).then(() => order.push(1));
      sleep(200).then(() => order.push(2));
      sleep(50).then(() => order.push(3));

      await vi.advanceTimersByTimeAsync(50);
      expect(order).toEqual([3]);

      await vi.advanceTimersByTimeAsync(50);
      expect(order).toEqual([3, 1]);

      await vi.advanceTimersByTimeAsync(100);
      expect(order).toEqual([3, 1, 2]);
    });
  });

  describe('generateRandomString', () => {
    it('should return string of specified length', () => {
      expect(generateRandomString(8)).toHaveLength(8);
      expect(generateRandomString(16)).toHaveLength(16);
      expect(generateRandomString(1)).toHaveLength(1);
    });

    it('should return empty string for length 0', () => {
      expect(generateRandomString(0)).toBe('');
    });

    it('should only contain lowercase letters and digits', () => {
      const result = generateRandomString(100);
      expect(result).toMatch(/^[a-z0-9]+$/);
    });

    it('should generate different strings on multiple calls', () => {
      const results = new Set<string>();
      for (let i = 0; i < 100; i++) {
        results.add(generateRandomString(8));
      }
      // With random strings, we should get mostly unique values
      expect(results.size).toBeGreaterThan(90);
    });

    it('should handle large lengths', () => {
      const result = generateRandomString(1000);
      expect(result).toHaveLength(1000);
      expect(result).toMatch(/^[a-z0-9]+$/);
    });
  });
});
