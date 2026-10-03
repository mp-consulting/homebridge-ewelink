import type { PlatformAccessory, CharacteristicValue, Characteristic, Service, WithUUID } from 'homebridge';
import { BaseAccessory } from '../../base.js';
import type { EWeLinkPlatform } from '../../../platform.js';
import type { AccessoryContext, DeviceParams } from '../../../types/index.js';

/** A Characteristic constructor (as exposed by hap.Characteristic) */
type CharacteristicType = WithUUID<new () => Characteristic>;

/** Kind of single-mode climate simulation */
export type ThresholdModeKind = 'heat' | 'cool' | 'humidify' | 'dehumidify';

/**
 * Describes one single-mode climate controller (heater, cooler, humidifier, dehumidifier)
 */
export interface ThresholdMode {
  /** Device name used in logs, e.g. 'Heater' */
  name: string;
  /** Activity name used in logs, e.g. 'Heating' */
  activity: string;
  /** Unit of the controlled reading, e.g. '°C' */
  unit: string;
  /** Run the device while the reading is below (heat/humidify) or above (cool/dehumidify) the target */
  runWhen: 'below' | 'above';
  /** HomeKit service type */
  serviceType: WithUUID<typeof Service>;
  /** Characteristic holding the controlled reading on the main service */
  readingCharacteristic: CharacteristicType;
  /** Target state characteristic (fixed to a single value) */
  targetStateCharacteristic: CharacteristicType;
  /** The only allowed target state value */
  targetStateValue: number;
  /** Current state characteristic */
  currentStateCharacteristic: CharacteristicType;
  /** Current state value while the device is running (HEATING, COOLING, ...) */
  runningCurrentState: number;
  /** Threshold characteristic holding the user target */
  thresholdCharacteristic: CharacteristicType;
}

/** Current state values shared by HeaterCooler and HumidifierDehumidifier */
const CURRENT_STATE_INACTIVE = 0;
const CURRENT_STATE_IDLE = 1;

/**
 * Build the mode descriptor for a kind of controller
 */
export function createThresholdMode(
  hap: { Service: typeof Service; Characteristic: typeof Characteristic },
  kind: ThresholdModeKind,
): ThresholdMode {
  const { Service: S, Characteristic: C } = hap;
  switch (kind) {
    case 'heat':
    case 'cool': {
      const heat = kind === 'heat';
      return {
        name: heat ? 'Heater' : 'Cooler',
        activity: heat ? 'Heating' : 'Cooling',
        unit: '°C',
        runWhen: heat ? 'below' : 'above',
        serviceType: S.HeaterCooler,
        readingCharacteristic: C.CurrentTemperature,
        targetStateCharacteristic: C.TargetHeaterCoolerState,
        targetStateValue: heat ? C.TargetHeaterCoolerState.HEAT : C.TargetHeaterCoolerState.COOL,
        currentStateCharacteristic: C.CurrentHeaterCoolerState,
        runningCurrentState: heat ? C.CurrentHeaterCoolerState.HEATING : C.CurrentHeaterCoolerState.COOLING,
        thresholdCharacteristic: heat ? C.HeatingThresholdTemperature : C.CoolingThresholdTemperature,
      };
    }
    case 'humidify':
    case 'dehumidify': {
      const humidify = kind === 'humidify';
      return {
        name: humidify ? 'Humidifier' : 'Dehumidifier',
        activity: humidify ? 'Humidifying' : 'Dehumidifying',
        unit: '%',
        runWhen: humidify ? 'below' : 'above',
        serviceType: S.HumidifierDehumidifier,
        readingCharacteristic: C.CurrentRelativeHumidity,
        targetStateCharacteristic: C.TargetHumidifierDehumidifierState,
        targetStateValue: humidify
          ? C.TargetHumidifierDehumidifierState.HUMIDIFIER
          : C.TargetHumidifierDehumidifierState.DEHUMIDIFIER,
        currentStateCharacteristic: C.CurrentHumidifierDehumidifierState,
        runningCurrentState: humidify
          ? C.CurrentHumidifierDehumidifierState.HUMIDIFYING
          : C.CurrentHumidifierDehumidifierState.DEHUMIDIFYING,
        thresholdCharacteristic: humidify
          ? C.RelativeHumidityHumidifierThreshold
          : C.RelativeHumidityDehumidifierThreshold,
      };
    }
  }
}

export interface ThresholdControllerOptions {
  /** Controller mode descriptor */
  mode: ThresholdMode;
  /** Target used when none is cached yet */
  defaultTarget: number;
  /** When set, the cached target is reset to defaultTarget whenever context.cacheType differs */
  cacheType?: string;
}

/**
 * Switch-based climate controller simulation: turns a relay on/off so a reading
 * (temperature or humidity) reaches a target.
 *
 * Decision (with hysteresis h, `runWhen: 'below'`): run when reading < target - h,
 * stop when reading >= target, keep the current state in between.
 * `runWhen: 'above'` mirrors it (run when reading > target + h, stop when reading <= target).
 *
 * Commands that fail leave the cached state unchanged: onSet handlers throw a
 * communication error, background evaluations simply retry on the next reading.
 */
export abstract class ThresholdControllerAccessory extends BaseAccessory {
  protected readonly mode: ThresholdMode;

  /** Whether the simulated device is switched on in HomeKit */
  protected cacheActive: boolean;

  /** Whether the relay is (believed to be) running */
  protected cacheRunning: boolean;

  /** Last controlled reading (temperature or humidity) */
  protected cacheReading: number;

  /** Target value */
  protected cacheTarget: number;

  /** Hysteresis band below (heat) / above (cool) the target */
  protected hysteresis = 0;

