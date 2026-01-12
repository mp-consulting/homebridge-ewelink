# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.18] - 2026-01-12

### Fixed
- **Dual Registry Publishing**: Removed project .npmrc to allow publishing to both registries

## [1.0.17] - 2026-01-12

### Fixed
- **Dual Registry Publishing**: Fixed publish scripts to correctly target each registry

## [1.0.16] - 2026-01-12

### Added
- **Dual Registry Publishing**: Added npm scripts for publishing to both npmjs.com and GitHub Packages

## [1.0.15] - 2026-01-12

### Added
- **UI LAN Discovery**: Configuration UI now performs real-time mDNS discovery to show actual LAN availability
  - Device list shows discovered LAN IP addresses instead of relying solely on API data
  - Devices discovered via mDNS are marked as LAN-enabled even if API doesn't report it

## [1.0.14] - 2026-01-12

### Changed
- **Improved LAN Discovery**: Replaced `multicast-dns` with `bonjour-service` for mDNS device discovery
  - Better compatibility with mDNS proxies/reflectors (e.g., UniFi Gateway mDNS Proxy)
  - Devices on different VLANs are now properly discovered when mDNS proxy is enabled
  - Fixed issue where Node.js raw multicast sockets weren't receiving proxied mDNS responses
- **Enhanced LAN Diagnostics**: Added logging for devices that support LAN but don't have IP from API

## [1.0.13] - 2026-01-11

### Added
- **Curtain Mid-Movement Stop**: Tapping a curtain while moving now sends a stop command when target is within 5% of current position
- **Position Update Debouncing**: Reduces HomeKit characteristic spam during curtain movement
  - Only updates when position changes by ≥5% or reaches target
  - Small changes are batched with 1000ms delay
- **Curtain Reached Target Detection**: Logs info message when curtain reaches its target position
- **motorTurn=0 Stop Signal Handling**: Properly handles explicit stop signals from curtain devices
- **Command Queue Config Options**: New `commandQueueInterval` and `commandQueueConcurrency` config options

### Changed
- **Command Queue Logging**: Now shows device display names instead of raw device IDs for easier debugging
- **Reduced Verbose Logging**: Changed curtain diagnostic logs from info to debug level

## [1.0.12] - 2026-01-11

### Added
- **Command Queue with Throttling**: Added request queuing to prevent bulk command overload on cloud API
  - Commands are now spaced 500ms apart with max 2 concurrent requests
  - LAN commands bypass the queue (no rate limiting on local network)
  - Prevents timeouts when HomeKit scenes trigger multiple devices simultaneously
- **LAN Control Diagnostics**: Enhanced logging for LAN mode troubleshooting
  - Logs discovery status 10 seconds after startup
  - Lists devices found/not found on LAN with IP addresses
  - Better error messages when commands fall back to cloud

### Changed
- **Improved Command Flow**: LAN control is now attempted first (before queueing)
  - If LAN succeeds, returns immediately with no queue delay
  - If LAN fails, command goes through throttled queue for cloud/WebSocket
- **Enhanced Logging**: Device names now shown in LAN command logs instead of device IDs

## [1.0.11] - 2026-01-09

### Fixed
- **RF Sub-Device Commands**: Fixed "Device not found in cache" error when pressing RF buttons
  - RF sub-devices (e.g., `1001eb99faSW1`) now correctly resolve to parent device ID for cache lookup
  - Applied same fix to multi-channel device commands in WebSocket and LAN control

### Changed
- **Simplified Build Process**: Removed copy-api script, UI server now imports directly from dist folder
  - Eliminated duplicate files in homebridge-ui directory
  - UI server uses proper file-relative paths for ES module imports

## [1.0.10] - 2026-01-08

### Changed
- **Improved WebSocket Reliability**: Enhanced timeout handling and retry logic
  - Increased WebSocket command/query timeout from 10s to 20s to accommodate network latency
  - Added automatic retry logic (up to 3 attempts) for failed WebSocket commands on timeout
  - Staggered curtain state refresh on startup to prevent overwhelming WebSocket (1s intervals)
  - Reduced log noise for dispatch service 503 errors (moved to debug level, fallback works automatically)

## [1.0.9] - 2025-12-26

### Fixed
- **Missing Device Catalog in UI**: Fixed module not found error for `device-catalog.js` in homebridge-ui
  - Added `constants/device-catalog.js` and `constants/device-catalog.d.ts` to the build copy script
  - The `settings.js` file imports from device-catalog, which was not being copied to homebridge-ui

## [1.0.8] - 2025-12-23

### Added
- **Comprehensive Documentation**: Added README files in each src folder documenting:
  - Architecture overview and communication flow diagrams
  - File listings with descriptions for all modules
  - Usage examples and code patterns
  - Helper function documentation

