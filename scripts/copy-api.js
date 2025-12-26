import { copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, '..');
const distDir = join(projectRoot, 'dist');
const uiDir = join(projectRoot, 'homebridge-ui');
const uiApiDir = join(uiDir, 'api');

// Create the api directory in homebridge-ui
mkdirSync(uiApiDir, { recursive: true });

// Files to copy
const filesToCopy = [
  'api/ewelink-api.js',
  'api/ewelink-api.d.ts',
  'settings.js',
  'settings.d.ts',
  'types/index.js',
  'types/index.d.ts',
  'utils/token-storage.js',
  'utils/token-storage.d.ts',
  'utils/crypto-utils.js',
  'utils/crypto-utils.d.ts',
  'constants/api-constants.js',
  'constants/api-constants.d.ts',
  'constants/region-constants.js',
  'constants/region-constants.d.ts',
  'constants/device-catalog.js',
  'constants/device-catalog.d.ts',
];

console.log('Copying API files to homebridge-ui...');
for (const file of filesToCopy) {
  const srcPath = join(distDir, file);
  const destPath = join(uiDir, file);

  // Ensure destination directory exists
  mkdirSync(dirname(destPath), { recursive: true });

  try {
    copyFileSync(srcPath, destPath);
    console.log(`✓ Copied ${file}`);
  } catch (error) {
    console.error(`✗ Failed to copy ${file}:`, error.message);
  }
}

console.log('API files copied successfully!');
