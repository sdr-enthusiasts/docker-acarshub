# ACARS Hub - System Architecture

This document describes the technical architecture of ACARS Hub.

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              React Application (Vite)                   │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │ │
│  │  │  Pages   │  │  Stores  │  │ Services │             │ │
│  │  │ (Routes) │  │ (Zustand)│  │(Socket.IO)│             │ │
│  │  └──────────┘  └──────────┘  └──────────┘             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ WebSocket (Socket.IO)
                           │ HTTP (static assets)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      nginx (Port 80)                         │
│  • Serves React static files from /webapp/dist              │
│  • Proxies /socket.io/* → Node.js backend (127.0.0.1:8888)  │
│  • Proxies /metrics, /health, /data/* → backend             │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Proxy
                           ▼
┌─────────────────────────────────────────────────────────────┐
│           Node.js Backend (Fastify, Port 8888)               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Socket.IO   │  │   Database   │  │  Listeners   │     │
│  │  (/main ns)  │  │ (SQLite +    │  │ (TCP/UDP/    │     │
│  │              │  │  Drizzle)    │  │  ZMQ)        │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ TCP / UDP / ZMQ
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Radio Decoders (External)                   │
│  • acarsdec (ACARS, links libacars)                          │
│  • vdlm2dec / dumpvdl2 (VDL Mode 2, links libacars)          │
│  • dumphfdl (HFDL, links libacars)                           │
│  • acars_router (aggregator / fan-out)                       │
└─────────────────────────────────────────────────────────────┘
```

See `agent-docs/DECODER_CONNECTIONS.md` for the authoritative reference
on decoder ingress (TCP / UDP / ZMQ wiring, fan-in, `ENABLE_<TYPE>`
gating, listener abstraction).

## Frontend Architecture

### Technology Stack

- **React 19** — UI framework
- **TypeScript** — Type safety (strict mode, no `any`)
- **Vite** — Build tool and dev server
- **Zustand** — State management
- **Socket.IO Client** — Real-time communication
- **React Router** — Client-side routing
- **MapLibre GL JS** — Map rendering
- **Chart.js** — Statistics visualisation
- **SCSS** — Styling with Catppuccin theming

### Directory Structure

```text
acarshub-react/
├── src/
│   ├── components/          # Reusable React components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx
│   │   ├── Navigation.tsx
│   │   └── ...
│   ├── pages/               # Route components
│   │   ├── LiveMessagesPage.tsx
│   │   ├── LiveMapPage.tsx
│   │   ├── AlertsPage.tsx
│   │   ├── SearchPage.tsx
│   │   ├── StatsPage.tsx
│   │   ├── StatusPage.tsx
│   │   └── AboutPage.tsx
│   ├── store/               # Zustand stores
│   │   ├── useAppStore.ts        # Global app state
│   │   └── useSettingsStore.ts   # User preferences
│   ├── services/            # External integrations
│   │   ├── socket.ts             # Socket.IO client
│   │   └── audioService.ts       # Sound alerts
│   ├── hooks/               # Custom React hooks
│   │   └── useSocketIO.ts
│   ├── utils/               # Utility functions
│   │   ├── logger.ts             # Logging system
│   │   ├── dateUtils.ts
│   │   ├── stringUtils.ts
│   │   ├── alertMatching.ts
│   │   ├── decoderUtils.ts
│   │   └── messageCulling.ts
│   ├── types/               # TypeScript interfaces (re-exports @acarshub/types)
│   │   └── index.ts
│   └── styles/              # SCSS modules
│       ├── _variables.scss
│       ├── _mixins.scss
│       ├── _themes.scss
│       ├── components/
│       └── pages/
├── public/                  # Static assets
└── e2e/                     # Playwright E2E tests
```

### State Management

**AppStore** (Zustand):

- Message groups (aircraft with messages)
- ADS-B aircraft positions
- Alert terms and counts
- System status
- Connection state
- Enabled decoders

**SettingsStore** (Zustand with persistence):

- Theme (Mocha/Latte)
- Time/date format
- Notification preferences
- Map settings
- Data management settings

**Persistence**: SettingsStore uses Zustand middleware to persist to localStorage.

### Routing

React Router with 7 routes:

- `/` — Live Messages (default)
- `/live-map` — Aircraft map
- `/alerts` — Filtered alert messages
- `/search` — Database search
- `/stats` — Statistics and graphs
- `/status` — System health
- `/about` — Help and information

## Backend Architecture

### Backend Technology Stack

- **Node.js 22+** — Runtime
- **TypeScript** (strict mode) — Language
- **Fastify** — HTTP server (`@fastify/cors` for CORS)
- **Socket.IO 4.x** — WebSocket layer, `/main` namespace
- **Drizzle ORM** — SQLite query builder and schema definition
- **better-sqlite3** — Synchronous SQLite driver
- **Custom migration runner** (`src/db/migrate.ts`) — applies an
  Alembic-revision-keyed migration chain (revision IDs preserved for
  backward compatibility with databases provisioned under the retired
  Python backend); not Alembic, not Drizzle Kit migrations at runtime
- **ZeroMQ** (`zeromq` npm package) — optional ZMQ ingress for decoders
- **Pino** — Structured logging
- **Zod** — Environment variable validation
- **node-rrd / RRDtool** — Time-series statistics (transitioning to
  SQLite `timeseries_stats` table — see `agent-docs/MEMORY_OPTIMIZATION.md`)
- **prom-client** — Prometheus metrics

### Backend Directory Structure

```text
acarshub-backend/
├── src/
│   ├── server.ts                # Fastify + Socket.IO entry point
│   ├── config.ts                # Zod-validated env config
│   ├── startup-state.ts         # Shared startup state container
│   ├── db/
│   │   ├── client.ts            # Drizzle + better-sqlite3 wiring
│   │   ├── schema.ts            # Drizzle table definitions
│   │   ├── migrate.ts           # Migration runner (Alembic-keyed chain)
│   │   ├── migrate-worker.ts    # Background migration worker
│   │   ├── helpers.ts
│   │   ├── index.ts
│   │   └── queries/             # alerts.ts, messages.ts, messageTransform.ts, statistics.ts
│   ├── socket/                  # Socket.IO /main namespace
│   │   ├── index.ts             # initializeSocketServer()
│   │   ├── handlers.ts          # event handlers
│   │   ├── schemas.ts           # Zod schemas for inbound payloads
│   │   ├── validatedHandler.ts  # handler wrapper applying schemas
│   │   └── types.ts
│   ├── services/                # Background services
│   │   ├── decoder-listener.ts  # Listener abstraction + factory
│   │   ├── tcp-listener.ts      # TCP ingress
│   │   ├── udp-listener.ts      # UDP ingress
│   │   ├── zmq-listener.ts      # ZeroMQ ingress
│   │   ├── adsb-poller.ts       # aircraft.json poller
│   │   ├── message-queue.ts     # In-process queue (decoder → formatter)
│   │   ├── message-ring-buffer.ts  # On-connect warm-state ring buffer
│   │   ├── stats-writer.ts      # Signal/frequency table writes
│   │   ├── stats-pruning.ts
│   │   ├── timeseries-cache.ts
│   │   ├── rrd-migration.ts     # RRD → SQLite timeseries migration
│   │   ├── scheduler.ts         # Cron-style task scheduler
│   │   ├── metrics.ts           # Prometheus registry
│   │   ├── station-ids.ts
│   │   └── heywhatsthat.ts
│   ├── formatters/
│   │   ├── index.ts             # Per-decoder formatters (ACARS, VDLM2, HFDL, IMSL, IRDM)
│   │   └── enrichment.ts        # Label decoding, alert matching, dedup
│   ├── utils/                   # Logger (Pino), shared helpers
│   └── __tests__/
└── package.json
```

### Database Schema

Schema defined in `src/db/schema.ts` (Drizzle). FTS5 virtual tables
and triggers live in the migration chain (`src/db/migrate.ts`) rather
than in `schema.ts`, because Drizzle does not model virtual tables.

**Tables**:

- `messages` — All received ACARS messages
- `messages_fts` — FTS5 virtual table (search index over `messages`); kept in
  sync by triggers
- `alert_matches` — Messages matching alert terms
- `alert_stats` — Per-term match counters
- `ignore_alert_terms` — Suppress-list for alerts
- `count`, `nonlogged_count` — Total / dropped message counters
- `level_acars`, `level_vdlm2`, `level_hfdl`, `level_imsl`, `level_irdm` —
  Signal level statistics per decoder
- `freqs_acars`, `freqs_vdlm2`, `freqs_hfdl`, `freqs_imsl`, `freqs_irdm` —
  Frequency statistics per decoder
- `timeseries_stats` — Compact time-series counters (replacing RRD; see
  `agent-docs/MEMORY_OPTIMIZATION.md`)
- `rrd_import_registry` — Tracks one-time RRD → SQLite imports

**Full-Text Search**:

- `messages_fts` — FTS5 virtual table over message content
- `messages_fts_insert` / `_delete` / `_update` triggers keep the FTS
  index in sync with `messages`
- The migration chain rebuilds the FTS index when its schema changes
  (revisions `c3d4e5f6a1b2` rebuild_fts and `94d97e655180`
  create_messages_fts_table_and_triggers)

### HTTP Endpoints

- `/` — JSON service banner (`{ name, version }`)
- `/health` — Liveness probe
- `/metrics` — Prometheus metrics (`prom-client` registry)
- `/data/heywhatsthat.geojson` — heywhatsthat.com terrain overlay (cached)
- `/data/stats.json` — Aggregated stats snapshot
- `/socket.io/*` — Socket.IO handshake and long-poll fallback (proxied
  through nginx)

### Socket.IO Events

Namespace bound at construction time via `io.of("/main")` in
`socket/index.ts`. Frontend connects to `${origin}/main`. **Emits do
not pass a namespace argument** — that was a Flask-SocketIO Python-client
quirk that was eliminated when the backend was ported to Node Socket.IO
v4. See `AGENTS.md:342-349` for the rule and `agent-docs/REMEDIATION_PLAN.md`
DOC-FLASK for the resolution history.

**Server → Client**:

- `acars_msg` — New ACARS message
- `adsb_aircraft` — ADS-B aircraft positions
- `system_status` — Backend health status
- `terms` — Alert term updates
- `database_search_results` — Search results
- `signal_freqs` — Frequency statistics
- `signal_count` — Message count statistics
- `rrd_timeseries` — Time-series graph data
- `labels` — Message label definitions
- `decoders` — Enabled decoder configuration
- `features_enabled` — Feature flags

**Client → Server**:

- `query_search` — Database search request
- `update_alerts` — Update alert terms
- `request_status` — Request system status
- `signal_freqs` — Request frequency data
- `rrd_timeseries` — Request time-series data

The Socket.IO API contract is defined by `SocketEvents` and
`SocketEmitEvents` in `@acarshub/types/socket` and shared verbatim
between frontend and backend (no duplication).

## Data Flow

### Message Processing Pipeline

```text
Radio Decoder → TCP/UDP/ZMQ → Node.js Backend → SQLite → Socket.IO → React Frontend
```

**Step by step**:

1. **Radio decoder** (acarsdec, vdlm2dec, dumphfdl, etc.) receives the
   radio signal and emits JSON. Upstream decoder daemons that link
   libacars decode CPDLC / ARINC622 / SPDU / frequency substructures
   and include them in the JSON.
2. **Decoder** sends the JSON to the backend via the configured
   transport. Per-decoder transport is selected by the
   `<TYPE>_CONNECTIONS` environment variable (TCP listener, UDP bind,
   or ZMQ subscriber). See `agent-docs/DECODER_CONNECTIONS.md` for the
   configuration language.
3. **Listener** (`services/{tcp,udp,zmq}-listener.ts`) parses the JSON
   and pushes it onto the in-process `MessageQueue`
   (`services/message-queue.ts`).
4. **Formatter** (`formatters/index.ts` + `formatters/enrichment.ts`)
   consumes the queue:
   - Maps decoder-specific JSON to the canonical `AcarsMsg` shape
   - Re-serialises libacars substructures into the `libacars` field
   - Decodes label metadata (where applicable)
   - Runs alert matching against configured terms
   - Performs duplicate detection
   - Persists to SQLite via the Drizzle queries in `db/queries/`
   - Updates per-decoder signal-level and frequency tables
5. **Socket.IO** broadcasts the message on the `/main` namespace as an
   `acars_msg` event.
6. **React frontend** receives the message:
   - Decodes with `@airframes/acars-decoder` (client-side)
   - Checks for client-side duplicates
   - Merges multi-part messages
   - Updates the Zustand store
   - Triggers a re-render

### On-connect warm state

On a new Socket.IO connection the backend serves recent messages from
an in-process ring buffer (`services/message-ring-buffer.ts`) rather
than re-querying the database. See `agent-docs/MESSAGE_RING_BUFFER.md`
for the design and replay semantics.

### ADS-B Data Flow

```text
readsb/dump1090 → aircraft.json → Node.js Backend → Socket.IO → React Frontend
```

**Step by step**:

1. **readsb/dump1090** writes `aircraft.json` every second
2. **Backend ADS-B poller** (`services/adsb-poller.ts`) fetches the
   JSON on a configurable interval
3. **Backend** trims the payload (52 source fields → 13 wire fields,
   ≈75% reduction)
4. **Socket.IO** broadcasts an `adsb_aircraft` event
5. **React frontend**:
   - Updates aircraft positions in the Zustand store
   - Pairs ADS-B aircraft with ACARS messages (hex > callsign > tail)
   - Updates map markers
   - Triggers a re-render

### Search Flow

```text
React Frontend → Socket.IO → Node.js Backend → SQLite FTS5 → Socket.IO → React Frontend
```

**Step by step**:

1. **User** enters search terms in the React search form
2. **React** emits `query_search` with the validated payload
3. **Backend handler** (`socket/handlers.ts`, wrapped by
   `validatedHandler.ts` with a Zod schema from `socket/schemas.ts`):
   - Builds a query against `messages_fts` (FTS5 MATCH) joined back
     to `messages`
   - Paginates (50 per page)
4. **Socket.IO** sends `database_search_results` to the requester only
5. **React frontend** renders the paginated results

## Message Groups & Culling

### Message Groups (Not Aircraft)

**Terminology**: "Message Group" — can be aircraft, ground station, or unknown source.

**Grouping Strategy**:

- Messages grouped by identifier (ICAO hex, flight number, tail)
- One group can have multiple identifiers (e.g., UAL123 and N12345)
- Groups stored globally in AppStore (shared between Live Messages and Live Map)

**Group Structure**:

```typescript
interface MessageGroup {
  identifiers: string[]; // All known IDs (flight, tail, hex)
  messages: AcarsMsg[]; // Newest first
  lastUpdated: number; // Unix timestamp
  has_alerts: boolean;
  num_alerts: number;
}
```

### Two-Level Culling System

**Level 1: Messages per Group**:

- Default: 50 messages per group
- User-configurable: 10-200
- Oldest messages removed when limit exceeded

**Level 2: Total Groups**:

- Default: 50 groups in memory
- User-configurable: 10-200
- **ADS-B-aware**: Never culls groups paired with active ADS-B aircraft
- Only culls oldest non-paired groups (by `lastUpdated`)

**Race Condition Protection**:

- Skip culling if ADS-B enabled but no data received yet
- Backend sends initial ADS-B data immediately on connect

## Deployment Architecture

### Docker Container

**Base image**: `ghcr.io/sdr-enthusiasts/docker-baseimage:base` (Debian
slim, glibc); the React build and the bundled backend are produced in
intermediate `node:25.9.0-slim` build stages.

**Backend artefact**: `server.bundle.mjs` — an esbuild single-file
ESM bundle (see `acarshub-backend/package.json` `build:bundle` script).
`better-sqlite3` and `zeromq` are kept external so their native
add-ons load at runtime.

**Services** (s6-overlay, under `rootfs/etc/s6-overlay/s6-rc.d/`):

- `nginx` — serves the React static files and reverse-proxies the
  Node.js backend (`scripts/nginx.sh`)
- `webapp` — `node /backend/server.bundle.mjs`
  (`scripts/webapp.sh`)
- `user` — user-init service group

**Volumes** (host-mountable):

- Database path is configurable via `ACARSHUB_DB` (default
  `./data/acarshub.db`)
- Per-decoder logs and runtime data under the container's mutable
  filesystem

**Ports**:

- `80/tcp` — HTTP (nginx)
- `8888/tcp` — Backend (internal only; nginx-proxied)
- `5550-5558/udp` — Default decoder UDP bind ports when
  `<TYPE>_CONNECTIONS` selects UDP ingress (see
  `agent-docs/DECODER_CONNECTIONS.md`)

### nginx Configuration

Configured under `rootfs/etc/nginx.acarshub/`.

**Server root**: `/webapp/dist` (React build output, copied into the
final image)

**Routes** (see `sites-enabled/acarshub`):

- `/*` — Serve React static files, fallback to `index.html` (SPA routing)
- `/socket.io/*` — Proxy to `http://127.0.0.1:8888` (WebSocket upgrade)
- `/metrics` — Proxy to `http://127.0.0.1:8888/metrics`
- `/health`, `/data/*` — Proxy to backend

**Benefits**:

- nginx handles static file serving and TLS termination
- Backend handles only API and WebSocket traffic
- Clean separation of concerns

## Real-Time Features

### Live Message Updates

- Messages appear instantly (< 100 ms latency)
- Automatic duplicate detection (3 strategies)
- Multi-part message merging
- Client-side ACARS decoding
- Alert term highlighting

### Live Map Updates

- ADS-B positions update every 5 seconds (configurable)
- Aircraft markers rotate based on heading
- Colour-coded by message status (alerts, unread, etc.)
- Hover tooltips with aircraft details
- Click to view messages

### Live Statistics

- RRD / `timeseries_stats` time-series graphs (1 hour → 1 year)
- Real-time frequency distribution
- Signal level distribution
- Message count statistics
- Auto-refresh every 30 seconds

### System Status

- Real-time decoder health monitoring (per-decoder `connected` flag
  derived from listener state)
- Background service status (database writer, scheduler, listeners)
- Message rate (total, per-minute)
- Error tracking
- Auto-refresh every 10 seconds

## Performance Considerations

### Frontend

- **Bundle size**: ~730 KB gzipped (map chunk 1 MB, index 588 KB,
  decoder 455 KB) — see `PERF-BUNDLE` in `agent-docs/REMEDIATION_PLAN.md`
  for the planned reduction work
- **Code splitting**: React, Chart.js, MapLibre, decoder in separate chunks
- **Efficient re-rendering**: `React.memo`, `useMemo`, `useCallback`
- **Memory management**: Two-level culling system (messages + groups)
- **Map performance**: GPU-accelerated rendering (60 fps with 100+ aircraft)

### Backend

- **Non-blocking I/O**: Node.js event loop on Fastify + Socket.IO 4.x
- **Synchronous SQLite**: `better-sqlite3` (in-process, no IPC); writes
  are serialised by the queue worker
- **Database optimisation**: targeted indexes; FTS5 for search; see
  `agent-docs/DB_OPTIMIZATION.md` for the dead-index removal and
  UUID → integer FK migration
- **Message deduplication**: prevents database bloat
- **Signal statistics**: per-decoder tables for efficient queries
- **On-connect warm state**: ring buffer (`message-ring-buffer.ts`)
  serves recent messages without re-querying the database — see
  `agent-docs/MESSAGE_RING_BUFFER.md`
- **Time-series compaction**: see `agent-docs/MEMORY_OPTIMIZATION.md`

### Network

- **WebSocket**: binary protocol, minimal overhead
- **Payload optimisation**: ADS-B reduced from 52 → 13 fields (75% reduction)
- **Event-driven**: no polling, push-only architecture
- **Compression**: gzip / brotli for static assets (nginx-managed)

## Security Considerations

### Frontend Security

- **No API keys in code**: map tiles use CartoDB (no key required) or
  a user-provided Maptiler key
- **Input sanitisation**: all user input escaped before display
- **XSS prevention**: React automatically escapes JSX content

### Backend Security

- **No authentication** (designed for private network deployment)
- **CORS**: `@fastify/cors` configured for local network access
- **SQL injection**: protected by Drizzle's parameterised query builder
- **Inbound payload validation**: all Socket.IO inbound payloads are
  validated through Zod schemas in `socket/schemas.ts`, applied by
  `socket/validatedHandler.ts`
- **Rate limiting**: none (trusted-environment assumption)

**Deployment assumption**: ACARS Hub runs on a private network, not
internet-exposed.

## Testing Architecture

### Unit Tests (Vitest)

- **Frontend utilities, stores, components** — see
  `agent-docs/TESTING.md`
- **Backend services, formatters, DB queries, migrations** — in-memory
  SQLite for migration tests; inline `vi.mock` for service tests

### Integration Tests (Vitest + React Testing Library / Vitest)

- **Frontend**: complex component interactions, store + component
  integration, mocked Socket.IO events
- **Backend**: real in-memory SQLite for migration and query tests

### E2E Tests (Playwright)

- **Smoke tests**: navigation, theme switching, mobile responsiveness
- **Feature tests**: sound alerts, settings
- **Browser**: Chromium (CI), all major browsers locally
- Run from `Dockerfile.e2e` (Playwright is npm-managed, not flake-managed)

### Accessibility Tests (Playwright + axe-core; Vitest + axe-core helper)

- **WCAG 2.1 AA**: automated tests covering both themes, keyboard
  navigation, ARIA landmarks/labels/roles
- The frontend `src/test/a11y.ts` helper wraps `axe-core` directly and
  is invoked from component-level Vitest tests

## Monitoring & Observability

### Logging

- **Frontend**: `loglevel` with in-memory buffer (1000 logs)
  - Levels: error, warn, info, debug, trace
  - Module-specific loggers (socket, decoder, store, map, ui)
  - Exportable for user support
- **Backend**: Pino structured logging
  - Levels: error, warn, info, debug, trace
  - Per-module namespaced loggers via `createLogger(name)` in
    `utils/logger.ts`
  - JSON output for log aggregation (pretty-printed in development)

### Metrics

- **Prometheus**: `/metrics` endpoint backed by `prom-client`
- **`timeseries_stats` table**: compact in-database counters for the
  stats UI (replacing the historical RRD store; transition documented
  in `agent-docs/MEMORY_OPTIMIZATION.md`)
- **System status**: real-time decoder health, service status, message rates

## Future Considerations

### Aircraft Session Architecture (v4.3)

A planned rework of the in-memory and on-disk message grouping model
to use first-class aircraft "session" objects with explicit lifecycle,
TTL, and persistence, plus readsb-trace-sourced position history. The
plan and current status are tracked in `agent-docs/V4.3.md`.

### Horizontal Scaling

**Current limitation**: single instance (SQLite, in-process state).

**Path to scaling**:

1. Replace SQLite with PostgreSQL
2. Add Redis for Socket.IO session storage and pub/sub
3. Run multiple Node.js backend instances behind nginx
4. Externalise the message ring buffer and listener state
5. Shared database storage (NFS, EFS, or a managed RDBMS)

### Mobile App

**React Native** could reuse most of the React codebase:

- Same state management (Zustand)
- Same Socket.IO client
- Same shared `@acarshub/types` package
- Same business logic in utilities
- Different UI components (native)
