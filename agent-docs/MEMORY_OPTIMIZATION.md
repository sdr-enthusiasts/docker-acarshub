# ACARS Hub - Memory Optimization: Time-Series Reduction

## Overview

This document describes the plan for reducing backend memory usage by replacing
the current all-periods pre-computed in-memory cache with a targeted,
on-demand query model that only materialises data when a client actually needs
it.

Companion branch: `memory/timeseries-reduction`

---

## Problem Statement

### Current Architecture

`timeseries-cache.ts` maintains 8 `TimeSeriesResponse` objects in a module-level
`Map<TimePeriod, TimeSeriesResponse>`. Each entry is refreshed on a
wall-clock-aligned schedule and broadcast to all connected clients:

| Period | Downsample | Points sent to chart | Raw DB rows scanned | JS heap (chart data)                                   |
| ------ | ---------- | -------------------- | ------------------- | ------------------------------------------------------ |
| 1hr    | 60 s       | 60                   | 60                  | ~50 KB                                                 |
| 6hr    | 60 s       | 360                  | 360                 | ~290 KB                                                |
| 12hr   | 60 s       | 720                  | 720                 | ~580 KB                                                |
| 24hr   | 300 s      | 288                  | 1,440               | ~230 KB                                                |
| 1wk    | 1800 s     | 336                  | 10,080              | ~270 KB                                                |
| 30day  | 3600 s     | 720                  | 43,200              | ~580 KB                                                |
| 6mon   | 21600 s    | 730                  | 262,800             | ~590 KB                                                |
| 1yr    | 43200 s    | 730                  | **525,600**         | ~590 KB steady-state, **~420 MB spike** during rebuild |

The `1yr` period is the critical problem. At full retention (3 years of data
stored, 1-year window requested) `buildTimeSeriesResponse` executes a GROUP BY
AVG over up to **1.5 million rows**, allocates up to **525,600 JavaScript
objects**, then replaces the previous cache entry every 12 hours. This is a
large, predictable heap spike on any install that has been running for more
than a few months.

The other 7 periods are bounded and individually reasonable, but they share the
same structural problem: data is computed whether or not any client is viewing
the Stats page.

### Root Cause

The cache was introduced to solve a real problem: the original design queried
the database on every socket request (once per connected client, per
time-period change), which was slow on ARM hardware for the 1yr GROUP BY AVG.
The fix over-corrected by pre-computing **all** periods eagerly and holding
them forever.

---

## Goal

Replace the pre-computed 8-entry cache with a **query-on-demand model** that:

1. Runs a database query only when a client requests a specific period.
2. Caps the number of data points returned to a chart-appropriate maximum per
   period, regardless of how much raw data exists in the database.
3. Does not hold large result sets in memory between requests.
4. Preserves the push-on-refresh behaviour for **short** windows (1hr, 6hr,
   12hr) where fresh data arrives every minute and the client benefits from
   live updates without re-requesting.

---

## Key Insight: Charts Have a Pixel Budget

A `TimeSeriesChart` renders into a responsive container. On the largest
realistic display (2560 px wide) the chart canvas is at most ~1200 px wide.
Chart.js draws one pixel column per data point when fully zoomed out. Sending
more points than the pixel width of the canvas provides **no visual benefit**
and only wastes memory and bandwidth.

### Maximum Useful Points Per Period

| Period  | Chart points (current) | Raw rows scanned (current) | Proposed change                                        |
| ------- | ---------------------- | -------------------------- | ------------------------------------------------------ |
| 1hr     | 60                     | 60                         | None (warm tier, always cached)                        |
| 6hr     | 360                    | 360                        | None (warm tier, always cached)                        |
| 12hr    | 720                    | 720                        | None (warm tier, always cached)                        |
| 24hr    | 288                    | 1,440                      | Lazy tier: cached for 5 min after first request        |
| 1wk     | 336                    | 10,080                     | Lazy tier: cached for 30 min after first request       |
| 30day   | 720                    | 43,200                     | Lazy tier: cached for 1 hr after first request         |
| 6mon    | 730                    | 262,800                    | Query-only: never cached, discarded after response     |
| **1yr** | **730**                | **525,600**                | **Query-only: never cached, discarded after response** |

