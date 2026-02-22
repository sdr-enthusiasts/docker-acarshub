# ACARS Hub — Socket.IO API Parity Reference

## Purpose

This document describes the complete Socket.IO API surface of ACARS Hub, comparing the
original Python backend (`rootfs/webapp/acarshub.py`) with the Node.js replacement
(`acarshub-backend/src/socket/handlers.ts`). It is the authoritative reference for
confirming that the Node.js backend is a safe drop-in replacement before removing the
Python backend from the codebase.

**Parity status key**:

| Symbol | Meaning                                                      |
| ------ | ------------------------------------------------------------ |
| ✅     | Fully implemented, wire-format identical                     |
| ⚠️     | Implemented, known behavioural difference (documented below) |
| ❌     | Not implemented in Node.js                                   |
| 🆕     | Node.js-only addition (not in Python)                        |

---

## Event Inventory

### Client → Server (incoming handlers)

All handlers are registered on the `/main` Socket.IO namespace.

| Event                      | Python location                                     | Node.js location                               | Parity              |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------- | ------------------- |
| `connect`                  | `acarshub.py:1140` `main_connect()`                 | `handlers.ts` `handleConnect()`                | ✅                  |
| `update_alerts`            | `acarshub.py:1404` `update_alerts()`                | `handlers.ts` `handleUpdateAlerts()`           | ✅                  |
| `regenerate_alert_matches` | `acarshub.py:1423` `regenerate_alert_matches()`     | `handlers.ts` `handleRegenerateAlertMatches()` | ✅                  |
| `request_status`           | `acarshub.py:1492` `request_status()`               | `handlers.ts` `handleRequestStatus()`          | ✅                  |
| `signal_freqs`             | `acarshub.py:1516` `request_freqs()`                | `handlers.ts` `handleSignalFreqs()`            | ✅                  |
| `signal_count`             | `acarshub.py:1527` `request_count()`                | `handlers.ts` `handleSignalCount()`            | ✅                  |
| `request_recent_alerts`    | `acarshub.py:1545` `handle_recent_alerts_request()` | `handlers.ts` `handleRequestRecentAlerts()`    | ✅                  |
| `signal_graphs`            | `acarshub.py:1670` `request_graphs()`               | `handlers.ts` `handleSignalGraphs()`           | ⚠️ see §Differences |
| `rrd_timeseries`           | `acarshub.py:1697` `request_rrd_timeseries()`       | `handlers.ts` `handleRRDTimeseries()`          | ✅                  |
| `query_search`             | `acarshub.py:1841` `handle_message()`               | `handlers.ts` `handleQuerySearch()`            | ✅                  |
| `query_alerts_by_term`     | `acarshub.py:1877` `handle_alerts_by_term()`        | `handlers.ts` `handleQueryAlertsByTerm()`      | ✅                  |
| `reset_alert_counts`       | `acarshub.py:1952` `reset_alert_counts()`           | —                                              | ❌ see §Differences |
| `alert_term_query`         | —                                                   | `handlers.ts` `handleAlertTermQuery()`         | 🆕 see §Differences |
| `disconnect`               | `acarshub.py:1977` `main_disconnect()`              | `handlers.ts` (inline)                         | ✅                  |

### Server → Client (emitted events)

#### On `connect` sequence

Both backends emit the following events to the connecting client in order:

