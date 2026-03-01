import type { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import type { EWeLinkPlatform } from '../platform.js';
import type { AccessoryContext, DeviceParams } from '../types/index.js';
import { TIMING } from '../constants/timing-constants.js';

/**
 * Garage Door Accessory
 */
export class GarageAccessory extends BaseAccessory {
  /** Current door state */
  private currentState = 1; // CLOSED

  /** Target door state */
  private targetState = 1; // CLOSED

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Set up the garage door opener service
    this.service = this.getOrAddService(this.Service.GarageDoorOpener);

    // Configure CurrentDoorState
    this.service.getCharacteristic(this.Characteristic.CurrentDoorState)
      .onGet(this.getCurrentDoorState.bind(this));

    // Configure TargetDoorState
    this.service.getCharacteristic(this.Characteristic.TargetDoorState)
      .onGet(this.getTargetDoorState.bind(this))
      .onSet(this.setTargetDoorState.bind(this));

    // Configure ObstructionDetected
    this.service.getCharacteristic(this.Characteristic.ObstructionDetected)
      .onGet(this.getObstructionDetected.bind(this));

    // Set initial state
    this.updateState(this.deviceParams);
  }

  /**
   * Get current door state
   */
  private async getCurrentDoorState(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.currentState, 'CurrentDoorState');
  }

  /**
   * Get target door state
   */
  private async getTargetDoorState(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.targetState, 'TargetDoorState');
  }

  /**
   * Set target door state
   */
  private async setTargetDoorState(value: CharacteristicValue): Promise<void> {
    const state = value as number;

    await this.handleSet(state, 'TargetDoorState', async (targetState) => {
      this.targetState = targetState;

      // Update current state to opening/closing
      if (targetState === this.Characteristic.TargetDoorState.OPEN) {
        this.currentState = this.Characteristic.CurrentDoorState.OPENING;
      } else {
        this.currentState = this.Characteristic.CurrentDoorState.CLOSING;
      }

      this.service.updateCharacteristic(
        this.Characteristic.CurrentDoorState,
        this.currentState,
      );

      // Send pulse command to trigger door
      // Most garage door openers use a momentary switch
      const success = await this.sendCommand({ switch: 'on' });

      if (success) {
        // Turn off after a short delay (pulse)
        setTimeout(async () => {
          await this.sendCommand({ switch: 'off' });
        }, TIMING.STATE_INIT_DELAY_MS);

        // Simulate door movement completion
        // In a real implementation, this would come from a sensor
        setTimeout(() => {
          if (targetState === this.Characteristic.TargetDoorState.OPEN) {
            this.currentState = this.Characteristic.CurrentDoorState.OPEN;
          } else {
            this.currentState = this.Characteristic.CurrentDoorState.CLOSED;
          }

          this.service.updateCharacteristic(
            this.Characteristic.CurrentDoorState,
            this.currentState,
          );
        }, TIMING.GARAGE_OPERATION_MS);
      }

      return success;
    });
  }

  /**
   * Get obstruction detected
   */
  private async getObstructionDetected(): Promise<CharacteristicValue> {
    return this.handleGet(() => false, 'ObstructionDetected');
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    // Parse door state from params
    // This depends on the specific device configuration
    // Many garage door setups use an additional sensor for state

    // For basic switch-based setup, infer state from switch
    if (params.switch !== undefined) {
      // If switch is on, door might be moving
      // Actual state would need a sensor
    }

    // Update characteristics
    this.service.updateCharacteristic(
      this.Characteristic.CurrentDoorState,
      this.currentState,
    );
    this.service.updateCharacteristic(
      this.Characteristic.TargetDoorState,
      this.targetState,
    );

    this.logDebug(`Door state updated: ${this.currentState}`);
  }
}
