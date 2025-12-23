# Accessories

This directory contains HomeKit accessory handlers for eWeLink devices. Each accessory type extends `BaseAccessory` and implements device-specific logic.

## Base Class

| File | Description |
|------|-------------|
| `base.ts` | Abstract base class with common functionality for all accessories |

### BaseAccessory Features

- **Logging**: `logInfo()`, `logDebug()`, `logError()` - prefixed with device name
- **State Handling**: `handleGet()`, `handleSet()` - standardized getter/setter with error handling
- **Service Management**: `getOrAddService()`, `removeServiceIfExists()` - consistent service creation
- **Power Monitoring**: `setupPowerMonitoringCharacteristics()` - Eve energy characteristics
- **Polling**: `setupPollingInterval()` - periodic update management with cleanup
- **Commands**: `sendCommand()` - sends commands via platform to device

## Device Accessories

### Switches & Outlets

| File | Description | UIIDs |
|------|-------------|-------|
| `switch.ts` | Single/multi-channel switches | 1, 6, 14, 77, 78, 107, etc. |
| `outlet.ts` | Outlets with optional power monitoring | 5, 32, 182, 190 |
| `switch-mate.ts` | S-Mate button device | 177 |
| `switch-mini.ts` | Mini R4/R5 with 6 programmable buttons | 138, 190 |

### Lights

| File | Description | UIIDs |
|------|-------------|-------|
| `light.ts` | Generic light with brightness, color temp, RGB | 22, 33, 36, 44, 57, 59, 103, 104, etc. |
| `diffuser.ts` | Aroma diffuser with light | 25 |

### Window Coverings

| File | Description | UIIDs |
|------|-------------|-------|
| `curtain.ts` | Motorized curtains/blinds with position control | 11, 67, 126 |
| `motor.ts` | Generic motor devices | 34, 172 |

### Climate

| File | Description | UIIDs |
|------|-------------|-------|
| `th-sensor.ts` | Temperature/humidity sensors | 15, 181 |
| `thermostat.ts` | Smart thermostats | 127 |
| `air-conditioner.ts` | Air conditioner controller | 162 |
| `fan.ts` | Ceiling fans with speed control | 34 |
| `humidifier.ts` | Smart humidifiers | 19 |

### Sensors

| File | Description | UIIDs |
|------|-------------|-------|
| `sensor.ts` | Motion, contact, and occupancy sensors | 102, 154, 3026 |
| `garage.ts` | Garage door opener simulation | - |

### Bridges

| File | Description | UIIDs |
|------|-------------|-------|
| `rf-bridge.ts` | RF Bridge 433MHz | 28, 98 |
| `rf-button.ts` | RF remote button sub-devices | - |
| `rf-sensor.ts` | RF sensor sub-devices (motion, contact) | - |

### Panels

| File | Description | UIIDs |
|------|-------------|-------|
| `panel.ts` | NSPanel with temperature sensor | 133, 195 |

### Other

| File | Description | UIIDs |
|------|-------------|-------|
| `group.ts` | Device groups | 10000+ |
| `virtual.ts` | Virtual devices | - |

## Simulations Subdirectory

See [`simulations/README.md`](simulations/README.md) for accessories that simulate HomeKit device types using generic switches.

## Adding a New Accessory

1. Create a new file extending `BaseAccessory`
2. Implement the constructor to set up HomeKit services and characteristics
3. Implement `updateState(params: DeviceParams)` to handle device updates
4. Add the accessor to `platform.ts` device routing logic
5. Update the device catalog in `constants/device-catalog.ts` if needed

### Example Structure

```typescript
export class MyAccessory extends BaseAccessory {
  constructor(
    platform: EWeLinkPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
  ) {
    super(platform, accessory);

    // Set up service
    this.service = this.getOrAddService(this.Service.Switch);

    // Configure characteristics
    this.service.getCharacteristic(this.Characteristic.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.setOn.bind(this));
  }

  updateState(params: DeviceParams): void {
    this.mergeDeviceParams(params);
    // Update characteristics from params
  }
}
```
