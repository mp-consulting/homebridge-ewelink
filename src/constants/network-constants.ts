/**
 * Network-related constants for LAN and WebSocket communication
 */

/**
 * Network port numbers
 */
export const NETWORK_PORTS = {
  LAN_CONTROL_HTTP: 8081,   // HTTP port for LAN device control
  LAN_UDP_LISTENER: 8082,   // UDP port for mDNS discovery
  WEBSOCKET: 8080,          // WebSocket port
} as const;

/**
 * Network timing intervals (in milliseconds)
 */
export const NETWORK_INTERVALS = {
  MDNS_REQUERY: 60000,         // 60 seconds - mDNS re-query interval
  WEBSOCKET_RECONNECT: 5000,   // 5 seconds - WebSocket reconnection delay
  WEBSOCKET_HEARTBEAT: 90000,  // 90 seconds - WebSocket ping interval
} as const;

/**
 * LAN failover settings - stale LAN entries are skipped so commands go straight to cloud
 */
export const LAN_FAILOVER = {
  MAX_CONSECUTIVE_FAILURES: 3, // Failures in a row before a device is put in cooldown
  COOLDOWN_MS: 60000,          // 60 seconds - LAN is skipped for the device during cooldown
} as const;
