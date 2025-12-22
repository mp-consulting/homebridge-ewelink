/**
 * Error handling utilities
 * Provides consistent error message extraction and formatting
 */

/**
 * Extract error message from unknown error type
 * Handles Error instances, strings, and other types safely
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Extract error code from error if available
 */
export function getErrorCode(error: unknown): number | string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    return error.code as number | string;
  }
  return undefined;
}
