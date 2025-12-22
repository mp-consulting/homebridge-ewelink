import { PlatformAccessory, CharacteristicValue, Service, WithUUID } from 'homebridge';
import { BaseAccessory } from '../base.js';
import { EWeLinkPlatform } from '../../platform.js';
import { AccessoryContext, DeviceParams, SingleDeviceConfig, MultiDeviceConfig } from '../../types/index.js';
import { SwitchHelper } from '../../utils/switch-helper.js';
import { EVE_CHARACTERISTIC_UUIDS } from '../../utils/eve-characteristics.js';

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
  private readonly sensorCharacteristic: any;

  /** Whether to use LastActivation characteristic */
  private readonly useLastActivation: boolean;

  /** Power monitoring support */
  private readonly powerReadings: boolean;

  /** Dual R3 device flag */
  private readonly isDualR3: boolean;

  /** Has full power readings (voltage + current) */
  private readonly hasFullPowerReadings: boolean;

  /** Power update interval */
  private powerInterval?: NodeJS.Timeout;

  /** Last activation time (Eve initial time) */
  private eveInitialTime = 0;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    this.channelIndex = accessory.context.channelIndex || 0;

    // Get device-specific config
    this.deviceConfig = platform.config.singleDevices?.find(
      d => d.deviceId === this.deviceId,
    ) || platform.config.multiDevices?.find(
      d => d.deviceId === this.deviceId,
    );

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
      const LastActivationUUID = 'E863F11A-079E-48FF-8F27-9C2605A29F52';
      if (!this.service.testCharacteristic(LastActivationUUID)) {
        this.service.addCharacteristic(this.platform.eveCharacteristics.LastActivation);
      }
    }

    // Configure sensor characteristic
    this.service.getCharacteristic(this.sensorCharacteristic)
      .onGet(this.getSensorState.bind(this));

    // Check for power monitoring support
    const uiid = this.device.extra?.uiid || 0;

    // Single switch with power monitoring
    if ([5, 32].includes(uiid)) {
      this.powerReadings = true;
      this.hasFullPowerReadings = uiid === 32;
      this.isDualR3 = false;
    } else if ([126, 165, 182, 190].includes(uiid)) {
      // Multi-channel with power monitoring (Dual R3)
      this.powerReadings = true;
      this.hasFullPowerReadings = true;
      this.isDualR3 = true;
    } else {
      // Check if device params contain power readings
      this.powerReadings = this.supportsPowerMonitoring();
      this.hasFullPowerReadings = false;
      this.isDualR3 = false;
    }

    // Add Eve power characteristics if supported
    if (this.powerReadings) {
      this.setupPowerMonitoring();
    }

    // Initialize Eve history service
    // Note: In TypeScript version, we'll need to integrate with fakegato-history separately
    // For now, we'll store the initial time for LastActivation calculations
    this.eveInitialTime = Math.floor(Date.now() / 1000);

    // Set up power polling if supported
    if (this.powerReadings && (!this.isDualR3 || this.platform.config.mode !== 'lan')) {
      // Start polling after 5 seconds, then every 2 minutes
      setTimeout(() => {
        this.requestPowerUpdate();
        this.powerInterval = setInterval(() => this.requestPowerUpdate(), 120000);
      }, 5000);
    }

    // Set initial state
    this.updateState(this.deviceParams);

    this.logDebug(`Sensor initialized (type: ${this.sensorType})`);
  }

  /**
   * Check if device supports power monitoring
   */
  private supportsPowerMonitoring(): boolean {
    return this.deviceParams.power !== undefined ||
           this.deviceParams.voltage !== undefined ||
           this.deviceParams.current !== undefined ||
           this.deviceParams.actPow_00 !== undefined ||
           this.deviceParams.voltage_00 !== undefined ||
           this.deviceParams.current_00 !== undefined;
  }

  /**
   * Setup power monitoring characteristics
   */
  private setupPowerMonitoring(): void {
    const { CurrentConsumption, Voltage, ElectricCurrent } = this.platform.eveCharacteristics;

    
    
    

    if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption)) {
      this.service.addCharacteristic(CurrentConsumption);
    }

    if (this.hasFullPowerReadings) {
      if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage)) {
        this.service.addCharacteristic(Voltage);
      }
      if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent)) {
        this.service.addCharacteristic(ElectricCurrent);
      }
    }

    this.logDebug(`Power monitoring enabled (full readings: ${this.hasFullPowerReadings})`);
  }

  /**
   * Request power update from device
   */
  private async requestPowerUpdate(): Promise<void> {
    try {
      if (!this.isOnline) {
        return;
      }

      const params = this.isDualR3
        ? { uiActive: { outlet: 0, time: 120 } }
        : { uiActive: 120 };

      await this.sendCommand(params);
    } catch (error) {
      // Suppress errors
      this.logDebug('Failed to request power update:', error);
    }
  }

  /**
   * Get sensor state
   */
  private async getSensorState(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.service.getCharacteristic(this.sensorCharacteristic).value;
    }, this.sensorCharacteristic.displayName || 'SensorState');
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    Object.assign(this.deviceParams, params);

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
        const LastActivationUUID = 'E863F11A-079E-48FF-8F27-9C2605A29F52';
        this.service.updateCharacteristic(LastActivationUUID, timeSinceInitial);
      }

      this.logDebug(`Sensor state updated: ${isOn ? 'DETECTED' : 'CLEAR'}`);
    }

    // Update Eve power characteristics if supported
    if (this.powerReadings) {
      this.updatePowerReadings(params);
    }
  }

  /**
   * Update power readings from device params
   */
  private updatePowerReadings(params: DeviceParams): void {
    
    
    

    let hasUpdate = false;

    // Check for Dual R3 format (with _00 suffix)
    if (params.actPow_00 !== undefined) {
      const power = parseInt(String(params.actPow_00), 10) / 100;
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption, power);
      hasUpdate = true;
    } else if (params.power !== undefined) {
      const power = parseFloat(String(params.power));
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption, power);
      hasUpdate = true;
    }

    if (this.hasFullPowerReadings) {
      if (params.voltage_00 !== undefined) {
        const voltage = parseInt(String(params.voltage_00), 10) / 100;
        this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage, voltage);
        hasUpdate = true;
      } else if (params.voltage !== undefined) {
        const voltage = parseFloat(String(params.voltage));
        this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage, voltage);
        hasUpdate = true;
      }

      if (params.current_00 !== undefined) {
        const current = parseInt(String(params.current_00), 10) / 100;
        this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent, current);
        hasUpdate = true;
      } else if (params.current !== undefined) {
        const current = parseFloat(String(params.current));
        this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent, current);
        hasUpdate = true;
      }
    }

    if (hasUpdate) {
      this.logDebug('Power readings updated');
    }
  }
}
