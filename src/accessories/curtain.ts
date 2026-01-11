import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams } from '../types/index.js';
import { TIMING } from '../constants/timing-constants.js';
import { getPositionParams, getMotorTurnParam } from '../constants/device-catalog.js';

export enum PositionState {
  DECREASING = 0,
  INCREASING = 1,
  STOPPED = 2,
}

/** Minimum position change to update HomeKit (debounce) */
const POSITION_UPDATE_THRESHOLD = 5;

/** Debounce time for position updates in milliseconds */
const POSITION_DEBOUNCE_MS = 1000;

/**
 * Curtain Accessory
 */
export class CurtainAccessory extends BaseAccessory {
  private currentPosition = 0;
  private targetPosition = 0;
  private positionState: PositionState = PositionState.STOPPED;
  private moveTimeout?: NodeJS.Timeout;

  /** Last position update sent to HomeKit (for debouncing) */
  private lastReportedPosition = 0;

  /** Debounce timer for position updates */
  private positionDebounceTimer?: NodeJS.Timeout;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Set up the window covering service
    this.service = this.getOrAddService(this.Service.WindowCovering);

    // Current position
    this.service.getCharacteristic(this.Characteristic.CurrentPosition)
      .onGet(this.getCurrentPosition.bind(this));

    // Target position
    this.service.getCharacteristic(this.Characteristic.TargetPosition)
      .onGet(this.getTargetPosition.bind(this))
      .onSet(this.setTargetPosition.bind(this));

    // Position state
    this.service.getCharacteristic(this.Characteristic.PositionState)
      .onGet(() => this.positionState);

    // Initialize from device params
    this.initializeFromParams();

