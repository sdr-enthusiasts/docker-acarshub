# @acarshub/backend

ACARS Hub Node.js backend server - replacing the Python Flask backend with TypeScript.

## Status

🚧 **Under Development** - This is a placeholder package created during Phase 0 of the migration.

See `dev-docs/NODEJS_MIGRATION_PLAN.md` for the complete migration timeline.

## Overview

This package will contain the Node.js/TypeScript backend server that replaces the existing Python Flask backend. It will provide:

- **Socket.IO Server** - Real-time communication with the React frontend
- **Database Layer** - SQLite with Drizzle ORM
- **TCP Listeners** - ACARS, VDLM, HFDL, IMSL, IRDM decoders
- **ADS-B Integration** - HTTP polling of readsb/dump1090
- **Message Processing** - Formatting, alert matching, storage
- **Metrics** - Prometheus metrics endpoint

## Architecture

```text
acarshub-backend/
├── src/
│   ├── server.ts              # Main entry point (PLACEHOLDER)
│   ├── config.ts              # Environment configuration (TODO: Week 1)
│   ├── db/                    # Database layer (TODO: Week 1)
│   │   ├── client.ts          # Drizzle database client
│   │   ├── schema.ts          # All table schemas
│   │   ├── migrations/        # Drizzle migrations
│   │   └── queries/           # Query functions
│   ├── sockets/               # Socket.IO handlers (TODO: Week 2)
│   │   ├── main.ts            # /main namespace
│   │   ├── search.ts          # Database search
│   │   ├── alerts.ts          # Alert management
│   │   └── timeseries.ts      # RRD replacement
│   ├── listeners/             # TCP socket listeners (TODO: Week 3)
│   │   ├── acars.ts
│   │   ├── vdlm.ts
│   │   ├── hfdl.ts
│   │   ├── imsl.ts
│   │   ├── irdm.ts
│   │   └── adsb.ts            # HTTP poller
│   ├── formatters/            # Message formatting (TODO: Week 4)
│   │   ├── acars.ts
│   │   ├── vdlm2.ts
│   │   ├── hfdl.ts
│   │   ├── imsl.ts
│   │   └── irdm.ts
│   ├── workers/               # Background workers (TODO: Week 3)
│   │   ├── message-relay.ts   # Queue processor
│   │   ├── database.ts        # Database writer
│   │   └── alert-regen.ts
│   ├── scheduler.ts           # Cron jobs (TODO: Week 3)
│   ├── metrics.ts             # Prometheus metrics (TODO: Week 4)
│   └── logger.ts              # Pino logger setup (TODO: Week 1)
├── scripts/                   # Migration scripts (TODO: Week 5)
├── __tests__/                 # Tests (TODO: Week 5-6)
└── package.json
```

## Technology Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript (strict mode)
- **Framework**: Fastify (HTTP server)
- **Real-time**: Socket.IO 4.x
- **Database**: SQLite with Drizzle ORM
- **Logging**: Pino
- **Validation**: Zod
- **Testing**: Vitest
- **Linting**: Biome

## Type Safety

This backend uses shared types from `@acarshub/types` to ensure type safety and API contract alignment with the frontend:

```typescript
import type { SocketEvents, AcarsMsg, SystemStatus } from "@acarshub/types";

// Socket.IO events are fully typed
io.on("connection", (socket) => {
  socket.emit("system_status", statusData); // Type-checked!
});
```

The types are NOT duplicated - they are THE SAME source files used by the frontend.

## Development

### Prerequisites

- Node.js 20+
- npm 10+

### Installation

```bash
# At repository root
npm install
```

This installs all workspace dependencies including the shared types package.

### Running (TODO)

```bash
npm run dev --workspace=acarshub-backend
```

### Building

```bash
npm run build --workspace=acarshub-backend
```

### Testing (TODO)

```bash
npm run test --workspace=acarshub-backend
```

## Migration Timeline

### Week 1: Database Layer ✅ Types Setup Complete

- [x] Phase 0: Monorepo setup and shared types
- [ ] Drizzle ORM schema (matching existing Alembic migrations)
- [ ] Database client and connection pool
- [ ] Query functions (messages, alerts, timeseries)
- [ ] Migration from Alembic to Drizzle

### Week 2: Socket.IO Server

- [ ] Fastify + Socket.IO integration
- [ ] `/main` namespace handler
- [ ] Event handlers (query_search, update_alerts, etc.)
- [ ] Type-safe event emission
- [ ] Connection management

### Week 3: Background Services

- [ ] TCP socket listeners (ACARS, VDLM, HFDL, IMSL, IRDM)
- [ ] ADS-B HTTP poller
- [ ] Message queue/relay worker
- [ ] Database writer worker
- [ ] Alert regeneration scheduler

### Week 4: Message Formatters & Metrics

- [ ] Message formatters (one per decoder type)
- [ ] Label decoding
- [ ] Alert matching
- [ ] Prometheus metrics endpoint
- [ ] RRD → SQLite timeseries migration

### Week 5-6: Testing & Deployment

- [ ] Unit tests (90%+ coverage for utilities)
- [ ] Integration tests (Socket.IO, database)
- [ ] Parity tests (compare with Python output)
- [ ] Docker multi-stage build
- [ ] Alpha/Beta/RC deployment phases

## API Contract

The Socket.IO API is defined by `SocketEvents` and `SocketEmitEvents` in `@acarshub/types/socket`.

**Events Emitted by Backend** (Server → Client):

- `acars_msg` - New ACARS message
- `adsb_aircraft` - ADS-B aircraft positions
- `system_status` - System health
- `database_search_results` - Search results
- And 13 more...

**Events Handled by Backend** (Client → Server):

- `query_search` - Database search
- `update_alerts` - Update alert terms
- `request_status` - Request system status
- And 4 more...

See `acarshub-types/src/socket.ts` for the complete API contract.

## Configuration (TODO)

Environment variables (validated with Zod):

- `PORT` - HTTP server port (default: 8080)
- `HOST` - Bind address (default: 0.0.0.0)
- `DATABASE_PATH` - SQLite database path
- `ACARS_HOST` / `ACARS_PORT` - ACARS decoder connection
- `VDLM_HOST` / `VDLM_PORT` - VDLM decoder connection
- `HFDL_HOST` / `HFDL_PORT` - HFDL decoder connection
- `ADSB_URL` - ADS-B aircraft.json URL
- And more...

## Database

SQLite database with Drizzle ORM. Schema matches existing Alembic migrations:

- `messages` - All ACARS messages
- `messages_fts` - Full-text search index
- `alert_terms` - User-defined alert keywords
- `alert_matches` - Messages matching alerts
- `signal_*` tables - Signal strength stats (per decoder)
- `freqs_*` tables - Frequency usage stats (per decoder)

## Logging

Pino structured logging with configurable levels:

```typescript
import { logger } from "./logger.js";

logger.info({ socketId: socket.id }, "Client connected");
logger.error({ uid, error: err.message }, "Failed to process message");
```

## Metrics (TODO)

Prometheus metrics endpoint at `/metrics`:

- Message counts (by decoder, by label)
- Signal levels (by decoder, by frequency)
- Database operations (queries, inserts)
- Socket.IO connections (current, total)
- Processing times (message formatting, database writes)

## License

GPL-3.0-or-later

Copyright (C) 2022-2026 Frederick Clausen II
