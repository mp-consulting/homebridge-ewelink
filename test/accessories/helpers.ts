import type { PlatformAccessory } from 'homebridge';
import type { BaseAccessory } from '../../src/accessories/base.js';
import type { EWeLinkPlatform } from '../../src/platform.js';
import type { AccessoryContext, DeviceParams, EWeLinkDevice } from '../../src/types/index.js';
import { createMockAccessory, createMockPlatform, mockKeyOf } from '../__mocks__/homebridge.js';
import type { MockCharacteristic, MockService } from '../__mocks__/homebridge.js';
import { createMockAccessoryContext } from '../__mocks__/ewelink-device.js';

export type AccessoryConstructor<T extends BaseAccessory> = new (
  platform: EWeLinkPlatform,
  accessory: PlatformAccessory<AccessoryContext>,
) => T;

export interface AccessoryHarnessOptions {
  /** Device overrides (deviceid, extra.uiid, online, ...) */
  device?: Partial<EWeLinkDevice>;
  /** Initial device params (shortcut for device.params) */
  params?: DeviceParams;
  /** Platform config overrides (singleDevices, fanDevices, debug, ...) */
  config?: Record<string, unknown>;
  /** Accessory context overrides (channelIndex, switchNumber, buttons, ...) */
  context?: Partial<AccessoryContext>;
  /** Accessory display name */
  displayName?: string;
}

/**
 * Construct an accessory handler against the homebridge mocks
 */
export function createAccessoryHarness<T extends BaseAccessory>(
  AccessoryClass: AccessoryConstructor<T>,
  options: AccessoryHarnessOptions = {},
) {
  const platform = createMockPlatform(options.config);
  const context = createMockAccessoryContext(
    {
      ...options.device,
      ...(options.params ? { params: options.params } : {}),
    },
    options.context,
  );
  const accessory = createMockAccessory<AccessoryContext>(
    options.displayName ?? 'Test Accessory',
    `uuid-${context.deviceId}`,
    context,
  );

  const handler = new AccessoryClass(platform as unknown as EWeLinkPlatform, accessory);

  /** Get a service previously added by the handler */
  const getService = (serviceType: unknown, subtype?: string): MockService => {
    const service = subtype
      ? accessory.getServiceById(serviceType as never, subtype)
      : accessory.getService(serviceType as never);
    if (!service) {
      throw new Error(`Service ${mockKeyOf(serviceType)}${subtype ? `/${subtype}` : ''} not found`);
    }
    return service as unknown as MockService;
  };

  /** Get a characteristic mock of a service */
  const getCharacteristic = (serviceType: unknown, characteristic: unknown, subtype?: string): MockCharacteristic => {
    return getService(serviceType, subtype).getCharacteristic(characteristic);
  };

  return {
    platform,
    accessory,
    context,
    handler,
    getService,
    getCharacteristic,
  };
}
