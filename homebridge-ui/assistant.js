import { registerAiRoutes } from '@mp-consulting/homebridge-ai-kit/plugin';

/**
 * eWeLink / Sonoff background the Assistant gets with every request from this
 * plugin's settings UI. Keep it short: it is sent with each prompt.
 */
export const EWELINK_AI_CONTEXT = [
  'The plugin bridges eWeLink (Sonoff and other eWeLink-compatible) devices to HomeKit.',
  'Connection modes ("mode"): "auto" tries LAN first and falls back to the cloud, "lan" is LAN only, "wan" is cloud only.',
  'LAN control needs the device on the same subnet as Homebridge and announced over mDNS (_ewelink._tcp); VLANs,',
  'client isolation or mDNS filtering make devices show "LAN: No IP". Sub-devices (RF remotes, Zigbee) go through',
  'their bridge (RF Bridge UIID 28/98). Cloud mode logs in with the eWeLink account (email or phone number, password,',
  'country code); the country code picks the API region (eu, us, as, cn) and the server redirects to the right one',
  '(error 10004). Common eWeLink errors: 10001/10014 wrong password or account; 401/402 access token expired (the',
  'plugin refreshes it); 406 on the WebSocket means the session was invalidated, usually because the same account',
  'logged in elsewhere with the same app ID - a dedicated eWeLink account shared to the main one avoids it; 500 eWeLink',
  'server error; 503/504 or "offline" means the device did not answer (powered off, weak Wi-Fi, or not connected to the',
  'cloud). Devices are identified by deviceId and UIID (the eWeLink model type). Never ask the user for their password,',
  'tokens or API keys.',
].join(' ');

export const ASSISTANT_PLUGIN_NAME = '@mp-consulting/homebridge-ewelink';

/**
 * Adds the Assistant routes (/ai/status, /ai/explain, /ai/ask, /ai/config) to the
 * plugin UI server. The provider settings come from the shared `HomebridgeAiKit`
 * block in config.json; the key never reaches the browser.
 *
 * `options` is passed through to `registerAiRoutes` (tests inject a provider).
 */
export function registerAssistant(server, options = {}) {
  registerAiRoutes(server, {
    pluginName: ASSISTANT_PLUGIN_NAME,
    systemContext: EWELINK_AI_CONTEXT,
    ...options,
  });
}