| Event                 | Python                         | Node.js                                        | Shape                                                                                       | Parity              |
| --------------------- | ------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------- |
| `features_enabled`    | `acarshub.py:1154`             | `handlers.ts`                                  | `{acars, vdlm, hfdl, imsl, irdm, allow_remote_updates, adsb:{enabled,lat,lon,range_rings}}` | ✅                  |
| `terms`               | `acarshub.py:1173`             | `handlers.ts`                                  | `{terms: string[], ignore: string[]}`                                                       | ✅                  |
| `labels`              | `acarshub.py:1190`             | `handlers.ts`                                  | `{labels: {[id: string]: {name: string}}}`                                                  | ✅                  |
| `adsb_aircraft`       | `acarshub.py:1206` (if cached) | `handlers.ts` (if ADS-B enabled + data cached) | `{aircraft: AdsbAircraft[]}`                                                                | ✅                  |
| `acars_msg_batch`     | `acarshub.py:1264`             | `handlers.ts`                                  | `{messages: AcarsMsg[], loading: boolean, done_loading: boolean}`                           | ✅                  |
| `database`            | `acarshub.py:1287`             | `handlers.ts`                                  | `{count: number, size: number}`                                                             | ✅                  |
| `signal`              | `acarshub.py:1297`             | `handlers.ts`                                  | `{levels: {[decoder: string]: [{level: number, count: number}]}}`                           | ✅                  |
| `alert_terms`         | `acarshub.py:1308`             | `handlers.ts`                                  | `{data: {[index: number]: {count: number, id: number, term: string}}}`                      | ✅                  |
| `alert_matches_batch` | `acarshub.py:1358`             | `handlers.ts`                                  | `{messages: AcarsMsg[], loading: boolean, done_loading: boolean}`                           | ✅                  |
| `acarshub_version`    | `acarshub.py` (inline)         | `handlers.ts`                                  | `{container_version: string, github_version: string, is_outdated: boolean}`                 | ⚠️ see §Differences |

#### On demand (response to client requests)

| Trigger event           | Emitted event             | Direction   | Python             | Node.js       | Parity              |
| ----------------------- | ------------------------- | ----------- | ------------------ | ------------- | ------------------- |
| `request_status`        | `system_status`           | → requester | `acarshub.py:1504` | `handlers.ts` | ✅                  |
| `signal_freqs`          | `signal_freqs`            | → requester | `acarshub.py:1519` | `handlers.ts` | ✅                  |
| `signal_count`          | `signal_count`            | → requester | `acarshub.py:1531` | `handlers.ts` | ✅                  |
| `signal_graphs`         | `alert_terms`             | → requester | `acarshub.py:1674` | `handlers.ts` | ⚠️ see §Differences |
| `signal_graphs`         | `signal`                  | → requester | `acarshub.py:1681` | `handlers.ts` | ⚠️ see §Differences |
| `rrd_timeseries`        | `rrd_data`                | → requester | `acarshub.py:1756` | `handlers.ts` | ✅                  |
| `query_search`          | `database_search_results` | → requester | `acarshub.py:1860` | `handlers.ts` | ✅                  |
| `query_alerts_by_term`  | `database_search_results` | → requester | `acarshub.py:1940` | `handlers.ts` | ✅                  |
| `request_recent_alerts` | `recent_alerts`           | → requester | `acarshub.py:1640` | `handlers.ts` | ✅                  |
| `request_recent_alerts` | `recent_alerts_done`      | → requester | `acarshub.py:1648` | `handlers.ts` | ✅                  |
| `alert_term_query`      | `database_search_results` | → requester | —                  | `handlers.ts` | 🆕                  |
| `reset_alert_counts`    | `alert_terms`             | → broadcast | `acarshub.py:1963` | —             | ❌                  |

#### Broadcast events (background services)

| Event                               | Trigger                               | Python                     | Node.js                                       | Parity |
| ----------------------------------- | ------------------------------------- | -------------------------- | --------------------------------------------- | ------ |
| `acars_msg`                         | New message decoded from TCP listener | `acarshub.py:504`          | `handlers.ts` broadcast in `registerHandlers` | ✅     |
| `adsb_aircraft`                     | ADS-B poll cycle                      | `acarshub.py:343`          | `services/adsb-poller.ts`                     | ✅     |
| `system_status`                     | Scheduled task (1 s)                  | `acarshub.py:525`          | `services/stats-pruning.ts` broadcast         | ✅     |
| `update_alerts` → `terms`           | `update_alerts` received              | `acarshub.py` (broadcasts) | `handlers.ts` `handleUpdateAlerts`            | ✅     |
| `regenerate_alert_matches_started`  | `regenerate_alert_matches` received   | `acarshub.py:122`          | `handlers.ts`                                 | ✅     |
| `regenerate_alert_matches_complete` | Worker finishes                       | `acarshub.py:125`          | `handlers.ts`                                 | ✅     |
| `regenerate_alert_matches_error`    | Worker throws                         | `acarshub.py:142`          | `handlers.ts`                                 | ✅     |

