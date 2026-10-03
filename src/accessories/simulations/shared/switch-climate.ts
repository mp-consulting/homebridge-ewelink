import type { PlatformAccessory } from 'homebridge';
import type { EWeLinkPlatform } from '../../../platform.js';
import type { AccessoryContext, DeviceParams } from '../../../types/index.js';
import { SwitchHelper } from '../../../utils/switch-helper.js';
import { ThresholdControllerAccessory, createThresholdMode } from './threshold-controller.js';

/**
 * Heater/cooler simulated with a plain switch channel, reading the temperature
 * of another device (config `tempSource`) from the platform temperature cache.
 */
export class SwitchClimateAccessory extends ThresholdControllerAccessory {
  /** Channel index for multi-channel devices */
  private readonly channelIndex: number;

  /** Temperature source device ID */
  private readonly temperatureSource?: string;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
    kind: 'heat' | 'cool',
  ) {
    super(platform, accessory, {
      mode: createThresholdMode(platform, kind),
      defaultTarget: 20,
      cacheType: kind === 'heat' ? 'heater' : 'cooler',
    });

    this.channelIndex = accessory.context.channelIndex || 0;
    this.temperatureSource = (this.getSingleDeviceConfig() ?? this.getMultiDeviceConfig())?.tempSource;

    this.service.getCharacteristic(this.Characteristic.CurrentTemperature).setProps({ minStep: 0.1 });
    this.service.getCharacteristic(this.mode.thresholdCharacteristic).setProps({ minStep: 0.5 });

    this.setupPollingInterval(async () => this.updateTemperature());

    this.applyInitialState();
  }

  protected buildRunParams(run: boolean): DeviceParams {
    return SwitchHelper.buildSwitchParams(this.deviceParams, this.channelIndex, run);
  }

  /**
   * Read the temperature from the platform cache (set by temperature-capable devices)
   */
  private updateTemperature(): void {
    if (!this.temperatureSource) {
      return;
    }
    const temp = this.platform.getDeviceTemperature(this.temperatureSource);
    if (temp !== undefined) {
      this.setReading(temp);
    }
  }

  /**
   * Update state from device params (reflects the relay state while active)
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    if (this.cacheActive && (params.switch !== undefined || params.switches !== undefined)) {
      this.cacheRunning = SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);
    }
    this.publishState();
  }
}
