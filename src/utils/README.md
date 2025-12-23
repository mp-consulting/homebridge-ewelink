# Utilities

This directory contains utility functions and helpers used throughout the plugin.

## Files

| File | Description |
|------|-------------|
| `color-utils.ts` | Color conversion utilities (RGB, HSV, color temperature) |
| `device-parsers.ts` | Device value parsing and normalization |
| `switch-helper.ts` | Switch state management utilities |
| `eve-characteristics.ts` | Eve app custom characteristics |
| `token-storage.ts` | Persistent token storage using node-persist |
| `crypto-utils.ts` | Cryptographic utilities for API signing |
| `sleep.ts` | Async sleep and random string generation |
| `number-utils.ts` | Number formatting and clamping |
| `error-utils.ts` | Error handling utilities |

## ColorUtils (color-utils.ts)

Color space conversion utilities for light accessories.

### Methods

| Method | Description |
|--------|-------------|
| `rgbToHsv(r, g, b)` | Convert RGB (0-255) to HSV |
| `hsvToRgb(h, s, v)` | Convert HSV to RGB (0-255) |
| `kelvinToMired(kelvin)` | Convert Kelvin to Mired color temp |
| `miredToKelvin(mired)` | Convert Mired to Kelvin |
| `ct0_100ToMired(ct)` | Convert 0-100 scale to Mired |
| `miredToCt0_100(mired)` | Convert Mired to 0-100 scale |

### Example

```typescript
import { ColorUtils } from '../utils/color-utils.js';

// Convert device's 0-100 color temp to HomeKit mired
const mired = ColorUtils.ct0_100ToMired(deviceParams.white.ct);

// Convert HomeKit mired to device's 0-100 scale
const deviceCt = ColorUtils.miredToCt0_100(homeKitMired);
```

## DeviceValueParser (device-parsers.ts)

Parses and normalizes device parameter values.

### Methods

| Method | Description |
|--------|-------------|
| `parseTemperature(value, offset?)` | Parse temperature with optional offset |
| `parseHumidity(value, offset?)` | Parse humidity with optional offset |
| `parseBattery(value)` | Parse battery level (0-100) |
| `switchToBool(value)` | Convert 'on'/'off' to boolean |
| `boolToSwitch(value)` | Convert boolean to 'on'/'off' |

### Example

```typescript
import { DeviceValueParser } from '../utils/device-parsers.js';

const temp = DeviceValueParser.parseTemperature(params.currentTemperature, 2.5);
const isOn = DeviceValueParser.switchToBool(params.switch);
```

## SwitchHelper (switch-helper.ts)

Utilities for managing switch states in multi-channel devices.

### Methods

| Method | Description |
|--------|-------------|
| `getSwitchState(params, channel)` | Get switch state for a channel |
| `buildSwitchCommand(channel, state)` | Build command to set switch state |
| `buildMultiSwitchCommand(states)` | Build command for multiple switches |

### Example

```typescript
import { SwitchHelper } from '../utils/switch-helper.js';

// Get state of channel 1
const isOn = SwitchHelper.getSwitchState(deviceParams, 1);

// Build command to turn on channel 2
const cmd = SwitchHelper.buildSwitchCommand(2, true);
// Result: { switches: [{ outlet: 2, switch: 'on' }] }
```

## EveCharacteristics (eve-characteristics.ts)

Custom HomeKit characteristics for Eve app compatibility.

### Characteristics

| Characteristic | UUID | Description |
|----------------|------|-------------|
| `CurrentConsumption` | `E863F10D-...` | Power consumption (Watts) |
| `Voltage` | `E863F10A-...` | Voltage (V) |
| `ElectricCurrent` | `E863F126-...` | Current (A) |
| `TotalConsumption` | `E863F10C-...` | Total energy (kWh) |
| `LastActivation` | `E863F11A-...` | Last activation time |
| `TimesOpened` | `E863F129-...` | Open count |

### Usage

```typescript
import { EVE_CHARACTERISTIC_UUIDS } from '../utils/eve-characteristics.js';

// Add power characteristic to service
if (!service.testCharacteristic(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption)) {
  service.addCharacteristic(platform.eveCharacteristics.CurrentConsumption);
}

// Update power reading
service.updateCharacteristic(EVE_CHARACTERISTIC_UUIDS.CurrentConsumption, 42.5);
```

## TokenStorage (token-storage.ts)

Persistent storage for authentication tokens using node-persist.

### Methods

| Method | Description |
|--------|-------------|
| `init(storagePath)` | Initialize storage |
| `getTokens()` | Get stored tokens |
| `setTokens(tokens)` | Save tokens |
| `clearTokens()` | Remove stored tokens |

## CryptoUtils (crypto-utils.ts)

Cryptographic utilities for API authentication.

### Methods

| Method | Description |
|--------|-------------|
| `generateNonce()` | Generate random nonce for API requests |
| `hmacSign(data, key)` | HMAC-SHA256 signature |

## Sleep (sleep.ts)

Async utilities.

### Functions

| Function | Description |
|----------|-------------|
| `sleep(ms)` | Async sleep for specified milliseconds |
| `generateRandomString(length)` | Generate random alphanumeric string |

### Example

```typescript
import { sleep, generateRandomString } from '../utils/sleep.js';

await sleep(1000);  // Wait 1 second
const key = generateRandomString(8);  // e.g., "a1b2c3d4"
```

## NumberUtils (number-utils.ts)

Number manipulation utilities.

### Functions

| Function | Description |
|----------|-------------|
| `clamp(value, min, max)` | Clamp value to range |
| `roundTo(value, decimals)` | Round to decimal places |

## ErrorUtils (error-utils.ts)

Error handling utilities.

### Functions

| Function | Description |
|----------|-------------|
| `isNetworkError(error)` | Check if error is network-related |
| `getErrorMessage(error)` | Extract error message safely |
