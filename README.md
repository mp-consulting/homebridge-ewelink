# homebridge-ewelink

[![npm version](https://img.shields.io/npm/v/@mp-consulting/homebridge-ewelink.svg)](https://www.npmjs.com/package/@mp-consulting/homebridge-ewelink)
[![License](https://img.shields.io/npm/l/@mp-consulting/homebridge-ewelink.svg)](https://github.com/mp-consulting/homebridge-ewelink/blob/main/LICENSE)

Homebridge plugin to integrate eWeLink devices into HomeKit. Complete TypeScript rewrite with full feature parity from the original JavaScript implementation.

> Originally based on [homebridge-ewelink](https://github.com/homebridge-plugins/homebridge-ewelink) by the Homebridge Plugins team, licensed under the Apache License 2.0. This fork has been substantially rewritten by [MP Consulting](https://github.com/mp-consulting).

## Features

- **Hybrid Connection** - Automatic LAN/cloud failover; LAN commands bypass the cloud queue for instant response
- **Real-time Updates** - Instant status changes via WebSocket with automatic reconnection and exponential backoff
- **22 Device Types** - Switches, outlets, lights, curtains, fans, thermostats, sensors, RF Bridge, and more
- **47+ Accessory Types** - Including 25 simulation accessories (garage, lock, valve, blind, heater, cooler, etc.)
- **Multi-Channel Devices** - Per-channel accessories for SONOFF 4CH, DUALR3, and similar devices
- **RF Bridge** - Automatic sub-device creation for RF buttons and sensors (UIID 28, 98)
- **Group Control** - Full eWeLink cloud group discovery and control
- **Programmable Switches** - SONOFF Mini S-MAN (6 channels) and S-MATE (3 buttons) with single/double/long press
- **Command Queue** - Throttled cloud requests (500 ms spacing, 2 concurrent) to handle HomeKit scene bursts
- **LAN Discovery** - Real-time mDNS discovery with cross-VLAN support via mDNS proxy
- **Custom Config UI** - Device list with LAN/RF/online badges, RF sub-device display, settings tab
- **Session Management** - Automatic token reuse; fresh login on concurrent session detection
- **60+ Country Codes** - Organized by region in the configuration UI

## Supported Devices

### Switches & Outlets

| Category | UIIDs |
|----------|-------|
| Single-channel switches | 1, 6, 14, 24, 27, 77, 78, 81, 107, 112, 138, 160, 168, 182, 190 |
| Multi-channel switches | 2, 3, 4, 7, 8, 9, 29, 30, 31, 41, 82, 83, 84, 113, 114, 139–141, 161–163, 178, 210–212 |
| Smart plugs with power monitoring | 5, 32, 126, 165, 262 |
| SONOFF Mini S-MAN (6-ch programmable) | 174 |
| SONOFF Mate S-MATE (3-btn programmable) | 177 |

### Lights

| Category | UIIDs |
|----------|-------|
| Dimmable | 36, 44, 57 |
| RGB | 22 |
| Color temperature (CCT) | 103 |
| RGB+CCT | 33, 59, 104, 135–137, 173 |

### Curtains & Motors

| Category | UIIDs |
|----------|-------|
| Window coverings | 11, 67, 91, 258 |
| DUALR3 Motor Mode (position control) | 126 |

### Sensors & Climate

| Category | UIIDs |
|----------|-------|
| Temperature/Humidity | 15, 181 |
| Contact/Door | 102, 154 |
| Motion | 130, 133, 191, 195 |
| Smart thermostat | 127 |
| TH10/TH16 monitoring | 15, 18 |
| Ceiling fans (iFan03/04) | 34 |

### RF & Zigbee

| Category | UIIDs |
|----------|-------|
| RF 433MHz Bridge | 28, 98 |
| Zigbee bridges | 66, 128, 168 |
| Zigbee switches | 1000, 7000 |
| Zigbee lights (dimmer, CCT, RGB+CCT) | 1257, 1258, 3258 |
| Zigbee curtains | 1514, 7006 |
| Zigbee sensors | 1770, 1771, 2026, 3026, 4026, 5026, 7002, 7003, 7014, 7016, 7019 |
| Zigbee thermostats | 7017 |

## Installation

### Using Homebridge Config UI X (Recommended)

1. Search for `@mp-consulting/homebridge-ewelink` in the Plugins tab
2. Click **Install**
3. Configure the plugin in Settings

### Manual Installation

```bash
npm install -g @mp-consulting/homebridge-ewelink
```

## Configuration

### Using the Homebridge UI (Recommended)

1. Open the Homebridge Config UI X settings page for the plugin
2. Enter your eWeLink email, password, and country code
3. Click **Save** — the plugin will authenticate and discover your devices

### Manual Configuration

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

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `username` | string | Required | eWeLink email or phone number |
| `password` | string | Required | eWeLink password |
| `countryCode` | string | `+1` | Country dial code (e.g. `+1`, `+44`, `+86`) |
| `mode` | string | `auto` | Connection mode: `auto`, `lan`, or `wan` |
| `debug` | boolean | `false` | Enable verbose debug logging |
| `disableDeviceLogging` | boolean | `false` | Suppress per-device state change logs |
| `offlineAsOff` | boolean | `false` | Show offline devices as "Off" instead of "No Response" |
| `commandQueueInterval` | number | `500` | Milliseconds between queued cloud commands |
| `commandQueueConcurrency` | number | `2` | Max simultaneous cloud commands |

### Connection Modes

| Mode | Description |
|------|-------------|
| `auto` | LAN control first, cloud fallback if device unreachable locally |
| `lan` | Local network only (requires DIY-mode compatible devices) |
| `wan` | Cloud only (works over the internet) |

## Simulation Accessories

Simulation accessories let you expose a switch as a different HomeKit accessory type. Configure them in the plugin settings under each device's options.

**Available simulations:**

- **Window coverings**: Blind, Window, Door (with position control)
- **RF coverings**: RF Blind, RF Window, RF Door
- **Climate**: Heater, Cooler, TH Heater, TH Cooler, TH Thermostat, TH Humidifier, TH Dehumidifier
- **Security**: Lock (1–4 channels)
- **Water**: Valve (1–4 channels), Tap (1–2 channels)
- **Sensors**: Motion, Contact, Leak, Visible
- **Other**: Garage Door (1–4 channels), Doorbell, Light Fan, TV, Purifier, Programmable Button

## Troubleshooting

### Login Failed

- Verify your credentials are correct
- Make sure the country code matches your eWeLink account region
- Try logging out and back into the eWeLink app to confirm the account is active

### No Response in Home App

- Check if the device is online in the eWeLink app
- Enable `offlineAsOff` to show offline devices as "Off" instead of "No Response"
- Check Homebridge logs for connection errors

### Devices Not Discovered

- Ensure your devices are properly added to your eWeLink account
- Restart Homebridge and wait a few minutes for the WebSocket sync to complete

### LAN Control Not Working

- Confirm your devices support LAN/DIY mode
- Check that Homebridge is on the same network (or that your mDNS proxy is enabled)
- Enable `debug: true` and restart — the logs show which devices were found on LAN

### Debug Logging

```json
{
  "debug": true
}
```

Or start Homebridge with `-D` for full framework debug output.

## Development

```bash
# Clone and install
git clone https://github.com/mp-consulting/homebridge-ewelink.git
cd homebridge-ewelink
npm install

# Build
npm run build

# Lint
npm run lint

# Watch mode (build + link + nodemon)
npm run watch
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

## Credits

- Original plugin: [homebridge-ewelink](https://github.com/homebridge-plugins/homebridge-ewelink) by the Homebridge Plugins team
- [Homebridge](https://homebridge.io) creators and contributors

## License

MIT License — see [LICENSE](LICENSE) for details.
