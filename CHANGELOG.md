# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-12-21

### Added
- Complete TypeScript rewrite of the plugin
- Support for Homebridge 2.0.0 (beta)
- Comprehensive UIID device mapping based on official eWeLink specifications
- Automatic device type detection based on UIID and device parameters
- Token sharing between plugin and UI for seamless authentication
- Automatic session detection in UI - skips login if valid session exists
- Shared API implementation between plugin and UI (no code duplication)
- New curtain accessory with full support for:
  - UIID 11 devices (with setclose parameter)
  - UIID 67 devices (with per parameter)
  - UIID 126 DUALR3 Motor Mode (with automatic detection and motorTurn control)
  - UIID 91, 258 devices
  - Real-time position updates
  - Automatic direction control (opening/closing/stopped)
- New thermostat accessory (UIID 127) with:
  - Heating/cooling state control
  - Target temperature setting
  - Current temperature monitoring
  - Work state indicator
- New temperature/humidity sensor accessory (UIID 15, 181) for read-only sensors
- Automatic service cleanup when device category changes
- Build script to automatically copy compiled files to homebridge-ui

### Changed
- Migrated to ES modules (type: "module")
- Updated authentication to use HMAC-SHA256 signatures
- Improved eWeLink API v2 integration:
  - Fixed login authentication with correct signature method
  - Two-step device discovery (homes → devices)
  - Proper handling of thingList and itemData response structure
  - Correct token extraction from login response
- Enhanced WebSocket client:
  - Fixed heartbeat pong parsing (handles plain text "pong")
  - Added token reload on reconnection
  - Improved error handling and logging
  - Better command response tracking
- Updated UIID device mappings to match original plugin:
  - UIID 103: Changed from SENSOR to LIGHT (CCT)
  - UIID 135-137: Changed from SENSOR to LIGHT (RGB+CCT)
  - UIID 126: Now supports both multi-switch and curtain modes with automatic detection
  - UIID 127: Changed from temperature sensor to thermostat with heating control
  - UIID 15: Now uses dedicated temperature/humidity sensor service

### Fixed
- UIID 126 (DUALR3) curtain operation by adding motorTurn parameter
  - motorTurn: 1 = Opening
  - motorTurn: 2 = Closing
  - motorTurn: 0 = Stop
- Incorrect HomeKit service types for various devices
- WebSocket 406 authentication errors via token reload
- Device discovery returning 0 devices (fixed with proper API flow)
- Country code format in authentication
- JSON key ordering in signature generation
- Service type conflicts when device category changes

### Technical Details
- Node.js 20/22/24 support
- Uses @antfu/eslint-config for code style
- File-based token storage for session persistence
- Automatic detection of curtain devices based on params (currLocation, setclose, location)
- Build process copies API files to homebridge-ui for shared implementation

### Breaking Changes
- Requires Homebridge 1.8.0 or 2.0.0-beta.0 or later
- Requires Node.js 20.18.0, 22.9.0, or 24.x
- Configuration format remains backward compatible

---

## Previous Versions

Previous versions (12.x and below) were maintained as JavaScript implementations.
For historical changes, please refer to the git history.
