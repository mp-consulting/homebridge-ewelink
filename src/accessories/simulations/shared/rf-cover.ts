import type { PlatformAccessory } from 'homebridge';
import type { EWeLinkPlatform } from '../../../platform.js';
import type { AccessoryContext, DeviceParams } from '../../../types/index.js';
import { SIMULATION_TIMING } from '../../../constants/timing-constants.js';
import { TimedCoverAccessory } from './timed-cover.js';
import type { CoverDirection, TimedCoverSpec } from './timed-cover.js';

/**
 * Timed cover driven by RF bridge buttons
 * Buttons: open, stop, close (stored in accessory.context.buttons)
 */
export class RFCoverAccessory extends TimedCoverAccessory {
  /** RF button channels */
  private readonly chOpen: number;
  private readonly chStop: number;
  private readonly chClose: number;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
    spec: TimedCoverSpec,
  ) {
    super(platform, accessory, spec);

    // RF motors take the new direction directly
    this.stopBeforeRetarget = false;

    // Subdevice config lives in rfDevices[bridge].subdevices[label]
    const bridgeConfig = platform.config.rfDevices?.find(d => d.deviceId === accessory.context.device?.deviceid);
    const config = bridgeConfig?.subdevices?.find(s => s.label === accessory.context.name);
    const upSeconds = config?.operationTime || SIMULATION_TIMING.DEFAULT_OPERATION_TIME_S;
    const downSeconds = config?.operationTimeDown || upSeconds;

    const [chOpen, chStop, chClose] = Object.keys(accessory.context.buttons || {});
    this.chOpen = Number.parseInt(chOpen, 10);
    this.chStop = Number.parseInt(chStop, 10);
    this.chClose = Number.parseInt(chClose, 10);

    // Remove any switch services from before simulation was configured
    this.accessory.services
      .filter(service => service.constructor.name === 'Switch')
      .forEach(service => this.accessory.removeService(service));

    this.setOperationTimes(upSeconds, downSeconds);
  }

  private transmit(channel: number): Promise<boolean> {
    return this.sendCommand({ cmd: 'transmit', rfChl: channel });
  }

  protected startMove(direction: CoverDirection): Promise<boolean> {
    return this.transmit(direction === 'up' ? this.chOpen : this.chClose);
  }

  protected stopMove(): Promise<boolean> {
    return this.transmit(this.chStop);
  }

  /**
   * RF simulations don't receive state updates, so this is a no-op
   */
  updateState(_params: DeviceParams): void {
    // No state updates for RF simulations
  }
}
