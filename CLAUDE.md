# CLAUDE.md

This file provides guidance when working with code in this repository.

## Commands

- **Build**: `npm run build`
- **Lint**: `npm run lint`
- **Lint fix**: `npm run lint:fix`
- **Watch mode**: `npm run watch` (builds, links, and watches with nodemon)

## Architecture

### Overview

Homebridge plugin that integrates eWeLink devices into HomeKit. Built with TypeScript and ES modules.

**Entry Point**: `src/index.ts` → `dist/index.js`

### Directory Structure

```
src/
├── index.ts              # Plugin registration
├── platform.ts           # Main platform class
├── settings.ts           # Plugin constants
├── api/                  # eWeLink API clients
├── accessories/          # Device handlers
│   └── simulations/      # Virtual device simulations
├── constants/            # Configuration constants
├── types/                # TypeScript definitions
└── utils/                # Utility functions
```

### Platform (`src/platform.ts`)

Main platform class that:
- Authenticates with eWeLink cloud
- Fetches and caches device list
- Routes devices to appropriate accessory handlers based on UIID
- Manages WebSocket connection for real-time updates
- Coordinates LAN control for local device communication
- Implements command queue for rate limiting cloud requests

UUID generation: `api.hap.uuid.generate(deviceId)`

### API Layer (`src/api/`)

| File | Purpose |
|------|---------|
| `ewelink-api.ts` | Cloud REST API (login, device list, commands) |
| `ws-client.ts` | WebSocket for real-time updates |
| `lan-control.ts` | Local mDNS device discovery and control |

### Accessories (`src/accessories/`)

**Core accessories** (22 files):
- `switch.ts` - Single/multi-channel switches
- `outlet.ts` - Outlets with power monitoring
- `light.ts` - All light types (dimmer, RGB, CCT, RGB+CCT)
- `curtain.ts` - Motorized curtains/blinds
- `fan.ts` - Ceiling fans with speed control
- `thermostat.ts` - Smart thermostats
- `th-sensor.ts` - Temperature/humidity sensors
- `sensor.ts` - Motion/contact sensors
- `garage.ts` - Garage door openers
- `air-conditioner.ts` - AC controllers
- `humidifier.ts` - Humidifiers
- `diffuser.ts` - Aroma diffusers
- `panel.ts` - NSPanel devices
- `motor.ts` - Generic motors
- `switch-mini.ts` - Mini R4/R5 buttons
- `switch-mate.ts` - S-Mate buttons
- `group.ts` - Device groups
- `virtual.ts` - Virtual devices
- `rf-bridge.ts` - RF Bridge 433MHz
- `rf-button.ts` - RF button sub-devices
- `rf-sensor.ts` - RF sensor sub-devices
- `base.ts` - Base class for all accessories

**Simulations** (`simulations/`, 24 files):
- Window coverings: `blind.ts`, `window.ts`, `door.ts`, `rf-blind.ts`, `rf-window.ts`, `rf-door.ts`
- Climate: `heater.ts`, `cooler.ts`, `th-heater.ts`, `th-cooler.ts`, `th-thermostat.ts`, `th-humidifier.ts`, `th-dehumidifier.ts`
- Sensors: `sensor.ts`, `sensor-visible.ts`, `sensor-leak.ts`
- Controls: `lock.ts`, `valve.ts`, `tap.ts`, `p-button.ts`, `doorbell.ts`
- Other: `light-fan.ts`, `purifier.ts`, `tv.ts`

### Base Accessory (`src/accessories/base.ts`)

Common functionality for all accessories:
- `logInfo()`, `logDebug()`, `logError()` - Logging helpers
- `handleGet()`, `handleSet()` - State handling with error management
- `getOrAddService()` - Service management
- `setupPollingInterval()` - Periodic state refresh
- `setupPowerMonitoringCharacteristics()` - Eve power characteristics

### Constants (`src/constants/`)