    // Query fresh state after WebSocket connects (staggered delay to prevent overwhelming WebSocket)
    const staggerDelay = TIMING.CURTAIN_QUERY_DELAY_MS + platform.getCurtainStaggerDelay();
    setTimeout(() => {
      this.refreshState();
    }, staggerDelay);
  }

  /**
   * Refresh device state from server
   */
  private async refreshState(): Promise<void> {
    try {
      this.logDebug(`Refreshing state - Current: ${this.currentPosition}%, Target: ${this.targetPosition}%`);
      await this.platform.queryDeviceState(this.deviceId);

      // Wait a bit for the WebSocket response to be processed
      await new Promise(resolve => setTimeout(resolve, TIMING.STATE_INIT_DELAY_MS));

      this.logDebug(`State refreshed - Current: ${this.currentPosition}%, Target: ${this.targetPosition}%`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logError(`Failed to refresh state: ${errMsg}`);
    }
  }

  /**
   * Initialize state from device params
   */
  private initializeFromParams(): void {
    const uiid = this.device.extra?.uiid || 0;
    const positionConfig = getPositionParams(uiid);

    this.logDebug(`initializeFromParams: deviceParams=${JSON.stringify(this.deviceParams)}`);

    if (positionConfig) {
      const { current, target, inverted } = positionConfig;

      // Get current position from device params
      const rawCurrent = this.deviceParams[current];
      this.logDebug(`initializeFromParams: rawCurrent=${rawCurrent}, param=${current}`);
      if (rawCurrent !== undefined) {
        const value = this.clamp(rawCurrent as number, 0, 100);
        this.currentPosition = inverted ? 100 - value : value;
      }

      // Get target position (may be same param as current for some devices)
      const rawTarget = this.deviceParams[target];
      this.logDebug(`initializeFromParams: rawTarget=${rawTarget}, param=${target}`);
      if (rawTarget !== undefined && target !== current) {
        const value = this.clamp(rawTarget as number, 0, 100);
        this.targetPosition = inverted ? 100 - value : value;
      } else {
        this.targetPosition = this.currentPosition;
      }
    }

    this.logDebug(`initializeFromParams: currentPosition=${this.currentPosition}, targetPosition=${this.targetPosition}`);

    // Update characteristics
    this.service.updateCharacteristic(
      this.Characteristic.CurrentPosition,
      this.currentPosition,
    );
    this.service.updateCharacteristic(
      this.Characteristic.TargetPosition,
      this.targetPosition,
    );
    this.service.updateCharacteristic(
      this.Characteristic.PositionState,
      this.positionState,
    );

    this.logDebug('Curtain initialized at position ' + this.currentPosition + '%');
  }

  /**
   * Get current position
   */
  private async getCurrentPosition(): Promise<CharacteristicValue> {
    this.logDebug(`getCurrentPosition called, returning ${this.currentPosition}`);
    return this.handleGet(() => this.currentPosition, 'CurrentPosition');
  }

  /**
   * Get target position
   */
  private async getTargetPosition(): Promise<CharacteristicValue> {
    this.logDebug(`getTargetPosition called, returning ${this.targetPosition}`);
    return this.handleGet(() => this.targetPosition, 'TargetPosition');
  }

  /**
   * Set target position
   */
  private async setTargetPosition(value: CharacteristicValue): Promise<void> {
    const newTarget = this.clamp(value as number, 0, 100);
    const uiid = this.device.extra?.uiid || 0;
    const motorTurnParam = getMotorTurnParam(uiid);

    // Detect mid-movement stop: if curtain is moving and user taps to set target
    // near current position, interpret as a stop command
    if (this.positionState !== PositionState.STOPPED) {
      const positionDiff = Math.abs(newTarget - this.currentPosition);

      // If new target is very close to current position (within 5%), send stop
      if (positionDiff <= 5) {
        this.logInfo(`Stop requested (target ${newTarget}% near current ${this.currentPosition}%)`);
        await this.sendStopCommand();
        return;
      }
    }

    if (newTarget === this.currentPosition) {
      this.logDebug(`Already at position ${newTarget}%, skipping command`);
      this.targetPosition = newTarget;
      return;
    }

    this.targetPosition = newTarget;
    this.logInfo(`Setting position to ${newTarget}% (from ${this.currentPosition}%)`);

    // Determine direction
    if (newTarget > this.currentPosition) {
      this.positionState = PositionState.INCREASING;
    } else {
      this.positionState = PositionState.DECREASING;
    }

    this.service.updateCharacteristic(
      this.Characteristic.PositionState,
      this.positionState,
    );

    // Build command params using catalog
    const positionConfig = getPositionParams(uiid);
    const params: DeviceParams = {};

    if (positionConfig) {
      const { target, inverted } = positionConfig;
      const deviceValue = inverted ? 100 - newTarget : newTarget;

      // Some devices (UIID 11) use switch on/off for full open/close
      if (inverted && [0, 100].includes(newTarget)) {
        params.switch = newTarget === 100 ? 'on' : 'off';
      } else {
        params[target] = deviceValue;
      }

      // Add motor turn direction for devices that need it
      if (motorTurnParam) {
        if (newTarget > this.currentPosition) {
          params[motorTurnParam] = 1; // Opening
        } else if (newTarget < this.currentPosition) {
          params[motorTurnParam] = 2; // Closing
        } else {
          params[motorTurnParam] = 0; // Stop
        }
      }
    } else {
      // Fallback for unknown devices
      params.location = newTarget;
    }

    this.logDebug(`Sending curtain command (UIID ${uiid}): ${JSON.stringify(params)}`);
    const success = await this.sendCommand(params);

    if (!success) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  /**
   * Send stop command to curtain
   */
  private async sendStopCommand(): Promise<void> {
    const uiid = this.device.extra?.uiid || 0;
    const motorTurnParam = getMotorTurnParam(uiid);
    const params: DeviceParams = {};

    if (motorTurnParam) {
      params[motorTurnParam] = 0; // Stop
    } else {
      // Fallback: some devices stop when switch is off
      params.switch = 'off';
    }

    this.logDebug(`Sending stop command (UIID ${uiid}): ${JSON.stringify(params)}`);
    const success = await this.sendCommand(params);

    if (success) {
      // Update state immediately
      this.targetPosition = this.currentPosition;
      this.positionState = PositionState.STOPPED;

      this.service.updateCharacteristic(
        this.Characteristic.TargetPosition,
        this.targetPosition,
      );
      this.service.updateCharacteristic(
        this.Characteristic.PositionState,
        this.positionState,
      );
    }
  }

  /**
   * Stop the curtain movement
   */
  private stop(): void {
    if (this.moveTimeout) {
      clearTimeout(this.moveTimeout);
      this.moveTimeout = undefined;
    }

    this.targetPosition = this.currentPosition;
    this.positionState = PositionState.STOPPED;

    this.service.updateCharacteristic(
      this.Characteristic.TargetPosition,
      this.targetPosition,
    );
    this.service.updateCharacteristic(
      this.Characteristic.PositionState,
      this.positionState,
    );

    this.logDebug('Curtain stopped');
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    const uiid = this.device.extra?.uiid || 0;
    const positionConfig = getPositionParams(uiid);

    if (!positionConfig) {
      this.logDebug(`No position config for UIID ${uiid}`);
      return;
    }

    const { current, target, inverted } = positionConfig;
    let positionUpdated = false;
    const wasMoving = this.positionState !== PositionState.STOPPED;

    // Handle current position update
    const rawCurrent = params[current];
    if (rawCurrent !== undefined) {
      const rawValue = this.clamp(rawCurrent as number, 0, 100);
      const newPosition = inverted ? 100 - rawValue : rawValue;

      // Always update internal state
      const oldPosition = this.currentPosition;
      this.currentPosition = newPosition;

      // Debounce HomeKit updates: only update if position changed significantly
      // or if we've reached the target (always report final position)
      const positionChange = Math.abs(newPosition - this.lastReportedPosition);
      const reachedTarget = newPosition === this.targetPosition;

      if (positionChange >= POSITION_UPDATE_THRESHOLD || reachedTarget) {
        // Clear any pending debounce timer
        if (this.positionDebounceTimer) {
          clearTimeout(this.positionDebounceTimer);
          this.positionDebounceTimer = undefined;
        }

        // Update HomeKit immediately
        this.service.updateCharacteristic(
          this.Characteristic.CurrentPosition,
          this.currentPosition,
        );
        this.lastReportedPosition = newPosition;

        if (oldPosition !== newPosition) {
          this.logDebug(`Position update: ${oldPosition}% → ${newPosition}%`);
        }
      } else if (positionChange > 0) {
        // Small change - debounce it
        if (!this.positionDebounceTimer) {
          this.positionDebounceTimer = setTimeout(() => {
            this.positionDebounceTimer = undefined;
            this.service.updateCharacteristic(
              this.Characteristic.CurrentPosition,
              this.currentPosition,
            );
            this.lastReportedPosition = this.currentPosition;
          }, POSITION_DEBOUNCE_MS);
        }
      }

      positionUpdated = true;
    }

    // Handle target position update (only if different param from current)
    if (target !== current) {
      const rawTarget = params[target];
      if (rawTarget !== undefined) {
        const rawValue = this.clamp(rawTarget as number, 0, 100);
        const newTarget = inverted ? 100 - rawValue : rawValue;

        // Always update target position from device to keep HomeKit in sync
        this.targetPosition = newTarget;
        this.service.updateCharacteristic(
          this.Characteristic.TargetPosition,
          this.targetPosition,
        );
        this.logDebug('Target position synced to ' + this.targetPosition + '%');
        positionUpdated = true;
      }
    } else if (positionUpdated) {
      // For devices where current == target param, sync target to current
      this.targetPosition = this.currentPosition;
      this.positionState = PositionState.STOPPED;
      if (this.moveTimeout) {
        clearTimeout(this.moveTimeout);
        this.moveTimeout = undefined;
      }

      this.service.updateCharacteristic(
        this.Characteristic.TargetPosition,
        this.targetPosition,
      );
      this.logDebug('Position synced to ' + this.currentPosition + '%');
    }

    // Update position state based on current vs target
    if (positionUpdated) {
      const previousState = this.positionState;

      if (this.targetPosition === this.currentPosition) {
        this.positionState = PositionState.STOPPED;
      } else if (this.targetPosition > this.currentPosition) {
        this.positionState = PositionState.INCREASING;
      } else {
        this.positionState = PositionState.DECREASING;
      }

      this.service.updateCharacteristic(
        this.Characteristic.PositionState,
        this.positionState,
      );

      // Log when curtain reaches target position
      if (wasMoving && this.positionState === PositionState.STOPPED && previousState !== PositionState.STOPPED) {
        this.logInfo(`Reached target position: ${this.currentPosition}%`);
      }
    }

    // Handle motorTurn=0 as stop signal
    if (params.motorTurn === 0 && wasMoving) {
      this.positionState = PositionState.STOPPED;
      this.targetPosition = this.currentPosition;

      this.service.updateCharacteristic(
        this.Characteristic.TargetPosition,
        this.targetPosition,
      );
      this.service.updateCharacteristic(
        this.Characteristic.PositionState,
        this.positionState,
      );

      this.logInfo(`Movement stopped at ${this.currentPosition}%`);
    }

    // Handle switch off command (some devices use this for stop)
    if (params.switch === 'off') {
      this.stop();
    }

    this.logDebug(`updateState: after - currentPosition=${this.currentPosition}, targetPosition=${this.targetPosition}, positionState=${this.positionState}`);
  }
}
