import { describe, it, expect } from 'vitest';
import { SwitchHelper } from '../../src/utils/switch-helper.js';
import type { DeviceParams } from '../../src/types/index.js';

describe('SwitchHelper', () => {
  describe('getCurrentState', () => {
    describe('single-channel switch', () => {
      it('should return true when switch is on', () => {
        const params: DeviceParams = { switch: 'on' };
        expect(SwitchHelper.getCurrentState(params)).toBe(true);
      });

      it('should return false when switch is off', () => {
        const params: DeviceParams = { switch: 'off' };
        expect(SwitchHelper.getCurrentState(params)).toBe(false);
      });

      it('should return false when switch is undefined', () => {
        const params: DeviceParams = {};
        expect(SwitchHelper.getCurrentState(params)).toBe(false);
      });
    });

    describe('multi-channel switch', () => {
      it('should return state for channel 0', () => {
        const params: DeviceParams = {
          switches: [
            { outlet: 0, switch: 'on' },
            { outlet: 1, switch: 'off' },
            { outlet: 2, switch: 'off' },
          ],
        };
        expect(SwitchHelper.getCurrentState(params, 0)).toBe(true);
      });

      it('should return state for channel 1', () => {
        const params: DeviceParams = {
          switches: [
            { outlet: 0, switch: 'off' },
            { outlet: 1, switch: 'on' },
            { outlet: 2, switch: 'off' },
          ],
        };
        expect(SwitchHelper.getCurrentState(params, 1)).toBe(true);
      });

      it('should return state for channel 2', () => {
        const params: DeviceParams = {
          switches: [
            { outlet: 0, switch: 'off' },
            { outlet: 1, switch: 'off' },
            { outlet: 2, switch: 'on' },
          ],
        };
        expect(SwitchHelper.getCurrentState(params, 2)).toBe(true);
      });

      it('should return false for non-existent channel', () => {
        const params: DeviceParams = {
          switches: [
            { outlet: 0, switch: 'on' },
            { outlet: 1, switch: 'on' },
          ],
        };
        expect(SwitchHelper.getCurrentState(params, 5)).toBe(false);
      });

      it('should use default channel 0 when not specified', () => {
        const params: DeviceParams = {
          switches: [
            { outlet: 0, switch: 'on' },
            { outlet: 1, switch: 'off' },
          ],
        };
        expect(SwitchHelper.getCurrentState(params)).toBe(true);
      });
    });
  });

  describe('buildSwitchParams', () => {
    describe('single-channel switch', () => {
      it('should build params to turn on', () => {
        const params: DeviceParams = { switch: 'off' };
        const result = SwitchHelper.buildSwitchParams(params, 0, true);
        expect(result).toEqual({ switch: 'on' });
      });

      it('should build params to turn off', () => {
        const params: DeviceParams = { switch: 'on' };
        const result = SwitchHelper.buildSwitchParams(params, 0, false);
        expect(result).toEqual({ switch: 'off' });
      });
    });

    describe('multi-channel switch', () => {
      it('should build params to turn on channel 0', () => {
        const params: DeviceParams = {
          switches: [
            { outlet: 0, switch: 'off' },
            { outlet: 1, switch: 'off' },
          ],
        };
        const result = SwitchHelper.buildSwitchParams(params, 0, true);
        expect(result.switches).toEqual([
          { outlet: 0, switch: 'on' },
          { outlet: 1, switch: 'off' },
        ]);
      });

      it('should build params to turn on channel 1', () => {
        const params: DeviceParams = {
          switches: [
            { outlet: 0, switch: 'off' },
            { outlet: 1, switch: 'off' },
          ],
        };
        const result = SwitchHelper.buildSwitchParams(params, 1, true);
        expect(result.switches).toEqual([
          { outlet: 0, switch: 'off' },
          { outlet: 1, switch: 'on' },
        ]);
      });

      it('should preserve other channel states when turning on', () => {
        const params: DeviceParams = {
          switches: [
            { outlet: 0, switch: 'on' },
            { outlet: 1, switch: 'off' },
            { outlet: 2, switch: 'on' },
          ],
        };
        const result = SwitchHelper.buildSwitchParams(params, 1, true);
        expect(result.switches).toEqual([
          { outlet: 0, switch: 'on' },
          { outlet: 1, switch: 'on' },
          { outlet: 2, switch: 'on' },
        ]);
      });

      it('should preserve other channel states when turning off', () => {
        const params: DeviceParams = {
          switches: [
            { outlet: 0, switch: 'on' },
            { outlet: 1, switch: 'on' },
            { outlet: 2, switch: 'on' },
          ],
        };
        const result = SwitchHelper.buildSwitchParams(params, 1, false);
        expect(result.switches).toEqual([
          { outlet: 0, switch: 'on' },
          { outlet: 1, switch: 'off' },
          { outlet: 2, switch: 'on' },
        ]);
      });
    });
  });

  describe('getChannelCount', () => {
    it('should return 1 for single-channel switch', () => {
      const params: DeviceParams = { switch: 'on' };
      expect(SwitchHelper.getChannelCount(params)).toBe(1);
    });

    it('should return correct count for multi-channel switch', () => {
      const params: DeviceParams = {
        switches: [
          { outlet: 0, switch: 'off' },
          { outlet: 1, switch: 'off' },
          { outlet: 2, switch: 'off' },
          { outlet: 3, switch: 'off' },
        ],
      };
      expect(SwitchHelper.getChannelCount(params)).toBe(4);
    });

    it('should return 1 when switches array is empty (fallback)', () => {
      // Empty array length is 0 (falsy), so returns fallback of 1
      const params: DeviceParams = { switches: [] };
      expect(SwitchHelper.getChannelCount(params)).toBe(1);
    });

    it('should return 1 when switches is undefined', () => {
      const params: DeviceParams = {};
      expect(SwitchHelper.getChannelCount(params)).toBe(1);
    });
  });

  describe('isMultiChannel', () => {
    it('should return false for single-channel switch', () => {
      const params: DeviceParams = { switch: 'on' };
      expect(SwitchHelper.isMultiChannel(params)).toBe(false);
    });

    it('should return true for multi-channel switch with 2+ channels', () => {
      const params: DeviceParams = {
        switches: [
          { outlet: 0, switch: 'off' },
          { outlet: 1, switch: 'off' },
        ],
      };
      expect(SwitchHelper.isMultiChannel(params)).toBe(true);
    });

    it('should return false for switches array with only 1 channel', () => {
      const params: DeviceParams = {
        switches: [{ outlet: 0, switch: 'off' }],
      };
      expect(SwitchHelper.isMultiChannel(params)).toBe(false);
    });

    it('should return false for empty switches array', () => {
      const params: DeviceParams = { switches: [] };
      expect(SwitchHelper.isMultiChannel(params)).toBe(false);
    });
  });

  describe('isSCMDevice', () => {
    it('should return true when switches array exists', () => {
      const params: DeviceParams = {
        switches: [{ outlet: 0, switch: 'off' }],
      };
      expect(SwitchHelper.isSCMDevice(params)).toBe(true);
    });

    it('should return true for empty switches array', () => {
      const params: DeviceParams = { switches: [] };
      expect(SwitchHelper.isSCMDevice(params)).toBe(true);
    });

    it('should return false when switches is undefined', () => {
      const params: DeviceParams = { switch: 'on' };
      expect(SwitchHelper.isSCMDevice(params)).toBe(false);
    });

    it('should return false for empty params', () => {
      const params: DeviceParams = {};
      expect(SwitchHelper.isSCMDevice(params)).toBe(false);
    });
  });
});