The point counts produced by the current `PERIOD_CONFIG` downsample settings
are already appropriate for Chart.js rendering — no further reduction is needed.
The problem is structural: `buildTimeSeriesResponse` for `1yr` executes a
GROUP BY AVG over up to 525,600 raw 1-minute rows to produce those 730 output
points, then materialises the full result as JavaScript objects on a 12-hour
timer regardless of whether any client is looking at the 1yr chart.

The fix is therefore **not** about reducing point count. It is about:

1. Eliminating the eager rebuild for long-window periods when no client has
   requested them.
2. Keeping results in memory only as long as they are needed, not forever.

For the short windows (1hr → 12hr) the point counts and raw row scans are both
small. Holding them warm and pushing live updates every 60 seconds is correct
and efficient — those periods should not change.

---

## Proposed Architecture

### Tier 1 — Warm Push Cache (short windows: 1hr, 6hr, 12hr)

These three periods together hold at most 1,140 data points (~920 KB). They
are refreshed every 60 seconds. The existing push model is correct and
efficient for these. **No change.**

### Tier 2 — Lazy Query Cache with TTL (medium windows: 24hr, 1wk, 30day)

These periods change slowly (new data = 1 row / minute; visible change at the
trailing edge only). They should be:

- Queried from the database only when a client requests them via
  `rrd_timeseries` socket event.
- Cached in memory for a short TTL (equal to the current `refreshIntervalMs`
  for that period) so that multiple simultaneous clients hitting the same
  period share one query result.
- Evicted automatically when the TTL expires; not refreshed on a timer unless
  at least one client has requested the period since the last eviction.

### Tier 3 — Query-Only, No Cache (long windows: 6mon, 1yr)

These periods are slow to query (GROUP BY AVG over millions of rows) but
requested rarely (only when the user navigates to the Stats page and picks
one of these views). They should be:

- Queried on demand only.
- **Not** held in memory between requests.
- Results streamed to the requesting client and discarded after transmission.
- The backend does **not** broadcast these unsolicited.

---

## Implementation Plan

### Phase 1 — Backend: Split Cache Tiers

**File: `acarshub-backend/src/services/timeseries-cache.ts`**

Introduce a `TIER` classification in `PERIOD_CONFIG`:

```typescript
export type CacheTier = "warm" | "lazy" | "query-only";

export interface PeriodConfig {
  startOffset: number;
  downsample: number;
  refreshIntervalMs: number;
  tier: CacheTier;
}
```

Assign tiers:

```typescript
"1hr":   { tier: "warm",       refreshIntervalMs: 60_000    },
"6hr":   { tier: "warm",       refreshIntervalMs: 60_000    },
"12hr":  { tier: "warm",       refreshIntervalMs: 60_000    },
"24hr":  { tier: "lazy",       refreshIntervalMs: 300_000   },
"1wk":   { tier: "lazy",       refreshIntervalMs: 1_800_000 },
"30day": { tier: "lazy",       refreshIntervalMs: 3_600_000 },
"6mon":  { tier: "query-only", refreshIntervalMs: 0         },
"1yr":   { tier: "query-only", refreshIntervalMs: 0         },
```

Changes to `initTimeSeriesCache()`:

- Only warm `tier === "warm"` periods at startup.
- Only arm refresh timers for `tier === "warm"` periods.
- Do not touch `tier === "lazy"` or `tier === "query-only"` at startup.

Add a `LazyCache` structure alongside the existing `warm` cache Map:

```typescript
interface LazyCacheEntry {
  response: TimeSeriesResponse;
  expiresAt: number; // Date.now() + refreshIntervalMs
}

const lazyCache = new Map<TimePeriod, LazyCacheEntry>();
```

Add `getOrQueryTimeSeries(period)`:

- For `"warm"` → read from existing warm `cache` Map (unchanged path).
- For `"lazy"` → check `lazyCache`; if hit and not expired, return cached
  entry; if miss or expired, query DB, store in `lazyCache` with TTL, return.
- For `"query-only"` → always query DB, never store result.

