# ADS-B Data Flow Refactoring Proposal

## Overview

Refactor ADS-B aircraft position data flow from **frontend polling** to **backend-managed WebSocket push**, aligning with the existing Socket.IO architecture and eliminating the janky URL-passing pattern.

---

## Current Architecture (Legacy)

### Data Flow

1. **Backend** (Python):
   - Reads `ADSB_URL` from environment variable (default: `http://tar1090/data/aircraft.json`)
   - Sends ADS-B config to frontend via `features_enabled` Socket.IO event:
     - `adsb.enabled`, `adsb.lat`, `adsb.lon`, `adsb.url`, `adsb.bypass`
   - Does NOT fetch or process aircraft data itself

2. **Frontend** (TypeScript):
   - Receives `adsb.url` from backend
   - Sets up 5-second `setInterval()` to poll `aircraft.json` via `fetch()`
   - Handles CORS mode if `adsb.bypass` is true
   - Processes raw aircraft.json response
   - Updates map with new aircraft positions

### Problems

- **Mixed responsibilities**: Frontend fetches external data
- **Unnecessary coupling**: Frontend needs to know external URLs
- **CORS complexity**: Frontend must handle cross-origin requests
- **Duplicate polling**: Each connected client polls independently
- **No data optimization**: Full aircraft.json payload sent to every client
- **Inconsistent pattern**: All other real-time data uses Socket.IO, but not ADS-B
- **Error handling**: Frontend manages fetch failures, retries, timeouts
- **Configuration leak**: External URLs exposed to frontend

---

## Proposed Architecture

### Data Flow: New

1. **Backend** (Python):
   - Reads `ADSB_URL` from environment variable (no change)
   - **NEW**: Starts background task to poll `aircraft.json` every 10 seconds
   - **NEW**: Processes and optimizes aircraft data (field pruning, compression)
   - **NEW**: Emits `adsb_aircraft` Socket.IO event to all connected clients
   - Sends simplified config via `features_enabled` event (no URL, no bypass flag)

2. **Frontend** (React):
   - Receives `adsb.enabled`, `adsb.lat`, `adsb.lon` from `features_enabled` event
   - Listens for `adsb_aircraft` Socket.IO event
   - Updates map state with received aircraft data
   - No polling, no fetch, no CORS handling

### Benefits

✅ **Clean separation of concerns**: Backend owns data fetching
✅ **Single source of truth**: Backend polls once, broadcasts to N clients
✅ **Optimized bandwidth**: Backend can prune unused fields, compress data
✅ **Consistent architecture**: All real-time data via Socket.IO
✅ **Simpler frontend**: No polling logic, no error handling for external APIs
✅ **Better error handling**: Backend can retry, log, alert on failures
✅ **Security**: External URLs never exposed to frontend
✅ **Scalability**: Backend can cache, rate-limit, aggregate data

---

## Field Usage Analysis

### Fields Actually Used by Frontend

Based on audit of `acarshub-typescript/src/pages/live_map.ts`:

**Core Position & Identification**:

- `hex` - Aircraft ICAO hex code (required, used for unique ID)
- `flight` - Callsign (required for display)
- `lat`, `lon` - Position coordinates (required for map marker)
- `track` - Heading for aircraft icon rotation (required)
- `alt_baro` - Altitude for display and icon sizing (required)

**Display & Datablocks**:

- `gs` - Ground speed (datablock display)
- `squawk` - Transponder code (datablock, color logic)
- `baro_rate` - Climb/descent rate (datablock)
- `category` - Aircraft category for icon shape selection
- `t` - Registration/tail number (display)
- `type` - Aircraft type (display)

**Metadata**:

- `seen` - Seconds since last update (for expiring stale aircraft)

### Fields NOT Used

The following fields are in `adsb_plane` interface but **never accessed** in legacy code:

