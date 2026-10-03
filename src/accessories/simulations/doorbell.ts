import type { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import type { EWeLinkPlatform } from '../../platform.js';
import type { AccessoryContext, DeviceParams } from '../../types/index.js';
import { SwitchHelper } from '../../utils/switch-helper.js';
import { isDualR3Device } from '../../constants/device-catalog.js';
import { SIMULATION_TIMING } from '../../constants/timing-constants.js';

/**
 * Doorbell Simulation Accessory
 * Uses a switch to simulate a doorbell - triggers on switch on events
 */
export class DoorbellAccessory extends BaseAccessory {
  /** Channel index for multi-channel devices */
  private readonly channelIndex: number;

  /** Prevents duplicate triggers */
  private inUse = false;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    this.channelIndex = accessory.context.channelIndex || 0;

    // Remove any existing switch service
    this.removeServiceIfExists(this.Service.Switch);

    // Set up Doorbell service
    this.service = this.getOrAddService(this.Service.Doorbell);

    // Configure programmable switch event (read-only)
    this.service.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent)
      .onGet(this.getProgrammableSwitchEvent.bind(this));

    // DUALR3 devices only report fresh state while uiActive is requested
    if (isDualR3Device(this.device.extra?.uiid || 0) && platform.config.mode !== 'lan') {
      this.setupUiActivePolling(this.channelIndex);
    }

    // Set initial state (default to 0)
    this.service.updateCharacteristic(this.Characteristic.ProgrammableSwitchEvent, 0);
  }

  /**
   * Get programmable switch event (doorbell)
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

    // Trigger doorbell event when switch turns on
    if (!this.inUse) {
      const isOn = SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);
      if (isOn) {
        this.inUse = true;
        this.setTrackedTimeout(() => {
          this.inUse = false;
        }, SIMULATION_TIMING.POSITION_CLEANUP_MS);

        this.service.updateCharacteristic(this.Characteristic.ProgrammableSwitchEvent, 0);
        this.logInfo('Doorbell pressed');
      }
    }
  }
}
