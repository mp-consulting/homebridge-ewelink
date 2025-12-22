# homebridge-ewelink

[![npm](https://img.shields.io/npm/v/@mp-consulting/homebridge-ewelink/latest?label=latest)](https://www.npmjs.com/package/@mp-consulting/homebridge-ewelink)
[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=flat)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Homebridge plugin to integrate eWeLink devices into HomeKit.

<p align="center">
  <img width="60%" src="https://user-images.githubusercontent.com/43026681/101325266-63126600-3863-11eb-9382-4a2924f0e540.png">
</p>

## Features

- 🎉 **100% Functional Parity** - Complete TypeScript rewrite with full feature parity from original JavaScript implementation
- 🏠 **Native HomeKit Support** - Control your eWeLink devices via Siri, Home app, and automations
- 🌐 **Hybrid Connection** - Automatic LAN/cloud failover for reliable connectivity
- ⚡ **Real-time Updates** - Instant status updates via WebSocket with intelligent reconnection handling
- 🎨 **Custom UI** - Beautiful configuration interface built into Homebridge
- 📱 **Multi-device Support** - 22 core device types with 47+ total accessory types including switches, lights, sensors, fans, thermostats, and simulation accessories
- 🔐 **Secure Authentication** - HMAC-SHA256 signature-based login with token sharing
- 🔄 **Automatic Session Management** - UI automatically detects and uses existing plugin sessions
- 🔁 **Smart Reconnection** - Handles concurrent sessions gracefully with automatic fresh login and exponential backoff
- 🎯 **Smart Device Detection** - Automatically detects device types based on UIID and parameters
- 🎮 **Programmable Switches** - Full support for SONOFF Mini (S-MAN) and SONOFF Mate (S-MATE) with single, double, and long press detection
- 📡 **RF Bridge Support** - Automatic sub-device creation for RF buttons and sensors learned by RF Bridge (UIID 28, 98)
- 🔌 **Multi-Channel Devices** - Individual accessories for each channel in multi-channel switches (SONOFF 4CH, DUALR3, etc.)
- 👥 **Group Control** - Full support for eWeLink cloud groups with automatic discovery
- 📊 **Device Status Tracking** - Real-time online/offline status with NO RESPONSE display in HomeKit

## Installation

### Through Homebridge UI

1. Open the Homebridge UI
2. Go to the Plugins tab
3. Search for `@mp-consulting/homebridge-ewelink`
4. Click Install

### Manual Installation

```bash
npm install -g @mp-consulting/homebridge-ewelink
```

## Configuration

### Using the Homebridge UI (Recommended)

1. Open the Homebridge UI
2. Navigate to the Plugins tab
3. Find the eWeLink plugin and click "Settings"
4. Enter your eWeLink credentials
5. Click "Save"

### Manual Configuration

Add the following to your `config.json`:

```json
{
  "platforms": [
    {
      "platform": "eWeLink",
      "name": "eWeLink",
      "username": "your-email@example.com",
      "password": "your-password",
      "countryCode": "+1",
      "mode": "auto"
    }
  ]
}
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `username` | string | Required | Your eWeLink email or phone number |
| `password` | string | Required | Your eWeLink password |
| `countryCode` | string | `+1` | Your country code (e.g., +1, +44, +86) |
| `mode` | string | `auto` | Connection mode: `auto`, `lan`, or `wan` |
| `debug` | boolean | `false` | Enable debug logging |
| `disableDeviceLogging` | boolean | `false` | Disable individual device logging |
| `offlineAsOff` | boolean | `false` | Show offline devices as "Off" instead of "No Response" |

## Supported Devices

This plugin supports a wide range of eWeLink devices. Device types are automatically detected based on their UIID (unique interface ID).

### Switches & Outlets
- **Single-channel switches** - UIID 1, 6, 14, 24, 27, 77, 78, 81, 107, 112, 138, 160, 168, 182, 190
- **Multi-channel switches** - UIID 2, 3, 4, 7, 8, 9, 29, 30, 31, 41, 82, 83, 84, 113, 114, 139-141, 161-163, 178, 210-212
- **Smart plugs with power monitoring** - UIID 5, 32, 126, 165, 262
- **SONOFF Mini (S-MAN)** - UIID 174 - 6-channel stateless programmable switch with single, double, and long press detection
- **SONOFF Mate (S-MATE)** - UIID 177 - 3-button programmable switch with single, double, and long press modes

### Lights
- **Dimmable lights** - UIID 36, 44, 57
- **RGB lights** - UIID 22
- **Color temperature (CCT) lights** - UIID 103
- **RGB+CCT lights** - UIID 33, 59, 104, 135-137, 173

### Curtains & Motors
- **Window coverings** - UIID 11, 67, 91, 258
- **DUALR3 Motor Mode** - UIID 126 (with automatic detection)
  - Supports position control (0-100%)
  - Automatic direction control (opening/closing)
  - Real-time position updates

### Sensors
- **Temperature/Humidity sensors** - UIID 15, 181 (read-only)
- **Contact/Door sensors** - UIID 102, 154
- **Motion sensors** - UIID 130, 133, 191, 195
- **Ambient sensors** - UIID 15, 181

### Thermostats
- **Smart thermostats** - UIID 127 (with heating control)
- **TH10/TH16** - UIID 15, 18 (temperature/humidity monitoring)

### Fans
- **iFan03/04** - UIID 34
- Smart ceiling fans with speed control

### RF Bridge
- **RF 433MHz bridges** - UIID 28, 98
- Sub-devices controlled via RF signals

### Zigbee Devices
- **Zigbee bridges** - UIID 66, 128, 168
- **Zigbee switches** - UIID 1000, 7000
- **Zigbee lights** - UIID 1257, 1258, 3258 (dimmer, CCT, RGB+CCT)
- **Zigbee curtains** - UIID 1514, 7006
- **Zigbee sensors** - UIID 1770, 1771, 2026, 3026, 4026, 5026, 7002, 7003, 7014, 7016, 7019
- **Zigbee thermostats** - UIID 7017

## Connection Modes

| Mode | Description |
|------|-------------|
| `auto` | Tries LAN control first, falls back to cloud if unavailable |
| `lan` | LAN-only mode (requires devices to support DIY mode) |
| `wan` | Cloud-only mode (works through internet) |

## Development

### Prerequisites

- Node.js 20 or later
- npm

### Setup

```bash
# Clone the repository
git clone https://github.com/mp-consulting/homebridge-ewelink.git
cd homebridge-ewelink

# Install dependencies
npm install

# Build
npm run build

# Link for development
npm link
```

### Watch Mode

```bash
npm run watch
```

## Troubleshooting

### Common Issues

1. **"Login failed"**
   - Verify your credentials are correct
   - Ensure you're using the correct country code
   - Try logging out and back into the eWeLink app

2. **"No Response" in Home app**
   - Check if the device is online in the eWeLink app
   - Enable `offlineAsOff` in config to show offline devices as "Off"
   - Check Homebridge logs for errors

3. **Devices not discovered**
   - Ensure devices are properly added to your eWeLink account
   - Wait a few minutes and restart Homebridge

### Debug Mode

Enable debug logging in the plugin settings to see detailed logs:

```json
{
  "debug": true
}
```

## Support

- [GitHub Issues](https://github.com/mp-consulting/homebridge-ewelink/issues)
- [GitHub Wiki](https://github.com/mp-consulting/homebridge-ewelink/wiki)
- [Discord](https://discord.com/channels/432663330281226270/742733745743855627)

## Credits

- Original plugin maintainer: [@gbro115](https://github.com/gbro115)
- Successive contributors: [@MrTomAsh](https://github.com/MrTomAsh), [@howanghk](https://github.com/howanghk), [@bwp91](https://github.com/bwp91)
- [Homebridge](https://homebridge.io) creators and contributors

## License

MIT License - see [LICENSE](LICENSE) for details.
