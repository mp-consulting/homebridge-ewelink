import type { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import type { EWeLinkPlatform } from '../../platform.js';
import type { AccessoryContext, DeviceParams, SingleDeviceConfig } from '../../types/index.js';
import { EVE_CHARACTERISTIC_UUIDS } from '../../utils/eve-characteristics.js';
import { getBatteryType } from '../../constants/device-catalog.js';

/**
 * Leak Sensor Accessory
 * Simulates a visible leak sensor using a contact sensor device (UIID 102/154)
 * This is designed for DW2 (door/window sensor) devices used as leak detectors
 */
export class SensorLeakAccessory extends BaseAccessory {
  /** Device configuration */
  private readonly deviceConfig?: SingleDeviceConfig;

  /** Low battery threshold */
  private readonly lowBattThreshold: number;

  /** Battery service */
  private batteryService?: ReturnType<typeof this.getOrAddService>;

  /** Last activation time (Eve initial time) */
  private eveInitialTime = 0;

  /** Cached battery percentage */
  private cacheBattScaled = 100;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Get device-specific config
    this.deviceConfig = platform.config.singleDevices?.find(
      d => d.deviceId === this.deviceId,
    );

    // Get low battery threshold (default to 25%)
    this.lowBattThreshold = this.deviceConfig?.lowBattThreshold
      ? Math.min(this.deviceConfig.lowBattThreshold, 100)
      : 25;

    // Remove old contact sensor service if it exists
    this.removeServiceIfExists(this.Service.ContactSensor);

    // Set up the leak sensor service
    this.service = this.getOrAddService(this.Service.LeakSensor);

    // Add LastActivation characteristic
    if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.LastActivation)) {
      this.service.addCharacteristic(this.platform.eveCharacteristics.LastActivation);
    }

    // Configure leak detected characteristic
    this.service.getCharacteristic(this.Characteristic.LeakDetected)
      .onGet(this.getLeakDetected.bind(this));

    // Add battery service
    this.batteryService = this.getOrAddService(this.Service.Battery);

    // Initialize Eve history service
    this.eveInitialTime = Math.floor(Date.now() / 1000);

    // Set initial state
    this.updateState(this.deviceParams);

    this.logDebug(`Leak sensor initialized (low battery threshold: ${this.lowBattThreshold}%)`);
  }

  /**
   * Get leak detected state
   */
  private async getLeakDetected(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.service.getCharacteristic(this.Characteristic.LeakDetected).value;
    }, 'LeakDetected');
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    // Update battery level if present
    if (params.battery !== undefined && this.batteryService) {
      const batteryRaw = params.battery as number;
      const uiid = this.device.extra?.uiid || 0;
      const batteryType = getBatteryType(uiid);

      // Scale battery based on device battery type from catalog
      if (batteryType === 'voltage') {
        // Battery reported as voltage (2.0V - 3.0V)
        const voltage = Math.min(Math.max(batteryRaw, 2), 3);
        this.cacheBattScaled = Math.round((voltage - 2) * 100);
      } else {
        // Battery reported as percentage (0-100)
        this.cacheBattScaled = batteryRaw;
      }

      this.batteryService.updateCharacteristic(this.Characteristic.BatteryLevel, this.cacheBattScaled);
      this.batteryService.updateCharacteristic(
        this.Characteristic.StatusLowBattery,
        this.cacheBattScaled < this.lowBattThreshold ? 1 : 0,
      );

      this.logDebug(`Battery updated: ${this.cacheBattScaled}%`);
    }

    // Update leak sensor state based on switch state
    // Note: DW2 sensor inverts the state (switch 'on' = no leak, switch 'off' = leak detected)
    if (params.switch !== undefined) {
      const isOn = params.switch === 'on';
      // Invert: switch on = 0 (no leak), switch off = 1 (leak detected)
      const leakDetected = isOn ? 0 : 1;

      const currentValue = this.service.getCharacteristic(this.Characteristic.LeakDetected).value;
      if (currentValue !== leakDetected) {
        this.service.updateCharacteristic(this.Characteristic.LeakDetected, leakDetected);

        // Update LastActivation when leak is detected
        if (leakDetected === 1) {
          const timeSinceInitial = Math.floor(Date.now() / 1000) - this.eveInitialTime;
          this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.LastActivation, timeSinceInitial);
        }

        this.logDebug(`Leak sensor state updated: ${leakDetected === 1 ? 'LEAK DETECTED' : 'NO LEAK'}`);
      }
    }
  }
}
