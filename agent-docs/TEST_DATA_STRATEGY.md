# Test Data Strategy for ACARS Hub

This document outlines the test data strategy across different testing phases.

## Overview

ACARS Hub uses **two distinct types of test data**:

1. **Hand-crafted mock fixtures** for integration testing (Phase 10.2)
2. **Real-world message captures** for E2E testing (Phase 10.3)

This separation ensures fast, deterministic integration tests while also validating against real-world data in E2E scenarios.

---

## Phase 10.2: Integration Testing (Current Phase)

### Data Source: Hand-Crafted Mock Fixtures

**Location:** `acarshub-react/src/__fixtures__/messages.ts`

**Format:** TypeScript objects in Socket.IO `acars_msg` event format (post-backend processing)

**Size:** ~10-15 carefully crafted examples (~5-10KB total)

### Coverage

The mock fixtures include:

1. **Simple ACARS message** - Basic text message with position data
2. **Multi-part sequence** - 3-part message (M01A, M02A, M03A) for merge testing
3. **Libacars CPDLC message** - Tests libacars decoder integration
4. **Alert message** - Contains "EMERGENCY" for alert matching tests
5. **Duplicate message** - Identical to #1 for dup detection testing
6. **HFDL message** - HF datalink message example
7. **VDLM2 message** - VDL Mode 2 message example
8. **Empty message** - No text/data fields (label SQ)

### Why Hand-Crafted Mocks?

- **Fast execution** - No Python backend required, tests run in milliseconds
- **Deterministic** - Same input → same output, no flaky tests
- **Edge case coverage** - Control exact scenarios (multi-part timing, exact duplicates, etc.)
- **Small size** - Minimal fixture data keeps test suite lean
- **Focus** - Each fixture targets specific functionality

### Example Usage

```typescript
import { simpleAcarsMessage, multiPartMessages, alertMessage } from '@/__fixtures__/messages';

describe('MessageCard', () => {
  it('renders simple ACARS message', () => {
    render(<MessageCard message={simpleAcarsMessage} />);
    expect(screen.getByText('N12345')).toBeInTheDocument();
  });

  it('handles multi-part messages', () => {
    // Test with pre-defined multi-part sequence
    const { rerender } = render(<MessageGroup messages={[multiPartMessages[0]]} />);
    rerender(<MessageGroup messages={multiPartMessages} />);
    expect(screen.getByText(/M01A M02A M03A/)).toBeInTheDocument();
  });
});
```

---

## Phase 10.3: End-to-End Testing

### Data Source: Real-World Message Captures

**Location:** `acarshub-react/tests/fixtures/`

**Files:**

- `raw-acars-messages.jsonl` - 1,220 ACARS messages (285KB)
- `raw-vdlm2-messages.jsonl` - 798 VDLM2 messages (308KB)
- `raw-hfdl-messages.jsonl` - 842 HFDL messages (362KB)

**Total:** 2,860 real messages collected over ~1 hour

**Format:** JSON-lines (newline-delimited JSON), raw decoder output

### Message Sources

- **ACARS:** `acarsdec` v4.4.1 via `acars_router`
- **VDLM2:** `dumpvdl2` v2.5.1 via `acars_router`
- **HFDL:** `dumphfdl` v1.7.0 via `acars_router`

### Why Real-World Data for E2E?

- **Validates full stack** - Raw decoder output → Python backend → Socket.IO → React UI
- **Real edge cases** - Catches issues with actual message formats, timing, volumes
- **Performance testing** - Sustained load of 2,860 messages over time
- **Regression prevention** - Ensures backend processing handles real-world data
- **No pre-processing** - Tests current backend logic, not stale processed data

### Backend Processing Pipeline

Real messages must pass through:

1. Message normalization (`acarshub_helpers.handle_message()`)
2. Duplicate detection (3 strategies)
3. Multi-part message merging
4. Flight data enrichment (airline lookup)
5. Libacars decoding
6. Alert matching
7. Database storage
8. Socket.IO emission

### Example E2E Test Usage

```typescript
// tests/e2e/message-processing.spec.ts
import { test, expect } from "@playwright/test";
import fs from "fs";

test("processes real ACARS messages end-to-end", async ({ page }) => {
  // Load first 100 raw messages
  const rawMessages = fs
    .readFileSync("tests/fixtures/raw-acars-messages.jsonl", "utf-8")
    .split("\n")
    .filter((line) => line.trim())
    .slice(0, 100)
    .map((line) => JSON.parse(line));

  // Feed to backend (implementation depends on test harness)
  await feedMessagesToBackend(rawMessages);

  // Verify React UI updates
  await expect(page.locator(".message-group")).toHaveCount.greaterThan(0);
  await expect(page.locator(".message-card")).toHaveCount.greaterThan(0);

  // Verify multi-part merging happened
  const multiPartMessages = page.locator('.message-card:has-text("M01A M02A")');
  await expect(multiPartMessages).toHaveCount.greaterThan(0);
});
```

---

## Data Format Differences

### Raw Decoder Format (E2E Tests)

**ACARS (acarsdec):**

