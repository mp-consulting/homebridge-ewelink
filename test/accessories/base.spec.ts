import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Characteristic, Service, HapStatusError, HAPStatus } from '@homebridge/hap-nodejs';
import { BaseAccessory } from '../../src/accessories/base.js';
import type { DeviceParams } from '../../src/types/index.js';
import { EVE_CHARACTERISTIC_UUIDS } from '../../src/utils/eve-characteristics.js';
import { POLLING, TIMING } from '../../src/constants/timing-constants.js';
import { createAccessoryHarness } from './helpers.js';

/**
 * Concrete accessory exposing protected helpers for testing
 */
class TestAccessory extends BaseAccessory {
  constructor(...args: ConstructorParameters<typeof BaseAccessory>) {
    super(...args);
    this.service = this.getOrAddService(this.Service.Switch);
  }

  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);
  }

  get mainService() {
    return this.service;
  }

  poll(fn: () => Promise<void>, interval?: number, initial?: number) {
    return this.setupPollingInterval(fn, interval, initial);
  }

  timeout(fn: () => void, ms: number) {
    return this.setTrackedTimeout(fn, ms);
  }

  interval(fn: () => void, ms: number) {
    return this.setTrackedInterval(fn, ms);
  }

  sleep(ms: number) {
    return this.trackedSleep(ms);
  }

  latest(key: string) {
    return this.claimLatest(key);
  }

  debounce(key: string, ms: number) {
    return this.debounceLatest(key, ms);
  }

  revert(value: boolean, delay?: number) {
    this.revertCharacteristicLater(this.service, this.Characteristic.On, value, delay);
  }

  sendOrThrow(params: DeviceParams) {
    return this.sendCommandOrThrow(params);
  }

  power(params: DeviceParams, options?: { suffix?: string; fullReadings?: boolean }) {
    this.updateDualR3PowerReadings(this.service, params, options);
  }

  uiActive(outlet?: number) {
    return this.requestUiActiveUpdate(outlet);
  }

  config<T extends { deviceId: string }>(list?: T[]) {
    return this.getDeviceConfig(list);
  }

  cleanup(fn: () => void) {
    return this.registerCleanup(fn);
  }
}

