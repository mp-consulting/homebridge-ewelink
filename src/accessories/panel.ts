import { PlatformAccessory, CharacteristicValue, Service } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams } from '../types/index.js';
import { DeviceValueParser } from '../utils/device-parsers.js';
import { isNSPanelPro } from '../constants/device-constants.js';

/**
 * Panel Accessory (UIID 133, 195 - NSPanel, NSPanel Pro)
 * Provides Temperature Sensor + dual Switch services for panel buttons
 */
export class PanelAccessory extends BaseAccessory {
  private tempService!: Service;
  private service1?: Service;
  private service2?: Service;

  private cacheTemp = 20;
  private cacheState1: 'on' | 'off' = 'off';
  private cacheState2: 'on' | 'off' = 'off';

  // Temperature offset configuration
  private tempOffset: number;
  private tempOffsetFactor?: number;

  // NSPanel Pro variant
  private isProPanel: boolean;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Check if this is NSPanel Pro variant
    this.isProPanel = isNSPanelPro(this.accessory.context.device?.extra?.uiid || 0);

    // Get device-specific configuration
    const deviceConfig = this.platform.config.singleDevices?.find(
      d => d.deviceId === this.deviceId,
    );

    this.tempOffset = deviceConfig?.offset || 0;
    this.tempOffsetFactor = deviceConfig?.offsetFactor;

    // Set up the temperature sensor service
    this.tempService = this.getOrAddService(this.Service.TemperatureSensor);

    // Configure temperature characteristic
    this.tempService.getCharacteristic(this.Characteristic.CurrentTemperature)
      .setProps({ minStep: 0.1 })
      .onGet(this.getCurrentTemperature.bind(this));

    // Set the main service
    this.service = this.tempService;

    // Add switch services for non-Pro panels (standard NSPanel has 2 channels)
    if (!this.isProPanel) {
      this.service1 = this.accessory.getService('Channel 1') ||
        this.accessory.addService(this.Service.Switch, 'Channel 1', 'channel1');
      this.service2 = this.accessory.getService('Channel 2') ||
        this.accessory.addService(this.Service.Switch, 'Channel 2', 'channel2');

      // Configure channel 1
      this.service1.getCharacteristic(this.Characteristic.On)
        .onGet(() => this.getChannelState(1))
        .onSet((value) => this.setChannelState(1, value));

      // Configure channel 2
      this.service2.getCharacteristic(this.Characteristic.On)
        .onGet(() => this.getChannelState(2))
        .onSet((value) => this.setChannelState(2, value));
    }

    // Initialize from device params
    this.initializeFromParams();
  }

  /**
   * Initialize state from device params
   */
  private initializeFromParams(): void {
    // Temperature
    if (DeviceValueParser.hasTemperature(this.deviceParams)) {
      let temp = DeviceValueParser.parseTemperature(this.deviceParams);
      if (this.tempOffsetFactor) {
        temp *= this.tempOffsetFactor;
      }
      temp += this.tempOffset;
      this.cacheTemp = Math.round(temp * 10) / 10;
      this.tempService.updateCharacteristic(this.Characteristic.CurrentTemperature, this.cacheTemp);
    }

    // Switch states (for non-Pro panels)
    if (!this.isProPanel && this.deviceParams.switches) {
      const switches = this.deviceParams.switches as Array<{ outlet: number; switch: string }>;
      switches.forEach((sw) => {
        if (sw.outlet === 0) {
          this.cacheState1 = sw.switch as 'on' | 'off';
          this.service1?.updateCharacteristic(this.Characteristic.On, this.cacheState1 === 'on');
        } else if (sw.outlet === 1) {
          this.cacheState2 = sw.switch as 'on' | 'off';
          this.service2?.updateCharacteristic(this.Characteristic.On, this.cacheState2 === 'on');
        }
      });
    }
  }

  /**
   * Get current temperature
   */
  private async getCurrentTemperature(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.cacheTemp, 'CurrentTemperature');
  }

  /**
   * Get channel state
   */
  private async getChannelState(channel: 1 | 2): Promise<CharacteristicValue> {
    return this.handleGet(
      () => channel === 1 ? this.cacheState1 === 'on' : this.cacheState2 === 'on',
      `Channel ${channel} State`,
    );
  }

  /**
   * Set channel state
   */
  private async setChannelState(channel: 1 | 2, value: CharacteristicValue): Promise<void> {
    const newState: 'on' | 'off' = value ? 'on' : 'off';
    const currentState = channel === 1 ? this.cacheState1 : this.cacheState2;

    if (newState === currentState) {
      return;
    }

    this.logInfo(`Setting channel ${channel} to ${newState}`);

    const params = {
      switches: [
        {
          outlet: channel - 1,
          switch: newState,
        },
      ],
    };

    const success = await this.sendCommand(params);

    if (!success) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    if (channel === 1) {
      this.cacheState1 = newState;
    } else {
      this.cacheState2 = newState;
    }
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    // Update local cache
    Object.assign(this.deviceParams, params);

    // Update temperature
    if (DeviceValueParser.hasTemperature(params)) {
      let temp = DeviceValueParser.parseTemperature(params);
      if (this.tempOffsetFactor) {
        temp *= this.tempOffsetFactor;
      }
      temp += this.tempOffset;
      const newTemp = Math.round(temp * 10) / 10;

      if (newTemp !== this.cacheTemp) {
        this.cacheTemp = newTemp;
        this.tempService.updateCharacteristic(this.Characteristic.CurrentTemperature, this.cacheTemp);
        this.logDebug(`Temperature updated to ${this.cacheTemp}°C`);
      }
    }

    // Update switch states
    if (!this.isProPanel && params.switches) {
      const switches = params.switches as Array<{ outlet: number; switch: string }>;
      switches.forEach((sw) => {
        const newState = sw.switch as 'on' | 'off';

        if (sw.outlet === 0 && newState !== this.cacheState1) {
          this.cacheState1 = newState;
          this.service1?.updateCharacteristic(this.Characteristic.On, this.cacheState1 === 'on');
          this.logDebug(`Channel 1 updated to ${this.cacheState1}`);
        } else if (sw.outlet === 1 && newState !== this.cacheState2) {
          this.cacheState2 = newState;
          this.service2?.updateCharacteristic(this.Characteristic.On, this.cacheState2 === 'on');
          this.logDebug(`Channel 2 updated to ${this.cacheState2}`);
        }
      });
    }
  }
}