**File: `acarshub-backend/src/socket/handlers.ts`**

Change `handleRRDTimeseries()` to call `getOrQueryTimeSeries(period)` instead
of `getCachedTimeSeries(period)`. The response shape is identical to what the
frontend already expects — no frontend changes required for the data format.

Remove the `"cache warming up — retry"` error path for `"query-only"` periods
(they are always served fresh).

**File: `acarshub-backend/src/services/index.ts`**

`setupScheduledTasks()` currently calls no timeseries functions directly — the
warm-tier timers are self-arming inside `timeseries-cache.ts`. No change
needed here.

The broadcaster for warm-tier pushes remains unchanged. Lazy and query-only
periods are never broadcast unsolicited; they are served only as
request/response.

### Phase 2 — Frontend: Remove Warm-Up Requests for Long Periods

**File: `acarshub-react/src/hooks/useSocketIO.ts`**

The `connect` handler currently requests all 8 periods on every connect:

```typescript
for (const period of ALL_TIME_PERIODS) {
  socket.emit("rrd_timeseries", { time_period: period }, "/main");
}
```

Change this to request only warm-tier periods on connect (so the Stats page
loads instantly for the common short-window views). Long-period requests should
only be sent when the user explicitly selects that time period in the UI.

```typescript
const WARM_PERIODS: readonly TimePeriod[] = ["1hr", "6hr", "12hr"];

for (const period of WARM_PERIODS) {
  socket.emit("rrd_timeseries", { time_period: period }, "/main");
}
```

**File: `acarshub-react/src/hooks/useRRDTimeSeriesData.ts`**

The hook is currently a pure store selector (no socket emit). It needs to
become active for non-warm periods: emit `rrd_timeseries` when the requested
period is not yet in the cache **and** the period is not a warm-tier period.

```typescript
useEffect(() => {
  if (entry === undefined && !WARM_PERIODS.includes(timePeriod)) {
    socket.emit("rrd_timeseries", { time_period: timePeriod }, "/main");
  }
}, [timePeriod, entry]);
```

This means:

- Warm periods: pre-fetched on connect, kept live by push updates. Hook is
  still a pure selector for those.
- Lazy / query-only periods: requested on first render of a component that
  needs them, served as a one-shot response.

The return shape (`data`, `loading`, `error`, `timeRange`) does not change.

**File: `acarshub-react/src/types/timeseries.ts`**

Add the `WARM_PERIODS` constant so both `useSocketIO` and `useRRDTimeSeriesData`
import from the same source of truth rather than duplicating the literal:

```typescript
export const WARM_PERIODS: readonly TimePeriod[] = [
  "1hr",
  "6hr",
  "12hr",
] as const;
```

### Phase 3 — Tests

Every changed module needs updated or new tests.

**Backend tests to update/add:**

- `timeseries-cache.test.ts`
  - `initTimeSeriesCache` only warms tier-1 periods.
  - Timers are only armed for tier-1 periods.
  - `getOrQueryTimeSeries` returns warm-cache hit for tier-1.
  - `getOrQueryTimeSeries` queries DB and populates lazyCache on first call for
    tier-2 period.
  - `getOrQueryTimeSeries` returns lazyCache hit before TTL expiry for tier-2.
  - `getOrQueryTimeSeries` re-queries DB after TTL expiry for tier-2.
  - `getOrQueryTimeSeries` always queries DB for tier-3, never caches.
  - `resetCacheForTesting` also clears `lazyCache`.

- `handlers.test.ts` (socket)
  - `handleRRDTimeseries` serves warm period from cache.
  - `handleRRDTimeseries` serves lazy period via query-then-cache path.
  - `handleRRDTimeseries` serves query-only period directly (no cache side
    effect).

**Frontend tests to update/add:**

- `useSocketIO.test.ts`
  - On `connect`, only warm-tier `rrd_timeseries` requests are emitted.
  - Non-warm period requests are NOT emitted on connect.

