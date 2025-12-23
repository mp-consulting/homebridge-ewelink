import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import { EWeLinkPlatform } from '../../platform.js';
import { AccessoryContext, DeviceParams, SingleDeviceConfig, MultiDeviceConfig } from '../../types/index.js';
import { SwitchHelper } from '../../utils/switch-helper.js';
import { POLLING } from '../../constants/timing-constants.js';

/**
 * Cooler Simulation Accessory
 * Uses a switch to simulate a cooler, reading temperature from another device
 */
export class CoolerAccessory extends BaseAccessory {
  /** Channel index for multi-channel devices */
  private readonly channelIndex: number;

  /** Device configuration */
  private readonly deviceConfig?: SingleDeviceConfig | MultiDeviceConfig;

  /** Temperature source device ID */
  private readonly temperatureSource?: string;

  /** Cached temperature */
  private cacheTemp: number;

  /** Cached target temperature */
  private cacheTarget: number;

  /** Cached state */
  private cacheState: 'on' | 'off' = 'off';

  /** Cached cooling state */
  private cacheCool: 'on' | 'off' = 'off';

  /** Update interval */
  private intervalPoll?: NodeJS.Timeout;

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

    // Get temperature source
    this.temperatureSource = this.deviceConfig?.tempSource;

    // Set up the accessory with default target temp when added the first time
    if (!accessory.context.cacheTarget) {
      accessory.context.cacheTarget = 20;
    }

    // Check cache type
    if (accessory.context.cacheType !== 'cooler') {
      accessory.context.cacheType = 'cooler';
      accessory.context.cacheTarget = 20;
    }

    this.cacheTarget = accessory.context.cacheTarget as number;

    // Set up HeaterCooler service
    this.service = this.getOrAddService(this.Service.HeaterCooler);

    // Configure current temperature characteristic
    this.service.getCharacteristic(this.Characteristic.CurrentTemperature)
      .setProps({ minStep: 0.1 })
      .onGet(this.getCurrentTemperature.bind(this));

    this.cacheTemp = this.service.getCharacteristic(this.Characteristic.CurrentTemperature).value as number;

    // Configure active characteristic
    this.service.getCharacteristic(this.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    // Configure target state (cooling only)
    this.service.getCharacteristic(this.Characteristic.TargetHeaterCoolerState)
      .setProps({
        minValue: 2,
        maxValue: 2,
        validValues: [2],
      })
      .onGet(() => this.Characteristic.TargetHeaterCoolerState.COOL);

    // Configure current state
    this.service.getCharacteristic(this.Characteristic.CurrentHeaterCoolerState)
      .onGet(this.getCurrentState.bind(this));

    // Configure cooling threshold temperature
    this.service.getCharacteristic(this.Characteristic.CoolingThresholdTemperature)
      .updateValue(this.cacheTarget)
      .setProps({ minStep: 0.5 })
      .onSet(this.setTargetTemperature.bind(this));

    // Initialize cache states
    this.cacheState = this.service.getCharacteristic(this.Characteristic.Active).value === 1 ? 'on' : 'off';
    this.cacheCool = this.cacheState === 'on' &&
      this.service.getCharacteristic(this.Characteristic.CurrentHeaterCoolerState).value === 3
      ? 'on'
      : 'off';

    // Set up polling interval for temperature updates
    setTimeout(() => {
      this.updateTemperature();
      this.intervalPoll = setInterval(() => this.updateTemperature(), POLLING.UPDATE_INTERVAL_MS);
    }, POLLING.INITIAL_DELAY_MS);

    platform.api.on('shutdown', () => {
      if (this.intervalPoll) {
        clearInterval(this.intervalPoll);
      }
    });

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
      let newState: 'on' | 'off';
      let newCool: 'on' | 'off';

      if (active === 0) {
        newState = 'off';
        newCool = 'off';
      } else if (this.cacheTemp > this.cacheTarget) {
        newState = 'on';
        newCool = 'on';
      } else {
        newState = 'on';
        newCool = 'off';
      }

      if (newState !== this.cacheState) {
        this.cacheState = newState;
        this.logDebug(`Cooler state: ${this.cacheState}`);
      }

      if (newCool !== this.cacheCool) {
        this.cacheCool = newCool;
        this.logDebug(`Cooling: ${this.cacheCool}`);
      }

      // Update current state
      const hapState = this.cacheCool === 'on' ? 3 : 1;
      this.service.updateCharacteristic(
        this.Characteristic.CurrentHeaterCoolerState,
        active === 1 ? hapState : 0,
      );

      // Only send update if needed
      if ((active === 0 && this.cacheCool === 'on') || (active === 1 && newCool === 'on')) {
        const params = SwitchHelper.buildSwitchParams(this.deviceParams, this.channelIndex, newCool === 'on');
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
        return this.Characteristic.CurrentHeaterCoolerState.INACTIVE;
      }
      return this.cacheCool === 'on'
        ? this.Characteristic.CurrentHeaterCoolerState.COOLING
        : this.Characteristic.CurrentHeaterCoolerState.IDLE;
    }, 'CurrentHeaterCoolerState');
  }

  /**
   * Set target temperature
   */
  private async setTargetTemperature(value: CharacteristicValue): Promise<void> {
    const target = value as number;

    if (target === this.cacheTarget) {
      return;
    }

    this.cacheTarget = target;
    this.accessory.context.cacheTarget = target;
    this.logDebug(`Target temperature: ${target}°C`);

    if (this.cacheState === 'off') {
      return;
    }

    // Update cooling state based on new target
    await this.updateCoolingState();
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
   * Update cooling state based on current temperature vs target
   */
  private async updateCoolingState(): Promise<void> {
    try {
      if (this.cacheState === 'off') {
        return;
      }

      let newCool: 'on' | 'off';

      if (this.cacheTemp > this.cacheTarget) {
        newCool = 'on';
      } else {
        newCool = 'off';
      }

      if (newCool === this.cacheCool) {
        return;
      }

      const params = SwitchHelper.buildSwitchParams(this.deviceParams, this.channelIndex, newCool === 'on');
      await this.sendCommand(params);

      this.cacheCool = newCool;
      this.logDebug(`Cooling: ${this.cacheCool}`);

      this.service.updateCharacteristic(
        this.Characteristic.CurrentHeaterCoolerState,
        this.cacheCool === 'on' ? 3 : 1,
      );
    } catch (err) {
      this.logError('Failed to update cooling state', err);
    }
  }

  /**
   * Update temperature from platform cache (reads from another device's cached temp)
   */
  private async updateTemperature(): Promise<void> {
    try {
      if (!this.temperatureSource) {
        return;
      }

      // Read temperature from platform cache (set by temperature-capable devices)
      const newTemp = this.platform.getDeviceTemperature(this.temperatureSource);
      if (newTemp !== undefined && newTemp !== this.cacheTemp) {
        this.cacheTemp = newTemp;
        this.service.updateCharacteristic(this.Characteristic.CurrentTemperature, this.cacheTemp);
        this.logDebug(`Temperature: ${this.cacheTemp}°C`);

        // Update cooling state when temperature changes
        await this.updateCoolingState();
      }
    } catch {
      // Suppress errors for polling
    }
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    // Update switch state
    const isOn = SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);
    const active = this.cacheState === 'on' ? 1 : 0;

    this.service.updateCharacteristic(this.Characteristic.Active, active);
    this.service.updateCharacteristic(
      this.Characteristic.CurrentHeaterCoolerState,
      active === 1 ? (isOn ? 3 : 1) : 0,
    );
  }
}
