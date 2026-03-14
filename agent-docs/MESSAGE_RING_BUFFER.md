# ACARS Hub - Message Ring Buffer: On-Connect Warm State

## Overview

This document describes the plan for replacing the per-connect database query
pattern for recent messages and recent alerts with a pair of in-memory ring
buffers maintained by the backend. On every new socket connection the handler
reads directly from memory instead of hitting SQLite.

Companion branch: `memory/timeseries-reduction`

---

## Problem Statement

### Current Behaviour

Every time a client connects, `handleConnect()` in
`acarshub-backend/src/socket/handlers.ts` executes the following against
SQLite:

1. `grabMostRecent(250)` — `SELECT * FROM messages ORDER BY msg_time DESC LIMIT 250`
2. `enrichMessages()` — runs every one of those 250 raw DB rows through the
   full enrichment pipeline: field renames, null-pruning, ICAO hex conversion,
   airline lookup, ground-station lookup, label lookup, and `@airframes/acars-decoder`
   text decoding.
3. Filters out alert-matched messages, leaving at most 250 non-alert messages.
4. `searchAlerts(100, 0)` — `SELECT … FROM alert_matches INNER JOIN messages … ORDER BY matched_at DESC LIMIT 100`
5. Enriches all 100 alert rows in the same pipeline.

### Why This Is Wrong

**It re-does work on every connect that was already done once.** When a
message arrives from a decoder it is:

1. Formatted by `formatAcarsMessage()`.
2. Saved to SQLite by `addMessageFromJson()`.
3. Enriched by `enrichMessage()`.
4. Emitted to all currently-connected clients via `acars_msg`.

The enriched, broadcast-ready `AcarsMsg` is then thrown away. The next client
to connect forces a full DB round-trip and a complete re-enrichment of the
same 250 messages — including another pass through `@airframes/acars-decoder`
for every message that has text.

**Concrete costs per connect on a busy install:**

| Step                                   | Cost                                                         |
| -------------------------------------- | ------------------------------------------------------------ |
| `SELECT … LIMIT 250` on messages table | SQLite query, disk I/O, 250 row allocations                  |
| `enrichMessages(250)`                  | 250× field renames, 250× `acars-decoder` decode calls        |
| `searchAlerts(100)` JOIN               | SQLite JOIN query, 100 row allocations                       |
| `enrichMessages(100)`                  | 100× field renames, 100× `acars-decoder` decode calls        |
| Total allocations                      | ~700 JS objects created, enriched, chunked, serialised, GC'd |

On a site with multiple simultaneous clients — after a container restart, for
example — these queries run in parallel. N clients × 700 objects means a
significant transient heap spike on exactly the moment when the process is
already under startup load.

Beyond the spike, running `acars-decoder` 350 times per connect is simply
wasteful. The decoder is not cheap — it pattern-matches against a large rule
table. Doing it at arrival time (once) and caching the result is the correct
design.

---

## Goal

Maintain two in-memory ring buffers in the backend that are populated as
messages arrive and read at connect time:

- **`MessageRingBuffer`** — the last N non-alert enriched messages, ready to
  send directly to a new client without any DB query or re-enrichment.
- **`AlertRingBuffer`** — the last M alert-matched enriched messages, same
  guarantee.

Both buffers are populated as part of the existing live message pipeline
(in `setupMessageQueue()`), so the data is always already there. Connect
becomes a pure memory read.

---

## Proposed Architecture

### Ring Buffer Structure

A ring buffer is an array of fixed capacity where new items overwrite the
oldest slot. It is the correct data structure here because:

- The capacity is fixed and small (configurable, default 250 messages / 100
  alerts).
- Insert is O(1) — advance a write pointer, overwrite the slot.
- Snapshot for connect is O(N) — copy the array in age order.
- Memory is bounded and constant after startup.

```typescript
// acarshub-backend/src/services/message-ring-buffer.ts

export class RingBuffer<T> {
  private readonly buf: Array<T | undefined>;
  private writeIdx = 0;
  private count = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buf = new Array<T | undefined>(capacity).fill(undefined);
  }

  /** Insert one item. Overwrites the oldest item when full. O(1). */
  push(item: T): void {
    this.buf[this.writeIdx] = item;
    this.writeIdx = (this.writeIdx + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /**
   * Return a snapshot of all items in insertion order (oldest first).
   * A new array is always returned so callers cannot mutate the buffer.
   */
  snapshot(): T[] {
    if (this.count === 0) return [];

    const result: T[] = [];
    if (this.count < this.capacity) {
      // Buffer not yet full — items start at index 0
      for (let i = 0; i < this.count; i++) {
        result.push(this.buf[i] as T);
      }
    } else {
      // Buffer full — oldest item is at writeIdx
      for (let i = 0; i < this.capacity; i++) {
        result.push(this.buf[(this.writeIdx + i) % this.capacity] as T);
      }
    }
    return result;
  }

  /** Most-recent N items (newest first), used to send to a new client. */
  snapshotNewestFirst(): T[] {
    return this.snapshot().reverse();
  }

  get size(): number {
    return this.count;
  }

  clear(): void {
    this.buf.fill(undefined);
    this.writeIdx = 0;
    this.count = 0;
  }
}
```

