import type { PlatformAccessory } from 'homebridge';
import type { EWeLinkPlatform } from '../../platform.js';
import type { AccessoryContext } from '../../types/index.js';
import { RFCoverAccessory } from './shared/rf-cover.js';

/**
 * RF Door Simulation Accessory
 * Uses RF bridge buttons (open, stop, close) to control a door with position tracking
 */
export class RFDoorAccessory extends RFCoverAccessory {
  constructor(platform: EWeLinkPlatform, accessory: PlatformAccessory<AccessoryContext>) {
    super(platform, accessory, {
      serviceType: platform.Service.Door,
      label: 'RF door',
      removeServices: [platform.Service.WindowCovering, platform.Service.Window],
    });
  }
}
