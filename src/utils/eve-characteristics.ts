import type { API, Characteristic } from 'homebridge';
import { Formats, Perms, Units } from 'homebridge';

/**
 * Eve Home characteristic UUIDs
 * Centralized UUID constants to avoid duplication across accessories
 */
export const EVE_CHARACTERISTIC_UUIDS = {
  CurrentConsumption: 'E863F10D-079E-48FF-8F27-9C2605A29F52',
  TotalConsumption: 'E863F10C-079E-48FF-8F27-9C2605A29F52',
  Voltage: 'E863F10A-079E-48FF-8F27-9C2605A29F52',
  ElectricCurrent: 'E863F126-079E-48FF-8F27-9C2605A29F52',
  ResetTotal: 'E863F112-079E-48FF-8F27-9C2605A29F52',
  LastActivation: 'E863F11A-079E-48FF-8F27-9C2605A29F52',
  OpenDuration: 'E863F118-079E-48FF-8F27-9C2605A29F52',
  ClosedDuration: 'E863F119-079E-48FF-8F27-9C2605A29F52',
  TimesOpened: 'E863F129-079E-48FF-8F27-9C2605A29F52',
} as const;

/**
 * Eve Home custom characteristics
 * These characteristics enable power monitoring and other features in the Eve app
 */
export class EveCharacteristics {
  public readonly CurrentConsumption: typeof Characteristic;
  public readonly TotalConsumption: typeof Characteristic;
  public readonly Voltage: typeof Characteristic;
  public readonly ElectricCurrent: typeof Characteristic;
  public readonly ResetTotal: typeof Characteristic;
  public readonly LastActivation: typeof Characteristic;
  public readonly OpenDuration: typeof Characteristic;
  public readonly ClosedDuration: typeof Characteristic;
  public readonly TimesOpened: typeof Characteristic;

  constructor(api: API) {
    const { Characteristic: BaseCharacteristic } = api.hap;

    // Current Consumption (Watts)
    this.CurrentConsumption = class extends BaseCharacteristic {
      static readonly UUID = EVE_CHARACTERISTIC_UUIDS.CurrentConsumption;

      constructor() {
        super('Current Consumption', EVE_CHARACTERISTIC_UUIDS.CurrentConsumption, {
          format: Formats.UINT16,
          unit: 'W',
          maxValue: 100000,
          minValue: 0,
          minStep: 1,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    // Total Consumption (kWh)
    this.TotalConsumption = class extends BaseCharacteristic {
      static readonly UUID = EVE_CHARACTERISTIC_UUIDS.TotalConsumption;

      constructor() {
        super('Total Consumption', EVE_CHARACTERISTIC_UUIDS.TotalConsumption, {
          format: Formats.FLOAT,
          unit: 'kWh',
          maxValue: 100000000000,
          minValue: 0,
          minStep: 0.01,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    // Voltage (Volts)
    this.Voltage = class extends BaseCharacteristic {
      static readonly UUID = EVE_CHARACTERISTIC_UUIDS.Voltage;

      constructor() {
        super('Voltage', EVE_CHARACTERISTIC_UUIDS.Voltage, {
          format: Formats.FLOAT,
          unit: 'V',
          maxValue: 100000000000,
          minValue: 0,
          minStep: 1,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    // Electric Current (Amps)
    this.ElectricCurrent = class extends BaseCharacteristic {
      static readonly UUID = EVE_CHARACTERISTIC_UUIDS.ElectricCurrent;

      constructor() {
        super('Electric Current', EVE_CHARACTERISTIC_UUIDS.ElectricCurrent, {
          format: Formats.FLOAT,
          unit: 'A',
          maxValue: 100000000000,
          minValue: 0,
          minStep: 0.1,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    // Reset Total
    this.ResetTotal = class extends BaseCharacteristic {
      static readonly UUID = EVE_CHARACTERISTIC_UUIDS.ResetTotal;

      constructor() {
        super('Reset Total', EVE_CHARACTERISTIC_UUIDS.ResetTotal, {
          format: Formats.UINT32,
          unit: Units.SECONDS,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY, Perms.PAIRED_WRITE],
        });
        this.value = this.getDefaultValue();
      }
    };

    // Last Activation
    this.LastActivation = class extends BaseCharacteristic {
      static readonly UUID = EVE_CHARACTERISTIC_UUIDS.LastActivation;

      constructor() {
        super('Last Activation', EVE_CHARACTERISTIC_UUIDS.LastActivation, {
          format: Formats.UINT32,
          unit: Units.SECONDS,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    // Open Duration
    this.OpenDuration = class extends BaseCharacteristic {
      static readonly UUID = EVE_CHARACTERISTIC_UUIDS.OpenDuration;

      constructor() {
        super('Open Duration', EVE_CHARACTERISTIC_UUIDS.OpenDuration, {
          format: Formats.UINT32,
          unit: Units.SECONDS,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY, Perms.PAIRED_WRITE],
        });
        this.value = this.getDefaultValue();
      }
    };

    // Closed Duration
    this.ClosedDuration = class extends BaseCharacteristic {
      static readonly UUID = EVE_CHARACTERISTIC_UUIDS.ClosedDuration;

      constructor() {
        super('Closed Duration', EVE_CHARACTERISTIC_UUIDS.ClosedDuration, {
          format: Formats.UINT32,
          unit: Units.SECONDS,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY, Perms.PAIRED_WRITE],
        });
        this.value = this.getDefaultValue();
      }
    };

    // Times Opened
    this.TimesOpened = class extends BaseCharacteristic {
      static readonly UUID = EVE_CHARACTERISTIC_UUIDS.TimesOpened;

      constructor() {
        super('Times Opened', EVE_CHARACTERISTIC_UUIDS.TimesOpened, {
          format: Formats.UINT32,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };
  }
}