```json
{
  "freq": 131.55,
  "timestamp": 1769990333.8837607,
  "station_id": "CS-KABQ-ACARS",
  "mode": "2",
  "label": "SQ",
  "text": "02XAABQKABQ13502N10637WV136975/ARINC"
}
```

**VDLM2 (dumpvdl2):**

```json
{
  "vdl2": {
    "avlc": {
      "acars": {
        "reg": ".N8719Q",
        "mode": "2",
        "label": "H1",
        "flight": "WN2340",
        "msg_text": "..."
      }
    },
    "freq": 136650000,
    "station": "CS-KABQ-VDLM"
  }
}
```

### Socket.IO Format (Integration Tests)

**After backend processing:**

```typescript
{
  uid: "unique-id",
  station_id: "CS-KABQ-ACARS",
  tail: "N12345",
  flight: "UAL123",
  icao: "UAL123",
  icao_hex: "ABC123",
  airline: "United Airlines",
  iata_flight: "UA123",
  icao_flight: "UAL123",
  text: "POSITION REPORT",
  matched: false,
  matched_text: [],
  duplicates: "",
  msgno_parts: "",
  // ... many more normalized fields
}
```

---

## Maintenance Strategy

### When Backend API Changes

**Integration Tests (Phase 10.2):**

- Update `src/__fixtures__/messages.ts` to match new format
- Small, fast change (~10-15 objects)

**E2E Tests (Phase 10.3):**

- **No change needed** - Raw messages never change
- Backend processes with latest code
- Tests validate current behavior

### Refreshing Real-World Data

If you want newer message samples:

```bash
# Collect from live decoders
acarsdec -r 0 131.550 > /tmp/acars.jsonl &
dumpvdl2 --station-id TEST 136650000 > /tmp/vdlm2.jsonl &
dumphfdl --station-id TEST 17919 > /tmp/hfdl.jsonl &

# Let run for 1+ hours, then Ctrl+C

# Replace fixtures
cp /tmp/acars.jsonl acarshub-react/tests/fixtures/raw-acars-messages.jsonl
cp /tmp/vdlm2.jsonl acarshub-react/tests/fixtures/raw-vdlm2-messages.jsonl
cp /tmp/hfdl.jsonl acarshub-react/tests/fixtures/raw-hfdl-messages.jsonl
```

---

## File Size Considerations

### Current State

- **Integration fixtures:** ~5-10KB (negligible)
- **E2E fixtures:** ~955KB total (acceptable for Git)

### Future Considerations

If E2E datasets grow beyond ~5MB:

1. **Compress fixtures:** Use gzip (`.jsonl.gz`)
2. **Git LFS:** Track large files separately
3. **Sample subsets:** Keep full datasets locally, commit representative samples
4. **On-demand download:** Script to fetch large datasets when needed

For now, plain Git commit is fine.

---

## Summary Table

| Aspect           | Integration Tests (10.2)       | E2E Tests (10.3)            |
| ---------------- | ------------------------------ | --------------------------- |
| **Location**     | `src/__fixtures__/messages.ts` | `tests/fixtures/*.jsonl`    |
| **Format**       | Socket.IO `acars_msg`          | Raw decoder output          |
| **Size**         | ~10-15 examples (~5KB)         | 2,860 messages (~955KB)     |
| **Processing**   | Pre-processed (post-backend)   | Requires backend processing |
| **Speed**        | Very fast (milliseconds)       | Slower (full stack)         |
| **Purpose**      | Unit/integration tests         | E2E validation              |
| **Updates**      | Manual when API changes        | Never (always raw)          |
| **Dependencies** | None (pure TypeScript)         | Python backend required     |

---

## Questions & Answers

### Q: Why not use real messages for integration tests?

**A:** Integration tests need to be **fast and deterministic**. Processing 2,860 raw messages through the Python backend would:

- Slow down test suite significantly (seconds → minutes)
- Require Python runtime in CI
- Make tests harder to debug (which of 2,860 messages caused the failure?)
- Introduce timing dependencies and flakiness

Hand-crafted mocks are small, focused, and run in milliseconds.

### Q: Why not pre-process real messages for integration tests?

**A:** Pre-processing creates stale data:

- If backend API changes, pre-processed data becomes invalid
- Must re-process entire dataset for every API change
- Defeats purpose of having real data (now it's synthetic anyway)

Better to use raw data in E2E tests where backend processing is part of the test.

### Q: Can we use a subset of real messages for integration tests?

**A:** Not recommended:

- Still requires Python backend (no speed gain)
- Loses determinism (which subset? how chosen?)
- Harder to target specific edge cases
- Mock fixtures are already a "curated subset" designed for testing

### Q: When do we actually use the 2,860 real messages?

**A:** Phase 10.3 (E2E testing) with Playwright:

- Test full application stack (Python + React)
- Validate real-world message processing
- Performance testing under sustained load
- Catch edge cases we didn't anticipate in mocks

---

## Documentation References

- **Mock fixtures:** `acarshub-react/src/__fixtures__/messages.ts`
- **Real fixtures:** `acarshub-react/tests/fixtures/README.md`
- **Phase 10.2 plan:** `AGENTS.md` lines 2190-2231
- **Phase 10.3 plan:** `AGENTS.md` lines 2231-2261
