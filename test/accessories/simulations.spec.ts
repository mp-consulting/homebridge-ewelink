import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Characteristic, Service, HapStatusError, HAPStatus } from '@homebridge/hap-nodejs';
import { BlindAccessory } from '../../src/accessories/simulations/blind.js';
import { DoorAccessory } from '../../src/accessories/simulations/door.js';
import { WindowAccessory } from '../../src/accessories/simulations/window.js';
import { RFBlindAccessory } from '../../src/accessories/simulations/rf-blind.js';
import { HeaterAccessory } from '../../src/accessories/simulations/heater.js';
import { CoolerAccessory } from '../../src/accessories/simulations/cooler.js';
import { THHeaterAccessory } from '../../src/accessories/simulations/th-heater.js';
import { THCoolerAccessory } from '../../src/accessories/simulations/th-cooler.js';
import { THHumidifierAccessory } from '../../src/accessories/simulations/th-humidifier.js';
import { THDehumidifierAccessory } from '../../src/accessories/simulations/th-dehumidifier.js';
import { PurifierAccessory } from '../../src/accessories/simulations/purifier.js';
import { LightFanAccessory } from '../../src/accessories/simulations/light-fan.js';
import { SensorAccessory } from '../../src/accessories/simulations/sensor.js';
import { POLLING, TIMING } from '../../src/constants/timing-constants.js';
import { EVE_CHARACTERISTIC_UUIDS } from '../../src/utils/eve-characteristics.js';
import { createAccessoryHarness } from './helpers.js';

const DEVICE_ID = 'test-device-001';
const { PositionState } = Characteristic;