### Module: `message-ring-buffer.ts`

New file at `acarshub-backend/src/services/message-ring-buffer.ts`.

Owns two singleton `RingBuffer<AcarsMsg>` instances and exposes a clean API:

```typescript
// Capacities are configurable but these are the right defaults:
// - 250 messages matches the current grabMostRecent(250) call.
// - 100 alerts matches the current searchAlerts(100, 0) call.
const DEFAULT_MESSAGE_CAPACITY = 250;
const DEFAULT_ALERT_CAPACITY = 100;

let messageBuffer: RingBuffer<AcarsMsg> | null = null;
let alertBuffer: RingBuffer<AcarsMsg> | null = null;

export function initMessageBuffers(
  messageCapacity = DEFAULT_MESSAGE_CAPACITY,
  alertCapacity = DEFAULT_ALERT_CAPACITY,
): void { … }

/** Called for every non-alert message after enrichment. */
export function pushMessage(msg: AcarsMsg): void { … }

/** Called for every alert-matched message after enrichment. */
export function pushAlert(msg: AcarsMsg): void { … }

/**
 * Return a snapshot for on-connect delivery.
 * Always newest-first (matches current handleConnect behaviour).
 */
export function getRecentMessages(): AcarsMsg[] { … }
export function getRecentAlerts(): AcarsMsg[] { … }

/** For testing — destroy and recreate. */
export function resetMessageBuffersForTesting(): void { … }
```

### Integration Point 1: `setupMessageQueue()` in `services/index.ts`

This is where enriched messages are currently emitted to Socket.IO. It is the
**only** place that needs to push into the ring buffers. No other code path
creates enriched messages.

Current (truncated):

```typescript
const enrichedMessage = enrichMessage(formattedMessage);

// Emit enriched message to Socket.IO clients
this.config.socketio.emit("acars_msg", { msghtml: enrichedMessage });
```

After the change:

```typescript
const enrichedMessage = enrichMessage(formattedMessage);

// Update ring buffers BEFORE emitting so a client connecting at this
// exact moment gets a consistent snapshot.
if (alertMetadata.matched) {
  pushAlert(enrichedMessage);
} else {
  pushMessage(enrichedMessage);
}

// Emit to currently-connected clients (unchanged)
this.config.socketio.emit("acars_msg", { msghtml: enrichedMessage });
```

The alert routing is already known here: `alertMetadata.matched` is set by
`addMessageFromJson()` before enrichment occurs.

### Integration Point 2: `handleConnect()` in `socket/handlers.ts`

Replace the DB queries and re-enrichment with direct ring buffer reads.

Current:

```typescript
// Step 6 — Recent messages
const recentMessagesRaw = grabMostRecent(250);
const recentMessages = enrichMessages(recentMessagesRaw);
const nonAlertMessages = recentMessages.filter((msg) => !msg.matched);

// Step 10 — Recent alerts
const recentAlertsRaw = searchAlerts(100, 0);
const recentAlerts = recentAlertsRaw.map((alert) => {
  const enriched = enrichMessage(alert.message);
  enriched.matched = true;
  enriched.matched_text = …;
  …
  return enriched;
});
```

After the change:

```typescript
// Step 6 — Recent messages (from ring buffer, no DB query)
const nonAlertMessages = getRecentMessages(); // already enriched, newest-first

// Step 10 — Recent alerts (from ring buffer, no DB query)
const recentAlerts = getRecentAlerts(); // already enriched, newest-first
```

The chunk-send loop beneath each block is unchanged — it still batches into
25-message `acars_msg_batch` / `alert_matches_batch` events.

### Startup Warm-Up

The ring buffers are empty at startup. The first client to connect after a
fresh start will get fewer than 250 messages — exactly as today (a fresh
container has no messages). On a **restart** of an existing install with
messages in the database, the buffers need to be seeded from SQLite once,
at startup.

Add `warmMessageBuffers()` to the module:

