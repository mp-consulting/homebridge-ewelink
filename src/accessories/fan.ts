import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams, FanDeviceConfig } from '../types/index.js';

/**
 * Fan Accessory with speed control
 */
export class FanAccessory extends BaseAccessory {
  /** Light service if device has integrated light */
  private lightService?: ReturnType<typeof this.getOrAddService>;

  /** Device config */
  private readonly deviceConfig?: FanDeviceConfig;

  /** Maximum speed levels */
  private readonly maxSpeed: number = 4;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Get device-specific config
    this.deviceConfig = platform.config.fanDevices?.find(
      d => d.deviceId === this.deviceId,
    );

    // Set up the fan service
    this.service = this.getOrAddService(this.Service.Fanv2);

    // Configure Active characteristic
    this.service.getCharacteristic(this.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    // Configure RotationSpeed
    this.service.getCharacteristic(this.Characteristic.RotationSpeed)
      .onGet(this.getRotationSpeed.bind(this))
      .onSet(this.setRotationSpeed.bind(this))
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 100 / this.maxSpeed,
      });

    // Set up light service if device has light and it's not hidden
    if (this.hasLight() && !this.deviceConfig?.hideLight) {
      this.lightService = this.getOrAddService(
        this.Service.Lightbulb,
        `${accessory.displayName} Light`,
        'light',
      );

      this.lightService.getCharacteristic(this.Characteristic.On)
        .onGet(this.getLightOn.bind(this))
        .onSet(this.setLightOn.bind(this));
    } else {
      // Remove light service if it exists but should be hidden
      this.removeServiceIfExists(this.Service.Lightbulb, 'light');
    }

    // Set initial state
    this.updateState(this.deviceParams);
  }

  /**
   * Check if device has integrated light
   */
  private hasLight(): boolean {
    return this.deviceParams.switches !== undefined &&
           this.deviceParams.switches.some(s => s.outlet === 0);
  }

  /**
   * Get fan active state
   */
  private async getActive(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      // Fan is typically on outlet 1 or has speed > 0
      if (this.deviceParams.switches) {
        const fanSwitch = this.deviceParams.switches.find(s => s.outlet === 1);
        return fanSwitch?.switch === 'on' ? 1 : 0;
      }
      return (this.deviceParams.speed || 0) > 0 ? 1 : 0;
    }, 'Active');
  }

  /**
   * Set fan active state
   */
  private async setActive(value: CharacteristicValue): Promise<void> {
    const active = value as number;

    await this.handleSet(active, 'Active', async (on) => {
      if (this.deviceParams.switches) {
        const switches = [...this.deviceParams.switches];
        const index = switches.findIndex(s => s.outlet === 1);

        if (index >= 0) {
          switches[index] = { ...switches[index], switch: on ? 'on' : 'off' };
        }

        return await this.sendCommand({ switches });
      }

      return await this.sendCommand({ speed: on ? 1 : 0 });
    });
  }

  /**
   * Get rotation speed
   */
  private async getRotationSpeed(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      const speed = this.deviceParams.speed || 0;
      return (speed / this.maxSpeed) * 100;
    }, 'RotationSpeed');
  }

  /**
   * Set rotation speed
   */
  private async setRotationSpeed(value: CharacteristicValue): Promise<void> {
    const percentage = value as number;

    await this.handleSet(percentage, 'RotationSpeed', async (pct) => {
      // Convert percentage to speed level (1-4)
      let speed = Math.round((pct / 100) * this.maxSpeed);
      speed = this.clamp(speed, 0, this.maxSpeed);

      return await this.sendCommand({ speed });
    });
  }

  /**
   * Get light on state
   */
  private async getLightOn(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      if (this.deviceParams.switches) {
        const lightSwitch = this.deviceParams.switches.find(s => s.outlet === 0);
        return lightSwitch?.switch === 'on';
      }
      return false;
    }, 'Light On');
  }

  /**
   * Set light on state
   */
  private async setLightOn(value: CharacteristicValue): Promise<void> {
    await this.handleSet(value as boolean, 'Light On', async (on) => {
      if (this.deviceParams.switches) {
        const switches = [...this.deviceParams.switches];
        const index = switches.findIndex(s => s.outlet === 0);

        if (index >= 0) {
          switches[index] = { ...switches[index], switch: on ? 'on' : 'off' };
        }

        return await this.sendCommand({ switches });
      }
      return false;
    });
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    // Update fan active state
    let isActive = 0;
    if (params.switches) {
      const fanSwitch = params.switches.find(s => s.outlet === 1);
      isActive = fanSwitch?.switch === 'on' ? 1 : 0;
    } else if (params.speed !== undefined) {
      isActive = params.speed > 0 ? 1 : 0;
    }
    this.service.updateCharacteristic(this.Characteristic.Active, isActive);

    // Update rotation speed
    const speed = params.speed || 0;
    const speedPercentage = (speed / this.maxSpeed) * 100;
    this.service.updateCharacteristic(this.Characteristic.RotationSpeed, speedPercentage);

    // Update light state
    if (this.lightService && params.switches) {
      const lightSwitch = params.switches.find(s => s.outlet === 0);
      const lightOn = lightSwitch?.switch === 'on';
      this.lightService.updateCharacteristic(this.Characteristic.On, lightOn);
    }

    this.logDebug(`State updated: Active=${isActive}, Speed=${speed}`);
  }
}
