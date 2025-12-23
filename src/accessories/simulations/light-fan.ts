import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import { EWeLinkPlatform } from '../../platform.js';
import { AccessoryContext, DeviceParams, LightDeviceConfig } from '../../types/index.js';
import { sleep } from '../../utils/sleep.js';
import { TIMING } from '../../constants/timing-constants.js';
import {
  getBrightnessParams,
  getSwitchParamName,
  normalizeBrightness,
  denormalizeBrightness,
} from '../../constants/device-constants.js';

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

    // Initialize cached values from params using catalog
    const uiid = this.device.extra?.uiid || 0;
    const switchParam = getSwitchParamName(uiid);
    const brightnessConfig = getBrightnessParams(uiid);

    // Get on/off state using catalog-defined parameter name
    const switchValue = this.deviceParams[switchParam] as string;
    this.cacheState = switchValue === 'on' ? 'on' : 'off';

    // Get brightness/speed using catalog-defined parameter and normalize to 0-100
    if (brightnessConfig) {
      const rawValue = parseInt(String(this.deviceParams[brightnessConfig.param] || brightnessConfig.min), 10);
      this.cacheSpeed = normalizeBrightness(uiid, rawValue);
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

      // Use catalog to get the correct on/off parameter name
      const uiid = this.device.extra?.uiid || 0;
      const switchParam = getSwitchParamName(uiid);
      const params: DeviceParams = { [switchParam]: newValue };

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
      const uiid = this.device.extra?.uiid || 0;
      const brightnessConfig = getBrightnessParams(uiid);

      if (!brightnessConfig) {
        return false;
      }

      // Convert 0-100 to device-specific range using catalog
      const deviceValue = denormalizeBrightness(uiid, newSpeed);
      const params: DeviceParams = {
        [brightnessConfig.param]: uiid === 57 ? deviceValue.toString() : deviceValue,
      };

      // D1 (UIID 44) requires mode parameter
      if (uiid === 44) {
        params.mode = 0;
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
    const switchParam = getSwitchParamName(uiid);
    const brightnessConfig = getBrightnessParams(uiid);

    // Update on/off state using catalog-defined parameter name
    const switchValue = params[switchParam];
    if (switchValue !== undefined) {
      const newState = switchValue === 'on' ? 'on' : 'off';
      if (newState !== this.cacheState) {
        this.cacheState = newState;
        this.service.updateCharacteristic(this.Characteristic.On, this.cacheState === 'on');
        this.logDebug(`Fan state updated: ${this.cacheState}`);
      }
    }

    // Update speed using catalog-defined brightness parameter
    if (brightnessConfig) {
      const rawValue = params[brightnessConfig.param];
      if (rawValue !== undefined) {
        const deviceValue = parseInt(String(rawValue), 10);
        const newSpeed = normalizeBrightness(uiid, deviceValue);
        if (newSpeed !== this.cacheSpeed) {
          this.cacheSpeed = newSpeed;
          this.service.updateCharacteristic(this.Characteristic.RotationSpeed, this.cacheSpeed);
          this.logDebug(`Fan speed updated: ${this.cacheSpeed}%`);
        }
      }
    }

    // Show as off if offlineAsOff is enabled and device is offline
    if (this.offlineAsOff && !this.isOnline && this.cacheState !== 'off') {
      this.service.updateCharacteristic(this.Characteristic.On, false);
      this.cacheState = 'off';
      this.logInfo('Fan offline, showing as off');
    }
  }
}