async function expectCommunicationFailure(promise: Promise<unknown>) {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  expect(error).toBeInstanceOf(HapStatusError);
  expect((error as HapStatusError).hapStatus).toBe(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
}

/** Let pending promise chains (background evaluations) settle */
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

/** Params of the n-th sendDeviceCommand call (negative = from the end) */
function sentParams(mock: { mock: { calls: unknown[][] } }, index = -1) {
  const calls = mock.mock.calls;
  return calls[index < 0 ? calls.length + index : index][1] as Record<string, unknown>;
}

describe('Simulation accessories', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Switch covers (blind/door/window)', () => {
    /** 120 s full travel in both directions */
    const coverConfig = { multiDevices: [{ deviceId: DEVICE_ID, operationTime: 120 }] };

    const createBlind = (context = {}) => {
      const harness = createAccessoryHarness(BlindAccessory, { config: coverConfig, context });
      const service = harness.getService(Service.WindowCovering);
      return { ...harness, service, target: service.getCharacteristic(Characteristic.TargetPosition) };
    };

    it('resolves onSet promptly instead of waiting for the travel time', async () => {
      const { platform, service, target } = createBlind();

      let resolved = false;
      void target.triggerSet(100).then(() => {
        resolved = true;
      });
      await flush();

      expect(resolved).toBe(true);
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ switches: [{ switch: 'on', outlet: 0 }] });
      expect(service.getCharacteristicValue(Characteristic.PositionState)).toBe(PositionState.INCREASING);
    });

    it('stops the motor and reports the target once the travel time has elapsed', async () => {
      const { platform, service, target } = createBlind();

      await target.triggerSet(50);
      await vi.advanceTimersByTimeAsync(59_000);
      expect(platform.sendDeviceCommand).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(platform.sendDeviceCommand).toHaveBeenCalledTimes(2);
      expect(sentParams(platform.sendDeviceCommand)).toEqual({
        switches: [{ switch: 'off', outlet: 0 }, { switch: 'off', outlet: 1 }],
      });
      expect(service.getCharacteristicValue(Characteristic.CurrentPosition)).toBe(50);
      expect(service.getCharacteristicValue(Characteristic.PositionState)).toBe(PositionState.STOPPED);
    });

    it('computes the reached position when a 0->100 move is interrupted after 30 s of 120 s', async () => {
      const { platform, service, target, accessory } = createBlind();

      await target.triggerSet(100);
      await vi.advanceTimersByTimeAsync(30_000);
      await target.triggerSet(0);

      expect(service.getCharacteristicValue(Characteristic.CurrentPosition)).toBe(25);
      expect(accessory.context.cacheCurrentPosition).toBe(25);
      // stop both, then move down
      expect(sentParams(platform.sendDeviceCommand, 1)).toEqual({
        switches: [{ switch: 'off', outlet: 0 }, { switch: 'off', outlet: 1 }],
      });
      expect(sentParams(platform.sendDeviceCommand, 2)).toEqual({ switches: [{ switch: 'on', outlet: 1 }] });
      expect(service.getCharacteristicValue(Characteristic.PositionState)).toBe(PositionState.DECREASING);

      // The first move's stop timer was cancelled; the new move takes 25% of 120 s = 30 s
      await vi.advanceTimersByTimeAsync(29_000);
      expect(platform.sendDeviceCommand).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(platform.sendDeviceCommand).toHaveBeenCalledTimes(4);
      expect(service.getCharacteristicValue(Characteristic.CurrentPosition)).toBe(0);
    });

    it('honours DECREASING when an interrupted closing door is retargeted', async () => {
      const harness = createAccessoryHarness(DoorAccessory, {
        config: coverConfig,
        context: { cacheCurrentPosition: 100, cacheTargetPosition: 100 },
      });
      const service = harness.getService(Service.Door);
      const target = service.getCharacteristic(Characteristic.TargetPosition);

      await target.triggerSet(0);
      expect(service.getCharacteristicValue(Characteristic.PositionState)).toBe(PositionState.DECREASING);
      await vi.advanceTimersByTimeAsync(30_000);
      await target.triggerSet(90);

      expect(service.getCharacteristicValue(Characteristic.CurrentPosition)).toBe(75);
      expect(sentParams(harness.platform.sendDeviceCommand)).toEqual({ switches: [{ switch: 'on', outlet: 0 }] });
      expect(service.getCharacteristicValue(Characteristic.PositionState)).toBe(PositionState.INCREASING);
    });

    it('uses the Window service for window simulations', () => {
      const { getService } = createAccessoryHarness(WindowAccessory, { config: coverConfig });
      expect(() => getService(Service.Window)).not.toThrow();
    });

    it('does not enter the moving state when the start command fails', async () => {
      const { platform, service, target, accessory } = createBlind();
      platform.sendDeviceCommand.mockResolvedValue(false);

      await expectCommunicationFailure(target.triggerSet(100));

      expect(accessory.context.cachePositionState).toBe(PositionState.STOPPED);
      expect(accessory.context.cacheTargetPosition).toBe(0);
      expect(service.getCharacteristicValue(Characteristic.PositionState)).toBe(PositionState.STOPPED);

      // No stop timer scheduled, TargetPosition reverted
      await vi.advanceTimersByTimeAsync(200_000);
      expect(platform.sendDeviceCommand).toHaveBeenCalledTimes(1);
      expect(service.getCharacteristicValue(Characteristic.TargetPosition)).toBe(0);
    });

    it('destroy() cancels the pending stop timer', async () => {
      const { platform, handler, target } = createBlind();

      await target.triggerSet(100);
      handler.destroy();
      await vi.advanceTimersByTimeAsync(200_000);

      expect(platform.sendDeviceCommand).toHaveBeenCalledTimes(1);
    });

    it('resets a moving state persisted before a restart', () => {
      const { service, accessory } = createBlind({
        cacheCurrentPosition: 40,
        cacheTargetPosition: 80,
        cachePositionState: PositionState.INCREASING,
      });
      expect(accessory.context.cachePositionState).toBe(PositionState.STOPPED);
      expect(service.getCharacteristicValue(Characteristic.PositionState)).toBe(PositionState.STOPPED);
      expect(service.getCharacteristicValue(Characteristic.CurrentPosition)).toBe(40);
    });
  });

  describe('RF covers', () => {
    const createRFBlind = (context = {}) => {
      const harness = createAccessoryHarness(RFBlindAccessory, {
        config: { rfDevices: [{ deviceId: DEVICE_ID, subdevices: [{ index: 0, label: 'Blind', operationTime: 120 }] }] },
        context: { name: 'Blind', buttons: { 10: 'open', 11: 'stop', 12: 'close' }, ...context },
      });
      const service = harness.getService(Service.WindowCovering);
      return { ...harness, service, target: service.getCharacteristic(Characteristic.TargetPosition) };
    };

    it('honours DECREASING when an interrupted closing move is retargeted', async () => {
      const { platform, service, target } = createRFBlind({ cacheCurrentPosition: 100, cacheTargetPosition: 100 });

      await target.triggerSet(0);
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ cmd: 'transmit', rfChl: 12 });
      await vi.advanceTimersByTimeAsync(30_000);
      await target.triggerSet(90);

      expect(service.getCharacteristicValue(Characteristic.CurrentPosition)).toBe(75);
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ cmd: 'transmit', rfChl: 10 });
      expect(service.getCharacteristicValue(Characteristic.PositionState)).toBe(PositionState.INCREASING);

      // 15% of 120 s = 18 s later the stop button is sent
      await vi.advanceTimersByTimeAsync(18_000);
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ cmd: 'transmit', rfChl: 11 });
      expect(service.getCharacteristicValue(Characteristic.CurrentPosition)).toBe(90);
    });

    it('sends stop when retargeted to the position already reached', async () => {
      const { platform, service, target } = createRFBlind();

      await target.triggerSet(100);
      await vi.advanceTimersByTimeAsync(60_000);
      await target.triggerSet(50);

      expect(sentParams(platform.sendDeviceCommand)).toEqual({ cmd: 'transmit', rfChl: 11 });
      expect(service.getCharacteristicValue(Characteristic.PositionState)).toBe(PositionState.STOPPED);
      expect(service.getCharacteristicValue(Characteristic.CurrentPosition)).toBe(50);
    });
  });

  describe('Heater/cooler (switch + temperature source)', () => {
    const createClimate = <T extends typeof HeaterAccessory | typeof CoolerAccessory>(cls: T, temp: number) => {
      const harness = createAccessoryHarness(cls, {
        config: { singleDevices: [{ deviceId: DEVICE_ID, tempSource: 'sensor-1' }] },
      });
      harness.platform.setDeviceTemperature('sensor-1', temp);
      const service = harness.getService(Service.HeaterCooler);
      return { ...harness, service };
    };

    it('retries a failed "off" on the next temperature update and keeps reporting HEATING', async () => {
      const { platform, service } = createClimate(HeaterAccessory, 15);
      await vi.advanceTimersByTimeAsync(POLLING.INITIAL_DELAY_MS);
      expect(service.getCharacteristicValue(Characteristic.CurrentTemperature)).toBe(15);

      await service.getCharacteristic(Characteristic.Active).triggerSet(1);
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ switch: 'on' });
      expect(service.getCharacteristicValue(Characteristic.CurrentHeaterCoolerState))
        .toBe(Characteristic.CurrentHeaterCoolerState.HEATING);

      // Target reached, but the "off" command fails
      platform.sendDeviceCommand.mockResolvedValue(false);
      platform.setDeviceTemperature('sensor-1', 21);
      await vi.advanceTimersByTimeAsync(POLLING.UPDATE_INTERVAL_MS);
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ switch: 'off' });
      expect(service.getCharacteristicValue(Characteristic.CurrentHeaterCoolerState))
        .toBe(Characteristic.CurrentHeaterCoolerState.HEATING);

      // Next update (same temperature) retries and succeeds
      platform.sendDeviceCommand.mockResolvedValue(true);
      const callsBefore = platform.sendDeviceCommand.mock.calls.length;
      await vi.advanceTimersByTimeAsync(POLLING.UPDATE_INTERVAL_MS);
      expect(platform.sendDeviceCommand.mock.calls.length).toBe(callsBefore + 1);
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ switch: 'off' });
      expect(service.getCharacteristicValue(Characteristic.CurrentHeaterCoolerState))
        .toBe(Characteristic.CurrentHeaterCoolerState.IDLE);
    });

    it('sends "off" when deactivated while running', async () => {
      const { platform, service } = createClimate(HeaterAccessory, 15);
      await vi.advanceTimersByTimeAsync(POLLING.INITIAL_DELAY_MS);
      const active = service.getCharacteristic(Characteristic.Active);

      await active.triggerSet(1);
      await active.triggerSet(0);

      expect(sentParams(platform.sendDeviceCommand)).toEqual({ switch: 'off' });
      expect(service.getCharacteristicValue(Characteristic.CurrentHeaterCoolerState))
        .toBe(Characteristic.CurrentHeaterCoolerState.INACTIVE);
    });

    it('throws and keeps the previous state when activation fails', async () => {
      const { platform, service } = createClimate(CoolerAccessory, 30);
      await vi.advanceTimersByTimeAsync(POLLING.INITIAL_DELAY_MS);
      platform.sendDeviceCommand.mockResolvedValue(false);

      await expectCommunicationFailure(service.getCharacteristic(Characteristic.Active).triggerSet(1));
      expect(await service.getCharacteristic(Characteristic.Active).triggerGet()).toBe(0);
    });

    it.each([
      { cls: HeaterAccessory, temp: 15, idleTemp: 25, target: Characteristic.TargetHeaterCoolerState.HEAT,
        running: Characteristic.CurrentHeaterCoolerState.HEATING, threshold: Characteristic.HeatingThresholdTemperature },
      { cls: CoolerAccessory, temp: 25, idleTemp: 15, target: Characteristic.TargetHeaterCoolerState.COOL,
        running: Characteristic.CurrentHeaterCoolerState.COOLING, threshold: Characteristic.CoolingThresholdTemperature },
    ])('$cls.name runs on its side of the target and idles on the other', async ({ cls, temp, idleTemp, target, running, threshold }) => {
      const { platform, service } = createClimate(cls, temp);
      await vi.advanceTimersByTimeAsync(POLLING.INITIAL_DELAY_MS);

      expect(service.getCharacteristic(Characteristic.TargetHeaterCoolerState).props.validValues).toEqual([target]);
      expect(service.getCharacteristicValue(threshold)).toBe(20);

      await service.getCharacteristic(Characteristic.Active).triggerSet(1);
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ switch: 'on' });
      expect(service.getCharacteristicValue(Characteristic.CurrentHeaterCoolerState)).toBe(running);

      platform.setDeviceTemperature('sensor-1', idleTemp);
      await vi.advanceTimersByTimeAsync(POLLING.UPDATE_INTERVAL_MS);
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ switch: 'off' });
      expect(service.getCharacteristicValue(Characteristic.CurrentHeaterCoolerState))
        .toBe(Characteristic.CurrentHeaterCoolerState.IDLE);
    });
  });

  describe('TH heater/cooler hysteresis', () => {
    const thParams = (temp: number, humidity = 50) => ({ currentTemperature: temp, currentHumidity: humidity });

    const createTH = <T extends typeof THHeaterAccessory | typeof THCoolerAccessory>(
      cls: T,
      target: number,
      temp: number,
      threshold: number | null = 1, // null = not configured
    ) => {
      const thDevice = threshold === null ? { deviceId: DEVICE_ID } : { deviceId: DEVICE_ID, targetTempThreshold: threshold };
      const harness = createAccessoryHarness(cls, {
        config: { thDevices: [thDevice] },
        params: thParams(temp),
        context: { cacheTarget: target },
      });
      const service = harness.getService(Service.HeaterCooler);
      const state = () => service.getCharacteristicValue(Characteristic.CurrentHeaterCoolerState);
      return { ...harness, service, state };
    };

    it('THCooler only starts above target + threshold and stops at target', async () => {
      const { platform, handler, service, state } = createTH(THCoolerAccessory, 24, 25);
      const { IDLE, COOLING } = Characteristic.CurrentHeaterCoolerState;

      await service.getCharacteristic(Characteristic.Active).triggerSet(1);
      expect(platform.sendDeviceCommand).not.toHaveBeenCalled();
      expect(state()).toBe(IDLE);

      handler.updateState(thParams(25));
      await flush();
      expect(platform.sendDeviceCommand).not.toHaveBeenCalled();

      handler.updateState(thParams(25.5));
      await flush();
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ deviceType: 'normal', mainSwitch: 'on', switch: 'on' });
      expect(state()).toBe(COOLING);

      handler.updateState(thParams(24.5));
      await flush();
      expect(platform.sendDeviceCommand).toHaveBeenCalledTimes(1);
      expect(state()).toBe(COOLING);

      handler.updateState(thParams(24));
      await flush();
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ deviceType: 'normal', mainSwitch: 'off', switch: 'off' });
      expect(state()).toBe(IDLE);
    });

    it('THHeater mirrors the cooler hysteresis', async () => {
      const { platform, handler, service, state } = createTH(THHeaterAccessory, 20, 19.5);
      const { IDLE, HEATING } = Characteristic.CurrentHeaterCoolerState;

      await service.getCharacteristic(Characteristic.Active).triggerSet(1);
      expect(platform.sendDeviceCommand).not.toHaveBeenCalled();
      expect(state()).toBe(IDLE);

      handler.updateState(thParams(18.5));
      await flush();
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ deviceType: 'normal', mainSwitch: 'on', switch: 'on' });
      expect(state()).toBe(HEATING);

      handler.updateState(thParams(19.5));
      await flush();
      expect(platform.sendDeviceCommand).toHaveBeenCalledTimes(1);

      handler.updateState(thParams(20));
      await flush();
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ deviceType: 'normal', mainSwitch: 'off', switch: 'off' });
      expect(state()).toBe(IDLE);
    });

    it('THCooler defaults to no hysteresis (switches exactly at the target, like the original)', async () => {
      const { platform, handler, service, state } = createTH(THCoolerAccessory, 24, 24, null);
      const { IDLE, COOLING } = Characteristic.CurrentHeaterCoolerState;

      await service.getCharacteristic(Characteristic.Active).triggerSet(1);
      expect(platform.sendDeviceCommand).not.toHaveBeenCalled();

      handler.updateState(thParams(24.1));
      await flush();
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ deviceType: 'normal', mainSwitch: 'on', switch: 'on' });
      expect(state()).toBe(COOLING);

      handler.updateState(thParams(24));
      await flush();
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ deviceType: 'normal', mainSwitch: 'off', switch: 'off' });
      expect(state()).toBe(IDLE);
    });

    it('THHeater defaults to a 0.5 threshold', async () => {
      const { platform, handler, service, state } = createTH(THHeaterAccessory, 20, 19.6, null);

      await service.getCharacteristic(Characteristic.Active).triggerSet(1);
      expect(platform.sendDeviceCommand).not.toHaveBeenCalled();

      handler.updateState(thParams(19.4));
      await flush();
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ deviceType: 'normal', mainSwitch: 'on', switch: 'on' });
      expect(state()).toBe(Characteristic.CurrentHeaterCoolerState.HEATING);
    });

    it('honours an explicitly configured threshold of 0', async () => {
      const heater = createTH(THHeaterAccessory, 20, 19.9, 0);
      await heater.service.getCharacteristic(Characteristic.Active).triggerSet(1);
      expect(heater.state()).toBe(Characteristic.CurrentHeaterCoolerState.HEATING);
    });

    it('keeps the cache unchanged when a background command fails, so the next report retries', async () => {
      const { platform, handler, service, state } = createTH(THHeaterAccessory, 20, 15);
      await service.getCharacteristic(Characteristic.Active).triggerSet(1);
      expect(state()).toBe(Characteristic.CurrentHeaterCoolerState.HEATING);

      platform.sendDeviceCommand.mockResolvedValue(false);
      handler.updateState(thParams(21));
      await flush();
      expect(state()).toBe(Characteristic.CurrentHeaterCoolerState.HEATING);

      platform.sendDeviceCommand.mockResolvedValue(true);
      handler.updateState(thParams(21));
      await flush();
      expect(state()).toBe(Characteristic.CurrentHeaterCoolerState.IDLE);
    });
  });

  describe('TH humidifier/dehumidifier symmetry', () => {
    it.each([
      { cls: THHumidifierAccessory, humidity: 30, idle: 70, target: Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER,
        running: Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING,
        threshold: Characteristic.RelativeHumidityHumidifierThreshold },
      { cls: THDehumidifierAccessory, humidity: 70, idle: 30, target: Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER,
        running: Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING,
        threshold: Characteristic.RelativeHumidityDehumidifierThreshold },
    ])('$cls.name runs on its side of the target', async ({ cls, humidity, idle, target, running, threshold }) => {
      const { platform, handler, getService } = createAccessoryHarness(cls, {
        params: { currentTemperature: 21, currentHumidity: humidity },
      });
      const service = getService(Service.HumidifierDehumidifier);
      const tempService = getService(Service.TemperatureSensor, 'temp');

      expect(service.getCharacteristic(Characteristic.TargetHumidifierDehumidifierState).props.validValues).toEqual([target]);
      expect(service.getCharacteristicValue(threshold)).toBe(50);
      expect(service.getCharacteristicValue(Characteristic.CurrentRelativeHumidity)).toBe(humidity);
      expect(tempService.getCharacteristicValue(Characteristic.CurrentTemperature)).toBe(21);

      await service.getCharacteristic(Characteristic.Active).triggerSet(1);
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ deviceType: 'normal', mainSwitch: 'on', switch: 'on' });
      expect(service.getCharacteristicValue(Characteristic.CurrentHumidifierDehumidifierState)).toBe(running);

      handler.updateState({ currentHumidity: idle });
      await flush();
      expect(sentParams(platform.sendDeviceCommand)).toEqual({ deviceType: 'normal', mainSwitch: 'off', switch: 'off' });
      expect(service.getCharacteristicValue(Characteristic.CurrentHumidifierDehumidifierState))
        .toBe(Characteristic.CurrentHumidifierDehumidifierState.IDLE);
    });
  });

  describe('Other switch simulations', () => {
    it('reads DUALR3 power from the channel suffix (actPow_01 for channel 1)', () => {
      const { handler, getService } = createAccessoryHarness(PurifierAccessory, {
        device: { extra: { uiid: 126 } as never },
        params: { switches: [{ outlet: 0, switch: 'off' }, { outlet: 1, switch: 'on' }] },
        context: { channelIndex: 1 },
      });
      const service = getService(Service.AirPurifier);

      handler.updateState({ actPow_00: 1000, actPow_01: 2550 });

      expect(service.getCharacteristicValue(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption)).toBe(25.5);
      // DUALR3 is catalogued with basic (power only) readings
      expect(service.getCharacteristicValue(EVE_CHARACTERISTIC_UUIDS.Voltage)).toBeUndefined();
    });

    it('purifier keeps its state and throws when the command fails', async () => {
      const { platform, getService } = createAccessoryHarness(PurifierAccessory);
      platform.sendDeviceCommand.mockResolvedValue(false);
      const service = getService(Service.AirPurifier);

      await expectCommunicationFailure(service.getCharacteristic(Characteristic.Active).triggerSet(1));
      expect(await service.getCharacteristic(Characteristic.Active).triggerGet()).toBe(0);
      expect(service.getCharacteristicValue(Characteristic.CurrentAirPurifierState)).not.toBe(2);
    });

    it('light-fan throws on a failed on/off command and debounces speed with the latest value', async () => {
      const { platform, getService } = createAccessoryHarness(LightFanAccessory, {
        device: { extra: { uiid: 44 } as never },
        params: { switch: 'off', brightness: 10 },
      });
      const service = getService(Service.Fan);

      platform.sendDeviceCommand.mockResolvedValueOnce(false);
      await expectCommunicationFailure(service.getCharacteristic(Characteristic.On).triggerSet(true));
      expect(await service.getCharacteristic(Characteristic.On).triggerGet()).toBe(false);

      const speed = service.getCharacteristic(Characteristic.RotationSpeed);
      const first = speed.triggerSet(30);
      const second = speed.triggerSet(60);
      await vi.advanceTimersByTimeAsync(TIMING.STATE_INIT_DELAY_MS);
      await Promise.all([first, second]);

      expect(platform.sendDeviceCommand).toHaveBeenCalledTimes(2);
      expect(await speed.triggerGet()).toBe(60);
    });

    it('sensor power polling is tracked and stopped by destroy()', async () => {
      const { platform, handler } = createAccessoryHarness(SensorAccessory, {
        device: { extra: { uiid: 5 } as never },
      });

      await vi.advanceTimersByTimeAsync(POLLING.INITIAL_DELAY_MS);
      expect(platform.sendDeviceCommand).toHaveBeenCalledWith(DEVICE_ID, { uiActive: POLLING.UI_ACTIVE_DURATION_S });
      const calls = platform.sendDeviceCommand.mock.calls.length;

      handler.destroy();
      await vi.advanceTimersByTimeAsync(POLLING.UPDATE_INTERVAL_MS * 3);
      expect(platform.sendDeviceCommand.mock.calls.length).toBe(calls);
    });
  });
});
