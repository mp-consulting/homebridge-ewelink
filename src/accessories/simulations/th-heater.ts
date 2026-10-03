import type { PlatformAccessory } from 'homebridge';
import type { EWeLinkPlatform } from '../../platform.js';
import type { AccessoryContext } from '../../types/index.js';
import { THClimateAccessory } from './shared/th-climate.js';

/**
 * TH Heater Simulation Accessory
 * Uses a TH sensor to control a heater switch based on temperature thresholds
 */
export class THHeaterAccessory extends THClimateAccessory {
  constructor(platform: EWeLinkPlatform, accessory: PlatformAccessory<AccessoryContext>) {
    super(platform, accessory, 'heat');
  }
}
