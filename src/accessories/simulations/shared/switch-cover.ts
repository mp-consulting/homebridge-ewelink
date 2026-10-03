import type { PlatformAccessory } from 'homebridge';
import type { EWeLinkPlatform } from '../../../platform.js';
import type { AccessoryContext, DeviceParams } from '../../../types/index.js';
import { isDualR3Device } from '../../../constants/device-catalog.js';
import { SIMULATION_TIMING } from '../../../constants/timing-constants.js';
import { TimedCoverAccessory } from './timed-cover.js';
import type { CoverDirection, TimedCoverSpec } from './timed-cover.js';

/** Outlet driving the motor upwards */
const OUTLET_UP = 0;

/** Outlet driving the motor downwards */
const OUTLET_DOWN = 1;

/**
 * Timed cover driven by a 2-channel switch
 * Switch 0: Open/Up, Switch 1: Close/Down. DUALR3 devices also report motor power.
 */
export class SwitchCoverAccessory extends TimedCoverAccessory {
  /** Supports power monitoring (DUALR3) */
  private readonly powerReadings: boolean;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
    spec: TimedCoverSpec,
  ) {
    super(platform, accessory, spec);

    const config = this.getMultiDeviceConfig();
    const upSeconds = config?.operationTime || SIMULATION_TIMING.DEFAULT_OPERATION_TIME_S;
    const downSeconds = config?.operationTimeDown || upSeconds;

    this.powerReadings = isDualR3Device(this.device.extra?.uiid || 0);
    if (this.powerReadings) {
      this.setupPowerMonitoringCharacteristics(this.service, true);
      if (platform.config.mode !== 'lan') {
        this.setupPollingInterval(async () => {
          if (this.isOnline) {
            await this.requestUiActiveUpdate(OUTLET_UP);
          }
        });
      }
    }

    this.setOperationTimes(upSeconds, downSeconds);
  }

  protected async startMove(direction: CoverDirection): Promise<boolean> {
    return this.sendCommand({
      switches: [{ switch: 'on', outlet: direction === 'up' ? OUTLET_UP : OUTLET_DOWN }],
    });
  }

  protected async stopMove(): Promise<boolean> {
    return this.sendCommand({
      switches: [
        { switch: 'off', outlet: OUTLET_UP },
        { switch: 'off', outlet: OUTLET_DOWN },
      ],
    });
  }

  /**
   * Update power readings. The motor runs on either channel, so power and current
   * are summed over both DUALR3 channels (actPow_00 + actPow_01).
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    if (!this.powerReadings) {
      return;
    }

    const all = this.deviceParams;
    const combined: DeviceParams = {};
    const sum = (key: string): number | undefined => {
      if (params[`${key}_00`] === undefined && params[`${key}_01`] === undefined) {
        return undefined;
      }
      return Number(all[`${key}_00`] ?? 0) + Number(all[`${key}_01`] ?? 0);
    };

    const power = sum('actPow');
    if (power !== undefined) {
      combined.actPow_00 = power;
    }
    const current = sum('current');
    if (current !== undefined) {
      combined.current_00 = current;
    }
    const voltage = params.voltage_00 ?? params.voltage_01;
    if (voltage !== undefined) {
      combined.voltage_00 = voltage;
    }

    this.updateDualR3PowerReadings(this.service, combined);
  }
}
