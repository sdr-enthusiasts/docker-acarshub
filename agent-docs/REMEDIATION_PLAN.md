# ACARS Hub — Audit Remediation Plan

This document captures every finding from the senior-engineer audit performed on
2026-05-05 and proposes a concrete remediation for each. It is intended to be
read top-to-bottom and used as a working checklist.

> **Note on scope.** This plan describes work to bring the codebase back into
> compliance with `AGENTS.md` and `agent-docs/DESIGN_LANGUAGE.md`. It is **not**
> itself an implementation summary or a progress tracker — per AGENTS.md
> ("NO SUMMARIES" rule) this document should be deleted once the work is
> complete. While work is ongoing, prefer linking PRs to the section anchors
> below rather than editing this file with status notes.

## How to use this document

- Each finding has a stable ID (e.g. `SEC-01`, `FE-INLINE-03`). Reference these
  IDs in commit messages and PR titles.
- Severity levels: **CRITICAL** (security, data loss) > **HIGH** (correctness,
  resource leaks, AGENTS.md violations) > **MEDIUM** (anti-pattern,
  maintainability) > **LOW** (style, nit).
- Effort estimates: **Trivial** (<30 min) / **Low** (<2 h) / **Medium** (half-day
  to one day) / **High** (multi-day).
- Every code change MUST follow the AGENTS.md testing mandate: new tests for new
  code, regression tests for bug fixes.

## Table of contents

