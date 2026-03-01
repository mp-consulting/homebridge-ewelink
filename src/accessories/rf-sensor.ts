import type { PlatformAccessory, CharacteristicValue, Service, WithUUID } from 'homebridge';
import { BaseAccessory } from './base.js';
import type { EWeLinkPlatform } from '../platform.js';
import type { AccessoryContext, DeviceParams, RFSubdeviceConfig } from '../types/index.js';
import { SENSOR_TIMING } from '../constants/timing-constants.js';

type SensorType = 'motion' | 'contact' | 'water' | 'smoke' | 'co' | 'co2' | 'occupancy' | 'button' | 'doorbell';

/**
 * RF Sensor Accessory
 * Represents a sensor learned by an RF Bridge
 * Supports multiple sensor types: motion, contact, leak, smoke, CO, occupancy, button, doorbell
 */
export class RFSensorAccessory extends BaseAccessory {
  private sensorService!: Service;
  private sensorType: SensorType;
  private sensorTimeLength: number;
  private sensorTimeDifference: number;
  private lastActivationTime?: string;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Get sensor configuration
    const sensorConfig = this.getSensorConfig();
    this.sensorType = (sensorConfig?.showAs || 'motion') as SensorType;
    this.sensorTimeLength = sensorConfig?.resetTime || 60;
    this.sensorTimeDifference = SENSOR_TIMING.MAX_TIME_DIFF_S;

    // Set up the appropriate sensor service
    this.setupSensorService();

