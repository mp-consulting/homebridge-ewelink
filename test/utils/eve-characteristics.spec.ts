import { describe, it, expect, beforeEach } from 'vitest';
import { EVE_CHARACTERISTIC_UUIDS, EveCharacteristics } from '../../src/utils/eve-characteristics.js';

// Create a mock Characteristic base class
class MockCharacteristic {
  public value: unknown;
  public displayName: string;
  public UUID: string;
  public props: Record<string, unknown>;

  constructor(displayName: string, uuid: string, props: Record<string, unknown>) {
    this.displayName = displayName;
    this.UUID = uuid;
    this.props = props;
    this.value = this.getDefaultValue();
  }

  getDefaultValue(): unknown {
    return 0;
  }
}

// Create mock API
function createMockAPI() {
  return {
    hap: {
      Characteristic: MockCharacteristic,
    },
  };
}

describe('EVE_CHARACTERISTIC_UUIDS', () => {
  it('should have CurrentConsumption UUID', () => {
    expect(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption).toBe('E863F10D-079E-48FF-8F27-9C2605A29F52');
  });

  it('should have TotalConsumption UUID', () => {
    expect(EVE_CHARACTERISTIC_UUIDS.TotalConsumption).toBe('E863F10C-079E-48FF-8F27-9C2605A29F52');
  });

  it('should have Voltage UUID', () => {
    expect(EVE_CHARACTERISTIC_UUIDS.Voltage).toBe('E863F10A-079E-48FF-8F27-9C2605A29F52');
  });

  it('should have ElectricCurrent UUID', () => {
    expect(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent).toBe('E863F126-079E-48FF-8F27-9C2605A29F52');
  });

  it('should have ResetTotal UUID', () => {
    expect(EVE_CHARACTERISTIC_UUIDS.ResetTotal).toBe('E863F112-079E-48FF-8F27-9C2605A29F52');
  });

  it('should have LastActivation UUID', () => {
    expect(EVE_CHARACTERISTIC_UUIDS.LastActivation).toBe('E863F11A-079E-48FF-8F27-9C2605A29F52');
  });

  it('should have OpenDuration UUID', () => {
    expect(EVE_CHARACTERISTIC_UUIDS.OpenDuration).toBe('E863F118-079E-48FF-8F27-9C2605A29F52');
  });

  it('should have ClosedDuration UUID', () => {
    expect(EVE_CHARACTERISTIC_UUIDS.ClosedDuration).toBe('E863F119-079E-48FF-8F27-9C2605A29F52');
  });

  it('should have TimesOpened UUID', () => {
    expect(EVE_CHARACTERISTIC_UUIDS.TimesOpened).toBe('E863F129-079E-48FF-8F27-9C2605A29F52');
  });

  it('should have all 9 characteristic UUIDs', () => {
    expect(Object.keys(EVE_CHARACTERISTIC_UUIDS)).toHaveLength(9);
  });

  it('should have unique UUIDs', () => {
    const uuids = Object.values(EVE_CHARACTERISTIC_UUIDS);
    const uniqueUuids = new Set(uuids);
    expect(uniqueUuids.size).toBe(uuids.length);
  });
});