describe('BaseAccessory', () => {
  let harness: ReturnType<typeof createAccessoryHarness<TestAccessory>>;

  beforeEach(() => {
    vi.useFakeTimers();
    harness = createAccessoryHarness(TestAccessory);
  });

  describe('setupPollingInterval', () => {
    it('polls after the initial delay and then on every interval', async () => {
      const updateFn = vi.fn().mockResolvedValue(undefined);
      harness.handler.poll(updateFn);

      await vi.advanceTimersByTimeAsync(POLLING.INITIAL_DELAY_MS - 1);
      expect(updateFn).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(updateFn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(POLLING.UPDATE_INTERVAL_MS * 2);
      expect(updateFn).toHaveBeenCalledTimes(3);
    });

    it('cleanup before the first tick prevents any polling', async () => {
      const updateFn = vi.fn().mockResolvedValue(undefined);
      const cleanup = harness.handler.poll(updateFn);

      cleanup();
      await vi.advanceTimersByTimeAsync(POLLING.INITIAL_DELAY_MS + POLLING.UPDATE_INTERVAL_MS * 3);

      expect(updateFn).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('catches and logs rejections from the update function', async () => {
      const updateFn = vi.fn().mockRejectedValue(new Error('boom'));
      harness.handler.poll(updateFn, 1000, 10);

      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(1000);

      expect(updateFn).toHaveBeenCalledTimes(2);
      expect(harness.platform.log.error).toHaveBeenCalledWith(
        expect.stringContaining('Polling update failed'),
        expect.any(Error),
      );
    });

    it('catches synchronous throws from the update function', async () => {
      const updateFn = vi.fn(() => {
        throw new Error('sync boom');
      });
      harness.handler.poll(updateFn as unknown as () => Promise<void>, 1000, 10);

      await vi.advanceTimersByTimeAsync(10);

      expect(harness.platform.log.error).toHaveBeenCalled();
    });

    it('destroy() stops polling', async () => {
      const updateFn = vi.fn().mockResolvedValue(undefined);
      harness.handler.poll(updateFn, 1000, 10);

      await vi.advanceTimersByTimeAsync(10);
      expect(updateFn).toHaveBeenCalledTimes(1);

      harness.handler.destroy();
      await vi.advanceTimersByTimeAsync(10_000);

      expect(updateFn).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('does not register a shutdown listener per accessory', () => {
      harness.handler.poll(vi.fn().mockResolvedValue(undefined));
      expect(harness.platform.api.on).not.toHaveBeenCalled();
    });
  });

  describe('tracked timers and destroy()', () => {
    it('clears pending tracked timeouts and intervals', async () => {
      const timeoutFn = vi.fn();
      const intervalFn = vi.fn();
      harness.handler.timeout(timeoutFn, 100);
      harness.handler.interval(intervalFn, 50);

      harness.handler.destroy();
      await vi.advanceTimersByTimeAsync(1000);

      expect(timeoutFn).not.toHaveBeenCalled();
      expect(intervalFn).not.toHaveBeenCalled();
    });

    it('runs registered cleanups once, even if destroy() is called twice', () => {
      const cleanup = vi.fn();
      harness.handler.cleanup(cleanup);

      harness.handler.destroy();
      harness.handler.destroy();

      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('keeps running other cleanups when one throws', () => {
      const second = vi.fn();
      harness.handler.cleanup(() => {
        throw new Error('bad cleanup');
      });
      harness.handler.cleanup(second);

      harness.handler.destroy();

      expect(second).toHaveBeenCalled();
      expect(harness.platform.log.error).toHaveBeenCalled();
    });

    it('does not schedule tracked timeouts after destroy()', async () => {
      harness.handler.destroy();
      const fn = vi.fn();
      harness.handler.timeout(fn, 10);

      await vi.advanceTimersByTimeAsync(100);
      expect(fn).not.toHaveBeenCalled();
    });

    it('trackedSleep resolves true normally and false when destroyed', async () => {
      const normal = harness.handler.sleep(100);
      await vi.advanceTimersByTimeAsync(100);
      await expect(normal).resolves.toBe(true);

      const interrupted = harness.handler.sleep(100);
      harness.handler.destroy();
      await expect(interrupted).resolves.toBe(false);
    });
  });

  describe('claimLatest / debounceLatest', () => {
    it('only the most recent claim for a key is latest', () => {
      const first = harness.handler.latest('speed');
      const other = harness.handler.latest('brightness');
      const second = harness.handler.latest('speed');

      expect(first()).toBe(false);
      expect(second()).toBe(true);
      expect(other()).toBe(true);
    });

    it('debounceLatest lets only the last call through', async () => {
      const a = harness.handler.debounce('slider', 500);
      await vi.advanceTimersByTimeAsync(100);
      const b = harness.handler.debounce('slider', 500);
      await vi.advanceTimersByTimeAsync(500);

      await expect(a).resolves.toBe(false);
      await expect(b).resolves.toBe(true);
    });
  });

  describe('revertCharacteristicLater', () => {
    it('restores the value after the default delay', async () => {
      const service = harness.getService(Service.Switch);
      service.updateCharacteristic(Characteristic.On, true);

      harness.handler.revert(false);
      await vi.advanceTimersByTimeAsync(TIMING.FAILED_COMMAND_RESET_MS - 1);
      expect(service.getCharacteristicValue(Characteristic.On)).toBe(true);

      await vi.advanceTimersByTimeAsync(1);
      expect(service.getCharacteristicValue(Characteristic.On)).toBe(false);
    });

    it('is cancelled by destroy()', async () => {
      const service = harness.getService(Service.Switch);
      service.updateCharacteristic(Characteristic.On, true);

      harness.handler.revert(false, 100);
      harness.handler.destroy();
      await vi.advanceTimersByTimeAsync(1000);

      expect(service.getCharacteristicValue(Characteristic.On)).toBe(true);
    });
  });

  describe('sendCommandOrThrow', () => {
    it('resolves when the command succeeds', async () => {
      await expect(harness.handler.sendOrThrow({ switch: 'on' })).resolves.toBeUndefined();
      expect(harness.platform.sendDeviceCommand).toHaveBeenCalledWith('test-device-001', { switch: 'on' });
    });

    it('throws SERVICE_COMMUNICATION_FAILURE when the command fails', async () => {
      harness.platform.sendDeviceCommand.mockResolvedValue(false);

      const error = await harness.handler.sendOrThrow({ switch: 'on' }).catch(e => e);
      expect(error).toBeInstanceOf(HapStatusError);
      expect(error.hapStatus).toBe(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    });
  });

  describe('updateDualR3PowerReadings', () => {
    it('scales actPow/voltage/current by their divisors', () => {
      harness.handler.power({ actPow_00: 12345, voltage_00: 23010, current_00: 52 });
      const service = harness.getService(Service.Switch);

      expect(service.getCharacteristicValue(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption)).toBe(123.45);
      expect(service.getCharacteristicValue(EVE_CHARACTERISTIC_UUIDS.Voltage)).toBe(230.1);
      expect(service.getCharacteristicValue(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent)).toBe(0.52);
    });

    it('uses the channel suffix and falls back to plain readings', () => {
      harness.handler.power({ actPow_01: 500, power: '99', voltage: '229.5' }, { suffix: '01' });
      const service = harness.getService(Service.Switch);

      expect(service.getCharacteristicValue(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption)).toBe(5);
      expect(service.getCharacteristicValue(EVE_CHARACTERISTIC_UUIDS.Voltage)).toBe(229.5);
      expect(service.getCharacteristicValue(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent)).toBeUndefined();
    });

    it('skips voltage and current without full readings', () => {
      harness.handler.power({ actPow_00: 100, voltage_00: 23000 }, { fullReadings: false });
      const service = harness.getService(Service.Switch);

      expect(service.getCharacteristicValue(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption)).toBe(1);
      expect(service.getCharacteristicValue(EVE_CHARACTERISTIC_UUIDS.Voltage)).toBeUndefined();
    });
  });

  describe('requestUiActiveUpdate', () => {
    it('sends a plain uiActive for single-channel devices', async () => {
      await harness.handler.uiActive();
      expect(harness.platform.sendDeviceCommand).toHaveBeenCalledWith('test-device-001', {
        uiActive: POLLING.UI_ACTIVE_DURATION_S,
      });
    });

    it('sends an outlet-scoped uiActive for multi-channel devices', async () => {
      await harness.handler.uiActive(1);
      expect(harness.platform.sendDeviceCommand).toHaveBeenCalledWith('test-device-001', {
        uiActive: { outlet: 1, time: POLLING.UI_ACTIVE_DURATION_S },
      });
    });
  });

  describe('getDeviceConfig', () => {
    it('finds the entry for this device', () => {
      const entry = { deviceId: 'test-device-001', label: 'mine' };
      expect(harness.handler.config([{ deviceId: 'other' }, entry])).toBe(entry);
      expect(harness.handler.config(undefined)).toBeUndefined();
    });
  });
});
