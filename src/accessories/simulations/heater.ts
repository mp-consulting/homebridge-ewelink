import type { PlatformAccessory } from 'homebridge';
import type { EWeLinkPlatform } from '../../platform.js';
import type { AccessoryContext } from '../../types/index.js';
import { SwitchClimateAccessory } from './shared/switch-climate.js';

/**
 * Heater Simulation Accessory
 * Uses a switch to simulate a heater, reading temperature from another device
 */
export class HeaterAccessory extends SwitchClimateAccessory {
  constructor(platform: EWeLinkPlatform, accessory: PlatformAccessory<AccessoryContext>) {
    super(platform, accessory, 'heat');
  }
}
