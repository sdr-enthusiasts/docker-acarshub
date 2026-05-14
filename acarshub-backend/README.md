# @acarshub/backend

ACARS Hub Node.js backend server — replaces the retired Python Flask
backend with a TypeScript implementation on Fastify + Socket.IO.

## Status

✅ **Production** — the Node.js backend is the supported and shipped
implementation. The Python Flask backend is retired. Historical
migration notes live in `dev-docs/historical/` (see `dev-docs/`).

## Overview

This package contains the Node.js + TypeScript backend that:

- **Socket.IO server** — real-time communication with the React frontend over the `/main` namespace
- **Database layer** — SQLite via Drizzle ORM, schema and migrations in `src/db/`
- **Decoder ingress** — TCP / UDP / ZMQ listeners for ACARS, VDLM, HFDL, IMSL, IRDM (see `agent-docs/DECODER_CONNECTIONS.md`)
- **ADS-B integration** — HTTP polling of readsb/dump1090 `aircraft.json`
- **Message processing** — formatting, label decoding, alert matching, enrichment, storage
- **Metrics** — Prometheus metrics endpoint

## Architecture

```text
acarshub-backend/
├── src/
│   ├── server.ts              # Fastify + Socket.IO entry point
│   ├── config.ts              # Zod-validated environment configuration
│   ├── startup-state.ts       # Shared startup state container
│   ├── db/                    # Database layer
│   │   ├── client.ts          # Drizzle database client
│   │   ├── schema.ts          # All table schemas
│   │   ├── migrate.ts         # Migration runner entry point
│   │   ├── migrations/        # Drizzle migrations (.sql)
│   │   └── queries/           # Query functions
│   ├── socket/                # Socket.IO handlers (/main namespace)
│   ├── services/              # Listeners, pollers, queues, schedulers
│   ├── formatters/            # Message formatting & enrichment per decoder
│   ├── utils/                 # Logger (Pino) and shared helpers
│   └── __tests__/             # Vitest unit/integration tests
├── scripts/                   # Operational scripts
└── package.json
```

Individual subsystems are documented under `agent-docs/`:

- `agent-docs/ARCHITECTURE.md` — overall system design
- `agent-docs/DECODER_CONNECTIONS.md` — decoder ingress (authoritative)
- `agent-docs/MESSAGE_RING_BUFFER.md` — on-connect warm-state buffer
- `agent-docs/MEMORY_OPTIMIZATION.md` — time-series compaction
- `agent-docs/DB_OPTIMIZATION.md` — database size optimisation

## Technology Stack

- **Runtime**: Node.js 22+
- **Language**: TypeScript (strict mode)
- **Framework**: Fastify (HTTP server)
- **Real-time**: Socket.IO 4.x
- **Database**: SQLite with Drizzle ORM
- **Logging**: Pino
- **Validation**: Zod
- **Testing**: Vitest
- **Linting / formatting**: Biome

## Type Safety

This backend uses shared types from `@acarshub/types` to keep the
Socket.IO API contract aligned with the frontend:

```typescript
import type { SocketEvents, AcarsMsg, SystemStatus } from "@acarshub/types";

// Socket.IO events are fully typed
io.of("/main").on("connection", (socket) => {
  socket.emit("system_status", statusData); // Type-checked
});
```

The types are not duplicated — they are the same source files used by
the frontend.

## Development

### Prerequisites

- Node.js 22+
- npm 10+

### Installation

```bash
# At repository root (monorepo: acarshub-types + react + backend)
npm install
```

### Running

```bash
# From the repo root
just server

# Or directly
cd acarshub-backend && npm run dev
```

`npm run dev` runs `tsx watch src/server.ts`, which restarts the
process on TypeScript source changes.

### Building

```bash
npm run build --workspace=acarshub-backend
# or the bundled single-file build used by the container image:
npm run build:bundle --workspace=acarshub-backend
```

### Testing

```bash
# From the repo root
just test-backend
just test-backend-watch
just test-backend-coverage

# Or directly
npm test --workspace=acarshub-backend
```

### Migrations

```bash
# Apply migrations to the database pointed at by $DATABASE_PATH
npm run migrate --workspace=acarshub-backend

# Generate a new migration from schema changes
npm run migrate:generate --workspace=acarshub-backend
```

## API Contract

The Socket.IO API is defined by `SocketEvents` and `SocketEmitEvents`
in `@acarshub/types/socket`.

**Events emitted by backend** (Server → Client) include:

- `acars_msg` — new ACARS message
- `adsb_aircraft` — ADS-B aircraft positions
- `system_status` — system health
- `database_search_results` — search results

**Events handled by backend** (Client → Server) include:

- `query_search` — database search
- `update_alerts` — update alert terms
- `request_status` — request system status

See `acarshub-types/src/socket.ts` for the complete contract.

## Configuration

Environment variables (validated with Zod via `src/config.ts`):

- `PORT` — HTTP server port (default: 8080)
- `HOST` — bind address (default: 0.0.0.0)
- `DATABASE_PATH` — SQLite database path
- `ACARS_HOST` / `ACARS_PORT` — ACARS decoder connection
- `VDLM_HOST` / `VDLM_PORT` — VDLM decoder connection
- `HFDL_HOST` / `HFDL_PORT` — HFDL decoder connection
- `ADSB_URL` — ADS-B `aircraft.json` URL
- …and more (see `src/config.ts` for the authoritative list)

## Database

SQLite with Drizzle ORM. Schema in `src/db/schema.ts`, migrations in
`src/db/migrations/`. Major tables:

- `messages` — all ACARS messages
- `messages_fts` — full-text search index
- `alert_terms` — user-defined alert keywords
- `alert_matches` — messages matching alerts
- `signal_*` — signal strength stats (per decoder)
- `freqs_*` — frequency usage stats (per decoder)
- `aircraft_sessions` — v4.2 aircraft session aggregation (see `agent-docs/V4.2.md`)

## Logging

Pino structured logging with configurable levels via the `createLogger`
helper in `src/utils/logger.ts`:

```typescript
import { createLogger } from "./utils/logger.js";
const logger = createLogger("module-name");

logger.info({ socketId: socket.id }, "Client connected");
logger.error({ uid, error: err.message }, "Failed to process message");
```

## Metrics

Prometheus metrics endpoint at `/metrics`:

- Message counts (by decoder, by label)
- Signal levels (by decoder, by frequency)
- Database operations (queries, inserts)
- Socket.IO connections (current, total)
- Processing times (message formatting, database writes)

## License

GPL-3.0-or-later

Copyright (C) 2022-2026 Frederick Clausen II