---

## Known Behavioural Differences

### `signal_graphs` — socket-targeted vs. broadcast

**Python** (`acarshub.py:1674`): emits `alert_terms` and `signal` with `to=requester`
(i.e., only the requesting socket receives the events).

**Node.js** (`handlers.ts` `handleSignalGraphs`): emits `alert_terms` and `signal` with
`socket.emit(...)` (also targeted to the requesting socket only).

**Verdict**: ✅ Behaviour is identical — both target only the requesting socket. The
comment in the plan doc was based on an earlier draft; the implementation is correct.

---

### `acarshub_version.github_version` — always `"unknown"` in Node.js

**Python**: fetches the latest GitHub release tag via an HTTP request to the GitHub API
at startup and caches it in `latest_version`. If the request fails, falls back to
`"unknown"`. The `is_outdated` flag compares the cached value against the running
container version.

**Node.js** (`handlers.ts`): always returns `github_version: "unknown"` and
`is_outdated: false`. The GitHub version check has not been ported because it requires
an outbound HTTP call on every connect (a latency risk) and the information it provides
is low-value in a self-hosted context.

**Impact on frontend**: The "Update Available" banner in the UI will never appear in the
Node.js backend. This is an intentional simplification.

**Verdict**: ⚠️ Acceptable regression. Can be added later if required.

---

### `reset_alert_counts` — not implemented in Node.js

**Python** (`acarshub.py:1952`): guarded by `ALLOW_REMOTE_UPDATES`; calls
`reset_alert_counts()` in the database layer and broadcasts updated `alert_terms` to all
clients.

**Node.js**: the database-layer function `resetAlertCounts()` exists in
`db/queries/alerts.ts` but the Socket.IO handler was never wired up because no frontend
code was found that emits `reset_alert_counts`. A search of the React source confirms
the event is never sent from the UI.

**Verdict**: ❌ Not a regression in practice — the frontend does not use this event. If
the feature is needed, the handler can be added in a single commit.

---

### `alert_term_query` — Node.js addition

**Python**: no handler exists for this event.

**Node.js** (`handlers.ts` `handleAlertTermQuery`): accepts `{icao, flight, tail}` and
returns `database_search_results` for the matching aircraft. This handler was added
during the Node.js migration to support the alert-detail view in the frontend.

**Verdict**: 🆕 Additive. No Python removal risk.

---

### `update_alerts` — silent return vs. explicit no-op

**Python**: when `ALLOW_REMOTE_UPDATES=false`, logs an error and returns without
broadcasting. The client receives no acknowledgement.

**Node.js**: identical behaviour — logs and returns without emitting. The silent-return
contract is validated by the integration test `5.1.3 — update_alerts`.

**Verdict**: ✅ Identical.

---

## Message Enrichment Field Map

The Python backend's `acars_formatter.py` writes messages into the database using a
flat, snake_case schema. When reading messages back out, `acarshub_database.py` passes
them through `update_keys()` to rename camelCase column names to the wire-format names
expected by the frontend.

The Node.js backend stores messages in camelCase (matching the Drizzle ORM schema) and
applies `enrichMessage()` (`formatters/enrichment.ts`) before emitting them.

The table below maps every `update_keys()` rename to its `enrichMessage()` equivalent.