### Changed
- **Code Refactoring**: Standardized code patterns across accessories
  - Replaced manual polling setup with `setupPollingInterval()` helper in 12 simulation files
  - Replaced manual power monitoring setup with `setupPowerMonitoringCharacteristics()` helper
  - Standardized service creation with `getOrAddService()` helper in diffuser, panel, switch-mini
  - Used `ColorUtils` helpers for color temperature conversions in light.ts
  - Removed 183 lines of duplicate interval management code
- **Device Catalog Usage**: Refactored to use catalog helper functions directly
  - `getChannelCount()` instead of `DEVICE_CHANNEL_COUNT` map access
  - Direct imports from `device-catalog.ts` for better tree-shaking

### Fixed
- Consistent service lookup by subtype instead of display name (more reliable on restore)

## [1.0.7] - 2025-12-23

### Added
- **Cross-Device Temperature Sharing**: Heater/cooler simulations can now use temperature from nearby TH sensors
  - New `temperatureSource` configuration option to specify a device ID to read temperature from
  - Temperature is cached and shared between devices using platform-level temperature cache
  - Supports TH sensors, thermostats, panels, and air conditioners as temperature sources

### Changed
- **Type Safety Improvements**: Removed all `as any` casts for better type safety
  - Added `WebSocketAuthError` class for proper error handling in WebSocket reconnection
  - Added `getAccessoryHandler()` method to platform for type-safe handler access
  - Fixed battery service types in sensor accessories
  - Fixed RF device config lookup to use proper `platform.config.rfDevices` path
- **New Helper Functions**: Added reusable helpers to device catalog
  - `hasCurtainParams()` - Check if device params indicate curtain mode
  - `isCurtainByParams()` - Determine curtain category from UIID and params
  - `isRFButtonType()`, `isRFSensorType()`, `isRFCurtainType()` - RF remote type helpers
- **New Constants**: Extracted magic values to named constants
  - `RF_REMOTE_TYPE` - RF Bridge remote type values
  - `RF_BUTTON_TYPES`, `RF_SENSOR_TYPES` - RF type categories
  - `SWITCH_EVENT` - HomeKit programmable switch event values
  - `CHANNEL_SUFFIX_PATTERN` - Regex for multi-channel device ID matching
- **Base Accessory Enhancement**: Added `mergeDeviceParams()` method to reduce code duplication

### Fixed
- **Memory Leak in LAN Control**: Fixed uncleaned mDNS query interval in `stop()` method
- **RF Simulation Config**: Fixed RF blind/door/window accessories to properly load config from `platform.config.rfDevices`

## [1.0.6] - 2025-12-22

### Changed
- **Code Quality Improvements**: Major refactoring to improve maintainability and reduce code duplication
  - Extracted Eve characteristic UUIDs to centralized constants (eliminated 69 duplications across 11 files)
  - Created timing constants file for all timeout values (replaced 30+ magic numbers)
  - Extracted inching mode logic to base class method (removed 45 lines of duplicate code)
  - Added utility functions for error handling, number parsing, and type conversion
  - Added power monitoring UIID constants for capability detection
  - Added `channelIndex` getter to BaseAccessory (removed duplicate properties from 15 accessories)
  - Overall: 24 files modified, net reduction of 30 lines while improving code organization

### Fixed
- **RF Button Service Names**: RF button services now correctly update when button names change in eWeLink
  - Changed from name-based to stable subtype-based service identification
  - Display names now update dynamically when configuration changes

## [1.0.5] - 2025-12-22

### Changed
- **RF Sub-Device Naming**: RF sub-devices now properly display names from eWeLink configuration
  - Uses button names from `zyx_info.buttonName` for switch services
  - Updates display name for existing accessories when name changes
- **UI Code Refactoring**: Simplified and cleaned up UI server and client code
  - Reduced `server.js` from 262 to 165 lines
  - Reduced `script.js` from 259 to 180 lines
  - Improved error handling and code organization

### Fixed
- **UI Device List Error**: Fixed "devices.map is not a function" error when refreshing devices
  - Now handles both array and object response formats from API

## [1.0.4] - 2025-12-22

### Fixed
- **RF/Multi-Channel Sub-Device Removal**: Fixed stale accessory removal incorrectly deleting sub-devices
  - RF sub-devices and multi-channel sub-devices are now properly preserved
  - Checks parent device existence instead of sub-device ID (matches original plugin behavior)

## [1.0.3] - 2025-12-22

### Added
- **Extended Country Code Support**: Added 60+ country codes in the configuration UI
  - Organized by region: Americas, Europe, Asia Pacific, Middle East, Africa
  - Option groups for better navigation in the dropdown
  - Updated region mapping for all new country codes
