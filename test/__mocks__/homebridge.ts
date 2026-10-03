import { vi } from 'vitest';
import {
  Characteristic as HapCharacteristic,
  Service as HapService,
  HAPStatus as HapHAPStatus,
  HapStatusError as HapHapStatusError,
} from '@homebridge/hap-nodejs';
import type {
  API,
  Logging,
  PlatformAccessory,
  Service,
  Characteristic,
  HAP,
} from 'homebridge';
import { EVE_CHARACTERISTIC_UUIDS } from '../../src/utils/eve-characteristics.js';

type Handler = (...args: unknown[]) => unknown;

/**
 * Resolve a stable map key for a Service/Characteristic reference
 * (HAP constructor with a static UUID, a UUID/name string, or anything else)
 */
export function mockKeyOf(ref: unknown): string {
  if (typeof ref === 'string') {
    return ref;
  }
  if (ref && (typeof ref === 'function' || typeof ref === 'object') && 'UUID' in ref) {
    return String((ref as { UUID: unknown }).UUID);
  }
  return String(ref);
}

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
 *
 * Captures onGet/onSet handlers (see getSetHandler/triggerSet/getGetHandler/triggerGet),
 * records props passed to setProps, and tracks the value set via updateValue/setValue.
 */
export function createMockCharacteristic(initialValue?: unknown) {
  let setHandler: Handler | undefined;
  let getHandler: Handler | undefined;

  const characteristic = {
    value: initialValue as unknown,
    props: {} as Record<string, unknown>,
    onGet: vi.fn((handler: Handler) => {
      getHandler = handler;
      return characteristic;
    }),
    onSet: vi.fn((handler: Handler) => {
      setHandler = handler;
      return characteristic;
    }),
    setProps: vi.fn((props: Record<string, unknown>) => {
      Object.assign(characteristic.props, props);
      return characteristic;
    }),
    updateValue: vi.fn((value: unknown) => {
      characteristic.value = value;
      return characteristic;
    }),
    getValue: vi.fn(() => characteristic.value),
    setValue: vi.fn((value: unknown) => {
      characteristic.value = value;
      return characteristic;
    }),
    /** The handler registered with onSet (if any) */
    getSetHandler: () => setHandler,
    /** The handler registered with onGet (if any) */
    getGetHandler: () => getHandler,
    /** Invoke the onSet handler like HAP would (does not update `value`) */
    triggerSet: async (value: unknown) => {
      if (!setHandler) {
        throw new Error('No onSet handler registered');
      }
      return setHandler(value);
    },
    /** Invoke the onGet handler like HAP would */
    triggerGet: async () => {
      if (!getHandler) {
        throw new Error('No onGet handler registered');
      }
      return getHandler();
    },
  };
  return characteristic;
}

export type MockCharacteristic = ReturnType<typeof createMockCharacteristic>;

/**
 * Create a mock Service
 *
 * getCharacteristic() returns the same mock per characteristic; updateCharacteristic()
 * and setCharacteristic() store the value (read it back with getCharacteristicValue()).
 */
export function createMockService(serviceType: string, displayName?: string, subtype?: string) {
  const characteristics = new Map<string, MockCharacteristic>();

  const ensure = (charType: unknown): MockCharacteristic => {
    const key = mockKeyOf(charType);
    let characteristic = characteristics.get(key);
    if (!characteristic) {
      characteristic = createMockCharacteristic();
      characteristics.set(key, characteristic);
    }
    return characteristic;
  };

  const service = {
    displayName: displayName || serviceType,
    UUID: serviceType,
    subtype: subtype || undefined,
    characteristics,
    getCharacteristic: vi.fn((charType: unknown) => ensure(charType)),
    setCharacteristic: vi.fn((charType: unknown, value: unknown) => {
      ensure(charType).updateValue(value);
      return service;
    }),
    updateCharacteristic: vi.fn((charType: unknown, value: unknown) => {
      ensure(charType).updateValue(value);
      return service;
    }),
    addCharacteristic: vi.fn((charType: unknown) => ensure(charType)),
    addOptionalCharacteristic: vi.fn(),
    setPrimaryService: vi.fn(() => service),
    removeCharacteristic: vi.fn((charType: unknown) => {
      for (const [key, value] of characteristics) {
        if (value === charType || key === mockKeyOf(charType)) {
          characteristics.delete(key);
        }
      }
      return service;
    }),
    testCharacteristic: vi.fn((charType: unknown) => characteristics.has(mockKeyOf(charType))),
    /** Current value of a characteristic (undefined if never set) */
    getCharacteristicValue: (charType: unknown) => characteristics.get(mockKeyOf(charType))?.value,
  };

  return service;
}

