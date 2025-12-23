import { PlatformAccessory, Service } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams } from '../types/index.js';
import { POLLING } from '../constants/timing-constants.js';

/**
 * SONOFF Mini (switch-man) Accessory
 * Stateless programmable switch with 6 channels (single, double, long press for each button)
 * Supports outlet 0-5 with key 0 (single), 1 (double), 2 (long)
 */
export class SwitchMiniAccessory extends BaseAccessory {
  /** Service instances for each channel */
  private readonly services: Map<number, Service> = new Map();

  /** Timeout tracking to prevent duplicate events */
  private readonly timeouts: Map<number, boolean> = new Map();

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Remove any existing switch service
    this.removeServiceIfExists(this.Service.Switch);

    // Add 6 stateless programmable switch services (Channel 1-6)
    for (let channel = 1; channel <= 6; channel++) {
      const serviceName = `Channel ${channel}`;
      const subtype = `channel${channel}`;

      let service = this.accessory.getService(serviceName);
      if (!service) {
        service = this.accessory.addService(
          this.Service.StatelessProgrammableSwitch,
          serviceName,
          subtype,
        );

        // Add ConfiguredName characteristic
        if (!service.testCharacteristic(this.Characteristic.ConfiguredName)) {
          service.addCharacteristic(this.Characteristic.ConfiguredName);
        }
        service.updateCharacteristic(this.Characteristic.ConfiguredName, serviceName);

        // Add ServiceLabelIndex characteristic
        if (!service.testCharacteristic(this.Characteristic.ServiceLabelIndex)) {
          service.addCharacteristic(this.Characteristic.ServiceLabelIndex);
        }
        service.updateCharacteristic(this.Characteristic.ServiceLabelIndex, channel);
      }

      // Configure programmable switch event
      service.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent)
        .setProps({ validValues: [0, 1, 2] }); // 0 = single, 1 = double, 2 = long

      this.services.set(channel, service);
      this.timeouts.set(channel, false);
    }

    // Use first service as main service for base functionality
    this.service = this.services.get(1)!;

    this.logInfo('SONOFF Mini initialized with 6 programmable switch channels');
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    try {
      // Check for button press event
      const outlet = typeof params.outlet === 'number' ? params.outlet : null;
      const actionTime = typeof params.actionTime === 'string' ? params.actionTime : null;
      const key = typeof params.key === 'number' ? params.key : 0; // 0 = single, 1 = double, 2 = long

      if (
        outlet !== null
        && [0, 1, 2, 3, 4, 5].includes(outlet)
        && actionTime !== null
      ) {
        const channel = outlet + 1; // Convert outlet 0-5 to channel 1-6

        // Check if we should process this event (debounce)
        if (this.timeouts.get(channel)) {
          return;
        }

        // Set timeout to prevent duplicate events
        this.timeouts.set(channel, true);
        setTimeout(() => {
          this.timeouts.set(channel, false);
        }, POLLING.EVENT_DEBOUNCE_MS);

        // Check if event is recent
        const timeDiff = (new Date().getTime() - new Date(actionTime).getTime()) / 1000;
        if (timeDiff < POLLING.EVENT_FRESHNESS_S) {
          const service = this.services.get(channel);
          if (service) {
            service.updateCharacteristic(this.Characteristic.ProgrammableSwitchEvent, key);

            const eventType = key === 0 ? 'Single' : key === 1 ? 'Double' : 'Long';
            this.logInfo(`Channel ${channel}: ${eventType} press`);
          }
        }
      }
    } catch (err) {
      this.logError('Failed to update SONOFF Mini state', err);
    }
  }
}
