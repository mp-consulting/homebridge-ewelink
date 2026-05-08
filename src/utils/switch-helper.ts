import type { DeviceParams } from '../types/index.js';

/**
 * Helper class for switch-related operations
 * Handles both single-channel and multi-channel switches
 */
export class SwitchHelper {
  /**
   * Get the current state of a switch
   * Handles both single and multi-channel switches
   */
  static getCurrentState(deviceParams: DeviceParams, channelIndex = 0): boolean {
    // Multi-channel switch
    if (deviceParams.switches) {
      const switchState = deviceParams.switches.find(
        s => s.outlet === channelIndex,
      );
      return SwitchHelper.isOn(switchState?.switch);
    }

    // Single-channel switch
    return SwitchHelper.isOn(deviceParams.switch);
  }

  /**
   * Coerce a switch value to a boolean. Some Zigbee devices (e.g. SWV-BSP UIID 7027)
   * report `switch` as a JSON boolean instead of the eWeLink-canonical 'on'/'off' string.
   */
  static isOn(value: unknown): boolean {
    return value === 'on' || value === true;
  }

  /**
   * Build switch params for sending commands
   * Handles both single and multi-channel switches
   */
  static buildSwitchParams(deviceParams: DeviceParams, channelIndex: number, on: boolean): DeviceParams {
    // Multi-channel switch
    if (deviceParams.switches) {
      const switches = deviceParams.switches.map(s => ({
        ...s,
        switch: s.outlet === channelIndex ? (on ? 'on' : 'off') : s.switch,
      }));

      return { switches };
    }

    // Single-channel switch
    return { switch: on ? 'on' : 'off' };
  }

  /**
   * Get the number of channels for a device
   */
  static getChannelCount(deviceParams: DeviceParams): number {
    return deviceParams.switches?.length || 1;
  }

  /**
   * Check if device is a multi-channel switch
   */
  static isMultiChannel(deviceParams: DeviceParams): boolean {
    return deviceParams.switches !== undefined && deviceParams.switches.length > 1;
  }

  /**
   * Check if device uses SCM (switches array) format
   * Some single-channel devices use the switches array format
   */
  static isSCMDevice(deviceParams: DeviceParams): boolean {
    return deviceParams.switches !== undefined;
  }
}
