# API Layer

This directory contains the eWeLink API clients for communicating with devices via cloud, WebSocket, and LAN protocols.

## Files

| File | Description |
|------|-------------|
| `ewelink-api.ts` | Main cloud API client for authentication and device management |
| `ws-client.ts` | WebSocket client for real-time device updates and control |
| `lan-control.ts` | Local network control via mDNS/DNS-SD discovery |

## EWeLinkAPI (Cloud API)

Handles authentication and REST API communication with eWeLink cloud servers.

### Key Methods

| Method | Description |
|--------|-------------|
| `login(email, password, region)` | Authenticate and get tokens |
| `refreshToken()` | Refresh expired access token |
| `getDevices()` | Fetch all devices for the account |
| `getDevice(deviceId)` | Fetch a single device |
| `updateDevice(deviceId, params)` | Update device state |

### Authentication Flow

1. Login with email/password using HMAC-SHA256 signed request
2. Receive access token and refresh token
3. Store tokens for subsequent requests
4. Auto-refresh when token expires

### Regions

| Region | Server |
|--------|--------|
| `cn` | China |
| `as` | Asia |
| `us` | Americas |
| `eu` | Europe |

## WSClient (WebSocket)

Maintains persistent WebSocket connection for real-time updates.

### Message Types

| Action | Direction | Description |
|--------|-----------|-------------|
| `userOnline` | → Server | Authentication handshake |
| `update` | → Server | Send device commands |
| `update` | ← Server | Receive device state changes |
| `query` | → Server | Request fresh device state |
| `ping` | → Server | Heartbeat (every 90 seconds) |

### Connection Flow

```
┌─────────┐                    ┌─────────┐
│ Client  │                    │ Server  │
└────┬────┘                    └────┬────┘
     │                              │
     │──── Connect WebSocket ──────>│
     │                              │
     │──── userOnline (auth) ──────>│
     │<─── userOnline (ack) ────────│
     │                              │
     │──── update (command) ───────>│
     │<─── update (state) ──────────│
     │                              │
     │──── ping ───────────────────>│
     │<─── pong ────────────────────│
     │                              │
```

### Query Pattern

Used by curtain accessories to request fresh device state:

```typescript
await wsClient.query(deviceId, apiKey);
// Response triggers handleDeviceUpdate() callback
```

## LANControl (Local Control)

Discovers and controls devices on the local network using mDNS/DNS-SD.

### Discovery

- Uses Bonjour/mDNS to find `_ewelink._tcp` services
- Extracts device info from TXT records
- Maintains IP address cache for discovered devices

### Local Commands

- Sends HTTP POST to device's local IP
- Commands are encrypted using device's API key
- Falls back to cloud if LAN control fails

### Supported Devices

Not all devices support LAN control. Generally:
- Basic switches (UIID 1, 6, 14)
- Dimmers (UIID 36, 44, 57)
- Multi-channel switches

### Configuration

Enable/disable via config:

```json
{
  "mode": "lan"  // "lan" | "wan" | "auto"
}
```

## Error Handling

All API methods handle common errors:
- Network timeouts
- Authentication failures
- Rate limiting
- Device offline status

Errors are logged and propagated to accessories for appropriate HomeKit status codes.