- `alt_geom`, `ias`, `tas`, `mach` - Alternate speed/altitude measurements
- `track_rate`, `roll`, `mag_heading`, `true_heading`, `geom_rate` - Additional orientation
- `emergency` - Emergency squawk flag
- `nav_qnh`, `nav_altitude_mcp`, `nav_altitude_fms`, `nav_heading`, `nav_modes` - Autopilot settings
- `nic`, `rc`, `seen_pos`, `version`, `nic_baro`, `nac_p`, `nac_v`, `sil`, `sil_type`, `gva`, `sda` - Quality metrics
- `mlat`, `tisb` - Source type arrays
- `messages`, `rssi` - Reception stats
- `alert`, `spi` - Alert flags
- `wd`, `ws`, `oat`, `tat` - Weather data
- `r` - Route

### Recommended Minimal Payload

**Required Fields** (13 fields):

```typescript
interface OptimizedADSBAircraft {
  hex: string; // ICAO hex (unique ID)
  flight?: string; // Callsign
  lat?: number; // Latitude
  lon?: number; // Longitude
  track?: number; // Heading (degrees)
  alt_baro?: number; // Altitude (feet)
  gs?: number; // Ground speed (knots)
  squawk?: string; // Transponder code
  baro_rate?: number; // Climb/descent rate (ft/min)
  category?: string; // Aircraft category (for icon)
  t?: string; // Tail/registration
  type?: string; // Aircraft type
  seen?: number; // Seconds since last update
}
```

**Payload Reduction**: ~52 fields → 13 fields = **75% reduction**

---

## Implementation Plan

### Phase 1: Backend Changes (Python)

**File**: `rootfs/webapp/acarshub.py`

1. **Add background task for ADS-B polling**:

   ```python
   import requests
   import threading
   from time import sleep

   def poll_adsb_data():
       """Background task to poll ADS-B data every 10 seconds"""
       while True:
           if ENABLE_ADSB:
               try:
                   response = requests.get(ADSB_URL, timeout=5)
                   if response.status_code == 200:
                       data = response.json()
                       optimized = optimize_adsb_data(data)
                       socketio.emit('adsb_aircraft', optimized, namespace='/main')
               except Exception as e:
                   logging.error(f"ADS-B fetch failed: {e}")
           sleep(10)

   def optimize_adsb_data(raw_data):
       """Prune unused fields from aircraft.json"""
       keep_fields = ['hex', 'flight', 'lat', 'lon', 'track', 'alt_baro',
                      'gs', 'squawk', 'baro_rate', 'category', 't', 'type', 'seen']

       aircraft = []
       for plane in raw_data.get('aircraft', []):
           optimized = {k: plane[k] for k in keep_fields if k in plane}
           if 'hex' in optimized:  # Must have hex
               aircraft.append(optimized)

       return {
           'now': raw_data.get('now'),
           'aircraft': aircraft
       }
   ```

2. **Start background thread on app startup**:

   ```python
   if ENABLE_ADSB:
       adsb_thread = threading.Thread(target=poll_adsb_data, daemon=True)
       adsb_thread.start()
   ```

3. **Update `features_enabled` event** (remove URL/bypass):

   ```python
   # OLD:
   adsb: {
       enabled: True,
       lat: ADSB_LAT,
       lon: ADSB_LON,
       url: ADSB_URL,           # REMOVE
       bypass: ADSB_BYPASS_URL  # REMOVE
   }

   # NEW:
   adsb: {
       enabled: True,
       lat: ADSB_LAT,
       lon: ADSB_LON
   }
   ```

**Alternative**: Use Flask-SocketIO background tasks instead of threading:

```python
from flask_socketio import emit, Namespace
import time

def poll_adsb_background():
    while True:
        if ENABLE_ADSB:
            try:
                response = requests.get(ADSB_URL, timeout=5)
                data = response.json()
                optimized = optimize_adsb_data(data)
                socketio.emit('adsb_aircraft', optimized, namespace='/main')
            except:
                pass
        socketio.sleep(10)

socketio.start_background_task(poll_adsb_background)
```

### Phase 2: Frontend Changes (React)

**File**: `acarshub-react/src/types/index.ts`

