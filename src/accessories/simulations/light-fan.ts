import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import { EWeLinkPlatform } from '../../platform.js';
import { AccessoryContext, DeviceParams, LightDeviceConfig } from '../../types/index.js';
import { sleep } from '../../utils/sleep.js';
import { TIMING } from '../../constants/timing-constants.js';

/**
 * Light-Fan Simulation Accessory
 * Uses a dimmable light device to simulate a fan with speed control
 * Supports UIIDs: 36 (KING-M4), 44 (D1), 57
 */
export class LightFanAccessory extends BaseAccessory {
  /** Device configuration */
  private readonly deviceConfig?: LightDeviceConfig;

  /** Brightness step */
  private readonly brightnessStep: number;

  /** Show offline devices as off */
  private readonly offlineAsOff: boolean;

  /** Cached state */
  private cacheState: 'on' | 'off' = 'off';

  /** Cached speed (0-100) */
  private cacheSpeed = 0;

  /** Update key for debouncing speed changes */
  private updateKeySpeed?: string;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Get device-specific config
    this.deviceConfig = platform.config.lightDevices?.find(
      d => d.deviceId === this.deviceId,
    );

    this.brightnessStep = Math.min(this.deviceConfig?.brightnessStep || 1, 100);
    this.offlineAsOff = this.deviceConfig?.deviceModel === 'offlineAsOff';

    // Remove any existing lightbulb service
    this.removeServiceIfExists(this.Service.Lightbulb);

    // Set up Fan service
    this.service = this.getOrAddService(this.Service.Fan);

    // Configure on/off characteristic
    this.service.getCharacteristic(this.Characteristic.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.setOn.bind(this));

    // Configure rotation speed characteristic
    this.service.getCharacteristic(this.Characteristic.RotationSpeed)
      .setProps({ minStep: this.brightnessStep })
      .onGet(this.getSpeed.bind(this))
      .onSet(this.setSpeed.bind(this));

    // Initialize cached values from params
    const uiid = this.device.extra?.uiid || 0;
    if (uiid === 57) {
      this.cacheState = (this.deviceParams.state as string) === 'on' ? 'on' : 'off';
      const ch0 = parseInt(String(this.deviceParams.channel0 || 25), 10);
      this.cacheSpeed = Math.round(((ch0 - 25) * 10) / 23);
    } else {
      this.cacheState = (this.deviceParams.switch as string) === 'on' ? 'on' : 'off';
      if (uiid === 36) {
        const bright = parseInt(String(this.deviceParams.bright || 10), 10);
        this.cacheSpeed = Math.round(((bright - 10) * 10) / 9);
      } else if (uiid === 44) {
        this.cacheSpeed = parseInt(String(this.deviceParams.brightness || 0), 10);
      }
    }

