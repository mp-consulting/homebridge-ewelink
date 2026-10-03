import type { PlatformAccessory, CharacteristicValue, Service, WithUUID, Characteristic } from 'homebridge';
import { BaseAccessory } from '../base.js';
import type { EWeLinkPlatform } from '../../platform.js';
import type { AccessoryContext, DeviceParams, SingleDeviceConfig, MultiDeviceConfig } from '../../types/index.js';
import { SwitchHelper } from '../../utils/switch-helper.js';
import { EVE_CHARACTERISTIC_UUIDS } from '../../utils/eve-characteristics.js';
import { getChannelPower } from './shared/channel-power.js';
import type { ChannelPower } from './shared/channel-power.js';

/**
 * Sensor Simulation Accessory
 * Simulates various sensor types (motion, contact, leak, smoke, CO, CO2, occupancy) using a switch device
 */
export class SensorAccessory extends BaseAccessory {
  /** Channel index for multi-channel devices */
  private readonly channelIndex: number;

  /** Device configuration */
  private readonly deviceConfig?: SingleDeviceConfig | MultiDeviceConfig;

  /** Sensor type */
  private readonly sensorType: string;

  /** Current sensor characteristic */
  private readonly sensorCharacteristic: WithUUID<new () => Characteristic>;

  /** Whether to use LastActivation characteristic */
  private readonly useLastActivation: boolean;

  /** Power monitoring capabilities */
  private readonly power: ChannelPower;

  /** Last activation time (Eve initial time) */
  private eveInitialTime = 0;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    this.channelIndex = accessory.context.channelIndex || 0;

    // Get device-specific config
    this.deviceConfig = this.getSingleDeviceConfig() ?? this.getMultiDeviceConfig();

    // Get sensor type (default to 'motion')
    this.sensorType = this.deviceConfig?.sensorType || 'motion';

    // Initialize sensor characteristic and service based on type
    let serviceType: WithUUID<typeof Service>;
    this.useLastActivation = false;

    switch (this.sensorType) {
      case 'water':
      case 'leak':
        serviceType = this.Service.LeakSensor;
        this.sensorCharacteristic = this.Characteristic.LeakDetected;
        break;
      case 'fire':
      case 'smoke':
        serviceType = this.Service.SmokeSensor;
        this.sensorCharacteristic = this.Characteristic.SmokeDetected;
        break;
      case 'co':
        serviceType = this.Service.CarbonMonoxideSensor;
        this.sensorCharacteristic = this.Characteristic.CarbonMonoxideDetected;
        break;
      case 'co2':
        serviceType = this.Service.CarbonDioxideSensor;
        this.sensorCharacteristic = this.Characteristic.CarbonDioxideDetected;
        break;
      case 'contact':
        serviceType = this.Service.ContactSensor;
        this.sensorCharacteristic = this.Characteristic.ContactSensorState;
        this.useLastActivation = true;
        break;
      case 'occupancy':
        serviceType = this.Service.OccupancySensor;
        this.sensorCharacteristic = this.Characteristic.OccupancyDetected;
        break;
      default:
        // Default to motion sensor
        serviceType = this.Service.MotionSensor;
        this.sensorCharacteristic = this.Characteristic.MotionDetected;
        this.useLastActivation = true;
        break;
    }

    // Remove old switch/outlet services if they exist
    this.removeServiceIfExists(this.Service.Switch);
    this.removeServiceIfExists(this.Service.Outlet);

    // Set up the sensor service
    this.service = this.getOrAddService(serviceType);

    // Add LastActivation characteristic for motion and contact sensors
    if (this.useLastActivation) {
      if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.LastActivation)) {
        this.service.addCharacteristic(this.platform.eveCharacteristics.LastActivation);
      }
    }

    // Configure sensor characteristic
    this.service.getCharacteristic(this.sensorCharacteristic)
      .onGet(this.getSensorState.bind(this));

    // Power monitoring: from the catalog, or detected from the reported params
    const catalogPower = getChannelPower(this.device.extra?.uiid || 0, this.channelIndex);
    this.power = catalogPower.enabled
      ? catalogPower
      : { ...catalogPower, enabled: this.supportsPowerMonitoring(catalogPower.suffix), fullReadings: false, isDualR3: false, uiActiveOutlet: undefined };

    if (this.power.enabled) {
      this.setupPowerMonitoringCharacteristics(this.service, this.power.fullReadings);
      this.logDebug(`Power monitoring enabled (full readings: ${this.power.fullReadings})`);
      if (!this.power.isDualR3 || this.platform.config.mode !== 'lan') {
        this.setupPollingInterval(async () => {
          if (this.isOnline) {
            await this.requestUiActiveUpdate(this.power.uiActiveOutlet);
          }
        });
      }
    }

    // Initialize Eve history service
    // Note: In TypeScript version, we'll need to integrate with fakegato-history separately
    // For now, we'll store the initial time for LastActivation calculations
    this.eveInitialTime = Math.floor(Date.now() / 1000);

    // Set initial state
    this.applyInitialState();

    this.logDebug(`Sensor initialized (type: ${this.sensorType})`);
  }

  /**
   * Check if the reported params contain power readings
   */
  private supportsPowerMonitoring(suffix: string): boolean {
    return ['power', 'voltage', 'current', `actPow_${suffix}`, `voltage_${suffix}`, `current_${suffix}`]
      .some(key => this.deviceParams[key] !== undefined);
  }

  /**
   * Get sensor state
   */
  private async getSensorState(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.service.getCharacteristic(this.sensorCharacteristic).value;
    }, 'SensorState');
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    // Update sensor state based on switch state
    const isOn = SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);
    const sensorDetected = isOn ? 1 : 0;

    // Update the sensor characteristic
    const currentValue = this.service.getCharacteristic(this.sensorCharacteristic).value;
    if (currentValue !== sensorDetected) {
      this.service.updateCharacteristic(this.sensorCharacteristic, sensorDetected);

      // Update LastActivation for motion and contact sensors when triggered
      if (this.useLastActivation && sensorDetected === 1) {
        const timeSinceInitial = Math.floor(Date.now() / 1000) - this.eveInitialTime;
        this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.LastActivation, timeSinceInitial);
      }

      this.logDebug(`Sensor state updated: ${isOn ? 'DETECTED' : 'CLEAR'}`);
    }

    if (this.power.enabled) {
      this.updateDualR3PowerReadings(this.service, params, {
        suffix: this.power.suffix,
        fullReadings: this.power.fullReadings,
      });
    }
  }
}
