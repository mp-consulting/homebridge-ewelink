import type { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import type { EWeLinkPlatform } from '../../platform.js';
import type { AccessoryContext, DeviceParams } from '../../types/index.js';
import { SwitchHelper } from '../../utils/switch-helper.js';
import { SIMULATION_TIMING } from '../../constants/timing-constants.js';
import { getChannelPower } from './shared/channel-power.js';
import type { ChannelPower } from './shared/channel-power.js';

/**
 * Programmable Button Simulation Accessory
 * Uses a switch to simulate a stateless programmable button (single press only)
 */
export class ProgrammableButtonAccessory extends BaseAccessory {
  /** Channel index for multi-channel devices */
  private readonly channelIndex: number;

  /** Power monitoring capabilities */
  private readonly power: ChannelPower;

  /** Prevents duplicate triggers */
  private inUse = false;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    this.channelIndex = accessory.context.channelIndex || 0;
    this.power = getChannelPower(this.device.extra?.uiid || 0, this.channelIndex);

    // Remove any existing switch service
    this.removeServiceIfExists(this.Service.Switch);

    // Set up StatelessProgrammableSwitch service
    this.service = this.getOrAddService(this.Service.StatelessProgrammableSwitch);

    if (this.power.enabled) {
      this.setupPowerMonitoringCharacteristics(this.service, this.power.fullReadings);
      if (!this.power.isDualR3 || platform.config.mode !== 'lan') {
        this.setupUiActivePolling(this.power.uiActiveOutlet);
      }
    }

    // Configure programmable switch event (single press only)
    this.service.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent)
      .setProps({ validValues: [0] }) // 0 = single press
      .onGet(this.getProgrammableSwitchEvent.bind(this));

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
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    // Trigger button event when switch turns on
    if (!this.inUse) {
      const isOn = SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);
      if (isOn) {
        this.inUse = true;
        this.setTrackedTimeout(() => {
          this.inUse = false;
        }, SIMULATION_TIMING.POSITION_CLEANUP_MS);

        this.service.updateCharacteristic(this.Characteristic.ProgrammableSwitchEvent, 0);
        this.logInfo('Button pressed');
      }
    }

    if (this.power.enabled) {
      this.updateDualR3PowerReadings(this.service, params, {
        suffix: this.power.suffix,
        fullReadings: this.power.fullReadings,
      });
    }
  }
}
