import type { PlatformAccessory } from 'homebridge';
import type { EWeLinkPlatform } from '../../platform.js';
import type { AccessoryContext } from '../../types/index.js';
import { RFCoverAccessory } from './shared/rf-cover.js';

/**
 * RF Window Simulation Accessory
 * Uses RF bridge buttons (open, stop, close) to control a window with position tracking
 */
export class RFWindowAccessory extends RFCoverAccessory {
  constructor(platform: EWeLinkPlatform, accessory: PlatformAccessory<AccessoryContext>) {
    super(platform, accessory, {
      serviceType: platform.Service.Window,
      label: 'RF window',
      removeServices: [platform.Service.WindowCovering, platform.Service.Door],
    });
  }
}
