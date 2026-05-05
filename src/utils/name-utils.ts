/**
 * HomeKit Name / ConfiguredName sanitization
 *
 * HAP-NodeJS validates Name and ConfiguredName values against:
 *   /^[\p{L}\p{N}][\p{L}\p{N}’ '.,-]*[\p{L}\p{N}’]$/u
 *
 * Allowed: Unicode letters, Unicode numbers, U+2019 (’), space, apostrophe,
 * period, comma, hyphen. Must start with a letter/number and end with a
 * letter/number/U+2019. Anything else (e.g. '/', ':', '_', emojis) trips the
 * Home App and may cause an accessory to appear unresponsive.
 */

const ALLOWED_BODY = /[^\p{L}\p{N}’ '.,-]/gu;
const LEADING_INVALID = /^[^\p{L}\p{N}]+/u;
const TRAILING_INVALID = /[^\p{L}\p{N}’]+$/u;

export function sanitizeHomeKitName(name: string | undefined | null, fallback = 'Unnamed'): string {
  if (typeof name !== 'string' || name.length === 0) {
    return fallback;
  }

  let result = name.replace(ALLOWED_BODY, ' ');
  result = result.replace(/\s+/g, ' ');
  result = result.replace(LEADING_INVALID, '');
  result = result.replace(TRAILING_INVALID, '');

  return result.length > 0 ? result : fallback;
}
