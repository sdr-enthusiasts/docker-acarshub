# Test Fixtures - Real-World Message Data

This directory contains real-world ACARS, VDLM2, and HFDL messages collected from live decoders for use in End-to-End (E2E) testing.

## Files

### Raw Decoder Output (JSON-Lines Format)

- **`raw-acars-messages.jsonl`** - 1,220 ACARS messages (285KB)
  - Source: `acarsdec` v4.4.1 via `acars_router`
  - Frequency range: 130.025 - 131.55 MHz
  - Collection period: ~1 hour
  - Format: One JSON object per line (newline-delimited)

- **`raw-vdlm2-messages.jsonl`** - 798 VDLM2 messages (308KB)
  - Source: `dumpvdl2` v2.5.1 via `acars_router`
  - Frequency: 136.650 MHz (primary VDL Mode 2 channel)
  - Collection period: ~1 hour
  - Format: One JSON object per line (newline-delimited)

- **`raw-hfdl-messages.jsonl`** - 842 HFDL messages (362KB)
  - Source: `dumphfdl` v1.7.0 via `acars_router`
  - Frequency range: 5.720 - 21.934 MHz (HF bands)
  - Collection period: ~1 hour
  - Format: One JSON object per line (newline-delimited)

**Total:** 2,860 real-world messages across all three protocols

## Message Format

### ACARS (acarsdec)

```json
{
  "freq": 131.55,
  "channel": 4,
  "error": 0,
  "level": -6.9,
  "timestamp": 1769990333.8837607,
  "app": { "name": "acarsdec", "ver": "v4.4.1", "proxied": true },
  "station_id": "CS-KABQ-ACARS",
  "mode": "2",
  "label": "SQ",
  "text": "02XAABQKABQ13502N10637WV136975/ARINC"
}
```

### VDLM2 (dumpvdl2)

```json
{
  "vdl2": {
    "app": { "name": "dumpvdl2", "ver": "2.5.1-dirty" },
    "avlc": {
      "frame_type": "I",
      "src": { "addr": "ABFDAF", "type": "Aircraft" },
      "acars": {
        "reg": ".N8719Q",
        "mode": "2",
        "label": "H1",
        "flight": "WN2340",
        "msg_text": "..."
      }
    },
    "freq": 136650000,
    "sig_level": -16.620939,
    "station": "CS-KABQ-VDLM",
    "t": { "sec": 1769990648, "usec": 949234 }
  }
}
```

### HFDL (dumphfdl)

```json
{
  "hfdl": {
    "app": { "name": "dumphfdl", "ver": "1.7.0" },
    "freq": 17919000,
    "sig_level": -9.209839,
    "station": "CS-KABQ-HFDL",
    "spdu": {
      "src": { "type": "Ground station", "id": 1 },
      "frame_index": 47
    }
  }
}
```

## Usage Strategy

### ❌ NOT for Phase 10.2 (Integration Tests)

These files are **NOT used** in Phase 10.2 integration tests because:

- They require Python backend processing (duplicate detection, flight lookup, libacars decoding)
- Integration tests need small, deterministic mock data
- We want fast, focused tests that don't depend on the backend

**For Phase 10.2:** Use hand-crafted fixtures in `acarshub-react/src/__fixtures__/messages.ts`

### ✅ For Phase 10.3 (End-to-End Tests)

These files are **IDEAL** for E2E testing with Playwright:

1. **Full Stack Testing**
   - Feed raw messages → Python backend → Socket.IO → React app
   - Validates entire message processing pipeline
   - Tests with real-world data volumes and edge cases

2. **Performance Testing**
   - Simulate sustained message load (2,860 messages over time)
   - Verify UI remains responsive with 100+ aircraft
   - Test memory usage and message culling

3. **Regression Testing**
   - Catch processing bugs with real-world message formats
   - Validate decoder integrations (libacars, @airframes/acars-decoder)
   - Ensure multi-part messages merge correctly

### Example E2E Test Usage (Playwright)