1. **Update types**:

   ```typescript
   export interface ADSBConfig {
     enabled: boolean;
     lat: number;
     lon: number;
     // REMOVED: url, bypass, flight_tracking_url
   }

   export interface ADSBAircraft {
     hex: string;
     flight?: string;
     lat?: number;
     lon?: number;
     track?: number;
     alt_baro?: number;
     gs?: number;
     squawk?: string;
     baro_rate?: number;
     category?: string;
     t?: string; // tail/registration
     type?: string; // aircraft type
     seen?: number;
   }

   export interface ADSBData {
     now: number;
     aircraft: ADSBAircraft[];
   }
   ```

**File**: `acarshub-react/src/services/useSocketIO.ts`

<!-- markdownlint-disable -->2. **Add event listener**:
<!-- markdownlint-enable -->

```typescript
socket.on("adsb_aircraft", (data: ADSBData) => {
  setADSBAircraft(data);
});
```

**File**: `acarshub-react/src/store/useAppStore.ts`

<!-- markdownlint-enable -->3. **Update store**:<!-- markdownlint-disable -->

```typescript
adsbAircraft: null as ADSBData | null,

setADSBAircraft: (data: ADSBData) => set({ adsbAircraft: data }),
```

**File**: `acarshub-react/src/pages/LiveMapPage.tsx`

<!-- markdownlint-enable -->4. **Use Socket.IO data** (no polling):<!-- markdownlint-disable -->

```typescript
const adsbData = useAppStore((state) => state.adsbAircraft);

useEffect(() => {
  if (adsbData) {
    updateMapMarkers(adsbData.aircraft);
  }
}, [adsbData]);
```

### Phase 3: Configuration Cleanup

**Files**:

- `rootfs/webapp/acarshub_configuration.py`
- Environment variable docs

1. **Remove `ADSB_BYPASS_URL`** - No longer needed (backend handles all fetching)
2. **Keep `ADSB_URL`** - Still needed by backend
3. **Update documentation** - Explain new data flow

---

## Testing Plan

### Backend Tests

1. **ADS-B polling works**:
   - Start backend with `ENABLE_ADSB=true`, `ADSB_URL=http://tar1090/data/aircraft.json`
   - Verify background task starts
   - Verify `adsb_aircraft` events emitted every 10 seconds

2. **Field optimization works**:
   - Mock aircraft.json with 52 fields
   - Verify emitted data has only 13 fields
   - Verify `hex` field always present

3. **Error handling**:
   - Simulate unreachable ADSB_URL
   - Verify errors logged, no crashes
   - Verify retries continue

4. **Disabled state**:
   - Start backend with `ENABLE_ADSB=false`
   - Verify no polling task started
   - Verify no `adsb_aircraft` events

### Frontend Tests

1. **Socket.IO integration**:
   - Connect frontend to backend
   - Verify `adsb_aircraft` events received
   - Verify store updated

2. **Map rendering**:
   - Verify aircraft markers appear
   - Verify markers update on new data
   - Verify stale aircraft removed (based on `seen`)

3. **Performance**:
   - Test with 0, 10, 50, 100, 200+ aircraft
   - Verify smooth rendering (60fps)
   - Verify memory usage stable

---

## Migration Strategy

### Option A: Hard Cutover (Recommended)

- Implement all changes at once
- No legacy compatibility
- Clean codebase
- Requires testing all ADS-B functionality

**Rationale**: Legacy frontend already deprecated, no need for backward compatibility.

### Option B: Dual Mode (Not Recommended)

- Backend emits both old and new events
- Frontend uses new event, legacy uses old
- More complex, delayed cleanup

**Avoid**: Unnecessary complexity since legacy is being deleted.

---

## Rollback Plan

If issues found after deployment:

1. **Backend**: Comment out background task, re-enable URL in `features_enabled`
2. **Frontend**: Revert to polling logic temporarily
3. **Debug**: Fix issues, redeploy

---

## Future Enhancements

### Additional Optimizations

