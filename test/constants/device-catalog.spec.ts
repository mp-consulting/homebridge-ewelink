import { describe, it, expect } from 'vitest';
import { isWaterValveDevice, getDeviceByUIID } from '../../src/constants/device-catalog.js';

describe('device-catalog', () => {
  describe('isWaterValveDevice', () => {
    it('returns true for the Zigbee Smart Water Valve (UIID 7027)', () => {
      expect(isWaterValveDevice(7027)).toBe(true);
    });

    it('returns false for a single-channel switch (UIID 1)', () => {
      expect(isWaterValveDevice(1)).toBe(false);
    });

    it('returns false for an outlet with power monitoring (UIID 32)', () => {
      expect(isWaterValveDevice(32)).toBe(false);
    });

    it('returns false for the Zigbee water leak sensor (UIID 7019)', () => {
      // Same family of devices but a sensor — must not be routed as a faucet.
      expect(isWaterValveDevice(7019)).toBe(false);
    });

    it('returns false for an unknown UIID', () => {
      expect(isWaterValveDevice(999999)).toBe(false);
    });

    it('agrees with the catalog metadata that drives the helper', () => {
      // Guards against the helper drifting from `primaryService: 'Valve'`.
      expect(getDeviceByUIID(7027)?.primaryService).toBe('Valve');
    });
  });
});
