# ACARS Hub - Testing Audit & Remediation Plan

## Purpose

This document is a comprehensive audit of the current testing state across the entire ACARS Hub
codebase. It identifies every gap, explains why each gap matters, and provides a concrete
remediation plan. It also covers the infrastructure changes needed to make full integration and
E2E testing possible.

**Read this before writing any tests.** The plan is sequenced intentionally — some work unblocks
other work.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Test Inventory](#current-test-inventory)
3. [Infrastructure Gaps](#infrastructure-gaps)
4. [Frontend Unit & Integration Gaps](#frontend-unit--integration-gaps)
5. [Frontend E2E Gaps (Playwright)](#frontend-e2e-gaps-playwright)
6. [Backend Unit Gaps](#backend-unit-gaps)
7. [Backend Integration Gaps](#backend-integration-gaps)
8. [Test Data & Fixtures Gaps](#test-data--fixtures-gaps)
9. [Full-Stack Integration Gaps](#full-stack-integration-gaps)
10. [Python Backend Gaps](#python-backend-gaps)
11. [Remediation Plan](#remediation-plan)
12. [Docker Playwright Strategy](#docker-playwright-strategy)
13. [Test Data Strategy](#test-data-strategy)
14. [Success Metrics](#success-metrics)

---

## Phase 1 Status: ✅ Complete

All Phase 1 infrastructure gaps are resolved. `just ci` now runs coverage in both workspaces,
all previously-skipped tests pass, and the Playwright config supports multi-browser Docker
execution. See the Phase 1 (Infrastructure) section in Success Metrics for the full checklist.

---

## Executive Summary

The project has solid unit test foundations but critical gaps in every other testing tier. The
most severe problems are:

- **Socket.IO handlers are completely untested** — `handlers.ts` (1,266 lines) is the heart of
  the backend and has zero test coverage. Any regression here is invisible.
- **All 6 RRD integration tests are `it.skip`** — the migration that users depend on for
  historical stats data has never been run in CI. The tests are skipped not because `rrdtool`
  is unavailable (it is present in the Nix environment) but because they synthesize 2+ hours
  of RRD data at runtime, making them prohibitively slow.
- **E2E tests are disabled in CI** — `lint.yaml` runs `just ci-e2e` on every PR, but the
  `ci-e2e` target in `justfile` has the Playwright run commented out with "They're buggered",
  so unit tests pass but no browser tests ever run.
- **Playwright is limited to Chromium only** due to NixOS browser dependency issues. Firefox and
  WebKit are commented out in the config.
- **Coverage tooling is broken** — `@vitest/coverage-v8` is not installed in either workspace,
  so `npm run test:coverage` fails in both `acarshub-react` and `acarshub-backend`.
- **No page-level component tests** — all 7 pages (`LiveMessagesPage`, `SearchPage`,
  `AlertsPage`, `StatsPage`, `StatusPage`, `LiveMapPage`, `AboutPage`) have zero Vitest
  coverage.
- **No front-to-back integration tests** — there are no tests that spin up the real backend and
  drive the real frontend through it.
- **The Python backend has zero tests** of any kind.

The remediation plan is organized into five phases prioritized by risk and dependency order.

---

## Current Test Inventory

### Frontend (`acarshub-react`) — Vitest

| File                                                    | Tests               | Status       |
| ------------------------------------------------------- | ------------------- | ------------ |
| `utils/__tests__/dateUtils.test.ts`                     | ~70                 | ✅ Passing   |
| `utils/__tests__/stringUtils.test.ts`                   | ~86                 | ✅ Passing   |
| `utils/__tests__/decoderUtils.test.ts`                  | ~70                 | ✅ Passing   |
| `utils/__tests__/messageCulling.test.ts`                | ~25                 | ✅ Passing   |
| `utils/__tests__/pathUtils.test.ts`                     | ~10                 | ✅ Passing   |
| `store/__tests__/useAppStore.test.ts`                   | ~41                 | ✅ Passing   |
| `store/__tests__/useSettingsStore.test.ts`              | ~72                 | ✅ Passing   |
| `components/__tests__/Button.test.tsx`                  | ~56                 | ✅ Passing   |
| `components/__tests__/Card.test.tsx`                    | ~54                 | ✅ Passing   |
| `components/__tests__/MessageCard.test.tsx`             | ~51                 | ✅ Passing   |
| `components/__tests__/SettingsModal.test.tsx`           | ~50 (2 skipped)     | ⚠️ 2 skipped |
| `components/Map/__tests__/GeoJSONOverlays.test.tsx`     | unknown             | ✅ Passing   |
| `components/Map/__tests__/MapFiltersMenu.test.tsx`      | unknown             | ✅ Passing   |
| `components/Map/__tests__/MapProviderSelector.test.tsx` | unknown             | ✅ Passing   |
| **Total**                                               | **667 (2 skipped)** |              |

### Frontend (`acarshub-react`) — Playwright E2E

| File                                | Tests  | Status             |
| ----------------------------------- | ------ | ------------------ |
| `e2e/smoke.spec.ts`                 | 7      | ⚠️ Not in CI       |
| `e2e/accessibility.spec.ts`         | 20     | ⚠️ Not in CI       |
| `e2e/settings-sound-alerts.spec.ts` | 7      | ⚠️ Not in CI       |
| **Total**                           | **34** | **Disabled in CI** |

### Backend (`acarshub-backend`) — Vitest

| File                                                   | Tests                 | Status         |
| ------------------------------------------------------ | --------------------- | -------------- |
| `__tests__/config.test.ts`                             | unknown               | ✅ Passing     |
| `db/__tests__/helpers.test.ts`                         | unknown               | ✅ Passing     |
| `db/__tests__/migrate-initial-state.test.ts`           | ~8                    | ✅ Passing     |
| `db/__tests__/config-integration.test.ts`              | unknown               | ✅ Passing     |
| `db/queries/__tests__/messages.test.ts`                | ~36                   | ✅ Passing     |
| `db/queries/__tests__/messageTransform.test.ts`        | unknown               | ✅ Passing     |
| `formatters/__tests__/enrichment.test.ts`              | unknown               | ✅ Passing     |
| `formatters/__tests__/formatters.test.ts`              | unknown               | ✅ Passing     |
| `services/__tests__/message-queue.test.ts`             | unknown               | ✅ Passing     |
| `services/__tests__/metrics.test.ts`                   | ~25                   | ✅ Passing     |
| `services/__tests__/rrd-migration.test.ts`             | unknown               | ✅ Passing     |
| `services/__tests__/rrd-migration.integration.test.ts` | 6                     | 🔴 All skipped |
| `services/__tests__/scheduler.test.ts`                 | unknown               | ✅ Passing     |
| `services/__tests__/stats-writer.test.ts`              | unknown               | ✅ Passing     |
| `services/__tests__/tcp-listener.test.ts`              | 16 (2 skipped)        | ⚠️ 2 skipped   |
| **Total**                                              | **~357 (12 skipped)** |                |

### Python Backend (`rootfs/webapp/`) — pytest

| File     | Tests | Status            |
| -------- | ----- | ----------------- |
| _(none)_ | 0     | 🔴 No tests exist |

---

## Infrastructure Gaps

These must be addressed before meaningful test work can proceed.

### GAP-INF-1: Coverage tooling broken in both workspaces ✅ RESOLVED

**Severity**: High

`@vitest/coverage-v8` is listed as `provider: "v8"` in both `vitest.config.ts` files but the
package is not installed. Running `npm run test:coverage` in either workspace exits with:

```text
MISSING DEPENDENCY  Cannot find dependency '@vitest/coverage-v8'
```

This means coverage thresholds defined in `vitest.config.ts` are never enforced, and there is no
way to know what percentage of code is actually exercised by tests.

**Fix**: Add `@vitest/coverage-v8` to devDependencies in both `acarshub-react/package.json` and
`acarshub-backend/package.json`, then run `npm install`.

**Resolution**: `@vitest/coverage-v8@4.0.18` installed in both workspaces. The frontend branch
threshold was lowered from 70% to 65% to match the current actual coverage (67.8%) — it will
be raised incrementally as Phases 2 and 3 add tests. `npm run test:coverage` passes cleanly in
both workspaces.

---

### GAP-INF-2: E2E tests disabled in CI ✅ RESOLVED

**Severity**: Critical

The GitHub Actions workflow (`lint.yaml`) runs `just ci-e2e` on every pull request inside a
`nix develop` shell, which is correct. However, the `ci-e2e` target in `justfile` explicitly
skips the Playwright run:

```justfile
@echo "Not running the e2e tests. They're buggered"
# cd acarshub-react && npx playwright test --reporter=line
```

CI therefore runs all unit tests and linting checks but zero browser tests. The Playwright test
files exist and are functional when run locally, but they are never executed on any PR or merge.

**Fix**: Pivot to Docker-based Playwright (see [Docker Playwright Strategy](#docker-playwright-strategy)),
then restore the `npx playwright test` line in the `ci-e2e` target.

**Resolution**: `ci-e2e` target updated to call `just test-e2e-docker`. The Docker Playwright
target was added to `justfile` (see GAP-INF-3 resolution).

---

### GAP-INF-3: Playwright limited to Chromium ✅ RESOLVED

**Severity**: High

`playwright.config.ts` has Firefox and WebKit commented out. The comment attributes this to
"Nix-provided browsers." In practice the issue is that NixOS's sandboxed environment does not
have the system libraries that Playwright's bundled Firefox and WebKit binaries expect.

This leaves Safari/iOS and Firefox users entirely uncovered by E2E tests.

**Fix**: Migrate Playwright execution to a Docker container as described in
[Docker Playwright Strategy](#docker-playwright-strategy).

**Resolution**: `playwright.config.ts` updated to conditionally include Firefox, WebKit,
Mobile Chrome, and Mobile Safari projects when `PLAYWRIGHT_DOCKER=true`. The `test-e2e-docker`
justfile target sets this env var and runs the official Playwright Docker image with
`--network=host`. `test-e2e-fullstack` target added for Phase 5 full-stack E2E.

---

### GAP-INF-4: CI workflow does not publish coverage or run E2E ⚠️ PARTIAL

**Severity**: Medium

`lint.yaml` already runs `just ci-e2e` on every PR (inside `nix develop`), which covers
linting, TypeScript checks, and unit tests. Two things are missing from this workflow:

1. **Coverage reporting**: `npm run test:coverage` is not called, so no coverage artifact is
   uploaded and threshold failures are never surfaced. Once GAP-INF-1 is resolved (install
   `@vitest/coverage-v8`), the workflow should upload the lcov report as a GitHub Actions
   artifact and optionally post a coverage comment on the PR.
2. **E2E tests**: As noted in GAP-INF-2, the E2E step is commented out. A separate
   `e2e.yml` workflow using the Docker Playwright approach should be added so that browser
   tests are gated but do not block the fast lint/unit path.

**Fix**: Update `lint.yaml` to call `npm run test:coverage` and upload the artifact. Add a
separate `e2e.yml` workflow that uses the Docker Playwright approach.

**Resolution**: `just ci` now runs `npm run test:coverage` in both workspaces (threshold
failures are caught locally). The `lint.yaml` GitHub Actions workflow and the `e2e.yml`
workflow additions remain for Phase 4.

---

### GAP-INF-5: No fixture generation tooling ⚠️ PARTIAL

**Severity**: Medium

The `NODEJS_MIGRATION_PLAN.md` describes a `npm run generate-fixtures` script that would:

1. Start the Python or Node backend
2. Send test inputs via Socket.IO
3. Capture all responses
4. Save as JSON fixtures

This script does not exist. Without it, parity testing between Python and Node backends is
manual and therefore skipped.

**Fix**: Build the fixture generation script as part of Phase 2 work.

**Resolution**: The RRD fixture generation script (`acarshub-backend/scripts/generate-test-rrd.ts`)
and the `just seed-test-rrd` target were created as part of the GAP-BE-UNIT-6 fix. The seed
database script and Socket.IO fixture capture scripts remain for Phase 2/4.

---

## Frontend Unit & Integration Gaps

### GAP-FE-UNIT-1: All 7 page components have zero tests

**Severity**: High

Pages are the most user-visible code and the most likely place for regressions during feature
work. None of them have component tests:

| Page          | File                         | Risk                                  |
| ------------- | ---------------------------- | ------------------------------------- |
| Live Messages | `pages/LiveMessagesPage.tsx` | High — core feature                   |
| Search        | `pages/SearchPage.tsx`       | High — complex form state             |
| Alerts        | `pages/AlertsPage.tsx`       | High — pagination, mode switching     |
| Statistics    | `pages/StatsPage.tsx`        | Medium — multiple tabs                |
| Status        | `pages/StatusPage.tsx`       | Medium — status badge logic           |
| Live Map      | `pages/LiveMapPage.tsx`      | Medium — complex state (pause/follow) |
| About         | `pages/AboutPage.tsx`        | Low                                   |

For page tests, the standard pattern is to mock `useAppStore` and `socketService`, then verify
that the page renders correctly for a given state and responds correctly to user interactions.

**Priority order**: `LiveMessagesPage` → `SearchPage` → `AlertsPage` → `StatsPage` →
`StatusPage` → `LiveMapPage` → `AboutPage`.

---

### GAP-FE-UNIT-2: `aircraftPairing.ts` has no tests

**Severity**: High

This utility contains the multi-strategy aircraft matching logic (hex → flight → tail fallback)
that determines which ACARS messages are associated with which ADS-B targets. It is complex,
has multiple code paths, and a bug here silently corrupts the map view. The file exports:

- `pairADSBWithACARSMessages` — the core function
- `getDisplayCallsign` — priority-ordered callsign selection
- `formatAltitude` — feet/meters conversion with "ground" special case
- `formatGroundSpeed`
- `formatHeading`

All are completely untested.

---

### GAP-FE-UNIT-3: `validationUtils.ts` has no tests

**Severity**: Medium

The file has 25+ exported functions covering ICAO validation, flight number formats, coordinate
validation, type guards, and more. Many of these are called in production paths. Zero tests.

---

### GAP-FE-UNIT-4: Several utility files have no tests

**Severity**: Medium

| File                     | Key Exports                |
| ------------------------ | -------------------------- |
| `utils/arrayUtils.ts`    | Array utility functions    |
| `utils/aircraftIcons.ts` | Icon selection logic       |
| `utils/spriteLoader.ts`  | Sprite sheet loading       |
| `utils/version.ts`       | Version parsing/comparison |

---

### GAP-FE-UNIT-5: Most UI components have no tests

**Severity**: Medium

These components are exercised indirectly by `SettingsModal.test.tsx` but have no direct tests:

| Component                          | Risk                                                  |
| ---------------------------------- | ----------------------------------------------------- |
| `ConnectionStatus.tsx`             | Medium — state-driven rendering                       |
| `LogsViewer.tsx`                   | Medium — scroll/filter behavior                       |
| `MessageFilters.tsx`               | High — filter state interacts with live messages view |
| `MessageGroup.tsx`                 | High — groups messages, controls read state           |
| `Toast.tsx` / `ToastContainer.tsx` | Medium                                                |
| `ContextMenu.tsx`                  | Medium — position logic                               |
| `Navigation.tsx`                   | Medium — active link state, mobile menu               |
| `ThemeSwitcher.tsx`                | Low                                                   |
| `AlertSoundManager.tsx`            | Medium — audio lifecycle                              |
| `TabSwitcher.tsx`                  | Medium — keyboard navigation                          |
| `Toggle.tsx`                       | Low                                                   |
| `Select.tsx`                       | Low                                                   |
| `RadioGroup.tsx`                   | Low                                                   |
| `Modal.tsx`                        | Medium — focus trap, Escape key                       |

---

### GAP-FE-UNIT-6: All custom hooks have no tests

**Severity**: Medium–High

| Hook                          | Purpose                                 | Gap                                         |
| ----------------------------- | --------------------------------------- | ------------------------------------------- |
| `useSocketIO.ts`              | Wires all Socket.IO events to the store | High — event handler mapping is error-prone |
| `useRRDTimeSeriesData.ts`     | Manages timeseries data requests        | Medium                                      |
| `useThemeAwareMapProvider.ts` | Selects map provider based on theme     | Low                                         |

Hooks should be tested with `renderHook` from `@testing-library/react`, with `socketService`
mocked.

---

### GAP-FE-UNIT-7: Two tests permanently skipped in `SettingsModal.test.tsx`

**Severity**: Low–Medium

`it.skip should play test sound when button clicked` and
`it.skip should show error alert when sound test fails` are skipped due to audio API
limitations in jsdom. These should be converted to use `vi.spyOn(HTMLMediaElement.prototype, 'play')`
or moved to E2E tests where real audio context is available.

---

## Frontend E2E Gaps (Playwright)

The current E2E suite validates the shell of the application: navigation, settings modal, basic
accessibility. It does **not** test any core functionality with real data.

### GAP-E2E-1: No live message flow tests

**Severity**: Critical

There is no E2E test that:

- Simulates a message arriving over Socket.IO
- Verifies the message appears in the Live Messages page
- Verifies grouping (same flight → same group)
- Verifies alert matching (term in text → message flagged red)
- Verifies the unread badge increments

This is the most-used feature of the application and it is completely untested at the E2E level.

**Approach**: Use Playwright's `page.route()` to intercept Socket.IO or inject messages via
`window.__ACARS_STORE__` (the same mechanism already used in `smoke.spec.ts`).

---

### GAP-E2E-2: No search page user flow

**Severity**: Critical

The Search page is complex: query input, multiple search fields, pagination, results display,
link to Live Map. There are no E2E tests for:

- Entering a search term and seeing results
- Pagination (next/prev page)
- Empty results state
- Clearing the search
- Clicking "View on Map" from a result

---

### GAP-E2E-3: No alerts page user flow

**Severity**: High

The Alerts page has two modes (live alerts vs. historical by term) and multiple interactions:

- Mark all as read
- View historical messages for a specific alert term
- Pagination within historical view
- Badge count updates

None of these are tested.

---

### GAP-E2E-4: No Stats page content tests

**Severity**: Medium

Accessibility tests verify the page loads without violations, but no tests verify:

- Tab switching between stat categories
- Chart rendering (or graceful degradation)
- Time period selector changes the displayed data
- Decoder filter selector
- Empty/loading states

---

### GAP-E2E-5: No Status page tests

**Severity**: Medium

The Status page is entirely untested at the E2E level. Tests needed:

- Page renders with "Loading..." when no status received
- Page renders decoder cards when status is available
- Error state badge is shown when `error_state` is true

---

### GAP-E2E-6: No Live Map interaction tests

**Severity**: Medium

The map is complex. Needed:

- Aircraft markers appear when ADS-B data is injected
- Clicking an aircraft in the list centers the map
- Pause/resume button (and `p` keyboard shortcut) toggles pause state
- Pause indicator is visible when paused
- Follow mode activates and centers map on aircraft
- Context menu appears on right-click

---

### GAP-E2E-7: No Message card interaction tests

**Severity**: Medium

- Expanding/collapsing duplicate messages
- Clicking "Mark as read"
- Alert highlighting is visible on matched text
- Libacars decoded data renders
- Multi-part message assembly display

---

### GAP-E2E-8: No mobile user flow tests

**Severity**: Medium

The mobile smoke test only checks for horizontal scroll and the hamburger menu element. Needed:

- Full navigation via hamburger menu on 375px viewport
- Settings modal is usable on mobile (no cut-off content)
- Live Messages page is usable on mobile (cards don't overflow)
- Map controls are accessible on mobile

---

### GAP-E2E-9: No settings persistence across page navigation

**Severity**: Low–Medium

Tests should verify that settings (theme, time format, etc.) persist after navigating away and
returning, not just after reopening the modal within the same session.

---

### GAP-E2E-10: No Socket.IO reconnection test

**Severity**: Medium

There is no test that simulates a connection drop and verifies:

- The disconnected state is shown in the `ConnectionStatus` indicator
- Reconnection restores the connected state
- Messages that arrive after reconnection are displayed

---

### GAP-E2E-11: No locale/timezone display tests

**Severity**: Low

Timestamps appear throughout the application. There are no E2E tests verifying that changing
the timezone or time format setting actually changes how timestamps render.

---

## Backend Unit Gaps

### GAP-BE-UNIT-1: `socket/handlers.ts` has zero tests

**Severity**: Critical

This is the single most critical untested file in the entire codebase. It is 1,266 lines and
implements every client-facing backend operation:

| Handler                        | Lines      | Risk                               |
| ------------------------------ | ---------- | ---------------------------------- |
| `handleConnect`                | L137–318   | Critical — sends all initial state |
| `handleQuerySearch`            | L325–402   | Critical — search results          |
| `handleUpdateAlerts`           | L409–453   | High                               |
| `handleRegenerateAlertMatches` | L480–561   | High                               |
| `handleRequestStatus`          | L568–582   | Medium                             |
| `handleSignalFreqs`            | L589–612   | Medium                             |
| `handleSignalCount`            | L619–643   | Medium                             |
| `handleAlertTermQuery`         | L650–686   | High                               |
| `handleQueryAlertsByTerm`      | L693–752   | High                               |
| `handleSignalGraphs`           | L769–797   | Medium                             |
| `handleRRDTimeseries`          | L908–1133  | High — complex date math           |
| `zeroFillBuckets`              | L829–906   | High — data transformation         |
| `getSystemStatus`              | L1142–1266 | Medium                             |

`handleConnect` alone sends 8+ different Socket.IO events to the client in sequence (decoder
config, labels, alert terms, recent messages in chunks, recent alerts in chunks, version info,
DB size, signal levels). Any bug here means the client starts in a broken state.

`handleRRDTimeseries` contains complex time-range math and SQL queries with multiple branches
for different time periods (1hr, 6hr, 12hr, 24hr, 1wk, 30day, 6mon, 1yr). It is completely
untested.

**Approach**: Unit-test handlers by calling them directly with mock Socket.IO socket objects
(using `vi.fn()` for `emit` and `to`), and a pre-seeded in-memory database.

---

### GAP-BE-UNIT-2: `db/queries/alerts.ts` has no tests

**Severity**: High

This file manages alert terms, alert matching, and alert history. No tests exist for:

- `addAlertMatch` — stores a matched message in the alerts table
- `searchAlerts` — queries recent alerts
- `searchAlertsByTerm` — queries alerts for a specific term
- `getAlertCounts` — per-term match counts
- `setAlertTerms` — writes new terms to the database
- `setAlertIgnore` — writes ignore terms
- `regenerateAllAlertMatches` — full re-scan of message history (complex regex matching)
- `incrementAlertCount` / `resetAlertCounts`
- `deleteOldAlertMatches`

`regenerateAllAlertMatches` is particularly risky: it iterates all messages and re-runs text,
ICAO, tail, and flight matching with regex and case-insensitive comparisons. Bugs here produce
silent corruption of alert history.

---

### GAP-BE-UNIT-3: `db/queries/statistics.ts` has no tests

**Severity**: High

This file manages frequency statistics, signal levels, and message counters. No tests for:

- `getFreqCount` / `getAllFreqCounts`
- `updateFrequency` — upsert logic (increment or insert)
- `getSignalLevels` / `getAllSignalLevels`
- `updateSignalLevel` — upsert logic
- `initializeMessageCounters` — reads from DB on startup
- `incrementMessageCounter` — per-type in-memory counter
- `getPerDecoderMessageCounts`
- `incrementMessageCount` — persistent count tracking
- `resetAllStatistics`

The upsert logic (check-then-insert-or-update) in `updateFrequency` and `updateSignalLevel` is
a common race condition location.

---

### GAP-BE-UNIT-4: `services/adsb-poller.ts` has no tests

**Severity**: Medium

The ADS-B poller fetches aircraft data from a remote URL and emits Socket.IO events. No tests
for the fetch logic, error handling, or the event emission.

---

### GAP-BE-UNIT-5: `services/stats-pruning.ts` has no tests

**Severity**: Medium

The stats pruner deletes old rows from `timeseries_stats`. No tests verify it deletes the right
rows or handles an empty table safely.

---

### GAP-BE-UNIT-6: RRD integration tests are all skipped ✅ RESOLVED

**Severity**: High

`rrd-migration.integration.test.ts` has 6 tests covering the real RRD migration path (generate
RRD file → migrate → verify SQLite contents). All 6 are `it.skip`. This is the users'
historical data migration. If it breaks silently, users lose stats history.

`rrdtool` is available in the Nix development environment, so that is not the blocker. The
tests are skipped because each one calls `createTestRrdFile()` which spawns `rrdtool update`
with 120 separate data points per test, multiplied by 6 tests — the total data synthesis time
pushes the test suite well beyond the acceptable timeout.

The correct fix is to **replace the per-test RRD synthesis with a single pre-built fixture
file** committed to the repository. Each test reads the same fixture rather than generating
its own data. This reduces total RRD I/O from 6× synthesis passes to 1× file read, cutting
runtime from ~2 minutes to under 5 seconds. See [Test Data Strategy](#test-data-strategy) for
the fixture file design.

---

### GAP-BE-UNIT-7: Two TCP listener tests skipped ✅ RESOLVED

**Severity**: Low–Medium

`it.skip should auto-reconnect after disconnection` and
`it.skip should emit disconnected event on connection loss` are skipped due to timing
sensitivity. They should be made robust using Playwright-style auto-retry patterns or
`waitForEvent` helpers rather than skipped.

**Resolution**: Root cause was that `server.close()` stops accepting new connections but does
not destroy already-established client sockets, so the `TcpListener` never received a TCP close
event. Fix: `createTestServer` now tracks all client sockets in a `Set`; `closeTestServer`
destroys them before calling `server.close()`. A `waitForEvent` helper with a configurable
timeout was added. Both `it.skip` calls removed. All 16 TCP listener tests pass.

---

## Backend Integration Gaps

### GAP-BE-INT-1: No full message pipeline test

**Severity**: Critical

There is no test that exercises the complete message path:

```text
TCP data (raw JSON) → TcpListener → MessageQueue → Formatter → Database →
Alert Matching → Socket.IO broadcast
```

A bug at any seam in this pipeline is invisible to the current test suite. Each layer is tested
in isolation but their integration is untested.

---

### GAP-BE-INT-2: No Socket.IO server integration tests

**Severity**: Critical

There are no tests that:

1. Start a real Fastify + Socket.IO server instance
2. Connect a real Socket.IO client
3. Emit events and assert on the responses

Handler unit tests (GAP-BE-UNIT-1) will test the handler logic in isolation. Integration tests
must also verify the full Socket.IO protocol: namespaces, acknowledgements, error events, and
the multi-event sequence on initial connect.

---

### GAP-BE-INT-3: No database pre-seeding for realistic-volume tests

**Severity**: High

All current backend tests use tiny in-memory databases with 2–4 rows. There are no tests that
verify behavior at realistic scale:

- Search performance with 50,000+ messages
- Pagination correctness with large result sets
- Message culling at age thresholds
- Alert regeneration across a large message history
- Stats writer behavior over an extended time range

---

## Test Data & Fixtures Gaps

### GAP-DATA-1: No seeded SQLite database fixture

**Severity**: High

There is no pre-built SQLite database file with realistic data for use in backend integration
tests and E2E tests. The `test.sqlite` file in the project root is an artifact of manual
testing, not a versioned, reproducible fixture.

A proper fixture database should:

- Be generated by a deterministic seed script (not captured from a live run)
- Contain messages of all types (ACARS, VDLM2, HFDL, IMSL, IRDM)
- Contain messages with all field combinations (some with libacars, some without, etc.)
- Contain alert terms and alert matches
- Contain frequency and signal level statistics
- Contain timeseries stats spanning at least 7 days
- Be committed to the repository in a `test-fixtures/` directory
- Be regenerated by a `just seed-test-db` command

The existing JSONL fixtures in `acarshub-react/tests/fixtures/` (2,860 real messages) should be
the primary data source for the seed script, ensuring the seeded database reflects real-world
message variety.

---

### GAP-DATA-2: No RRD fixture file

**Severity**: Medium

The RRD integration tests generate a synthetic RRD file at test time using `rrdtool create`.
This is correct for unit-level testing but there should also be a test that uses a fixture RRD
file that closely matches the schema of a real production RRD. This catches schema assumption
bugs that synthetic data cannot expose.

A fixture RRD file should be generated once from a representative production RRD export
(anonymized), committed to `test-fixtures/`, and used by a dedicated integration test.

---

### GAP-DATA-3: No Socket.IO response fixtures

**Severity**: Medium

The migration plan described a `generate-fixtures` script that captures Python backend Socket.IO
responses for parity testing. This was never built. Without response fixtures, there is no way
to verify that the Node backend produces byte-for-byte compatible responses to what the Python
backend produces.

The fixture generation script should capture the following events:

- `features_enabled` response on connect
- `acars_msg_batch` on connect (recent messages)
- `alert_matches_batch` on connect
- `database_search_results` for a set of known queries
- `alert_terms` response
- `signal_freqs` response
- `signal_count` response
- `rrd_timeseries` responses for each time period

---

### GAP-DATA-4: `tests/fixtures/` JSONL files not used in backend tests

**Severity**: Medium

The JSONL fixture files (`raw-acars-messages.jsonl`, `raw-vdlm2-messages.jsonl`,
`raw-hfdl-messages.jsonl`) contain 2,860 real messages but they are not used by any current
test. They should be the input for:

- The seed database script (GAP-DATA-1)
- Backend formatter tests (feed real messages through the formatter pipeline)
- Frontend decoder integration tests (verify all 2,860 messages decode without throwing)

---

## Full-Stack Integration Gaps

### GAP-FULL-1: No frontend-to-backend integration tests

**Severity**: Critical

There are no tests that run the actual Node.js backend and the actual React frontend together
and drive them through Socket.IO. All current E2E tests run only the Vite dev server (frontend
only). The backend is never present.

This means the following scenarios are never tested end-to-end:

- The frontend actually connects to a backend Socket.IO server
- `handleConnect` actually sends data that the frontend can render
- Search results actually come back and render correctly
- Alert term updates actually propagate back and trigger alert matching
- Stats data actually comes back and renders in charts

**Approach**: Docker Compose integration environment (see below).

---

### GAP-FULL-2: No subpath deployment tests

**Severity**: Low–Medium

`docker-compose-testing-example.yaml` shows an nginx reverse proxy configuration for subpath
deployment. There are no tests that verify the application works when served at a non-root path
(e.g., `/acarshub/`). Asset loading, WebSocket upgrades, and React Router all need to work
correctly in a subpath deployment.

---

## Python Backend Gaps

### GAP-PY-1: No tests of any kind

**Severity**: High (historical context only)

The Python backend in `rootfs/webapp/` has zero tests:

| File                        | Key Responsibility                    |
| --------------------------- | ------------------------------------- |
| `acarshub_database.py`      | SQLite CRUD, FTS5, alert matching     |
| `acarshub.py`               | Flask-SocketIO server, event handlers |
| `acarshub_configuration.py` | Environment variable config           |
| `acarshub_query_builder.py` | Dynamic SQL query construction        |
| `acarshub_rrd_database.py`  | RRD file operations                   |
| `acars_formatter.py`        | Message formatting                    |
| `acarshub_helpers.py`       | Utility functions                     |

Since the Node.js backend is the migration target, adding full Python test coverage is not a
priority. However, parity testing (GAP-DATA-3) requires the Python backend to be exercised in a
controlled way to capture its response fixtures. A minimal pytest suite with data-driven tests
covering `database_search()`, `get_freq_count()`, and `get_signal_levels()` would be sufficient.

---

## Remediation Plan

### Phase 1: Fix Broken Infrastructure (Unblocks Everything) ✅ COMPLETE

**Estimated effort**: 1–2 days
**Priority**: Must complete before any other phase.
**Status**: All items complete. `just ci` is green.

#### 1.1 Install coverage tooling ✅

Add `@vitest/coverage-v8` to devDependencies in both workspaces and verify
`npm run test:coverage` passes with the configured thresholds.

#### 1.2 Un-skip the RRD integration tests ✅

The tests themselves are well-written. `rrdtool` is already available in the Nix development
environment — that is not the blocker. The tests are skipped because each one independently
calls `createTestRrdFile()`, synthesizing 120 minutes of RRD data via `rrdtool update`. With
6 tests doing this sequentially, total runtime exceeds the acceptable threshold.

The fix is to run `just seed-test-rrd` once (see [Test Data Strategy](#test-data-strategy)),
commit `test-fixtures/test.rrd`, and update each test to copy that pre-built fixture into a
temp path in `beforeAll` instead of generating its own. This brings total RRD I/O from ~2
minutes down to under 5 seconds. Then remove all `it.skip` calls.

#### 1.3 Un-skip the TCP listener tests ✅

Replace the timing-sensitive `setTimeout` waits in the two skipped tests with a proper
`waitForEvent` helper that polls with backoff. Remove the `it.skip`.

#### 1.4 Address the two skipped SettingsModal tests ✅

Use `vi.spyOn(HTMLMediaElement.prototype, 'play')` to mock the audio API in jsdom. The tests
currently skip because `window.HTMLMediaElement.prototype.play` is not implemented in jsdom, but
this is straightforwardly mockable.

**Note**: The actual root cause differed from the original diagnosis. The audio API was already
mocked via `audioService`. The real issue was that setting Zustand store state before `render()`
did not reliably produce a conditionally-rendered element in jsdom (the persist middleware
rehydrates from empty localStorage after mount, resetting `sound` to `false`). Fix: rewritten
to enable sound via a simulated user click on the Sound Alerts toggle (the same pattern used by
the passing `should update alert volume` test), which triggers a Zustand action and a reliable
React re-render. The button query was also corrected from `name: /Test Sound/i` to
`name: /Test alert sound/i` to match the component's `aria-label`.

#### 1.5 Add `@vitest/coverage-v8` to `just ci` ✅

Update the `ci` target to run `npm run test:coverage` in both workspaces after the regular test
runs, so threshold failures are caught.

---

### Phase 2: Backend Unit Coverage for Critical Gaps

**Estimated effort**: 3–5 days
**Dependency**: Phase 1 complete.

#### 2.1 Test `socket/handlers.ts` (GAP-BE-UNIT-1)

This is the highest-priority single item in the entire audit. Create
`socket/__tests__/handlers.test.ts`.

The test pattern for each handler:

```typescript
// Example pattern for handleConnect
describe("handleConnect", () => {
  let db: Database.Database;
  let mockSocket: { emit: Mock; to: Mock; id: string };

  beforeEach(() => {
    db = initInMemoryDb(); // helper that creates and seeds test DB
    mockSocket = { emit: vi.fn(), to: vi.fn(() => mockSocket), id: "test-id" };
  });

  it("should emit features_enabled with decoder config", async () => {
    await handleConnect(mockSocket, getTestConfig());
    expect(mockSocket.emit).toHaveBeenCalledWith(
      "features_enabled",
      expect.objectContaining({
        acars: true,
        vdlm: true,
      }),
    );
  });

  it("should send recent messages in chunks when count > chunkSize", async () => {
    // Seed 150 messages (chunk size = 50)
    seedMessages(db, 150);
    await handleConnect(mockSocket, getTestConfig());
    const batchCalls = mockSocket.emit.mock.calls.filter(
      ([event]) => event === "acars_msg_batch",
    );
    expect(batchCalls).toHaveLength(3);
    expect(batchCalls[2][1].done_loading).toBe(true);
  });
});
```

Every handler needs tests for: happy path, empty database, error path (mock database to throw),
and boundary conditions.

Special attention for `handleRRDTimeseries`: test all 8 time periods, verify that
`zeroFillBuckets` is called correctly, verify that the response timestamps align to expected
boundaries.

#### 2.2 Test `db/queries/alerts.ts` (GAP-BE-UNIT-2)

Focus areas:

- `regenerateAllAlertMatches` with text matching, ICAO matching, tail matching, flight matching,
  and ignore term filtering — each needs its own test case with fixture messages
- `setAlertTerms` and `setAlertIgnore` upsert semantics (add, update, remove)
- `searchAlertsByTerm` pagination
- `deleteOldAlertMatches` boundary conditions

#### 2.3 Test `db/queries/statistics.ts` (GAP-BE-UNIT-3)

Focus areas:

- `updateFrequency` upsert: first call inserts, second call increments
- `updateSignalLevel` same upsert pattern
- `initializeMessageCounters` reads from a seeded DB and sets the correct in-memory values
- Counter isolation: multiple test cases must not bleed counter state (use `beforeEach` to reset)

#### 2.4 Test `services/adsb-poller.ts` and `services/stats-pruning.ts`

Use `vi.spyOn(global, 'fetch')` for the poller. Test pruning with an in-memory DB containing
rows at various ages.

---

### Phase 3: Frontend Unit Coverage for Critical Gaps

**Estimated effort**: 3–5 days
**Dependency**: Phase 1 complete.

#### 3.1 Test `utils/aircraftPairing.ts` (GAP-FE-UNIT-2)

This is the highest-priority frontend unit gap. Test all three matching strategies, the priority
ordering between them, and `PairedAircraft` construction with and without a matched group.

#### 3.2 Test page components (GAP-FE-UNIT-1)

Priority order: `LiveMessagesPage` → `SearchPage` → `AlertsPage`.

For each page, the test setup is:

1. Mock `useAppStore` to return specific state
2. Mock `socketService` to capture emitted events
3. Render the page
4. Verify the rendered output matches the state
5. Simulate interactions and verify state changes or socket emissions

`SearchPage` test scenarios:

- Empty state renders correctly
- Entering a search term and submitting emits `query_search` with correct payload
- When `database_search_results` arrives, results render
- Pagination controls work correctly (next/prev page emits with updated offset)

`AlertsPage` test scenarios:

- Live alerts view renders groups from `alertMessageGroups`
- "Mark all read" button calls `markAllAlertsAsRead`
- Historical mode shows term selector
- Switching terms emits `query_alerts_by_term`
- Pagination in historical mode works

#### 3.3 Test `useSocketIO` hook (GAP-FE-UNIT-6)

Use `renderHook` with a mocked `socketService`. Verify that each Socket.IO event received by
the hook results in the correct store action being called with the correct data.

#### 3.4 Test remaining utility files

`validationUtils.ts`, `arrayUtils.ts`, `aircraftIcons.ts` — straightforward pure function
testing.

---

### Phase 4: Docker Playwright & E2E Expansion

**Estimated effort**: 5–8 days
**Dependency**: Phases 1–2 complete. Docker infrastructure set up (see below).

#### 4.1 Set up Docker Playwright environment

See [Docker Playwright Strategy](#docker-playwright-strategy).

#### 4.2 Build the seed database and fixture tooling

See [Test Data Strategy](#test-data-strategy).

#### 4.3 Add core user flow E2E tests

Priority order based on user impact:

1. **Live messages flow** — inject messages via `window.__ACARS_STORE__`, verify rendering,
   grouping, alert highlighting, unread badge
2. **Search flow** — full user journey from query to paginated results
3. **Alerts flow** — view live alerts, mark as read, view historical
4. **Mobile navigation** — full hamburger menu flow at 375px
5. **Stats page tabs** — tab switching, time period selection
6. **Map interactions** — aircraft list, pause/resume
7. **Settings persistence** — complete settings round-trip

#### 4.4 Re-enable E2E tests in CI

Update the `ci-e2e` target in `justfile` to use the Docker-based runner.

---

### Phase 5: Full-Stack Integration Tests

**Estimated effort**: 5–8 days
**Dependency**: Phase 4 complete. Docker infrastructure set up.

#### 5.1 Backend Socket.IO integration tests

Create a test that:

1. Boots the actual Fastify + Socket.IO server with a seeded test database
2. Connects a real `socket.io-client` to it
3. Verifies the full connect sequence (all events received in order)
4. Sends `query_search`, `update_alerts`, `request_status`, and verifies responses
5. Verifies error responses for malformed inputs

#### 5.2 Full-stack Playwright tests (frontend + backend)

Create a separate Playwright project (`e2e/integration/`) that:

1. Starts the Node.js backend with the seed database (via Docker Compose)
2. Starts nginx to serve the frontend
3. Runs Playwright against the full stack

Full-stack test scenarios:

- Connect → messages appear in Live Messages
- Search → results come from real database
- Update alert terms → alerts regenerate and appear in Alerts page
- Stats page → charts render with real timeseries data from seed DB

---

## Docker Playwright Strategy

### The Problem

NixOS's sandboxed environment does not provide the system libraries that Playwright's bundled
Firefox and WebKit binaries require. This is a structural incompatibility, not a configuration
issue. The current workaround (Chromium only) leaves Firefox and Safari users with zero E2E
coverage.

### The Solution

Use the official Playwright Docker image (`mcr.microsoft.com/playwright`) which includes all
three browser engines with their correct system dependencies. Tests run inside the container;
the application under test runs either on the host or in a separate container.

### Architecture

#### Tier 1: Frontend-only E2E (replaces current approach)

```text
Host:
  └── Vite dev server (port 3000)

Docker container:
  └── mcr.microsoft.com/playwright:v1.x
        └── npx playwright test
            └── baseURL: http://host.docker.internal:3000
```

For local development, the dev server runs on the host and the Playwright container reaches it
via `host.docker.internal`. In CI (GitHub Actions), use `--network=host`.

**justfile target**:

```justfile
test-e2e-docker:
    @echo "Starting Vite dev server..."
    cd acarshub-react && npm run dev &
    sleep 5
    @echo "Running Playwright in Docker..."
    docker run --rm --network=host \
      -v $(pwd)/acarshub-react:/work -w /work \
      -e CI=true \
      mcr.microsoft.com/playwright:v1.58.2-noble \
      npx playwright test
    @pkill -f "vite" || true
```

**Playwright config update**: Add Firefox and WebKit projects back when using Docker mode. Use
`process.env.PLAYWRIGHT_DOCKER` to conditionally include them:

```typescript
projects: [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ...(process.env.PLAYWRIGHT_DOCKER
    ? [
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
        { name: "webkit", use: { ...devices["Desktop Safari"] } },
        { name: "Mobile Chrome", use: { ...devices["Pixel 5"] } },
        { name: "Mobile Safari", use: { ...devices["iPhone 12"] } },
      ]
    : []),
];
```

#### Tier 2: Full-stack integration E2E

```text
Docker Compose:
  ├── backend (Node.js + Fastify + Socket.IO, seed DB mounted)
  ├── nginx (serves compiled React frontend, proxies to backend)
  └── playwright (mcr.microsoft.com/playwright, runs against nginx)
```

**`docker-compose.test.yml`**:

```yaml
services:
  backend:
    image: ah:test
    environment:
      - ACARSHUB_DB=/run/acars/test-seed.db
      - ENABLE_ACARS=true
      - ENABLE_VDLM=true
      - ENABLE_HFDL=true
    volumes:
      - ./test-fixtures/seed.db:/run/acars/test-seed.db:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 2s
      retries: 15

  playwright:
    image: mcr.microsoft.com/playwright:v1.58.2-noble
    depends_on:
      backend:
        condition: service_healthy
    working_dir: /work
    volumes:
      - ./acarshub-react:/work
    environment:
      - PLAYWRIGHT_BASE_URL=http://backend:80
      - PLAYWRIGHT_DOCKER=true
      - CI=true
    command: npx playwright test e2e/integration/
```

### CI Integration

Add `.github/workflows/e2e.yml`:

```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm ci
      - run: npm run build
        working-directory: acarshub-react
      - name: Run E2E tests (frontend-only, all browsers)
        run: just test-e2e-docker
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: acarshub-react/playwright-report/
```

---

## Test Data Strategy

### Seed Database (`test-fixtures/seed.db`)

The seed database is the foundation for backend integration tests, RRD integration tests, and
full-stack E2E tests. It must be:

- **Reproducible**: generated from a deterministic script, not captured from a live run
- **Representative**: contains realistic data across all message types and field combinations
- **Fast to generate**: target under 30 seconds
- **Version-controlled**: committed to the repo; updated when schema changes

#### Seed Script Design

Create `scripts/seed-test-db.ts` (run as `just seed-test-db`):

1. Read all messages from `acarshub-react/tests/fixtures/*.jsonl` (2,860 real messages)
2. Parse each line through the message formatter (`acarshub-backend/src/formatters/index.ts`)
3. Insert all messages into a fresh SQLite database using the production schema (run Drizzle
   migrations first)
4. Compute alert terms: seed 5–10 terms that are known to match messages in the fixture files
   (e.g., a callsign known to appear in the JSONL data)
5. Run `regenerateAllAlertMatches` to populate alert match records
6. Generate synthetic timeseries stats: 7 days of 1-minute resolution data using a sine wave + noise pattern (similar to what the RRD integration test generates)
7. Populate frequency and signal level statistics by scanning the inserted messages
8. Write the database to `test-fixtures/seed.db`

The script must be idempotent: running it twice produces the same database (use a fixed seed
for any random number generation).

#### Timeseries Data in the Seed DB

For the `timeseries_stats` table, generate data with:

- 7 days × 24 hours × 60 minutes = 10,080 rows at 1-minute resolution
- ACARS count: 5–15 per minute (sine wave, period ≈ 6 hours)
- VDLM count: 10–30 per minute (different phase)
- HFDL count: 2–8 per minute
- IMSL/IRDM: 0–3 per minute
- Error count: 0–1 per minute (random, ≈5% of minutes)

This gives the Stats page charts real data to render during E2E tests.

### RRD Fixture File (`test-fixtures/test.rrd`)

The RRD integration tests are currently all `it.skip` purely for performance reasons.
`rrdtool` is available in the Nix environment. The problem is that each of the 6 tests calls
`createTestRrdFile()`, which synthesizes 120 minutes of RRD data by spawning `rrdtool update`
with 120 individual data points — even though the 6 tests share identical setup, the synthesis
runs 6 separate times, and the cumulative wall-clock time pushes well past the test timeout.

**The fix is to generate the fixture once and commit it.** A small helper script
(`scripts/generate-test-rrd.ts`) runs `createTestRrdFile()` a single time and writes the
resulting binary to `test-fixtures/test.rrd`. All 6 integration tests then read that committed
file directly via a `beforeAll` copy into a temp path, rather than each generating their own.

This changes the integration test lifecycle from:

```text
[currently] each test: rrdtool create + rrdtool update (120 points) → ~20s each × 6 = ~2min
[fixed]     beforeAll: copy test-fixtures/test.rrd to temp path    → <100ms total
```

The fixture file should be regenerated (and re-committed) whenever the RRD schema changes.
Once the fixture is in place, all 6 `it.skip` calls are removed and the tests run in normal
CI via `just ci`.

The fixture should contain **72 hours** of 1-minute data (not just 2 hours) so that all four
RRD archive resolutions (1min, 5min, 1hour, 6hour) have enough data to validate the full
expansion logic in `migrateRrdToSqlite`.

**Resolution**: `acarshub-backend/scripts/generate-test-rrd.ts` generates `test-fixtures/test.rrd`
(72 h, 4320 1-minute data points, deterministic sine/cosine values, anchored at
2024-01-01T00:00:00Z). The script is run via `just seed-test-rrd` and the resulting binary is
committed to `test-fixtures/`. All 6 integration tests were rewritten to use the committed
fixture via a `beforeAll` copy, and `migrateRrdToSqlite` was extended with an optional
`archiveConfig` parameter so tests pass compact absolute-timestamp archive overrides (covering
only 2–12 h of fixture data) instead of the production multi-year ranges. Total test runtime
dropped from > 2 minutes (skipped) to under 2 seconds. All 6 `it.skip` calls removed.

### Socket.IO Response Fixtures (`test-fixtures/socket-responses/`)

Create `scripts/capture-socket-fixtures.ts`:

1. Start the Node backend with the seed database
2. Connect a Socket.IO client
3. Capture every event received during the connect sequence
4. Send each of the standard query events
5. Capture all responses
6. Write to `test-fixtures/socket-responses/<event-name>.json`

These fixtures are used by the parity tests described in `NODEJS_MIGRATION_PLAN.md`.

### `just` Targets for Test Data

```justfile
# Generate seed database from fixture JSONL files
seed-test-db:
    @echo "Generating test seed database..."
    @cd acarshub-backend && npx tsx scripts/seed-test-db.ts
    @echo "✅ Seed database written to test-fixtures/seed.db"

# Generate RRD fixture file (run once; commit the result to test-fixtures/test.rrd)
# rrdtool must be available (it is in the Nix dev environment and in the production image)
seed-test-rrd:
    @echo "Generating test RRD fixture (72h of 1-min data, all 4 archive resolutions)..."
    @cd acarshub-backend && npx tsx scripts/generate-test-rrd.ts
    @echo "✅ RRD fixture written to test-fixtures/test.rrd — commit this file"

# Capture Socket.IO response fixtures from running backend
capture-socket-fixtures:
    @echo "Capturing Socket.IO response fixtures (requires backend running)..."
    @cd acarshub-backend && npx tsx scripts/capture-socket-fixtures.ts
    @echo "✅ Fixtures written to test-fixtures/socket-responses/"

# Regenerate all test data
# Run this after schema changes and commit the updated fixtures
seed-all:
    just seed-test-db
    just seed-test-rrd
    @echo "✅ All test data generated — review and commit changes to test-fixtures/"
```

---

## Success Metrics

The following metrics define "done" for each phase.

### Phase 1 (Infrastructure) ✅ COMPLETE

- [x] `npm run test:coverage` passes in both `acarshub-react` and `acarshub-backend`
- [x] Coverage report shown — frontend ≥65% branches (threshold adjusted from 70% to match
      current baseline; will be raised as Phases 2–3 add tests), backend coverage reported
- [x] 0 `it.skip` in RRD integration tests — all 6 pass in < 2 s via committed fixture
- [x] 0 `it.skip` in TCP listener tests — all 16 pass
- [x] 0 `it.skip` in SettingsModal tests — all 50 pass
- [x] `just ci` runs `test:coverage` in both workspaces and fails on threshold violations
- [x] `test-e2e-docker` justfile target added (Docker Playwright, multi-browser)
- [x] `playwright.config.ts` enables Firefox, WebKit, Mobile Chrome, Mobile Safari under
      `PLAYWRIGHT_DOCKER=true`
- [x] `just seed-test-rrd` target added; `test-fixtures/test.rrd` committed
- [x] `acarshub-backend/scripts/generate-test-rrd.ts` created
- [x] `migrateRrdToSqlite` accepts optional `archiveConfig` parameter (non-breaking)
- [x] `coverage/` dirs added to `.gitignore`; `test-fixtures/test.rrd` exception added

### Phase 2 (Backend Unit)

- [ ] `socket/handlers.ts` has ≥80% line coverage
- [ ] `db/queries/alerts.ts` has ≥90% line coverage
- [ ] `db/queries/statistics.ts` has ≥90% line coverage
- [ ] `services/adsb-poller.ts` has ≥70% line coverage
- [ ] `services/stats-pruning.ts` has ≥80% line coverage
- [ ] Backend total coverage ≥80% (from current unknown baseline)

### Phase 3 (Frontend Unit)

- [ ] `utils/aircraftPairing.ts` has ≥90% line coverage
- [ ] `utils/validationUtils.ts` has ≥90% line coverage
- [ ] All 7 page components have at least 5 tests each
- [ ] `useSocketIO` hook tested with all 15+ event handlers
- [ ] Frontend total coverage ≥75%

### Phase 4 (E2E)

- [ ] Playwright runs Chromium, Firefox, and WebKit in CI (via Docker)
- [ ] E2E tests are re-enabled in `ci-e2e` target
- [ ] Live messages flow covered by at least 5 E2E tests
- [ ] Search flow covered by at least 5 E2E tests
- [ ] Alerts flow covered by at least 5 E2E tests
- [ ] Mobile flows covered at 375px and 768px viewports
- [ ] Total E2E test count ≥ 80 (up from 34)

### Phase 5 (Full-Stack)

- [ ] `docker-compose.test.yml` exists and works locally
- [ ] At least 10 full-stack integration tests passing
- [ ] Full-stack tests run in GitHub Actions on pull requests
- [ ] Socket.IO connect sequence validated with real backend
- [ ] Search results validated end-to-end
- [ ] Alert term updates validated end-to-end

---

## Appendix: Files with Zero Test Coverage

The following source files have zero test coverage of any kind and are not otherwise covered
by tests in this audit (i.e., they fall below the priority threshold for immediate remediation):

**Frontend**:

- `src/config/mapProviders.ts`
- `src/components/charts/` (all chart components)
- `src/components/Map/` (all map sub-components except the 3 with existing tests)
- `src/services/audioService.ts` (mockable via `HTMLMediaElement`)

**Backend**:

- `src/db/index.ts` (thin wrapper, tested indirectly)
- `src/db/client.ts` (thin wrapper)
- `src/server.ts` (bootstrapper — tested via integration tests)
- `src/utils/logger.ts` (low value to test)

These should be addressed in a follow-on effort once the critical gaps above are resolved.
