import type { PlatformAccessory } from 'homebridge';
import type { EWeLinkPlatform } from '../../platform.js';
import type { AccessoryContext } from '../../types/index.js';
import { THClimateAccessory } from './shared/th-climate.js';

/**
 * TH Dehumidifier Simulation Accessory
 * Uses a TH sensor to control a dehumidifier switch based on humidity thresholds
 */
export class THDehumidifierAccessory extends THClimateAccessory {
  constructor(platform: EWeLinkPlatform, accessory: PlatformAccessory<AccessoryContext>) {
    super(platform, accessory, 'dehumidify');
  }
}
