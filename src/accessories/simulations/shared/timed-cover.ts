import type { PlatformAccessory, CharacteristicValue, Service, WithUUID } from 'homebridge';
import { BaseAccessory } from '../../base.js';
import type { EWeLinkPlatform } from '../../../platform.js';
import type { AccessoryContext } from '../../../types/index.js';
import { SIMULATION_TIMING } from '../../../constants/timing-constants.js';
import { PositionState } from '../../curtain.js';

/** Movement direction of a timed cover */
export type CoverDirection = 'up' | 'down';

/**
 * Static description of a timed cover simulation
 */
export interface TimedCoverSpec {
  /** HomeKit service exposed (WindowCovering, Window or Door) */
  serviceType: WithUUID<typeof Service>;
  /** Human readable label used in logs, e.g. 'blind' */
  label: string;
  /** Conflicting services to remove from the accessory before setup */
  removeServices?: WithUUID<typeof Service>[];
}

/**
 * Position-tracking cover simulation driven by elapsed time.
 *
 * The device has no position feedback: the position is estimated from the configured
 * full-travel time. onSet starts the movement and returns immediately; a tracked timer
 * stops the motor when the target is (estimated to be) reached.
 *
 * Subclasses provide the motor commands (startMove/stopMove) and the travel times
 * (setOperationTimes, called from their constructor).
 */
export abstract class TimedCoverAccessory extends BaseAccessory {
  /** Deciseconds needed to travel 1% upwards */
  private dsPerPercentUp = SIMULATION_TIMING.DEFAULT_OPERATION_TIME_S * 10 / 100;

  /** Deciseconds needed to travel 1% downwards */
  private dsPerPercentDown = SIMULATION_TIMING.DEFAULT_OPERATION_TIME_S * 10 / 100;

  /** Pending "stop at target" timer */
  private moveTimer?: NodeJS.Timeout;

