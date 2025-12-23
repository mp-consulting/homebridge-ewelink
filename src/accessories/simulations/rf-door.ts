import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import { EWeLinkPlatform } from '../../platform.js';
import { AccessoryContext, DeviceParams, RFSubdeviceConfig } from '../../types/index.js';
import { sleep, generateRandomString } from '../../utils/sleep.js';
import { SIMULATION_TIMING } from '../../constants/timing-constants.js';

/**
 * RF Door Simulation Accessory
 * Uses RF bridge buttons to control a door with position tracking
 * Buttons: open, stop, close (stored in accessory.context.buttons)
 */
export class RFDoorAccessory extends BaseAccessory {
  /** Device configuration from platform.rfSubdevices */
  private readonly deviceConfig?: RFSubdeviceConfig;

  /** Operation time for upward movement in deciseconds */
  private readonly operationTimeUp: number;

  /** Operation time for downward movement in deciseconds */
  private readonly operationTimeDown: number;

  /** RF button channels */
  private readonly chOpen: string;
  private readonly chStop: string;
  private readonly chClose: string;

  /** Update key to prevent race conditions */
  private updateKey?: string;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Get RF subdevice configuration from platform
    // Note: platform.rfSubdevices would need to be added to the platform class
    const rfSubdevices = (platform as any).rfSubdevices || {};
    this.deviceConfig = rfSubdevices[accessory.context.hbDeviceId || ''];

    // Set operation times (convert seconds to deciseconds)
    this.operationTimeUp = (this.deviceConfig?.operationTime || SIMULATION_TIMING.DEFAULT_OPERATION_TIME_S) * 10;
    this.operationTimeDown = this.operationTimeUp; // Use same time for both directions unless specified

    // Get RF button channels from accessory context
    const buttons = accessory.context.buttons || {};
    const buttonChannels = Object.keys(buttons);
    [this.chOpen, this.chStop, this.chClose] = buttonChannels;

    // Remove old services (switch services, conflicting WindowCovering/Window services)
    this.removeServiceIfExists(this.Service.WindowCovering);
    this.removeServiceIfExists(this.Service.Window);

    // Remove any switch services from before simulation was configured
    this.accessory.services
      .filter(service => service.constructor.name === 'Switch')
      .forEach(service => this.accessory.removeService(service));

    // Initialize cache if not present
    if (this.accessory.context.cacheCurrentPosition === undefined) {
      this.accessory.context.cacheCurrentPosition = 0;
      this.accessory.context.cachePositionState = 2; // Stopped
      this.accessory.context.cacheTargetPosition = 0;
    }

    // Set up Door service
    this.service = this.getOrAddService(this.Service.Door);

    // Initialize characteristics with cached values
    this.service.updateCharacteristic(
      this.Characteristic.CurrentPosition,
      this.accessory.context.cacheCurrentPosition || 0,
    );
    this.service.updateCharacteristic(
      this.Characteristic.TargetPosition,
      this.accessory.context.cacheTargetPosition || 0,
    );
    this.service.updateCharacteristic(
      this.Characteristic.PositionState,
      this.accessory.context.cachePositionState || 2,
    );

    // Configure TargetPosition characteristic
    this.service.getCharacteristic(this.Characteristic.TargetPosition)
      .onSet(this.setTargetPosition.bind(this));

    // Configure get handlers if not disabled
    if (!platform.config.disableNoResponse) {
      this.service.getCharacteristic(this.Characteristic.CurrentPosition)
        .onGet(this.getCurrentPosition.bind(this));
      this.service.getCharacteristic(this.Characteristic.TargetPosition)
        .onGet(this.getTargetPosition.bind(this));
    }

