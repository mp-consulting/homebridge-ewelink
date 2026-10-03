import type { DeviceParams } from '../types/index.js';

/**
 * Local network transport (implemented by LANControl)
 */
export interface LanTransport {
  /** Send a command over LAN. Resolves false when the device is unavailable or the command failed. */
  sendCommand(deviceId: string, params: DeviceParams): Promise<boolean>;
}

/**
 * Cloud real-time transport (implemented by WSClient)
 */
export interface CloudTransport {
  /**
   * Send a command. Resolves false when it could not be sent (socket not open),
   * rejects on timeout, server error or when the connection closed while waiting.
   */
  sendCommand(deviceId: string, params: DeviceParams): Promise<boolean>;
  /** Request the device state; the response is routed through handleDeviceUpdate */
  queryDeviceState(deviceId: string): Promise<boolean>;
  isConnected(): boolean;
}

/**
 * Cloud HTTP transport for group commands (implemented by EWeLinkAPI)
 */
export interface GroupTransport {
  updateGroup(groupId: string, params: Record<string, unknown>): Promise<boolean>;
}
