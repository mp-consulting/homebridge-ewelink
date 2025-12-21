import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams } from '../types/index.js';

enum PositionState {
  DECREASING = 0,
  INCREASING = 1,
  STOPPED = 2,
}

/**
 * Motor Accessory
 * Separate motor implementation for devices that need motor-specific control
 * Typically used for DUALR3 in motor mode or other motor controllers
 */
export class MotorAccessory extends BaseAccessory {
  private currentPosition = 0;
  private targetPosition = 0;
  private positionState: PositionState = PositionState.STOPPED;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Set up the window covering service (used for motor control)
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
  }

  /**
   * Initialize state from device params
   */
  private initializeFromParams(): void {
    // Handle currLocation (current position)
    if (this.deviceParams.currLocation !== undefined) {
      this.currentPosition = this.clamp(this.deviceParams.currLocation as number, 0, 100);
    }

    // Handle location (target position)
    if (this.deviceParams.location !== undefined) {
      this.targetPosition = this.clamp(this.deviceParams.location as number, 0, 100);
    } else {
      this.targetPosition = this.currentPosition;
    }

    // Update characteristics
    this.service.updateCharacteristic(this.Characteristic.CurrentPosition, this.currentPosition);
    this.service.updateCharacteristic(this.Characteristic.TargetPosition, this.targetPosition);
    this.service.updateCharacteristic(this.Characteristic.PositionState, this.positionState);

    this.logDebug(`Motor initialized at position ${this.currentPosition}%`);
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
    this.logInfo(`Setting motor position to ${newTarget}%`);

    // Determine direction
    if (newTarget > this.currentPosition) {
      this.positionState = PositionState.INCREASING;
    } else {
      this.positionState = PositionState.DECREASING;
    }

    this.service.updateCharacteristic(this.Characteristic.PositionState, this.positionState);

    // Prepare motor command
    const params: Record<string, any> = {
      location: newTarget,
    };

    // Determine motor direction (for DUALR3-style motors)
    if (newTarget > this.currentPosition) {
      params.motorTurn = 1; // Opening
    } else if (newTarget < this.currentPosition) {
      params.motorTurn = 2; // Closing
    } else {
      params.motorTurn = 0; // Stop
    }

    const success = await this.sendCommand(params);

    if (!success) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    // Update local cache
    Object.assign(this.deviceParams, params);

    // Handle currLocation (current position)
    if (params.currLocation !== undefined) {
      const newPosition = this.clamp(params.currLocation as number, 0, 100);
      if (newPosition !== this.currentPosition) {
        this.currentPosition = newPosition;
        this.service.updateCharacteristic(this.Characteristic.CurrentPosition, this.currentPosition);
        this.logDebug(`Current position updated to ${this.currentPosition}%`);
      }
    }

    // Handle location (target position)
    if (params.location !== undefined) {
      const newTarget = this.clamp(params.location as number, 0, 100);
      if (newTarget !== this.targetPosition) {
        this.targetPosition = newTarget;
        this.service.updateCharacteristic(this.Characteristic.TargetPosition, this.targetPosition);
        this.logDebug(`Target position updated to ${this.targetPosition}%`);
      }
    }

    // Update position state based on current vs target
    if (this.targetPosition === this.currentPosition) {
      this.positionState = PositionState.STOPPED;
    } else if (this.targetPosition > this.currentPosition) {
      this.positionState = PositionState.INCREASING;
    } else {
      this.positionState = PositionState.DECREASING;
    }

    this.service.updateCharacteristic(this.Characteristic.PositionState, this.positionState);
  }
}
