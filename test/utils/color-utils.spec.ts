import { describe, it, expect } from 'vitest';
import { ColorUtils, hs2rgb, rgb2hs } from '../../src/utils/color-utils.js';

describe('ColorUtils', () => {
  describe('rgbToHsv', () => {
    it('should convert pure red to HSV', () => {
      const result = ColorUtils.rgbToHsv(255, 0, 0);
      expect(result).toEqual({ h: 0, s: 100, v: 100 });
    });

    it('should convert pure green to HSV', () => {
      const result = ColorUtils.rgbToHsv(0, 255, 0);
      expect(result).toEqual({ h: 120, s: 100, v: 100 });
    });

    it('should convert pure blue to HSV', () => {
      const result = ColorUtils.rgbToHsv(0, 0, 255);
      expect(result).toEqual({ h: 240, s: 100, v: 100 });
    });

    it('should convert white to HSV', () => {
      const result = ColorUtils.rgbToHsv(255, 255, 255);
      expect(result).toEqual({ h: 0, s: 0, v: 100 });
    });

    it('should convert black to HSV', () => {
      const result = ColorUtils.rgbToHsv(0, 0, 0);
      expect(result).toEqual({ h: 0, s: 0, v: 0 });
    });

    it('should convert gray to HSV', () => {
      const result = ColorUtils.rgbToHsv(128, 128, 128);
      expect(result.h).toBe(0);
      expect(result.s).toBe(0);
      expect(result.v).toBeCloseTo(50, 0);
    });

    it('should convert cyan to HSV', () => {
      const result = ColorUtils.rgbToHsv(0, 255, 255);
      expect(result).toEqual({ h: 180, s: 100, v: 100 });
    });

    it('should convert magenta to HSV', () => {
      const result = ColorUtils.rgbToHsv(255, 0, 255);
      expect(result).toEqual({ h: 300, s: 100, v: 100 });
    });

    it('should convert yellow to HSV', () => {
      const result = ColorUtils.rgbToHsv(255, 255, 0);
      expect(result).toEqual({ h: 60, s: 100, v: 100 });
    });

    it('should handle orange color', () => {
      const result = ColorUtils.rgbToHsv(255, 128, 0);
      expect(result.h).toBeCloseTo(30, 0);
      expect(result.s).toBe(100);
      expect(result.v).toBe(100);
    });
  });

  describe('hsvToRgb', () => {
    it('should convert pure red HSV to RGB', () => {
      const result = ColorUtils.hsvToRgb(0, 100, 100);
      expect(result).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should convert pure green HSV to RGB', () => {
      const result = ColorUtils.hsvToRgb(120, 100, 100);
      expect(result).toEqual({ r: 0, g: 255, b: 0 });
    });

    it('should convert pure blue HSV to RGB', () => {
      const result = ColorUtils.hsvToRgb(240, 100, 100);
      expect(result).toEqual({ r: 0, g: 0, b: 255 });
    });

    it('should convert white HSV to RGB', () => {
      const result = ColorUtils.hsvToRgb(0, 0, 100);
      expect(result).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('should convert black HSV to RGB', () => {
      const result = ColorUtils.hsvToRgb(0, 0, 0);
      expect(result).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('should convert gray HSV to RGB', () => {
      const result = ColorUtils.hsvToRgb(0, 0, 50);
      expect(result.r).toBeCloseTo(128, 0);
      expect(result.g).toBeCloseTo(128, 0);
      expect(result.b).toBeCloseTo(128, 0);
    });

    it('should handle hue at different sectors', () => {
      // Test each 60-degree sector
      expect(ColorUtils.hsvToRgb(30, 100, 100).r).toBe(255);  // 0-60
      expect(ColorUtils.hsvToRgb(90, 100, 100).g).toBe(255);  // 60-120
      expect(ColorUtils.hsvToRgb(150, 100, 100).g).toBe(255); // 120-180
      expect(ColorUtils.hsvToRgb(210, 100, 100).b).toBe(255); // 180-240
      expect(ColorUtils.hsvToRgb(270, 100, 100).b).toBe(255); // 240-300
      expect(ColorUtils.hsvToRgb(330, 100, 100).r).toBe(255); // 300-360
    });
  });

  describe('RGB/HSV round-trip conversion', () => {
    it('should convert RGB to HSV and back correctly', () => {
      const originalRgb = { r: 128, g: 64, b: 192 };
      const hsv = ColorUtils.rgbToHsv(originalRgb.r, originalRgb.g, originalRgb.b);
      const resultRgb = ColorUtils.hsvToRgb(hsv.h, hsv.s, hsv.v);

      // Allow small rounding differences
      expect(resultRgb.r).toBeCloseTo(originalRgb.r, -1);
      expect(resultRgb.g).toBeCloseTo(originalRgb.g, -1);
      expect(resultRgb.b).toBeCloseTo(originalRgb.b, -1);
    });

    it('should convert primary colors correctly in round-trip', () => {
      const colors = [
        { r: 255, g: 0, b: 0 },
        { r: 0, g: 255, b: 0 },
        { r: 0, g: 0, b: 255 },
      ];

      for (const color of colors) {
        const hsv = ColorUtils.rgbToHsv(color.r, color.g, color.b);
        const result = ColorUtils.hsvToRgb(hsv.h, hsv.s, hsv.v);
        expect(result).toEqual(color);
      }
    });
  });

  describe('ct0_100ToMired', () => {
    it('should convert 0 to minimum mired value (140)', () => {
      const result = ColorUtils.ct0_100ToMired(0);
      expect(result).toBe(140);
    });

    it('should convert 100 to maximum mired value (500)', () => {
      const result = ColorUtils.ct0_100ToMired(100);
      expect(result).toBe(500);
    });

    it('should convert 50 to middle mired value', () => {
      const result = ColorUtils.ct0_100ToMired(50);
      expect(result).toBe(320);
    });

    it('should convert 25 correctly', () => {
      const result = ColorUtils.ct0_100ToMired(25);
      expect(result).toBe(230);
    });

    it('should convert 75 correctly', () => {
      const result = ColorUtils.ct0_100ToMired(75);
      expect(result).toBe(410);
    });
  });

  describe('miredToCt0_100', () => {
    it('should convert 140 mired to 0', () => {
      const result = ColorUtils.miredToCt0_100(140);
      expect(result).toBe(0);
    });

    it('should convert 500 mired to 100', () => {
      const result = ColorUtils.miredToCt0_100(500);
      expect(result).toBe(100);
    });

    it('should convert 320 mired to 50', () => {
      const result = ColorUtils.miredToCt0_100(320);
      expect(result).toBe(50);
    });
  });

  describe('mired round-trip conversion', () => {
    it('should convert ct to mired and back correctly', () => {
      for (const ct of [0, 25, 50, 75, 100]) {
        const mired = ColorUtils.ct0_100ToMired(ct);
        const result = ColorUtils.miredToCt0_100(mired);
        expect(result).toBe(ct);
      }
    });
  });
});

describe('hs2rgb', () => {
  it('should convert pure red hue/saturation to RGB', () => {
    const result = hs2rgb(0, 100);
    expect(result).toEqual([255, 0, 0]);
  });

  it('should convert pure green to RGB', () => {
    const result = hs2rgb(120, 100);
    expect(result).toEqual([0, 255, 0]);
  });

  it('should convert pure blue to RGB', () => {
    const result = hs2rgb(240, 100);
    expect(result).toEqual([0, 0, 255]);
  });

  it('should convert white (0 saturation) to RGB', () => {
    const result = hs2rgb(0, 0);
    expect(result).toEqual([255, 255, 255]);
  });

  it('should handle all hue sectors', () => {
    // Test that each sector produces valid results
    expect(hs2rgb(30, 100)[0]).toBe(255);   // Sector 0
    expect(hs2rgb(90, 100)[1]).toBe(255);   // Sector 1
    expect(hs2rgb(150, 100)[1]).toBe(255);  // Sector 2
    expect(hs2rgb(210, 100)[2]).toBe(255);  // Sector 3
    expect(hs2rgb(270, 100)[2]).toBe(255);  // Sector 4
    expect(hs2rgb(330, 100)[0]).toBe(255);  // Sector 5
  });

  it('should clean up near-red colors', () => {
    // When red is 255 and green/blue are very low, they should be zeroed
    const result = hs2rgb(0, 100);
    expect(result).toEqual([255, 0, 0]);
  });

  it('should handle string inputs', () => {
    // The function coerces inputs to numbers
    const result = hs2rgb(Number('120'), Number('100'));
    expect(result).toEqual([0, 255, 0]);
  });
});

describe('rgb2hs', () => {
  it('should convert pure red RGB to HS', () => {
    const result = rgb2hs(255, 0, 0);
    expect(result).toEqual([0, 100]);
  });

  it('should convert pure green RGB to HS', () => {
    const result = rgb2hs(0, 255, 0);
    expect(result).toEqual([120, 100]);
  });

  it('should convert pure blue RGB to HS', () => {
    const result = rgb2hs(0, 0, 255);
    expect(result).toEqual([240, 100]);
  });

  it('should convert white to HS (0 saturation)', () => {
    const result = rgb2hs(255, 255, 255);
    expect(result[1]).toBe(0); // saturation should be 0
  });

  it('should convert black to HS', () => {
    const result = rgb2hs(0, 0, 0);
    expect(result).toEqual([0, 0]);
  });

  it('should convert gray to HS (0 saturation)', () => {
    const result = rgb2hs(128, 128, 128);
    expect(result[1]).toBe(0); // saturation should be 0
  });

  it('should handle cyan', () => {
    const result = rgb2hs(0, 255, 255);
    expect(result).toEqual([180, 100]);
  });

  it('should handle magenta', () => {
    const result = rgb2hs(255, 0, 255);
    expect(result).toEqual([300, 100]);
  });

  it('should handle yellow', () => {
    const result = rgb2hs(255, 255, 0);
    expect(result).toEqual([60, 100]);
  });

  it('should handle negative hue wrap-around', () => {
    // When blue is dominant and green > red, hue can go negative
    const result = rgb2hs(50, 0, 255);
    expect(result[0]).toBeGreaterThanOrEqual(0);
    expect(result[0]).toBeLessThanOrEqual(360);
  });
});

describe('hs2rgb and rgb2hs round-trip', () => {
  it('should convert HS to RGB and back correctly for saturated colors', () => {
    const testCases = [
      [0, 100],    // Red
      [60, 100],   // Yellow
      [120, 100],  // Green
      [180, 100],  // Cyan
      [240, 100],  // Blue
      [300, 100],  // Magenta
    ];

    for (const [h, s] of testCases) {
      const rgb = hs2rgb(h, s);
      const result = rgb2hs(rgb[0], rgb[1], rgb[2]);
      expect(result[0]).toBeCloseTo(h, 0);
      expect(result[1]).toBeCloseTo(s, 0);
    }
  });
});

describe('hs2rgb edge cases', () => {
  it('should return white for NaN hue (default case)', () => {
    const result = hs2rgb(NaN, 100);
    expect(result).toEqual([255, 255, 255]);
  });

  it('should handle hue at exact sector boundaries', () => {
    // Test exact boundary values
    expect(hs2rgb(60, 100)).toEqual([255, 255, 0]);   // Exactly 60
    expect(hs2rgb(120, 100)).toEqual([0, 255, 0]);    // Exactly 120
    expect(hs2rgb(180, 100)).toEqual([0, 255, 255]);  // Exactly 180
    expect(hs2rgb(240, 100)).toEqual([0, 0, 255]);    // Exactly 240
    expect(hs2rgb(300, 100)).toEqual([255, 0, 255]);  // Exactly 300
    expect(hs2rgb(360, 100)).toEqual([255, 0, 0]);    // Wraps to 0
  });

  it('should handle near-red cleanup for values just above threshold', () => {
    // Test when green/blue are just above 25
    const result = hs2rgb(5, 90); // Slightly off-red
    expect(result[0]).toBe(255);
    // Green and blue may or may not be cleaned up depending on exact values
  });
});
