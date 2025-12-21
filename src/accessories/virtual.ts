import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams } from '../types/index.js';

/**
 * Virtual Device Accessory (UIID 265)
 * Supports both virtual buttons (StatelessProgrammableSwitch) and virtual switches
 */
export class VirtualAccessory extends BaseAccessory {
  private isButton: boolean;
  private cacheState: 'on' | 'off' = 'off';

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Determine if this is a button or switch based on presence of 'key' parameter
    this.isButton = this.deviceParams.key !== undefined;

    if (this.isButton) {
      // Virtual Button - use StatelessProgrammableSwitch
      this.service = this.getOrAddService(this.Service.StatelessProgrammableSwitch);

      // Configure button event characteristic
      this.service.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent)
        .setProps({
          minValue: 0,
          maxValue: 2,
          validValues: [0, 1, 2], // Single, Double, Long press
        });

      // Remove switch service if it exists from previous setup
      const switchService = this.accessory.getService(this.Service.Switch);
      if (switchService) {
        this.accessory.removeService(switchService);
      }

      this.logDebug('Configured as virtual button');
    } else {
      // Virtual Switch - use standard Switch service
      this.service = this.getOrAddService(this.Service.Switch);

      // Configure on/off characteristic
      this.service.getCharacteristic(this.Characteristic.On)
        .onGet(this.getOn.bind(this))
        .onSet(this.setOn.bind(this));

      // Remove button service if it exists from previous setup
      const buttonService = this.accessory.getService(this.Service.StatelessProgrammableSwitch);
      if (buttonService) {
        this.accessory.removeService(buttonService);
      }

      this.logDebug('Configured as virtual switch');
    }

    // Initialize from device params
    this.initializeFromParams();
  }

  /**
   * Initialize state from device params
   */
  private initializeFromParams(): void {
    if (!this.isButton && this.deviceParams.switch !== undefined) {
      this.cacheState = this.deviceParams.switch as 'on' | 'off';
      this.service.updateCharacteristic(this.Characteristic.On, this.cacheState === 'on');
    }
  }

  /**
   * Get switch state (for virtual switches only)
   */
  private async getOn(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.cacheState === 'on', 'On');
  }

  /**
   * Set switch state (for virtual switches only)
   */
  private async setOn(value: CharacteristicValue): Promise<void> {
    if (this.isButton) {
      return; // Buttons don't have a settable state
    }

    const newState = value ? 'on' : 'off';

    if (newState === this.cacheState) {
      return;
    }

    this.logInfo(`Setting virtual switch to ${newState}`);

    const success = await this.sendCommand({ switch: newState });

    if (!success) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    this.cacheState = newState;
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    // Update local cache
    Object.assign(this.deviceParams, params);

    if (this.isButton) {
      // Handle button press events
      if (params.key !== undefined) {
        const key = params.key as string;
        let eventType = 0; // Single press by default

        // Determine press type based on key value
        if (key.includes('double')) {
          eventType = 1; // Double press
        } else if (key.includes('long')) {
          eventType = 2; // Long press
        }

        this.service.updateCharacteristic(this.Characteristic.ProgrammableSwitchEvent, eventType);
        this.logDebug(`Button pressed: ${key} (event type: ${eventType})`);
      }
    } else {
      // Handle switch state updates
      if (params.switch !== undefined) {
        const newState = params.switch as 'on' | 'off';
        if (newState !== this.cacheState) {
          this.cacheState = newState;
          this.service.updateCharacteristic(this.Characteristic.On, this.cacheState === 'on');
          this.logDebug(`Virtual switch updated to ${this.cacheState}`);
        }
      }
    }
  }
}
