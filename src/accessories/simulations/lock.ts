import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import { EWeLinkPlatform } from '../../platform.js';
import { AccessoryContext, DeviceParams, SingleDeviceConfig, MultiDeviceConfig } from '../../types/index.js';
import { SwitchHelper } from '../../utils/switch-helper.js';

/**
 * Lock Simulation Accessory
 * Simulates a lock using a switch device
 */
export class LockAccessory extends BaseAccessory {
  /** Channel index for multi-channel devices */
  private readonly channelIndex: number;

  /** Device configuration */
  private readonly deviceConfig?: SingleDeviceConfig | MultiDeviceConfig;

  /** Lock type */
  private readonly lockType: string;

  /** Current lock state */
  private currentState: number;

  /** Target lock state */
  private targetState: number;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    this.channelIndex = accessory.context.channelIndex || 0;

    // Get device-specific config
    this.deviceConfig = platform.config.singleDevices?.find(
      d => d.deviceId === this.deviceId,
    ) || platform.config.multiDevices?.find(
      d => d.deviceId === this.deviceId,
    );

    // Get lock type (default to 'lock')
    this.lockType = this.deviceConfig?.type || 'lock';

    // Initialize states
    const isOn = SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);
    // Unlocked when switch is ON, Locked when switch is OFF
    this.currentState = isOn
      ? this.Characteristic.LockCurrentState.UNSECURED
      : this.Characteristic.LockCurrentState.SECURED;
    this.targetState = isOn
      ? this.Characteristic.LockTargetState.UNSECURED
      : this.Characteristic.LockTargetState.SECURED;

    // Set up the lock service
    this.service = this.getOrAddService(this.Service.LockMechanism);

    // Configure CurrentState characteristic
    this.service.getCharacteristic(this.Characteristic.LockCurrentState)
      .onGet(this.getCurrentState.bind(this));

    // Configure TargetState characteristic
    this.service.getCharacteristic(this.Characteristic.LockTargetState)
      .onGet(this.getTargetState.bind(this))
      .onSet(this.setTargetState.bind(this));

    // Set initial state
    this.updateState(this.deviceParams);
  }

  /**
   * Get current lock state
   */
  private async getCurrentState(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.currentState, 'LockCurrentState');
  }

  /**
   * Get target lock state
   */
  private async getTargetState(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.targetState, 'LockTargetState');
  }

  /**
   * Set target lock state
   */
  private async setTargetState(value: CharacteristicValue): Promise<void> {
    await this.handleSet(value as number, 'LockTargetState', async (target) => {
      this.targetState = target;

      // Send command to device
      // Unlocked = switch ON, Locked = switch OFF
      const on = target === this.Characteristic.LockTargetState.UNSECURED;
      const params = SwitchHelper.buildSwitchParams(this.deviceParams, this.channelIndex, on);

      // Update to final state directly
      this.currentState = target === this.Characteristic.LockTargetState.UNSECURED
        ? this.Characteristic.LockCurrentState.UNSECURED
        : this.Characteristic.LockCurrentState.SECURED;
      this.service.updateCharacteristic(this.Characteristic.LockCurrentState, this.currentState);
      this.logDebug(`Lock state: ${target === this.Characteristic.LockTargetState.UNSECURED ? 'UNLOCKED' : 'LOCKED'}`);

      return await this.sendCommand(params);
    });
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    // Update lock state based on switch state
    // Unlocked when switch is ON, Locked when switch is OFF
    const isOn = SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);

    this.currentState = isOn
      ? this.Characteristic.LockCurrentState.UNSECURED
      : this.Characteristic.LockCurrentState.SECURED;
    this.targetState = isOn
      ? this.Characteristic.LockTargetState.UNSECURED
      : this.Characteristic.LockTargetState.SECURED;

    this.service.updateCharacteristic(this.Characteristic.LockCurrentState, this.currentState);
    this.service.updateCharacteristic(this.Characteristic.LockTargetState, this.targetState);

    this.logDebug(`Lock state updated: ${isOn ? 'UNLOCKED' : 'LOCKED'}`);
  }
}
