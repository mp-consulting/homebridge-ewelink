/**
 * Timing constants for accessories
 * Centralized timeout and interval values to avoid magic numbers
 */

/**
 * Debounce and state reset delays
 */
export const TIMING = {
  /** Delay before resetting inching mode state (switches, outlets) - 1.5 seconds */
  INCHING_DEBOUNCE_MS: 1500,

  /** Delay before state update after failed command - 2 seconds */
  FAILED_COMMAND_RESET_MS: 2000,

  /** Momentary button press duration - 1 second */
  BUTTON_PRESS_MS: 1000,

  /** RF button press simulation duration - 2 seconds */
  RF_BUTTON_PRESS_MS: 2000,

  /** RF button trigger duration (external trigger) - 3 seconds */
  RF_BUTTON_TRIGGER_MS: 3000,

  /** Garage door operation timeout - 10 seconds */
  GARAGE_OPERATION_MS: 10000,

  /** Brief delay for state initialization - 500ms */
  STATE_INIT_DELAY_MS: 500,

  /** Brief delay between commands - 450ms */
  COMMAND_DELAY_MS: 450,

  /** Curtain state query delay after init - 5 seconds */
  CURTAIN_QUERY_DELAY_MS: 5000,
} as const;

/**
 * Polling intervals
 */
export const POLLING = {
  /** Power/state update polling interval - 2 minutes */
  UPDATE_INTERVAL_MS: 120000,

  /** Initial poll delay - 5 seconds */
  INITIAL_DELAY_MS: 5000,

  /** uiActive request duration - 2 minutes */
  UI_ACTIVE_DURATION_S: 120,

  /** Valve default set duration - 2 minutes */
  VALVE_DEFAULT_DURATION_S: 120,

  /** Event debounce for programmable switches - 1 second */
  EVENT_DEBOUNCE_MS: 1000,

  /** Event freshness validation - 5 seconds */
  EVENT_FRESHNESS_S: 5,
} as const;

/**
 * Simulation accessory timing
 */
export const SIMULATION_TIMING = {
  /** Auto-off delay for thermostat/climate simulations - 5 seconds */
  AUTO_OFF_DELAY_MS: 5000,

  /** Doorbell ring duration - 5 seconds */
  DOORBELL_RING_MS: 5000,

  /** Position-based accessory cleanup delay - 2 seconds */
  POSITION_CLEANUP_MS: 2000,

  /** TV/Purifier auto-off delay - 5 seconds */
  DEVICE_AUTO_OFF_MS: 5000,

  /** Default operation time for blinds/doors/windows - 120 seconds */
  DEFAULT_OPERATION_TIME_S: 120,

  /** Color wheel debounce delay for diffuser - 400ms */
  COLOR_DEBOUNCE_MS: 400,
} as const;

/**
 * Sensor timing constants
 */
export const SENSOR_TIMING = {
  /** Maximum time difference for sensor activation validation - 60 seconds */
  MAX_TIME_DIFF_S: 60,
} as const;

/**
 * Temperature precision constants
 */
export const TEMPERATURE = {
  /** Decimal places for temperature rounding */
  DECIMAL_PLACES: 1,
  /** Multiplier for rounding (10^DECIMAL_PLACES) */
  ROUND_FACTOR: 10,
} as const;
