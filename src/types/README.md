# Types

This directory contains TypeScript type definitions for the plugin.

## Files

| File | Description |
|------|-------------|
| `index.ts` | All type definitions exported from a single entry point |

## Core Types

### Platform Configuration

```typescript
interface EWeLinkPlatformConfig extends PlatformConfig {
  email?: string;
  password?: string;
  countryCode?: string;
  mode?: 'wan' | 'lan' | 'auto';
  debug?: boolean;
  disableNoResponse?: boolean;
  hideDevices?: string[];
  singleDevices?: SingleDeviceConfig[];
  multiDevices?: MultiDeviceConfig[];
  lightDevices?: LightDeviceConfig[];
  thDevices?: ThermostatDeviceConfig[];
  bridgeDevices?: BridgeDeviceConfig[];
}
```

### Device Types

```typescript
interface EWeLinkDevice {
  deviceid: string;
  name: string;
  brandName?: string;
  productModel?: string;
  online: boolean;
  params: DeviceParams;
  extra?: {
    uiid?: number;
    model?: string;
    // ...
  };
  tags?: {
    zyx_info?: RFRemoteInfo[];  // For RF bridge
  };
}
```

### Device Parameters

```typescript
interface DeviceParams {
  // Switch state
  switch?: 'on' | 'off';
  switches?: SwitchState[];

  // Brightness/dimming
  bright?: number;
  brightness?: string;

  // Color
  color?: { r: number; g: number; b: number; br?: number };
  colorTemp?: number;
  ltype?: 'color' | 'white';
  white?: { br: number; ct: number };

  // Temperature/Humidity
  currentTemperature?: number;
  currentHumidity?: number;
  temperature?: number;
  humidity?: number;

  // Curtain/Motor
  currLocation?: number;
  location?: number;
  setclose?: number;
  motorTurn?: number;

  // Power monitoring
  power?: number;
  voltage?: number;
  current?: number;
  actPow_00?: number;
  voltage_00?: number;
  current_00?: number;

  // ... many more
}
```

### Accessory Context

```typescript
interface AccessoryContext {
  device: EWeLinkDevice;
  deviceId: string;
  channelIndex?: number;

  // Cached state
  cacheCurrentPosition?: number;
  cacheTargetPosition?: number;
  cachePositionState?: number;
  cacheTarget?: number;
  cacheLastStartTime?: number;

  // ...
}
```

## Configuration Types

### Device Configuration

```typescript
interface SingleDeviceConfig {
  deviceId: string;
  deviceModel?: string;        // Simulation type (blind, heater, etc.)
  operationTime?: number;      // For position-based simulations
  showAs?: string;             // Alternative display type
  tempSource?: string;         // External temperature source device ID
}

interface MultiDeviceConfig extends SingleDeviceConfig {
  operationTimeDown?: number;  // Down operation time (if different)
  hideChannels?: number[];     // Channels to hide
}

interface LightDeviceConfig {
  deviceId: string;
  deviceModel?: string;
  brightnessStep?: number;     // Brightness increment
}

interface ThermostatDeviceConfig {
  deviceId: string;
  tempOffset?: number;
  humidityOffset?: number;
  offsetFactor?: number;
  minTarget?: number;
  maxTarget?: number;
  targetTempThreshold?: number;
  showHeatCool?: boolean;
}
```

### RF Bridge Types

```typescript
interface RFRemoteInfo {
  name: string;
  remote_type: string;  // '1'-'4' buttons, '5' curtain, '6' motion, '7' contact
  buttonName?: Record<string, string>;
}

interface RFTriggerInfo {
  rfChl: number;
  rfTrig0?: string;
  rfTrig1?: string;
}
```

## API Response Types

```typescript
interface LoginResponse {
  at: string;           // Access token
  rt: string;           // Refresh token
  user: UserInfo;
  region: string;
}

interface DeviceListResponse {
  devicelist: EWeLinkDevice[];
  total: number;
}
```

## Usage

Import types from the index:

```typescript
import {
  EWeLinkDevice,
  DeviceParams,
  AccessoryContext,
  SingleDeviceConfig
} from '../types/index.js';
```
