import type { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from '../base.js';
import type { EWeLinkPlatform } from '../../platform.js';
import type { AccessoryContext, DeviceParams, SingleDeviceConfig, MultiDeviceConfig } from '../../types/index.js';
import { SwitchHelper } from '../../utils/switch-helper.js';
import { EVE_CHARACTERISTIC_UUIDS } from '../../utils/eve-characteristics.js';
import { POLLING } from '../../constants/timing-constants.js';
import { hasPowerMonitoring, hasFullPowerReadings as hasFullPowerReadingsUIID } from '../../constants/device-catalog.js';

/**
 * Valve Simulation Accessory
 * Simulates a valve using a switch device
 */
export class ValveAccessory extends BaseAccessory {
  /** Channel index for multi-channel devices */
  private readonly channelIndex: number;

  /** Device configuration */
  private readonly deviceConfig?: SingleDeviceConfig | MultiDeviceConfig;

  /** Disable timer functionality */
  private readonly disableTimer: boolean;

  /** Timer for auto-off */
  private timer?: NodeJS.Timeout;

  /** Epoch ms when the current timer started */
  private timerStartedAt?: number;

  /** Duration in seconds for the currently running timer */
  private timerDuration?: number;

  /** Interval that pushes RemainingDuration updates to HomeKit while the timer runs */
  private remainingTick?: NodeJS.Timeout;

  /** Power monitoring support */
  private readonly powerReadings: boolean;

  /** Full power readings (voltage + current) */
  private readonly hasFullPowerReadings: boolean;

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

    // Check timer configuration
    this.disableTimer = this.deviceConfig?.disableTimer || false;

    // Check for power monitoring
    const uiid = this.device.extra?.uiid || 0;
    this.powerReadings = hasPowerMonitoring(uiid) || this.supportsPowerMonitoring();
    this.hasFullPowerReadings = hasFullPowerReadingsUIID(uiid);

    // Drop stale services from a prior routing (e.g. cached Switch/Outlet
    // before the device was re-routed to the valve simulation).
    this.removeServiceIfExists(this.Service.Switch);
    this.removeServiceIfExists(this.Service.Outlet);

    // Set up the valve service
    this.service = this.getOrAddService(this.Service.Valve);

    // Set valve type to generic valve
    this.service.updateCharacteristic(this.Characteristic.ValveType, 1);

    // Configure Active characteristic
    this.service.getCharacteristic(this.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    // Configure InUse characteristic
    this.service.getCharacteristic(this.Characteristic.InUse)
      .onGet(this.getInUse.bind(this));

    // Configure duration characteristics if timer not disabled
    if (!this.disableTimer) {
      // Set default duration
      this.service.updateCharacteristic(this.Characteristic.SetDuration, POLLING.VALVE_DEFAULT_DURATION_S);
      // RemainingDuration may already exist on a cached service from a prior run;
      // unguarded addCharacteristic throws "duplicate UUID" and aborts discovery.
      if (!this.service.testCharacteristic(this.Characteristic.RemainingDuration)) {
        this.service.addCharacteristic(this.Characteristic.RemainingDuration);
      }

      // Without an onGet, HAP returns the cached full duration on app reopen,
      // so iOS restarts its local countdown from the top — looking like a reset.
      this.service.getCharacteristic(this.Characteristic.RemainingDuration)
        .onGet(this.getRemainingDuration.bind(this));

      this.service.getCharacteristic(this.Characteristic.SetDuration)
        .onSet(this.setDuration.bind(this));
    } else {
      // Remove duration characteristics if timer disabled
      if (this.service.testCharacteristic(this.Characteristic.SetDuration)) {
        this.service.removeCharacteristic(
          this.service.getCharacteristic(this.Characteristic.SetDuration)!,
        );
      }
      if (this.service.testCharacteristic(this.Characteristic.RemainingDuration)) {
        this.service.removeCharacteristic(
          this.service.getCharacteristic(this.Characteristic.RemainingDuration)!,
        );
      }
    }

    // Add Eve power characteristics if supported
    if (this.powerReadings) {
      this.setupPowerMonitoring();
    }

    // Set initial state
    this.updateState(this.deviceParams);
  }

  /**
   * Check if device supports power monitoring
   */
  private supportsPowerMonitoring(): boolean {
    return this.deviceParams.power !== undefined ||
           this.deviceParams.voltage !== undefined ||
           this.deviceParams.current !== undefined;
  }

  /**
   * Setup power monitoring characteristics
   */
  private setupPowerMonitoring(): void {
    const { CurrentConsumption, Voltage, ElectricCurrent } = this.platform.eveCharacteristics;

    if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption)) {
      this.service.addCharacteristic(CurrentConsumption);
    }

    if (this.hasFullPowerReadings) {
      if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage)) {
        this.service.addCharacteristic(Voltage);
      }
      if (!this.service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent)) {
        this.service.addCharacteristic(ElectricCurrent);
      }
    }

    this.logDebug(`Power monitoring enabled (full readings: ${this.hasFullPowerReadings})`);
  }

  /**
   * Get active state
   */
  private async getActive(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      const isOn = SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);
      return isOn ? this.Characteristic.Active.ACTIVE : this.Characteristic.Active.INACTIVE;
    }, 'Active');
  }

  /**
   * Set active state
   */
  private async setActive(value: CharacteristicValue): Promise<void> {
    await this.handleSet(value as number, 'Active', async (active) => {
      const on = active === this.Characteristic.Active.ACTIVE;
      const params = SwitchHelper.buildSwitchParams(this.deviceParams, this.channelIndex, on);

      // Update InUse to match Active
      this.service.updateCharacteristic(
        this.Characteristic.InUse,
        on ? this.Characteristic.InUse.IN_USE : this.Characteristic.InUse.NOT_IN_USE,
      );

      // Start timer if activating and timer not disabled
      if (on && !this.disableTimer) {
        const durationChar = this.service.getCharacteristic(this.Characteristic.SetDuration);
        const duration = durationChar.value as number || POLLING.VALVE_DEFAULT_DURATION_S;
        this.startTimer(duration);
      } else {
        this.clearTimer();
        if (!this.disableTimer) {
          this.service.updateCharacteristic(this.Characteristic.RemainingDuration, 0);
        }
      }

      return await this.sendCommand(params);
    });
  }

  /**
   * Get in use state
   */
  private async getInUse(): Promise<CharacteristicValue> {
    return this.handleGet(() => {
      const isOn = SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);
      return isOn ? this.Characteristic.InUse.IN_USE : this.Characteristic.InUse.NOT_IN_USE;
    }, 'InUse');
  }

  /**
   * Set duration (only updates timer if valve is active)
   */
  private async setDuration(value: CharacteristicValue): Promise<void> {
    const duration = value as number;
    const isActive = this.service.getCharacteristic(this.Characteristic.Active).value;

    if (isActive === this.Characteristic.Active.ACTIVE) {
      this.startTimer(duration);
      this.logDebug(`Valve duration updated to ${duration}s while active`);
    }
  }

  /**
   * Start (or restart) the auto-off timer and record the start time so
   * RemainingDuration can be computed on demand when HomeKit re-reads it.
   * Also push periodic RemainingDuration updates: iOS Home app caches the
   * last notified value and counts down locally, so without periodic pushes
   * the value it shows when the app is reopened is the original full duration.
   */
  private startTimer(duration: number): void {
    this.clearTimerHandles();
    this.timerStartedAt = Date.now();
    this.timerDuration = duration;
    this.service.updateCharacteristic(this.Characteristic.RemainingDuration, duration);
    this.timer = setTimeout(() => {
      this.service.setCharacteristic(this.Characteristic.Active, this.Characteristic.Active.INACTIVE);
    }, duration * 1000);
    this.remainingTick = setInterval(() => {
      const remaining = this.computeRemaining();
      this.service.updateCharacteristic(this.Characteristic.RemainingDuration, remaining);
    }, 1000);
  }

  /**
   * Clear the auto-off timer and forget its start time.
   */
  private clearTimer(): void {
    this.clearTimerHandles();
    this.timerStartedAt = undefined;
    this.timerDuration = undefined;
  }

  private clearTimerHandles(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.remainingTick) {
      clearInterval(this.remainingTick);
      this.remainingTick = undefined;
    }
  }

  private computeRemaining(): number {
    if (this.timerStartedAt === undefined || this.timerDuration === undefined) {
      return 0;
    }
    const elapsed = (Date.now() - this.timerStartedAt) / 1000;
    return Math.max(0, Math.round(this.timerDuration - elapsed));
  }

  /**
   * Compute remaining seconds from the recorded start time so HomeKit
   * resumes the countdown correctly after the app is reopened.
   */
  private async getRemainingDuration(): Promise<CharacteristicValue> {
    return this.handleGet(() => this.computeRemaining(), 'RemainingDuration');
  }

  /**
   * Update state from device params
   */
  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);

    // Update valve state
    const isOn = SwitchHelper.getCurrentState(this.deviceParams, this.channelIndex);
    this.service.updateCharacteristic(
      this.Characteristic.Active,
      isOn ? this.Characteristic.Active.ACTIVE : this.Characteristic.Active.INACTIVE,
    );
    this.service.updateCharacteristic(
      this.Characteristic.InUse,
      isOn ? this.Characteristic.InUse.IN_USE : this.Characteristic.InUse.NOT_IN_USE,
    );

    // If the device turned off out-of-band, drop any pending timer so
    // RemainingDuration reports 0 on the next read.
    if (!isOn && !this.disableTimer && this.timer) {
      this.clearTimer();
      this.service.updateCharacteristic(this.Characteristic.RemainingDuration, 0);
    }

    // Update Eve power characteristics if supported
    if (this.powerReadings) {
      if (params.power !== undefined) {
        const power = parseFloat(String(params.power));
        this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption, power);
      }

      if (this.hasFullPowerReadings) {
        if (params.voltage !== undefined) {
          const voltage = parseFloat(String(params.voltage));
          this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.Voltage, voltage);
        }
        if (params.current !== undefined) {
          const current = parseFloat(String(params.current));
          this.service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent, current);
        }
      }
    }

    this.logDebug(`Valve state updated: ${isOn ? 'ACTIVE' : 'INACTIVE'}`);
  }
}
