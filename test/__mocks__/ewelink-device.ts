import type { EWeLinkDevice, DeviceParams, AccessoryContext } from '../../src/types/index.js';

/**
 * Create a mock EWeLinkDevice
 */
export function createMockDevice(overrides: Partial<EWeLinkDevice> = {}): EWeLinkDevice {
  return {
    deviceid: 'test-device-001',
    name: 'Test Device',
    brandName: 'Sonoff',
    brandLogoUrl: '',
    showBrand: false,
    productModel: 'BASIC',
    online: true,
    apikey: 'test-api-key',
    shareable: false,
    devicekey: 'test-device-key',
    createdAt: new Date().toISOString(),
    extra: {
      uiid: 1,
      model: 'PSF-B01-GL',
      manufacturer: 'Sonoff',
      brandId: 'sonoff',
      brandLogoUrl: '',
      description: 'Test device',
    },
    params: {
      switch: 'off',
    },
    ...overrides,
  };
}

/**
 * Create device params for different device types
 */
export const deviceParamsFixtures = {
  singleSwitch: (isOn = false): DeviceParams => ({
    switch: isOn ? 'on' : 'off',
  }),

  multiSwitch: (states: boolean[] = [false, false, false, false]): DeviceParams => ({
    switches: states.map((on, index) => ({
      outlet: index,
      switch: on ? 'on' : 'off',
    })),
  }),

  thSensor: (temp = 25, humidity = 50): DeviceParams => ({
    currentTemperature: temp * 100,
    currentHumidity: humidity * 100,
    switch: 'off',
  }),

  dimmerLight: (brightness = 100, on = true): DeviceParams => ({
    switch: on ? 'on' : 'off',
    bright: brightness,
  }),

  rgbLight: (r = 255, g = 255, b = 255, brightness = 100): DeviceParams => ({
    ltype: 'color',
    color: { r, g, b, br: brightness },
  }),

  curtain: (position = 0): DeviceParams => ({
    currLocation: position,
    location: position,
    motorTurn: 2, // stopped
  }),

  powerMonitoring: (power = 0, voltage = 220, current = 0): DeviceParams => ({
    switch: power > 0 ? 'on' : 'off',
    power: power * 100,
    voltage: voltage * 100,
    current: current * 100,
  }),
};

/**
 * Create a mock AccessoryContext
 */
export function createMockAccessoryContext(
  device: Partial<EWeLinkDevice> = {},
  contextOverrides: Partial<AccessoryContext> = {},
): AccessoryContext {
  const fullDevice = createMockDevice(device);

  return {
    device: fullDevice,
    deviceId: fullDevice.deviceid,
    ...contextOverrides,
  };
}

/**
 * UIID fixtures for common device types
 */
export const uiidFixtures = {
  singleSwitch: 1,
  dualSwitch: 2,
  tripleSwitch: 3,
  quadSwitch: 4,
  powerMonitoring: 5,
  dimmerLight: 36,
  rgbLight: 22,
  thSensor: 15,
  curtain: 11,
  rfBridge: 28,
  thermostat: 127,
};
