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
