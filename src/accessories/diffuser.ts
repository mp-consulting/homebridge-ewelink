import { PlatformAccessory, CharacteristicValue, Service } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams } from '../types/index.js';
import { hs2rgb, rgb2hs } from '../utils/color-utils.js';
import { DIFFUSER_SPEED } from '../constants/device-constants.js';
import { TIMING, SIMULATION_TIMING } from '../constants/timing-constants.js';

/**
 * Diffuser Accessory (UIID 25)
 * Provides Fan service for diffuser control + Lightbulb service for light control
 */
export class DiffuserAccessory extends BaseAccessory {
  private fanService!: Service;
  private lightService!: Service;

  // Diffuser state
  private cacheState: 'on' | 'off' = 'off';
  private cacheSpeed: number = DIFFUSER_SPEED.LOW; // 50% or 100%

  // Light state
  private cacheLight = 0; // 0=off, 1=on
  private cacheBright = 100;
  private cacheHue = 0;
  private cacheR = 255;
  private cacheG = 255;
  private cacheB = 255;

  // Update tracking
  private updateTimeout?: string | false;
  private updateKeySpeed?: string;
  private updateKeyBright?: string;
  private updateKeyColour?: string;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Set up the fan service for diffuser
    this.fanService = this.accessory.getService('Diffuser') ||
      this.accessory.addService(this.Service.Fan, 'Diffuser', 'diffuser');

    // Set up the lightbulb service for light
    this.lightService = this.accessory.getService('Light') ||
      this.accessory.addService(this.Service.Lightbulb, 'Light', 'light');

    // Configure fan on/off characteristic
    this.fanService.getCharacteristic(this.Characteristic.On)
      .onGet(this.getDiffuserOn.bind(this))
      .onSet(this.setDiffuserOn.bind(this));

    // Configure fan rotation speed characteristic
    this.fanService.getCharacteristic(this.Characteristic.RotationSpeed)
      .setProps({ minStep: 50 })
      .onGet(this.getDiffuserSpeed.bind(this))
      .onSet(this.setDiffuserSpeed.bind(this));

    // Configure light on/off characteristic
    this.lightService.getCharacteristic(this.Characteristic.On)
      .onGet(this.getLightOn.bind(this))
      .onSet(this.setLightOn.bind(this));

    // Configure light brightness characteristic
    this.lightService.getCharacteristic(this.Characteristic.Brightness)
      .onGet(this.getLightBrightness.bind(this))
      .onSet(this.setLightBrightness.bind(this));

    // Configure light hue characteristic
    this.lightService.getCharacteristic(this.Characteristic.Hue)
      .onGet(this.getLightHue.bind(this))
      .onSet(this.setLightHue.bind(this));

    // Configure light saturation (always 100 for this device)
    this.lightService.getCharacteristic(this.Characteristic.Saturation)
      .onGet(() => 100);

    // Set the main service to the fan service
    this.service = this.fanService;