    this.logDebug(`RF Sensor initialized as ${this.sensorType} type`);
  }

  /**
   * Get sensor-specific configuration
   */
  private getSensorConfig(): RFSubdeviceConfig | undefined {
    const rfDevices = this.platform.config.rfDevices || [];
    const bridgeDevice = rfDevices.find(
      d => d.deviceId === this.accessory.context.device?.deviceid,
    );

    if (!bridgeDevice?.subdevices) {
      return undefined;
    }

    const buttonIndex = this.accessory.context.rfButtonIndex;
    return bridgeDevice.subdevices.find(s => s.index === buttonIndex);
  }

  /**
   * Set up the appropriate sensor service based on type
   */
  private setupSensorService(): void {
    // Remove any existing incompatible services
    this.removeOtherSensorServices();

    // Create the appropriate service and characteristic
    switch (this.sensorType) {
      case 'water':
        this.sensorService = this.getOrAddService(this.Service.LeakSensor);
        this.sensorService.getCharacteristic(this.Characteristic.LeakDetected)
          .onGet(() => this.getSensorState());
        break;

      case 'smoke':
        this.sensorService = this.getOrAddService(this.Service.SmokeSensor);
        this.sensorService.getCharacteristic(this.Characteristic.SmokeDetected)
          .onGet(() => this.getSensorState());
        break;

      case 'co':
        this.sensorService = this.getOrAddService(this.Service.CarbonMonoxideSensor);
        this.sensorService.getCharacteristic(this.Characteristic.CarbonMonoxideDetected)
          .onGet(() => this.getSensorState());
        break;

      case 'co2':
        this.sensorService = this.getOrAddService(this.Service.CarbonDioxideSensor);
        this.sensorService.getCharacteristic(this.Characteristic.CarbonDioxideDetected)
          .onGet(() => this.getSensorState());
        break;

      case 'contact':
        this.sensorService = this.getOrAddService(this.Service.ContactSensor);
        this.sensorService.getCharacteristic(this.Characteristic.ContactSensorState)
          .onGet(() => this.getSensorState());
        break;

      case 'occupancy':
        this.sensorService = this.getOrAddService(this.Service.OccupancySensor);
        this.sensorService.getCharacteristic(this.Characteristic.OccupancyDetected)
          .onGet(() => this.getSensorState());
        break;

      case 'button':
        this.sensorService = this.getOrAddService(this.Service.StatelessProgrammableSwitch);
        this.sensorService.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent)
          .setProps({ validValues: [0] }); // Single press only
        break;

      case 'doorbell':
        this.sensorService = this.getOrAddService(this.Service.Doorbell);
        this.sensorService.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent)
          .setProps({ validValues: [0] }); // Single press only
        break;

      case 'motion':
      default:
        this.sensorService = this.getOrAddService(this.Service.MotionSensor);
        this.sensorService.getCharacteristic(this.Characteristic.MotionDetected)
          .onGet(() => this.getSensorState());
        break;
    }

    // Initialize sensor state to inactive
    if (this.sensorType !== 'button' && this.sensorType !== 'doorbell') {
      this.updateSensorCharacteristic(0);
    }
  }

  /**
   * Remove sensor services that don't match current type
   */
  private removeOtherSensorServices(): void {
    const sensorServices = [
      this.Service.LeakSensor,
      this.Service.SmokeSensor,
      this.Service.CarbonMonoxideSensor,
      this.Service.CarbonDioxideSensor,
      this.Service.ContactSensor,
      this.Service.OccupancySensor,
      this.Service.MotionSensor,
      this.Service.StatelessProgrammableSwitch,
      this.Service.Doorbell,
    ];

    sensorServices.forEach((serviceType) => {
      const service = this.accessory.getService(serviceType);
      if (service && !this.isCurrentSensorType(serviceType)) {
        this.accessory.removeService(service);
      }
    });
  }

  /**
   * Check if a service type matches the current sensor type
   */
  private isCurrentSensorType(serviceType: WithUUID<typeof Service>): boolean {
    const serviceMap: Record<SensorType, WithUUID<typeof Service>> = {
      water: this.Service.LeakSensor,
      smoke: this.Service.SmokeSensor,
      co: this.Service.CarbonMonoxideSensor,
      co2: this.Service.CarbonDioxideSensor,
      contact: this.Service.ContactSensor,
      occupancy: this.Service.OccupancySensor,
      button: this.Service.StatelessProgrammableSwitch,
      doorbell: this.Service.Doorbell,
      motion: this.Service.MotionSensor,
    };

    return serviceMap[this.sensorType] === serviceType;
  }

  /**
   * Get sensor state
   */
  private async getSensorState(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      // For button and doorbell, we don't track state
      if (this.sensorType === 'button' || this.sensorType === 'doorbell') {
        return 0;
      }

      // Check if last activation was recent enough
      if (!this.lastActivationTime) {
        return 0;
      }

      const now = new Date().getTime();
      const lastTime = new Date(this.lastActivationTime).getTime();
      const diff = (now - lastTime) / 1000;

      // Sensor is active if within the time length
      return diff < this.sensorTimeLength ? 1 : 0;
    }, 'SensorState');
  }

  /**
   * Update the appropriate sensor characteristic
   */
  private updateSensorCharacteristic(value: number): void {
    switch (this.sensorType) {
      case 'water':
        this.sensorService.updateCharacteristic(this.Characteristic.LeakDetected, value);
        break;
      case 'smoke':
        this.sensorService.updateCharacteristic(this.Characteristic.SmokeDetected, value);
        break;
      case 'co':
        this.sensorService.updateCharacteristic(this.Characteristic.CarbonMonoxideDetected, value);
        break;
      case 'co2':
        this.sensorService.updateCharacteristic(this.Characteristic.CarbonDioxideDetected, value);
        break;
      case 'contact':
        this.sensorService.updateCharacteristic(this.Characteristic.ContactSensorState, value);
        break;
      case 'occupancy':
        this.sensorService.updateCharacteristic(this.Characteristic.OccupancyDetected, value);
        break;
      case 'motion':
        this.sensorService.updateCharacteristic(this.Characteristic.MotionDetected, value);
        break;
      case 'button':
      case 'doorbell':
        // Button and doorbell trigger events, not state changes
        this.sensorService.updateCharacteristic(this.Characteristic.ProgrammableSwitchEvent, 0);
        break;
    }
  }

  /**
   * External trigger from RF Bridge
   * Called when the physical RF sensor is triggered
   */
  triggerSensor(timestamp: string): void {
    // Check if this is a duplicate trigger
    if (timestamp === this.lastActivationTime) {
      this.logDebug('Ignoring duplicate sensor trigger');
      return;
    }

    this.lastActivationTime = timestamp;

    // Check if the trigger is recent enough
    const now = new Date().getTime();
    const triggerTime = new Date(timestamp).getTime();
    const diff = (now - triggerTime) / 1000;

    if (diff > this.sensorTimeDifference) {
      this.logDebug(`Sensor trigger too old: ${diff}s > ${this.sensorTimeDifference}s`);
      return;
    }

    this.logInfo(`Sensor triggered (type: ${this.sensorType})`);

    // Update sensor state
    this.updateSensorCharacteristic(1);

    // For non-stateless sensors, reset after timeout
    if (this.sensorType !== 'button' && this.sensorType !== 'doorbell') {
      setTimeout(() => {
        this.updateSensorCharacteristic(0);
        this.logDebug(`Sensor reset after ${this.sensorTimeLength}s`);
      }, this.sensorTimeLength * 1000);
    }
  }

  /**
   * Update state from device params (no-op for RF sensors)
   */
  updateState(_params: DeviceParams): void {
    // RF sensors don't have persistent state updates
  }
}
