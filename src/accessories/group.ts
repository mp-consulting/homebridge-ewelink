import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams } from '../types/index.js';

/**
 * Group Device Accessory (UIID 5000 - virtual)
 * Provides a single switch to control multiple devices as a group
 */
export class GroupAccessory extends BaseAccessory {
  private cacheState: 'on' | 'off' = 'off';

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Set up the switch service
    this.service = this.getOrAddService(this.Service.Switch);

    // Configure on/off characteristic
    this.service.getCharacteristic(this.Characteristic.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.setOn.bind(this));

    // Initialize from device params
    this.initializeFromParams();
  }

  /**
   * Initialize state from device params
   */
  private initializeFromParams(): void {
    // Check for switch state
    if (this.deviceParams.switch !== undefined) {
      this.cacheState = this.deviceParams.switch as 'on' | 'off';
      this.service.updateCharacteristic(this.Characteristic.On, this.cacheState === 'on');
    }

    // Check for SCM format (switches array)
    if (this.deviceParams.switches && Array.isArray(this.deviceParams.switches)) {
      const switches = this.deviceParams.switches as Array<{ switch: string; outlet?: number }>;
      if (switches.length > 0) {
        this.cacheState = switches[0].switch as 'on' | 'off';
        this.service.updateCharacteristic(this.Characteristic.On, this.cacheState === 'on');
      }
    }

    this.logDebug(`Group initialized with state ${this.cacheState}`);
  }

  /**
   * Get switch state
   */
  private async getOn(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.cacheState === 'on', 'On');
  }

  /**
   * Set switch state
   */
  private async setOn(value: CharacteristicValue): Promise<void> {
    const newState = value ? 'on' : 'off';

    if (newState === this.cacheState) {
      return;
    }

    this.logInfo(`Setting group to ${newState}`);

    // Determine command format based on device params
    let params: Record<string, any>;

    if (this.deviceParams.switches) {
      // SCM format - use switches array
      params = {
        switches: [
          {
            switch: newState,
            outlet: 0,
          },
        ],
      };
    } else {
      // Standard format
      params = { switch: newState };
    }

    const success = await this.sendCommand(params);

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

    // Handle standard switch format
    if (params.switch !== undefined) {
      const newState = params.switch as 'on' | 'off';
      if (newState !== this.cacheState) {
        this.cacheState = newState;
        this.service.updateCharacteristic(this.Characteristic.On, this.cacheState === 'on');
        this.logDebug(`Group state updated to ${this.cacheState}`);
      }
    }

    // Handle SCM format
    if (params.switches && Array.isArray(params.switches)) {
      const switches = params.switches as Array<{ switch: string; outlet?: number }>;
      if (switches.length > 0) {
        const newState = switches[0].switch as 'on' | 'off';
        if (newState !== this.cacheState) {
          this.cacheState = newState;
          this.service.updateCharacteristic(this.Characteristic.On, this.cacheState === 'on');
          this.logDebug(`Group state updated to ${this.cacheState} (SCM format)`);
        }
      }
    }
  }
}
