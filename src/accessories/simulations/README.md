# Simulations

This directory contains accessory handlers that simulate various HomeKit device types using generic eWeLink switches. These allow users to expose simple on/off switches as more specific device types in HomeKit.

## Purpose

Simulations enable:
- Better HomeKit integration (e.g., expose a switch controlling a fan as a Fan accessory)
- Additional features (e.g., position tracking for blinds using timing)
- Combined functionality (e.g., TH sensor + switch as a thermostat)

## Configuration

Simulations are enabled via the plugin configuration by specifying `deviceModel` for a device:

```json
{
  "singleDevices": [
    {
      "deviceId": "1000abc123",
      "deviceModel": "blind",
      "operationTime": 30
    }
  ]
}
```

## Available Simulations

### Window Coverings

| File | Simulation | Description |
|------|------------|-------------|
| `blind.ts` | `blind` | 2-switch device as blind with position tracking |
| `window.ts` | `window` | 2-switch device as window with position tracking |
| `door.ts` | `door` | 2-switch device as door with position tracking |
| `rf-blind.ts` | RF Blind | RF curtain remote as blind |
| `rf-window.ts` | RF Window | RF curtain remote as window |
| `rf-door.ts` | RF Door | RF curtain remote as door |

**Position Tracking**: Uses `operationTime` (seconds) to calculate position based on movement duration. Supports different up/down times via `operationTimeDown`.

### Climate Control

| File | Simulation | Description |
|------|------------|-------------|
| `heater.ts` | `heater` | Switch + external temp source as heater |
| `cooler.ts` | `cooler` | Switch + external temp source as cooler |
| `th-heater.ts` | `th_heater` | TH sensor switch as heater |
| `th-cooler.ts` | `th_cooler` | TH sensor switch as cooler |
| `th-thermostat.ts` | `th_thermostat` | TH sensor switch as full thermostat |
| `th-humidifier.ts` | `th_humidifier` | TH sensor switch as humidifier |
| `th-dehumidifier.ts` | `th_dehumidifier` | TH sensor switch as dehumidifier |

**TH Simulations**: Use the built-in temperature/humidity sensor of TH16 devices to control heating/cooling based on thresholds.

### Buttons & Triggers

| File | Simulation | Description |
|------|------------|-------------|
| `doorbell.ts` | `doorbell` | Switch as doorbell button |
| `p-button.ts` | `p_button` | Switch as programmable button |

### Fans & Purifiers

| File | Simulation | Description |
|------|------------|-------------|
| `light-fan.ts` | `light_fan` | Dimmable light as fan with speed control |
| `purifier.ts` | `purifier` | Switch as air purifier |

### Sensors

| File | Simulation | Description |
|------|------------|-------------|
| `sensor.ts` | `sensor` | Switch as motion/contact sensor |
| `sensor-visible.ts` | `sensor_visible` | Sub-accessory for garage door/lock via sensor |
| `sensor-leak.ts` | `leak` | DW2 sensor as water leak detector |

### Entertainment

| File | Simulation | Description |
|------|------------|-------------|
| `tv.ts` | `tv` | Switch as TV/AV receiver |

### Water Control

| File | Simulation | Description |
|------|------------|-------------|
| `valve.ts` | `valve` | Switch as irrigation valve |
| `tap.ts` | `tap` | Switch as water tap |
| `lock.ts` | `lock` | Switch as lock mechanism |

## Common Features

### Power Monitoring

Simulations for DualR3 (UIID 126, 165) devices support power monitoring with Eve characteristics:
- Current Consumption (Watts)
- Voltage (V)
- Electric Current (A)

### Operation Time Configuration

For position-based simulations (blind, window, door):

| Property | Description |
|----------|-------------|
| `operationTime` | Time in seconds for full open/up movement |
| `operationTimeDown` | Time in seconds for full close/down (defaults to operationTime) |

### Temperature Offsets

For TH-based simulations:

| Property | Description |
|----------|-------------|
| `tempOffset` | Temperature offset adjustment |
| `humidityOffset` | Humidity offset adjustment |
| `minTarget` | Minimum target temperature |
| `maxTarget` | Maximum target temperature |
