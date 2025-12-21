import { API, Characteristic, Formats, Perms, Units } from 'homebridge';

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

  private readonly uuids = {
    currentConsumption: 'E863F10D-079E-48FF-8F27-9C2605A29F52',
    totalConsumption: 'E863F10C-079E-48FF-8F27-9C2605A29F52',
    voltage: 'E863F10A-079E-48FF-8F27-9C2605A29F52',
    electricCurrent: 'E863F126-079E-48FF-8F27-9C2605A29F52',
    resetTotal: 'E863F112-079E-48FF-8F27-9C2605A29F52',
    lastActivation: 'E863F11A-079E-48FF-8F27-9C2605A29F52',
    openDuration: 'E863F118-079E-48FF-8F27-9C2605A29F52',
    closedDuration: 'E863F119-079E-48FF-8F27-9C2605A29F52',
    timesOpened: 'E863F129-079E-48FF-8F27-9C2605A29F52',
  };

  constructor(api: API) {
    const { Characteristic: BaseCharacteristic } = api.hap;

    // Current Consumption (Watts)
    this.CurrentConsumption = class extends BaseCharacteristic {
      static readonly UUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';

      constructor() {
        super('Current Consumption', 'E863F10D-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
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
      static readonly UUID = 'E863F10C-079E-48FF-8F27-9C2605A29F52';

      constructor() {
        super('Total Consumption', 'E863F10C-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
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
      static readonly UUID = 'E863F10A-079E-48FF-8F27-9C2605A29F52';

      constructor() {
        super('Voltage', 'E863F10A-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
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
      static readonly UUID = 'E863F126-079E-48FF-8F27-9C2605A29F52';

      constructor() {
        super('Electric Current', 'E863F126-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
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
      static readonly UUID = 'E863F112-079E-48FF-8F27-9C2605A29F52';

      constructor() {
        super('Reset Total', 'E863F112-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
          format: Formats.UINT32,
          unit: Units.SECONDS,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY, Perms.PAIRED_WRITE],
        });
        this.value = this.getDefaultValue();
      }
    };

    // Last Activation
    this.LastActivation = class extends BaseCharacteristic {
      static readonly UUID = 'E863F11A-079E-48FF-8F27-9C2605A29F52';

      constructor() {
        super('Last Activation', 'E863F11A-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
          format: Formats.UINT32,
          unit: Units.SECONDS,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    // Open Duration
    this.OpenDuration = class extends BaseCharacteristic {
      static readonly UUID = 'E863F118-079E-48FF-8F27-9C2605A29F52';

      constructor() {
        super('Open Duration', 'E863F118-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
          format: Formats.UINT32,
          unit: Units.SECONDS,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY, Perms.PAIRED_WRITE],
        });
        this.value = this.getDefaultValue();
      }
    };

    // Closed Duration
    this.ClosedDuration = class extends BaseCharacteristic {
      static readonly UUID = 'E863F119-079E-48FF-8F27-9C2605A29F52';

      constructor() {
        super('Closed Duration', 'E863F119-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
          format: Formats.UINT32,
          unit: Units.SECONDS,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY, Perms.PAIRED_WRITE],
        });
        this.value = this.getDefaultValue();
      }
    };

    // Times Opened
    this.TimesOpened = class extends BaseCharacteristic {
      static readonly UUID = 'E863F129-079E-48FF-8F27-9C2605A29F52';

      constructor() {
        super('Times Opened', 'E863F129-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
          format: Formats.UINT32,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };
  }
}