1. [Security](#1-security)
2. [Type safety and `any` elimination](#2-type-safety-and-any-elimination)
3. [Logging discipline](#3-logging-discipline)
4. [Inline styles and CSS custom properties](#4-inline-styles-and-css-custom-properties)
5. [SCSS standards (theming, mobile-first, touch targets)](#5-scss-standards)
6. [Module-level mutable state](#6-module-level-mutable-state)
7. [Resource leaks](#7-resource-leaks)
8. [Error handling consistency](#8-error-handling-consistency)
9. [Architecture and god files](#9-architecture-and-god-files)
10. [React effect-density refactors](#10-react-effect-density-refactors)
11. [Testing — coverage, quality, and gaps](#11-testing)
12. [Documentation drift](#12-documentation-drift)
13. [Repository hygiene](#13-repository-hygiene)
14. [Miscellaneous nits](#14-miscellaneous-nits)
15. [Suggested execution order](#15-suggested-execution-order)

---

## 1. Security

### SEC-01 — SQL injection in RRD timeseries handler — **CRITICAL** — ✅ DONE (`c0fbc176`)

**File:** `acarshub-backend/src/socket/handlers.ts:920-1019` (and the parallel
non-downsampled block lower in the same handler).

**Finding.** `params.start`, `params.end`, and `params.downsample` flow from a
Socket.IO client straight into a `sql.raw(...)` template that interpolates
those values into the SQL string. Concretely:

```ts
sql.raw(`... ${start} ... ${end} ... ${downsample} ...`);
```

The TypeScript signature claims `number | undefined` but the wire is untyped
JSON. A client can send `{ start: "0; DROP TABLE timeseries_stats--" }` and
the `??` fallback will not trigger because the value is truthy. The comment
in `services/timeseries-cache.ts:160-161` ("never user-supplied — so there is
no SQL-injection risk") applies only to that file, not to the handler copy.

**Remediation.**

1. Add a runtime validator at the top of `handleRRDTimeseries`:

   ```ts
   function isValidUnixSeconds(v: unknown): v is number {
     return (
       typeof v === "number" &&
       Number.isFinite(v) &&
       Number.isInteger(v) &&
       v >= 0
     );
   }
   function isValidDownsample(v: unknown): v is number {
     return (
       typeof v === "number" && Number.isInteger(v) && v >= 60 && v <= 86400
     );
   }
   ```

2. Reject any `params` that fails validation and emit a structured error to the
   client.
3. Migrate to Drizzle's tagged-template `sql` helper, which binds
   interpolated parameters automatically. Only fall back to `sql.raw` for
   whitelisted column/table names.
4. Add a regression test in
   `acarshub-backend/src/socket/__tests__/handlers.test.ts` that sends a
   malicious string as `start` and asserts (a) the client receives an error and
   (b) the database table still exists.

**Effort:** Low. **Tests required:** regression test (mandatory per AGENTS.md
bug-fix policy).

### SEC-02 — LIKE-wildcard injection / DoS in search builder — **HIGH** — ✅ DONE (`57acc60f`)

**File:** `acarshub-backend/src/db/queries/messages.ts:773, 777, 786, 791, 795,
799, 803, 807, 819`.

**Finding.** Calls of the form `like(messages.tail, '%' + params.tail + '%')`
parameterise the _value_ (no SQL injection), but do not escape `%` and `_`
from the user input. A client searching for `%` matches every row; a search
for `__` produces a slow full-table scan. This is a denial-of-service vector
and a semantic correctness bug.

The custom `*` → `%` translation at `messages.ts:781-787` is also half-done —
it leaves `_` active and unescaped, so callers cannot tell what is a literal
versus a wildcard.

**Remediation.**

1. Add an `escapeLikeWildcards(input: string): string` helper that escapes
   `%`, `_`, and `\` and use SQL `ESCAPE '\\'` clauses.
2. Document the wildcard contract: only `*` (translated to `%`) is honoured;
   all other characters are literals.
3. Add tests that cover `%`, `_`, `\`, and `*` in user input.

**Effort:** Low. **Tests required:** new + regression test for `%` DoS.

### SEC-03 — Untyped Socket.IO inputs at handler boundaries — **HIGH** ✅ done (24c707bc)

**Files:**

- `acarshub-backend/src/socket/handlers.ts:364-370` (`handleQuerySearch`)
- `acarshub-backend/src/socket/handlers.ts:451` (`handleUpdateAlerts`)
- `acarshub-backend/src/socket/handlers.ts:721-723` (`handleAlertTermQuery`)
- `acarshub-backend/src/socket/handlers.ts:765-766` (`handleQueryAlertsByTerm`)
- `acarshub-backend/src/socket/handlers.ts:920-925` (`handleRRDTimeseries` — see
  also SEC-01)

**Finding.** Every `socket.on(...)` handler receives `params: { ... }` typed as
a TypeScript interface, but Socket.IO is an untyped wire. TS type assertions on
socket inputs are effectively lies.

**Remediation.**

1. Add `zod` (or a lightweight hand-rolled validator if a dependency is
   undesirable) and define a schema per handler in a colocated
   `acarshub-backend/src/socket/schemas/<handler>.ts` file.
2. Wrap every `socket.on(...)` registration with a `validatedHandler(schema,
handler)` helper that parses input, emits a structured error on failure,
   and only invokes `handler` on success.
3. Tests: invalid-shape inputs must emit an error and never reach the handler.

**Effort:** Medium. Closes SEC-01 partially and SEC-02 partially.

---

## 2. Type safety and `any` elimination

### TYPE-01 — Flask-SocketIO `as any` cast cluster — **HIGH** ✅ `5e9b2b76`

**Files:**

- `acarshub-react/src/components/SettingsModal.tsx:277, 307, 324, 362, 379`
- `acarshub-react/src/pages/SearchPage.tsx:461`
- `acarshub-react/src/services/socket.ts:214, 226, 259, 371, 400, 615`

**Finding.** Seven `(socket as any).emit("...", payload, "/main")` casts plus
several `any`s in the mock socket implementation. The third-argument quirk is
documented in AGENTS.md as critical, and the workaround has been to cast
`socket` to `any` rather than express the contract in types.

**Remediation.**

1. In `services/socket.ts`, declare a typed `EmitEvents` interface listing every
   client-to-server event and its payload type.
2. Export a single helper:

   ```ts
   export function emitToServer<E extends keyof EmitEvents>(
     event: E,
     payload: EmitEvents[E],
     namespace: string = "/main",
   ): void {
     socket.emit(event as string, payload, namespace);
   }
   ```

3. Replace every `(socket as any).emit(...)` call with `emitToServer(...)`.
4. Replace the mock-socket internals' `any` usages with a typed
   `MockSocketCallback` and a typed `EngineIoLike` interface.

**Effort:** Low. Eliminates seven `any`s and centralises the namespace quirk
that SEC-04 (below) revisits.

### TYPE-02 — `any[]` and `any` in mock socket implementation — **MEDIUM** ✅ `5e9b2b76`

**File:** `acarshub-react/src/services/socket.ts:214, 226, 259, 615`.

**Finding.**

```ts
_callbacks: Record<string, Array<(...args: any[]) => void>> = {};
io: any = { ... };
emit(_event: string, ..._args: any[]): this { ... }
(this.socket as any)._callbacks?.["$" + event]
```

**Remediation.**

1. Declare `type SocketCallback = (...args: unknown[]) => void` and use it.
2. Define a minimal `EngineIoLike { uri: string }` interface and replace the
   `as any` casts at lines 371, 400.
3. For line 615 (private socket.io internals access), declare a local typed
   shape and document why we are reaching into internals.

**Effort:** Low. Resolved alongside TYPE-01.

### TYPE-03 — MapLibre expression cast to `any` — **MEDIUM**

**File:** `acarshub-react/src/components/Map/HeyWhatsThatOverlay.tsx:131`.

**Finding.** `"line-color": lineColorExpression as any,` — narrow to MapLibre's
`ExpressionSpecification` type.

**Remediation.** Import `ExpressionSpecification` from `maplibre-gl` and
type-narrow the expression.

**Effort:** Trivial.

### TYPE-04 — React DevTools globals untyped — **LOW**

**File:** `acarshub-react/src/main.tsx:25`.

**Finding.** `(console as any).__REACT_DEVTOOLS_GLOBAL_HOOK__` — has a
`biome-ignore` but uses `any`. Replace with a typed `declare global` augmentation
on the `Window` interface.

**Effort:** Trivial.

### TYPE-05 — Unchecked DB row casts in migration runner — **MEDIUM**

**Files:** `acarshub-backend/src/db/migrate.ts:105, 128, 165, 367, 451, 657,
678, 752, 769, 951, 959, 1064, 1078, 1129` (30+ similar sites).

**Finding.** `db.prepare(...).get()` returns `unknown` and is cast to
`{ sql: string }` etc. without validation. A column rename produces silent
`undefined` access.

**Remediation.**

1. Add a small `assertRow<T>(row: unknown, keys: ReadonlyArray<keyof T>): T`
   helper in `db/helpers.ts`.
2. Replace bare `as` casts with `assertRow(...)` calls.
3. Where applicable, define Zod schemas for migration inspection queries.

**Effort:** Medium. Mechanical refactor.

### TYPE-06 — `workerData` not validated — **MEDIUM**

**File:** `acarshub-backend/src/db/migrate-worker.ts:124`.

**Finding.** `const typedWorkerData = workerData as MigrateWorkerData | null;`
— if invoked oddly, you get a misleading "no dbPath provided" rather than a
type error.

**Remediation.** Add a runtime guard `isMigrateWorkerData(value: unknown)`
before the cast.

**Effort:** Trivial.

### TYPE-07 — Locale-sensitive lowercase mismatch — **LOW**

**File:** `acarshub-backend/src/config.ts:398-399`.

**Finding.** Line 398 uses `toLocaleLowerCase()`, line 399 uses
`toLowerCase()`. In the Turkish locale (`I` → `ı`) the validation can pass with
a value the cast then returns differently.

**Remediation.** Use `toLowerCase()` in both places (we explicitly want
ASCII-locale behaviour for log-level identifiers).

**Effort:** Trivial.

### TYPE-08 — `zmq-listener` socket typed as `unknown` — **LOW**

**File:** `acarshub-backend/src/services/zmq-listener.ts:65`.

**Finding.** `private socket: unknown = null;` then cast to
`{ close(): void }` at line 146. A `ZmqSubscriberLike` interface is later
declared locally at line 167.

**Remediation.** Hoist `ZmqSubscriberLike` and use it as the field type.

**Effort:** Trivial.

---

## 3. Logging discipline

### LOG-01 — `console.*` calls outside the logger — **HIGH**

**Files:**

- `acarshub-react/src/components/LogsViewer.tsx:108` — `console.error("Failed to copy logs:", err)`
- `acarshub-react/src/store/useAppStore.ts:189` — `console.error(...)`
- `acarshub-react/src/store/useSettingsStore.ts:755, 770` — two `console.error`s
- `acarshub-react/src/utils/decoderUtils.ts:255` — `console.error("Error parsing libacars data:", error)`
- `acarshub-react/src/components/Map/RangeRings.tsx:189` — `console.error(...)`
- `acarshub-backend/src/db/client.ts:88` — `verbose: process.env.NODE_ENV === "development" ? console.log : undefined`

**Allowed exceptions** (do not change):

- `acarshub-react/src/utils/logger.ts:179, 200` — the logger's own
  storage-failure fallback.
- `acarshub-react/src/test/setup.ts:114-131` — test-only intercept.

**Remediation.**

1. Replace each call with `createLogger("<module>")` plus `logger.error(message,
{ error })`.
2. For the SQLite verbose hook, route through `logger.trace` with a small
   adapter: `verbose: NODE_ENV === "development" ? (msg) => logger.trace(msg) : undefined`.

**Effort:** Trivial per site, ~30 min total.

### LOG-02 — Backend logger namespace inconsistency — **MEDIUM**

**Finding.** Three conventions in use across backend modules:

- Colon-namespaced: `socket:handlers`, `db:statistics`, `db:messages`,
  `db:transform`, `db:helpers`
- Kebab-cased: `adsb-poller`, `stats-writer`, `message-ring-buffer`,
  `migrate-worker`, `tcp-listener`, `udp-listener`, `zmq-listener`,
  `rrd-migration`, `scheduler`, `startup-state`, `timeseries-cache`,
  `services:station-ids`
- Single token: `server`, `config`, `database`, `app`, `message-queue`

**Remediation.**

1. Standardise on **colon-namespaced**: `<area>:<module>` (e.g. `db:migrate`,
   `services:adsb-poller`, `socket:handlers`, `server:metrics`).
2. Update every `createLogger(...)` call site.
3. Document the convention in AGENTS.md "Logging Standards" section.

**Effort:** Low (mechanical, one PR).

### LOG-03 — `console.warn` in tests for skip conditions — **LOW**

**File:** `acarshub-backend/src/db/__tests__/config-integration.test.ts:56,
121, 168, 314`.

**Remediation.** Replace with proper `test.skip(...)` with reason strings (or a
custom `skipIfMissingFile()` helper). Logger is not the right tool here — the
skip metadata should appear in vitest output.

**Effort:** Trivial.

### LOG-04 — `alert()` calls in `LogsViewer` — **MEDIUM** ✅ done (4addb948)

**File:** `acarshub-react/src/components/LogsViewer.tsx:106, 109`.

**Finding.** Native `alert()` for "copied to clipboard" / "copy failed". The
Toast system already exists; there's even a TODO comment acknowledging this.

**Remediation.** Replace with `useToastStore().show(...)` calls (or whatever
the existing API is — see `components/Toast.tsx`). Add a unit test for the
copy-success and copy-failure paths.

**Effort:** Trivial.

---

## 4. Inline styles and CSS custom properties

### STYLE-INLINE-STATIC — Static inline styles must move to SCSS — **HIGH**

**Files & lines:**

- `acarshub-react/src/pages/StatusPage.tsx:290` — `style={{ marginBottom: "1rem" }}`
- `acarshub-react/src/pages/AboutPage.tsx:293` — image sizing
- `acarshub-react/src/pages/AboutPage.tsx:340` — `color: "var(--color-warning)", fontWeight: 600`
- `acarshub-react/src/components/SettingsModal.tsx:1217` — `width: "100%"`
- `acarshub-react/src/components/SettingsModal.tsx:1333-1337` — flex/gap layout
- `acarshub-react/src/components/SettingsModal.tsx:1353` — `width: "120px"`
- `acarshub-react/src/components/Map/Map.tsx:453` — `width: "100%", height: "100%"`
- `acarshub-react/src/components/Map/AircraftMarkers.tsx:942-946` — image sizing

**Remediation.** Each callsite gets a dedicated SCSS class; the file's
companion `.scss` module gets the rule. Naming: BEM-style, e.g.
`.about-page__warning`, `.settings-form-field__row`, `.map__container--full`.

**Effort:** Low (mechanical).

### STYLE-INLINE-DYNAMIC — Dynamic inline styles must use CSS custom properties — **MEDIUM**

**Files:**

- `acarshub-react/src/components/LogsViewer.tsx:205` — `maxHeight`
- `acarshub-react/src/pages/LiveMessagesPage.tsx:756, 761, 784` — virtualizer
- `acarshub-react/src/pages/AlertsPage.tsx:581, 643, 664, 712, 726` — virtualizer
- `acarshub-react/src/pages/SearchPage.tsx:982, 991` — virtualizer
- `acarshub-react/src/components/Toast.tsx:105` — animation duration
- `acarshub-react/src/components/ContextMenu.tsx:179` — position
- `acarshub-react/src/components/Map/AnimatedSprite.tsx:107-115` — sprite
  position/rotation
- `acarshub-react/src/components/Map/AircraftMarkers.tsx:717, 726, 800, 878,
942, 955` — marker positioning, rotation, z-index, tooltip alignment
- `acarshub-react/src/components/Map/GeoJSONOverlayButton.tsx:192` —
  `backgroundColor: overlay.color`

**Remediation.** Replace inline positional styles with CSS custom properties.
Instead of:

```tsx
<div style={{ left: `${x}px`, top: `${y}px` }} />
```

Pass the values via custom properties and consume them in SCSS:

```tsx
<div style={{ "--ctx-menu-x": `${x}px`, "--ctx-menu-y": `${y}px` }} />
```

```scss
.context-menu {
  position: absolute;
  left: var(--ctx-menu-x);
  top: var(--ctx-menu-y);
}
```

This keeps "values that must compute at runtime" but takes layout/styling out
of JSX.

**Effort:** Medium (many sites, but each is a local change).

---

## 5. SCSS standards

### SCSS-COLOR-01 — Hardcoded `#ffffff` and `#000` — **HIGH**

**Files:**

- `acarshub-react/src/styles/components/_toggle.scss:104, 114` —
  `background-color: #ffffff;`
- `acarshub-react/src/styles/components/_radio.scss:161` —
  `background-color: #ffffff;`
- `acarshub-react/src/styles/pages/_live-messages.scss:711` —
  `border: 1px solid #000;`

**Finding.** Hardcoded white knob breaks the Latte theme (low contrast against
near-white surfaces). All other `#xxxxxx` matches in SCSS are inside
WCAG-contrast-ratio comments — they are fine.

**Remediation.**

1. Add a new variable `--color-toggle-thumb` (and `--color-radio-thumb` if
   needed) to `styles/_themes.scss`, with appropriate values per theme.
2. Use `var(--color-base)` for the `_live-messages.scss` border, or a new
   `--color-message-border-strong` if a stronger border is intentional.

**Effort:** Trivial.

### SCSS-MOBILE — Desktop-first media queries (structural anti-pattern) — **MEDIUM**

**Finding.** ~30+ `@media (max-width: ...)` queries across the SCSS tree.
DESIGN_LANGUAGE.md mandates mobile-first (`min-width`). The mixin file
`styles/_mixins.scss:237-253` actively codifies the anti-pattern with `down(...)`
helpers.

**High-traffic offenders:**

- `styles/components/_settings-modal.scss` — 11 occurrences
- `styles/pages/_stats.scss` — 6 occurrences
- `styles/components/_select.scss:139`, `_toggle.scss:201`, `_radio.scss:202`

**Remediation.** This is real work; do it as a phased plan, not a single PR:

1. Add `up(...)` mixins to `_mixins.scss`. Mark `down(...)` deprecated with a
   SCSS `@warn` (or remove if unused).
2. For each component SCSS file: invert the breakpoints. Base (mobile) styles
   become the default; tablet/desktop styles move into `@include up(tablet) {
... }` blocks.
3. Visual-regression test each component before/after via Playwright
   screenshots at 320px / 375px / 768px / 1024px / 1920px viewports.
4. Schedule one component per PR to keep diffs reviewable.

**Effort:** High. Tracked component-by-component; create a parent issue with
sub-tasks.

### SCSS-TOUCH — Touch targets below 44×44 px — **HIGH**

**Files:**

- `acarshub-react/src/styles/components/_message-group.scss:272-273, 318-319`
  — `min-width: 36px; min-height: 36px;`
- `acarshub-react/src/styles/components/_aircraft-list.scss:84-85, 143-144` —
  36×36
- `acarshub-react/src/styles/pages/_search.scss:348, 398` — `min-width: 36px`
- `acarshub-react/src/styles/components/_tab-switcher.scss:168` —
  `min-height: 36px`
- `acarshub-react/src/styles/components/_context-menu.scss:125` —
  `min-height: 36px`

**Remediation.** Bump to ≥44 px. If layout density is the concern, gate the
smaller value behind a desktop media query while keeping mobile at 44 px.

**Effort:** Trivial. **Tests:** add a Playwright a11y/touch-target check.

---

## 6. Module-level mutable state

### STATE-01 — Mutable named exports cause stale snapshots — **HIGH** — ✅ DONE (`ede55f53`)

**File:** `acarshub-backend/src/config.ts:415-416`.

**Finding.**

```ts
export let alertTerms: string[] = [];
export let alertTermsIgnore: string[] = [];
```

The handler code at `socket/handlers.ts:474-476` literally documents the bug:

> "Read back from the DB cache AFTER the update — `config.alertTerms` is a
> stale snapshot from before setAlertTerms() was called and would send the old
> values back to clients."

**Remediation.**

1. Replace with `getAlertTerms(): string[]` and `getAlertTermsIgnore(): string[]`
   getters backed by an internal mutable state object.
2. Update every call site to use the getter.
3. Add a regression test that mutates the value and reads it back through the
   getter from another module.

**Effort:** Low.

### STATE-02 — Module-level booleans, counters, and caches — **MEDIUM**

**Files:**

- `acarshub-backend/src/socket/handlers.ts:511` — `let alertRegenInProgress = false;`
- `acarshub-backend/src/db/queries/statistics.ts:47, 59` — `messageCounters`,
  `countersInitialized`
- `acarshub-backend/src/db/queries/messages.ts:51` — `unsavedMessageCounter`
- `acarshub-backend/src/db/queries/alerts.ts:51-62` — three cache vars
- `acarshub-backend/src/services/heywhatsthat.ts:147` — `cachedUrl`

**Finding.** Each is the "ambient singleton" pattern. Acceptable in isolation;
pervasive use leaks state across tests and is hard to reason about.

**Remediation.**

1. Per file, encapsulate the mutable state in a small class or factory:

   ```ts
   export function createAlertCache() {
     let terms: string[] = [];
     let ignore: string[] = [];
     return { setTerms, getTerms, setIgnore, getIgnore, reset };
   }
   ```

2. Export a singleton instance from the module (preserves the call shape) but
   expose a `reset()` for tests.
3. Wire test setup (`test-setup.ts`) to call all `reset()` functions in
   `beforeEach`.

**Effort:** Medium (one file per PR is reasonable).

---

## 7. Resource leaks

### LEAK-01 — Alignment-window `setTimeout` handles not captured — **HIGH**

**Files:**

- `acarshub-backend/src/services/stats-writer.ts:128`
- `acarshub-backend/src/services/stats-pruning.ts:141-154`
- `acarshub-backend/src/services/scheduler.ts:361-370` (`startTaskAt`)

**Finding.** Each schedules a `setTimeout` to align to the next minute boundary,
then starts a `setInterval`. The outer `setTimeout` handle is **never stored**.
If `stop*()` is called during the alignment window (up to 60 s), the deferred
callback still fires and registers a fresh `setInterval` after shutdown.

**Remediation.**

1. Capture the handle:

   ```ts
   this.alignmentTimer = setTimeout(() => {
     this.alignmentTimer = null;
     this.writeStats();
     this.writeInterval = setInterval(...);
   }, delay);
   ```

2. In `stop()`, `clearTimeout(this.alignmentTimer)` before `clearInterval(this.writeInterval)`.
3. Add tests that call `start()` immediately followed by `stop()` and assert
   no timers remain on `process._getActiveHandles()` (or use vitest fake
   timers).

**Effort:** Low.

### LEAK-02 — Reconnect timers in TCP/UDP listeners — **MEDIUM**

**Files:**

- `acarshub-backend/src/services/tcp-listener.ts:266` — `reconnectTimer`
- `acarshub-backend/src/services/udp-listener.ts:223` — `retryTimer`

**Finding.** Verify these are cleared in their respective `stop()` methods.
This is a flagged audit item, not a confirmed bug.

**Remediation.** Audit each file; if the timer is not cleared on stop, capture
and clear it. Add a `stop()` regression test similar to LEAK-01.

**Effort:** Low.

### LEAK-03 — Bare `catch {}` swallows errors — **HIGH**

**File:** `acarshub-backend/src/services/zmq-listener.ts:147`.

**Finding.**

```ts
try {
  (this.socket as { close(): void }).close();
} catch {
  /* Ignore errors closing an already-closed socket. */
}
```

Any error including OOM or TypeError is invisible.

**Remediation.**

```ts
catch (err) {
  logger.trace("Error closing zmq socket (likely already closed)", { err });
}
```

**Effort:** Trivial.

### LEAK-04 — Backup DB partial-init state — **MEDIUM**

**File:** `acarshub-backend/src/db/client.ts:164-169`.

**Finding.** If `new Database()` succeeds but a subsequent `pragma` call throws,
`drizzleBackupClient` and `sqliteBackupConnection` are left in inconsistent
partial state.

**Remediation.** Wrap the entire init in a try/catch that nulls both refs on
any failure.

**Effort:** Trivial.

---

## 8. Error handling consistency

### ERR-01 — Mixed `catch (error)` / `catch (err)` naming — **LOW**

**Finding.** `services/index.ts` uses `err`; `socket/handlers.ts` uses `error`;
`services/timeseries-cache.ts` uses `err`; `db/queries/messages.ts` uses
`error`.

**Remediation.** Pick one — recommend `error` since it matches the AGENTS.md
example. Add a Biome rule (`useNamingConvention` or a custom one) to enforce.

**Effort:** Low (mechanical via Biome auto-fix once rule is added).

### ERR-02 — Fire-and-forget async in `setImmediate` — **MEDIUM**

**File:** `acarshub-backend/src/socket/handlers.ts:567`.

**Finding.** `setImmediate(async () => { ... })` for
`handleRegenerateAlertMatches`. Inner try/catch covers most cases, but if the
inner `catch` itself throws (e.g. socket disconnect during emit), the
rejection becomes an unhandled rejection at process level.

**Remediation.** Wrap the whole IIFE: `Promise.resolve(asyncFn()).catch((err)
=> logger.error("regen failed unexpectedly", { err }))`.

**Effort:** Trivial.

### ERR-03 — Async `setInterval` callbacks — **LOW**

**File:** `acarshub-backend/src/services/scheduler.ts:339, 361, 365`.

**Finding.** `setInterval(async () => { ... })` is fragile if the inner
function rejects. `executeTask` already has a try/catch (verified at line
383+), so this is acceptable, but the pattern is brittle.

**Remediation.** Document the invariant ("`executeTask` must never throw") in
a comment, or wrap the interval callback in a `.catch()` chain explicitly.

**Effort:** Trivial.

---

## 9. Architecture and god files

### GOD-01 — `socket/handlers.ts` (1223 lines) — **MEDIUM**

**File:** `acarshub-backend/src/socket/handlers.ts`.

**Remediation.** Split into per-domain modules:

- `socket/handlers/connect.ts` — `handleConnect`, `handleDisconnect`
- `socket/handlers/search.ts` — `handleQuerySearch`
- `socket/handlers/alerts.ts` — `handleUpdateAlerts`,
  `handleRegenerateAlertMatches`, `handleAlertTermQuery`,
  `handleQueryAlertsByTerm`
- `socket/handlers/stats.ts` — frequency / signal / message-count handlers
- `socket/handlers/timeseries.ts` — `handleRRDTimeseries`
- `socket/handlers/index.ts` — thin `registerHandlers(io)` orchestrator

Move shared module-level state (`alertRegenInProgress`) into a small service
object passed to handlers, or into `services/alert-regen.ts`.

**Effort:** Medium. Tests stay valid; structure improves.

### GOD-02 — `db/migrate.ts` (1652 lines) — **MEDIUM**

**Remediation.** One file per migration step (`migrations/v1.ts`,
`migrations/v2.ts`, ...) plus a registry; `migrate.ts` becomes a small runner
that imports and dispatches. This is more aligned with a "custom migration
runner" architecture than a monolith.

**Effort:** Medium-to-high. Schedule alongside any new migration so the work
isn't pure churn.

### GOD-03 — `db/queries/messages.ts` (1212 lines) — **MEDIUM**

**Remediation.** Split into `queries/messages/search.ts`, `insert.ts`,
`update.ts`, `delete.ts`, `prune.ts`, `range.ts`, `transform.ts`. Re-export
from a barrel.

**Effort:** Medium.

### GOD-04 — `services/index.ts` (848 lines) — **MEDIUM**

**Remediation.** Split into:

- `services/background-services.ts` — top-level lifecycle
- `services/listener-manager.ts` — TCP/UDP/ZMQ listener wiring
- `services/system-status.ts` — status emission

`services/index.ts` becomes a barrel.

**Effort:** Medium.

### GOD-05 — `components/SettingsModal.tsx` (1553 lines) — **HIGH**

**File:** `acarshub-react/src/components/SettingsModal.tsx`.

**Remediation.** Extract per-tab subcomponents:

- `components/settings/AppearanceTab.tsx`
- `components/settings/RegionalTab.tsx`
- `components/settings/AlertsTab.tsx`
- `components/settings/NotificationsTab.tsx`
- `components/settings/DataTab.tsx`
- `components/settings/MapTab.tsx`
- `components/settings/AdvancedTab.tsx`

Resolves five `as any` socket emits (TYPE-01) and three static inline styles
(STYLE-INLINE-STATIC) in passing.

**Effort:** Medium-to-high.

### GOD-06 — `utils/aircraftIcons.ts` (1510 lines) — **MEDIUM**

**Finding.** Likely a large lookup table — verify; if so it's data, acceptable,
but should split data from any logic.

**Remediation.** If pure data, extract to a JSON file and a small loader. If
mixed with logic, separate the two.

**Effort:** Low (mostly mechanical).

### GOD-07 — `store/useAppStore.ts` (1217 lines) — **HIGH**

**Remediation.** Split into:

- `store/useMessagesStore.ts` — message groups, message ingestion
- `store/useAlertsStore.ts` — alert terms, alert counts
- `store/useReadStateStore.ts` — read/unread tracking
- `store/useConnectionStore.ts` — connection state

Use Zustand's slice pattern if a single combined store is preferred.

**Effort:** High. Touches every consumer.

### GOD-08 — `components/Map/AircraftMarkers.tsx` (1098 lines) with duplicated tooltip code — **MEDIUM**

**File:** `acarshub-react/src/components/Map/AircraftMarkers.tsx:739-862` vs
`866-948`.

**Finding.** ~150 lines duplicated between sprite-branch and SVG-branch
tooltip positioning.

**Remediation.**

1. Extract `useTooltipPositioning(...)` custom hook.
2. Extract `<MarkerButton sprite={...} svg={...}>` shared component.
3. Branches reduce to selecting which child to render; positioning logic is
   shared.

**Effort:** Medium.

### GOD-09 — `services/rrd-migration.ts` (1246 lines) — **LOW**

**Finding.** Long because of fallback paths in legacy RRD format reading.
Reasonable but trending toward god-file territory.

**Remediation.** Defer unless changes are needed; if touched, split format
parsers from the migration driver.

**Effort:** Medium when scheduled.

---

## 10. React effect-density refactors

### EFFECT-01 — `LiveMapPage.tsx` has 12 `useEffect`s — **MEDIUM**

**File:** `acarshub-react/src/pages/LiveMapPage.tsx:137, 151, 274, 309, 330,
342, 354, 360, 386, 400, 519, 530`.

**Remediation.** Extract domain-specific hooks:

- `useMapViewSync()` — view state ↔ store sync
- `useAircraftSelection()` — selected aircraft, follow mode
- `useFollowMode()` — auto-pan when followed aircraft updates
- `useMapSidebarLayout()` — sidebar open/close, layout effects
- `useMapKeyboardShortcuts()`

**Effort:** Medium.

### EFFECT-02 — `LiveMessagesPage.tsx` has 9 `useEffect`s — **MEDIUM**

**File:** `acarshub-react/src/pages/LiveMessagesPage.tsx:173, 177, 181, 188,
196, 209, 238, 495, 621`.

**Remediation.** Extract `useMessageVirtualization()`,
`useMessageScrollAnchor()`, `useMessageFilterSync()`.

**Effort:** Medium.

### EFFECT-03 — `SearchPage.tsx` has 6 `useEffect`s — **LOW**

**Remediation.** Combine related effects; extract a `useSearchParamsSync()` hook.

**Effort:** Low.

### EFFECT-04 — `AlertsPage.tsx` has 5 `useEffect`s — **LOW**

**Remediation.** Same approach as EFFECT-03.

**Effort:** Low.

---

## 11. Testing

### TEST-CFG-01 — Backend has zero coverage thresholds — **HIGH** — ✅ DONE (`88d44730`)

**File:** `acarshub-backend/vitest.config.ts`.

**Finding.** `coverage` block exists with reporters but **no `thresholds`** at
all. AGENTS.md mandates 80% services / 90% formatters; nothing enforces this.

**Remediation.** Add path-scoped thresholds:

```ts
thresholds: {
  lines: 80, functions: 80, branches: 75, statements: 80,
  perFile: true,
  "src/formatters/**/*.ts": { lines: 90, functions: 90, branches: 85, statements: 90 },
  "src/services/**/*.ts": { lines: 80, functions: 80, branches: 75, statements: 80 },
  "src/db/queries/**/*.ts": { lines: 80, functions: 80, branches: 75, statements: 80 },
}
```

**Effort:** Trivial. Will fail CI immediately if coverage is below — coordinate
with TEST-GAP-\* fixes.

### TEST-CFG-02 — Frontend thresholds don't enforce per-area goals — **HIGH** — ✅ DONE (`dbed992a`)

**File:** `acarshub-react/vitest.config.ts:57-62`.

**Finding.** Flat `lines: 70, functions: 70, branches: 65, statements: 70`
across `src/`. AGENTS.md requires:

- Utilities: 90 %
- Stores: 80 %
- Components: 70 %

**Remediation.** Add per-path thresholds:

```ts
thresholds: {
  lines: 70, functions: 70, branches: 65, statements: 70,
  perFile: true,
  "src/utils/**/*.ts": { lines: 90, functions: 90, branches: 85, statements: 90 },
  "src/store/**/*.ts": { lines: 80, functions: 80, branches: 75, statements: 80 },
}
```

**Effort:** Trivial.

### TEST-SKIP-01 — Four unjustified `it.skip` in scheduler tests — **HIGH** — ✅ DONE (`768074a7`)

**File:** `acarshub-backend/src/services/__tests__/scheduler.test.ts:369, 450,
487, 511`.

**Finding.** No comments, no linked issues. Tests cover completion events,
async error handling, lastRun tracking, metadata after each execution — all
important runtime behaviour.

**Remediation.** Either fix and unskip, or document each with a tracking issue
URL and a one-line justification. Prefer fixing.

**Effort:** Low to medium (depends on the underlying fake-timer interaction).

### TEST-GAP-BE — Backend untested files — **HIGH**

**Files:**

- `acarshub-backend/src/utils/logger.ts` — no test
- `acarshub-backend/src/services/decoder-listener.ts` — no test (the **primary
  message ingest service**)
- `acarshub-backend/src/services/station-ids.ts` — no test
- `acarshub-backend/src/db/migrate.ts` — top-level orchestrator has no
  dedicated test (sub-pieces are tested)
- `acarshub-backend/src/db/schema.ts` — no smoke test that tables/indexes
  match expectations
- `acarshub-backend/src/server.ts` — no direct test (E2E/integration only)
- `acarshub-backend/src/startup-state.ts` — covered transitively via
  socket-integration test, but no own-state-machine unit test

**Acceptable to leave untested:** `socket/types.ts`, `db/index.ts`,
`db/queries/index.ts` (all barrels/types).

**Remediation.** Add `__tests__/<name>.test.ts` for each. Prioritise
`logger.ts` (used by every other module) and `decoder-listener.ts` (primary
ingest path).

**Effort:** Medium (one test file per PR).

### TEST-GAP-FE — Frontend untested files — **HIGH**

**Services & infra (critical):**

- `acarshub-react/src/services/socket.ts` — Socket.IO client wrapper, including
  the namespace quirk
- `acarshub-react/src/services/audioService.ts` — alert-sound playback
- `acarshub-react/src/utils/logger.ts` — the mandated logger
- `acarshub-react/src/utils/spriteLoader.ts`
- `acarshub-react/src/utils/version.ts`
- `acarshub-react/src/utils/aircraftIcons.ts`
- `acarshub-react/src/utils/index.ts`
- `acarshub-react/src/hooks/useThemeAwareMapProvider.ts`
- `acarshub-react/src/config/geojsonOverlays.ts`
- `acarshub-react/src/config/mapProviders.ts`
- `acarshub-react/src/App.tsx`

**Pages with no unit test (E2E only):**

- `acarshub-react/src/pages/AboutPage.tsx`
- `acarshub-react/src/pages/LiveMapPage.tsx`
- `acarshub-react/src/pages/StatsPage.tsx`
- `acarshub-react/src/pages/StatusPage.tsx`

**Foundational design-system primitives (untested):**

- `Modal.tsx` (focus-trap logic)
- `Toggle.tsx`, `Select.tsx`, `RadioGroup.tsx`, `TabSwitcher.tsx`
- `Toast.tsx`, `ToastContainer.tsx`
- `Navigation.tsx`
- `ConnectionStatus.tsx`
- `ContextMenu.tsx`
- `ThemeSwitcher.tsx`
- `LogsViewer.tsx`
- `MessageFilters.tsx`
- `AlertSoundManager.tsx`

**Map subsystem (15 of 21 components untested):**

- `Map/AircraftContextMenu.tsx`
- `Map/AircraftMarkers.tsx`
- `Map/AircraftMessagesModal.tsx`
- `Map/AnimatedSprite.tsx`
- `Map/GeoJSONOverlayButton.tsx`
- `Map/HeyWhatsThatOverlay.tsx`
- `Map/MapContextMenu.tsx`
- `Map/MapControlButton.tsx`
- `Map/MapControls.tsx`
- `Map/MapLegend.tsx`
- `Map/NexradOverlay.tsx`
- `Map/OpenAIPOverlay.tsx`
- `Map/RainViewerOverlay.tsx`
- `Map/RangeRings.tsx`
- `Map/StationMarker.tsx`

**Charts (3 of 6 untested):**

- `components/charts/ChartContainer.tsx`
- `components/charts/MessageCountChart.tsx`
- `components/charts/SignalLevelChart.tsx`

**Remediation.** Track in a parent issue with sub-issues per area:

1. Test infra (`socket.ts`, `audioService.ts`, both `logger.ts`) — week 1
2. Form primitives — week 1
3. Toast/notification system, `Modal`, `Navigation`, `ConnectionStatus` — week 2
4. Pages — week 3 (vitest unit + RTL)
5. Map subsystem — week 3-4
6. Charts — week 4

**Effort:** High overall; each individual file is Low.

### TEST-QUALITY-01 — `Card.test.tsx` and `Button.test.tsx` are coverage padding — **MEDIUM**

**Files:**

- `acarshub-react/src/components/__tests__/Card.test.tsx` (504 lines)
- `acarshub-react/src/components/__tests__/Button.test.tsx` (492 lines)

**Finding.** Mostly `it("renders X variant")` micro-tests asserting class names.
Real behavioural tests (focus, keyboard activation, ARIA states, disabled
behaviour) are missing.

**Remediation.**

1. Consolidate variant matrix tests with `it.each(variantTable)`.
2. Add behavioural tests: focus management, keyboard activation
   (Enter/Space → onClick), `disabled` prevents click, ARIA pressed/expanded
   states.

**Effort:** Low. Use `acarshub-backend/src/socket/__tests__/handlers.test.ts`
as the quality template — 64 tests in 14 `describe` blocks with 8 explicit
`regression:` entries.

### TEST-MISSING-INTEGRATION — No backend ingestion-pipeline integration test — **MEDIUM**

**Finding.** Each component (UDP/TCP/ZMQ listener → message-queue → enrichment
→ DB write → ring-buffer → socket emit) is unit-tested in isolation but the
seam between them isn't exercised end-to-end.

**Remediation.** Add `acarshub-backend/src/__tests__/ingestion.integration.test.ts`
that fires a fake UDP datagram, asserts a message lands in the DB, lands in
the ring buffer, and emits via a mock socket.

**Effort:** Medium.

### TEST-MISSING-FE — No regression test for `/main` namespace quirk — **MEDIUM**

**Finding.** AGENTS.md flags this as critical, but no test locks in the
behaviour. Closely related to TYPE-01.

**Remediation.** When adding `services/socket.ts` tests (TEST-GAP-FE), include
explicit assertions that `emitToServer(event, payload)` calls the underlying
emit with `("event", payload, "/main")` and that the namespace can be
overridden.

**Effort:** Trivial (rolls into TEST-GAP-FE).

### TEST-MISSING-A11Y — No component-level a11y unit tests — **LOW**

**Finding.** Accessibility is only tested via Playwright + axe-core in
`e2e/accessibility.spec.ts`. Component-level `vitest-axe` checks would catch
regressions earlier.

**Remediation.** Add `vitest-axe` and a small `expectNoA11yViolations(<Component
/>)` helper. Apply it to the design-system primitives.

**Effort:** Low.

---

## 12. Documentation drift

### DOC-ARCH — `agent-docs/ARCHITECTURE.md` describes a deleted Python stack — **HIGH**

**File:** `agent-docs/ARCHITECTURE.md`.

**Stale claims:**

| Line              | Stale                                                                             | Reality                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 25-26             | "Proxies → Python backend"                                                        | Node/Fastify backend                                                                                                    |
| 32                | "Python Flask Backend (Port 8888)"                                                | Node Fastify on 8888                                                                                                    |
| 35                | "Decoders (libacars)" inside backend                                              | Backend stores already-decoded text                                                                                     |
| 146-154           | "Python 3.x / Flask / Flask-SocketIO / SQLAlchemy / Alembic / RRDtool / libacars" | Node 22+ / Fastify / `socket.io` / Drizzle / better-sqlite3 / Pino / zeromq; custom migration runner                    |
| 158-169           | `rootfs/webapp/acarshub.py` etc.                                                  | `acarshub-backend/src/{server.ts,socket/,db/,services/,formatters/}`; Drizzle migrations in `acarshub-backend/drizzle/` |
| 217-222           | "Flask-SocketIO Quirk" attribution                                                | See DOC-FLASK below                                                                                                     |
| 235-260, 279      | "Python backend" prose                                                            | Node backend                                                                                                            |
| 334               | base image `:python`                                                              | actual Dockerfile uses `:base`                                                                                          |
| 339, 350, 360-361 | "Python Flask backend" services / proxy targets                                   | Node                                                                                                                    |
| 416               | "Flask-SocketIO with gevent"                                                      | Fastify + Node Socket.IO event loop                                                                                     |
| 441               | "SQL injection: protected by SQLAlchemy parameterized queries"                    | Drizzle / better-sqlite3 prepared statements                                                                            |
| 481-484           | "Python logging with rotating file handler"                                       | Pino                                                                                                                    |
| 488               | "Prometheus: /metrics endpoint (Gunicorn stats)"                                  | Custom Node metrics in `services/metrics.ts`                                                                            |
| 496-501           | "Tauri can bundle Python backend as sidecar process"                              | Node sidecar                                                                                                            |
| 505-513           | "Run multiple Python backend instances"                                           | Node instances                                                                                                          |

**Remediation.** Wholesale rewrite of every backend-touching paragraph.
Frontend section (lines 50-141) is accurate and can be left alone. Add a
"backend tech stack" subsection that mirrors the actual `acarshub-backend/package.json`.

**Effort:** Medium.

### DOC-FEAT — `agent-docs/FEATURES.md` partially stale — **MEDIUM**

**Stale points:**

- Lines 16-21: "Server-Side Decoding (libacars)" — backend just stores
  already-decoded text; no libacars binding in `acarshub-backend/package.json`.
- Line 532: "Non-blocking I/O (Flask-SocketIO with gevent)" — Fastify + Node
  event loop.

**Remediation.** Update both passages. Cross-reference the actual ingestion
pipeline (`services/{tcp,udp,zmq}-listener.ts` → `services/message-queue.ts` →
`formatters/enrichment.ts`).

**Effort:** Low.

### DOC-FLASK — Re-investigate the "Flask-SocketIO 3rd-arg quirk" — **MEDIUM** ✅ resolved with TYPE-01/02

**Files:** `AGENTS.md:342-349`, `agent-docs/ARCHITECTURE.md:217-222`,
`dev-docs/CODING_STANDARDS.md:684-687`.

**Finding.** The Node `socket.io` server does not have the bug this rule was
written to work around. The rule is either:

1. Still required because the Node server has been configured to use namespaces
   strictly (test it), or
2. Stale — a historical workaround that is now warming CPU on every emit.

**Remediation.**

1. Write a small standalone test that connects with and without `/main` and
   verifies which behaviour the current backend requires.
2. If (1): keep the requirement, but rename the section ("Required namespace")
   and remove all "Flask-SocketIO" terminology.
3. If (2): remove the requirement, simplify the typed `emitToServer` from
   TYPE-01 (no namespace argument needed), and update the docs.

**Effort:** Low.

### DOC-AGENTS — `AGENTS.md` references Playwright as flake-managed — **LOW**

**File:** `AGENTS.md:198`.

**Finding.** Claims Playwright is provisioned via flake; it isn't (npm-managed
in `acarshub-react/package.json` and `Dockerfile.e2e`).

**Remediation.** Update the Nix Flakes section to clarify that Playwright is
npm-managed, and that the flake provides the system tools (Node, biome, just,
etc.) that wrap it.

**Effort:** Trivial.

### DOC-AGENTS-LIST — `AGENTS.md` documentation index is incomplete — **LOW**

**File:** `AGENTS.md:18-24`.

**Finding.** Lists 7 docs in `agent-docs/`, but five more exist:

- `agent-docs/DECODER_CONNECTIONS.md`
- `agent-docs/MEMORY_OPTIMIZATION.md`
- `agent-docs/MESSAGE_RING_BUFFER.md`
- `agent-docs/DB_OPTIMIZATION.md`
- `agent-docs/DESKTOP_AND_NATIVE_INSTALL_PLAN.md`

**Remediation.** Either link them in AGENTS.md or fold their unique content
into the listed docs.

**Effort:** Trivial.

### DOC-DEV-DOCS — `dev-docs/` is the largest source of drift — **HIGH**

**Files to delete:**

- `dev-docs/PYTHON_DEPENDENCIES.md` — describes deleted `requirements.txt` /
  `pdm.lock`
- `dev-docs/V4_DATABASE_SUMMARY.md` — orphaned + **violates AGENTS.md
  "no summary docs" rule** by filename

**Files to move to `dev-docs/historical/`** (migration is complete, retain for
context):

- `dev-docs/NODEJS_MIGRATION_PLAN.md`
- `dev-docs/API_PARITY.md`
- `dev-docs/TESTING_AUDIT.md`

**Files to rewrite:**

- `dev-docs/DEVELOPMENT.md` — 15+ Flask references (lines 47, 53, 75, 105,
  110-111, 116, 121, 133, 143, 165, 169-173, 206, 226, 230, 232, 238, 243,
  268, 282, 286, 308, 338, 355)
- `dev-docs/README.md` — lines 205-208 list Python stack as the backend
- `dev-docs/SETUP.md:468-472` — references `rootfs/webapp/alembic/versions/`
- `dev-docs/CODING_STANDARDS.md:684-687` — Flask-SocketIO quirk (see DOC-FLASK)
- `dev-docs/ENV_VARS_AUDIT.md:295-300` — Python files as configuration sources

**Files unverified (light review needed):** `BACKEND_SETUP_DECISIONS.md`,
`CONTRIBUTING.md`, `TESTING_GUIDE.md`, `TYPESCRIPT_CHECKING.md`,
`TIMESERIES_STRATEGY.md`.

**Effort:** Medium.

### DOC-ROOT — Repo-root docs drift — **MEDIUM**

- `DEV-QUICK-START.md` — lines 14, 23, 31 claim Nix dev shell provides "Python
  3.13, PDM" (false); line 53 references `just db-init test.db` (recipe doesn't
  exist); lines 66, 69, 87-88, 193, 210, 246-250 reference Flask static dir,
  Flask backend terminal, `alembic/versions/`. **Remediation:** rewrite or
  delete.
- `dev-watch.sh:5` — comment says "rebuilds and copies the assets to the Flask
  static directory" but the script just runs `npm run dev`. **Remediation:**
  fix the comment.
- `acarshub-backend/README.md:3, 13, 130, 133, 203` — written in future tense
  ("This package will contain..."). Migration is complete. **Remediation:**
  rewrite in present tense.
- `acarshub-types/README.md:139` — historical "Python → Node.js backend
  migration" reference. Acceptable but worth noting; clarify as historical.

**Effort:** Low.

### DOC-V4.2 — `agent-docs/V4.2.md` self-aware about drift — **LOW**

**Finding.** Lines 26-27 and 514 explicitly acknowledge the documentation
drift. Phase 0 of that document already calls for an audit — never executed.

**Remediation.** Once DOC-ARCH and DOC-FEAT are complete, mark V4.2 Phase 0 as
done (or remove that phase entirely if V4.2 is itself a historical plan).

**Effort:** Trivial (tracking only).

---

## 13. Repository hygiene

### REPO-01 — Multi-gigabyte binary files at repo root — ❌ FALSE FINDING

**Status:** Audit error. The original finding claimed these files were
"untracked but not gitignored" — wrong. `.gitignore` lines 152-158 already
cover `*.db`, `*.db-shm`, `*.db-wal`, `*.rrd`, `*.rrd.back`, `*.rrd.back2`,
with explicit `!test-fixtures/` allowlist exceptions for the committed
fixtures. Verified with `git check-ignore -v` against every file listed
below; all are properly ignored. No code change required.

**Files (all correctly ignored by existing rules):**

- `acarshub.rrd.back` — ignored by `*.rrd.back` (line 153)
- `messages.db`, `test.db`, `test_back.db`, `messages_large.db` — ignored by `*.db` (line 156)

### REPO-02 — Dead lint configs at repo root — **LOW**

**Files:**

- `.eslintrc` — Biome is the linter; ESLint is not invoked anywhere
- `.eslintignore` — sole entry references a path that doesn't exist
  (`rootfs/webapp/static/js/other/*`)

**Remediation.** Delete both. Biome config in `biome.json` is the source of
truth.

**Effort:** Trivial.

### REPO-03 — `.stylelintrc.json` is unenforced — **LOW**

**File:** `.stylelintrc.json` (106 lines).

**Finding.** Not invoked by `justfile`, `package.json`, or `.pre-commit-config.yaml`.
Biome does not lint SCSS, so if SCSS linting is desired, this file is the
_aspirational_ config that nothing runs.

**Remediation.** Decide:

1. **Wire it up**: add `npx stylelint "acarshub-react/src/**/*.scss"` to
   `just ci` and pre-commit, install stylelint via npm.
2. **Delete it**: if SCSS linting is not a priority, remove the file.

**Effort:** Trivial (decision); Low (if wiring up).

### REPO-04 — Large `geo.json` at repo root — **LOW**

**Files:** `geo.json` (101 KB), `geo.json.meta.json`.

**Finding.** Possibly stale fixture from the Python era; verify if any
backend/frontend code reads it.

**Remediation.** If unused, delete. If used, move to a clearly-named directory
(`test-fixtures/` or `acars_data/`).

**Effort:** Trivial after a `grep -r geo.json` to confirm usage.

### REPO-05 — `.dictionary.txt` orphan check — **LOW**

**File:** `.dictionary.txt` (single line).

**Finding.** Presumably for `cspell`. Verify it's wired into pre-commit; if not,
either wire up or delete.

**Effort:** Trivial.

---

## 14. Miscellaneous nits

### NIT-01 — Hardcoded magic numbers — **LOW**

**Locations:**

- `acarshub-backend/src/socket/handlers.ts:240` — `const chunkSize = 25;`
- `acarshub-backend/src/socket/handlers.ts:383, 736, 779` — `limit = 50`
- `acarshub-backend/src/services/heywhatsthat.ts:314` — `30_000` (30 s timeout)
- `acarshub-backend/src/services/tcp-listener.ts:189` — `setTimeout(1000)`
- `acarshub-backend/src/db/client.ts:124, 139, 158, 160` — pragmas
  (`cache_size = -10000`, `wal_autocheckpoint = 200`,
  `mmap_size = 268435456`)

**Remediation.** Move into `config.ts` with documented defaults and env-var
overrides for ops tunability.

**Effort:** Low.

### NIT-02 — `⚠️` emoji used as semantic warning indicator — **LOW**

**File:** `acarshub-react/src/pages/AboutPage.tsx:341`.

**Finding.** Screen readers announce "warning warning". Should be wrapped or
replaced with the `WarningIcon` component.

**Remediation.**

```tsx
<span aria-hidden="true">⚠️</span> {/* or use the icon component */}
```

**Effort:** Trivial.

### NIT-03 — `MessageGroup.tsx:187` `aria-label` biome-ignore — **LOW**

**File:** `acarshub-react/src/components/MessageGroup.tsx:187`.

**Finding.** Suppression for an a11y rule on a `role="group"`. Verify the
suppression is genuinely required; if not, prefer `aria-roledescription`.

**Effort:** Trivial.

### NIT-04 — Dead/unused exports to verify — **LOW**

- `acarshub-backend/src/db/migrate-worker.ts:111-114` — `MigrateWorkerResult`
  exported; verify external consumers (probably tests).
- `acarshub-backend/src/services/heywhatsthat.ts:158, 211` — `computeConfigHash`
  and `feetAltListToMeters` exported; confirm callers.
- `acarshub-backend/src/services/stats-writer.ts:153` — `writeStatsNow` used
  only in tests; document with a "test/manual trigger" tag.

**Remediation.** Audit each. If used only in tests, mark with a comment or
move to a `__test_helpers__` re-export.

**Effort:** Low.

### NIT-05 — Verify circular imports stay clean — **LOW**

**Finding.** Spot check showed no circular imports. As the codebase splits
god files (GOD-01 through GOD-08), re-verify with `madge --circular` or similar.

**Remediation.** Add a `just check-circular` target running `madge --circular
acarshub-backend/src acarshub-react/src` and wire into CI.

**Effort:** Trivial.

---

## 15. Suggested execution order

This sequence keeps each PR small, testable, and independently reviewable. It
front-loads correctness/security and test infrastructure so later refactors
have a safety net.

### Phase 1 — Stop the bleeding (1-2 days)

| ID           | Description                                        | Status                     |
| ------------ | -------------------------------------------------- | -------------------------- |
| SEC-01       | SQL injection fix + regression test                | ✅ `c0fbc176`              |
| REPO-01      | `.gitignore` root-level `*.db` / `*.rrd*` patterns | ❌ false (already ignored) |
| TEST-SKIP-01 | Address 4 unjustified scheduler `it.skip`          | ✅ `768074a7`              |
| TEST-CFG-01  | Add backend coverage thresholds                    | ✅ `88d44730`              |
| TEST-CFG-02  | Add per-area frontend coverage thresholds          | ✅ `dbed992a`              |

### Phase 2 — High-impact correctness (3-5 days)

| ID                | Description                                                | Status        |
| ----------------- | ---------------------------------------------------------- | ------------- |
| SEC-02            | Escape LIKE wildcards                                      | ✅ `57acc60f` |
| SEC-03            | Zod input validation at every `socket.on(...)`             | ✅ done       |
| LOG-01            | Replace `console.*` with logger (7 sites)                  | ✅ `b80454b9` |
| TYPE-01 + TYPE-02 | Drop dead `, "/main"` 3rd-arg, kill 13 cast sites          | ✅ `5e9b2b76` |
| STATE-01          | Convert `export let alertTerms` to getter                  | ✅ `ede55f53` |
| LEAK-01           | Capture alignment-window `setTimeout` handles (3 services) | ✅ `4b414b30` |
| LEAK-03           | Replace bare `catch {}` in zmq-listener                    | ✅ `7ca13e0b` |
| LOG-04            | Replace `alert()` calls in LogsViewer with Toast           | ✅ done       |

### Phase 3 — Design-language compliance (3-5 days)

| ID                   | Description                                                     | Status        |
| -------------------- | --------------------------------------------------------------- | ------------- |
| SCSS-COLOR-01        | Fix hardcoded `#ffffff` / `#000`                                |               |
| SCSS-TOUCH           | Bump touch targets to ≥44 px                                    |               |
| STYLE-INLINE-STATIC  | Move 8 static inline-style sites to SCSS                        |               |
| STYLE-INLINE-DYNAMIC | Convert 18+ dynamic inline-style sites to CSS custom properties |               |
| NIT-02               | `⚠️` `aria-hidden` fix                                          | ✅ `1c968297` |
| NIT-03               | Verify `MessageGroup` biome-ignore                              |               |

### Phase 4 — Test infrastructure backfill (1-2 weeks)

| ID                             | Description                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| TEST-GAP-FE (services & infra) | `services/socket.ts`, `audioService.ts`, `utils/logger.ts`, `utils/spriteLoader.ts`, `utils/version.ts`, `App.tsx` |
| TEST-GAP-FE (form primitives)  | `Toggle`, `Select`, `RadioGroup`, `TabSwitcher`, `Modal`, `Toast`, `ToastContainer`                                |
| TEST-GAP-BE (services)         | `services/decoder-listener.ts`, `services/station-ids.ts`, `utils/logger.ts`                                       |
| TEST-MISSING-FE                | `/main` namespace regression test                                                                                  |
| TEST-MISSING-INTEGRATION       | Backend ingestion-pipeline integration test                                                                        |
| TEST-QUALITY-01                | Refactor `Card.test.tsx` and `Button.test.tsx`                                                                     |

### Phase 5 — Documentation (3-5 days)

| ID                           | Description                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------- |
| DOC-FLASK                    | Re-investigate Flask-SocketIO namespace requirement (✅ resolved with TYPE-01/02) |
| DOC-ARCH                     | Rewrite ARCHITECTURE.md backend sections                                          |
| DOC-FEAT                     | Update FEATURES.md (libacars, Flask references)                                   |
| DOC-DEV-DOCS                 | Delete/move/rewrite `dev-docs/` files                                             |
| DOC-ROOT                     | Fix `DEV-QUICK-START.md`, `dev-watch.sh`, backend README                          |
| DOC-AGENTS + DOC-AGENTS-LIST | AGENTS.md Playwright + doc index                                                  |
| REPO-02                      | Delete `.eslintrc`, `.eslintignore`                                               |
| REPO-03                      | Decide on `.stylelintrc.json`                                                     |
| REPO-04, REPO-05             | `geo.json`, `.dictionary.txt` orphan check                                        |

### Phase 6 — Continuing test backfill (1-2 weeks)

| ID                            | Description                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| TEST-GAP-FE (pages)           | `LiveMapPage`, `StatsPage`, `StatusPage`, `AboutPage`                                                                                 |
| TEST-GAP-FE (Map subsystem)   | 15 untested map components                                                                                                            |
| TEST-GAP-FE (charts)          | 3 untested chart components                                                                                                           |
| TEST-GAP-FE (everything else) | `Navigation`, `ConnectionStatus`, `ContextMenu`, `ThemeSwitcher`, `LogsViewer`, `MessageFilters`, `AlertSoundManager`, hooks, configs |
| TEST-GAP-BE (the rest)        | `db/migrate.ts` orchestrator, `db/schema.ts` smoke, `startup-state.ts` own-tests                                                      |
| TEST-MISSING-A11Y             | `vitest-axe` for design-system primitives                                                                                             |

### Phase 7 — Architecture refactors (2-4 weeks)

These are independent and can run in parallel branches. Each must keep tests
passing throughout.

| ID                          | Description                                              |
| --------------------------- | -------------------------------------------------------- |
| TYPE-03 through TYPE-08     | Misc TS strictness fixes                                 |
| TYPE-05                     | DB row cast helper                                       |
| LOG-02                      | Logger namespace standardisation                         |
| LOG-03                      | Test skip-condition cleanup                              |
| STATE-02                    | Encapsulate module-level mutable state (one file per PR) |
| LEAK-02                     | TCP/UDP listener reconnect-timer audit                   |
| LEAK-04                     | Backup DB partial-init guard                             |
| ERR-01                      | Standardise `catch (error)` naming                       |
| ERR-02                      | Wrap fire-and-forget `setImmediate`                      |
| ERR-03                      | Document `executeTask` no-throw invariant                |
| GOD-01                      | Split `socket/handlers.ts`                               |
| GOD-02                      | Split `db/migrate.ts` (alongside next migration)         |
| GOD-03                      | Split `db/queries/messages.ts`                           |
| GOD-04                      | Split `services/index.ts`                                |
| GOD-05                      | Split `SettingsModal.tsx` per-tab                        |
| GOD-06                      | Split `utils/aircraftIcons.ts` data/logic                |
| GOD-07                      | Split `useAppStore.ts`                                   |
| GOD-08                      | DRY `AircraftMarkers.tsx` tooltip code                   |
| GOD-09                      | (Deferred) `services/rrd-migration.ts`                   |
| EFFECT-01 through EFFECT-04 | Extract custom hooks from page components                |
| SCSS-MOBILE                 | Mobile-first conversion (one component per PR)           |
| NIT-01                      | Move magic numbers into `config.ts`                      |
| NIT-04                      | Audit dead/unused exports                                |
| NIT-05                      | Add `madge --circular` CI check                          |

### Phase 8 — Cleanup

| ID                   | Description                                                           |
| -------------------- | --------------------------------------------------------------------- |
| DOC-V4.2             | Mark V4.2 Phase 0 done, or remove if V4.2 is itself historical        |
| Delete this document | Per AGENTS.md "no summary docs" rule, once everything above is closed |

---

## Total effort estimate

| Phase                         | Effort                     |
| ----------------------------- | -------------------------- |
| 1. Stop the bleeding          | 1-2 days                   |
| 2. High-impact correctness    | 3-5 days                   |
| 3. Design-language compliance | 3-5 days                   |
| 4. Test infra backfill        | 1-2 weeks                  |
| 5. Documentation              | 3-5 days                   |
| 6. Continuing test backfill   | 1-2 weeks                  |
| 7. Architecture refactors     | 2-4 weeks (parallelisable) |
| 8. Cleanup                    | <1 day                     |

**Grand total:** approximately 6-10 engineer-weeks, with Phases 1-2 (1-2 weeks)
producing the highest correctness/security ROI and Phases 3-5 (1.5-2 weeks)
restoring AGENTS.md compliance. The remaining phases are sustained
maintenance/refactor work that can be scheduled around feature delivery.
