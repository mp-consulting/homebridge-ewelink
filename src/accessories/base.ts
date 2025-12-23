import {
  PlatformAccessory,
  Service,
  Characteristic,
  CharacteristicValue,
  WithUUID,
} from 'homebridge';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams, EWeLinkDevice } from '../types/index.js';
import { SwitchHelper } from '../utils/switch-helper.js';
import { TIMING } from '../constants/timing-constants.js';

/**
 * Base class for all accessory types
 */
export abstract class BaseAccessory {
  protected readonly platform: EWeLinkPlatform;
  protected readonly accessory: PlatformAccessory<AccessoryContext>;
  protected readonly Service: typeof Service;
  protected readonly Characteristic: typeof Characteristic;

  /** The main service for this accessory */
  protected service!: Service;

  /** Current device parameters */
  protected deviceParams: DeviceParams;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    this.platform = platform;
    this.accessory = accessory;
    this.Service = platform.Service;
    this.Characteristic = platform.Characteristic;
    this.deviceParams = accessory.context.device.params || {};
  }

  /**
   * Get the device from context
   */
  protected get device(): EWeLinkDevice {
    return this.accessory.context.device;
  }

  /**
   * Get the device ID
   */
  protected get deviceId(): string {
    return this.accessory.context.deviceId;
  }

  /**
   * Check if device is online
   */
  protected get isOnline(): boolean {
    // Default to true if online status is not explicitly set
    return this.device.online !== false;
  }

  /**
   * Log debug message
   */
  protected logDebug(message: string, ...args: unknown[]): void {
    if (this.platform.config.debug) {
      this.platform.log.debug(`[${this.accessory.displayName}] ${message}`, ...args);
    }
  }

  /**
   * Log info message
   */
  protected logInfo(message: string, ...args: unknown[]): void {
    if (!this.platform.config.disableDeviceLogging) {
      this.platform.log.info(`[${this.accessory.displayName}] ${message}`, ...args);
    }
  }

  /**
   * Log error message
   */
  protected logError(message: string, ...args: unknown[]): void {
    this.platform.log.error(`[${this.accessory.displayName}] ${message}`, ...args);
  }

  /**
   * Send command to device
   */
  protected async sendCommand(params: DeviceParams): Promise<boolean> {
    try {
      const success = await this.platform.sendDeviceCommand(this.deviceId, params);

      if (success) {
        // Update local cache
        Object.assign(this.deviceParams, params);
      }

      return success;

    } catch (error) {
      this.logError('Failed to send command:', error);
      return false;
    }
  }

  /**
   * Update accessory state from device params
   * Must be implemented by subclasses
   */
  abstract updateState(params: DeviceParams): void;

  /**
   * Merge incoming device params into the local cache
   * Call this at the start of updateState() implementations
   */
  protected mergeDeviceParams(params: DeviceParams): void {
    Object.assign(this.deviceParams, params);
  }

  /**
   * Mark device as online or offline
   * Called by platform when device status changes
   */
  markStatus(isOnline: boolean): void {
    // Update the device online status in context
    this.accessory.context.device.online = isOnline;

    // If device is offline and disableNoResponse is not enabled, do nothing
    // HomeKit will show NO RESPONSE automatically when commands fail
    if (!isOnline) {
      this.logDebug('Device marked as offline');
    } else {
      this.logDebug('Device marked as online');
    }
  }

  /**
   * Handle characteristic get request
   */
  protected async handleGet<T extends CharacteristicValue>(
    getValue: () => T | null | undefined,
    characteristic: string,
  ): Promise<T> {
    // Check if device is online (unless offlineAsOff is enabled)
    if (!this.isOnline && !this.platform.config.offlineAsOff) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    const value = getValue();

    if (value === null || value === undefined) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    this.logDebug(`GET ${characteristic}: ${value}`);
    return value;
  }

  /**
   * Handle characteristic set request
   */
  protected async handleSet<T extends CharacteristicValue>(
    value: T,
    characteristic: string,
    handler: (value: T) => Promise<boolean>,
  ): Promise<void> {
    this.logDebug(`SET ${characteristic}: ${value}`);

    const success = await handler(value);

    if (!success) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  /**
   * Add or get a service
   */
  protected getOrAddService(
    serviceType: WithUUID<typeof Service>,
    displayName?: string,
    subtype?: string,
  ): Service {
    const existingService = subtype
      ? this.accessory.getServiceById(serviceType, subtype)
      : this.accessory.getService(serviceType);

    if (existingService) {
      return existingService;
    }

    return this.accessory.addService(serviceType, displayName ?? '', subtype ?? '');
  }

  /**
   * Remove a service if it exists
   */
  protected removeServiceIfExists(serviceType: WithUUID<typeof Service>, subtype?: string): void {
    const service = subtype
      ? this.accessory.getServiceById(serviceType, subtype)
      : this.accessory.getService(serviceType);

    if (service) {
      this.accessory.removeService(service);
    }
  }

  /**
   * Convert Celsius to Fahrenheit
   */
  protected celsiusToFahrenheit(celsius: number): number {
    return (celsius * 9 / 5) + 32;
  }

  /**
   * Convert Fahrenheit to Celsius
   */
  protected fahrenheitToCelsius(fahrenheit: number): number {
    return (fahrenheit - 32) * 5 / 9;
  }

  /**
   * Clamp a value between min and max
   */
  protected clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Handle inching mode state change
   * Inching mode always sends "on" command but toggles internal cached state
   *
   * @param service - Service to update
   * @param characteristic - On characteristic
   * @param deviceParams - Current device parameters
   * @param channelIndex - Channel index for multi-channel devices
   * @param cacheState - Current cached state
   * @param ignoreUpdatesRef - Reference object for ignore flag {value: boolean}
   * @returns New cached state
   */
  protected async handleInchingModeSet(
    service: Service,
    characteristic: typeof Characteristic.On,
    deviceParams: DeviceParams,
    channelIndex: number,
    cacheState: boolean,
    ignoreUpdatesRef: { value: boolean },
  ): Promise<boolean> {
    try {
      // Toggle the cached state
      const newState = !cacheState;

      // Always send "on" command for inching mode
      const params = SwitchHelper.buildSwitchParams(deviceParams, channelIndex, true);

      // Set ignore flag to prevent echo updates
      ignoreUpdatesRef.value = true;
      setTimeout(() => {
        ignoreUpdatesRef.value = false;
      }, TIMING.INCHING_DEBOUNCE_MS);

      await this.sendCommand(params);

      // Update characteristic with new cached state
      service.updateCharacteristic(characteristic, newState);

      this.logDebug(`Inching mode state toggled: ${newState ? 'ON' : 'OFF'}`);

      return newState;
    } catch (err) {
      this.logError('Failed to set inching mode state', err);

      // Revert characteristic to previous state
      setTimeout(() => {
        service.updateCharacteristic(characteristic, cacheState);
      }, TIMING.FAILED_COMMAND_RESET_MS);

      throw err;
    }
  }
}
