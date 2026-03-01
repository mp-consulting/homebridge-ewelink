import type { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import type { EWeLinkPlatform } from '../../platform.js';
import type { AccessoryContext, DeviceParams, ThermostatDeviceConfig } from '../../types/index.js';
import { DeviceValueParser } from '../../utils/device-parsers.js';
import { POLLING } from '../../constants/timing-constants.js';

/**
 * TH Humidifier Simulation Accessory
 * Uses a TH sensor to control a humidifier switch based on humidity thresholds
 */
export class THHumidifierAccessory extends BaseAccessory {
  /** Temperature sensor service */
  private tempService?: ReturnType<typeof this.getOrAddService>;

  /** Device configuration */
  private readonly deviceConfig?: ThermostatDeviceConfig;

  /** Temperature offset */
  private readonly tempOffset: number;

  /** Temperature offset factor */
  private readonly tempOffsetFactor: boolean;

  /** Humidity offset */
  private readonly humidityOffset: number;

  /** Humidity offset factor */
  private readonly humidityOffsetFactor: boolean;

  /** Cached temperature */
  private cacheTemp: number;

  /** Cached humidity */
  private cacheHumi: number;

  /** Cached target humidity */
  private cacheTarget: number;

  /** Cached state */
  private cacheState: 'on' | 'off' = 'off';

  /** Cached humidifying state */
  private cacheHumid: 'on' | 'off' = 'off';

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Get device-specific config
    this.deviceConfig = platform.config.thDevices?.find(
      d => d.deviceId === this.deviceId,
    );

    // Set up temperature/humidity offsets
    this.tempOffset = this.deviceConfig?.tempOffset || 0;
    this.tempOffsetFactor = this.deviceConfig?.offsetFactor !== undefined;
    this.humidityOffset = this.deviceConfig?.humidityOffset || 0;
    this.humidityOffsetFactor = this.deviceConfig?.humidityOffsetFactor !== undefined;

    // Set up the accessory with default target humidity when added the first time
    if (!accessory.context.cacheTarget) {
      accessory.context.cacheTarget = 50;
    }
    this.cacheTarget = accessory.context.cacheTarget as number;

    // Set up HumidifierDehumidifier service
    this.service = this.getOrAddService(this.Service.HumidifierDehumidifier);

    // Add temperature sensor service
    this.tempService = this.getOrAddService(
      this.Service.TemperatureSensor,
      `${accessory.displayName} Temperature`,
      'temp',
    );

    this.tempService.getCharacteristic(this.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));

    this.cacheTemp = this.tempService.getCharacteristic(this.Characteristic.CurrentTemperature).value as number;
    this.cacheHumi = this.service.getCharacteristic(this.Characteristic.CurrentRelativeHumidity).value as number || 0;

    // Set humidifier as primary service
    this.service.setPrimaryService();

    // Configure active characteristic
    this.service.getCharacteristic(this.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    // Configure target state (humidifier only)
    this.service.getCharacteristic(this.Characteristic.TargetHumidifierDehumidifierState)
      .updateValue(1)
      .setProps({
        minValue: 1,
        maxValue: 1,
        validValues: [1],
      })
      .onGet(() => this.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER);

    // Configure current state
    this.service.getCharacteristic(this.Characteristic.CurrentHumidifierDehumidifierState)
      .onGet(this.getCurrentState.bind(this));

    // Configure current relative humidity
    this.service.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
      .onGet(this.getCurrentHumidity.bind(this));

    // Configure humidity threshold
    this.service.getCharacteristic(this.Characteristic.RelativeHumidityHumidifierThreshold)
      .updateValue(this.cacheTarget)
      .onSet(this.setTargetHumidity.bind(this));

    // Initialize cache states
    this.cacheState = this.service.getCharacteristic(this.Characteristic.Active).value === 1 ? 'on' : 'off';
    this.cacheHumid = this.cacheState === 'on' &&
      this.service.getCharacteristic(this.Characteristic.CurrentHumidifierDehumidifierState).value === 2
      ? 'on'
      : 'off';

    // Set up polling interval
    if (platform.config.mode !== 'lan') {
      this.setupPollingInterval(() => this.requestUpdate());
    }

    // Set initial state
    this.updateState(this.deviceParams);
  }

  /**
   * Get active state
   */
  private async getActive(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.cacheState === 'on'
        ? this.Characteristic.Active.ACTIVE
        : this.Characteristic.Active.INACTIVE;
    }, 'Active');
  }

  /**
   * Set active state
   */
  private async setActive(value: CharacteristicValue): Promise<void> {
    await this.handleSet(value as number, 'Active', async (active) => {
      const params: DeviceParams = { deviceType: 'normal' };
      let newState: 'on' | 'off';
      let newHumid: 'on' | 'off';

      if (active === 0) {
        // Turning off
        params.mainSwitch = 'off';
        params.switch = 'off';
        newState = 'off';
        newHumid = 'off';
      } else if (this.cacheHumi < this.cacheTarget) {
        // Humidity below target, turn on humidifier
        params.mainSwitch = 'on';
        params.switch = 'on';
        newState = 'on';
        newHumid = 'on';
      } else {
        // Humidity at or above target, turn off humidifier
        params.mainSwitch = 'off';
        params.switch = 'off';
        newState = 'on';
        newHumid = 'off';
      }

      if (newState !== this.cacheState) {
        this.cacheState = newState;
        this.logDebug(`Humidifier state: ${this.cacheState}`);
      }

      if (newHumid !== this.cacheHumid) {
        this.cacheHumid = newHumid;
        this.logDebug(`Humidifying: ${this.cacheHumid}`);
      }

      // Update current state
      const hapState = this.cacheHumid === 'on' ? 2 : 1;
      this.service.updateCharacteristic(
        this.Characteristic.CurrentHumidifierDehumidifierState,
        active === 1 ? hapState : 0,
      );

      // Only send update if needed
      if ((active === 0 && this.cacheHumid === 'on') || (active === 1 && newHumid === 'on')) {
        return await this.sendCommand(params);
      }
      return true;
    });
  }

  /**
   * Get current state
   */
  private async getCurrentState(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      if (this.cacheState === 'off') {
        return this.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
      }
      return this.cacheHumid === 'on'
        ? this.Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING
        : this.Characteristic.CurrentHumidifierDehumidifierState.IDLE;
    }, 'CurrentHumidifierDehumidifierState');
  }

  /**
   * Set target humidity
   */
  private async setTargetHumidity(value: CharacteristicValue): Promise<void> {
    const target = value as number;

    if (target === this.cacheTarget) {
      return;
    }

    this.cacheTarget = target;
    this.accessory.context.cacheTarget = target;
    this.logDebug(`Target humidity: ${target}%`);

    if (this.cacheState === 'off') {
      return;
    }

    // Update humidifying state based on new target
    await this.updateHumidifyingState();
  }

  /**
   * Get current temperature
   */
  private async getCurrentTemperature(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.cacheTemp;
    }, 'CurrentTemperature');
  }

  /**
   * Get current humidity
   */
  private async getCurrentHumidity(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.cacheHumi;
    }, 'CurrentRelativeHumidity');
  }

  /**
   * Update humidifying state based on current humidity vs target
   */
  private async updateHumidifyingState(): Promise<void> {
    try {
      if (this.cacheState === 'off') {
        return;
      }

      const params: DeviceParams = { deviceType: 'normal' };
      let newHumid: 'on' | 'off';

      if (this.cacheHumi < this.cacheTarget) {
        params.mainSwitch = 'on';
        params.switch = 'on';
        newHumid = 'on';
      } else {
        params.mainSwitch = 'off';
        params.switch = 'off';
        newHumid = 'off';
      }

      if (newHumid === this.cacheHumid) {
        return;
      }

      await this.sendCommand(params);
      this.cacheHumid = newHumid;
      this.logDebug(`Humidifying: ${this.cacheHumid}`);

      this.service.updateCharacteristic(
        this.Characteristic.CurrentHumidifierDehumidifierState,
        this.cacheHumid === 'on' ? 2 : 1,
      );
    } catch (err) {
      this.logError('Failed to update humidifying state', err);
    }
  }

  /**
   * Request temperature/humidity update from device
   */
  private async requestUpdate(): Promise<void> {
    try {
      await this.sendCommand({ uiActive: POLLING.UI_ACTIVE_DURATION_S });
    } catch {
      // Suppress errors for polling
    }
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    // Update temperature
    if (params.currentTemperature !== undefined && params.currentTemperature !== 'unavailable') {
      let newTemp = DeviceValueParser.parseTemperature(this.deviceParams);
      if (this.tempOffsetFactor) {
        newTemp *= this.tempOffset;
      } else {
        newTemp += this.tempOffset;
      }

      if (newTemp !== this.cacheTemp) {
        this.cacheTemp = newTemp;
        if (this.tempService) {
          this.tempService.updateCharacteristic(this.Characteristic.CurrentTemperature, this.cacheTemp);
        }
        this.logDebug(`Temperature: ${this.cacheTemp}°C`);
      }
    }

    // Update humidity
    if (params.currentHumidity !== undefined && params.currentHumidity !== 'unavailable') {
      let newHumi = DeviceValueParser.parseHumidity(this.deviceParams);
      if (this.humidityOffsetFactor) {
        newHumi *= this.humidityOffset;
      } else {
        newHumi += this.humidityOffset;
      }
      newHumi = Math.max(Math.min(Math.round(newHumi), 100), 0);

      if (newHumi !== this.cacheHumi) {
        this.cacheHumi = newHumi;
        this.service.updateCharacteristic(
          this.Characteristic.CurrentRelativeHumidity,
          this.cacheHumi,
        );
        this.logDebug(`Humidity: ${this.cacheHumi}%`);

        // Update humidifying state when humidity changes
        this.updateHumidifyingState();
      }
    }
  }
}
