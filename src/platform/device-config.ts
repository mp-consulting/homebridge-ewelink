import { DeviceCategory } from '../settings.js';
import type { EWeLinkPlatformConfig } from '../types/index.js';

/**
 * Get the per-device configuration entry for a device, based on its category
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDeviceConfig(config: EWeLinkPlatformConfig, deviceId: string, category: DeviceCategory): any {
  switch (category) {
    case DeviceCategory.SINGLE_SWITCH:
      return config.singleDevices?.find(d => d.deviceId === deviceId);
    case DeviceCategory.MULTI_SWITCH:
      return config.multiDevices?.find(d => d.deviceId === deviceId);
    case DeviceCategory.THERMOSTAT:
      return config.thDevices?.find(d => d.deviceId === deviceId);
    case DeviceCategory.FAN:
      return config.fanDevices?.find(d => d.deviceId === deviceId);
    case DeviceCategory.LIGHT:
      return config.lightDevices?.find(d => d.deviceId === deviceId);
    case DeviceCategory.SENSOR:
      return config.sensorDevices?.find(d => d.deviceId === deviceId);
    case DeviceCategory.RF_BRIDGE:
      return config.rfDevices?.find(d => d.deviceId === deviceId);
    default:
      return undefined;
  }
}

/**
 * Whether a device is listed in ignoredDevices
 */
export function isDeviceIgnored(config: EWeLinkPlatformConfig, deviceId: string): boolean {
  return config.ignoredDevices?.includes(deviceId) ?? false;
}
