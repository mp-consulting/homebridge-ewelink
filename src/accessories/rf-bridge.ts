import { PlatformAccessory } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams } from '../types/index.js';

/**
 * RF Bridge Accessory (UIID 28, 98)
 * Coordinates RF sub-devices (buttons and sensors)
 * Does not expose HomeKit services itself
 */
export class RFBridgeAccessory extends BaseAccessory {
  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    this.logDebug('RF Bridge initialized - manages RF sub-devices');
  }

  /**
   * Handle external updates from the bridge
   * Routes updates to appropriate RF sub-devices
   */
  updateState(params: DeviceParams): void {
    // Update local cache
    Object.assign(this.deviceParams, params);

    // Handle RF button transmit commands
    if (params.cmd === 'transmit' && params.rfChl !== undefined) {
      this.handleRFButtonUpdate(params.rfChl as number);
      return;
    }

    // Handle RF sensor trigger commands
    if (params.cmd === 'trigger' || this.isLANUpdate(params)) {
      this.handleRFSensorTriggers(params);
    }
  }

  /**
   * Check if this is a LAN update with sensor triggers
   */
  private isLANUpdate(params: DeviceParams): boolean {
    return params.updateSource === 'LAN';
  }

  /**
   * Handle RF button trigger
   */
  private handleRFButtonUpdate(rfChannel: number): void {
    this.logDebug(`RF button triggered on channel ${rfChannel}`);

    // Find the corresponding RF button accessory
    let buttonAccessory: PlatformAccessory<AccessoryContext> | undefined;
    for (const acc of this.platform.accessories.values()) {
      if (
        acc.context.device?.deviceid === this.deviceId &&
        acc.context.rfButtonIndex === rfChannel
      ) {
        buttonAccessory = acc;
        break;
      }
    }

    if (!buttonAccessory) {
      this.logDebug(`No RF button accessory found for channel ${rfChannel}`);
      return;
    }

    // Trigger the button through its handler
    const handler = (this.platform as any).accessoryHandlers.get(buttonAccessory.UUID);
    if (handler && 'triggerButton' in handler && typeof handler.triggerButton === 'function') {
      handler.triggerButton();
    }
  }

  /**
   * Handle RF sensor triggers from rfTrig0-3 parameters
   */
  private handleRFSensorTriggers(params: DeviceParams): void {
    // Look for rfTrig0, rfTrig1, rfTrig2, rfTrig3 parameters
    const triggerParams = ['rfTrig0', 'rfTrig1', 'rfTrig2', 'rfTrig3'];

    triggerParams.forEach((triggerKey, index) => {
      if (params[triggerKey] !== undefined) {
        this.handleRFSensorUpdate(index, params[triggerKey] as string);
      }
    });
  }

  /**
   * Handle RF sensor trigger for a specific channel
   */
  private handleRFSensorUpdate(channel: number, timestamp: string): void {
    this.logDebug(`RF sensor triggered on channel ${channel} at ${timestamp}`);

    // Find the corresponding RF sensor accessory
    let sensorAccessory: PlatformAccessory<AccessoryContext> | undefined;
    for (const acc of this.platform.accessories.values()) {
      if (
        acc.context.device?.deviceid === this.deviceId &&
        acc.context.rfButtonIndex === channel
      ) {
        sensorAccessory = acc;
        break;
      }
    }

    if (!sensorAccessory) {
      this.logDebug(`No RF sensor accessory found for channel ${channel}`);
      return;
    }

    // Trigger the sensor through its handler
    const handler = (this.platform as any).accessoryHandlers.get(sensorAccessory.UUID);
    if (handler && 'triggerSensor' in handler && typeof handler.triggerSensor === 'function') {
      handler.triggerSensor(timestamp);
    }
  }
}