- **Query Retry Logic**: Device state queries now automatically retry on timeout
  - 3 retry attempts with 2 second delay between retries
  - Configurable via `QUERY_RETRY` constants

### Changed
- **Human-Readable Device Names in Logs**: Log messages now show device names instead of device IDs
  - Query timeout messages show device name for easier identification
  - Added `getDeviceDisplayName()` helper method to platform

### Fixed
- **Groups API Error**: Fixed "api not found" error when fetching groups
  - Groups are now extracted from the same `/v2/device/thing` API response as devices
  - Removed separate `/v2/group` API call that was returning errors
- **UI Code Organization**: Extracted CSS and JavaScript into separate files
  - `styles.css` - All CSS styles including dark mode support
  - `script.js` - All JavaScript logic for the configuration UI

## [1.0.2] - 2025-12-22

### Added
- **RF Bridge Sub-Device Support**: RF Bridge devices (UIID 28, 98) now automatically create sub-devices for learned RF buttons and sensors
  - Parses `device.tags.zyx_info` to create individual accessories
  - Supports button types 1-4 (RF buttons)
  - Supports sensor types 6-7 (RF sensors)
  - Supports curtain type 5 with configurable simulations (blind/door/window)
  - Each sub-device gets its own UUID pattern: `${bridgeDeviceId}SW${index}`
- **Multi-Channel Device Sub-Accessories**: Multi-channel switches and outlets now create individual accessories for each channel
  - Automatic sub-accessory creation for all multi-channel UIIDs (2, 3, 4, 7, 8, 9, 29, 30, 31, 41, 82, 83, 84, 113, 114, 126, 161, 162, 165, 210-212, etc.)
  - Each channel gets its own accessory with UUID pattern: `${deviceId}SW0`, `SW1`, `SW2`, etc.
  - Channel 0 is the master switch, channels 1-N are individual outlets/switches
  - Support for `hideChannels` configuration to hide specific channels
  - Support for `inchChannels` configuration for inching mode on specific channels
- **Group Device Support**: eWeLink cloud groups now fully supported
  - Automatic group discovery from eWeLink API
  - Groups use HTTP API endpoint with `type: 2` parameter
  - Groups assigned special UIID 5000
  - Full control and state synchronization
- **Device Context Enrichment**: All accessories now include comprehensive metadata
  - Firmware version tracking
  - WAN reachability status
  - LAN reachability status
  - Brand name and logo URL
  - MAC address
  - Shared device status
  - Device key for LAN control

### Fixed
- **Multi-Channel Update Broadcasting**: Device state updates now properly broadcast to ALL sub-accessories
  - When a multi-channel device updates, all channels (SW0-SW4) receive the update simultaneously
  - Fixes synchronization issues where only one channel would update
  - Reachability status (WAN/LAN) propagated to all sub-accessories
- **Master Switch Primary State Logic**: Master switch (channel 0) now correctly shows ON if ANY channel is ON
  - Implements "primary state" logic from original plugin
  - Uses `params.switches.some()` to check all channels
  - Fixes UX issue where master switch didn't reflect true device state
- **WebSocket Sub-Device Message Handling**: Added handlers for `reportSubDevice` and `subDevice` WebSocket actions
  - Prevents "Unknown action" warnings in logs
  - Properly handles Zigbee bridge sub-device state reports
- **TH10/16 Device Parameters**: Thermostat devices now send correct parameters
  - Added `mainSwitch` parameter alongside `switch`
  - Ensures `deviceType: 'normal'` is sent for all TH device commands
  - Fixes compatibility with TH10/16 devices in all modes
- **Device Online/Offline Status**: Implemented proper device status tracking
  - Added `markStatus()` method to all accessories
  - Device online/offline status updates tracked in context
  - HomeKit shows NO RESPONSE when devices are offline
  - Platform calls `markStatus()` when WebSocket reports status changes
- **RF Bridge sub-device creation** - RF devices now appear in HomeKit
- **Custom UI not loading in Homebridge config** - Already fixed in 1.0.0 (added customUiPath property)

### Technical Details
- Added `DEVICE_CHANNEL_COUNT` constant mapping all UIIDs to channel counts
- Enhanced `handleDeviceUpdate()` to broadcast to multi-channel sub-accessories
- Implemented `createRFSubDevices()` method for RF Bridge sub-device creation
- Implemented `createMultiChannelSubDevices()` method for multi-channel devices
- Added `getGroups()` and `updateGroup()` methods to eWeLink API client
- Enhanced `AccessoryContext` with metadata fields (firmware, reachability, brand info, MAC, etc.)
- Added `markStatus()` base method for online/offline tracking
- Multi-channel devices now use `switchNumber` context property

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