    // Set initial characteristic values
    this.service.updateCharacteristic(this.Characteristic.On, this.cacheState === 'on');
    this.service.updateCharacteristic(this.Characteristic.RotationSpeed, this.cacheSpeed);
  }

  /**
   * Get on/off state
   */
  private async getOn(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.cacheState === 'on';
    }, 'On');
  }

  /**
   * Set on/off state
   */
  private async setOn(value: CharacteristicValue): Promise<void> {
    await this.handleSet(value as boolean, 'On', async (on) => {
      const newValue = on ? 'on' : 'off';
      if (this.cacheState === newValue) {
        return true;
      }

      const params: DeviceParams = {};
      const uiid = this.device.extra?.uiid || 0;

      switch (uiid) {
        case 36:
        case 44:
          params.switch = newValue;
          break;
        case 57:
          params.state = newValue;
          break;
        default:
          return false;
      }

      await this.sendCommand(params);
      this.cacheState = newValue;
      this.logInfo(`Fan: ${this.cacheState}`);
      return true;
    });
  }

  /**
   * Get rotation speed
   */
  private async getSpeed(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.cacheSpeed;
    }, 'RotationSpeed');
  }

  /**
   * Set rotation speed
   */
  private async setSpeed(value: CharacteristicValue): Promise<void> {
    const speed = value as number;
    if (this.cacheSpeed === speed) {
      return;
    }

    // Debounce speed updates
    const updateKey = Math.random().toString(36).substring(2, 7);
    this.updateKeySpeed = updateKey;
    await sleep(TIMING.STATE_INIT_DELAY_MS);

    if (updateKey !== this.updateKeySpeed) {
      return;
    }

    await this.handleSet(speed, 'RotationSpeed', async (newSpeed) => {
      const params: DeviceParams = {};
      const uiid = this.device.extra?.uiid || 0;

      switch (uiid) {
        case 36:
          // KING-M4 eWeLink scale is 10-100 and HomeKit scale is 0-100
          params.bright = Math.round((newSpeed * 9) / 10 + 10);
          break;
        case 44:
          // D1 eWeLink scale matches HomeKit scale of 0-100
          params.brightness = newSpeed;
          params.mode = 0;
          break;
        case 57:
          // Device eWeLink scale is 25-255 and HomeKit scale is 0-100
          params.channel0 = Math.round((newSpeed * 23) / 10 + 25).toString();
          break;
        default:
          return false;
      }

      await this.sendCommand(params);
      this.cacheSpeed = newSpeed;
      this.logInfo(`Fan speed: ${this.cacheSpeed}%`);
      return true;
    });
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    Object.assign(this.deviceParams, params);

    const uiid = this.device.extra?.uiid || 0;

    // Update on/off state
    if (uiid === 57) {
      if (params.state !== undefined) {
        const newState = params.state === 'on' ? 'on' : 'off';
        if (newState !== this.cacheState) {
          this.cacheState = newState;
          this.service.updateCharacteristic(this.Characteristic.On, this.cacheState === 'on');
          this.logDebug(`Fan state updated: ${this.cacheState}`);
        }
      }
    } else if (params.switch !== undefined) {
      const newState = params.switch === 'on' ? 'on' : 'off';
      if (newState !== this.cacheState) {
        this.cacheState = newState;
        this.service.updateCharacteristic(this.Characteristic.On, this.cacheState === 'on');
        this.logDebug(`Fan state updated: ${this.cacheState}`);
      }
    }

    // Update speed
    switch (uiid) {
      case 36:
        // KING-M4 eWeLink scale is 10-100 and HomeKit scale is 0-100
        if (params.bright !== undefined) {
          const bright = parseInt(String(params.bright), 10);
          const newSpeed = Math.round(((bright - 10) * 10) / 9);
          if (newSpeed !== this.cacheSpeed) {
            this.cacheSpeed = newSpeed;
            this.service.updateCharacteristic(this.Characteristic.RotationSpeed, this.cacheSpeed);
            this.logDebug(`Fan speed updated: ${this.cacheSpeed}%`);
          }
        }
        break;
      case 44:
        // D1 eWeLink scale matches HomeKit scale of 0-100
        if (params.brightness !== undefined) {
          const newSpeed = parseInt(String(params.brightness), 10);
          if (newSpeed !== this.cacheSpeed) {
            this.cacheSpeed = newSpeed;
            this.service.updateCharacteristic(this.Characteristic.RotationSpeed, this.cacheSpeed);
            this.logDebug(`Fan speed updated: ${this.cacheSpeed}%`);
          }
        }
        break;
      case 57:
        // Device eWeLink scale is 25-255 and HomeKit scale is 0-100
        if (params.channel0 !== undefined) {
          const ch0 = parseInt(String(params.channel0), 10);
          const newSpeed = Math.round(((ch0 - 25) * 10) / 23);
          if (newSpeed !== this.cacheSpeed) {
            this.cacheSpeed = newSpeed;
            this.service.updateCharacteristic(this.Characteristic.RotationSpeed, this.cacheSpeed);
            this.logDebug(`Fan speed updated: ${this.cacheSpeed}%`);
          }
        }
        break;
    }

    // Show as off if offlineAsOff is enabled and device is offline
    if (this.offlineAsOff && !this.isOnline && this.cacheState !== 'off') {
      this.service.updateCharacteristic(this.Characteristic.On, false);
      this.cacheState = 'off';
      this.logInfo('Fan offline, showing as off');
    }
  }
}