| File | Purpose |
|------|---------|
| `device-catalog.ts` | **Main UIID → device mappings** (69KB, single source of truth) |
| `device-constants.ts` | Value ranges, power divisors, RF types |
| `api-constants.ts` | API endpoints by region, timeouts |
| `network-constants.ts` | Ports, connection settings |
| `region-constants.ts` | Country code → region mappings |
| `timing-constants.ts` | Polling/debouncing intervals |

### Utilities (`src/utils/`)

| File | Purpose |
|------|---------|
| `command-queue.ts` | Request throttling (configurable interval/concurrency) |
| `color-utils.ts` | RGB/HSV/color temperature conversion |
| `device-parsers.ts` | Temperature, humidity, battery, switch parsing |
| `switch-helper.ts` | Multi-channel switch state utilities |
| `eve-characteristics.ts` | Eve app custom characteristics |
| `token-storage.ts` | Persistent token storage |
| `crypto-utils.ts` | HMAC-SHA256 API signing |
| `sleep.ts` | Async sleep helper |
| `number-utils.ts` | Clamping, rounding |
| `error-utils.ts` | Error handling utilities |

### Types (`src/types/index.ts`)

Key interfaces:
- `EWeLinkPlatformConfig` - Plugin configuration
- `EWeLinkDevice` - Device data from API
- `DeviceParams` - Device state parameters
- `AccessoryContext` - Homebridge accessory context
- Device configs: `SingleDeviceConfig`, `MultiDeviceConfig`, `ThermostatDeviceConfig`, etc.

## Device Identification (UIID)

Every eWeLink device has a UIID that determines its type and capabilities. Device routing is defined in `device-catalog.ts`.

**Common UIIDs**:
- Switches: 1, 6, 14, 24, 77, 138, 160 (single), 2-4, 7-9, 126 (multi)
- Power monitoring: 5, 32, 126, 165
- Lights: 36, 44, 57 (dimmer), 22 (RGB), 103-104 (CCT), 33, 59, 135-137, 173 (RGB+CCT)
- Curtains: 11, 67, 126 (when has curtain params)
- Sensors: 102, 154 (contact), 15, 181 (ambient)
- Thermostats: 127
- RF Bridge: 28, 98

## Communication Flow

1. Authenticate with eWeLink cloud (HMAC-SHA256 signed)
2. Fetch device list from cloud API
3. Connect WebSocket for real-time updates
4. Attempt LAN control via mDNS discovery
5. Commands: LAN first, then cloud via command queue
6. Real-time sync through WebSocket updates

## Common Device Parameters

```typescript
// Single switch
{ switch: 'on' | 'off' }

// Multi-channel switch
{ switches: [{ outlet: 0, switch: 'on' }] }

// Dimmable light
{ brightness: 0-100, mode: 0 }

// RGB light
{ ltype: 'color' | 'white', color: { r, g, b, br }, white: { br, ct } }

// Curtain (UIID 126)
{ currLocation: 0-100, location: 0-100, motorTurn: 0 | 1 | 2 }

// Curtain (UIID 11)
{ setclose: 0-100 }  // inverted: 0=open, 100=closed

// Thermostat
{ targetTemp: number, switch: 'on' | 'off', workState: 0 | 1 | 2 }

// Fan
{ light: 'on' | 'off', fan: 'on' | 'off', speed: 1-3 }
```

## Important Notes

- **TypeScript**: ES modules, compiled to `dist/`
- **Node.js**: ^20.18.0 || ^22.9.0 || ^24
- **Homebridge**: ^1.8.0 || ^2.0.0-beta.0
- **Linting**: ESLint with strict rules, zero warnings allowed
- **No test suite**: Manual testing required
- **Package**: `@mp-consulting/homebridge-ewelink`

## Homebridge UI

Config UI located in `homebridge-ui/`:
- `server.js` - Express server for configuration
- `public/` - Frontend assets (HTML, JS, CSS)