export type MockService = ReturnType<typeof createMockService>;

/**
 * Create a mock PlatformAccessory
 */
export function createMockAccessory<T = unknown>(
  displayName: string,
  uuid: string,
  context: T,
): PlatformAccessory<T> {
  const services = new Map<string, MockService>();
  const serviceList: MockService[] = [];

  const accessory = {
    UUID: uuid,
    displayName,
    context,
    getService: vi.fn((serviceType: unknown) => {
      return services.get(mockKeyOf(serviceType)) || null;
    }),
    getServiceById: vi.fn((serviceType: unknown, subtype: string) => {
      return services.get(`${mockKeyOf(serviceType)}-${subtype}`) || null;
    }),
    addService: vi.fn((serviceType: unknown, name?: string, subtype?: string) => {
      const typeKey = mockKeyOf(serviceType);
      const key = subtype ? `${typeKey}-${subtype}` : typeKey;
      const service = createMockService(typeKey, name, subtype);
      services.set(key, service);
      serviceList.push(service);
      return service;
    }),
    removeService: vi.fn((service: MockService) => {
      for (const [key, value] of services) {
        if (value === service) {
          services.delete(key);
        }
      }
      const index = serviceList.indexOf(service);
      if (index >= 0) {
        serviceList.splice(index, 1);
      }
    }),
    services: serviceList,
  };

  return accessory as unknown as PlatformAccessory<T>;
}

/**
 * Create mock HAP constants
 *
 * Service and Characteristic are the real HAP-NodeJS classes, so enum constants
 * (e.g. Characteristic.PositionState.INCREASING) and every service type are available.
 */
export function createMockHAP(): Partial<HAP> {
  return {
    uuid: {
      generate: vi.fn((id: string) => `uuid-${id}`),
    },
    Service: HapService as unknown as typeof Service,
    Characteristic: HapCharacteristic as unknown as typeof Characteristic,
    HapStatusError: HapHapStatusError,
    HAPStatus: HapHAPStatus,
  } as unknown as Partial<HAP>;
}

export type MockAPI = Partial<API> & {
  listeners: Map<string, Handler[]>;
  emit: (event: string, ...args: unknown[]) => void;
};

/**
 * Create a mock API instance
 *
 * `on` records listeners; call `emit(event)` to fire them (e.g. emit('shutdown')).
 */
export function createMockAPI(): MockAPI {
  const hap = createMockHAP();
  const listeners = new Map<string, Handler[]>();

  return {
    hap: hap as HAP,
    on: vi.fn((event: string, listener: Handler) => {
      const list = listeners.get(event) ?? [];
      list.push(listener);
      listeners.set(event, list);
    }) as unknown as API['on'],
    listeners,
    emit: (event: string, ...args: unknown[]) => {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
    },
    registerPlatformAccessories: vi.fn(),
    unregisterPlatformAccessories: vi.fn(),
    updatePlatformAccessories: vi.fn(),
    user: {
      storagePath: vi.fn().mockReturnValue('/tmp/homebridge'),
      persistPath: vi.fn().mockReturnValue('/tmp/homebridge/persist'),
      cachedAccessoryPath: vi.fn().mockReturnValue('/tmp/homebridge/accessories'),
      configPath: vi.fn().mockReturnValue('/tmp/homebridge/config.json'),
    },
  } as unknown as MockAPI;
}

/**
 * Create a mock EWeLinkPlatform
 */
export function createMockPlatform(configOverrides: Record<string, unknown> = {}) {
  const api = createMockAPI();
  const log = createMockLogging();
  const hap = createMockHAP();
  const temperatures = new Map<string, number>();

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
      CurrentConsumption: EVE_CHARACTERISTIC_UUIDS.CurrentConsumption,
      Voltage: EVE_CHARACTERISTIC_UUIDS.Voltage,
      ElectricCurrent: EVE_CHARACTERISTIC_UUIDS.ElectricCurrent,
    },
    deviceCache: new Map(),
    sendDeviceCommand: vi.fn().mockResolvedValue(true),
    handleDeviceUpdate: vi.fn(),
    getDeviceDisplayName: vi.fn((id: string) => `Device ${id}`),
    setDeviceTemperature: vi.fn((deviceId: string, temperature: number) => {
      temperatures.set(deviceId, temperature);
    }),
    getDeviceTemperature: vi.fn((deviceId: string) => temperatures.get(deviceId)),
    queryDeviceState: vi.fn().mockResolvedValue(true),
    getCurtainStaggerDelay: vi.fn().mockReturnValue(0),
  };
}
