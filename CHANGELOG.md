# ACARS Hub Change Log

## ACARS Hub v4.1.5

### v4.1.5 Bug Fixes

- Alerts: Alert term updates could desynchronise the in-memory alert cache from the database in several ways: adding or removing terms did not purge stale `alert_matches` rows for terms that no longer exist; the message ring buffer was not reheated after term changes, so recently received messages were not re-evaluated against the new term list; and the prune callback could race with a concurrent regeneration, leaving the ring buffer in an inconsistent state. All six desync paths have been fixed and the backend now emits an `alerts_refreshed` event so connected clients know when to reload alert state.
- Live Messages: Unsaved messages (those that arrive between database writes) were all assigned a placeholder `uid` of `undefined`, which React used as a duplicate key, causing rendering bugs when multiple unsaved messages appeared in the same list. Each unsaved message now receives a unique generated UID based on timestamp and a random suffix.
- Database: Migrations 13–14 remove the `uid` TEXT column from the `messages` table and switch `alert_matches.message_uid` to `alert_matches.message_id` (INTEGER), aligning all foreign-key references with the autoincrement `id` primary key. This eliminates a redundant UUID column and the index that supported it.

### v4.1.5 Performance

- Backend: The timeseries statistics cache has been restructured into a tiered architecture. Instead of holding all eight time-period datasets in memory simultaneously, only the active period requested by connected clients is kept fully materialised. Cache warm-up and refresh cycles are staggered so that startup memory consumption is spread over time rather than spiking on first connection.
- Backend: A message ring buffer replaces the previous unbounded in-memory message list for on-connect state delivery. The buffer holds a fixed window of recent messages and recent alerts, capping memory usage regardless of message volume. New clients receive the ring buffer contents on connect rather than triggering a database query.
- Database: `regenerateAllAlertMatches` now uses batch reads and wraps all inserts in a single transaction, reducing I/O and lock contention on large databases.
- Database: Unnecessary indexes on the `timeseries_stats` table are no longer created during migrations, reducing migration time and database size.
- Docker: The Dockerfile now copies only `package.json` manifests before `npm ci`, so the dependency layer survives source-only edits and Docker can cache it independently [(1)](#v415-n1).

### v4.1.5 New

- Settings: Alert term management (add, remove, ignore, regenerate) has been split out of the Notifications tab into its own dedicated Alerts tab in the Settings modal. The Notifications tab now contains only notification delivery settings (desktop notifications, sound, volume, on-page alerts).
- Messages: Bump `@airframes/acars-decoder` to 1.8.13 [(2)](#v415-n2).
- Data: TRACON boundaries updated to v1.2.6; FIR boundaries updated to v2602.2.
- Docker: Log timestamps now use `s6-wrap` instead of piping to `awk`, reducing process overhead and simplifying the logging pipeline [(1)](#v415-n1).

### v4.1.5 Improvements

- Backend: RRD migration memory footprint reduced — the importer now streams data in smaller batches rather than loading entire RRD files into memory at once [(1)](#v415-n1).

### v4.1.5 Notes

1. <a id="v415-n1"></a>Credit to [@wiedehopf](https://github.com/wiedehopf) for the Dockerfile caching improvement in PR [#1652](https://github.com/sdr-enthusiasts/docker-acarshub/pull/1652), the s6-wrap logging change, and the RRD migration memory reduction.
2. <a id="v415-n2"></a>Credit to [@makrsmark](https://github.com/makrsmark) for updating `@airframes/acars-decoder` to 1.8.13 in PR [#1650](https://github.com/sdr-enthusiasts/docker-acarshub/pull/1650).

## ACARS Hub v4.1.4

### v4.1.4 Bug Fixes

- Stats page: Signal Level, Alert Terms, and Frequency Distribution charts now correctly flex-fill the available viewport height without overflowing the page. All three chart components were bypassing the fill-height flex chain — Signal Level had no wrapper class, and Alert Terms / Frequency Distribution used fixed inline pixel heights with `contain: layout` preventing the flex shrink mechanism from clamping them. All three now use `className="chart__canvas-wrapper"` and the inline styles have been removed.
- Live Messages / Alerts: When a duplicate message is promoted to the front of its card group, the incoming message's matched/alert metadata is now correctly merged forward. Previously the promoted card retained the existing message's `matched=false` state even if the newer copy carried `matched=true`, causing alert styling, `has_alerts`, and alert counts to be incorrect. Matched state can only transition false → true, never true → false. Matched term arrays (`matched_text`, `matched_icao`, `matched_tail`, `matched_flight`) are deduplicated and merged across both copies. If the promoted message had previously been marked as read, its read state is also reset so the newly-relevant card re-appears as unread.
- Alerts: The per-card Mark Read button on mobile now renders in a correct two-row CSS Grid layout: the button appears top-right, and the message timestamp wraps to a full-width second row. Non-alert cards (which have no button) are unaffected by the grid rule.
- Alerts: The page-level Mark All Read button is now placed in the title row on mobile, appearing as a direct flex sibling of the page title. On mobile, `space-between` aligns the title left and the button right on the first row, with the message statistics wrapping to a full-width row below. On desktop the original end-of-stats-row grouping is preserved via CSS `order`.
- Database: IMSL frequency distribution on the Status page was permanently empty. `normalizeMessageType("IMSL")` returns `"IMS-L"` (matching Python's DB storage format), but `updateFrequencies()` in `helpers.ts` only had `"IMSL"` as a lookup key — not `"IMS-L"`. Every IMSL message silently fell through to the unknown-type warn branch without writing to `freqs_imsl`. Fixed by adding `"IMS-L": freqsImsl` to the map, mirroring the existing `"VDL-M2"` / `"VDLM2"` dual-entry pattern. Regression test added that fails without the fix.
- Navigation: The "ACARS Hub" text next to the logo image is now hidden between 768 px and 850 px viewport widths, where the number of nav bar elements would otherwise cause it to word-wrap. The image logo alone identifies the app at this range; the text reappears at 851 px and above.
- Status page: The rolling messages-per-minute rate was showing a coarse per-minute counter (reset at each minute boundary) instead of the rolling 60-second rate, and the value only refreshed on the 10-second `request_status` poll rather than the 5-second `message_rate` emit. Fixed by reading `getRollingRates()` for the initial `system_status` response, emitting `message_rate` alongside `system_status` on `request_status`, and having the Status page use the store's live `messageRate` value (updated every 5 seconds) as its primary source for the Rate (1 min) display.
- Database: Running several migrations in sequence triggered multiple VACUUM stalls. Consolidated VACUUM and ANALYZE so they run exactly once at the end of `runMigrations()`, only when at least one migration step executed or the FTS startup repair rebuilt the virtual table. ANALYZE now runs after VACUUM so the query planner sees the final compacted page layout.
- Live Map: Collapsing the aircraft-list sidebar at tablet viewport widths (768 px–1023 px) left the sidebar at ~280 px instead of the expected 40 px collapsed strip. A `min-width: 280px` rule applied to the sidebar in that breakpoint range was overriding the JS-driven `--map-sidebar-width: 40px` CSS custom property. Fixed by adding a `&--collapsed` override inside the tablet breakpoint block that resets `min-width` to `0` and `max-width` to `none`, allowing the CSS variable to take full effect.
- Status page: Value labels on the Alert Terms and Frequency Distribution horizontal bar charts no longer overlap the row (Y-axis) labels when a bar represents a very small count. Labels now use dynamic positioning: bars whose value is less than 15% of the axis maximum place their label outside and to the right of the bar tip (using the theme text colour, no pill background); taller bars continue to place the label inside the bar at its right end (dark text on the coloured pill). This preserves the original intent of keeping labels for large-value bars inside the chart boundary while eliminating the overlap for small-value bars.
- Statistics: The RRD → SQLite import pipeline had two bugs that caused the Reception Over Time charts to show incorrect zero values and a data gap after migration. (1) Coarse archive points (5-min, 1-hour, 6-hour) were expanded forward in time instead of backward: `rrdtool` returns the timestamp at the _end_ of a consolidation period, so the old code placed historical data at wrong future timestamps, permanently squatting slots the live stats-writer needed. (2) Time slots with no RRD source data (the gap between the RRD's `last_update` and the import time) were inserted as all-zero rows instead of being skipped, producing false zero counts. Both bugs are fixed: coarse points now expand backward, and all-NaN rows are skipped entirely. Future-dated rows are clamped to `Date.now()` as an additional safeguard. On the next startup after this update the importer automatically detects and repairs databases affected by the old code: rows in the corrupted time ranges are deleted and a clean re-import is performed.

### v4.1.4 Performance

- Statistics: The Stats page time-series graphs (Reception Over Time) no longer query the database on every user request or period change. The backend now warms all eight time-period cache entries in memory at startup and refreshes each on a wall-clock-aligned schedule (every 1 minute for the 1 hr/6 hr/12 hr windows, scaling up to every 12 hours for the 1-year window). Refreshed results are broadcast to all connected clients automatically — no client request is needed. The frontend receives these pushes through the global `useSocketIO` handler and stores all eight period results in a Zustand in-memory cache; switching between time periods on the Stats page is now instant with no loading delay once the initial warm-up response has arrived (within one round-trip of connecting).

- Live Messages: The message list is now rendered as a virtual windowed list using `@tanstack/react-virtual`. Only the ~7 message cards visible in the viewport are mounted in the DOM at any time, down from ~90 fully-mounted trees previously. On busy stations this eliminates the UI lag that accumulated as the message list grew. Theme switching, which previously had to cascade CSS variable changes through every mounted card, is now instant.
- Alerts: The alert message list (both live and historical modes) is now also virtualised, using the same architecture as Live Messages.
- Search: Search results are now rendered as a virtual list. The search form itself remains fully scrollable on all screen sizes.

### v4.1.4 New

- Scroll to top: A floating action button (FAB) appears on mobile devices after scrolling 150 px and smoothly returns to the top of the current page. The FAB is suppressed on the ADS-B map page, which manages its own scroll context. On desktop, clicking the currently-active navigation link also scrolls back to the top of the page, giving keyboard and mouse users an equivalent shortcut. Pages with virtualised lists (Live Messages, Alerts) register their custom scroll containers so both the FAB and the nav re-click always target the correct element.

- Database: Migration 12 — the `timeseries_stats` table has been rebuilt to remove three dead-weight columns (`id`, `resolution`, `created_at`) and replace them with `timestamp INTEGER PRIMARY KEY`. `resolution` was a non-nullable constant (`'1min'`) on every row; `id` is superseded by the timestamp rowid alias; `created_at` was set on insert and never read. The new schema saves ~20 bytes per row with zero index overhead beyond the table B-tree itself.
- Docker: The frontend now shows a "Database migration in progress" banner while the backend applies SQLite migrations at startup. The HTTP and Socket.IO servers start before migrations begin; clients that connect during the migration window receive `migration_status { running: true }` and are held in a pending queue until all initialisation is complete, then receive the full connect sequence.
- Message rate widget: A rolling messages-per-minute counter is now displayed in the navigation bar. On desktop, hovering or focusing the widget expands a tooltip showing the rate broken down by decoder type (ACARS, HFDL, VDL-M2, etc.). On mobile devices with a screen width of 375 px or wider the total rate is shown directly in the nav bar.
- Status page: A "Rolling Rate" row has been added to the Message Statistics card for each enabled decoder, showing the same rolling 60-second rate as the nav bar widget.
- Search: The search form now auto-collapses when you scroll more than 80 px into the results. A sticky header pins to the top of the viewport while collapsed, showing a summary of the active search criteria and a button to expand the form again. Clicking the expand button scrolls back to the top and reopens the form.
- Search: All text search inputs are now automatically normalised to uppercase as you type, matching the way messages are stored in the database and eliminating missed results caused by case differences.
- Messages: Any portion of a message that the decoder recognised but could not fully decode is now shown as "Remaining Text" in the message detail view, rather than being silently discarded [(1)](#v414-n1)
- Messages: Bump `acars-decoder` version to 1.8.8
- Label the y axis on Reception over time graphs with the message count per time slot.

### v4.1.4 Improvements

- Navigation: The mobile and desktop navigation bars are now conditionally rendered — only the layout appropriate for the current screen size is mounted. Previously both trees were always present in the DOM with CSS toggling visibility, which meant React was maintaining two full navigation trees, their event listeners, and active-link tracking simultaneously.

### v4.1.4 Notes

1. <a id="v414-n1"></a>Credit to [@makrsmark](https://github.com/makrsmark) for the remaining text feature in PR [#1637](https://github.com/sdr-enthusiasts/docker-acarshub/pull/1637).
2. <a id="v414-n2"></a>Credit to [@makrsmark](https://github.com/makrsmark) for updating `acars-decoder` to 1.8.8 in PR [#1639](https://github.com/sdr-enthusiasts/docker-acarshub/pull/1639)

## ACARS Hub v4.1.3

### v4.1.3 Bug Fixes

- Database: FTS5 tombstone accumulation on high-volume installs (HFDL + VDL-M2) caused the search index shadow tables to grow to hundreds of thousands of segments and several gigabytes. Every new message insertion then triggered FTS5 automerge to block the database thread for seconds, stalling message ingestion entirely. Root cause: `optimizeDbMerge()` was calling `merge(-16)` which performs only ~64 KB of consolidation work per call — completely unable to keep pace with tombstone generation at high message rates. Fixed by: (1) adding database migration 10 which drops and recreates all FTS tables and triggers and rebuilds the index from scratch (one-time startup cost; expect 5–30 minutes on a large database — no data is lost); (2) increasing the merge work per call from `merge(-16)` (~64 KB) to `merge(500)` (~2 MB); (3) adding a new `optimizeDbFts()` function that runs FTS5 `optimize` — a closed-loop operation that consolidates all b-tree levels until fully done, regardless of how much work is required. `merge(500)` runs every 5 minutes for cheap bounded housekeeping; `optimize` runs every 30 minutes as a correctness guarantee. Together they ensure segment count stays bounded on any deployment size.
- Database: WAL checkpoint threshold lowered further from 400 pages (~1.6 MB) to 200 pages (~800 KB) to keep the WAL file small between scheduled TRUNCATE checkpoints on high-volume installs (HFDL can sustain 1,000+ messages/minute). A TRUNCATE-mode checkpoint now also runs at startup in addition to the existing 15-minute scheduled run.
- Database: Added `checkpointBackup()` — the scheduled WAL checkpoint was only applied to the primary database connection, leaving the backup WAL (`DB_BACKUP`) to grow without bound. The backup connection is now checkpointed on the same schedule as the primary.
- Database: WAL mode activation is now verified on startup. On file systems that do not support shared-memory files (some NFS mounts, certain bind-mounts), SQLite silently falls back to DELETE journal mode. ACARS Hub now detects this and logs an error so operators know the WAL strategy is inactive before a disk-full condition occurs.
- Database: Timeseries statistics data (`timeseries_stats`) could be imported from RRD more than once, doubling (or further multiplying) the historical graph data on each restart after the initial migration. Fixed by database migration 11 which: (1) deduplicates any existing duplicate rows, keeping the highest-ID survivor per time slot; (2) upgrades the non-unique index on `(timestamp, resolution)` to a `UNIQUE INDEX` so the database itself enforces one data point per time slot going forward; (3) creates a new `rrd_import_registry` table that stores a SHA-256 content fingerprint of each imported RRD file. On startup, if the fingerprint of the `.rrd` file is already registered the import is skipped entirely — this catches re-imports regardless of filename. All batch inserts now use `INSERT OR IGNORE` so even if the registry check is somehow bypassed, the unique constraint silently discards duplicate rows.
- Statistics: Frequency and alert term charts now render bars sorted from highest to lowest count. Previously bars were rendered in data-arrival order, making the charts difficult to read.

### v4.1.3 New

- Alerts: `VOMIT` and `HAZMAT` added as default alert terms

## ACARS Hub v4.1.2

### v4.1.2 Bug Fixes

- Database: The WAL (Write-Ahead Log) file could grow unboundedly because SQLite's default `PASSIVE` auto-checkpoint is silently skipped whenever any read transaction is open. With the system-status emitter creating short read transactions every 30 seconds there was almost always a recent read mark, so un-checkpointed FTS5 writes accumulated in the WAL indefinitely. Fixed by lowering the auto-checkpoint threshold from 1000 pages (~4 MB) to 400 pages (~1.6 MB), and by adding a scheduled `TRUNCATE`-mode checkpoint every 15 minutes. `TRUNCATE` mode checkpoints every pending frame and truncates the WAL file to zero bytes, immediately reclaiming disk space.
- Database: `pruneDatabase()` loaded all alert-protected message UIDs into a JavaScript array and passed them as SQL bind parameters via `NOT IN (?, ?, …)`. With long `DB_ALERT_SAVE_DAYS` values and active alert terms, this list could exceed SQLite's `SQLITE_MAX_VARIABLE_NUMBER` limit (default 999), causing an `SQLITE_ERROR` on every prune run and preventing the database from ever shrinking. Fixed by replacing the two-step fetch-then-bind approach with a single `DELETE … WHERE uid NOT IN (SELECT message_uid FROM alert_matches WHERE …)` subquery that SQLite resolves entirely in-engine with no parameter-count ceiling.
- Database: `checkpoint()` parsed `PRAGMA wal_checkpoint` results incorrectly in two ways. First, `better-sqlite3`'s `{ simple: true }` option returns only the first column of the first row as a scalar (the `busy` flag), not an array — so `framesCheckpointed` and `framesRemaining` were both `undefined` at runtime, making the scheduled checkpoint warning impossible to trigger. Second, even if indexing had been correct, the column mapping was inverted: `framesCheckpointed` was reading the `log` column (total frames written to WAL) and `framesRemaining` was reading the `checkpointed` column (frames already moved to the main DB — the opposite of remaining). Fixed by dropping `{ simple: true }`, accessing columns by name, and computing `framesRemaining = row.log - row.checkpointed`.
- Database: The backup database connection (`DB_BACKUP`) was missing the `wal_autocheckpoint = 400` pragma that is applied to the primary connection. Without it, the backup WAL defaulted to SQLite's 1000-page threshold and could grow unbounded under the same workload conditions that triggered the original `SQLITE_FULL` errors. The pragma is now applied to both connections during initialisation.
- Healthcheck: Every decoder socket check has always reported UNHEALTHY due to a wrong process name in the `ss(8)` filter. The Node.js worker thread that owns decoder sockets appears in the process table as `node-MainThread`, not `node`, so `grep '"node"'` never matched and the socket check silently returned nothing regardless of actual connection state. Additionally, even a correctly named filter can fail in container environments where the kernel does not expose the `users:((...))` column to the caller. Fixed by checking for the bound/connected port only (no process name filter — the decoder ports are container-specific and no other process will hold them). The socket check is also now advisory: a failed socket check no longer sets an unhealthy exit code on its own. `EXITCODE=1` is only raised when both the socket check and the message-activity check fail simultaneously, so a container receiving messages is never incorrectly marked unhealthy.

### v4.1.2 New

- Alerts: `drunk` added as a default alert term

## ACARS Hub v4.1.1

### v4.1.1 Improvements

- Docker image: reduced size by approximately 850 MB compared to v4.1.0
  - Build stage: compiler toolchain (`make`, `python3`, `g++`, `cmake`) no longer leaves artifacts in the final image — tools are installed and used in the build stage where they are already present, then the compiled output is copied across [(1)](#v411-n1)
  - Runtime stage: the backend is now bundled with esbuild into a single file (`server.bundle.mjs`). All pure-JS dependencies (fastify, socket.io, drizzle-orm, pino, zod, etc.) are inlined into the bundle. Only the two native addons (`better-sqlite3` and `zeromq`) remain in `node_modules` at runtime, reducing the runtime `node_modules` footprint from ~66 MB to ~11 MB
  - Runtime stage: `npm` is no longer included in the image — it is not needed at runtime
- nginx: eliminated startup warnings about duplicate `text/html` MIME type in the compression configuration (`text/html` is always compressed by nginx and does not need to be listed explicitly)
- Healthcheck: rewritten for the Node.js backend architecture

### v4.1.1 Documentation

- README and setup guide: tone, accuracy, and clarity improvements

### v4.1.1 Notes

1. <a id="v411-n1"></a>Credit to [@wiedehopf](https://github.com/wiedehopf) for the initial compiler and `node_modules` pruning work in PR [#1632](https://github.com/sdr-enthusiasts/docker-acarshub/pull/1632) that this builds on.

## ACARS Hub v4.1.0

### v4.1.0 New

- Backend: completely rewritten in Node.js
- Backend: Connect to `acars_router` or decoders directly via TCP/ZMQ [(2)](#v410-n2)
- Front End: Reduced initial load time and bandwidth for all deployment types
- Database: Time series data is now stored in the main SQLite database and migrated automatically from RRD on first run
- Message Groups: Instead of showing a generic "ADS-B" label, the actual source type is now shown (ADS-B/UAT/TIS-B/ADSC etc.)
- Live Messages: Filter by station ID
- Live Map: ADS-B source type is displayed on mouse hover of an aircraft
- Live Map: Updated sprites to latest from Plane Watch (BL8 and C206 added)
- Live Map: Aircraft markers outside the viewport are no longer rendered — improves performance on HFDL and other long-range deployments
- Live Map: Side bar filter option to show only aircraft currently visible on the map
- Live Map: Side bar is now resizable and collapsible
- Live Map: Side bar badges indicate which decoder type(s) received each aircraft, replacing the generic green checkmark with a colour-coded badge. At minimum width only the most recent decoder type is shown; expand the sidebar to see all badges for aircraft received on multiple decoder types
- Live Map: Worldwide TRACON boundary overlay [(1)](#v410-n1)
- Live Map: Worldwide FIR boundary overlay [(1)](#v410-n1)
- Live Map: Hey What's That support. Enable with `HEYWHATSTHAT=<token>`. Optionally specify the altitudes to display with `HEYWHATSTHAT_ALTS=<comma-separated list of altitudes in feet, no units>`
- Mobile Live Map: Additional map controls collapse into a flyout menu at smaller breakpoints

### v4.1.0 Bug Fixes

- Database: Migration from **any** version of ACARS Hub prior to v4 incorrectly skipped FTS table rebuilds. New databases created in v4 are unaffected. The database will repair itself automatically if the issue is detected — this may take some time on large databases, but no data is lost.
- Network: Removed IPv6 binding in nginx that caused container startup failures on some host configurations
- Live Map: Panning and zooming no longer hides overlays or re-requests overlay data from the server on every interaction
- Live Map: Zoom In/Out buttons now render above aircraft markers

### v4.1.0 Notes

1. <a id="v410-n1"></a>Worldwide TRACON and FIR boundary data is sourced from VATSIM — a community of flight simulation enthusiasts who volunteer as virtual ATC controllers. The data appears to be derived from real ATC boundaries: US coverage is largely accurate (Amarillo Approach is close but not quite right), though I cannot independently verify accuracy for non-US regions. As an FAA employee, I won't use my work access to pull official data for comparison in order to avoid any conflict of interest.

2. <a id="v410-n2"></a>By default, ACARS Hub will behave exactly as before — no change is required and message ingestion is unaffected.

   The new `<ACARS/VDLM/HFDL/IRDM/IMSL>_CONNECTIONS` variables optionally allow ACARS Hub to connect out to `acars_router` or the decoders directly, rather than waiting for them to push data in. Multiple sources per decoder type are supported. This is now the recommended setup.

   Example configuration:

   ```yaml
   ACARS_CONNECTIONS=udp                          # default — no change needed
   ACARS_CONNECTIONS=udp://0.0.0.0:42069          # UDP on a custom port
   HFDL_CONNECTIONS=zmq://acars_router:15556      # connect to acars_router over ZMQ
   VDLM_CONNECTIONS=udp;zmq://acars_router:45555  # listen on UDP and also connect via ZMQ
   ```

   The `_CONNECTIONS` variables are ignored if the corresponding `ENABLE_` variable is not set. If you migrate to the outbound connection model, remove `acarshub` from your `AR_SEND_UDP` variables to avoid log spam from `acars_router` attempting to push to an offline host.

   Documentation has been updated to reflect the new recommended setup.

## ACARS Hub v4.0.1

### v4.0.1 Bug Fixes

- Live Map Side bar: Hovering over plane in the side bar no longer causes the plane to change heading
- Live Map: Mobile pinch to zoom is fixed

### v4.0.1 New

- Re-add functionality to generate <yourip><:port>/data/stats.json

## ACARS Hub v4.0.0

### v4.0.0 New

- Complete rewrite of the web front end
- Desktop notifications
- Unified Settings, localization, custom map provider(S), and so much more
- Improved statistics
- Live map: layers, pausing, follow aircraft, filters, animated sprites...
- Improved searching/alert matching
