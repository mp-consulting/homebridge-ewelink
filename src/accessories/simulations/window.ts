import type { PlatformAccessory } from 'homebridge';
import type { EWeLinkPlatform } from '../../platform.js';
import type { AccessoryContext } from '../../types/index.js';
import { SwitchCoverAccessory } from './shared/switch-cover.js';

/**
 * Window Simulation Accessory
 * Uses a 2-switch device to control a window with position tracking
 */
export class WindowAccessory extends SwitchCoverAccessory {
  constructor(platform: EWeLinkPlatform, accessory: PlatformAccessory<AccessoryContext>) {
    super(platform, accessory, { serviceType: platform.Service.Window, label: 'window' });
  }
}
