import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Characteristic, Service, HapStatusError, HAPStatus } from '@homebridge/hap-nodejs';
import { FanAccessory } from '../../src/accessories/fan.js';
import { GarageAccessory } from '../../src/accessories/garage.js';
import { SwitchAccessory } from '../../src/accessories/switch.js';
import { OutletAccessory } from '../../src/accessories/outlet.js';
import { LightAccessory } from '../../src/accessories/light.js';
import { AirConditionerAccessory } from '../../src/accessories/air-conditioner.js';
import { CurtainAccessory } from '../../src/accessories/curtain.js';
import { TIMING } from '../../src/constants/timing-constants.js';
import { createAccessoryHarness } from './helpers.js';

const DEVICE_ID = 'test-device-001';

async function expectCommunicationFailure(promise: Promise<unknown>) {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  expect(error).toBeInstanceOf(HapStatusError);
  expect((error as HapStatusError).hapStatus).toBe(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
}

describe('Core accessories', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('FanAccessory', () => {
    it('keeps Active and RotationSpeed on partial updates without fan state', () => {
      const { handler, getService } = createAccessoryHarness(FanAccessory, {
        params: { speed: 2 },
      });
      const service = getService(Service.Fanv2);

      expect(service.getCharacteristicValue(Characteristic.Active)).toBe(1);
      expect(service.getCharacteristicValue(Characteristic.RotationSpeed)).toBe(50);

      handler.updateState({ rssi: -50 });

      expect(service.getCharacteristicValue(Characteristic.Active)).toBe(1);
      expect(service.getCharacteristicValue(Characteristic.RotationSpeed)).toBe(50);
    });

    it('updates only the speed-derived state when speed is present', () => {
      const { handler, getService } = createAccessoryHarness(FanAccessory, {
        params: { speed: 2 },
      });
      const service = getService(Service.Fanv2);

      handler.updateState({ speed: 0 });

      expect(service.getCharacteristicValue(Characteristic.Active)).toBe(0);
      expect(service.getCharacteristicValue(Characteristic.RotationSpeed)).toBe(0);
    });

    it('does not reset Active when a switches update omits the fan outlet', () => {
      const { handler, getService } = createAccessoryHarness(FanAccessory, {
        params: {
          switches: [{ outlet: 0, switch: 'off' }, { outlet: 1, switch: 'on' }],
          speed: 4,
        },
      });
      const service = getService(Service.Fanv2);
      expect(service.getCharacteristicValue(Characteristic.Active)).toBe(1);

      handler.updateState({ switches: [{ outlet: 0, switch: 'on' }] });

      expect(service.getCharacteristicValue(Characteristic.Active)).toBe(1);
      expect(service.getCharacteristicValue(Characteristic.RotationSpeed)).toBe(100);
    });
  });

  describe('GarageAccessory', () => {
    it('reverts state and throws when the trigger command fails', async () => {
      const { platform, getService } = createAccessoryHarness(GarageAccessory);
      platform.sendDeviceCommand.mockResolvedValue(false);
      const service = getService(Service.GarageDoorOpener);
      const target = service.getCharacteristic(Characteristic.TargetDoorState);

      await expectCommunicationFailure(target.triggerSet(Characteristic.TargetDoorState.OPEN));

      expect(service.getCharacteristicValue(Characteristic.CurrentDoorState))
        .toBe(Characteristic.CurrentDoorState.CLOSED);
      await expect(service.getCharacteristic(Characteristic.CurrentDoorState).triggerGet())
        .resolves.toBe(Characteristic.CurrentDoorState.CLOSED);
      await expect(target.triggerGet()).resolves.toBe(Characteristic.TargetDoorState.CLOSED);

      // Target characteristic restored after the reset delay; no movement completion scheduled
      service.updateCharacteristic(Characteristic.TargetDoorState, Characteristic.TargetDoorState.OPEN);
      await vi.advanceTimersByTimeAsync(TIMING.GARAGE_OPERATION_MS);
      expect(service.getCharacteristicValue(Characteristic.TargetDoorState))
        .toBe(Characteristic.TargetDoorState.CLOSED);
      expect(service.getCharacteristicValue(Characteristic.CurrentDoorState))
        .toBe(Characteristic.CurrentDoorState.CLOSED);
      expect(platform.sendDeviceCommand).toHaveBeenCalledTimes(1);
    });

    it('pulses the switch and completes the movement on success', async () => {
      const { platform, getService } = createAccessoryHarness(GarageAccessory);
      const service = getService(Service.GarageDoorOpener);

      await service.getCharacteristic(Characteristic.TargetDoorState)
        .triggerSet(Characteristic.TargetDoorState.OPEN);

      expect(platform.sendDeviceCommand).toHaveBeenCalledWith(DEVICE_ID, { switch: 'on' });
      expect(service.getCharacteristicValue(Characteristic.CurrentDoorState))
        .toBe(Characteristic.CurrentDoorState.OPENING);

      await vi.advanceTimersByTimeAsync(TIMING.STATE_INIT_DELAY_MS);
      expect(platform.sendDeviceCommand).toHaveBeenLastCalledWith(DEVICE_ID, { switch: 'off' });

      await vi.advanceTimersByTimeAsync(TIMING.GARAGE_OPERATION_MS);
      expect(service.getCharacteristicValue(Characteristic.CurrentDoorState))
        .toBe(Characteristic.CurrentDoorState.OPEN);
    });

    it('destroy() cancels the pending movement completion', async () => {
      const { handler, getService } = createAccessoryHarness(GarageAccessory);
      const service = getService(Service.GarageDoorOpener);

      await service.getCharacteristic(Characteristic.TargetDoorState)
        .triggerSet(Characteristic.TargetDoorState.OPEN);
      handler.destroy();
      await vi.advanceTimersByTimeAsync(TIMING.GARAGE_OPERATION_MS * 2);

      expect(service.getCharacteristicValue(Characteristic.CurrentDoorState))
        .toBe(Characteristic.CurrentDoorState.OPENING);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('SwitchAccessory', () => {
    it('sends the switch command on set', async () => {
      const { platform, getCharacteristic } = createAccessoryHarness(SwitchAccessory);

      await getCharacteristic(Service.Switch, Characteristic.On).triggerSet(true);

      expect(platform.sendDeviceCommand).toHaveBeenCalledWith(DEVICE_ID, { switch: 'on' });
    });

    it('sends the full switches array for multi-channel devices', async () => {
      const { platform, getCharacteristic } = createAccessoryHarness(SwitchAccessory, {
        params: { switches: [{ outlet: 0, switch: 'off' }, { outlet: 1, switch: 'off' }] },
        context: { switchNumber: 1 },
      });

      await getCharacteristic(Service.Switch, Characteristic.On).triggerSet(true);

      expect(platform.sendDeviceCommand).toHaveBeenCalledWith(DEVICE_ID, {
        switches: [{ outlet: 0, switch: 'off' }, { outlet: 1, switch: 'on' }],
      });
    });

    it('throws when the command fails', async () => {
      const { platform, getCharacteristic } = createAccessoryHarness(SwitchAccessory);
      platform.sendDeviceCommand.mockResolvedValue(false);

      await expectCommunicationFailure(getCharacteristic(Service.Switch, Characteristic.On).triggerSet(true));
    });

    describe('inching mode', () => {
      const inchedConfig = { singleDevices: [{ deviceId: DEVICE_ID, isInched: true }] };

      it('toggles the cached state and always sends "on"', async () => {
        const { platform, getService } = createAccessoryHarness(SwitchAccessory, { config: inchedConfig });
        const service = getService(Service.Switch);
        const on = service.getCharacteristic(Characteristic.On);

        await on.triggerSet(true);
        expect(platform.sendDeviceCommand).toHaveBeenCalledWith(DEVICE_ID, { switch: 'on' });
        expect(service.getCharacteristicValue(Characteristic.On)).toBe(true);
        await expect(on.triggerGet()).resolves.toBe(true);

        await on.triggerSet(false);
        expect(platform.sendDeviceCommand).toHaveBeenLastCalledWith(DEVICE_ID, { switch: 'on' });
        await expect(on.triggerGet()).resolves.toBe(false);
      });

      it('does not toggle state and throws when the command fails', async () => {
        const { platform, getService } = createAccessoryHarness(SwitchAccessory, { config: inchedConfig });
        platform.sendDeviceCommand.mockResolvedValue(false);
        const service = getService(Service.Switch);
        const on = service.getCharacteristic(Characteristic.On);

        await expectCommunicationFailure(on.triggerSet(true));
        await expect(on.triggerGet()).resolves.toBe(false);

        // HomeKit shows the requested value; it is reverted after the reset delay
        service.updateCharacteristic(Characteristic.On, true);
        await vi.advanceTimersByTimeAsync(TIMING.FAILED_COMMAND_RESET_MS);
        expect(service.getCharacteristicValue(Characteristic.On)).toBe(false);
      });

      it('ignores the echo of its own command but toggles on external presses', async () => {
        const { handler, getService } = createAccessoryHarness(SwitchAccessory, { config: inchedConfig });
        const service = getService(Service.Switch);
        const on = service.getCharacteristic(Characteristic.On);

        await on.triggerSet(true);
        handler.updateState({ switch: 'on' }); // echo
        await expect(on.triggerGet()).resolves.toBe(true);

        await vi.advanceTimersByTimeAsync(TIMING.INCHING_DEBOUNCE_MS);
        handler.updateState({ switch: 'on' }); // external press
        await expect(on.triggerGet()).resolves.toBe(false);
      });
    });
  });

  describe('OutletAccessory', () => {
    it('sends the switch command on set', async () => {
      const { platform, getCharacteristic } = createAccessoryHarness(OutletAccessory, {
        params: { switch: 'on' },
      });

      await getCharacteristic(Service.Outlet, Characteristic.On).triggerSet(false);

      expect(platform.sendDeviceCommand).toHaveBeenCalledWith(DEVICE_ID, { switch: 'off' });
    });

    it('derives OutletInUse from power above the threshold', () => {
      const { handler, getService } = createAccessoryHarness(OutletAccessory, {
        params: { switch: 'on', power: '0' },
        config: { singleDevices: [{ deviceId: DEVICE_ID, inUsePowerThreshold: 5 }] },
      });
      const service = getService(Service.Outlet);

      handler.updateState({ power: '12.5' });
      expect(service.getCharacteristicValue(Characteristic.OutletInUse)).toBe(true);

      handler.updateState({ power: '2' });
      expect(service.getCharacteristicValue(Characteristic.OutletInUse)).toBe(false);
    });
  });

  describe('LightAccessory', () => {
    it('sends switch and brightness commands', async () => {
      const { platform, getCharacteristic } = createAccessoryHarness(LightAccessory, {
        params: { switch: 'off', bright: 40 },
      });

      await getCharacteristic(Service.Lightbulb, Characteristic.On).triggerSet(true);
      expect(platform.sendDeviceCommand).toHaveBeenCalledWith(DEVICE_ID, { switch: 'on' });

      await getCharacteristic(Service.Lightbulb, Characteristic.Brightness).triggerSet(75);
      expect(platform.sendDeviceCommand).toHaveBeenLastCalledWith(DEVICE_ID, { bright: 75 });
    });

    it('preserves color temperature when changing brightness of white lights', async () => {
      const { platform, getCharacteristic } = createAccessoryHarness(LightAccessory, {
        params: { switch: 'on', white: { br: 20, ct: 50 } },
      });

      await getCharacteristic(Service.Lightbulb, Characteristic.Brightness).triggerSet(60);

      expect(platform.sendDeviceCommand).toHaveBeenCalledWith(DEVICE_ID, { white: { br: 60, ct: 50 } });
    });
  });

  describe('AirConditionerAccessory', () => {
    it('clamps out-of-range target temperatures from the device', () => {
      const { handler, getService } = createAccessoryHarness(AirConditionerAccessory, {
        params: { power: 'on', mode: 'cool', temperature: 40 },
      });
      const service = getService(Service.HeaterCooler);

      expect(service.getCharacteristicValue(Characteristic.CoolingThresholdTemperature)).toBe(32);
      expect(service.getCharacteristicValue(Characteristic.HeatingThresholdTemperature)).toBe(32);

      handler.updateState({ temperature: 5 });
      expect(service.getCharacteristicValue(Characteristic.CoolingThresholdTemperature)).toBe(16);
      expect(service.getCharacteristicValue(Characteristic.HeatingThresholdTemperature)).toBe(16);

      handler.updateState({ temperature: 24 });
      expect(service.getCharacteristicValue(Characteristic.CoolingThresholdTemperature)).toBe(24);
    });

    it('declares the 16-32 range on the threshold characteristics', () => {
      const { getCharacteristic } = createAccessoryHarness(AirConditionerAccessory, {
        params: { power: 'off' },
      });

      const cooling = getCharacteristic(Service.HeaterCooler, Characteristic.CoolingThresholdTemperature);
      expect(cooling.props).toMatchObject({ minValue: 16, maxValue: 32 });
    });

    it('sends the mode and throws when the command fails', async () => {
      const { platform, getCharacteristic } = createAccessoryHarness(AirConditionerAccessory, {
        params: { power: 'on', mode: 'cool' },
      });
      const targetState = getCharacteristic(Service.HeaterCooler, Characteristic.TargetHeaterCoolerState);

      await targetState.triggerSet(Characteristic.TargetHeaterCoolerState.HEAT);
      expect(platform.sendDeviceCommand).toHaveBeenCalledWith(DEVICE_ID, { mode: 'heat' });

      platform.sendDeviceCommand.mockResolvedValue(false);
      await expectCommunicationFailure(targetState.triggerSet(Characteristic.TargetHeaterCoolerState.COOL));
      await expect(targetState.triggerGet()).resolves.toBe(Characteristic.TargetHeaterCoolerState.HEAT);
    });
  });

  describe('CurtainAccessory', () => {
    it('reverts position state and throws when the move command fails', async () => {
      const { platform, getService, handler } = createAccessoryHarness(CurtainAccessory, {
        params: {},
      });
      platform.sendDeviceCommand.mockResolvedValue(false);
      const service = getService(Service.WindowCovering);

      await expectCommunicationFailure(
        service.getCharacteristic(Characteristic.TargetPosition).triggerSet(80),
      );

      expect(service.getCharacteristicValue(Characteristic.PositionState))
        .toBe(Characteristic.PositionState.STOPPED);
      handler.destroy();
    });
  });
});