```typescript
// tests/e2e/message-processing.spec.ts
import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

test("processes real ACARS messages", async ({ page }) => {
  // Load raw messages
  const rawMessages = fs
    .readFileSync(
      path.join(__dirname, "../fixtures/raw-acars-messages.jsonl"),
      "utf-8",
    )
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

  // Feed to backend via Socket.IO mock or HTTP endpoint
  for (const msg of rawMessages.slice(0, 100)) {
    await page.evaluate((message) => {
      // Inject message into backend processing
      window.__testBackend.processMessage(message);
    }, msg);
  }

  // Verify UI updates
  await expect(
    page.locator(".message-group"),
  ).toHaveCount(/* expected aircraft count */);
  await expect(
    page.locator(".message-card"),
  ).toHaveCount(/* expected message count */);
});
```

## Backend Processing Required

These raw messages must pass through the Python backend's processing pipeline:

1. **Message Normalization** (`acarshub_helpers.handle_message()`)
   - Extract aircraft identifiers (tail, flight, ICAO hex)
   - Convert timestamps to standardized format
   - Normalize frequency values

2. **Duplicate Detection** (3 strategies)
   - Full field comparison
   - Text-only comparison
   - Multi-part sequence tracking

3. **Multi-Part Message Merging**
   - Detect sequences (M01A, M02A, M03A)
   - Merge text fields
   - Re-decode combined message

4. **Flight Data Enrichment**
   - Airline lookup (IATA/ICAO codes)
   - Flight number formatting
   - Route information (if available)

5. **Libacars Decoding**
   - Parse libacars JSON strings
   - Format CPDLC messages
   - Extract frequency data

6. **Alert Matching**
   - Check against configured alert terms
   - Mark matched messages
   - Track matched text

7. **Database Storage** (for Search page)
   - Insert into SQLite `messages` table
   - Update FTS5 search index

8. **Socket.IO Emission**
   - Convert to `acars_msg` event format
   - Broadcast to connected React clients

## Phase 10.3 Implementation Plan

When we reach Phase 10.3, we'll:

1. **Create Backend Test Harness**
   - Python function to batch-process raw messages
   - Save processed output to `processed-messages.json`
   - OR: Mock Socket.IO server that processes on-demand

2. **Playwright Test Suite**
   - Load raw messages from these files
   - Feed to backend (real or mocked)
   - Validate React UI behavior:
     - Message grouping by aircraft
     - Duplicate detection
     - Multi-part merging
     - Alert highlighting
     - Search functionality
     - Map marker updates

3. **Performance Benchmarks**
   - Measure time to process all 2,860 messages
   - Verify UI responsiveness under load
   - Check memory usage stays bounded

4. **Edge Case Validation**
   - Multi-part messages (search for label patterns in files)
   - Alert-triggering messages (configure test alert terms)
   - Duplicate sequences
   - Libacars CPDLC messages

## File Maintenance

### If Backend API Changes

If the Python backend's Socket.IO message format changes (field names, structure):

- **Option A**: Re-process raw messages through updated backend → save new `processed-messages.json`
- **Option B**: Keep raw messages as-is, update E2E tests to use latest backend version
- **Recommended**: Option B (raw messages never need updating, always test current backend)

### Updating Test Data

To refresh with newer messages:

```bash
# Collect new messages from decoders
acarsdec -r 0 131.550 > /tmp/acars.jsonl
dumpvdl2 --station-id TEST 136650000 > /tmp/vdlm2.jsonl
dumphfdl --station-id TEST 17919 > /tmp/hfdl.jsonl

# Replace fixture files
cp /tmp/acars.jsonl acarshub-react/tests/fixtures/raw-acars-messages.jsonl
cp /tmp/vdlm2.jsonl acarshub-react/tests/fixtures/raw-vdlm2-messages.jsonl
cp /tmp/hfdl.jsonl acarshub-react/tests/fixtures/raw-hfdl-messages.jsonl
```

## Git LFS Consideration

These files total ~955KB. If we collect more extensive datasets (e.g., 24-hour captures), consider using Git LFS:

```bash
git lfs track "*.jsonl"
```

For now, plain Git commit is fine (under 1MB total).

## Summary

- **Purpose**: Real-world E2E testing in Phase 10.3
- **Format**: Raw decoder output (not processed by backend)
- **Count**: 2,860 messages across ACARS/VDLM2/HFDL
- **Next Steps**: Create hand-crafted mocks for Phase 10.2, use these files in Phase 10.3
