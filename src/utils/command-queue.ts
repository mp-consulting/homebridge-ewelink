/**
 * Command queue with throttling to prevent overwhelming the eWeLink API
 *
 * When HomeKit triggers scenes or automations, multiple devices may receive
 * commands simultaneously. This queue ensures commands are sent with a
 * minimum interval between them to avoid timeouts and rate limiting.
 */

interface QueuedCommand<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  deviceId: string;
  timestamp: number;
}

export interface CommandQueueOptions {
  /** Minimum interval between commands in milliseconds (default: 250ms) */
  minInterval?: number;
  /** Maximum concurrent commands (default: 3) */
  concurrency?: number;
  /** Log function for debug output */
  log?: (message: string) => void;
  /** Function to get device display name from device ID */
  getDeviceName?: (deviceId: string) => string;
}

/**
 * A queue that throttles command execution to prevent API overload
 */
export class CommandQueue {
  private readonly queue: QueuedCommand<boolean>[] = [];
  private readonly minInterval: number;
  private readonly concurrency: number;
  private readonly log: (message: string) => void;
  private readonly getDeviceName: (deviceId: string) => string;
  private activeCount = 0;
  private lastCommandTime = 0;
  private throttleTimeout: NodeJS.Timeout | null = null;

  constructor(options: CommandQueueOptions = {}) {
    this.minInterval = options.minInterval ?? 250;
    this.concurrency = options.concurrency ?? 3;
    this.log = options.log ?? (() => {});
    this.getDeviceName = options.getDeviceName ?? ((id) => id);
  }

  /**
   * Add a command to the queue and return a promise that resolves when it completes
   */
  async enqueue(
    deviceId: string,
    execute: () => Promise<boolean>,
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute,
        resolve,
        reject,
        deviceId,
        timestamp: Date.now(),
      });

      const displayName = this.getDeviceName(deviceId);
      this.log(`Command queued for ${displayName} (queue size: ${this.queue.length}, active: ${this.activeCount})`);
      this.processQueue();
    });
  }

  /**
   * Process queued commands respecting concurrency and interval limits
   */
  private processQueue(): void {
    // Process commands while we have capacity
    while (this.queue.length > 0 && this.activeCount < this.concurrency) {
      const now = Date.now();
      const timeSinceLastCommand = now - this.lastCommandTime;

      // If we need to wait for throttling, schedule a delayed call instead of blocking
      if (timeSinceLastCommand < this.minInterval) {
        // Only schedule if we don't already have a pending timeout
        if (!this.throttleTimeout) {
          const waitTime = this.minInterval - timeSinceLastCommand;
          this.log(`Throttling: scheduling next command in ${waitTime}ms`);
          this.throttleTimeout = setTimeout(() => {
            this.throttleTimeout = null;
            this.processQueue();
          }, waitTime);
        }
        return; // Exit and let the timeout callback continue processing
      }

      const command = this.queue.shift();
      if (!command) {
        break;
      }

      this.activeCount++;
      this.lastCommandTime = Date.now();

      const queueTime = Date.now() - command.timestamp;
      const displayName = this.getDeviceName(command.deviceId);
      this.log(`Executing command for ${displayName} (waited ${queueTime}ms in queue)`);

      // Execute command asynchronously and handle completion
      this.executeCommand(command);
    }
  }

  /**
   * Execute a single command and handle completion
   */
  private async executeCommand(command: QueuedCommand<boolean>): Promise<void> {
    try {
      const result = await command.execute();
      command.resolve(result);
    } catch (error) {
      command.reject(error);
    } finally {
      this.activeCount--;
      // Continue processing remaining commands
      this.processQueue();
    }
  }

  /**
   * Get current queue statistics
   */
  getStats(): { queueSize: number; activeCount: number } {
    return {
      queueSize: this.queue.length,
      activeCount: this.activeCount,
    };
  }

  /**
   * Clear all pending commands (rejects them with an error)
   */
  clear(): void {
    // Cancel any pending throttle timeout
    if (this.throttleTimeout) {
      clearTimeout(this.throttleTimeout);
      this.throttleTimeout = null;
    }

    while (this.queue.length > 0) {
      const command = this.queue.shift();
      if (command) {
        command.reject(new Error('Queue cleared'));
      }
    }
  }
}
