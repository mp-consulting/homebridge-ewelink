import { describe, it, expect } from 'vitest';
import { toNumber, toInteger, clamp } from '../../src/utils/number-utils.js';

describe('number-utils', () => {
  describe('toNumber', () => {
    describe('with number input', () => {
      it('should return the number as-is', () => {
        expect(toNumber(42)).toBe(42);
      });

      it('should handle floating point numbers', () => {
        expect(toNumber(3.14159)).toBe(3.14159);
      });

      it('should handle negative numbers', () => {
        expect(toNumber(-100)).toBe(-100);
      });

      it('should handle zero', () => {
        expect(toNumber(0)).toBe(0);
      });

      it('should return default for NaN', () => {
        expect(toNumber(NaN)).toBe(0);
      });

      it('should return custom default for NaN', () => {
        expect(toNumber(NaN, 99)).toBe(99);
      });
    });

    describe('with string input', () => {
      it('should parse integer strings', () => {
        expect(toNumber('42')).toBe(42);
      });

      it('should parse float strings', () => {
        expect(toNumber('3.14')).toBe(3.14);
      });

      it('should parse negative strings', () => {
        expect(toNumber('-100')).toBe(-100);
      });

      it('should handle leading/trailing spaces', () => {
        expect(toNumber('  42  ')).toBe(42);
      });

      it('should return default for invalid strings', () => {
        expect(toNumber('not a number')).toBe(0);
      });

      it('should return custom default for invalid strings', () => {
        expect(toNumber('invalid', 50)).toBe(50);
      });

      it('should handle empty string', () => {
        expect(toNumber('')).toBe(0);
      });
    });

    describe('with other types', () => {
      it('should return default for undefined', () => {
        expect(toNumber(undefined)).toBe(0);
      });

      it('should return default for null', () => {
        expect(toNumber(null)).toBe(0);
      });

      it('should return default for boolean', () => {
        expect(toNumber(true)).toBe(0);
        expect(toNumber(false)).toBe(0);
      });

      it('should return default for objects', () => {
        expect(toNumber({})).toBe(0);
        expect(toNumber([])).toBe(0);
      });

      it('should use custom default value', () => {
        expect(toNumber(undefined, 100)).toBe(100);
      });
    });
  });

  describe('toInteger', () => {
    describe('with number input', () => {
      it('should floor floating point numbers', () => {
        expect(toInteger(3.7)).toBe(3);
        expect(toInteger(3.2)).toBe(3);
      });

      it('should return integers as-is', () => {
        expect(toInteger(42)).toBe(42);
      });

      it('should handle negative numbers', () => {
        expect(toInteger(-3.7)).toBe(-4); // Math.floor rounds down
      });

      it('should return default for NaN', () => {
        expect(toInteger(NaN)).toBe(0);
      });
    });

    describe('with string input', () => {
      it('should parse integer strings', () => {
        expect(toInteger('42')).toBe(42);
      });

      it('should parse and truncate float strings', () => {
        expect(toInteger('3.14')).toBe(3);
      });

      it('should parse hex strings with radix 16', () => {
        expect(toInteger('ff', 16)).toBe(255);
        expect(toInteger('FF', 16)).toBe(255);
      });

      it('should parse binary strings with radix 2', () => {
        expect(toInteger('1010', 2)).toBe(10);
      });

      it('should return default for invalid strings', () => {
        expect(toInteger('not a number')).toBe(0);
      });

      it('should return custom default for invalid strings', () => {
        expect(toInteger('invalid', 10, 99)).toBe(99);
      });
    });

    describe('with other types', () => {
      it('should return default for undefined', () => {
        expect(toInteger(undefined)).toBe(0);
      });

      it('should return default for null', () => {
        expect(toInteger(null)).toBe(0);
      });

      it('should use custom default value', () => {
        expect(toInteger(undefined, 10, 50)).toBe(50);
      });
    });
  });

  describe('clamp', () => {
    it('should return value when within range', () => {
      expect(clamp(50, 0, 100)).toBe(50);
    });

    it('should return min when value is below', () => {
      expect(clamp(-10, 0, 100)).toBe(0);
    });

    it('should return max when value is above', () => {
      expect(clamp(150, 0, 100)).toBe(100);
    });

    it('should handle value equal to min', () => {
      expect(clamp(0, 0, 100)).toBe(0);
    });

    it('should handle value equal to max', () => {
      expect(clamp(100, 0, 100)).toBe(100);
    });

    it('should handle negative ranges', () => {
      expect(clamp(-50, -100, -10)).toBe(-50);
      expect(clamp(-150, -100, -10)).toBe(-100);
      expect(clamp(0, -100, -10)).toBe(-10);
    });

    it('should handle floating point values', () => {
      expect(clamp(0.5, 0, 1)).toBe(0.5);
      expect(clamp(-0.5, 0, 1)).toBe(0);
      expect(clamp(1.5, 0, 1)).toBe(1);
    });

    it('should handle when min equals max', () => {
      expect(clamp(50, 10, 10)).toBe(10);
      expect(clamp(5, 10, 10)).toBe(10);
    });
  });
});