1. **Delta encoding**: Send only changed aircraft instead of full list
2. **Compression**: gzip Socket.IO payloads
3. **Batching**: Accumulate updates, send every 10s instead of immediately
4. **Filtering**: Backend filters by geographic bounds (e.g., only aircraft within 500nm)
5. **Message integration**: Backend merges ADS-B aircraft with ACARS message counts

### Backend Caching

```python
last_adsb_data = None
last_fetch_time = 0

def poll_adsb_data():
    global last_adsb_data, last_fetch_time

    now = time.time()
    if now - last_fetch_time < 10:
        return last_adsb_data  # Serve from cache

    # Fetch fresh data...
    last_adsb_data = optimized
    last_fetch_time = now
    return optimized
```

### ADS-B + ACARS Message Correlation

Backend can enrich ADS-B aircraft with ACARS message counts:

```python
def optimize_adsb_data(raw_data):
    aircraft = []
    for plane in raw_data.get('aircraft', []):
        optimized = {k: plane[k] for k in keep_fields if k in plane}

        # Enrich with ACARS message count
        hex_code = optimized['hex'].upper()
        acars_messages = get_messages_for_aircraft(hex_code)
        optimized['acars_message_count'] = len(acars_messages)
        optimized['has_alerts'] = any(msg.get('matched') for msg in acars_messages)

        aircraft.append(optimized)

    return {'now': raw_data.get('now'), 'aircraft': aircraft}
```

---

## Questions to Resolve

1. **Polling interval**: 10 seconds optimal? (Legacy used 5 seconds)
   - **Recommendation**: Start with 10s (matches typical ADS-B update rate)
   - Aircraft position updates roughly every 1-5 seconds in tar1090
   - 10s is good balance between latency and server load

2. **Threading vs async**: Use `threading.Thread` or `socketio.start_background_task()`?
   - **Recommendation**: `socketio.start_background_task()` (Flask-SocketIO native)
   - Better integration with Socket.IO event loop
   - Cleaner shutdown handling

3. **Error retry logic**: Exponential backoff or fixed interval?
   - **Recommendation**: Fixed 10s interval with logging
   - ADS-B outages are rare, exponential backoff not needed
   - Log errors for monitoring, continue polling

4. **Field pruning**: Always remove unused fields, or make it configurable?
   - **Recommendation**: Always prune (hardcoded list)
   - 75% reduction is significant bandwidth savings
   - Advanced users can modify backend if needed

5. **Message correlation**: Implement in Phase 1 or defer?
   - **Recommendation**: Defer to Phase 2 (separate enhancement)
   - Keep initial refactor focused on data flow change
   - Add ACARS correlation after map rendering complete

---

## Timeline Estimate

- **Backend changes**: 2-4 hours (polling task, optimization, testing)
- **Frontend changes**: 1-2 hours (remove polling, add Socket.IO listener)
- **Testing**: 2-3 hours (integration tests, performance tests)
- **Documentation**: 1 hour (update AGENTS.md, code comments)

**Total**: 6-10 hours

---

## Approval Checklist

- [ ] Backend polling logic implemented
- [ ] Field optimization tested (52 → 13 fields)
- [ ] Socket.IO event `adsb_aircraft` emitted
- [ ] Frontend removes polling code
- [ ] Frontend listens for `adsb_aircraft` event
- [ ] Map rendering works with new data flow
- [ ] Performance tested (100+ aircraft)
- [ ] Error handling tested (unreachable ADSB_URL)
- [ ] Configuration updated (remove ADSB_BYPASS_URL)
- [ ] Documentation updated
- [ ] Legacy code removed (no backward compatibility)

---

## References

- **Legacy polling code**: `acarshub-typescript/src/index.ts` lines 488-503
- **Legacy ADS-B data handling**: `acarshub-typescript/src/pages/live_map.ts` lines 263-351
- **Backend config**: `rootfs/webapp/acarshub_configuration.py` lines 83-91, 214-232
- **ADS-B interface**: `acarshub-typescript/src/interfaces.ts` lines 225-252
