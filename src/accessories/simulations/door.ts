import type { PlatformAccessory } from 'homebridge';
import type { EWeLinkPlatform } from '../../platform.js';
import type { AccessoryContext } from '../../types/index.js';
import { SwitchCoverAccessory } from './shared/switch-cover.js';

/**
 * Door Simulation Accessory
 * Uses a 2-switch device to control a door with position tracking
 */
export class DoorAccessory extends SwitchCoverAccessory {
  constructor(platform: EWeLinkPlatform, accessory: PlatformAccessory<AccessoryContext>) {
    super(platform, accessory, { serviceType: platform.Service.Door, label: 'door' });
  }
}
