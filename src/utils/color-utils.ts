import { COLOR_TEMP_MIN_MIRED, COLOR_TEMP_RANGE } from '../constants/device-constants.js';

/**
 * Color conversion utilities for RGB/HSV transformations
 */
export class ColorUtils {
  /**
   * Convert RGB values to HSV
   * @param r - Red value (0-255)
   * @param g - Green value (0-255)
   * @param b - Blue value (0-255)
   * @returns HSV object with h (0-360), s (0-100), v (0-100)
   */
  static rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    let h = 0;
    const s = max === 0 ? 0 : (diff / max) * 100;
    const v = max * 100;

    if (diff !== 0) {
      switch (max) {
        case r:
          h = ((g - b) / diff + (g < b ? 6 : 0)) * 60;
          break;
        case g:
          h = ((b - r) / diff + 2) * 60;
          break;
        case b:
          h = ((r - g) / diff + 4) * 60;
          break;
      }
    }

    return { h: Math.round(h), s: Math.round(s), v: Math.round(v) };
  }

  /**
   * Convert HSV values to RGB
   * @param h - Hue value (0-360)
   * @param s - Saturation value (0-100)
   * @param v - Value/brightness (0-100)
   * @returns RGB object with r, g, b (0-255)
   */
  static hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
    s /= 100;
    v /= 100;

    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let r = 0, g = 0, b = 0;

    if (h >= 0 && h < 60) {
      r = c; g = x; b = 0;
    } else if (h >= 60 && h < 120) {
      r = x; g = c; b = 0;
    } else if (h >= 120 && h < 180) {
      r = 0; g = c; b = x;
    } else if (h >= 180 && h < 240) {
      r = 0; g = x; b = c;
    } else if (h >= 240 && h < 300) {
      r = x; g = 0; b = c;
    } else {
      r = c; g = 0; b = x;
    }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
  }

  /**
   * Convert color temperature from 0-100 scale to mired
   * @param ct - Color temperature (0-100)
   * @returns Mired value
   */
  static ct0_100ToMired(ct: number): number {
    return Math.round(COLOR_TEMP_MIN_MIRED + (ct / 100) * COLOR_TEMP_RANGE);
  }

  /**
   * Convert color temperature from mired to 0-100 scale
   * @param mired - Mired value
   * @returns Color temperature (0-100)
   */
  static miredToCt0_100(mired: number): number {
    return Math.round(((mired - COLOR_TEMP_MIN_MIRED) / COLOR_TEMP_RANGE) * 100);
  }
}
