import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams } from '../types/index.js';
import { TIMING, SIMULATION_TIMING } from '../constants/timing-constants.js';

/**
 * Humidifier Accessory (UIID 19)
 * Uses Fan service to control on/off and modes (low, medium, high)
 */
export class HumidifierAccessory extends BaseAccessory {
  private cacheState: 'on' | 'off' = 'off';
  private cacheMode: 1 | 2 | 3 = 1; // 1=low, 2=medium, 3=high
  private updateKey?: string;

  // Mode labels for logging
  private readonly mode2label = {
    1: 'low',
    2: 'medium',
    3: 'high',
  };

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    /*
      The device does not provide a current humidity reading so
      we use a fan accessory to be able to control the on/off state
      and the modes (1, 2, 3) using a rotation speed of (33%, 66%, 99%)
    */

    // Set up the fan service
    this.service = this.getOrAddService(this.Service.Fan);

    // Configure on/off characteristic
    this.service.getCharacteristic(this.Characteristic.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.setOn.bind(this));

    // Configure rotation speed characteristic (for mode control)
    this.service.getCharacteristic(this.Characteristic.RotationSpeed)
      .setProps({ minStep: 33 })
      .onGet(this.getRotationSpeed.bind(this))
      .onSet(this.setRotationSpeed.bind(this));

    // Initialize from device params
    this.initializeFromParams();
  }

  /**
   * Initialize state from device params
   */
  private initializeFromParams(): void {
    if (this.deviceParams.switch !== undefined) {
      this.cacheState = this.deviceParams.switch as 'on' | 'off';
      this.service.updateCharacteristic(this.Characteristic.On, this.cacheState === 'on');
    }

    if (this.deviceParams.state !== undefined) {
      this.cacheMode = this.deviceParams.state as 1 | 2 | 3;
      const rotationSpeed = this.cacheState === 'on' ? this.cacheMode * 33 : 0;
      this.service.updateCharacteristic(this.Characteristic.RotationSpeed, rotationSpeed);
    }
  }

  /**
   * Get on/off state
   */
  private async getOn(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.cacheState === 'on', 'On');
  }

  /**
   * Set on/off state
   */
  private async setOn(value: CharacteristicValue): Promise<void> {
    const newState = value ? 'on' : 'off';

    if (newState === this.cacheState) {
      return;
    }

    this.logInfo(`Setting state to ${newState}`);

    const params: DeviceParams = { switch: newState };
    if (newState === 'on') {
      params.state = this.cacheMode;
    }

    const success = await this.sendCommand(params);

    if (!success) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    this.cacheState = newState;

    // Update rotation speed to 0 when turning off
    if (newState === 'off') {
      this.service.updateCharacteristic(this.Characteristic.RotationSpeed, 0);
    }
  }

  /**
   * Get rotation speed (mode)
   */
  private async getRotationSpeed(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.cacheState === 'on' ? this.cacheMode * 33 : 0, 'RotationSpeed');
  }

  /**
   * Set rotation speed (mode)
   */
  private async setRotationSpeed(value: CharacteristicValue): Promise<void> {
    // Generate update key for debouncing
    const updateKey = this.generateRandomString(5);
    this.updateKey = updateKey;

    // Wait for debouncing (user might be sliding)
    await new Promise(resolve => setTimeout(resolve, TIMING.STATE_INIT_DELAY_MS));

    // Check if this is still the latest update
    if (updateKey !== this.updateKey) {
      return;
    }

    const rotationSpeed = value as number;
    const newState = rotationSpeed >= 1 ? 'on' : 'off';

    let newMode: 1 | 2 | 3 = this.cacheMode;
    if (rotationSpeed > 0) {
      if (rotationSpeed <= 33) {
        newMode = 1;
      } else if (rotationSpeed <= 66) {
        newMode = 2;
      } else {
        newMode = 3;
      }

      if (this.cacheMode === newMode && this.cacheState === newState) {
        return;
      }
    }

    this.logInfo(`Setting mode to ${rotationSpeed}% (${this.mode2label[newMode]})`);

    const params: DeviceParams = { switch: newState };
    if (rotationSpeed > 0) {
      params.state = newMode;
    }

    const success = await this.sendCommand(params);

    if (!success) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    if (newState !== this.cacheState) {
      this.cacheState = newState;
      this.service.updateCharacteristic(this.Characteristic.On, this.cacheState === 'on');
    }

    if (rotationSpeed === 0) {
      // Update the rotation speed back to the previous value (with the fan still off)
      setTimeout(() => {
        this.service.updateCharacteristic(this.Characteristic.RotationSpeed, this.cacheMode * 33);
      }, SIMULATION_TIMING.POSITION_CLEANUP_MS);
      return;
    }

    this.cacheMode = newMode;
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    // Update local cache
    Object.assign(this.deviceParams, params);

    // Update switch state
    if (params.switch !== undefined) {
      const newState = params.switch as 'on' | 'off';
      if (newState !== this.cacheState) {
        this.cacheState = newState;
        this.service.updateCharacteristic(this.Characteristic.On, this.cacheState === 'on');
        this.logDebug(`State updated to ${this.cacheState}`);

        if (this.cacheState !== 'on') {
          this.service.updateCharacteristic(this.Characteristic.RotationSpeed, 0);
        }
      }
    }

    // Update mode state
    if (params.state !== undefined) {
      const newMode = params.state as 1 | 2 | 3;
      if (newMode !== this.cacheMode) {
        this.cacheMode = newMode;
        if (this.cacheState === 'on') {
          this.service.updateCharacteristic(this.Characteristic.RotationSpeed, this.cacheMode * 33);
          this.logDebug(`Mode updated to ${this.mode2label[this.cacheMode]}`);
        }
      }
    }
  }
}
