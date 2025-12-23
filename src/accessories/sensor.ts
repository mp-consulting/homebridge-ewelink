import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams, SensorDeviceConfig } from '../types/index.js';
import { DeviceValueParser } from '../utils/device-parsers.js';
import { BATTERY_MIN, BATTERY_MAX, DEFAULT_BATTERY } from '../constants/device-constants.js';
import {
  isMotionSensor as isMotionSensorUIID,
  isContactSensor as isContactSensorUIID,
} from '../constants/device-catalog.js';

/**
 * Sensor Accessory for various sensor types with optional switch control
 */
export class SensorAccessory extends BaseAccessory {
  /** Temperature sensor service */
  private temperatureService?: ReturnType<typeof this.getOrAddService>;

  /** Humidity sensor service */
  private humidityService?: ReturnType<typeof this.getOrAddService>;

  /** Battery service */
  private batteryService?: ReturnType<typeof this.getOrAddService>;

  /** Motion sensor service */
  private motionService?: ReturnType<typeof this.getOrAddService>;

  /** Contact sensor service */
  private contactService?: ReturnType<typeof this.getOrAddService>;

  /** Switch service (optional, for sensors that can control a relay) */
  private switchService?: ReturnType<typeof this.getOrAddService>;

  /** Device config */
  private readonly deviceConfig?: SensorDeviceConfig;

  /** Hide switch service */
  private readonly hideSwitch: boolean;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Get device-specific config
    this.deviceConfig = platform.config.sensorDevices?.find(
      d => d.deviceId === this.deviceId,
    );

    // Check if switch should be hidden
    this.hideSwitch = this.deviceConfig?.hideSwitch || false;

    // Set up services based on device capabilities
    this.setupSensorServices();

