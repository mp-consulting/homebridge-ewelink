import { PlatformAccessory, CharacteristicValue, Service } from 'homebridge';
import { BaseAccessory } from './base.js';
import { EWeLinkPlatform } from '../platform.js';
import { AccessoryContext, DeviceParams } from '../types/index.js';

/**
 * RF Button Accessory
 * Represents a button learned by an RF Bridge
 * Provides Switch services for each button
 */
export class RFButtonAccessory extends BaseAccessory {
  private buttonServices: Map<number, Service> = new Map();
  private buttonNames: Map<number, string> = new Map();

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Get button configuration from context
    const buttons = accessory.context.buttons as Record<string, string> | undefined;
    if (!buttons) {
      this.logError('No button configuration found in accessory context');
      return;
    }

    // Create a switch service for each button
    Object.entries(buttons).forEach(([channel, name]) => {
      const channelNum = Number.parseInt(channel, 10);
      this.buttonNames.set(channelNum, name);

      // Get or create service
      const service = accessory.getService(name) ||
        accessory.addService(this.Service.Switch, name, `switch${channel}`);

      // Configure the switch
      service.getCharacteristic(this.Characteristic.On)
        .onGet(() => this.getButtonState(channelNum))
        .onSet(value => this.setButtonState(channelNum, value));

      // Always start with button off
      service.updateCharacteristic(this.Characteristic.On, false);

      this.buttonServices.set(channelNum, service);
    });

    this.logDebug(`RF Button initialized with ${this.buttonServices.size} button(s)`);
  }

  /**
   * Get button state (always returns false as buttons are momentary)
   */
  private async getButtonState(channel: number): Promise<CharacteristicValue> {
    return this.handleGet(() => false, `Button${channel}`);
  }

  /**
   * Set button state (sends transmit command when turned on)
   */
  private async setButtonState(channel: number, value: CharacteristicValue): Promise<void> {
    // Only respond to "on" commands
    if (!value) {
      return;
    }

    const buttonName = this.buttonNames.get(channel);
    this.logInfo(`Pressing button ${buttonName || channel}`);

    // Send RF transmit command
    const params = {
      cmd: 'transmit',
      rfChl: channel,
    };

    const success = await this.sendCommand(params);

    if (!success) {
      // Turn off the button after a delay even on failure
      setTimeout(() => {
        const service = this.buttonServices.get(channel);
        service?.updateCharacteristic(this.Characteristic.On, false);
      }, 2000);

      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    // Turn off the button after a short delay (momentary press simulation)
    setTimeout(() => {
      const service = this.buttonServices.get(channel);
      service?.updateCharacteristic(this.Characteristic.On, false);
    }, 1000);
  }

  /**
   * External trigger from RF Bridge
   * Called when the physical RF button is pressed
   */
  triggerButton(): void {
    // Get the first button channel (most RF buttons have only one channel)
    const channel = Array.from(this.buttonServices.keys())[0];
    if (channel === undefined) {
      return;
    }

    const service = this.buttonServices.get(channel);
    if (!service) {
      return;
    }

    const buttonName = this.buttonNames.get(channel);
    this.logInfo(`Button ${buttonName || channel} triggered`);

    // Simulate button press
    service.updateCharacteristic(this.Characteristic.On, true);

    // Turn off after delay
    setTimeout(() => {
      service.updateCharacteristic(this.Characteristic.On, false);
    }, 3000);
  }

  /**
   * Update state from device params (no-op for RF buttons)
   */
  updateState(_params: DeviceParams): void {
    // RF buttons don't have persistent state
  }
}
