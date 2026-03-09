/**
 * Detect eWeLink API changes
 *
 * Authenticates with the eWeLink cloud API and probes the key endpoints.
 * On the first run, saves a schema snapshot to scripts/api-snapshot.json.
 * On subsequent runs, compares the live schema against the snapshot and
 * reports added fields, removed fields, and type changes.
 *
 * Usage:
 *   npx tsx scripts/detect-api-changes.ts          # compare against snapshot
 *   npx tsx scripts/detect-api-changes.ts --save   # save new snapshot
 *   npx tsx scripts/detect-api-changes.ts --dump   # save pretty payloads to tmp/api-payloads.json
 *
 * Credentials are read from test/hbConfig/config.json (eWeLink platform entry).
 */

import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const APP_ID = 'Uw83EKZFxdif7XFXEsrpduz5YyjP7nTl';
const APP_SECRET = 'mXLOjea0woSMvK9gw7Fjsy7YlFO4iSu6';

const REGION_HOSTS: Record<string, string> = {
  eu: 'eu-apia.coolkit.cc',
  us: 'us-apia.coolkit.cc',
  as: 'as-apia.coolkit.cc',
  cn: 'cn-apia.coolkit.cn',
};

const COUNTRY_TO_REGION: Record<string, string> = {
  '+1': 'us', '+44': 'eu', '+33': 'eu', '+49': 'eu', '+34': 'eu',
  '+39': 'eu', '+31': 'eu', '+32': 'eu', '+46': 'eu', '+47': 'eu',
  '+45': 'eu', '+358': 'eu', '+48': 'eu', '+351': 'eu', '+41': 'eu',
  '+43': 'eu', '+353': 'eu', '+420': 'eu', '+61': 'as', '+81': 'as',
  '+82': 'as', '+65': 'as', '+60': 'as', '+66': 'as', '+886': 'as',
  '+852': 'as', '+64': 'as', '+91': 'as', '+86': 'cn',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Credentials {
  username: string;
  password: string;
  countryCode: string;
}

type Schema = Record<string, string>;

interface Snapshot {
  createdAt: string;
  region: string;
  endpoints: Record<string, Schema>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nonce(): string {
  return randomBytes(4).toString('hex');
}

function sign(data: string): string {
  return createHmac('sha256', APP_SECRET).update(data).digest('base64');
}

function loadCredentials(): Credentials {
  const configPath = join(process.cwd(), 'test', 'hbConfig', 'config.json');
  if (!existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`);
    console.error('Create test/hbConfig/config.json with your eWeLink credentials.');
    process.exit(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = JSON.parse(readFileSync(configPath, 'utf8')) as { platforms: any[] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platform = raw.platforms?.find((p: any) => p.platform === 'eWeLink');

  if (!platform?.username || !platform?.password) {
    console.error('No eWeLink platform with username/password found in config.json');
    process.exit(1);
  }

  return {
    username: platform.username as string,
    password: platform.password as string,
    countryCode: (platform.countryCode as string) || '+1',
  };
}

/**
 * Flatten a JSON value into dot-notation field paths with their types.
 * Arrays are represented by [] in the path (only first element is inspected).
 */
function extractSchema(value: unknown, prefix = ''): Schema {
  const schema: Schema = {};

  if (value === null) {
    schema[prefix || '(root)'] = 'null';
  } else if (Array.isArray(value)) {
    schema[prefix || '(root)'] = 'array';
    if (value.length > 0) {
      Object.assign(schema, extractSchema(value[0], prefix ? `${prefix}[]` : '[]'));
    }
  } else if (typeof value === 'object') {
    if (prefix) {
      schema[prefix] = 'object';
    }
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      Object.assign(schema, extractSchema(val, prefix ? `${prefix}.${key}` : key));
    }
  } else {
    schema[prefix || '(root)'] = typeof value;
  }

  return schema;
}

function diffSchemas(label: string, saved: Schema, current: Schema): number {
  const added = Object.keys(current).filter(k => !(k in saved));
  const removed = Object.keys(saved).filter(k => !(k in current));
  const changed = Object.keys(current).filter(k => k in saved && saved[k] !== current[k]);

  const total = added.length + removed.length + changed.length;
  if (total === 0) {
    console.log(`  ${label}: no changes`);
    return 0;
  }

  console.log(`\n  ${label}:`);
  for (const k of added) {
    console.log(`    + ${k} (${current[k]})`);
  }
  for (const k of removed) {
    console.log(`    - ${k} (${saved[k]})`);
  }
  for (const k of changed) {
    console.log(`    ~ ${k}: ${saved[k]} -> ${current[k]}`);
  }
  return total;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function apiPost(host: string, path: string, body: unknown, token?: string, extraHeaders?: Record<string, string>): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-CK-Appid': APP_ID,
    ...extraHeaders,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _status: res.status, _body: text };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function apiGet(host: string, path: string, token: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`https://${host}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      'Content-Type': 'application/json',
      'X-CK-Appid': APP_ID,
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _status: res.status, _body: text };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const saveMode = process.argv.includes('--save');
  const dumpMode = process.argv.includes('--dump');
  const snapshotPath = join(process.cwd(), 'scripts', 'api-snapshot.json');

  const creds = loadCredentials();
  const region = COUNTRY_TO_REGION[creds.countryCode] ?? 'eu';
  let host = REGION_HOSTS[region];

  console.log(`Region: ${region} (${host})`);
  console.log(`User:   ${creds.username.slice(0, 3)}***\n`);

  // -------------------------------------------------------------------------
  // 1. Login
  // -------------------------------------------------------------------------

  const isEmail = creds.username.includes('@');
  const loginPayload: Record<string, string> = {
    countryCode: creds.countryCode,
    password: creds.password,
    ...(isEmail ? { email: creds.username } : { phoneNumber: creds.username }),
  };
  const makeLoginHeaders = (payload: Record<string, string>) => ({
    'X-CK-Nonce': nonce(),
    'Authorization': `Sign ${sign(JSON.stringify(payload))}`,
  });

  console.log('POST /v2/user/login ...');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let loginResp: any = await apiPost(host, '/v2/user/login', loginPayload, undefined, makeLoginHeaders(loginPayload));

  // Handle region redirect
  if (loginResp.error === 10004 && loginResp.data?.region) {
    const newRegion = loginResp.data.region as string;
    host = REGION_HOSTS[newRegion] ?? `${newRegion}-apia.coolkit.cc`;
    console.log(`  Region redirect -> ${host}`);
    loginResp = await apiPost(host, '/v2/user/login', loginPayload, undefined, makeLoginHeaders(loginPayload));
  }

  if (!loginResp?.data?.at) {
    console.error(`Login failed: ${loginResp?.msg ?? JSON.stringify(loginResp)}`);
    process.exit(1);
  }

  const token = loginResp.data.at as string;
  console.log('  OK\n');

  // -------------------------------------------------------------------------
  // 2. Probe endpoints
  // -------------------------------------------------------------------------

  const endpoints: Record<string, Schema> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payloads: Record<string, any> = {};

  // Login response schema
  endpoints['POST /v2/user/login'] = extractSchema(loginResp);
  payloads['POST /v2/user/login'] = loginResp;

  // Family list
  console.log('GET /v2/family ...');
  const familyResp = await apiGet(host, '/v2/family', token);
  endpoints['GET /v2/family'] = extractSchema(familyResp);
  payloads['GET /v2/family'] = familyResp;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const families: { id: string; name: string }[] = (familyResp?.data?.familyList as any[]) ?? [];
  console.log(`  OK (${families.length} home(s))\n`);

  // Device list (first family)
  if (families.length > 0) {
    const familyId = families[0].id;
    console.log(`GET /v2/device/thing (family: ${families[0].name}) ...`);
    const thingResp = await apiGet(host, '/v2/device/thing', token, { num: '0', familyid: familyId });
    endpoints['GET /v2/device/thing'] = extractSchema(thingResp);
    payloads['GET /v2/device/thing'] = thingResp;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const things: any[] = (thingResp?.data?.thingList as any[]) ?? [];
    console.log(`  OK (${things.length} item(s))\n`);
  }

  // Dispatch (WebSocket host)
  console.log('POST /dispatch/app ...');
  const dispatchResp = await apiPost(host, '/dispatch/app', {
    appid: APP_ID,
    nonce: nonce(),
    ts: Math.floor(Date.now() / 1000),
    version: 8,
  }, token);
  endpoints['POST /dispatch/app'] = extractSchema(dispatchResp);
  payloads['POST /dispatch/app'] = dispatchResp;
  console.log(`  ${dispatchResp?.domain ? 'OK (ws: ' + dispatchResp.domain + ')' : 'Failed (no domain)'}\n`);

  // -------------------------------------------------------------------------
  // 3. Dump payloads
  // -------------------------------------------------------------------------

  if (dumpMode) {
    const tmpDir = join(process.cwd(), 'tmp');
    mkdirSync(tmpDir, { recursive: true });
    const dumpPath = join(tmpDir, 'api-payloads.json');
    writeFileSync(dumpPath, JSON.stringify(payloads, null, 2));
    console.log(`Payloads saved to ${dumpPath}\n`);
  }

  // -------------------------------------------------------------------------
  // 4. Save or compare
  // -------------------------------------------------------------------------

  if (saveMode || !existsSync(snapshotPath)) {
    const snapshot: Snapshot = {
      createdAt: new Date().toISOString(),
      region,
      endpoints,
    };
    writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    console.log('Snapshot saved to scripts/api-snapshot.json');
    return;
  }

  // Compare
  const saved = JSON.parse(readFileSync(snapshotPath, 'utf8')) as Snapshot;
  console.log(`Comparing against snapshot from ${saved.createdAt}\n`);

  let totalChanges = 0;

  for (const label of Object.keys(endpoints)) {
    if (!saved.endpoints[label]) {
      console.log(`  ${label}: NEW endpoint (not in snapshot)`);
      totalChanges++;
    } else {
      totalChanges += diffSchemas(label, saved.endpoints[label], endpoints[label]);
    }
  }

  for (const label of Object.keys(saved.endpoints)) {
    if (!endpoints[label]) {
      console.log(`  ${label}: REMOVED from current probe`);
      totalChanges++;
    }
  }

  console.log(`\n${totalChanges === 0 ? 'No API changes detected.' : `${totalChanges} change(s) detected.`}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
