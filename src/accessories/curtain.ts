import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams } from '../types/index.js';
import { TIMING } from '../constants/timing-constants.js';
import { getPositionParams, getMotorTurnParam } from '../constants/device-constants.js';

export enum PositionState {
  DECREASING = 0,
  INCREASING = 1,
  STOPPED = 2,
}

/**
 * Curtain Accessory
 */
export class CurtainAccessory extends BaseAccessory {
  private currentPosition = 0;
  private targetPosition = 0;
  private positionState: PositionState = PositionState.STOPPED;
  private moveTimeout?: NodeJS.Timeout;

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

    // Query fresh state after WebSocket connects (delayed to allow connection)
    setTimeout(() => {
      this.refreshState();
    }, TIMING.CURTAIN_QUERY_DELAY_MS);
  }

  /**
   * Refresh device state from server
   */
  private async refreshState(): Promise<void> {
    try {
      this.logInfo(`Refreshing state - Current: ${this.currentPosition}%, Target: ${this.targetPosition}%`);
      await this.platform.queryDeviceState(this.deviceId);

      // Wait a bit for the WebSocket response to be processed
      await new Promise(resolve => setTimeout(resolve, TIMING.STATE_INIT_DELAY_MS));

      this.logInfo(`State refreshed - Current: ${this.currentPosition}%, Target: ${this.targetPosition}%`);
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

    if (positionConfig) {
      const { current, target, inverted } = positionConfig;

      // Get current position from device params
      const rawCurrent = this.deviceParams[current];
      if (rawCurrent !== undefined) {
        const value = this.clamp(rawCurrent as number, 0, 100);
        this.currentPosition = inverted ? 100 - value : value;
      }

      // Get target position (may be same param as current for some devices)
      const rawTarget = this.deviceParams[target];
      if (rawTarget !== undefined && target !== current) {
        const value = this.clamp(rawTarget as number, 0, 100);
        this.targetPosition = inverted ? 100 - value : value;
      } else {
        this.targetPosition = this.currentPosition;
      }
    }

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
    return this.handleGet(() => this.currentPosition, 'CurrentPosition');
  }

  /**
   * Get target position
   */
  private async getTargetPosition(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.targetPosition, 'TargetPosition');
  }

  /**
   * Set target position
   */
  private async setTargetPosition(value: CharacteristicValue): Promise<void> {
    const newTarget = this.clamp(value as number, 0, 100);

    if (newTarget === this.currentPosition) {
      this.targetPosition = newTarget;
      return;
    }

    this.targetPosition = newTarget;
    this.logInfo('Setting curtain position to ' + newTarget + '%');

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
    const uiid = this.device.extra?.uiid || 0;
    const positionConfig = getPositionParams(uiid);
    const motorTurnParam = getMotorTurnParam(uiid);
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
      return;
    }

    const { current, target, inverted } = positionConfig;
    let positionUpdated = false;

    // Handle current position update
    const rawCurrent = params[current];
    if (rawCurrent !== undefined) {
      const rawValue = this.clamp(rawCurrent as number, 0, 100);
      const newPosition = inverted ? 100 - rawValue : rawValue;

      if (newPosition !== this.currentPosition) {
        this.logInfo(`Current position changing from ${this.currentPosition}% to ${newPosition}%`);
        this.currentPosition = newPosition;
        this.service.updateCharacteristic(
          this.Characteristic.CurrentPosition,
          this.currentPosition,
        );
        positionUpdated = true;
      }
    }

    // Handle target position update (only if different param from current)
    if (target !== current) {
      const rawTarget = params[target];
      if (rawTarget !== undefined) {
        const rawValue = this.clamp(rawTarget as number, 0, 100);
        const newTarget = inverted ? 100 - rawValue : rawValue;

        if (newTarget !== this.targetPosition) {
          this.targetPosition = newTarget;
          this.service.updateCharacteristic(
            this.Characteristic.TargetPosition,
            this.targetPosition,
          );
          this.logDebug('Target position updated to ' + this.targetPosition + '%');
          positionUpdated = true;
        }
      }
    } else if (positionUpdated) {
      // For devices where current == target param, sync target to current
      if (this.currentPosition === this.targetPosition) {
        // Already at target - stopped
        this.positionState = PositionState.STOPPED;
        if (this.moveTimeout) {
          clearTimeout(this.moveTimeout);
          this.moveTimeout = undefined;
        }
      } else {
        // External change - update target to match current
        this.targetPosition = this.currentPosition;
        this.positionState = PositionState.STOPPED;
      }

      this.service.updateCharacteristic(
        this.Characteristic.TargetPosition,
        this.targetPosition,
      );
      this.logDebug('Position updated to ' + this.currentPosition + '%');
    }

    // Update position state based on current vs target
    if (positionUpdated) {
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
    }

    // Handle switch off command (some devices use this for stop)
    if (params.switch === 'off') {
      this.stop();
    }
  }
}