    this.logInfo(`Initialized as RF door (operation time: ${this.operationTimeUp / 10}s up, ${this.operationTimeDown / 10}s down)`);
  }

  /**
   * Get current position
   */
  private async getCurrentPosition(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.accessory.context.cacheCurrentPosition || 0;
    }, 'CurrentPosition');
  }

  /**
   * Get target position
   */
  private async getTargetPosition(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      return this.accessory.context.cacheTargetPosition || 0;
    }, 'TargetPosition');
  }

  /**
   * Set target position - controls door movement via RF transmit commands
   */
  private async setTargetPosition(value: CharacteristicValue): Promise<void> {
    const targetPosition = value as number;
    let prevPosition = this.accessory.context.cacheCurrentPosition || 0;

    // No change needed
    if (targetPosition === prevPosition) {
      return;
    }

    try {
      const params: DeviceParams = { cmd: 'transmit' };
      const prevState = this.accessory.context.cachePositionState || 2;
      const percentStepUpPerDS = this.operationTimeUp / 100;
      const percentStepDownPerDS = this.operationTimeDown / 100;
      const updateKey = generateRandomString(5);
      this.updateKey = updateKey;

      // If currently moving, calculate current position based on elapsed time
      if (prevState !== 2) {
        const posPercentChange = Math.floor(Date.now() / 100) - (this.accessory.context.cacheLastStartTime || 0);
        const posPercentChangeUp = Math.floor(percentStepUpPerDS * posPercentChange);
        const posPercentChangeDown = Math.floor(percentStepDownPerDS * posPercentChange);

        if (prevState === 0) {
          // Was going down
          prevPosition -= posPercentChangeDown;
        } else {
          // Was going up
          prevPosition += posPercentChangeUp;
        }

        prevPosition = this.clamp(prevPosition, 0, 100);
        this.service.updateCharacteristic(this.Characteristic.CurrentPosition, prevPosition);
        this.accessory.context.cacheCurrentPosition = prevPosition;
      }

      // Calculate movement needed
      const diffPosition = targetPosition - prevPosition;
      const setToMoveUp = diffPosition > 0;
      let decisecondsToMove: number;

      if (setToMoveUp) {
        decisecondsToMove = Math.round(Math.abs(diffPosition) * percentStepUpPerDS);
        params.rfChl = parseInt(this.chOpen, 10);
      } else {
        decisecondsToMove = Math.round(Math.abs(diffPosition) * percentStepDownPerDS);
        params.rfChl = parseInt(this.chClose, 10);
      }

      this.logDebug(
        `Moving from ${prevPosition}% to ${targetPosition}% - ${setToMoveUp ? 'up' : 'down'} for ${decisecondsToMove / 10}s`,
      );

      // Send RF transmit command to start movement
      await this.sendCommand(params);

      // Update state
      this.accessory.context.cacheTargetPosition = targetPosition;
      this.accessory.context.cachePositionState = setToMoveUp ? 1 : 0;
      this.accessory.context.cacheLastStartTime = Math.floor(Date.now() / 100);

      this.service.updateCharacteristic(
        this.Characteristic.PositionState,
        setToMoveUp
          ? this.Characteristic.PositionState.INCREASING
          : this.Characteristic.PositionState.DECREASING,
      );

      // Wait for movement to complete
      await sleep(decisecondsToMove * 100);

      // Check if this update was superseded
      if (this.updateKey !== updateKey) {
        return;
      }

      // Send stop command using stop button
      params.rfChl = parseInt(this.chStop, 10);
      await this.sendCommand(params);

      // Update final position
      this.service.updateCharacteristic(this.Characteristic.PositionState, this.Characteristic.PositionState.STOPPED);
      this.service.updateCharacteristic(this.Characteristic.CurrentPosition, targetPosition);
      this.accessory.context.cachePositionState = 2;
      this.accessory.context.cacheCurrentPosition = targetPosition;

      this.logInfo(`Door position set to ${targetPosition}%`);
    } catch (err) {
      this.logError('Failed to set door position:', err);

      // Revert to previous target after error
      setTimeout(() => {
        this.service.updateCharacteristic(
          this.Characteristic.TargetPosition,
          this.accessory.context.cacheTargetPosition || 0,
        );
      }, SIMULATION_TIMING.POSITION_CLEANUP_MS);

      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  /**
   * Update state from device params
   * RF simulations don't receive state updates, so this is a no-op
   */
  updateState(_params: DeviceParams): void {
    // No state updates for RF simulations
  }
}