    // Initialize from device params
    this.initializeFromParams();
  }

  /**
   * Initialize state from device params
   */
  private initializeFromParams(): void {
    if (this.deviceParams.switch !== undefined) {
      this.cacheState = this.deviceParams.switch as 'on' | 'off';
      this.fanService.updateCharacteristic(this.Characteristic.On, this.cacheState === 'on');
    }

    if (this.deviceParams.state !== undefined) {
      const state = this.deviceParams.state as number;
      this.cacheSpeed = state * DIFFUSER_SPEED.LOW; // 0, 1, 2 -> 0, 50, 100
      this.fanService.updateCharacteristic(this.Characteristic.RotationSpeed, this.cacheSpeed);
    }

    if (this.deviceParams.lightswitch !== undefined) {
      this.cacheLight = this.deviceParams.lightswitch as number;
      this.lightService.updateCharacteristic(this.Characteristic.On, this.cacheLight === 1);
    }

    if (this.deviceParams.lightbright !== undefined) {
      this.cacheBright = this.deviceParams.lightbright as number;
      this.lightService.updateCharacteristic(this.Characteristic.Brightness, this.cacheBright);
    }

    if (this.deviceParams.lightRcolor !== undefined) {
      this.cacheR = this.deviceParams.lightRcolor as number;
      this.cacheG = (this.deviceParams.lightGcolor as number) || 0;
      this.cacheB = (this.deviceParams.lightBcolor as number) || 0;
      const [h] = rgb2hs(this.cacheR, this.cacheG, this.cacheB);
      this.cacheHue = h;
      this.lightService.updateCharacteristic(this.Characteristic.Hue, this.cacheHue);
      this.lightService.updateCharacteristic(this.Characteristic.Saturation, 100);
    }
  }

  // Diffuser handlers
  private async getDiffuserOn(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.cacheState === 'on', 'Diffuser On');
  }

  private async setDiffuserOn(value: CharacteristicValue): Promise<void> {
    const newState = value ? 'on' : 'off';

    if (newState === this.cacheState) {
      return;
    }

    this.logInfo(`Setting diffuser to ${newState}`);

    // Set up timeout to ignore incoming updates
    const timerKey = this.generateRandomString(5);
    this.updateTimeout = timerKey;
    setTimeout(() => {
      if (this.updateTimeout === timerKey) {
        this.updateTimeout = false;
      }
    }, SIMULATION_TIMING.AUTO_OFF_DELAY_MS);

    const success = await this.sendCommand({ switch: newState });

    if (!success) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    this.cacheState = newState;
  }

  private async getDiffuserSpeed(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.cacheSpeed, 'Diffuser Speed');
  }

  private async setDiffuserSpeed(value: CharacteristicValue): Promise<void> {
    if (value === 0) {
      return; // Handled by on/off handler
    }

    const newSpeed = (value as number) <= DIFFUSER_SPEED.LOW ? DIFFUSER_SPEED.LOW : DIFFUSER_SPEED.HIGH;

    if (newSpeed === this.cacheSpeed) {
      return;
    }

    // Debounce for slider
    const updateKeySpeed = this.generateRandomString(5);
    this.updateKeySpeed = updateKeySpeed;
    await new Promise(resolve => setTimeout(resolve, TIMING.COMMAND_DELAY_MS));

    if (updateKeySpeed !== this.updateKeySpeed) {
      return;
    }

    this.logInfo(`Setting diffuser speed to ${newSpeed}%`);

    // Set up timeout to ignore incoming updates
    this.updateTimeout = updateKeySpeed;
    setTimeout(() => {
      if (this.updateTimeout === updateKeySpeed) {
        this.updateTimeout = false;
      }
    }, SIMULATION_TIMING.AUTO_OFF_DELAY_MS);

    const success = await this.sendCommand({ state: newSpeed / DIFFUSER_SPEED.LOW });

    if (!success) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    this.cacheSpeed = newSpeed;
  }

  // Light handlers
  private async getLightOn(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.cacheLight === 1, 'Light On');
  }

  private async setLightOn(value: CharacteristicValue): Promise<void> {
    const newValue = value ? 1 : 0;

    if (newValue === this.cacheLight) {
      return;
    }

    this.logInfo(`Setting light to ${newValue === 1 ? 'on' : 'off'}`);

    // Set up timeout to ignore incoming updates
    const updateKeyLight = this.generateRandomString(5);
    this.updateTimeout = updateKeyLight;
    setTimeout(() => {
      if (this.updateTimeout === updateKeyLight) {
        this.updateTimeout = false;
      }
    }, SIMULATION_TIMING.AUTO_OFF_DELAY_MS);

    const success = await this.sendCommand({ lightswitch: newValue });

    if (!success) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    this.cacheLight = newValue;
  }

  private async getLightBrightness(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.cacheBright, 'Light Brightness');
  }

  private async setLightBrightness(value: CharacteristicValue): Promise<void> {
    const newBright = value as number;

    if (newBright === this.cacheBright) {
      return;
    }

    // Debounce for slider
    const updateKeyBright = this.generateRandomString(5);
    this.updateKeyBright = updateKeyBright;
    await new Promise(resolve => setTimeout(resolve, TIMING.STATE_INIT_DELAY_MS));

    if (updateKeyBright !== this.updateKeyBright) {
      return;
    }

    this.logInfo(`Setting light brightness to ${newBright}%`);

    // Set up timeout to ignore incoming updates
    this.updateTimeout = updateKeyBright;
    setTimeout(() => {
      if (this.updateTimeout === updateKeyBright) {
        this.updateTimeout = false;
      }
    }, SIMULATION_TIMING.AUTO_OFF_DELAY_MS);

    const success = await this.sendCommand({ lightbright: newBright });

    if (!success) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    this.cacheBright = newBright;
  }

  private async getLightHue(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.cacheHue, 'Light Hue');
  }

  private async setLightHue(value: CharacteristicValue): Promise<void> {
    const newHue = value as number;

    if (this.cacheState !== 'on' || newHue === this.cacheHue) {
      return;
    }

    // Debounce for color wheel
    const updateKeyColour = this.generateRandomString(5);
    this.updateKeyColour = updateKeyColour;
    await new Promise(resolve => setTimeout(resolve, 400));

    if (updateKeyColour !== this.updateKeyColour) {
      return;
    }

    const sat = this.lightService.getCharacteristic(this.Characteristic.Saturation).value as number;
    const [r, g, b] = hs2rgb(newHue, sat);

    this.logInfo(`Setting light color to RGB(${r}, ${g}, ${b})`);

    // Set up timeout to ignore incoming updates
    this.updateTimeout = updateKeyColour;
    setTimeout(() => {
      if (this.updateTimeout === updateKeyColour) {
        this.updateTimeout = false;
      }
    }, SIMULATION_TIMING.AUTO_OFF_DELAY_MS);

    const success = await this.sendCommand({
      lightRcolor: r,
      lightGcolor: g,
      lightBcolor: b,
    });

    if (!success) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    this.cacheHue = newHue;
    this.cacheR = r;
    this.cacheG = g;
    this.cacheB = b;
  }

  /**
   * Generate random string for debouncing
   */
  private generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    // Ignore updates during timeout
    if (this.updateTimeout) {
      return;
    }

    // Update local cache
    Object.assign(this.deviceParams, params);

    // Update diffuser on/off state
    if (params.switch !== undefined) {
      const newState = params.switch as 'on' | 'off';
      if (newState !== this.cacheState) {
        this.cacheState = newState;
        this.fanService.updateCharacteristic(this.Characteristic.On, this.cacheState === 'on');
        this.logDebug(`Diffuser state updated to ${this.cacheState}`);

        // If on but no speed provided, update with cached speed
        if (this.cacheState === 'on' && params.state === undefined) {
          this.fanService.updateCharacteristic(this.Characteristic.RotationSpeed, this.cacheSpeed);
        }
      }
    }

    // Update diffuser speed
    if (params.state !== undefined) {
      const state = params.state as number;
      const newSpeed = state * DIFFUSER_SPEED.LOW;
      if (newSpeed !== this.cacheSpeed) {
        this.cacheSpeed = newSpeed;
        this.fanService.updateCharacteristic(this.Characteristic.RotationSpeed, this.cacheSpeed);
        this.logDebug(`Diffuser speed updated to ${this.cacheSpeed}%`);
      }
    }

    // Update light on/off state
    if (params.lightswitch !== undefined) {
      const newLight = params.lightswitch as number;
      if (newLight !== this.cacheLight) {
        this.cacheLight = newLight;
        this.lightService.updateCharacteristic(this.Characteristic.On, this.cacheLight === 1);
        this.logDebug(`Light state updated to ${this.cacheLight === 1 ? 'on' : 'off'}`);
      }
    }

    // Update light brightness
    if (params.lightbright !== undefined) {
      const newBright = params.lightbright as number;
      if (newBright !== this.cacheBright) {
        this.cacheBright = newBright;
        this.lightService.updateCharacteristic(this.Characteristic.Brightness, this.cacheBright);
        this.logDebug(`Light brightness updated to ${this.cacheBright}%`);
      }
    }

    // Update light color
    if (params.lightRcolor !== undefined) {
      const newR = params.lightRcolor as number;
      const newG = (params.lightGcolor as number) || 0;
      const newB = (params.lightBcolor as number) || 0;

      if (newR !== this.cacheR || newG !== this.cacheG || newB !== this.cacheB) {
        this.cacheR = newR;
        this.cacheG = newG;
        this.cacheB = newB;

        const [h] = rgb2hs(this.cacheR, this.cacheG, this.cacheB);
        this.cacheHue = h;

        this.lightService.updateCharacteristic(this.Characteristic.Hue, this.cacheHue);
        this.lightService.updateCharacteristic(this.Characteristic.Saturation, 100);
        this.logDebug(`Light color updated to RGB(${this.cacheR}, ${this.cacheG}, ${this.cacheB})`);
      }
    }
  }
}
