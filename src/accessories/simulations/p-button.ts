import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import { EWeLinkPlatform } from '../../platform.js';
import { AccessoryContext, DeviceParams, SingleDeviceConfig, MultiDeviceConfig } from '../../types/index.js';
import { SwitchHelper } from '../../utils/switch-helper.js';
import { EVE_CHARACTERISTIC_UUIDS } from '../../utils/eve-characteristics.js';
import { POWER_DIVISOR, VOLTAGE_DIVISOR, CURRENT_DIVISOR } from '../../constants/device-constants.js';
import { POLLING, SIMULATION_TIMING } from '../../constants/timing-constants.js';

/**
 * Programmable Button Simulation Accessory
 * Uses a switch to simulate a stateless programmable button (single press only)
 */
export class ProgrammableButtonAccessory extends BaseAccessory {
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

  /** Prevents duplicate triggers */
  private inUse = false;

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

    // Remove any existing switch service
    this.removeServiceIfExists(this.Service.Switch);

    // Set up StatelessProgrammableSwitch service
    this.service = this.getOrAddService(this.Service.StatelessProgrammableSwitch);

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

    // Configure programmable switch event (single press only)
    this.service.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent)
      .setProps({ validValues: [0] }) // 0 = single press
      .onGet(this.getProgrammableSwitchEvent.bind(this));

    // Set up polling interval for power updates
    if (this.powerReadings && (!this.isDualR3 || platform.config.mode !== 'lan')) {
      setTimeout(() => {
        this.requestUpdate();
        this.intervalPoll = setInterval(() => this.requestUpdate(), POLLING.UPDATE_INTERVAL_MS);
      }, POLLING.INITIAL_DELAY_MS);

      platform.api.on('shutdown', () => {
        if (this.intervalPoll) {
          clearInterval(this.intervalPoll);
        }
      });
    }

    // Set initial state (default to 0)
    this.service.updateCharacteristic(this.Characteristic.ProgrammableSwitchEvent, 0);
  }

  /**
   * Get programmable switch event
   */
  private async getProgrammableSwitchEvent(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.service.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent).value as number;
    }, 'ProgrammableSwitchEvent');
  }

  /**
   * Request power update from device
   */
  private async requestUpdate(): Promise<void> {
    try {
      if (this.isDualR3) {
        await this.sendCommand({ uiActive: { outlet: this.channelIndex, time: POLLING.UI_ACTIVE_DURATION_S } });
      } else {
        await this.sendCommand({ uiActive: POLLING.UI_ACTIVE_DURATION_S });
      }
    } catch {
      // Suppress errors for polling
    }
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    Object.assign(this.deviceParams, params);

    // Trigger button event when switch turns on
    if (!this.inUse) {
      const isOn = SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);
      if (isOn) {
        this.inUse = true;
        setTimeout(() => {
          this.inUse = false;
        }, SIMULATION_TIMING.POSITION_CLEANUP_MS);

        this.service.updateCharacteristic(this.Characteristic.ProgrammableSwitchEvent, 0);
        this.logInfo('Button pressed');
      }
    }

    // Update power readings if supported
    if (!this.powerReadings) {
      return;
    }

    // Update power
    if (params.actPow_00 !== undefined) {
      const power = parseInt(String(params.actPow_00), 10) / POWER_DIVISOR;
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
      const voltage = parseInt(String(params.voltage_00), 10) / VOLTAGE_DIVISOR;
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage, voltage);
      this.logDebug(`Voltage: ${voltage}V`);
    } else if (params.voltage !== undefined) {
      const voltage = parseFloat(String(params.voltage));
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage, voltage);
      this.logDebug(`Voltage: ${voltage}V`);
    }

    // Update current
    if (params.current_00 !== undefined) {
      const current = parseInt(String(params.current_00), 10) / CURRENT_DIVISOR;
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent, current);
      this.logDebug(`Current: ${current}A`);
    } else if (params.current !== undefined) {
      const current = parseFloat(String(params.current));
      this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent, current);
      this.logDebug(`Current: ${current}A`);
    }
  }
}
