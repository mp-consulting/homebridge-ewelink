import { DeviceParams } from '../types/index.js';

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
      return switchState?.switch === 'on';
    }

    // Single-channel switch
    return deviceParams.switch === 'on';
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
