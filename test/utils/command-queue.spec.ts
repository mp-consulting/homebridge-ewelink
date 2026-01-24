import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandQueue } from '../../src/utils/command-queue.js';

describe('CommandQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default options', () => {
      const queue = new CommandQueue();
      const stats = queue.getStats();
      expect(stats.queueSize).toBe(0);
      expect(stats.activeCount).toBe(0);
    });

    it('should accept custom options', () => {
      const log = vi.fn();
      const getDeviceName = vi.fn().mockReturnValue('Test Device');
      const queue = new CommandQueue({
        minInterval: 500,
        concurrency: 5,
        log,
        getDeviceName,
      });

      expect(queue).toBeDefined();
    });
  });

  describe('enqueue', () => {
    it('should execute command immediately when queue is empty', async () => {
      const queue = new CommandQueue({ minInterval: 0 });
      const execute = vi.fn().mockResolvedValue(true);

      const promise = queue.enqueue('device1', execute);

      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBe(true);
      expect(execute).toHaveBeenCalledOnce();
    });

    it('should return the result of the execute function', async () => {
      const queue = new CommandQueue({ minInterval: 0 });
      const execute = vi.fn().mockResolvedValue(true);

      const result = await queue.enqueue('device1', execute);

      expect(result).toBe(true);
    });

    it('should reject when execute throws', async () => {
      const queue = new CommandQueue({ minInterval: 0 });
      const error = new Error('Command failed');
      const execute = vi.fn().mockRejectedValue(error);

      await expect(queue.enqueue('device1', execute)).rejects.toThrow('Command failed');
    });

    it('should throttle commands with minimum interval', async () => {
      const queue = new CommandQueue({ minInterval: 250 });
      const execute1 = vi.fn().mockResolvedValue(true);
      const execute2 = vi.fn().mockResolvedValue(true);

      queue.enqueue('device1', execute1);
      queue.enqueue('device2', execute2);

      // First command executes immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(execute1).toHaveBeenCalledOnce();
      expect(execute2).not.toHaveBeenCalled();

      // Second command waits for interval
      await vi.advanceTimersByTimeAsync(250);
      expect(execute2).toHaveBeenCalledOnce();
    });

    it('should respect concurrency limit', async () => {
      const queue = new CommandQueue({ minInterval: 0, concurrency: 2 });

      const resolvers: Array<(value: boolean) => void> = [];
      const createExecute = () => {
        return vi.fn().mockImplementation(() =>
          new Promise<boolean>((resolve) => {
            resolvers.push(resolve);
          }),
        );
      };

      const exec1 = createExecute();
      const exec2 = createExecute();
      const exec3 = createExecute();

      queue.enqueue('d1', exec1);
      queue.enqueue('d2', exec2);
      queue.enqueue('d3', exec3);

      await vi.advanceTimersByTimeAsync(0);

      // Only 2 should be running (concurrency limit)
      expect(exec1).toHaveBeenCalled();
      expect(exec2).toHaveBeenCalled();
      expect(exec3).not.toHaveBeenCalled();

      // Complete first command
      resolvers[0](true);
      await vi.advanceTimersByTimeAsync(0);

      // Now third should start
      expect(exec3).toHaveBeenCalled();
    });

    it('should process commands in FIFO order', async () => {
      const queue = new CommandQueue({ minInterval: 0, concurrency: 1 });
      const order: string[] = [];

      const createExecute = (id: string) => {
        return vi.fn().mockImplementation(async () => {
          order.push(id);
          return true;
        });
      };

      queue.enqueue('d1', createExecute('first'));
      queue.enqueue('d2', createExecute('second'));
      queue.enqueue('d3', createExecute('third'));

      await vi.runAllTimersAsync();

      expect(order).toEqual(['first', 'second', 'third']);
    });

    it('should log queue status', async () => {
      const log = vi.fn();
      const queue = new CommandQueue({ minInterval: 0, log });
      const execute = vi.fn().mockResolvedValue(true);

      queue.enqueue('device1', execute);

      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Command queued'),
      );
    });

    it('should use custom getDeviceName function', async () => {
      const log = vi.fn();
      const getDeviceName = vi.fn().mockReturnValue('Living Room Light');
      const queue = new CommandQueue({ minInterval: 0, log, getDeviceName });
      const execute = vi.fn().mockResolvedValue(true);

      queue.enqueue('device1', execute);

      expect(getDeviceName).toHaveBeenCalledWith('device1');
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Living Room Light'),
      );
    });
  });

  describe('getStats', () => {
    it('should return correct queue size', async () => {
      const queue = new CommandQueue({ minInterval: 1000, concurrency: 1 });

      // Create a blocking command
      let resolveFirst: (value: boolean) => void;
      const blockingExecute = vi.fn().mockImplementation(() =>
        new Promise<boolean>((resolve) => {
          resolveFirst = resolve;
        }),
      );

      queue.enqueue('d1', blockingExecute);
      queue.enqueue('d2', vi.fn().mockResolvedValue(true));
      queue.enqueue('d3', vi.fn().mockResolvedValue(true));

      await vi.advanceTimersByTimeAsync(0);

      // First is active, two are queued
      const stats = queue.getStats();
      expect(stats.activeCount).toBe(1);
      expect(stats.queueSize).toBe(2);

      // Cleanup
      resolveFirst!(true);
    });

    it('should track active count correctly', async () => {
      const queue = new CommandQueue({ minInterval: 0, concurrency: 3 });

      const resolvers: Array<(value: boolean) => void> = [];
      const createExecute = () => {
        return vi.fn().mockImplementation(() =>
          new Promise<boolean>((resolve) => {
            resolvers.push(resolve);
          }),
        );
      };

      queue.enqueue('d1', createExecute());
      queue.enqueue('d2', createExecute());

      await vi.advanceTimersByTimeAsync(0);

      expect(queue.getStats().activeCount).toBe(2);

      resolvers[0](true);
      await vi.advanceTimersByTimeAsync(0);

      expect(queue.getStats().activeCount).toBe(1);

      resolvers[1](true);
      await vi.advanceTimersByTimeAsync(0);

      expect(queue.getStats().activeCount).toBe(0);
    });
  });

  describe('clear', () => {
    it('should reject all pending commands', async () => {
      const queue = new CommandQueue({ minInterval: 1000, concurrency: 1 });

      // First command blocks
      let resolveFirst: (value: boolean) => void;
      const blockingExecute = vi.fn().mockImplementation(() =>
        new Promise<boolean>((resolve) => {
          resolveFirst = resolve;
        }),
      );

      queue.enqueue('d1', blockingExecute);

      // These get queued
      const promise2 = queue.enqueue('d2', vi.fn().mockResolvedValue(true));
      const promise3 = queue.enqueue('d3', vi.fn().mockResolvedValue(true));

      await vi.advanceTimersByTimeAsync(0);

      queue.clear();

      await expect(promise2).rejects.toThrow('Queue cleared');
      await expect(promise3).rejects.toThrow('Queue cleared');

      // Cleanup
      resolveFirst!(true);
    });

    it('should cancel pending throttle timeout', async () => {
      const queue = new CommandQueue({ minInterval: 500 });

      const promise1 = queue.enqueue('d1', vi.fn().mockResolvedValue(true));
      const promise2 = queue.enqueue('d2', vi.fn().mockResolvedValue(true));

      await vi.advanceTimersByTimeAsync(0);

      queue.clear();

      // The second command should not execute after clearing
      const stats = queue.getStats();
      expect(stats.queueSize).toBe(0);

      // Await first promise (should resolve) and catch second (should reject)
      await promise1;
      await expect(promise2).rejects.toThrow('Queue cleared');
    });

    it('should allow new commands after clearing', async () => {
      const queue = new CommandQueue({ minInterval: 0 });

      // With minInterval 0, command executes immediately
      const result1 = await queue.enqueue('d1', vi.fn().mockResolvedValue(true));
      expect(result1).toBe(true);

      queue.clear();

      const execute = vi.fn().mockResolvedValue(true);
      const result = await queue.enqueue('d2', execute);

      expect(result).toBe(true);
      expect(execute).toHaveBeenCalled();
    });
  });

  describe('throttling behavior', () => {
    it('should wait correct time between commands', async () => {
      const queue = new CommandQueue({ minInterval: 250 });
      const timestamps: number[] = [];

      const createExecute = () => {
        return vi.fn().mockImplementation(async () => {
          timestamps.push(Date.now());
          return true;
        });
      };

      const promises = [
        queue.enqueue('d1', createExecute()),
        queue.enqueue('d2', createExecute()),
        queue.enqueue('d3', createExecute()),
      ];

      await vi.runAllTimersAsync();
      await Promise.all(promises);

      expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(250);
      expect(timestamps[2] - timestamps[1]).toBeGreaterThanOrEqual(250);
    });

    it('should log throttling when waiting', async () => {
      const log = vi.fn();
      const queue = new CommandQueue({ minInterval: 250, log });

      const promises = [
        queue.enqueue('d1', vi.fn().mockResolvedValue(true)),
      ];
      await vi.advanceTimersByTimeAsync(0);

      promises.push(queue.enqueue('d2', vi.fn().mockResolvedValue(true)));
      await vi.advanceTimersByTimeAsync(0);

      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Throttling'),
      );

      // Clean up - await all promises
      await vi.runAllTimersAsync();
      await Promise.all(promises);
    });
  });

  describe('error handling', () => {
    it('should continue processing queue after command failure', async () => {
      const queue = new CommandQueue({ minInterval: 0, concurrency: 1 });

      const exec1 = vi.fn().mockRejectedValue(new Error('Failed'));
      const exec2 = vi.fn().mockResolvedValue(true);

      const promise1 = queue.enqueue('d1', exec1);
      const promise2 = queue.enqueue('d2', exec2);

      // Attach handlers immediately to prevent unhandled rejection warnings
      const result1 = promise1.catch((e: Error) => e);
      const result2 = promise2;

      await vi.runAllTimersAsync();

      const error = await result1;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Failed');

      await expect(result2).resolves.toBe(true);
    });

    it('should decrement activeCount on failure', async () => {
      const queue = new CommandQueue({ minInterval: 0 });

      const exec = vi.fn().mockRejectedValue(new Error('Failed'));

      const promise = queue.enqueue('d1', exec);

      // Attach handler immediately
      await expect(promise).rejects.toThrow('Failed');

      expect(queue.getStats().activeCount).toBe(0);
    });
  });
});
