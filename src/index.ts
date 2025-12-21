import { API } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { EWeLinkPlatform } from './platform.js';

/**
 * Register the platform with Homebridge
 */
export default (api: API): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, EWeLinkPlatform);
};

export { EWeLinkPlatform } from './platform.js';
export * from './settings.js';
export * from './types/index.js';
