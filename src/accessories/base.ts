import type {
  PlatformAccessory,
  Service,
  Characteristic,
  CharacteristicValue,
  HapStatusError,
  WithUUID,
} from 'homebridge';
import type { EWeLinkPlatform } from '../platform.js';
import type {
  AccessoryContext,
  DeviceParams,
  EWeLinkDevice,
  SingleDeviceConfig,
  MultiDeviceConfig,
} from '../types/index.js';
import { SwitchHelper } from '../utils/switch-helper.js';
import { EVE_CHARACTERISTIC_UUIDS } from '../utils/eve-characteristics.js';
import { TIMING, TEMPERATURE, POLLING } from '../constants/timing-constants.js';
import {
  TEMPERATURE_MIN,
  TEMPERATURE_MAX,
  HUMIDITY_MIN,
  HUMIDITY_MAX,
  POWER_DIVISOR,
  VOLTAGE_DIVISOR,
  CURRENT_DIVISOR,
} from '../constants/device-constants.js';

/**
 * A characteristic reference accepted by Service.updateCharacteristic
 * (either a Characteristic constructor or a UUID/name string)
 */
export type CharacteristicRef = string | WithUUID<{ new (): Characteristic }>;

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

  /** Pending timeouts created via setTrackedTimeout() */
  private readonly trackedTimeouts = new Set<NodeJS.Timeout>();

  /** Intervals created via setTrackedInterval() */
  private readonly trackedIntervals = new Set<NodeJS.Timeout>();

  /** Cleanup callbacks registered via registerCleanup() */
  private readonly cleanups = new Set<() => void>();

  /** Latest-request tokens used by claimLatest() */
  private readonly latestTokens = new Map<string, number>();

  /** Monotonic counter for claimLatest() tokens */
  private latestCounter = 0;

  /** Whether destroy() has been called */
  private destroyed = false;

  /** Whether the constructor applied the device params via applyInitialState() */
  private appliesInitialState = false;

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
   * Create a HAP SERVICE_COMMUNICATION_FAILURE error to throw from onGet/onSet handlers
   */
  protected createCommunicationError(): HapStatusError {
    return new this.platform.api.hap.HapStatusError(
      this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
    );
  }

  /**
   * Send a command and throw a HAP SERVICE_COMMUNICATION_FAILURE error if it fails.
   * Intended for onSet handlers so HomeKit shows "No Response" instead of a fake success.
   * @param params - Parameters to send to the device
   * @throws HapStatusError when the command was not acknowledged
   */
  protected async sendCommandOrThrow(params: DeviceParams): Promise<void> {
    const success = await this.sendCommand(params);
    if (!success) {
      throw this.createCommunicationError();
    }
  }

  /**
   * Update accessory state from device params
   * Must be implemented by subclasses
   */
  abstract updateState(params: DeviceParams): void;

  /**
   * Apply the initial device params to HomeKit (call from the constructor).
   * Marks the handler so refreshFromDevice() re-applies fresh params the same way.
   */
  protected applyInitialState(): void {
    this.appliesInitialState = true;
    this.updateState(this.deviceParams);
  }

  /**
   * Re-sync with a refreshed accessory.context.device when this handler is kept across
   * a re-initialization (e.g. cloud discovery after a cache restore) instead of being
   * replaced, so in-flight timers and movements survive. Handlers that applied their
   * initial state in the constructor get the fresh params through updateState(); others
   * (event-style handlers that would misread a full param set as a trigger) only merge them.
   */
  public refreshFromDevice(): void {
    if (this.destroyed) {
      return;
    }
    const params = this.accessory.context.device.params || {};
    if (this.appliesInitialState) {
      this.updateState(params);
    } else {
      this.mergeDeviceParams(params);
    }
  }

  /**
   * Merge incoming device params into the local cache
   * Call this at the start of updateState() implementations
   */
  protected mergeDeviceParams(params: DeviceParams): void {
    Object.assign(this.deviceParams, params);
  }

  /**
   * Get device configuration from singleDevices or multiDevices config
   * @returns Device configuration or undefined if not found
   */
  protected getSingleDeviceConfig(): SingleDeviceConfig | undefined {
    return this.getDeviceConfig(this.platform.config.singleDevices);
  }

  /**
   * Find this accessory's entry in a device config list (singleDevices, fanDevices, thDevices, ...)
   * @param list - Config list to search (may be undefined when not configured)
   * @returns Matching entry or undefined
   */
  protected getDeviceConfig<T extends { deviceId: string }>(list?: T[]): T | undefined {
    return list?.find(d => d.deviceId === this.deviceId);
  }

  /**
   * Get multi-device configuration
   * @returns Multi-device configuration or undefined if not found
   */
  protected getMultiDeviceConfig(): MultiDeviceConfig | undefined {
    return this.getDeviceConfig(this.platform.config.multiDevices);
  }

  /**
   * Apply temperature offset and factor, then clamp to valid range
   * @param temp - Raw temperature value
   * @param offset - Temperature offset to add
   * @param factor - Optional multiplier factor
   * @returns Processed temperature value
   */
  protected applyTemperatureOffset(
    temp: number,
    offset: number,
    factor?: number,
  ): number {
    let result = temp;
    if (factor !== undefined) {
      result *= factor;
    }
    result += offset;
    return this.clamp(this.roundTemperature(result), TEMPERATURE_MIN, TEMPERATURE_MAX);
  }

  /**
   * Apply humidity offset and clamp to valid range
   * @param humidity - Raw humidity value
   * @param offset - Humidity offset to add
   * @returns Processed humidity value
   */
  protected applyHumidityOffset(humidity: number, offset: number): number {
    return this.clamp(humidity + offset, HUMIDITY_MIN, HUMIDITY_MAX);
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
   * Remove a characteristic from a service if it exists
   */
  protected removeCharacteristicIfExists(service: Service, characteristicUUID: string): void {
    if (service.testCharacteristic(characteristicUUID)) {
      const characteristic = service.getCharacteristic(characteristicUUID);
      if (characteristic) {
        service.removeCharacteristic(characteristic);
      }
    }
  }

  /**
   * Setup Eve power monitoring characteristics on a service
   * @param service - The service to add characteristics to
   * @param hasFullPowerReadings - Whether to add voltage and current (true) or just power (false)
   */
  protected setupPowerMonitoringCharacteristics(service: Service, hasFullPowerReadings: boolean): void {
    const { CurrentConsumption, Voltage, ElectricCurrent } = this.platform.eveCharacteristics;

    // Add Current Consumption (Watts) - available on all power monitoring devices
    if (!service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption)) {
      service.addCharacteristic(CurrentConsumption);
    }

    // Add Voltage and Current for devices with full power readings
    if (hasFullPowerReadings) {
      if (!service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage)) {
        service.addCharacteristic(Voltage);
      }
      if (!service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent)) {
        service.addCharacteristic(ElectricCurrent);
      }
    } else {
      // Remove voltage/current if not supported
      this.removeCharacteristicIfExists(service, EVE_CHARACTERISTIC_UUIDS.Voltage);
      this.removeCharacteristicIfExists(service, EVE_CHARACTERISTIC_UUIDS.ElectricCurrent);
    }
  }

  /**
   * Setup polling interval for periodic updates (e.g., power monitoring).
   * The timers are tracked on this accessory and stopped by destroy().
   * Rejections from updateFn are caught and logged.
   * @param updateFn - Function to call on each interval
   * @param intervalMs - Polling interval in milliseconds (default: POLLING.UPDATE_INTERVAL_MS)
   * @param initialDelayMs - Initial delay before first poll (default: POLLING.INITIAL_DELAY_MS)
   * @returns Cleanup function to stop polling (safe to call multiple times)
   */
  protected setupPollingInterval(
    updateFn: () => Promise<void>,
    intervalMs: number = POLLING.UPDATE_INTERVAL_MS,
    initialDelayMs: number = POLLING.INITIAL_DELAY_MS,
  ): () => void {
    let initialTimer: NodeJS.Timeout | undefined;
    let intervalPoll: NodeJS.Timeout | undefined;
    let stopped = false;
    let unregister: () => void = () => undefined;

    const handleError = (err: unknown) => {
      this.logError('Polling update failed:', err);
    };

    const run = () => {
      try {
        updateFn().catch(handleError);
      } catch (err) {
        handleError(err);
      }
    };

    const cleanup = () => {
      stopped = true;
      if (initialTimer) {
        clearTimeout(initialTimer);
        initialTimer = undefined;
      }
      if (intervalPoll) {
        clearInterval(intervalPoll);
        intervalPoll = undefined;
      }
      unregister();
    };

    unregister = this.registerCleanup(cleanup);

    initialTimer = setTimeout(() => {
      initialTimer = undefined;
      if (stopped) {
        return;
      }
      run();
      intervalPoll = setInterval(run, intervalMs);
    }, initialDelayMs);

    return cleanup;
  }

  /**
   * Send a uiActive request so the device reports fresh power/sensor readings.
   * Errors are swallowed (logged by sendCommand).
   * @param outlet - Outlet index for multi-channel devices (e.g. DUALR3); omit for single-channel devices
   */
  protected async requestUiActiveUpdate(outlet?: number): Promise<void> {
    const params: DeviceParams = outlet === undefined
      ? { uiActive: POLLING.UI_ACTIVE_DURATION_S }
      : { uiActive: { outlet, time: POLLING.UI_ACTIVE_DURATION_S } };
    await this.sendCommand(params);
  }

  /**
   * Periodically request fresh readings via uiActive (see requestUiActiveUpdate()).
   * @param outlet - Outlet index for multi-channel devices; omit for single-channel devices
   * @returns Cleanup function to stop polling
   */
  protected setupUiActivePolling(outlet?: number): () => void {
    return this.setupPollingInterval(() => this.requestUiActiveUpdate(outlet));
  }

  /**
   * Update Eve power characteristics from DUALR3-style readings
   * (actPow_XX / voltage_XX / current_XX, scaled by the divisors), falling back
   * to plain power / voltage / current params.
   * @param service - Service holding the Eve characteristics
   * @param params - Incoming device params
   * @param options.suffix - Channel suffix of the scaled params (default '00')
   * @param options.fullReadings - Also update voltage and current (default true)
   */
  protected updateDualR3PowerReadings(
    service: Service,
    params: DeviceParams,
    options: { suffix?: string; fullReadings?: boolean } = {},
  ): void {
    const { suffix = '00', fullReadings = true } = options;

    const read = (scaledKey: string, plainKey: string, divisor: number): number | undefined => {
      const scaled = params[scaledKey];
      if (scaled !== undefined) {
        return Number.parseInt(String(scaled), 10) / divisor;
      }
      const plain = params[plainKey];
      if (plain !== undefined) {
        return Number.parseFloat(String(plain));
      }
      return undefined;
    };

    const power = read(`actPow_${suffix}`, 'power', POWER_DIVISOR);
    if (power !== undefined && !Number.isNaN(power)) {
      service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption, power);
      this.logDebug(`Power: ${power}W`);
    }

    if (!fullReadings) {
      return;
    }

    const voltage = read(`voltage_${suffix}`, 'voltage', VOLTAGE_DIVISOR);
    if (voltage !== undefined && !Number.isNaN(voltage)) {
      service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage, voltage);
      this.logDebug(`Voltage: ${voltage}V`);
    }

    const current = read(`current_${suffix}`, 'current', CURRENT_DIVISOR);
    if (current !== undefined && !Number.isNaN(current)) {
      service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent, current);
      this.logDebug(`Current: ${current}A`);
    }
  }

  /**
   * Register a cleanup callback that destroy() will run.
   * @param fn - Cleanup callback
   * @returns Function that unregisters the callback (without running it)
   */
  protected registerCleanup(fn: () => void): () => void {
    this.cleanups.add(fn);
    return () => {
      this.cleanups.delete(fn);
    };
  }

  /**
   * setTimeout that is automatically cleared by destroy().
   * Does nothing (callback never runs) once the accessory is destroyed.
   * @returns Timer handle (can be passed to clearTrackedTimeout())
   */
  protected setTrackedTimeout(fn: () => void, ms: number): NodeJS.Timeout {
    const handle = setTimeout(() => {
      this.trackedTimeouts.delete(handle);
      fn();
    }, ms);
    if (this.destroyed) {
      clearTimeout(handle);
    } else {
      this.trackedTimeouts.add(handle);
    }
    return handle;
  }

  /**
   * Clear a timeout created by setTrackedTimeout()
   */
  protected clearTrackedTimeout(handle: NodeJS.Timeout | undefined): void {
    if (handle) {
      clearTimeout(handle);
      this.trackedTimeouts.delete(handle);
    }
  }

  /**
   * setInterval that is automatically cleared by destroy()
   * @returns Timer handle (can be passed to clearTrackedInterval())
   */
  protected setTrackedInterval(fn: () => void, ms: number): NodeJS.Timeout {
    const handle = setInterval(fn, ms);
    if (this.destroyed) {
      clearInterval(handle);
    } else {
      this.trackedIntervals.add(handle);
    }
    return handle;
  }

  /**
   * Clear an interval created by setTrackedInterval()
   */
  protected clearTrackedInterval(handle: NodeJS.Timeout | undefined): void {
    if (handle) {
      clearInterval(handle);
      this.trackedIntervals.delete(handle);
    }
  }

  /**
   * Tracked sleep: resolves true after ms, or false early if the accessory is destroyed meanwhile
   */
  protected trackedSleep(ms: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (this.destroyed) {
        resolve(false);
        return;
      }
      const unregister = this.registerCleanup(() => resolve(false));
      this.setTrackedTimeout(() => {
        unregister();
        resolve(true);
      }, ms);
    });
  }

  /**
   * Mark a new request for `key` (latest wins). Replaces random "update key" strings.
   * @param key - Logical slot, e.g. 'brightness'
   * @returns Function returning true while this is still the most recent request for `key`
   * @example
   * const isLatest = this.claimLatest('speed');
   * await this.trackedSleep(500);
   * if (!isLatest()) return; // superseded by a newer slider value
   */
  protected claimLatest(key: string): () => boolean {
    const token = ++this.latestCounter;
    this.latestTokens.set(key, token);
    return () => !this.destroyed && this.latestTokens.get(key) === token;
  }

  /**
   * Debounce helper for sliders: claims `key`, waits delayMs, and reports whether
   * this call is still the latest one (false if superseded or destroyed).
   */
  protected async debounceLatest(key: string, delayMs: number): Promise<boolean> {
    const isLatest = this.claimLatest(key);
    const completed = await this.trackedSleep(delayMs);
    return completed && isLatest();
  }

  /**
   * Restore a characteristic to a previous value after a failed command
   * (delayed so HomeKit does not immediately overwrite it with the requested value).
   * @param service - Service owning the characteristic
   * @param characteristic - Characteristic constructor or UUID
   * @param value - Value to restore
   * @param delayMs - Delay before restoring (default TIMING.FAILED_COMMAND_RESET_MS)
   */
  protected revertCharacteristicLater(
    service: Service,
    characteristic: CharacteristicRef,
    value: CharacteristicValue,
    delayMs: number = TIMING.FAILED_COMMAND_RESET_MS,
  ): void {
    this.setTrackedTimeout(() => {
      service.updateCharacteristic(characteristic, value);
    }, delayMs);
  }

  /**
   * Whether destroy() has been called
   */
  protected get isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Release all resources held by this accessory: tracked timeouts/intervals,
   * polling, and registered cleanups. Called by the platform when the accessory
   * is removed and on shutdown. Subclasses overriding this must call super.destroy().
   * Safe to call multiple times.
   */
  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;

    for (const handle of this.trackedTimeouts) {
      clearTimeout(handle);
    }
    this.trackedTimeouts.clear();

    for (const handle of this.trackedIntervals) {
      clearInterval(handle);
    }
    this.trackedIntervals.clear();

    const cleanups = [...this.cleanups];
    this.cleanups.clear();
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (err) {
        this.logError('Cleanup failed:', err);
      }
    }

    this.latestTokens.clear();
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
   * Round temperature to configured decimal places (default: 1)
   */
  protected roundTemperature(temp: number): number {
    return Math.round(temp * TEMPERATURE.ROUND_FACTOR) / TEMPERATURE.ROUND_FACTOR;
  }

  /**
   * Generate random string for debouncing/update keys
   * @deprecated Use claimLatest() / debounceLatest() instead
   * @param length Length of the string to generate
   */
  protected generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
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
    // Toggle the cached state
    const newState = !cacheState;

    // Always send "on" command for inching mode
    const params = SwitchHelper.buildSwitchParams(deviceParams, channelIndex, true);

    // Set ignore flag to prevent echo updates
    this.startInchingIgnoreWindow(ignoreUpdatesRef);

    const success = await this.sendCommand(params);

    if (!success) {
      this.logError('Failed to set inching mode state');
      ignoreUpdatesRef.value = false;

      // Revert characteristic to previous state
      this.revertCharacteristicLater(service, characteristic, cacheState);

      throw this.createCommunicationError();
    }

    // Update characteristic with new cached state
    service.updateCharacteristic(characteristic, newState);

    this.logDebug(`Inching mode state toggled: ${newState ? 'ON' : 'OFF'}`);

    return newState;
  }

  /**
   * Set the inching "ignore echo" flag for TIMING.INCHING_DEBOUNCE_MS (tracked timer)
   * @param ignoreUpdatesRef - Reference object for ignore flag
   */
  protected startInchingIgnoreWindow(ignoreUpdatesRef: { value: boolean }): void {
    ignoreUpdatesRef.value = true;
    const isLatest = this.claimLatest('inching-ignore');
    this.setTrackedTimeout(() => {
      if (isLatest()) {
        ignoreUpdatesRef.value = false;
      }
    }, TIMING.INCHING_DEBOUNCE_MS);
  }
}
