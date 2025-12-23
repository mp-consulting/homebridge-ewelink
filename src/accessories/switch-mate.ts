import { PlatformAccessory } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams } from '../types/index.js';
import { POLLING } from '../constants/timing-constants.js';

/**
 * SONOFF Mate (switch-mate) Accessory
 * Stateless programmable switch with 3 button modes
 * Supports outlet 0 (single), 1 (double), 2 (long press)
 */
export class SwitchMateAccessory extends BaseAccessory {
  /** Timeout tracking to prevent duplicate events */
  private readonly timeouts: Map<number, boolean> = new Map();

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Remove any existing switch service
    this.removeServiceIfExists(this.Service.Switch);

    // Add single stateless programmable switch service
    this.service = this.getOrAddService(this.Service.StatelessProgrammableSwitch);

    // Configure programmable switch event to support all 3 button types
    this.service.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent)
      .setProps({ validValues: [0, 1, 2] }); // 0 = single, 1 = double, 2 = long

    // Initialize timeouts for each button type
    this.timeouts.set(0, false); // Single press
    this.timeouts.set(1, false); // Double press
    this.timeouts.set(2, false); // Long press

    this.logInfo('SONOFF Mate initialized with programmable switch (single/double/long press)');
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

      if (
        outlet !== null
        && [0, 1, 2].includes(outlet)
        && actionTime !== null
      ) {
        // Check if we should process this event (debounce)
        if (this.timeouts.get(outlet)) {
          return;
        }

        // Set timeout to prevent duplicate events
        this.timeouts.set(outlet, true);
        setTimeout(() => {
          this.timeouts.set(outlet, false);
        }, POLLING.EVENT_DEBOUNCE_MS);

        // Check if event is recent
        const timeDiff = (new Date().getTime() - new Date(actionTime).getTime()) / 1000;
        if (timeDiff < POLLING.EVENT_FRESHNESS_S) {
          this.service.updateCharacteristic(this.Characteristic.ProgrammableSwitchEvent, outlet);

          const eventType = outlet === 0 ? 'Single' : outlet === 1 ? 'Double' : 'Long';
          this.logInfo(`Button press: ${eventType}`);
        }
      }
    } catch (err) {
      this.logError('Failed to update SONOFF Mate state', err);
    }
  }
}