  /** Serialises background evaluations */
  private evaluation: Promise<void> = Promise.resolve();

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
    options: ThresholdControllerOptions,
  ) {
    super(platform, accessory);
    const { mode, defaultTarget, cacheType } = options;
    this.mode = mode;

    const ctx = accessory.context;
    if (!ctx.cacheTarget) {
      ctx.cacheTarget = defaultTarget;
    }
    if (cacheType !== undefined && ctx.cacheType !== cacheType) {
      ctx.cacheType = cacheType;
      ctx.cacheTarget = defaultTarget;
    }
    this.cacheTarget = ctx.cacheTarget as number;

    this.service = this.getOrAddService(mode.serviceType);

    this.service.getCharacteristic(mode.readingCharacteristic)
      .onGet(() => this.handleGet(() => this.cacheReading, 'Reading'));
    this.cacheReading = Number(this.service.getCharacteristic(mode.readingCharacteristic).value) || 0;

    this.service.getCharacteristic(this.Characteristic.Active)
      .onGet(() => this.handleGet(() => (this.cacheActive ? 1 : 0), 'Active'))
      .onSet(this.setActive.bind(this));

    this.service.getCharacteristic(mode.targetStateCharacteristic)
      .updateValue(mode.targetStateValue)
      .setProps({
        minValue: mode.targetStateValue,
        maxValue: mode.targetStateValue,
        validValues: [mode.targetStateValue],
      })
      .onGet(() => mode.targetStateValue);

    this.service.getCharacteristic(mode.currentStateCharacteristic)
      .onGet(() => this.handleGet(() => this.currentStateValue(), 'CurrentState'));

    this.service.getCharacteristic(mode.thresholdCharacteristic)
      .updateValue(this.cacheTarget)
      .onSet(this.setTarget.bind(this));

    this.cacheActive = this.service.getCharacteristic(this.Characteristic.Active).value === 1;
    this.cacheRunning = this.cacheActive &&
      this.service.getCharacteristic(mode.currentStateCharacteristic).value === mode.runningCurrentState;
  }

  /**
   * Device params that switch the relay on or off
   */
  protected abstract buildRunParams(run: boolean): DeviceParams;

  /** HomeKit current state derived from the caches */
  protected currentStateValue(): number {
    if (!this.cacheActive) {
      return CURRENT_STATE_INACTIVE;
    }
    return this.cacheRunning ? this.mode.runningCurrentState : CURRENT_STATE_IDLE;
  }

  /** Push Active and current state to HomeKit */
  protected publishState(): void {
    this.service.updateCharacteristic(this.Characteristic.Active, this.cacheActive ? 1 : 0);
    this.service.updateCharacteristic(this.mode.currentStateCharacteristic, this.currentStateValue());
  }

  /**
   * Whether the relay should run for the current reading/target
   * @param running - Current relay state (kept while inside the hysteresis band)
   */
  protected shouldRun(running: boolean): boolean {
    const reading = this.cacheReading;
    const target = this.cacheTarget;
    if (this.mode.runWhen === 'below') {
      if (reading < target - this.hysteresis) {
        return true;
      }
      if (reading >= target) {
        return false;
      }
    } else {
      if (reading > target + this.hysteresis) {
        return true;
      }
      if (reading <= target) {
        return false;
      }
    }
    return running;
  }

  /**
   * Record a new controlled reading, update HomeKit and re-evaluate
   */
  protected setReading(value: number): void {
    if (value !== this.cacheReading) {
      this.cacheReading = value;
      this.service.updateCharacteristic(this.mode.readingCharacteristic, value);
      this.logDebug(`Reading: ${value}${this.mode.unit}`);
    }
    // Evaluate on every report so a previously failed command is retried
    void this.evaluate();
  }

  /**
   * Active onSet
   */
  private async setActive(value: CharacteristicValue): Promise<void> {
    const active = value === 1;
    this.logDebug(`SET Active: ${value}`);

    const run = active ? this.shouldRun(this.cacheActive && this.cacheRunning) : false;
    if (run !== this.cacheRunning) {
      await this.sendCommandOrThrow(this.buildRunParams(run));
    }

    if (active !== this.cacheActive) {
      this.logDebug(`${this.mode.name} state: ${active ? 'on' : 'off'}`);
    }
    if (run !== this.cacheRunning) {
      this.logDebug(`${this.mode.activity}: ${run ? 'on' : 'off'}`);
    }
    this.cacheActive = active;
    this.cacheRunning = run;
    this.publishState();
  }

  /**
   * Threshold onSet
   */
  private async setTarget(value: CharacteristicValue): Promise<void> {
    const target = value as number;
    if (target === this.cacheTarget) {
      return;
    }
    this.cacheTarget = target;
    this.accessory.context.cacheTarget = target;
    this.logDebug(`Target: ${target}${this.mode.unit}`);
    await this.evaluate();
  }

  /**
   * Re-evaluate the relay state in the background. On failure the cache is left
   * unchanged so the next evaluation retries.
   */
  protected evaluate(): Promise<void> {
    this.evaluation = this.evaluation
      .then(() => this.runEvaluation())
      .catch((err: unknown) => this.logError(`Failed to update ${this.mode.activity.toLowerCase()} state`, err));
    return this.evaluation;
  }

  private async runEvaluation(): Promise<void> {
    if (!this.cacheActive || this.isDestroyed) {
      return;
    }
    const run = this.shouldRun(this.cacheRunning);
    if (run === this.cacheRunning) {
      return;
    }
    if (!(await this.sendCommand(this.buildRunParams(run)))) {
      this.logError(`Failed to turn ${this.mode.activity.toLowerCase()} ${run ? 'on' : 'off'}, will retry on next update`);
      return;
    }
    this.cacheRunning = run;
    this.logDebug(`${this.mode.activity}: ${run ? 'on' : 'off'}`);
    this.publishState();
  }
}
