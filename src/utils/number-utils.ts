/**
 * Number parsing and conversion utilities
 * Provides safe type conversion for device parameters
 */

/**
 * Convert unknown value to number safely
 * Handles numbers, strings, and other types
 * @param value - Value to convert
 * @param defaultValue - Default value if conversion fails (default: 0)
 * @returns Converted number
 */
export function toNumber(value: unknown, defaultValue = 0): number {
  // Already a number
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }

  // String - parse as float
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  // Fallback
  return defaultValue;
}

/**
 * Convert unknown value to integer safely
 * @param value - Value to convert
 * @param radix - Radix for parseInt (default: 10)
 * @param defaultValue - Default value if conversion fails (default: 0)
 * @returns Converted integer
 */
export function toInteger(value: unknown, radix = 10, defaultValue = 0): number {
  // Already a number
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return Math.floor(value);
  }

  // String - parse as int
  if (typeof value === 'string') {
    const parsed = parseInt(value, radix);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  // Fallback
  return defaultValue;
}

/**
 * Clamp a number between min and max values
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
