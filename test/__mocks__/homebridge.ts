import { vi } from 'vitest';
import type {
  API,
  Logging,
  PlatformAccessory,
  Service,
  Characteristic,
  HAP,
} from 'homebridge';

/**
 * Create a mock Logging instance
 */
export function createMockLogging(): Logging {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    success: vi.fn(),
    prefix: 'TEST',
  } as unknown as Logging;
}

/**
 * Create a mock Characteristic
 */
export function createMockCharacteristic(initialValue?: unknown) {
  const characteristic = {
    value: initialValue,
    onGet: vi.fn().mockReturnThis(),
    onSet: vi.fn().mockReturnThis(),
    updateValue: vi.fn().mockReturnThis(),
    getValue: vi.fn().mockReturnValue(initialValue),
    setValue: vi.fn().mockReturnThis(),
  };
  return characteristic;
}

/**
 * Create a mock Service
 */
export function createMockService(serviceType: string) {
  const characteristics = new Map<string, ReturnType<typeof createMockCharacteristic>>();

  const service = {
    displayName: serviceType,
    UUID: serviceType,
    getCharacteristic: vi.fn((charType: unknown) => {
      const key = String(charType);
      if (!characteristics.has(key)) {
        characteristics.set(key, createMockCharacteristic());
      }
      return characteristics.get(key);
    }),
    setCharacteristic: vi.fn().mockReturnThis(),
    updateCharacteristic: vi.fn().mockReturnThis(),
    addCharacteristic: vi.fn().mockReturnThis(),
    removeCharacteristic: vi.fn().mockReturnThis(),
    testCharacteristic: vi.fn().mockReturnValue(false),
  };

  return service;
}

/**
 * Create a mock PlatformAccessory
 */
export function createMockAccessory<T = unknown>(
  displayName: string,
  uuid: string,
  context: T,
): PlatformAccessory<T> {
  const services = new Map<string, ReturnType<typeof createMockService>>();

  const accessory = {
    UUID: uuid,
    displayName,
    context,
    getService: vi.fn((serviceType: unknown) => {
      return services.get(String(serviceType)) || null;
    }),
    getServiceById: vi.fn((serviceType: unknown, subtype: string) => {
      return services.get(`${serviceType}-${subtype}`) || null;
    }),
    addService: vi.fn((serviceType: unknown, name?: string, subtype?: string) => {
      const key = subtype ? `${serviceType}-${subtype}` : String(serviceType);
      const service = createMockService(String(serviceType));
      services.set(key, service);
      return service;
    }),
    removeService: vi.fn(),
    services: [],
  };

  return accessory as unknown as PlatformAccessory<T>;
}

/**
 * Create mock HAP constants
 */
export function createMockHAP(): Partial<HAP> {
  return {
    uuid: {
      generate: vi.fn((id: string) => `uuid-${id}`),
    },
    Service: {
      Switch: 'Switch',
      Outlet: 'Outlet',
      Lightbulb: 'Lightbulb',
      TemperatureSensor: 'TemperatureSensor',
      HumiditySensor: 'HumiditySensor',
      MotionSensor: 'MotionSensor',
      ContactSensor: 'ContactSensor',
      WindowCovering: 'WindowCovering',
      Fan: 'Fan',
      Thermostat: 'Thermostat',
      AccessoryInformation: 'AccessoryInformation',
      BatteryService: 'BatteryService',
    } as unknown as typeof Service,
    Characteristic: {
      On: 'On',
      Brightness: 'Brightness',
      Hue: 'Hue',
      Saturation: 'Saturation',
      ColorTemperature: 'ColorTemperature',
      CurrentTemperature: 'CurrentTemperature',
      CurrentRelativeHumidity: 'CurrentRelativeHumidity',
      TargetTemperature: 'TargetTemperature',
      CurrentPosition: 'CurrentPosition',
      TargetPosition: 'TargetPosition',
      PositionState: 'PositionState',
      MotionDetected: 'MotionDetected',
      ContactSensorState: 'ContactSensorState',
      Name: 'Name',
      Manufacturer: 'Manufacturer',
      Model: 'Model',
      SerialNumber: 'SerialNumber',
      FirmwareRevision: 'FirmwareRevision',
      BatteryLevel: 'BatteryLevel',
      StatusLowBattery: 'StatusLowBattery',
    } as unknown as typeof Characteristic,
    HapStatusError: class HapStatusError extends Error {
      public hapStatus: number;
      constructor(status: number) {
        super(`HAP Status Error: ${status}`);
        this.hapStatus = status;
      }
    },
    HAPStatus: {
      SUCCESS: 0,
      SERVICE_COMMUNICATION_FAILURE: -70402,
    },
  } as Partial<HAP>;
}

/**
 * Create a mock API instance
 */
export function createMockAPI(): Partial<API> {
  const hap = createMockHAP();

  return {
    hap: hap as HAP,
    on: vi.fn(),
    registerPlatformAccessories: vi.fn(),
    unregisterPlatformAccessories: vi.fn(),
    updatePlatformAccessories: vi.fn(),
    user: {
      storagePath: vi.fn().mockReturnValue('/tmp/homebridge'),
      persistPath: vi.fn().mockReturnValue('/tmp/homebridge/persist'),
      cachedAccessoryPath: vi.fn().mockReturnValue('/tmp/homebridge/accessories'),
      configPath: vi.fn().mockReturnValue('/tmp/homebridge/config.json'),
    },
  };
}

/**
 * Create a mock EWeLinkPlatform
 */
export function createMockPlatform(configOverrides: Record<string, unknown> = {}) {
  const api = createMockAPI();
  const log = createMockLogging();
  const hap = createMockHAP();

  return {
    api,
    log,
    config: {
      platform: 'eWeLink',
      username: 'test@example.com',
      password: 'testpassword',
      countryCode: '1',
      debug: false,
      ...configOverrides,
    },
    Service: hap.Service,
    Characteristic: hap.Characteristic,
    eveCharacteristics: {
      CurrentConsumption: 'CurrentConsumption',
      Voltage: 'Voltage',
      ElectricCurrent: 'ElectricCurrent',
    },
    deviceCache: new Map(),
    sendDeviceCommand: vi.fn().mockResolvedValue(true),
    handleDeviceUpdate: vi.fn(),
    getDeviceDisplayName: vi.fn((id: string) => `Device ${id}`),
  };
}