describe('EveCharacteristics', () => {
  let eveCharacteristics: EveCharacteristics;
  let mockAPI: ReturnType<typeof createMockAPI>;

  beforeEach(() => {
    mockAPI = createMockAPI();
    eveCharacteristics = new EveCharacteristics(mockAPI as any);
  });

  describe('constructor', () => {
    it('should create all characteristic classes', () => {
      expect(eveCharacteristics.CurrentConsumption).toBeDefined();
      expect(eveCharacteristics.TotalConsumption).toBeDefined();
      expect(eveCharacteristics.Voltage).toBeDefined();
      expect(eveCharacteristics.ElectricCurrent).toBeDefined();
      expect(eveCharacteristics.ResetTotal).toBeDefined();
      expect(eveCharacteristics.LastActivation).toBeDefined();
      expect(eveCharacteristics.OpenDuration).toBeDefined();
      expect(eveCharacteristics.ClosedDuration).toBeDefined();
      expect(eveCharacteristics.TimesOpened).toBeDefined();
    });
  });

  describe('CurrentConsumption', () => {
    it('should have correct UUID', () => {
      expect(eveCharacteristics.CurrentConsumption.UUID).toBe(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption);
    });

    it('should be instantiable', () => {
      const instance = new eveCharacteristics.CurrentConsumption();
      expect(instance).toBeDefined();
      expect(instance.displayName).toBe('Current Consumption');
    });
  });

  describe('TotalConsumption', () => {
    it('should have correct UUID', () => {
      expect(eveCharacteristics.TotalConsumption.UUID).toBe(EVE_CHARACTERISTIC_UUIDS.TotalConsumption);
    });

    it('should be instantiable', () => {
      const instance = new eveCharacteristics.TotalConsumption();
      expect(instance).toBeDefined();
      expect(instance.displayName).toBe('Total Consumption');
    });
  });

  describe('Voltage', () => {
    it('should have correct UUID', () => {
      expect(eveCharacteristics.Voltage.UUID).toBe(EVE_CHARACTERISTIC_UUIDS.Voltage);
    });

    it('should be instantiable', () => {
      const instance = new eveCharacteristics.Voltage();
      expect(instance).toBeDefined();
      expect(instance.displayName).toBe('Voltage');
    });
  });

  describe('ElectricCurrent', () => {
    it('should have correct UUID', () => {
      expect(eveCharacteristics.ElectricCurrent.UUID).toBe(EVE_CHARACTERISTIC_UUIDS.ElectricCurrent);
    });

    it('should be instantiable', () => {
      const instance = new eveCharacteristics.ElectricCurrent();
      expect(instance).toBeDefined();
      expect(instance.displayName).toBe('Electric Current');
    });
  });

  describe('ResetTotal', () => {
    it('should have correct UUID', () => {
      expect(eveCharacteristics.ResetTotal.UUID).toBe(EVE_CHARACTERISTIC_UUIDS.ResetTotal);
    });

    it('should be instantiable', () => {
      const instance = new eveCharacteristics.ResetTotal();
      expect(instance).toBeDefined();
      expect(instance.displayName).toBe('Reset Total');
    });
  });

  describe('LastActivation', () => {
    it('should have correct UUID', () => {
      expect(eveCharacteristics.LastActivation.UUID).toBe(EVE_CHARACTERISTIC_UUIDS.LastActivation);
    });

    it('should be instantiable', () => {
      const instance = new eveCharacteristics.LastActivation();
      expect(instance).toBeDefined();
      expect(instance.displayName).toBe('Last Activation');
    });
  });

  describe('OpenDuration', () => {
    it('should have correct UUID', () => {
      expect(eveCharacteristics.OpenDuration.UUID).toBe(EVE_CHARACTERISTIC_UUIDS.OpenDuration);
    });

    it('should be instantiable', () => {
      const instance = new eveCharacteristics.OpenDuration();
      expect(instance).toBeDefined();
      expect(instance.displayName).toBe('Open Duration');
    });
  });

  describe('ClosedDuration', () => {
    it('should have correct UUID', () => {
      expect(eveCharacteristics.ClosedDuration.UUID).toBe(EVE_CHARACTERISTIC_UUIDS.ClosedDuration);
    });

    it('should be instantiable', () => {
      const instance = new eveCharacteristics.ClosedDuration();
      expect(instance).toBeDefined();
      expect(instance.displayName).toBe('Closed Duration');
    });
  });

  describe('TimesOpened', () => {
    it('should have correct UUID', () => {
      expect(eveCharacteristics.TimesOpened.UUID).toBe(EVE_CHARACTERISTIC_UUIDS.TimesOpened);
    });

    it('should be instantiable', () => {
      const instance = new eveCharacteristics.TimesOpened();
      expect(instance).toBeDefined();
      expect(instance.displayName).toBe('Times Opened');
    });
  });
});