    // Set initial state
    this.updateState(this.deviceParams);
  }

  /**
   * Set up sensor services based on device capabilities
   */
  private setupSensorServices(): void {
    // Optional switch service for sensors with relay control
    if (this.hasSwitchControl() && !this.hideSwitch) {
      this.switchService = this.getOrAddService(
        this.Service.Switch,
        this.accessory.displayName,
      );

      this.switchService.getCharacteristic(this.Characteristic.On)
        .onGet(this.getSwitchState.bind(this))
        .onSet(this.setSwitchState.bind(this));

      // Set as primary service so status is reflected in Home icon
      this.switchService.setPrimaryService();
      this.service = this.switchService;
    } else {
      this.removeServiceIfExists(this.Service.Switch);
    }

    // Temperature sensor
    if (this.hasTemperature() && !this.deviceConfig?.hideTemp) {
      this.temperatureService = this.getOrAddService(
        this.Service.TemperatureSensor,
        `${this.accessory.displayName} Temperature`,
        'temp',
      );

      this.temperatureService.getCharacteristic(this.Characteristic.CurrentTemperature)
        .onGet(this.getCurrentTemperature.bind(this));
    } else {
      this.removeServiceIfExists(this.Service.TemperatureSensor, 'temp');
    }

    // Humidity sensor
    if (this.hasHumidity() && !this.deviceConfig?.hideHumidity) {
      this.humidityService = this.getOrAddService(
        this.Service.HumiditySensor,
        `${this.accessory.displayName} Humidity`,
        'humidity',
      );

      this.humidityService.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
        .onGet(this.getCurrentHumidity.bind(this));
    } else {
      this.removeServiceIfExists(this.Service.HumiditySensor, 'humidity');
    }

    // Motion sensor (PIR sensors)
    if (this.isMotionSensor()) {
      this.motionService = this.getOrAddService(this.Service.MotionSensor);

      this.motionService.getCharacteristic(this.Characteristic.MotionDetected)
        .onGet(this.getMotionDetected.bind(this));

      this.service = this.motionService;
    }

    // Contact sensor (door/window sensors)
    if (this.isContactSensor()) {
      this.contactService = this.getOrAddService(this.Service.ContactSensor);

      this.contactService.getCharacteristic(this.Characteristic.ContactSensorState)
        .onGet(this.getContactState.bind(this));

      this.service = this.contactService;
    }

    // Battery service for battery-powered sensors
    if (this.hasBattery()) {
      this.batteryService = this.getOrAddService(this.Service.Battery);

      this.batteryService.getCharacteristic(this.Characteristic.BatteryLevel)
        .onGet(this.getBatteryLevel.bind(this));

      this.batteryService.getCharacteristic(this.Characteristic.StatusLowBattery)
        .onGet(this.getStatusLowBattery.bind(this));
    }

    // Default service to temperature if nothing else
    if (!this.service && this.temperatureService) {
      this.service = this.temperatureService;
    }
  }

  /**
   * Check if device has temperature sensor
   */
  private hasTemperature(): boolean {
    return this.deviceParams.currentTemperature !== undefined ||
           this.deviceParams.temperature !== undefined;
  }

  /**
   * Check if device has humidity sensor
   */
  private hasHumidity(): boolean {
    return this.deviceParams.currentHumidity !== undefined ||
           this.deviceParams.humidity !== undefined;
  }

  /**
   * Check if device has battery
   */
  private hasBattery(): boolean {
    return this.deviceParams.battery !== undefined;
  }

  /**
   * Check if device has switch control (ambient sensors like SONOFF SC)
   */
  private hasSwitchControl(): boolean {
    return this.deviceParams.switch !== undefined;
  }

  /**
   * Check if this is a motion sensor
   */
  private isMotionSensor(): boolean {
    const uiid = this.device.extra?.uiid || 0;
    return isMotionSensorUIID(uiid);
  }

  /**
   * Check if this is a contact sensor
   */
  private isContactSensor(): boolean {
    const uiid = this.device.extra?.uiid || 0;
    return isContactSensorUIID(uiid);
  }

  /**
   * Get switch state
   */
  private async getSwitchState(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.deviceParams.switch === 'on';
    }, 'On');
  }

  /**
   * Set switch state
   */
  private async setSwitchState(value: CharacteristicValue): Promise<void> {
    await this.handleSet(value as boolean, 'On', async (on) => {
      return await this.sendCommand({ switch: on ? 'on' : 'off' });
    });
  }

  /**
   * Get current temperature
   */
  private async getCurrentTemperature(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      const rawTemp = DeviceValueParser.parseTemperature(this.deviceParams);
      return this.applyTemperatureOffset(rawTemp, this.deviceConfig?.tempOffset || 0);
    }, 'CurrentTemperature');
  }

  /**
   * Get current humidity
   */
  private async getCurrentHumidity(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      const rawHumidity = DeviceValueParser.parseHumidity(this.deviceParams);
      return this.applyHumidityOffset(rawHumidity, this.deviceConfig?.humidityOffset || 0);
    }, 'CurrentRelativeHumidity');
  }

  /**
   * Get motion detected state
   */
  private async getMotionDetected(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return DeviceValueParser.parseMotionState(this.deviceParams);
    }, 'MotionDetected');
  }

  /**
   * Get contact sensor state
   */
  private async getContactState(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      const isOpen = DeviceValueParser.parseContactState(this.deviceParams);
      return isOpen
        ? this.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
        : this.Characteristic.ContactSensorState.CONTACT_DETECTED;
    }, 'ContactSensorState');
  }

  /**
   * Get battery level
   */
  private async getBatteryLevel(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.clamp(
        DeviceValueParser.parseBattery(this.deviceParams, DEFAULT_BATTERY),
        BATTERY_MIN,
        BATTERY_MAX,
      );
    }, 'BatteryLevel');
  }

  /**
   * Get low battery status
   */
  private async getStatusLowBattery(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      const level = DeviceValueParser.parseBattery(this.deviceParams, DEFAULT_BATTERY);
      const threshold = this.deviceConfig?.lowBattery || 20;
      return level < threshold
        ? this.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
        : this.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }, 'StatusLowBattery');
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    // Update switch state if present
    if (this.switchService && params.switch !== undefined) {
      const isOn = params.switch === 'on';
      this.switchService.updateCharacteristic(this.Characteristic.On, isOn);
    }

    // Update temperature
    if (this.temperatureService) {
      const rawTemp = DeviceValueParser.parseTemperature(this.deviceParams);
      const temp = this.applyTemperatureOffset(rawTemp, this.deviceConfig?.tempOffset || 0);
      this.temperatureService.updateCharacteristic(
        this.Characteristic.CurrentTemperature,
        temp,
      );
    }

    // Update humidity
    if (this.humidityService) {
      const rawHumidity = DeviceValueParser.parseHumidity(this.deviceParams);
      const humidity = this.applyHumidityOffset(rawHumidity, this.deviceConfig?.humidityOffset || 0);
      this.humidityService.updateCharacteristic(
        this.Characteristic.CurrentRelativeHumidity,
        humidity,
      );
    }

    // Update motion
    if (this.motionService) {
      const motion = DeviceValueParser.parseMotionState(params);
      this.motionService.updateCharacteristic(
        this.Characteristic.MotionDetected,
        motion,
      );
    }

    // Update contact
    if (this.contactService) {
      const isOpen = DeviceValueParser.parseContactState(params);
      this.contactService.updateCharacteristic(
        this.Characteristic.ContactSensorState,
        isOpen
          ? this.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
          : this.Characteristic.ContactSensorState.CONTACT_DETECTED,
      );
    }

    // Update battery
    if (this.batteryService && params.battery !== undefined) {
      const level = this.clamp(
        DeviceValueParser.parseBattery(this.deviceParams, DEFAULT_BATTERY),
        BATTERY_MIN,
        BATTERY_MAX,
      );
      const threshold = this.deviceConfig?.lowBattery || 20;

      this.batteryService.updateCharacteristic(
        this.Characteristic.BatteryLevel,
        level,
      );
      this.batteryService.updateCharacteristic(
        this.Characteristic.StatusLowBattery,
        level < threshold
          ? this.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
          : this.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      );
    }

    this.logDebug('Sensor state updated');
  }
}
