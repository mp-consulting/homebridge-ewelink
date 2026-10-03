import type { PlatformAccessory, Service } from 'homebridge';
import type { EWeLinkPlatform } from '../../../platform.js';
import type { AccessoryContext, DeviceParams, ThermostatDeviceConfig } from '../../../types/index.js';
import { DeviceValueParser } from '../../../utils/device-parsers.js';
import { ThresholdControllerAccessory, createThresholdMode } from './threshold-controller.js';
import type { ThresholdModeKind } from './threshold-controller.js';

/**
 * Heater/cooler/humidifier/dehumidifier simulated with a TH sensor switch (UIID 15/181):
 * the relay is driven from the sensor's own temperature or humidity readings.
 * The other reading is exposed on a secondary sensor service.
 */
export class THClimateAccessory extends ThresholdControllerAccessory {
  /** Device configuration */
  protected readonly deviceConfig?: ThermostatDeviceConfig;

  /** Whether the controlled reading is the temperature (heat/cool) or the humidity */
  private readonly controlsTemperature: boolean;

  /** Secondary sensor service (humidity for heat/cool, temperature for (de)humidify) */
  private readonly sensorService?: Service;

  /** Cached secondary reading */
  private cacheSecondary?: number;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
    kind: ThresholdModeKind,
  ) {
    const controlsTemperature = kind === 'heat' || kind === 'cool';
    super(platform, accessory, {
      mode: createThresholdMode(platform, kind),
      defaultTarget: controlsTemperature ? 20 : 50,
    });
    this.controlsTemperature = controlsTemperature;
    this.deviceConfig = this.getDeviceConfig(platform.config.thDevices);

    if (controlsTemperature) {
      const minTarget = this.deviceConfig?.minTarget || 10;
      const maxTarget = Math.max(this.deviceConfig?.maxTarget || 30, minTarget + 1);
      // Hysteresis: heat defaults to 0.5°C (as the original TH heater), cool to none (the
      // original TH cooler switched exactly at the target). An explicit value (even 0) wins.
      this.hysteresis = this.deviceConfig?.targetTempThreshold ?? (kind === 'heat' ? 0.5 : 0);

      this.service.getCharacteristic(this.Characteristic.CurrentTemperature).setProps({ minStep: 0.1 });
      this.service.getCharacteristic(this.mode.thresholdCharacteristic).setProps({
        minValue: minTarget,
        maxValue: maxTarget,
        minStep: 0.5,
      });

      // DS18B20 probes have no humidity sensor
      if (accessory.context.device?.extra?.model !== 'DS18B20') {
        this.sensorService = this.getOrAddService(
          this.Service.HumiditySensor,
          `${accessory.displayName} Humidity`,
          'humidity',
        );
        this.sensorService.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
          .onGet(() => this.handleGet(() => this.cacheSecondary ?? 0, 'CurrentRelativeHumidity'));
      } else {
        this.removeServiceIfExists(this.Service.HumiditySensor, 'humidity');
      }
    } else {
      this.sensorService = this.getOrAddService(
        this.Service.TemperatureSensor,
        `${accessory.displayName} Temperature`,
        'temp',
      );
      const tempChar = this.sensorService.getCharacteristic(this.Characteristic.CurrentTemperature);
      tempChar.onGet(() => this.handleGet(() => this.cacheSecondary ?? 0, 'CurrentTemperature'));
      this.cacheSecondary = tempChar.value as number;
    }

    this.service.setPrimaryService();

    if (platform.config.mode !== 'lan') {
      this.setupUiActivePolling();
    }

    this.applyInitialState();
  }

  protected buildRunParams(run: boolean): DeviceParams {
    const state = run ? 'on' : 'off';
    return { deviceType: 'normal', mainSwitch: state, switch: state };
  }

  /** Temperature with the configured offset (or factor) applied */
  private readTemperature(): number {
    const offset = this.deviceConfig?.tempOffset || 0;
    const temp = DeviceValueParser.parseTemperature(this.deviceParams);
    return this.deviceConfig?.offsetFactor !== undefined ? temp * offset : temp + offset;
  }

  /** Humidity with the configured offset (or factor) applied, rounded and clamped to 0-100 */
  private readHumidity(): number {
    const offset = this.deviceConfig?.humidityOffset || 0;
    const humidity = DeviceValueParser.parseHumidity(this.deviceParams);
    const value = this.deviceConfig?.humidityOffsetFactor !== undefined ? humidity * offset : humidity + offset;
    return this.clamp(Math.round(value), 0, 100);
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    const hasTemp = params.currentTemperature !== undefined && params.currentTemperature !== 'unavailable';
    const hasHumidity = params.currentHumidity !== undefined && params.currentHumidity !== 'unavailable';
    const hasReading = this.controlsTemperature ? hasTemp : hasHumidity;
    const hasSecondary = this.controlsTemperature ? hasHumidity : hasTemp;

    if (hasSecondary && this.sensorService) {
      const value = this.controlsTemperature ? this.readHumidity() : this.readTemperature();
      if (value !== this.cacheSecondary) {
        this.cacheSecondary = value;
        this.sensorService.updateCharacteristic(
          this.controlsTemperature ? this.Characteristic.CurrentRelativeHumidity : this.Characteristic.CurrentTemperature,
          value,
        );
        this.logDebug(this.controlsTemperature ? `Humidity: ${value}%` : `Temperature: ${value}°C`);
      }
    }

    if (hasReading) {
      this.setReading(this.controlsTemperature ? this.readTemperature() : this.readHumidity());
    }
  }
}