- `useRRDTimeSeriesData.test.ts`
  - For a warm period with no cache entry, hook returns `loading: true` and
    does NOT emit a socket request (rely on connect pre-fetch).
  - For a non-warm period with no cache entry, hook emits `rrd_timeseries`.
  - For a non-warm period with a cache entry, hook returns data and does NOT
    re-emit.
  - Regression: switching from a warm to a non-warm period while the non-warm
    period is already cached does not emit a duplicate request.

---

## API Contract — No Breaking Change

The `rrd_timeseries_data` event payload shape (`TimeSeriesResponse`) is
unchanged. The frontend does not need to know which tier a period belongs to.
From the frontend's perspective:

- Short periods arrive automatically (push) — behaviour unchanged.
- Long periods arrive as a request/response pair when the user selects them —
  same as today except the request is now emitted lazily from the hook
  rather than eagerly from `useSocketIO` on every connect.

The `rrd_timeseries` request event shape is also unchanged (`{ time_period }`).

---

## Memory Impact After Change

| Period | Before                        | After                                                  |
| ------ | ----------------------------- | ------------------------------------------------------ |
| 1hr    | always in RAM                 | always in RAM (warm)                                   |
| 6hr    | always in RAM                 | always in RAM (warm)                                   |
| 12hr   | always in RAM                 | always in RAM (warm)                                   |
| 24hr   | always in RAM                 | in RAM for 5 min after last request, then evicted      |
| 1wk    | always in RAM                 | in RAM for 30 min after last request, then evicted     |
| 30day  | always in RAM                 | in RAM for 1 hr after last request, then evicted       |
| 6mon   | always in RAM                 | never cached; discarded after each response            |
| 1yr    | **~420 MB spike every 12 hr** | **zero baseline; ~1 MB spike per request, gone on GC** |

Steady-state backend heap saving on a long-running install:

- Eliminates the 12-hourly 1yr GROUP BY AVG rebuild (the largest single
  allocation event in the entire backend).
- Eliminates permanent in-memory storage of 6 of the 8 period caches.
- Warm-tier steady state remains at ~920 KB (unchanged, always was small).

---

## Files Changed

### Backend

| File                                    | Change                                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/timeseries.ts`               | Add `CacheTier` type; add `tier` field to `PeriodConfig`; add `WARM_PERIODS` constant                                                  |
| `src/services/timeseries-cache.ts`      | Tiered init; `lazyCache` Map with TTL; `getOrQueryTimeSeries()`; remove eager init for non-warm periods; update `resetCacheForTesting` |
| `src/socket/handlers.ts`                | `handleRRDTimeseries` calls `getOrQueryTimeSeries` instead of `getCachedTimeSeries`                                                    |
| `src/services/timeseries-cache.test.ts` | New tier-aware tests (see Phase 3)                                                                                                     |
| `src/socket/handlers.test.ts`           | Updated handler tests for all three tier paths                                                                                         |

### Frontend

| File                                               | Change                                                 |
| -------------------------------------------------- | ------------------------------------------------------ |
| `src/types/timeseries.ts`                          | Export `WARM_PERIODS` constant                         |
| `src/hooks/useSocketIO.ts`                         | Connect handler requests only warm periods             |
| `src/hooks/useRRDTimeSeriesData.ts`                | Emit socket request for non-warm periods on cache miss |
| `src/hooks/__tests__/useSocketIO.test.ts`          | Updated connect-emit assertions                        |
| `src/hooks/__tests__/useRRDTimeSeriesData.test.ts` | New lazy-request tests                                 |

---

## Definition of Done

- [ ] `just ci` passes (all linting, TypeScript, tests).
- [ ] `initTimeSeriesCache` only allocates memory for the 3 warm periods.
- [ ] No refresh timer fires for `6mon` or `1yr` on a freshly started server.
- [ ] Requesting `1yr` from the Stats page returns data correctly.
- [ ] Requesting `1yr` a second time within the TTL window returns cached data
      for lazy tiers; returns a fresh query for query-only tiers.
- [ ] On reconnect, only 3 `rrd_timeseries` requests are emitted (not 8).
- [ ] All new code paths have test coverage per the Testing Mandate in
      `AGENTS.md`.
- [ ] The `1yr` rebuild no longer appears in backend logs on a 12-hour timer.
