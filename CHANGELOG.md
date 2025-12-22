# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-12-21

### Added
- **100% Functional Parity** - Complete TypeScript rewrite achieving full feature parity with original JavaScript implementation
- Complete TypeScript rewrite of the plugin with 22 core device types and 47+ total accessory types
- Support for Homebridge 2.0.0 (beta)
- Comprehensive UIID device mapping based on official eWeLink specifications
- Automatic device type detection based on UIID and device parameters
- Token sharing between plugin and UI for seamless authentication
- Automatic session detection in UI - skips login if valid session exists
- Shared API implementation between plugin and UI (no code duplication)
- **SONOFF Mini (S-MAN)** programmable switch accessory (UIID 174):
  - 6-channel stateless programmable switch (Channel 1-6)
  - Single, double, and long press detection for each channel
  - Event debouncing with 1000ms timeout
  - 5-second event freshness validation
- **SONOFF Mate (S-MATE)** programmable switch accessory (UIID 177):
  - 3-button programmable switch (single/double/long press)
  - Event debouncing with 1000ms timeout
  - 5-second event freshness validation
- **Complete Simulation Framework** with 25 simulation accessories:
  - Garage door variants (1-4 channels, obstruction detection)
  - Lock variants (1+ channels)
  - Valve variants (1-4 channels)
  - Tap variants (1-2 channels)
  - TH simulations (cooler, dehumidifier, heater, humidifier, thermostat)
  - Climate control (cooler, heater, purifier)
  - Position-based (blind, door, window)
  - RF simulations (rf-blind, rf-door, rf-window)
  - Sensor simulations (motion, contact, leak, smoke, CO, CO2, occupancy)
  - Other (doorbell, light-fan, tv, p-button)
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
- **Inching mode support** for switches and outlets with `isInched` configuration
- **Sensor with switch control** with `hideSwitch` configuration option
- **Eve Home characteristics** for power monitoring (CurrentConsumption, Voltage, ElectricCurrent)
- **Power threshold configuration** with `inUsePowerThreshold` for outlet accessories
- Automatic service cleanup when device category changes
- Build script to automatically copy compiled files to homebridge-ui
- **100% Configuration Type Safety** - All 152 config properties fully typed

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
- **WebSocket 406 authentication errors** when logged in elsewhere:
  - Detects token invalidation (concurrent session)
  - Forces fresh login instead of reconnecting with stale tokens
  - Implements exponential backoff (5s, 10s, 20s, 40s, up to 300s)
  - Max reconnection attempts limit (10) to prevent infinite loops
  - Clear user-friendly error messages about concurrent sessions
- Device discovery returning 0 devices (fixed with proper API flow)
- Country code format in authentication
- JSON key ordering in signature generation
- Service type conflicts when device category changes
- Custom UI not loading in Homebridge config (added customUiPath property)

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
