# Source Directory Structure

This directory contains the source code for the homebridge-ewelink plugin.

## Files

| File | Description |
|------|-------------|
| `index.ts` | Plugin entry point - registers the platform with Homebridge |
| `platform.ts` | Main platform class - coordinates device discovery, initialization, and lifecycle |
| `settings.ts` | Plugin settings, constants, and device category mappings |

## Directories

| Directory | Description |
|-----------|-------------|
| [`accessories/`](accessories/README.md) | Device accessory handlers (switches, lights, sensors, etc.) |
| [`api/`](api/README.md) | eWeLink API clients (cloud, WebSocket, LAN) |
| [`constants/`](constants/README.md) | Configuration constants and device catalog |
| [`types/`](types/README.md) | TypeScript type definitions |
| [`utils/`](utils/README.md) | Utility functions and helpers |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Homebridge                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    EWeLinkPlatform                           │
│  - Device discovery and initialization                       │
│  - Request queue management (p-queue)                        │
│  - Routes devices to appropriate handlers                    │
└─────────────────────────────────────────────────────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌───────────────────┐
│  EWeLinkAPI   │   │    WSClient     │   │    LANControl     │
│  (Cloud API)  │   │   (WebSocket)   │   │   (Local mDNS)    │
└───────────────┘   └─────────────────┘   └───────────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Accessory Handlers                        │
│  SwitchAccessory, LightAccessory, CurtainAccessory, etc.    │
└─────────────────────────────────────────────────────────────┘
```

## Communication Flow

1. **Authentication**: Plugin authenticates with eWeLink cloud (HMAC-SHA256 signed login)
2. **Device Discovery**: Fetches device list from cloud API
3. **Real-time Updates**: Connects WebSocket for device state changes
4. **Local Control**: Attempts LAN control for supported devices via mDNS
5. **Fallback**: Uses cloud control via WebSocket if LAN unavailable

## Device Identification

Every eWeLink device has a **UIID** (Unique Interface ID) that determines its capabilities.
The device catalog in `constants/device-catalog.ts` maps UIIDs to device information including:
- Device category (switch, light, sensor, etc.)
- Number of channels
- Power monitoring capabilities
- Battery type
- Brightness/position parameters