  /**
   * Whether an in-progress movement is explicitly stopped before moving towards a new target.
   * RF motors simply receive the new direction command instead.
   */
  protected stopBeforeRetarget = true;

  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
    protected readonly spec: TimedCoverSpec,
  ) {
    super(platform, accessory);

    for (const serviceType of spec.removeServices ?? []) {
      this.removeServiceIfExists(serviceType);
    }

    const ctx = this.accessory.context;
    if (ctx.cacheCurrentPosition === undefined) {
      ctx.cacheCurrentPosition = 0;
      ctx.cacheTargetPosition = 0;
    }
    // No movement survives a restart (its stop timer is gone): start from a stopped state
    ctx.cachePositionState = PositionState.STOPPED;

    this.service = this.getOrAddService(spec.serviceType);

    this.service.updateCharacteristic(this.Characteristic.CurrentPosition, this.currentPosition);
    this.service.updateCharacteristic(this.Characteristic.TargetPosition, this.targetPosition);
    this.service.updateCharacteristic(this.Characteristic.PositionState, PositionState.STOPPED);

    this.service.getCharacteristic(this.Characteristic.TargetPosition)
      .onSet(this.setTargetPosition.bind(this));

    if (!platform.config.disableNoResponse) {
      this.service.getCharacteristic(this.Characteristic.CurrentPosition)
        .onGet(() => this.handleGet(() => this.currentPosition, 'CurrentPosition'));
      this.service.getCharacteristic(this.Characteristic.TargetPosition)
        .onGet(() => this.handleGet(() => this.targetPosition, 'TargetPosition'));
    }
  }

  /**
   * Start the motor in the given direction
   * @returns true if the device acknowledged the command
   */
  protected abstract startMove(direction: CoverDirection): Promise<boolean>;

  /**
   * Stop the motor
   * @returns true if the device acknowledged the command
   */
  protected abstract stopMove(): Promise<boolean>;

  /**
   * Configure full travel times and log the initialisation
   * @param upSeconds - Seconds to fully open
   * @param downSeconds - Seconds to fully close
   */
  protected setOperationTimes(upSeconds: number, downSeconds: number): void {
    this.dsPerPercentUp = upSeconds * 10 / 100;
    this.dsPerPercentDown = downSeconds * 10 / 100;
    this.logInfo(`Initialized as ${this.spec.label} (operation time: ${upSeconds}s up, ${downSeconds}s down)`);
  }

  private get currentPosition(): number {
    return this.accessory.context.cacheCurrentPosition ?? 0;
  }

  private get targetPosition(): number {
    return this.accessory.context.cacheTargetPosition ?? 0;
  }

  /** Current time in deciseconds (unit of cacheLastStartTime) */
  private nowDs(): number {
    return Math.floor(Date.now() / 100);
  }

  /**
   * Estimate the position reached by the movement in progress
   */
  private estimatePosition(state: PositionState): number {
    const elapsedDs = Math.max(0, this.nowDs() - (this.accessory.context.cacheLastStartTime ?? 0));
    const start = this.currentPosition;
    const target = this.targetPosition;
    if (state === PositionState.DECREASING) {
      return this.clamp(start - Math.floor(elapsedDs / this.dsPerPercentDown), Math.min(target, start), 100);
    }
    return this.clamp(start + Math.floor(elapsedDs / this.dsPerPercentUp), 0, Math.max(target, start));
  }

  private setPositionState(state: PositionState): void {
    this.accessory.context.cachePositionState = state;
    this.service.updateCharacteristic(this.Characteristic.PositionState, state);
  }

  private setCurrentPosition(position: number): void {
    this.accessory.context.cacheCurrentPosition = position;
    this.service.updateCharacteristic(this.Characteristic.CurrentPosition, position);
  }

  /**
   * Revert TargetPosition in HomeKit and report a communication failure
   */
  private failSet(message: string): never {
    this.logError(message);
    this.revertCharacteristicLater(
      this.service,
      this.Characteristic.TargetPosition,
      this.targetPosition,
      SIMULATION_TIMING.POSITION_CLEANUP_MS,
    );
    throw this.createCommunicationError();
  }

  /**
   * Set target position: start moving and return; a tracked timer stops the motor at the target
   */
  private async setTargetPosition(value: CharacteristicValue): Promise<void> {
    const target = value as number;
    const ctx = this.accessory.context;
    const prevState = (ctx.cachePositionState ?? PositionState.STOPPED) as PositionState;
    const wasMoving = prevState !== PositionState.STOPPED;

    if (!wasMoving && target === this.currentPosition) {
      return;
    }

    let position = this.currentPosition;
    let stopped = !wasMoving;

    if (wasMoving) {
      // Supersede the pending stop timer and work out where we are now
      this.clearTrackedTimeout(this.moveTimer);
      this.moveTimer = undefined;
      position = this.estimatePosition(prevState);
      this.setCurrentPosition(position);
      ctx.cacheLastStartTime = this.nowDs();

      if (this.stopBeforeRetarget || target === position) {
        if (!(await this.stopMove())) {
          // Still moving towards the previous target: let it finish
          this.scheduleStop(prevState === PositionState.INCREASING ? 'up' : 'down', this.targetPosition, position);
          this.failSet(`Failed to stop ${this.spec.label}`);
        }
        stopped = true;
        this.setPositionState(PositionState.STOPPED);
      }
    }

    if (target === position) {
      ctx.cacheTargetPosition = target;
      if (!stopped) {
        this.setPositionState(PositionState.STOPPED);
      }
      return;
    }

    const direction: CoverDirection = target > position ? 'up' : 'down';
    const dsToMove = Math.round(Math.abs(target - position) * (direction === 'up' ? this.dsPerPercentUp : this.dsPerPercentDown));

    this.logDebug(`Moving from ${position}% to ${target}% - ${direction} for ${dsToMove / 10}s`);

    if (!(await this.startMove(direction))) {
      if (!stopped) {
        // Never stopped: still travelling towards the previous target
        this.scheduleStop(prevState === PositionState.INCREASING ? 'up' : 'down', this.targetPosition, position);
      }
      this.failSet(`Failed to set ${this.spec.label} position`);
    }

    ctx.cacheTargetPosition = target;
    ctx.cacheLastStartTime = this.nowDs();
    this.setPositionState(direction === 'up' ? PositionState.INCREASING : PositionState.DECREASING);
    this.scheduleStop(direction, target, position, dsToMove * 100);
  }

  /**
   * Schedule the stop of the current movement
   * @param direction - Direction of travel
   * @param target - Target position
   * @param from - Position at the start of this movement segment
   * @param delayMs - Delay; computed from the remaining distance when omitted
   */
  private scheduleStop(direction: CoverDirection, target: number, from: number, delayMs?: number): void {
    const ms = delayMs ?? Math.abs(target - from) * (direction === 'up' ? this.dsPerPercentUp : this.dsPerPercentDown) * 100;
    this.clearTrackedTimeout(this.moveTimer);
    this.moveTimer = this.setTrackedTimeout(() => {
      this.moveTimer = undefined;
      void this.finishMove(target);
    }, ms);
  }

  /**
   * Stop the motor once the target has been reached
   */
  private async finishMove(target: number): Promise<void> {
    if (!(await this.stopMove())) {
      this.logError(`Failed to stop ${this.spec.label} at ${target}%`);
    }
    if (this.isDestroyed || this.moveTimer) {
      // Destroyed, or superseded by a new target while the stop command was in flight
      return;
    }
    this.setPositionState(PositionState.STOPPED);
    this.setCurrentPosition(target);
    this.logInfo(`${this.spec.label.charAt(0).toUpperCase()}${this.spec.label.slice(1)} position set to ${target}%`);
  }
}
