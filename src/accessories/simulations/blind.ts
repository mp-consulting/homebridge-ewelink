import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import { EWeLinkPlatform } from '../../platform.js';
import { AccessoryContext, DeviceParams, MultiDeviceConfig } from '../../types/index.js';
import { sleep, generateRandomString } from '../../utils/sleep.js';

/**
 * Blind Simulation Accessory
 * Uses a 2-switch device to control a blind with position tracking
 * Switch 0: Open/Up
 * Switch 1: Close/Down
 */
export class BlindAccessory extends BaseAccessory {
  /** Device configuration */
  private readonly deviceConfig?: MultiDeviceConfig;

  /** Operation time for upward movement in deciseconds */
  private readonly operationTimeUp: number;

  /** Operation time for downward movement in deciseconds */
  private readonly operationTimeDown: number;

  /** Supports power monitoring */
  private readonly powerReadings: boolean;

  /** Update key to prevent race conditions */
  private updateKey?: string;

  /** Polling interval for power updates */
  private intervalPoll?: NodeJS.Timeout;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Get device-specific config
    this.deviceConfig = platform.config.multiDevices?.find(
      d => d.deviceId === this.deviceId,
    );

    // Set operation times (convert seconds to deciseconds)
    const defaultOperationTime = 120; // 120 seconds default
    this.operationTimeUp = (this.deviceConfig?.operationTime || defaultOperationTime) * 10;
    this.operationTimeDown = (this.deviceConfig?.operationTimeDown || this.operationTimeUp / 10) * 10;

    // Check for power monitoring
    const uiid = this.device.extra?.uiid || 0;
    this.powerReadings = [126, 165].includes(uiid);

    // Initialize cache if not present
    if (this.accessory.context.cacheCurrentPosition === undefined) {
      this.accessory.context.cacheCurrentPosition = 0;
      this.accessory.context.cachePositionState = 2; // Stopped
      this.accessory.context.cacheTargetPosition = 0;
    }

    // Set up WindowCovering service
    this.service = this.getOrAddService(this.Service.WindowCovering);

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

    // Add power monitoring characteristics if supported
    if (this.powerReadings) {
      const { CurrentConsumption, Voltage, ElectricCurrent } = this.platform.eveCharacteristics;

      const CurrentConsumptionUUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';
      const VoltageUUID = 'E863F10A-079E-48FF-8F27-9C2605A29F52';
      const ElectricCurrentUUID = 'E863F126-079E-48FF-8F27-9C2605A29F52';

      if (!this.service.testCharacteristic(CurrentConsumptionUUID)) {
        this.service.addCharacteristic(CurrentConsumption);
      }
      if (!this.service.testCharacteristic(VoltageUUID)) {
        this.service.addCharacteristic(Voltage);
      }
      if (!this.service.testCharacteristic(ElectricCurrentUUID)) {
        this.service.addCharacteristic(ElectricCurrent);
      }
    }

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

    // Set up polling interval for power updates
    if (this.powerReadings && platform.config.mode !== 'lan') {
      setTimeout(() => {
        this.requestUpdate();
        this.intervalPoll = setInterval(() => this.requestUpdate(), 120000);
      }, 5000);

      platform.api.on('shutdown', () => {
        if (this.intervalPoll) {
          clearInterval(this.intervalPoll);
        }
      });
    }

    this.logInfo(`Initialized as blind (operation time: ${this.operationTimeUp / 10}s up, ${this.operationTimeDown / 10}s down)`);
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
   * Set target position - controls blind movement
   */
  private async setTargetPosition(value: CharacteristicValue): Promise<void> {
    const targetPosition = value as number;
    let prevPosition = this.accessory.context.cacheCurrentPosition || 0;

    // No change needed
    if (targetPosition === prevPosition) {
      return;
    }

    try {
      const params: DeviceParams = { switches: [] };
      const prevState = this.accessory.context.cachePositionState || 2;
      const percentStepUpPerDS = this.operationTimeUp / 100;
      const percentStepDownPerDS = this.operationTimeDown / 100;
      const updateKey = generateRandomString(5);
      this.updateKey = updateKey;

      // If currently moving, stop and calculate current position
      if (prevState !== 2) {
        // Stop both switches
        params.switches!.push({ switch: 'off', outlet: 0 });
        params.switches!.push({ switch: 'off', outlet: 1 });
        await this.sendCommand(params);
        params.switches = [];

        // Calculate position change since last movement started
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
        params.switches!.push({ switch: 'on', outlet: 0 }); // Switch 0 = up
      } else {
        decisecondsToMove = Math.round(Math.abs(diffPosition) * percentStepDownPerDS);
        params.switches!.push({ switch: 'on', outlet: 1 }); // Switch 1 = down
      }

      // Start movement
      await this.sendCommand(params);
      params.switches = [];

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

      // Stop movement
      params.switches!.push({
        switch: 'off',
        outlet: setToMoveUp ? 0 : 1,
      });
      await this.sendCommand(params);

      // Update final position
      this.service.updateCharacteristic(this.Characteristic.PositionState, this.Characteristic.PositionState.STOPPED);
      this.service.updateCharacteristic(this.Characteristic.CurrentPosition, targetPosition);
      this.accessory.context.cachePositionState = 2;
      this.accessory.context.cacheCurrentPosition = targetPosition;

      this.logInfo(`Blind position set to ${targetPosition}%`);
    } catch (err) {
      this.logError('Failed to set blind position:', err);

      // Revert to previous target after error
      setTimeout(() => {
        this.service.updateCharacteristic(
          this.Characteristic.TargetPosition,
          this.accessory.context.cacheTargetPosition || 0,
        );
      }, 2000);

      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  /**
   * Request power update from device
   */
  private async requestUpdate(): Promise<void> {
    try {
      if (!this.isOnline) {
        return;
      }
      await this.sendCommand({ uiActive: { outlet: 0, time: 120 } });
    } catch {
      // Suppress errors for polling
    }
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    Object.assign(this.deviceParams, params);

    // Update power readings if supported
    if (!this.powerReadings) {
      return;
    }

    const CurrentConsumptionUUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';
    const VoltageUUID = 'E863F10A-079E-48FF-8F27-9C2605A29F52';
    const ElectricCurrentUUID = 'E863F126-079E-48FF-8F27-9C2605A29F52';

    // Update power
    if (params.actPow_00 !== undefined) {
      const power = parseInt(String(params.actPow_00), 10) / 100;
      this.service.updateCharacteristic(CurrentConsumptionUUID, power);
      this.logDebug(`Power: ${power}W`);
    }

    // Update voltage
    if (params.voltage_00 !== undefined) {
      const voltage = parseInt(String(params.voltage_00), 10) / 100;
      this.service.updateCharacteristic(VoltageUUID, voltage);
      this.logDebug(`Voltage: ${voltage}V`);
    }

    // Update current
    if (params.current_00 !== undefined) {
      const current = parseInt(String(params.current_00), 10) / 100;
      this.service.updateCharacteristic(ElectricCurrentUUID, current);
      this.logDebug(`Current: ${current}A`);
    }
  }
}
