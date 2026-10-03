import type { PlatformAccessory } from 'homebridge';
import type { EWeLinkPlatform } from '../../platform.js';
import type { AccessoryContext } from '../../types/index.js';
import { THClimateAccessory } from './shared/th-climate.js';

/**
 * TH Cooler Simulation Accessory
 * Uses a TH sensor to control a cooler switch based on temperature thresholds
 */
export class THCoolerAccessory extends THClimateAccessory {
  constructor(platform: EWeLinkPlatform, accessory: PlatformAccessory<AccessoryContext>) {
    super(platform, accessory, 'cool');
  }
}
