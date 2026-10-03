import {
  hasPowerMonitoring,
  hasFullPowerReadings,
  isDualR3Device,
} from '../../../constants/device-catalog.js';

/**
 * Power monitoring capabilities of one switch channel
 */
export interface ChannelPower {
  /** Device reports power */
  enabled: boolean;
  /** Device also reports voltage and current */
  fullReadings: boolean;
  /** DUALR3 (per-channel actPow_XX readings, per-outlet uiActive) */
  isDualR3: boolean;
  /** Param suffix of this channel's DUALR3 readings ('00', '01') */
  suffix: string;
  /** Outlet passed to uiActive requests (DUALR3 only) */
  uiActiveOutlet?: number;
}

/**
 * DUALR3 param suffix of a channel (actPow_00 for channel 0, actPow_01 for channel 1)
 */
export function channelSuffix(channelIndex: number): string {
  return String(channelIndex).padStart(2, '0');
}

/**
 * Determine power monitoring capabilities for a channel of a device
 * @param uiid - Device UIID
 * @param channelIndex - Channel index (0 for single-channel devices)
 */
export function getChannelPower(uiid: number, channelIndex: number): ChannelPower {
  const isDualR3 = isDualR3Device(uiid);
  return {
    enabled: hasPowerMonitoring(uiid),
    fullReadings: hasFullPowerReadings(uiid),
    isDualR3,
    suffix: channelSuffix(channelIndex),
    uiActiveOutlet: isDualR3 ? channelIndex : undefined,
  };
}
