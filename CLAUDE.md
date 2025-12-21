# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- **Lint code**: `npm run lint`
- **Build**: `npm run build`
- **Watch mode**: `npm run watch` (builds, links, and watches with nodemon)

## Architecture

### Core Structure
This is a Homebridge plugin that integrates eWeLink devices into HomeKit. Built with TypeScript and ES modules.

**Entry Point**: `src/index.ts` → compiles to `dist/index.js`

### Key Components

**Platform Layer** (`src/platform.ts`)
- Main platform class that coordinates all plugin operations
- Manages device discovery, initialization, and lifecycle
- Handles configuration and storage via node-persist
- Implements request queue with p-queue for rate limiting
- Routes devices to appropriate handlers based on UIID and configuration
- UUID generation: Uses `api.hap.uuid.generate(deviceId)` for consistent HomeKit identifiers

**API Layer** (`src/api/`)
- `ewelink-api.ts`: Main eWeLink cloud API client
- `http-client.ts`: HTTP request wrapper with region support and authentication
- `ws-client.ts`: WebSocket client for real-time device updates
- `lan-client.ts`: Local network device control via mDNS

**Accessory Layer** (`src/accessories/`)
- Individual device type implementations extending `BaseAccessory`
- Each accessory type implements specific HomeKit characteristics
- Supported types:
  - `switch.ts`: Single/multi-channel switches
  - `outlet.ts`: Outlets with power monitoring
  - `light.ts`, `light-dimmer.ts`, `light-rgb.ts`, `light-cct.ts`: Various light types
  - `curtain.ts`: Window coverings with position control (UIID 11, 67, 126)
  - `sensor.ts`, `th-sensor.ts`: Temperature/humidity sensors
  - `thermostat.ts`: Smart thermostats (UIID 127)
  - `fan.ts`: Ceiling fans with speed control
  - `rf-bridge.ts`, `zigbee-bridge.ts`: Bridge devices

**Base Classes** (`src/accessories/base.ts`)
- `BaseAccessory`: Common functionality for all accessories
  - Logging helpers (`logInfo`, `logDebug`, `logError`)
  - State handling utilities (`handleGet`, `handleSet`)
  - Service management (`getOrAddService`)
  - Command sending via platform

**Utilities** (`src/utils/`)
- `device-parsers.ts`: Value parsing utilities (temperature, humidity, battery, boolean)
- `switch-helper.ts`: Switch state and command building logic
- `color-utils.ts`: RGB/HSV color conversion
- `token-storage.ts`: Persistent token storage

**Constants** (`src/constants/`)
- `device-constants.ts`: Device UIIDs, categories, and mappings
- `network-constants.ts`: Network ports and intervals
- `region-constants.ts`: Country code to region mapping
- `api-constants.ts`: API endpoints and timeouts

**Types** (`src/types/`)
- TypeScript type definitions for devices, accessories, configs

### Device Identification (UIID)

Every eWeLink device has a UIID (unique interface ID) that determines its capabilities.

**Device Routing** (in `src/platform.ts:addAccessory()`):
1. Generate UUID from device ID: `api.hap.uuid.generate(device.deviceid)`
2. Check device UIID against `DEVICE_UIID_MAP` in constants
3. Special UIID 126 handling: Auto-detect curtain vs multi-switch based on params
4. Create appropriate accessory handler instance
5. Register handler in `accessoryHandlers` map by UUID

**Key UIID Categories** (defined in `src/constants/device-constants.ts`):
- Single switches: 1, 6, 14, 24, 77, 138, 160
- Multi switches: 2, 3, 4, 7, 8, 9, 29, 30, 126 (when not curtain)
- Power monitoring: 5, 32, 126, 165
- Dimmable lights: 36, 44, 57
- RGB lights: 22
- CCT lights: 103, 104
- RGB+CCT lights: 33, 59, 135, 136, 137, 173
- Curtains: 11, 67, 126 (when has curtain params)
- Sensors: 102, 154 (contact), 15, 181 (ambient)
- Thermostats: 127
- RF Bridge: 28, 98
- Zigbee Bridge: 66, 128, 168
- Zigbee devices: 1000-7000 range

### Communication Flow

1. Plugin authenticates with eWeLink cloud (HMAC-SHA256 signed login)
2. Fetches device list from cloud API
3. Connects WebSocket for real-time updates
4. Attempts LAN control for supported devices (mDNS discovery)
5. Falls back to cloud control via WebSocket if LAN unavailable
6. Maintains real-time sync through WebSocket updates

### WebSocket Protocol

**Connection** (`src/api/ws-client.ts`):
- Authentication: Action `userOnline` with tokens
- Heartbeat: Sends `ping` every 90 seconds
- Commands: Action `update` with device params
- Queries: Action `query` to fetch fresh device state
- Updates: Receives action `update` for device state changes

**Query Pattern** (used by curtain accessories):
```typescript
// Send query
const message = {
  action: 'query',
  apikey: apiKey,
  deviceid: deviceId,
  params: [],
  sequence: timestamp,
  ts: 0,
  userAgent: 'app'
};

// Response triggers handleDeviceUpdate()
// Accessory's updateState() method is called with fresh params
```

### Common Device Parameters

- **Single Switch**: `{switch: 'on'/'off'}`
- **Multi Switch**: `{switches: [{outlet: 0, switch: 'on'}]}`
- **Dimmable**: `{brightness: 0-100, mode: 0}`
- **RGB Light**: `{ltype: 'color'/'white', color: {r, g, b, br}, white: {br, ct}}`
- **Curtain (UIID 126)**: `{currLocation: 0-100, location: 0-100, motorTurn: 0/1/2}`
- **Curtain (UIID 11)**: `{setclose: 0-100}` (inverted: 0=open, 100=closed)
- **Thermostat**: `{targetTemp: number, switch: 'on'/'off', workState: 0/1/2}`
- **Fan**: `{light: 'on'/'off', fan: 'on'/'off', speed: 1-3}`

### State Management

- **Cached Accessories**: Loaded via `configureAccessory()` at startup
- **State Updates**: Routed by UUID through `handleDeviceUpdate()`
- **State Refresh**: Curtains auto-query state 5 seconds after init
- **Persistence**: Uses node-persist for token storage

### Error Handling Patterns

All accessories use consistent error handling through `BaseAccessory`:

```typescript
// Get operations
handleGet(getter: () => T, characteristic: string): Promise<T>

// Set operations with automatic retry and logging
handleSet(value: T, characteristic: string, setter: (val: T) => Promise<boolean>)
```

## Important Notes

- **TypeScript**: ES modules, compiled to `dist/` directory
- **Node.js**: Requires Node.js 20/22/24
- **Homebridge**: Compatible with v1.8+ and v2.0 beta
- **Linting**: Uses `@antfu/eslint-config` with strict rules
- **No Tests**: Manual testing required
- **Package Scope**: `@mp-consulting/homebridge-ewelink`
- **Repository**: https://github.com/mp-consulting/homebridge-ewelink

## Recent Improvements

- Curtain accessories now auto-refresh state on startup to prevent stale position display
- WebSocket query responses properly route to device `updateState()` methods
- Extracted utilities for code reuse (device-parsers, switch-helper, color-utils)
- Centralized constants for better maintainability
- Homebridge UI server refactored with unified error handling and validation