```typescript
export async function warmMessageBuffers(): Promise<void> {
  const rawMessages = grabMostRecent(DEFAULT_MESSAGE_CAPACITY * 2);
  // grabMostRecent returns newest-first; process oldest-first so ring buffer
  // ends up with newest at the logical "head".
  const oldest_first = rawMessages.reverse();

  for (const raw of oldest_first) {
    const enriched = enrichMessage(raw as Record<string, unknown>);
    if (enriched.matched) {
      // Skip — alert warm-up is handled separately below
    } else {
      pushMessage(enriched);
    }
  }

  const alertRows = searchAlerts(DEFAULT_ALERT_CAPACITY * 2, 0);
  const oldest_alerts_first = alertRows.reverse();

  for (const row of oldest_alerts_first) {
    const enriched = enrichMessage(row.message as Record<string, unknown>);
    enriched.matched = true;
    // Restore alert metadata fields
    enriched.matched_text = row.matchType === "text" ? [row.term] : undefined;
    enriched.matched_icao = row.matchType === "icao" ? [row.term] : undefined;
    enriched.matched_flight =
      row.matchType === "flight" ? [row.term] : undefined;
    enriched.matched_tail = row.matchType === "tail" ? [row.term] : undefined;
    pushAlert(enriched);
  }
}
```

`warmMessageBuffers()` is called once in `server.ts` during the startup
sequence, immediately after `initDatabase()` succeeds and after
`initMessageBuffers()` is called. It runs exactly once, synchronously
(better-sqlite3), before any sockets are accepted from the pending queue.

```typescript
// server.ts — startup sequence (Phase 3, after DB is open)
initMessageBuffers();
await warmMessageBuffers();
```

WHY multiply capacity by 2 in the warm query: the first `grabMostRecent` fetch
uses `250 * 2 = 500` rows. Many of those will be alert-matched and filtered
out. Fetching 2× guarantees the non-alert buffer reaches its full 250-item
capacity even if up to half the most-recent messages are alerts.

---

## Alert Buffer: Duplication Concern

The `alert_matches` table is a junction table: one message can match multiple
terms and therefore have multiple rows in `alert_matches`. The existing
`searchAlerts()` query returns one row per match (not per message). The current
`handleConnect()` code does not deduplicate these — a single message matched
against 3 terms produces 3 separate enriched entries sent to the frontend.

The ring buffer should maintain **one entry per unique message UID** for alerts,
using the last (most recent) match term for that UID. Deduplication should be
applied in `pushAlert()`:

```typescript
export function pushAlert(msg: AcarsMsg): void {
  // If the UID is already in the buffer, replace it in-place
  // rather than adding a duplicate. Preserve insertion order by
  // overwriting the existing slot.
  const existing = findByUid(alertBuffer, msg.uid);
  if (existing !== null) {
    mergeAlertMetadata(existing, msg);
    return;
  }
  alertBuffer.push(msg);
}
```

This matches what the frontend already does: `useAppStore.addMessage()` merges
messages with the same UID into a single group entry.

---

## Memory Footprint

A ring buffer of 250 enriched `AcarsMsg` objects is small. A typical enriched
message object has:

- ~15-25 string fields (uid, flight, tail, text, station_id, message_type, …)
- Optional `decodedText` with a few structured items
- No nested arrays of significant size

A conservatively large enriched message is ~4 KB. 250 messages × 4 KB = **1 MB**.
100 alerts × 4 KB = **400 KB**.

Total ring buffer overhead: **~1.4 MB steady-state**. This is a fixed, bounded,
constant cost — it does not grow with database size, connection count, or
uptime. It replaces the current pattern where the same ~700 KB is allocated,
enriched, serialised, and GC'd on every single connect.

---

## What Does NOT Change

- The `grabMostRecent()` and `searchAlerts()` DB functions are **not deleted**.
  They remain available for the search handler and any future use.
- The chunk-send loop in `handleConnect()` is unchanged.
- The frontend receives the same `acars_msg_batch` and `alert_matches_batch`
  events with the same payload shapes. No frontend changes are required.
- `enrichMessage()` is called exactly once per message — at arrival, in
  `setupMessageQueue()`. Nothing new.
- The alert-metadata restoration logic (setting `matched`, `matched_text`, etc.)
  moves from `handleConnect()` into `pushAlert()` / `warmMessageBuffers()`.

---

## Implementation Plan

### Phase 1 — Backend: `message-ring-buffer.ts`

1. Create `acarshub-backend/src/services/message-ring-buffer.ts` with the
   `RingBuffer<T>` class, the two singleton buffers, and the full public API
   described above (`initMessageBuffers`, `pushMessage`, `pushAlert`,
   `getRecentMessages`, `getRecentAlerts`, `warmMessageBuffers`,
   `resetMessageBuffersForTesting`).

