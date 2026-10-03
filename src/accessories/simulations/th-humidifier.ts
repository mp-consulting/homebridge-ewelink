import type { PlatformAccessory } from 'homebridge';
import type { EWeLinkPlatform } from '../../platform.js';
import type { AccessoryContext } from '../../types/index.js';
import { THClimateAccessory } from './shared/th-climate.js';

/**
 * TH Humidifier Simulation Accessory
 * Uses a TH sensor to control a humidifier switch based on humidity thresholds
 */
export class THHumidifierAccessory extends THClimateAccessory {
  constructor(platform: EWeLinkPlatform, accessory: PlatformAccessory<AccessoryContext>) {
    super(platform, accessory, 'humidify');
  }
}
