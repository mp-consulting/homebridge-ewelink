/**
 * Region and country code mapping constants
 */

/**
 * Country codes mapped to their respective regions
 * Based on eWeLink API regional assignments
 */
export const REGION_COUNTRY_CODES: Record<string, readonly string[]> = {
  // China region
  cn: ['86', 'cn'],

  // Asia-Pacific region
  as: [
    '81',   // Japan
    '82',   // South Korea
    '852',  // Hong Kong
    '853',  // Macau
    '886',  // Taiwan
    '91',   // India
    '65',   // Singapore
    '60',   // Malaysia
    '66',   // Thailand
    '84',   // Vietnam
    '62',   // Indonesia
    '63',   // Philippines
    '61',   // Australia
    '64',   // New Zealand
    'as',
  ],

  // Europe region (includes Middle East, Africa, and parts of Americas)
  eu: [
    // Western Europe
    '44',   // United Kingdom
    '33',   // France
    '49',   // Germany
    '39',   // Italy
    '34',   // Spain
    '31',   // Netherlands
    '32',   // Belgium
    '41',   // Switzerland
    '43',   // Austria
    '351',  // Portugal
    '353',  // Ireland
    '352',  // Luxembourg
    '356',  // Malta
    '377',  // Monaco
    // Nordic
    '45',   // Denmark
    '46',   // Sweden
    '47',   // Norway
    '358',  // Finland
    '354',  // Iceland
    // Central/Eastern Europe
    '48',   // Poland
    '420',  // Czech Republic
    '421',  // Slovakia
    '36',   // Hungary
    '40',   // Romania
    '359',  // Bulgaria
    '380',  // Ukraine
    '7',    // Russia
    '370',  // Lithuania
    '371',  // Latvia
    '372',  // Estonia
    '375',  // Belarus
    '373',  // Moldova
    '381',  // Serbia
    '385',  // Croatia
    '386',  // Slovenia
    '387',  // Bosnia
    '389',  // North Macedonia
    '355',  // Albania
    '383',  // Kosovo
    '382',  // Montenegro
    // Southern Europe
    '30',   // Greece
    '357',  // Cyprus
    '90',   // Turkey
    // Middle East
    '971',  // UAE
    '966',  // Saudi Arabia
    '972',  // Israel
    '974',  // Qatar
    '965',  // Kuwait
    '968',  // Oman
    '973',  // Bahrain
    '962',  // Jordan
    '961',  // Lebanon
    '963',  // Syria
    '964',  // Iraq
    '967',  // Yemen
    '970',  // Palestine
    '98',   // Iran
    '92',   // Pakistan
    // Central Asia
    '992',  // Tajikistan
    '993',  // Turkmenistan
    '994',  // Azerbaijan
    '995',  // Georgia
    '996',  // Kyrgyzstan
    '998',  // Uzbekistan
    '374',  // Armenia
    '976',  // Mongolia
    '977',  // Nepal
    '975',  // Bhutan
    // Africa
    '27',   // South Africa
    '20',   // Egypt
    '234',  // Nigeria
    '212',  // Morocco
    '213',  // Algeria
    '216',  // Tunisia
    '218',  // Libya
    '249',  // Sudan
    '254',  // Kenya
    '255',  // Tanzania
    '256',  // Uganda
    '233',  // Ghana
    '225',  // Ivory Coast
    '221',  // Senegal
    '237',  // Cameroon
    '251',  // Ethiopia
    '260',  // Zambia
    '263',  // Zimbabwe
    '244',  // Angola
    '258',  // Mozambique
    '261',  // Madagascar
    // Latin America (mapped to EU by eWeLink)
    '51',   // Peru
    '52',   // Mexico
    '53',   // Cuba
    '54',   // Argentina
    '55',   // Brazil
    '56',   // Chile
    '57',   // Colombia
    '58',   // Venezuela
    '591',  // Bolivia
    '593',  // Ecuador
    '595',  // Paraguay
    '598',  // Uruguay
    '506',  // Costa Rica
    '507',  // Panama
    '502',  // Guatemala
    '503',  // El Salvador
    '504',  // Honduras
    '505',  // Nicaragua
    'eu',
  ],

  // US region (default)
  us: [
    '1',    // USA / Canada
  ],
};

/**
 * Get the region from a country code
 * @param code - Country code (e.g., '44', '+86', 'eu')
 * @returns Region identifier ('cn', 'as', 'eu', 'us')
 */
export function getRegionFromCountryCode(code?: string): string {
  if (!code) {
    return 'us';
  }

  const normalizedCode = code.toLowerCase().replace('+', '');

  for (const [region, codes] of Object.entries(REGION_COUNTRY_CODES)) {
    if (codes.includes(normalizedCode)) {
      return region;
    }
  }

  return 'us'; // Default to US region
}