| DB column (camelCase)  | Wire name (snake_case)                                   | Python `update_keys` | Node `enrichMessage` |
| ---------------------- | -------------------------------------------------------- | -------------------- | -------------------- |
| `messageType`          | `message_type`                                           | ✅                   | ✅                   |
| `stationId`            | `station_id`                                             | ✅                   | ✅                   |
| `msg_text`             | `text`                                                   | ✅                   | ✅                   |
| `time`                 | `timestamp`                                              | ✅                   | ✅                   |
| `blockId`              | `block_id`                                               | ✅                   | ✅                   |
| `isResponse`           | `is_response`                                            | ✅                   | ✅                   |
| `isOnground`           | `is_onground`                                            | ✅                   | ✅                   |
| `aircraftId`           | `aircraft_id`                                            | ✅                   | ✅                   |
| `icao` (numeric)       | `icao_hex` (6-char uppercase hex)                        | ✅                   | ✅                   |
| `toaddr` (numeric)     | `toaddr_hex` + optional `toaddr_decoded`                 | ✅                   | ✅                   |
| `fromaddr` (numeric)   | `fromaddr_hex` + optional `fromaddr_decoded`             | ✅                   | ✅                   |
| `label`                | `label_type` (lookup from labels map)                    | ✅                   | ✅                   |
| `flight`               | `airline`, `iata_flight`, `icao_flight`, `flight_number` | ✅                   | ✅                   |
| `null` / `""` fields   | stripped (except protected fields)                       | ✅                   | ✅                   |
| `matched` (alert flag) | preserved as-is                                          | ✅                   | ✅                   |

**Protected fields** (never stripped even when `null` / `""`):

| Field          | Reason                                                              |
| -------------- | ------------------------------------------------------------------- |
| `uid`          | Required for deduplication in the frontend store                    |
| `message_type` | Required for decoder routing                                        |
| `text`         | Required so the decoder can distinguish "no text" from "not loaded" |
| `timestamp`    | Required for time display                                           |
| `matched`      | Required for alert badge rendering                                  |

---

## Confirmed Safe to Remove — Python File Inventory

The following files in `rootfs/webapp/` are fully replaced by the Node.js backend and
can be deleted once `just test-e2e-fullstack` passes with a green exit code.

| Python file                  | Node.js replacement                        | Notes                                                            |
| ---------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `acarshub.py`                | `src/socket/handlers.ts` + `src/server.ts` | Main Flask app and all Socket.IO handlers                        |
| `acars_formatter.py`         | `src/formatters/`                          | Message format normalisation for ACARS, VDL-M2, HFDL, IMSL, IRDM |
| `acarshub_database.py`       | `src/db/queries/`                          | All database query functions                                     |
| `acarshub_configuration.py`  | `src/config.ts`                            | Environment variable parsing and defaults                        |
| `acarshub_helpers.py`        | `src/utils/`                               | Utility helpers (enrichment, address decoding, airline lookup)   |
| `acarshub_logging.py`        | `src/utils/logger.ts`                      | Structured logging                                               |
| `acarshub_metrics.py`        | `src/db/queries/statistics.ts`             | Signal level and error metrics                                   |
| `acarshub_query_builder.py`  | `src/db/queries/messages.ts`               | Dynamic search query construction                                |
| `acarshub_query_profiler.py` | —                                          | Debug profiler, not needed in production                         |
| `acarshub_rrd_database.py`   | `src/services/rrd.ts`                      | RRD read/write operations                                        |
| `SafeScheduler.py`           | `src/services/stats-pruning.ts`            | Background scheduled tasks                                       |
| `migrations/`                | `drizzle/` + `src/db/migrate.ts`           | Schema migrations (Alembic → Drizzle)                            |

**Do NOT delete** until all of the following are true:

- [ ] `just ci` passes (all 1,059+ unit tests green)
- [ ] `just test-e2e-docker` passes (580+ E2E slots, 0 unexpected failures)
- [ ] `just test-e2e-fullstack` passes (full Docker stack, Playwright against real backend)
- [ ] All items in the Phase 5 success metrics checklist are ticked
- [ ] No ❌ items remain in the event inventory table above that affect the running frontend

---

## Unresolved Items

| Item                                                 | Status                                         | Priority |
| ---------------------------------------------------- | ---------------------------------------------- | -------- |
| `reset_alert_counts` handler not in Node.js          | Frontend never emits this event; safe to defer | Low      |
| `acarshub_version.github_version` always `"unknown"` | Intentional simplification                     | Low      |
| `acarshub_query_profiler.py` has no Node equivalent  | Debug-only file, not needed                    | None     |
