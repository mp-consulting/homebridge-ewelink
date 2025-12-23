import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import { EWeLinkPlatform } from '../../platform.js';
import { AccessoryContext, DeviceParams, SingleDeviceConfig, MultiDeviceConfig } from '../../types/index.js';
import { EVE_CHARACTERISTIC_UUIDS } from '../../utils/eve-characteristics.js';
import { SIMULATION_TIMING } from '../../constants/timing-constants.js';
import { isContactSensor, hasBattery, getBatteryType } from '../../constants/device-constants.js';

/**
 * Visible Sensor Accessory
 * Simulates a visible contact/motion sensor using a DW2 contact sensor device
 * Can be used with garage doors or locks as sub-accessories
 */
export class SensorVisibleAccessory extends BaseAccessory {
  /** Device configuration */
  private readonly deviceConfig?: SingleDeviceConfig | MultiDeviceConfig;

  /** Low battery threshold */
  private readonly lowBattThreshold: number;

  /** Scale battery percentage */
  private readonly scaleBattery: boolean;

  /** Battery service */
  private batteryService?: typeof this.Service.Battery.prototype;

  /** Sub-accessory for garage/lock simulation */
  private subAccessory?: PlatformAccessory<AccessoryContext>;

  /** Sub-service for garage/lock */
  private subService?: typeof this.Service.GarageDoorOpener.prototype | typeof this.Service.LockMechanism.prototype;

  /** Is garage door simulation */
  private readonly isGarage: boolean;

  /** Operation time for garage door */
  private readonly operationTime: number;

  /** Is DW2 sensor (UIID 102/154) */
  private readonly isDW2: boolean;

  /** Has battery sensor */
  private readonly hasBattery: boolean;

  /** Last activation time (Eve initial time) */
  private eveInitialTime = 0;

  /** Sub-accessory Eve initial time */
  private subEveInitialTime = 0;

  /** Cached battery percentage */
  private cacheBattScaled = 100;

  /** Cached state */
  private cacheState?: number;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
    subAccessory?: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    this.subAccessory = subAccessory;

    // Get device-specific config
    this.deviceConfig = platform.config.singleDevices?.find(
      d => d.deviceId === this.deviceId,
    ) || platform.config.multiDevices?.find(
      d => d.deviceId === this.deviceId,
    );

    // Get sub-accessory config if exists
    const subConfig = subAccessory
      ? platform.config.singleDevices?.find(
        d => d.deviceId === subAccessory.context.deviceId,
      ) || platform.config.multiDevices?.find(
        d => d.deviceId === subAccessory.context.deviceId,
      )
      : undefined;

    // Determine if this is a garage door or lock simulation
    this.isGarage = subConfig?.showAs === 'garage';
    this.operationTime = subConfig?.operationTime || 20;

    // Determine device type using catalog helpers
    const uiid = this.device.extra?.uiid || 0;
    this.isDW2 = isContactSensor(uiid);
    this.hasBattery = hasBattery(uiid);

    // Get battery settings
    this.lowBattThreshold = this.deviceConfig?.lowBattThreshold
      ? Math.min(this.deviceConfig.lowBattThreshold, 100)
      : 25;
    this.scaleBattery = this.deviceConfig?.scaleBattery || false;

    // Remove old leak sensor service if it exists
    this.removeServiceIfExists(this.Service.LeakSensor);

    // Set up the contact sensor service
    this.service = this.getOrAddService(this.Service.ContactSensor);

