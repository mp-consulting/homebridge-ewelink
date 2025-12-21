import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams } from '../types/index.js';
import { ColorUtils } from '../utils/color-utils.js';

/**
 * Light Accessory with brightness and color support
 */
export class LightAccessory extends BaseAccessory {
  /** Whether device supports brightness */
  private readonly supportsBrightness: boolean;

  /** Whether device supports color temperature */
  private readonly supportsColorTemp: boolean;

  /** Whether device supports RGB color */
  private readonly supportsColor: boolean;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Determine capabilities
    this.supportsBrightness = this.deviceParams.bright !== undefined ||
                               this.deviceParams.white?.br !== undefined;
    this.supportsColorTemp = this.deviceParams.colorTemp !== undefined ||
                              this.deviceParams.white?.ct !== undefined;
    this.supportsColor = this.deviceParams.color !== undefined ||
                          this.deviceParams.ltype === 'color';

    // Set up the lightbulb service
    this.service = this.getOrAddService(this.Service.Lightbulb);

    // Configure On characteristic
    this.service.getCharacteristic(this.Characteristic.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.setOn.bind(this));

    // Configure Brightness if supported
    if (this.supportsBrightness) {
      this.service.getCharacteristic(this.Characteristic.Brightness)
        .onGet(this.getBrightness.bind(this))
        .onSet(this.setBrightness.bind(this));
    }

    // Configure ColorTemperature if supported
    if (this.supportsColorTemp) {
      this.service.getCharacteristic(this.Characteristic.ColorTemperature)
        .onGet(this.getColorTemperature.bind(this))
        .onSet(this.setColorTemperature.bind(this));
    }

    // Configure Hue and Saturation if color is supported
    if (this.supportsColor) {
      this.service.getCharacteristic(this.Characteristic.Hue)
        .onGet(this.getHue.bind(this))
        .onSet(this.setHue.bind(this));

      this.service.getCharacteristic(this.Characteristic.Saturation)
        .onGet(this.getSaturation.bind(this))
        .onSet(this.setSaturation.bind(this));
    }

    // Set initial state
    this.updateState(this.deviceParams);
  }

  /**
   * Get on state
   */
  private async getOn(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.deviceParams.switch === 'on', 'On');
  }

  /**
   * Set on state
   */
  private async setOn(value: CharacteristicValue): Promise<void> {
    await this.handleSet(value as boolean, 'On', async (on) => {
      return await this.sendCommand({ switch: on ? 'on' : 'off' });
    });
  }

  /**
   * Get brightness
   */
  private async getBrightness(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      if (this.deviceParams.white?.br !== undefined) {
        return this.deviceParams.white.br;
      }
      return this.deviceParams.bright || 100;
    }, 'Brightness');
  }

  /**
   * Set brightness
   */
  private async setBrightness(value: CharacteristicValue): Promise<void> {
    const brightness = value as number;

    await this.handleSet(brightness, 'Brightness', async (br) => {
      // Different devices use different params
      if (this.deviceParams.white !== undefined) {
        return await this.sendCommand({
          white: { ...this.deviceParams.white, br },
        });
      }
      return await this.sendCommand({ bright: br });
    });
  }

  /**
   * Get color temperature
   */
  private async getColorTemperature(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      let ct: number;

      if (this.deviceParams.white?.ct !== undefined) {
        // ct is 0-100, need to convert to mired (140-500)
        ct = Math.round(140 + (this.deviceParams.white.ct / 100) * 360);
      } else if (this.deviceParams.colorTemp !== undefined) {
        ct = this.deviceParams.colorTemp;
      } else {
        ct = 320; // Default to neutral
      }

      return this.clamp(ct, 140, 500);
    }, 'ColorTemperature');
  }

  /**
   * Set color temperature
   */
  private async setColorTemperature(value: CharacteristicValue): Promise<void> {
    const mired = value as number;

    await this.handleSet(mired, 'ColorTemperature', async (ct) => {
      // Convert mired to device's 0-100 scale
      const deviceCt = Math.round(((ct - 140) / 360) * 100);

      if (this.deviceParams.white !== undefined) {
        return await this.sendCommand({
          ltype: 'white',
          white: { ...this.deviceParams.white, ct: deviceCt },
        });
      }
      return await this.sendCommand({ colorTemp: ct });
    });
  }

  /**
   * Get hue
   */
  private async getHue(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      if (this.deviceParams.color) {
        const { r, g, b } = this.deviceParams.color;
        const hsv = ColorUtils.rgbToHsv(r, g, b);
        return hsv.h;
      }
      return 0;
    }, 'Hue');
  }

  /**
   * Set hue
   */
  private async setHue(value: CharacteristicValue): Promise<void> {
    await this.handleSet(value as number, 'Hue', async (hue) => {
      const currentColor = this.deviceParams.color || { r: 255, g: 255, b: 255, br: 100 };
      const hsv = ColorUtils.rgbToHsv(currentColor.r, currentColor.g, currentColor.b);
      const rgb = ColorUtils.hsvToRgb(hue, hsv.s, hsv.v);

      return await this.sendCommand({
        ltype: 'color',
        color: { ...rgb, br: currentColor.br },
      });
    });
  }

  /**
   * Get saturation
   */
  private async getSaturation(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      if (this.deviceParams.color) {
        const { r, g, b } = this.deviceParams.color;
        const hsv = ColorUtils.rgbToHsv(r, g, b);
        return hsv.s;
      }
      return 100;
    }, 'Saturation');
  }

  /**
   * Set saturation
   */
  private async setSaturation(value: CharacteristicValue): Promise<void> {
    await this.handleSet(value as number, 'Saturation', async (sat) => {
      const currentColor = this.deviceParams.color || { r: 255, g: 255, b: 255, br: 100 };
      const hsv = ColorUtils.rgbToHsv(currentColor.r, currentColor.g, currentColor.b);
      const rgb = ColorUtils.hsvToRgb(hsv.h, sat, hsv.v);

      return await this.sendCommand({
        ltype: 'color',
        color: { ...rgb, br: currentColor.br },
      });
    });
  }


  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    Object.assign(this.deviceParams, params);

    // Update On
    const isOn = params.switch === 'on';
    this.service.updateCharacteristic(this.Characteristic.On, isOn);

    // Update Brightness
    if (this.supportsBrightness) {
      const brightness = params.white?.br ?? params.bright ?? 100;
      this.service.updateCharacteristic(this.Characteristic.Brightness, brightness);
    }

    // Update ColorTemperature
    if (this.supportsColorTemp) {
      let ct: number;
      if (params.white?.ct !== undefined) {
        ct = Math.round(140 + (params.white.ct / 100) * 360);
      } else {
        ct = params.colorTemp ?? 320;
      }
      this.service.updateCharacteristic(
        this.Characteristic.ColorTemperature,
        this.clamp(ct, 140, 500),
      );
    }

    // Update Color
    if (this.supportsColor && params.color) {
      const hsv = ColorUtils.rgbToHsv(params.color.r, params.color.g, params.color.b);
      this.service.updateCharacteristic(this.Characteristic.Hue, hsv.h);
      this.service.updateCharacteristic(this.Characteristic.Saturation, hsv.s);
    }

    this.logDebug(`State updated: ${isOn ? 'ON' : 'OFF'}`);
  }
}
