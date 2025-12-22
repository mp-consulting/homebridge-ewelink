import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import { EWeLinkPlatform } from '../../platform.js';
import { AccessoryContext, DeviceParams, SingleDeviceConfig, MultiDeviceConfig } from '../../types/index.js';
import { SwitchHelper } from '../../utils/switch-helper.js';
import { EVE_CHARACTERISTIC_UUIDS } from '../../utils/eve-characteristics.js';

/**
 * TV Simulation Accessory
 * Uses a switch to simulate a TV (audio/video receiver, streaming box, etc.)
 */
export class TVAccessory extends BaseAccessory {
  /** Channel index for multi-channel devices */
  private readonly channelIndex: number;

  /** Device configuration */
  private readonly deviceConfig?: SingleDeviceConfig | MultiDeviceConfig;

  /** Supports power monitoring */
  private readonly powerReadings: boolean;

  /** Has full power readings (voltage/current) */
  private readonly hasFullPowerReadings: boolean;

  /** Is Dual R3 device */
  private readonly isDualR3: boolean;

  /** Cached state */
  private cacheState: 'on' | 'off' = 'off';

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

    // Determine power monitoring capabilities
    const uiid = this.device.extra?.uiid || 0;
    this.powerReadings = [5, 32, 126, 165, 182, 190].includes(uiid);
    this.hasFullPowerReadings = [32, 126, 165, 182, 190].includes(uiid);
    this.isDualR3 = [126, 165].includes(uiid);

    // Set up Television service
    this.service = this.getOrAddService(this.Service.Television);

    // Add power monitoring characteristics if supported
    if (this.powerReadings) {
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
    }

    // Configure active characteristic
    this.service.getCharacteristic(this.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    // Initialize cache state
    this.cacheState = this.service.getCharacteristic(this.Characteristic.Active).value === 1 ? 'on' : 'off';

    // Set up polling interval for power updates
    if (this.powerReadings && (!this.isDualR3 || platform.config.mode !== 'lan')) {
      setTimeout(() => {
        this.requestUpdate();
        this.intervalPoll = setInterval(() => this.requestUpdate(), 120000);
      }, 5000);

      platform.api.on('shutdown', () => {
        if (this.intervalPoll) {
          clearInterval(this.intervalPoll);
        }
      });
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
      const on = active === 1;
      this.cacheState = on ? 'on' : 'off';

      this.logDebug(`TV: ${this.cacheState}`);

      const params = SwitchHelper.buildSwitchParams(this.deviceParams, this.channelIndex, on);
      return await this.sendCommand(params);
    });
  }

  /**
   * Request power update from device
   */
  private async requestUpdate(): Promise<void> {
    try {
      if (this.isDualR3) {
        await this.sendCommand({ uiActive: { outlet: this.channelIndex, time: 120 } });
      } else {
        await this.sendCommand({ uiActive: 120 });
      }
    } catch (err) {
      // Suppress errors for polling
    }
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    Object.assign(this.deviceParams, params);

    // Update switch state
    const isOn = SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);

    if (isOn !== (this.cacheState === 'on')) {
      this.cacheState = isOn ? 'on' : 'off';
      this.service.updateCharacteristic(this.Characteristic.Active, isOn ? 1 : 0);
      this.logDebug(`TV state updated: ${this.cacheState}`);
    }

    // Update power readings if supported
    if (!this.powerReadings) {
      return;
    }

    
    
    

    // Update power
    if (params.actPow_00 !== undefined) {
      const power = parseInt(String(params.actPow_00), 10) / 100;
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption, power);
      this.logDebug(`Power: ${power}W`);
    } else if (params.power !== undefined) {
      const power = parseFloat(String(params.power));
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption, power);
      this.logDebug(`Power: ${power}W`);
    }

    if (!this.hasFullPowerReadings) {
      return;
    }

    // Update voltage
    if (params.voltage_00 !== undefined) {
      const voltage = parseInt(String(params.voltage_00), 10) / 100;
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage, voltage);
      this.logDebug(`Voltage: ${voltage}V`);
    } else if (params.voltage !== undefined) {
      const voltage = parseFloat(String(params.voltage));
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage, voltage);
      this.logDebug(`Voltage: ${voltage}V`);
    }

    // Update current
    if (params.current_00 !== undefined) {
      const current = parseInt(String(params.current_00), 10) / 100;
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent, current);
      this.logDebug(`Current: ${current}A`);
    } else if (params.current !== undefined) {
      const current = parseFloat(String(params.current));
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent, current);
      this.logDebug(`Current: ${current}A`);
    }
  }
}
