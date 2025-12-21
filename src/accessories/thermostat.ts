import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams, ThermostatDeviceConfig } from '../types/index.js';

/**
 * Thermostat Accessory (UIID 127)
 * For controllable thermostats with heating control
 */
export class ThermostatAccessory extends BaseAccessory {
  /** Thermostat service */
  private thermostatService?: ReturnType<typeof this.getOrAddService>;

  /** Device config */
  private readonly deviceConfig?: ThermostatDeviceConfig;

  /** Temperature offset */
  private readonly tempOffset: number;

  /** Cached current temperature */
  private cacheTemp = 20;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Get device-specific config
    this.deviceConfig = platform.config.thDevices?.find(
      d => d.deviceId === this.deviceId,
    );

    this.tempOffset = this.deviceConfig?.tempOffset || 0;

    // Set up thermostat service
    this.thermostatService = this.getOrAddService(
      this.Service.Thermostat,
    );

    // Configure current temperature characteristic
    this.thermostatService.getCharacteristic(this.Characteristic.CurrentTemperature)
      .setProps({
        minStep: 0.1,
      })
      .onGet(this.getCurrentTemperature.bind(this));

    // Configure target heating/cooling state characteristic
    this.thermostatService.getCharacteristic(this.Characteristic.TargetHeatingCoolingState)
      .setProps({
        minValue: 0,
        maxValue: 1,
        validValues: [0, 1], // 0=OFF, 1=HEAT
      })
      .onSet(this.setTargetHeatingCoolingState.bind(this));

    // Configure target temperature characteristic
    this.thermostatService.getCharacteristic(this.Characteristic.TargetTemperature)
      .setProps({
        minValue: 5,
        maxValue: 45,
        minStep: 0.5,
      })
      .onSet(this.setTargetTemperature.bind(this));

    // Set the main service
    this.service = this.thermostatService;

    // Set initial state
    this.updateState(this.deviceParams);
  }

  /**
   * Get current temperature
   */
  private async getCurrentTemperature(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      let temp = this.parseTemperature();

      // Apply offset if configured
      if (this.tempOffset) {
        temp += this.tempOffset;
      }

      // Cache the temperature
      this.cacheTemp = temp;

      // Clamp to valid range (-270 to 100)
      return this.clamp(temp, -270, 100);
    }, 'CurrentTemperature');
  }

  /**
   * Set target heating/cooling state
   */
  private async setTargetHeatingCoolingState(value: CharacteristicValue): Promise<void> {
    await this.handleSet(value, 'TargetHeatingCoolingState', async (val) => {
      const newState = val === 1 ? 'on' : 'off';

      // Update device via API
      const success = await this.sendCommand({
        switch: newState,
        deviceType: 'normal',
      });

      if (success) {
        this.logInfo(`Set heating state: ${newState}`);
      }
      return success;
    });
  }

  /**
   * Set target temperature
   */
  private async setTargetTemperature(value: CharacteristicValue): Promise<void> {
    await this.handleSet(value, 'TargetTemperature', async (val) => {
      const targetTemp = Number(val);

      // Clamp to valid range
      const clampedTemp = this.clamp(targetTemp, 5, 45);

      // Update device via API
      const success = await this.sendCommand({
        targetTemp: clampedTemp,
        tempScale: 'c', // Force Celsius mode
      });

      if (success) {
        this.logInfo(`Set target temperature: ${clampedTemp}°C`);
      }
      return success;
    });
  }

  /**
   * Parse temperature from device params
   */
  private parseTemperature(): number {
    // Temperature field in device params
    if (this.deviceParams.temperature !== undefined) {
      const temp = parseFloat(String(this.deviceParams.temperature));
      return isNaN(temp) ? this.cacheTemp : temp;
    }

    if (this.deviceParams.currentTemperature !== undefined) {
      const temp = parseFloat(String(this.deviceParams.currentTemperature));
      // Some devices send temperature * 100
      return isNaN(temp) ? this.cacheTemp : (temp > 1000 ? temp / 100 : temp);
    }

    return this.cacheTemp; // Return cached value if no update
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    Object.assign(this.deviceParams, params);

    if (!this.thermostatService) return;

    // Update current temperature
    if (params.temperature !== undefined || params.currentTemperature !== undefined) {
      let temp = this.parseTemperature();
      if (this.tempOffset) {
        temp += this.tempOffset;
      }
      temp = this.clamp(temp, -270, 100);

      this.thermostatService.updateCharacteristic(
        this.Characteristic.CurrentTemperature,
        temp,
      );
      this.logDebug(`Current temperature updated: ${temp}°C`);
    }

    // Update target temperature
    if (params.targetTemp !== undefined) {
      const targetTemp = this.clamp(parseFloat(String(params.targetTemp)), 5, 45);
      this.thermostatService.updateCharacteristic(
        this.Characteristic.TargetTemperature,
        targetTemp,
      );
      this.logDebug(`Target temperature updated: ${targetTemp}°C`);
    }

    // Update heating/cooling state
    if (params.switch !== undefined) {
      const state = params.switch === 'on' ? 1 : 0;
      this.thermostatService.updateCharacteristic(
        this.Characteristic.TargetHeatingCoolingState,
        state,
      );
      this.thermostatService.updateCharacteristic(
        this.Characteristic.CurrentHeatingCoolingState,
        state,
      );
      this.logDebug(`Heating state updated: ${params.switch}`);
    }

    // Update work state (heating indicator)
    if (params.workState !== undefined) {
      // workState: 1=heating, 2=auto
      const currentState = params.workState === 1 ? 1 : 0;
      this.thermostatService.updateCharacteristic(
        this.Characteristic.CurrentHeatingCoolingState,
        currentState,
      );
      this.logDebug(`Work state updated: ${params.workState} (current state: ${currentState})`);
    }
  }
}
