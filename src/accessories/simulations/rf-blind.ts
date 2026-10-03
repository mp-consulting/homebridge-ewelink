import type { PlatformAccessory } from 'homebridge';
import type { EWeLinkPlatform } from '../../platform.js';
import type { AccessoryContext } from '../../types/index.js';
import { RFCoverAccessory } from './shared/rf-cover.js';

/**
 * RF Blind Simulation Accessory
 * Uses RF bridge buttons (open, stop, close) to control a blind with position tracking
 */
export class RFBlindAccessory extends RFCoverAccessory {
  constructor(platform: EWeLinkPlatform, accessory: PlatformAccessory<AccessoryContext>) {
    super(platform, accessory, {
      serviceType: platform.Service.WindowCovering,
      label: 'RF blind',
      removeServices: [platform.Service.Door, platform.Service.Window],
    });
  }
}
