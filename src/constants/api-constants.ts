/**
 * API-related constants for eWeLink cloud communication
 */

/**
 * Timeout values for various API operations (in milliseconds)
 */
export const API_TIMEOUTS = {
  HTTP_REQUEST: 30000,      // 30 seconds for HTTP API calls
  WEBSOCKET_AUTH: 10000,    // 10 seconds for WebSocket authentication
  WEBSOCKET_COMMAND: 20000, // 20 seconds for WebSocket commands (increased for network latency)
  HTTP_REQUEST_LAN: 5000,   // 5 seconds for LAN control requests
} as const;

/**
 * Retry configuration for query operations
 */
export const QUERY_RETRY = {
  MAX_ATTEMPTS: 3,          // Maximum number of retry attempts
  DELAY_MS: 2000,           // Delay between retries in milliseconds
} as const;

/**
 * API region to HTTP host mapping
 */
export const REGION_HOSTS: Record<string, string> = {
  eu: 'eu-apia.coolkit.cc',
  us: 'us-apia.coolkit.cc',
  as: 'as-apia.coolkit.cc',
  cn: 'cn-apia.coolkit.cn',
} as const;

/**
 * HTTP host to WebSocket host mapping
 */
export const WEBSOCKET_HOST_MAPPING: Record<string, string> = {
  'eu-apia': 'eu-pconnect3.coolkit.cc:8080',
  'us-apia': 'us-pconnect3.coolkit.cc:8080',
  'as-apia': 'as-pconnect3.coolkit.cc:8080',
  'cn-apia': 'cn-pconnect3.coolkit.cn:8080',
} as const;

/**
 * WebSocket fallback hosts by region
 */
export const WEBSOCKET_FALLBACK_HOSTS: Record<string, string[]> = {
  eu: [
    'eu-pconnect1.coolkit.cc:8080',
    'eu-pconnect2.coolkit.cc:8080',
    'eu-pconnect3.coolkit.cc:8080',
    'eu-pconnect4.coolkit.cc:8080',
    'eu-pconnect5.coolkit.cc:8080',
  ],
  us: [
    'us-pconnect1.coolkit.cc:8080',
    'us-pconnect2.coolkit.cc:8080',
    'us-pconnect3.coolkit.cc:8080',
    'us-pconnect4.coolkit.cc:8080',
    'us-pconnect5.coolkit.cc:8080',
  ],
  as: [
    'as-pconnect1.coolkit.cc:8080',
    'as-pconnect2.coolkit.cc:8080',
    'as-pconnect3.coolkit.cc:8080',
    'as-pconnect4.coolkit.cc:8080',
    'as-pconnect5.coolkit.cc:8080',
  ],
  cn: [
    'cn-pconnect1.coolkit.cn:8080',
    'cn-pconnect2.coolkit.cn:8080',
    'cn-pconnect3.coolkit.cn:8080',
    'cn-pconnect4.coolkit.cn:8080',
    'cn-pconnect5.coolkit.cn:8080',
  ],
} as const;