    // Add Eve characteristics
    if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.LastActivation)) {
      this.service.addCharacteristic(this.platform.eveCharacteristics.LastActivation);
    }
    if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.ResetTotal)) {
      this.service.addCharacteristic(this.platform.eveCharacteristics.ResetTotal);
    }
    if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.OpenDuration)) {
      this.service.addCharacteristic(this.platform.eveCharacteristics.OpenDuration);
    }
    if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.ClosedDuration)) {
      this.service.addCharacteristic(this.platform.eveCharacteristics.ClosedDuration);
    }
    if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.TimesOpened)) {
      this.service.addCharacteristic(this.platform.eveCharacteristics.TimesOpened);
    }

    // Add reset handler
    this.service.getCharacteristic(EVE_CHARACTERISTIC_UUIDS.ResetTotal)?.onSet(() => {
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.TimesOpened, 0);
    });

    // Configure contact sensor characteristic
    this.service.getCharacteristic(this.Characteristic.ContactSensorState)
      .onGet(this.getContactSensorState.bind(this));

    // Add battery service if supported
    if (this.hasBattery) {
      this.batteryService = this.getOrAddService(this.Service.Battery) as any;
    }

    // Set up sub-accessory if provided
    if (this.subAccessory) {
      this.setupSubAccessory();
    }

    // Initialize Eve history service
    this.eveInitialTime = Math.floor(Date.now() / 1000);
    this.subEveInitialTime = Math.floor(Date.now() / 1000);

    // Set initial state
    this.updateState(this.deviceParams);

    this.logDebug(`Visible sensor initialized (battery: ${this.hasBattery}, sub-accessory: ${!!this.subAccessory})`);
  }

  /**
   * Set up sub-accessory (garage door or lock)
   */
  private setupSubAccessory(): void {
    if (!this.subAccessory) {
      return;
    }

    if (this.isGarage) {
      // Set up garage door opener service
      this.subService = this.subAccessory.getService(this.Service.GarageDoorOpener) ||
                        this.subAccessory.addService(this.Service.GarageDoorOpener) as any;

      // Add Eve characteristics for garage
      if (this.subService && !this.subService.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.LastActivation)) {
        this.subService.addCharacteristic(this.platform.eveCharacteristics.LastActivation);
      }
      if (this.subService && !this.subService.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.TimesOpened)) {
        this.subService.addCharacteristic(this.platform.eveCharacteristics.TimesOpened);
      }

      // Configure garage door characteristics
      if (this.subService) {
        this.subService.getCharacteristic(this.Characteristic.TargetDoorState)
          .onSet(this.setGarageDoorTarget.bind(this));

        this.subService.getCharacteristic(this.Characteristic.CurrentDoorState)
          .onGet(this.getGarageDoorCurrent.bind(this));

        this.subService.getCharacteristic(this.Characteristic.ObstructionDetected)
          .onGet(() => false);
      }
    } else {
      // Set up lock mechanism service
      this.subService = this.subAccessory.getService(this.Service.LockMechanism) ||
                        this.subAccessory.addService(this.Service.LockMechanism) as any;

      // Configure lock characteristics
      if (this.subService) {
        this.subService.getCharacteristic(this.Characteristic.LockTargetState)
          .onSet(this.setLockTarget.bind(this));

        this.subService.getCharacteristic(this.Characteristic.LockCurrentState)
          .onGet(this.getLockCurrent.bind(this));
      }
    }
  }

  /**
   * Get contact sensor state
   */
  private async getContactSensorState(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.service.getCharacteristic(this.Characteristic.ContactSensorState).value;
    }, 'ContactSensorState');
  }

  /**
   * Get garage door current state
   */
  private async getGarageDoorCurrent(): Promise<CharacteristicValue> {
    if (!this.subService) {
      return this.Characteristic.CurrentDoorState.CLOSED;
    }
    return this.subService.getCharacteristic(this.Characteristic.CurrentDoorState).value ?? this.Characteristic.CurrentDoorState.CLOSED;
  }

  /**
   * Set garage door target state
   */
  private async setGarageDoorTarget(value: CharacteristicValue): Promise<void> {
    // Garage door target is read-only in this simulation
    // The actual state is controlled by the contact sensor
    this.logDebug(`Garage door target set to: ${value} (ignored, controlled by sensor)`);
  }

  /**
   * Get lock current state
   */
  private async getLockCurrent(): Promise<CharacteristicValue> {
    if (!this.subService) {
      return this.Characteristic.LockCurrentState.SECURED;
    }
    return this.subService.getCharacteristic(this.Characteristic.LockCurrentState).value ?? this.Characteristic.LockCurrentState.SECURED;
  }

  /**
   * Set lock target state
   */
  private async setLockTarget(value: CharacteristicValue): Promise<void> {
    // Lock target is read-only in this simulation
    // The actual state is controlled by the contact sensor
    this.logDebug(`Lock target set to: ${value} (ignored, controlled by sensor)`);
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    Object.assign(this.deviceParams, params);

    // Update battery level if present
    if (params.battery !== undefined && this.batteryService) {
      const batteryRaw = params.battery as number;
      const uiid = this.device.extra?.uiid || 0;
      const batteryType = getBatteryType(uiid);

      // Scale battery based on device battery type from catalog
      if (this.isDW2) {
        if (batteryType === 'voltage') {
          // Battery reported as voltage (2.0V - 3.0V)
          const voltage = Math.min(Math.max(batteryRaw, 2), 3);
          this.cacheBattScaled = Math.round((voltage - 2) * 100);
        } else {
          // Battery reported as percentage (0-100)
          this.cacheBattScaled = batteryRaw;
        }
      } else {
        // Other sensors may need scaling
        this.cacheBattScaled = this.scaleBattery ? batteryRaw * 10 : batteryRaw;
      }

      this.cacheBattScaled = Math.max(Math.min(this.cacheBattScaled, 100), 0);

      this.batteryService.updateCharacteristic(this.Characteristic.BatteryLevel, this.cacheBattScaled);
      this.batteryService.updateCharacteristic(
        this.Characteristic.StatusLowBattery,
        this.cacheBattScaled < this.lowBattThreshold ? 1 : 0,
      );

      this.logDebug(`Battery updated: ${this.cacheBattScaled}%`);
    }

    // Update contact sensor state
    let newState: number | undefined;

    if (params.switch !== undefined) {
      newState = params.switch === 'on' ? 1 : 0;
    } else if (params.lock !== undefined) {
      newState = params.lock as number;
    }

    if (newState !== undefined && newState !== this.cacheState) {
      this.cacheState = newState;

      // Update contact sensor (1 = open/detected, 0 = closed/not detected)
      this.service.updateCharacteristic(this.Characteristic.ContactSensorState, newState);

      // Update LastActivation and TimesOpened when contact is detected
      if (newState === 1) {
        const timeSinceInitial = Math.floor(Date.now() / 1000) - this.eveInitialTime;
        this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.LastActivation, timeSinceInitial);

        const currentTimesOpened = (this.service.getCharacteristic(EVE_CHARACTERISTIC_UUIDS.TimesOpened)?.value as number) || 0;
        this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.TimesOpened, currentTimesOpened + 1);
      }

      this.logDebug(`Contact sensor state updated: ${newState === 1 ? 'OPEN' : 'CLOSED'}`);

      // Update sub-accessory if present
      if (this.subService) {
        this.updateSubAccessory(newState);
      }
    }
  }

  /**
   * Update sub-accessory state based on contact sensor
   */
  private async updateSubAccessory(state: number): Promise<void> {
    if (!this.subService) {
      return;
    }

    if (this.isGarage) {
      // Update garage door
      if (state === 0) {
        // Contact closed = garage door closed
        this.subService.updateCharacteristic(this.Characteristic.TargetDoorState, 1); // CLOSED
        this.subService.updateCharacteristic(this.Characteristic.CurrentDoorState, 1); // CLOSED
        this.logDebug('Garage door: CLOSED');
      } else {
        // Contact open = garage door opening/open
        // Wait for operation time before marking as fully open
        await this.delay(Math.max(this.operationTime * 100, SIMULATION_TIMING.POSITION_CLEANUP_MS));

        this.subService.updateCharacteristic(this.Characteristic.TargetDoorState, 0); // OPEN
        this.subService.updateCharacteristic(this.Characteristic.CurrentDoorState, 0); // OPEN

        // Update Eve characteristics
        const timeSinceInitial = Math.floor(Date.now() / 1000) - this.subEveInitialTime;
        this.subService.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.LastActivation, timeSinceInitial);

        const currentTimesOpened = (this.subService.getCharacteristic(EVE_CHARACTERISTIC_UUIDS.TimesOpened)?.value as number) || 0;
        this.subService.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.TimesOpened, currentTimesOpened + 1);

        this.logDebug('Garage door: OPEN');
      }
    } else {
      // Update lock
      if (state === 0) {
        // Contact closed = locked
        this.subService.updateCharacteristic(this.Characteristic.LockTargetState, 1); // SECURED
        this.subService.updateCharacteristic(this.Characteristic.LockCurrentState, 1); // SECURED
        this.logDebug('Lock: SECURED');
      } else {
        // Contact open = unlocked
        this.subService.updateCharacteristic(this.Characteristic.LockTargetState, 0); // UNSECURED
        this.subService.updateCharacteristic(this.Characteristic.LockCurrentState, 0); // UNSECURED
        this.logDebug('Lock: UNSECURED');
      }
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
