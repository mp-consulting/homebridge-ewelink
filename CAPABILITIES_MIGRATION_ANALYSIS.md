# Capabilities-Based Device Identification: Migration Analysis

## Executive Summary

The current system routes devices to accessory handlers primarily via **UIID lookup** (a numeric device type ID from eWeLink's cloud API). While the `device-catalog.ts` already contains rich capability metadata per UIID, the routing and accessory logic still depends heavily on UIID-specific checks scattered across ~23 files. Migrating to a **capabilities-based identifier** means making the capabilities the primary driver for handler selection and behavior, rather than the UIID number itself.

This is a significant but highly worthwhile refactor. The catalog already does 80% of the work - the remaining 20% is eliminating direct UIID checks from accessory handlers and the platform router.

---

## Current Architecture: How UIID Flows Through the System

### Step 1: Device arrives from API
```
EWeLinkDevice.extra.uiid → numeric ID (e.g., 1, 126, 135)
```

### Step 2: Platform routes via UIID → Category
```typescript
// settings.ts - pre-computed map
DEVICE_UIID_MAP[uiid] → DeviceCategory enum (e.g., SINGLE_SWITCH, LIGHT)
```

### Step 3: Category → Handler class
```typescript
// platform.ts - createHandler()
CATEGORY_HANDLERS[category] → SwitchAccessory | LightAccessory | ...
```

### Step 4: Handler reads capabilities via UIID
```typescript
// Inside each accessory constructor
const uiid = this.device.extra?.uiid || 0;
const hasFullPower = hasFullPowerReadingsUIID(uiid);  // ← UIID lookup
const posConfig = getPositionParams(uiid);             // ← UIID lookup
```

**The problem**: Steps 2 and 3 are already data-driven (good), but Step 4 has accessories reaching back into the catalog by UIID. If we could pass resolved capabilities to the handler instead, the handler wouldn't need to know its UIID at all.

---

## What Needs to Change

### Layer 1: Define a Resolved Capabilities Object

The catalog already defines `DeviceCapabilities` and `DeviceParamsDef`. These need to be unified into a single **resolved capabilities object** that fully describes what a device can do, independent of UIID:

```typescript
interface ResolvedDeviceCapabilities {
  // Identity (for logging/debugging only, not routing)
  uiid: number;
  name: string;

  // Routing capabilities
  category: DeviceCategoryType;
  channels: number;
  isBridge: boolean;
  isSensor: boolean;

  // Feature capabilities
  switching: {
    style: SwitchParamStyle;    // 'single' | 'multi' | 'state'
    onOffParam: string;
  };

  brightness?: {
    param: string;
    min: number;
    max: number;
    asString?: boolean;
    requiresMode?: boolean;
  };

  colorTemp?: {
    param: string;
    min: number;
    max: number;
    asString?: boolean;
  };

  rgb?: {
    r: string; g: string; b: string;
    br?: string;
  };

  position?: {                  // curtains
    current: string;
    target: string;
    inverted?: boolean;
  };

  motorTurn?: string;

  powerMonitoring: {
    level: PowerMonitoringType; // 'none' | 'basic' | 'full'
    powerParam?: string;
    voltageParam?: string;
    currentParam?: string;
  };

  temperature?: string;        // param name
  humidity?: string;            // param name
  battery?: 'percentage' | 'voltage';

  fanSpeed?: {
    param: string;
    min: number;
    max: number;
  };

  sensorType?: 'motion' | 'contact' | 'leak' | 'smoke' | 'occupancy';
  programmableSwitch: boolean;
  supportsInching: boolean;
  supportsLAN: boolean;
  supportedSimulations: string[];

  // Special device flags (replaces isDualR3, isTHSensor, etc.)
  isDualR3: boolean;
  isTHSensor: boolean;
  isPanel: boolean;
  isPanelPro: boolean;
}
```

### Layer 2: Resolve Capabilities at Device Discovery Time

In `platform.ts`, resolve capabilities **once** when a device is first seen:

```typescript
// New function in device-catalog.ts
function resolveCapabilities(uiid: number, params?: DeviceParams): ResolvedDeviceCapabilities

// In platform.ts addAccessory():
const capabilities = resolveCapabilities(uiid, device.params);
accessory.context.capabilities = capabilities;
```

This replaces the current pattern where each accessory calls `getPositionParams(uiid)`, `hasFullPowerReadings(uiid)`, etc. in its constructor.

### Layer 3: Pass Capabilities to Handlers

Instead of:
```typescript
// Current: accessory reaches into catalog by UIID
constructor(platform, accessory) {
  const uiid = this.device.extra?.uiid || 0;
  this.hasFullPowerReadings = hasFullPowerReadingsUIID(uiid);
}
```

Do:
```typescript
// New: accessory reads pre-resolved capabilities
constructor(platform, accessory) {
  const caps = this.accessory.context.capabilities;
  this.hasFullPowerReadings = caps.powerMonitoring.level === 'full';
}
```

### Layer 4: Capabilities-Based Routing

Replace the current category-then-UIID routing with pure capability routing:

```typescript
// Current (platform.ts createHandler):
if (isTHSensorDevice(uiid)) { ... }        // UIID check
if (isDimmableLightForFan(uiid)) { ... }    // UIID check
if (isProgrammableSwitch(uiid)) { ... }     // UIID check

// New:
if (caps.isTHSensor) { ... }                // capability check
if (caps.brightness && showAs === 'fan') { ... }  // capability check
if (caps.programmableSwitch) { ... }         // capability check
```

---

## Files That Need Changes

### High Impact (core routing changes)

| File | Changes | Effort |
|------|---------|--------|
| `src/constants/device-catalog.ts` | Add `resolveCapabilities()` function, keep catalog as-is | Medium |
| `src/platform.ts` | Resolve capabilities in `addAccessory()`, pass to handlers, update routing in `createHandler()` | Medium |
| `src/settings.ts` | May simplify `DEVICE_UIID_MAP` to use capabilities | Low |
| `src/types/index.ts` | Add `ResolvedDeviceCapabilities` to `AccessoryContext` | Low |

### Medium Impact (accessory handler updates)

| File | Current UIID Usage | Migration |
|------|-------------------|-----------|
| `accessories/outlet.ts` | `hasFullPowerReadingsUIID(uiid)` | Read from `caps.powerMonitoring.level` |
| `accessories/curtain.ts` | `getPositionParams(uiid)`, `getMotorTurnParam(uiid)` | Read from `caps.position`, `caps.motorTurn` |
| `accessories/sensor.ts` | `isMotionSensorUIID(uiid)`, `isContactSensorUIID(uiid)` | Read from `caps.sensorType` |
| `accessories/panel.ts` | `isNSPanelPro(uiid)` | Read from `caps.isPanelPro` |
| `accessories/light.ts` | Reads params directly (already capability-like) | Minor cleanup |

### Lower Impact (simulation handlers)

| File | Current UIID Usage | Migration |
|------|-------------------|-----------|
| `simulations/light-fan.ts` | `getBrightnessParams(uiid)`, `normalizeBrightness(uiid)` | Read from `caps.brightness` |
| `simulations/sensor.ts` | `hasPowerMonitoring(uiid)`, `isDualR3Device(uiid)` | Read from `caps.powerMonitoring`, `caps.isDualR3` |
| `simulations/p-button.ts` | Same as sensor.ts | Same |
| `simulations/valve.ts` | `hasPowerMonitoring(uiid)`, `hasFullPowerReadings(uiid)` | Same |
| `simulations/purifier.ts` | Same pattern | Same |
| `simulations/tv.ts` | Same pattern | Same |
| `simulations/blind.ts` | `isDualR3Device(uiid)` | `caps.isDualR3` |
| `simulations/door.ts` | `isDualR3Device(uiid)` | `caps.isDualR3` |
| `simulations/window.ts` | `isDualR3Device(uiid)` | `caps.isDualR3` |
| `simulations/doorbell.ts` | `isDualR3Device(uiid)` | `caps.isDualR3` |
| `simulations/sensor-leak.ts` | `getBatteryType(uiid)` | `caps.battery` |

---

## UIID References That Can Be Eliminated

After migration, the following catalog helper functions become **internal only** (used by `resolveCapabilities()` but not exported to accessories):

- `hasPowerMonitoring(uiid)` → `caps.powerMonitoring.level !== 'none'`
- `hasFullPowerReadings(uiid)` → `caps.powerMonitoring.level === 'full'`
- `isDualR3Device(uiid)` → `caps.isDualR3`
- `isTHSensorDevice(uiid)` → `caps.isTHSensor`
- `isDimmableLightForFan(uiid)` → `caps.brightness !== undefined`
- `isProgrammableSwitch(uiid)` → `caps.programmableSwitch`
- `getChannelCount(uiid)` → `caps.channels`
- `getLightType(uiid)` → derived from `caps.rgb`, `caps.colorTemp`, `caps.brightness`
- `getBrightnessParams(uiid)` → `caps.brightness`
- `getPositionParams(uiid)` → `caps.position`
- `getMotorTurnParam(uiid)` → `caps.motorTurn`
- `getSwitchStyle(uiid)` → `caps.switching.style`
- `getBatteryType(uiid)` → `caps.battery`
- `normalizeBrightness(uiid, value)` → `normalizeBrightness(caps.brightness, value)` (takes config, not UIID)
- `denormalizeBrightness(uiid, value)` → `denormalizeBrightness(caps.brightness, value)`
- `isMotionSensor(uiid)` → `caps.sensorType === 'motion'`
- `isContactSensor(uiid)` → `caps.sensorType === 'contact'`
- `isNSPanelPro(uiid)` → `caps.isPanelPro`
- `hasCurtainParams(params)` → stays as-is (runtime param check for UIID 126)

---

## Special Cases That Need Careful Handling

### 1. UIID 126 (DualR3) - Dynamic Category Based on Params

This device changes category at runtime based on whether `currLocation`/`setclose`/`location` params exist. The capability resolver must handle this:

```typescript
function resolveCapabilities(uiid: number, params?: DeviceParams): ResolvedDeviceCapabilities {
  const entry = DEVICE_CATALOG[uiid];
  // ...resolve from catalog...

  // Special: UIID 126 can be curtain if params indicate it
  if (uiid === 126 && hasCurtainParams(params)) {
    resolved.category = 'curtain';
    resolved.position = { current: 'currLocation', target: 'location', inverted: false };
  }

  return resolved;
}
```

This is the **one place** where UIID-specific logic is genuinely needed at resolution time. After resolution, the handler only sees `caps.category === 'curtain'` and `caps.position`.

### 2. UIID 77/78 - Single Switch Using Multi-Channel Data Structure

These devices have `channels: 1` but `switchStyle: 'multi'`. The catalog already encodes this correctly. The capability resolver just passes it through.

### 3. TH Sensor Simulations (UIID 15/181)

These use `showAs` config to transform into heater/cooler/humidifier/etc. The `isTHSensor` capability flag handles routing. The simulation handlers don't need UIID - they just need to know the device has temperature/humidity params.

### 4. Programmable Switches (SwitchMan R5, Switch Mate)

Currently routed by `isProgrammableSwitch(uiid)` then `getChannelCount(uiid)`. Becomes `caps.programmableSwitch && caps.channels > 1`.

### 5. DualR3 Special Behavior in Simulations

Multiple simulation accessories check `isDualR3Device(uiid)` to decide:
- Whether to add power monitoring
- Whether to use different LAN query params
- Whether to show power readings

This becomes `caps.isDualR3`. Long-term, the DualR3 differences could be further decomposed into finer capabilities (e.g., `caps.lanQueryStyle`, `caps.powerQueryParams`), but `isDualR3` is a pragmatic first step.

---

## Migration Strategy

### Phase 1: Add Capabilities Layer (Non-Breaking)
1. Define `ResolvedDeviceCapabilities` interface in `types/index.ts`
2. Add `resolveCapabilities()` to `device-catalog.ts`
3. Add `capabilities` to `AccessoryContext`
4. In `platform.ts`, resolve and store capabilities in context
5. **All existing code continues to work unchanged**

### Phase 2: Migrate Accessories One-by-One
For each accessory file:
1. Read capabilities from `this.accessory.context.capabilities` instead of calling UIID helper functions
2. Remove UIID-specific imports
3. Build and verify (no test suite, so manual testing per device type)

Recommended order (least risk first):
1. `outlet.ts` - simple, just power monitoring check
2. `sensor.ts` - motion/contact type check
3. `panel.ts` - NSPanel Pro check
4. `curtain.ts` - position params
5. `simulations/blind.ts`, `door.ts`, `window.ts` - isDualR3 only
6. `simulations/doorbell.ts` - isDualR3 only
7. `simulations/valve.ts` - power monitoring
8. `simulations/sensor.ts` - power monitoring + isDualR3
9. `simulations/p-button.ts` - power monitoring + isDualR3
10. `simulations/purifier.ts` - power monitoring + isDualR3
11. `simulations/tv.ts` - power monitoring + isDualR3
12. `simulations/light-fan.ts` - brightness params + normalization
13. `simulations/sensor-leak.ts` - battery type

### Phase 3: Migrate Platform Routing
1. Update `createHandler()` to use capabilities instead of UIID helpers
2. Update `addAccessory()` to use `capabilities.category` instead of `DEVICE_UIID_MAP`
3. Remove `DEVICE_UIID_MAP` export from `settings.ts`

### Phase 4: Cleanup
1. Mark UIID helper functions as `@internal` or make them private
2. Remove unused imports across all files
3. Update `normalizeBrightness`/`denormalizeBrightness` signatures to take config, not UIID

---

## Long-Term Benefits

### 1. Adding New Devices Becomes Trivial
Currently: Add UIID to catalog + possibly update helper functions + add to UIID arrays.
After: Add UIID to catalog. The capabilities resolver handles everything automatically.

### 2. Unknown Devices Can Self-Describe
If the eWeLink API starts returning capability metadata (which some newer devices do), the resolver could fall back to **runtime param inspection** for unknown UIIDs:

```typescript
if (!entry) {
  // Unknown UIID - try to detect capabilities from params
  return inferCapabilitiesFromParams(uiid, params);
}
```

This means new devices could partially work **without any code changes**.

### 3. Easier Testing
Capabilities objects are plain data - easy to construct in tests without needing real UIID catalog entries.

### 4. Reduced Cognitive Load
Developers don't need to know that "UIID 126 is a DualR3" - they just check `caps.isDualR3` or `caps.position`.

### 5. Simulation Handlers Become Truly Generic
Right now, `blind.ts` checks `isDualR3Device(uiid)` for power monitoring. With capabilities, it checks `caps.powerMonitoring.level !== 'none'`. This means the same simulation handler works correctly for **any** device that has power monitoring, not just DualR3.

---

## Estimated Scope

| Phase | Files Changed | Risk Level |
|-------|--------------|------------|
| Phase 1: Add capabilities layer | 3-4 files | Very Low (additive) |
| Phase 2: Migrate accessories | ~15 files | Low (one-at-a-time) |
| Phase 3: Migrate platform routing | 2-3 files | Medium |
| Phase 4: Cleanup | 2-3 files | Low |
| **Total** | **~20 files** | **Low-Medium** |

The migration is safe because:
- Phase 1 is purely additive (no existing behavior changes)
- Phase 2 is file-by-file with easy rollback
- The catalog itself doesn't change - only how its data is consumed
- No test suite means testing is manual, but each phase can be verified independently via `npm run build` + `npm run lint`

---

## Conclusion

The codebase is **well-positioned** for this migration. The `device-catalog.ts` already contains all the capability data needed - it just needs a resolution layer that transforms catalog entries into a flat capabilities object passed to handlers. The main work is mechanical: replacing ~50 UIID-specific function calls across ~15 accessor files with reads from a capabilities object on the accessory context.

The highest-value change is **Phase 1** (add the resolution layer) because it unblocks everything else and is zero-risk. Phases 2-4 can be done incrementally over time.
