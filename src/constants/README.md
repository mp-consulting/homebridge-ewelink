# Constants

This directory contains configuration constants, device mappings, and the comprehensive device catalog.

## Files

| File | Description |
|------|-------------|
| `device-catalog.ts` | **Comprehensive device catalog** - UIID mappings, capabilities, and helper functions |
| `device-constants.ts` | Device-related constants (ranges, divisors, RF helpers) |
| `api-constants.ts` | API endpoints, timeouts, and retry configuration |
| `network-constants.ts` | Network ports and connection settings |
| `region-constants.ts` | Country code to region mappings |
| `timing-constants.ts` | Timing intervals for polling, debouncing, etc. |

## Device Catalog (device-catalog.ts)

The device catalog is the **single source of truth** for device information. It maps UIIDs to device capabilities and metadata.

### Structure

```typescript
interface DeviceCatalogEntry {
  name: string;           // Human-readable device name
  category: string;       // Device category (switch, light, sensor, etc.)
  capabilities: {
    channels: number;           // Number of switch channels (1-4)
    powerMonitoring: 'none' | 'power' | 'full';  // Power reading support
    lightType?: 'switch' | 'dimmable' | 'cct' | 'rgb' | 'rgbcct';
    batteryType?: 'cr2032' | 'cr2450' | 'aa' | 'aaa' | 'builtin';
    // ... other capabilities
  };
}
```

### Helper Functions

The catalog exports many helper functions - **always use these instead of hardcoding UIIDs**:

#### Channel & Power

| Function | Description |
|----------|-------------|
| `getChannelCount(uiid)` | Get number of channels for a UIID |
| `hasPowerMonitoring(uiid)` | Check if device has any power monitoring |
| `hasFullPowerReadings(uiid)` | Check if device has voltage + current |
| `isDualR3Device(uiid)` | Check if device is DualR3 type |

#### Device Types

| Function | Description |
|----------|-------------|
| `isMotionSensor(uiid)` | Check if motion sensor |
| `isContactSensor(uiid)` | Check if contact/door sensor |
| `isLeakSensor(uiid)` | Check if water leak sensor |
| `isTHSensorDevice(uiid)` | Check if TH sensor (read-only temp/humidity) |
| `isDimmableLightForFan(uiid)` | Check if dimmable light that supports fan simulation |
| `isGroupDevice(uiid)` | Check if device group |
| `isProgrammableSwitch(uiid)` | Check if programmable switch button |

#### Parameters

| Function | Description |
|----------|-------------|
| `getBrightnessParams(uiid)` | Get brightness parameter config |
| `getPositionParams(uiid)` | Get position parameter config (curtains) |
| `getBatteryType(uiid)` | Get battery type for sensors |
| `hasBattery(uiid)` | Check if device has battery |
| `getSwitchParamName(uiid)` | Get on/off parameter name |
| `hasCurtainParams(params)` | Check if device params indicate curtain mode |

#### Brightness Normalization

| Function | Description |
|----------|-------------|
| `normalizeBrightness(uiid, value)` | Convert device value (e.g., 10-100) to 0-100 |
| `denormalizeBrightness(uiid, value)` | Convert 0-100 to device-specific range |

## Device Constants (device-constants.ts)

Non-catalog constants for device operation:

### Value Ranges

| Constant | Value | Description |
|----------|-------|-------------|
| `TEMPERATURE_MIN` | -270 | Minimum temperature (Celsius) |
| `TEMPERATURE_MAX` | 100 | Maximum temperature (Celsius) |
| `HUMIDITY_MIN` | 0 | Minimum humidity (%) |
| `HUMIDITY_MAX` | 100 | Maximum humidity (%) |
| `COLOR_TEMP_MIN_MIRED` | 140 | Minimum color temp (mired) |
| `COLOR_TEMP_MAX_MIRED` | 500 | Maximum color temp (mired) |

### Power Reading Divisors

| Constant | Value | Description |
|----------|-------|-------------|
| `POWER_DIVISOR` | 100 | Divide raw power by this |
| `VOLTAGE_DIVISOR` | 100 | Divide raw voltage by this |
| `CURRENT_DIVISOR` | 100 | Divide raw current by this |

### RF Remote Types

| Constant | Value | Description |
|----------|-------|-------------|
| `RF_REMOTE_TYPE.BUTTON_1` | '1' | Single button remote |
| `RF_REMOTE_TYPE.BUTTON_4` | '4' | 4-button remote |
| `RF_REMOTE_TYPE.CURTAIN` | '5' | Curtain remote |
| `RF_REMOTE_TYPE.SENSOR_MOTION` | '6' | Motion sensor |
| `RF_REMOTE_TYPE.SENSOR_CONTACT` | '7' | Contact sensor |

## Timing Constants (timing-constants.ts)

### Polling Intervals

| Constant | Value | Description |
|----------|-------|-------------|
| `POLLING.UPDATE_INTERVAL_MS` | 120000 | Power update polling (2 min) |
| `POLLING.INITIAL_DELAY_MS` | 5000 | Initial delay before first poll |
| `POLLING.UI_ACTIVE_DURATION_S` | 120 | UI active state duration |

### Timing

| Constant | Value | Description |
|----------|-------|-------------|
| `TIMING.STATE_INIT_DELAY_MS` | 500 | Delay for state initialization |
| `TIMING.FAILED_COMMAND_RESET_MS` | 2000 | Reset after failed command |

## API Constants (api-constants.ts)

| Constant | Description |
|----------|-------------|
| `API_ENDPOINTS` | Cloud API endpoint URLs by region |
| `WS_ENDPOINTS` | WebSocket endpoint URLs by region |
| `API_TIMEOUT_MS` | HTTP request timeout |
| `QUERY_RETRY` | Retry configuration for queries |

## Region Constants (region-constants.ts)

Maps country codes to eWeLink regions:

```typescript
'US' → 'us'
'CN' → 'cn'
'GB' → 'eu'
// ... etc
```