2. Add `initMessageBuffers()` call to `server.ts` startup sequence, after
   `initDatabase()`.

3. Add `await warmMessageBuffers()` call immediately after, before draining
   the pending socket queue.

### Phase 2 — Backend: Wire into `setupMessageQueue()`

In `acarshub-backend/src/services/index.ts`, inside `setupMessageQueue()`,
after `enrichMessage()` is called and before the Socket.IO emit, add:

```typescript
if (alertMetadata.matched) {
  pushAlert(enrichedMessage);
} else {
  pushMessage(enrichedMessage);
}
```

### Phase 3 — Backend: Simplify `handleConnect()`

In `acarshub-backend/src/socket/handlers.ts`, replace the DB-query steps for
messages (step 6) and alerts (step 10) with the ring buffer reads. Remove
the now-unused imports of `grabMostRecent`, `searchAlerts`, and `enrichMessages`
from `handleConnect()` (keep them in the import map if still used by other
handlers in the file — verify before removing).

### Phase 4 — Tests

**`message-ring-buffer.test.ts`** (new file):

- `RingBuffer` constructor creates a buffer with the correct capacity.
- `push()` into a non-full buffer fills slots in order.
- `snapshot()` on a non-full buffer returns items oldest-first.
- `push()` beyond capacity overwrites the oldest slot.
- `snapshot()` on a full buffer returns items in correct insertion order.
- `snapshotNewestFirst()` reverses the above.
- `size` property reflects actual item count, capped at capacity.
- `clear()` resets the buffer to empty.
- `pushMessage()` stores a non-alert message.
- `pushAlert()` deduplicates by UID (second push with same UID updates
  in-place, does not grow the buffer).
- `getRecentMessages()` returns a copy (mutations do not affect the buffer).
- `getRecentAlerts()` returns a copy.
- `warmMessageBuffers()` correctly seeds both buffers from the DB (use
  in-memory SQLite).
- `warmMessageBuffers()` handles empty DB gracefully (no crash, empty buffers).
- `resetMessageBuffersForTesting()` leaves both buffers empty and
  re-initialised.

**`handlers.test.ts`** (update existing):

- Regression: `handleConnect()` does NOT call `grabMostRecent()` or
  `searchAlerts()` (assert those functions are not called via spy).
- `handleConnect()` emits `acars_msg_batch` with data from the ring buffer.
- `handleConnect()` emits `alert_matches_batch` with data from the ring buffer.
- Empty buffer results in zero `acars_msg_batch` / `alert_matches_batch` events
  (or a single event with `done_loading: true` and `messages: []`).

**`services/index.test.ts`** (update existing):

- After a message is processed through `setupMessageQueue()`, the non-alert
  message appears in `getRecentMessages()`.
- After an alert-matched message is processed, it appears in
  `getRecentAlerts()` and NOT in `getRecentMessages()`.

---

## Files Changed

### Backend

| File                                                 | Change                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| `src/services/message-ring-buffer.ts`                | **New** — `RingBuffer<T>` class, singleton buffers, full public API   |
| `src/services/index.ts`                              | `setupMessageQueue()` pushes to ring buffers after enrichment         |
| `src/socket/handlers.ts`                             | `handleConnect()` reads from ring buffers instead of DB               |
| `src/server.ts`                                      | Call `initMessageBuffers()` and `warmMessageBuffers()` during startup |
| `src/services/__tests__/message-ring-buffer.test.ts` | **New** — full test coverage per Phase 4                              |
| `src/services/__tests__/index.test.ts`               | Updated assertions for ring buffer integration                        |
| `src/socket/__tests__/handlers.test.ts`              | Regression + connect-serve-from-buffer tests                          |

### Frontend

None. The event names, payload shapes, and chunking behaviour are identical.
The frontend cannot tell the difference between data that came from a DB query
and data that came from a ring buffer.

---

## Definition of Done

- [ ] `just ci` passes (all linting, TypeScript, tests).
- [ ] `handleConnect()` contains no calls to `grabMostRecent()` or `searchAlerts()`.
- [ ] No `enrichMessages()` call in `handleConnect()`.
- [ ] `pushMessage()` / `pushAlert()` called in `setupMessageQueue()` after enrichment.
- [ ] `warmMessageBuffers()` called during startup sequence before socket drain.
- [ ] Ring buffer capacity defaults: 250 messages, 100 alerts.
- [ ] Alert deduplication by UID in `pushAlert()`.
- [ ] All new functions have test coverage.
- [ ] Regression test confirms `grabMostRecent` is not called during connect.
- [ ] Memory footprint of both buffers together does not exceed 2 MB under
      normal message sizes (validate in test with realistic payloads).
