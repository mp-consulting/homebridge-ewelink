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
    }, 5000);
  }

  /**
   * Refresh device state from server
   */
  private async refreshState(): Promise<void> {
    try {
      await this.platform.queryDeviceState(this.deviceId);
      this.logDebug('Device state refreshed');
    } catch (error) {
      this.logDebug(`Failed to refresh state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Initialize state from device params
   */
  private initializeFromParams(): void {
    // UIID 126 (DUALR3) uses currLocation and location
    if (this.deviceParams.currLocation !== undefined) {
      this.currentPosition = this.clamp(this.deviceParams.currLocation as number, 0, 100);
    }

    if (this.deviceParams.location !== undefined) {
      this.targetPosition = this.clamp(this.deviceParams.location as number, 0, 100);
    } else {
      this.targetPosition = this.currentPosition;
    }

    // UIID 11 uses setclose (inverted: 0 = open, 100 = closed)
    if (this.deviceParams.setclose !== undefined) {
      this.currentPosition = 100 - this.clamp(this.deviceParams.setclose as number, 0, 100);
      this.targetPosition = this.currentPosition;
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

    // Send command to device based on UIID
    const params: Record<string, any> = {};
    const uiid = this.accessory.context.device?.extra?.uiid;

    switch (uiid) {
      case 11:
        // UIID 11: uses setclose (inverted: 0 = open, 100 = closed)
        if ([0, 100].includes(newTarget)) {
          params.switch = newTarget === 100 ? 'on' : 'off';
        } else {
          params.setclose = 100 - newTarget;
        }
        break;
      case 67:
        // UIID 67: uses per parameter
        params.per = newTarget;
        break;
      case 126:
        // UIID 126 (DUALR3): uses motorTurn to control movement
        // First send the target location
        params.location = newTarget;
        // Then determine the motor direction based on current vs target
        if (newTarget > this.currentPosition) {
          params.motorTurn = 1; // Opening
        } else if (newTarget < this.currentPosition) {
          params.motorTurn = 2; // Closing
        } else {
          params.motorTurn = 0; // Stop (already at target)
        }
        break;
      default:
        // Default to location for other curtain types
        params.location = newTarget;
        break;
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
    // Update local cache
    Object.assign(this.deviceParams, params);

    let locationParams = false;

    // Handle currLocation (current position) - UIID 126 DUALR3
    if (params.currLocation !== undefined) {
      locationParams = true;
      const newPosition = this.clamp(params.currLocation as number, 0, 100);

      if (newPosition !== this.currentPosition) {
        this.currentPosition = newPosition;
        this.service.updateCharacteristic(
          this.Characteristic.CurrentPosition,
          this.currentPosition,
        );
        this.logDebug('Current position updated to ' + this.currentPosition + '%');
      }
    }

    // Handle location (target position) - UIID 126 DUALR3
    if (params.location !== undefined) {
      locationParams = true;
      const newTarget = this.clamp(params.location as number, 0, 100);

      if (newTarget !== this.targetPosition) {
        this.targetPosition = newTarget;
        this.service.updateCharacteristic(
          this.Characteristic.TargetPosition,
          this.targetPosition,
        );
        this.logDebug('Target position updated to ' + this.targetPosition + '%');
      }
    }

    // Update position state based on current vs target
    if (locationParams) {
      if (this.targetPosition === this.currentPosition) {
        // Stopped
        this.positionState = PositionState.STOPPED;
      } else if (this.targetPosition > this.currentPosition) {
        // Increasing (opening)
        this.positionState = PositionState.INCREASING;
      } else {
        // Decreasing (closing)
        this.positionState = PositionState.DECREASING;
      }

      this.service.updateCharacteristic(
        this.Characteristic.PositionState,
        this.positionState,
      );
    }

    // Handle position update from setclose (UIID 11)
    if (params.setclose !== undefined) {
      const newPosition = 100 - this.clamp(params.setclose as number, 0, 100);

      // If position update matches our target, we've arrived
      if (newPosition === this.targetPosition) {
        this.currentPosition = newPosition;
        this.positionState = PositionState.STOPPED;

        // Stop any ongoing timeout
        if (this.moveTimeout) {
          clearTimeout(this.moveTimeout);
          this.moveTimeout = undefined;
        }
      } else {
        // External change - update both current and target
        this.currentPosition = newPosition;
        this.targetPosition = newPosition;
        this.positionState = PositionState.STOPPED;
      }

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

      this.logDebug('Position updated to ' + this.currentPosition + '%');
    }

    // Handle switch off command (some devices use this for stop)
    if (params.switch === 'off') {
      this.stop();
    }
  }
}
