import { describe, it, expect } from 'vitest';
import { getErrorMessage, getErrorCode } from '../../src/utils/error-utils.js';

describe('error-utils', () => {
  describe('getErrorMessage', () => {
    it('should extract message from Error instance', () => {
      const error = new Error('Something went wrong');
      expect(getErrorMessage(error)).toBe('Something went wrong');
    });

    it('should extract message from TypeError', () => {
      const error = new TypeError('Type error occurred');
      expect(getErrorMessage(error)).toBe('Type error occurred');
    });

    it('should extract message from RangeError', () => {
      const error = new RangeError('Value out of range');
      expect(getErrorMessage(error)).toBe('Value out of range');
    });

    it('should convert string to message', () => {
      expect(getErrorMessage('Direct string error')).toBe('Direct string error');
    });

    it('should convert number to string', () => {
      expect(getErrorMessage(404)).toBe('404');
    });

    it('should convert null to string', () => {
      expect(getErrorMessage(null)).toBe('null');
    });

    it('should convert undefined to string', () => {
      expect(getErrorMessage(undefined)).toBe('undefined');
    });

    it('should convert object to string', () => {
      expect(getErrorMessage({ error: 'test' })).toBe('[object Object]');
    });

    it('should convert boolean to string', () => {
      expect(getErrorMessage(true)).toBe('true');
      expect(getErrorMessage(false)).toBe('false');
    });
  });

  describe('getErrorCode', () => {
    it('should extract code from object with code property', () => {
      const error = { code: 'ECONNREFUSED' };
      expect(getErrorCode(error)).toBe('ECONNREFUSED');
    });

    it('should extract numeric code', () => {
      const error = { code: 500 };
      expect(getErrorCode(error)).toBe(500);
    });

    it('should extract code from Error with code', () => {
      const error = new Error('Network error') as Error & { code: string };
      error.code = 'ETIMEDOUT';
      expect(getErrorCode(error)).toBe('ETIMEDOUT');
    });

    it('should return undefined for Error without code', () => {
      const error = new Error('Regular error');
      expect(getErrorCode(error)).toBeUndefined();
    });

    it('should return undefined for string', () => {
      expect(getErrorCode('error string')).toBeUndefined();
    });

    it('should return undefined for number', () => {
      expect(getErrorCode(500)).toBeUndefined();
    });

    it('should return undefined for null', () => {
      expect(getErrorCode(null)).toBeUndefined();
    });

    it('should return undefined for undefined', () => {
      expect(getErrorCode(undefined)).toBeUndefined();
    });

    it('should return undefined for empty object', () => {
      expect(getErrorCode({})).toBeUndefined();
    });

    it('should return undefined for object with different properties', () => {
      expect(getErrorCode({ message: 'test', status: 404 })).toBeUndefined();
    });
  });
});
