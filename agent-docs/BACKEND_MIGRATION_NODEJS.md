# Backend Migration: Node.js + TypeScript + Prisma

**Status**: Phase 11 - Planning & Implementation
**Decision Date**: 2025-01-XX
**Target**: Complete backend rewrite from Python/Flask to Node.js/TypeScript

---

## Table of Contents

- [Decision Summary](#decision-summary)
- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [Migration Strategy](#migration-strategy)
- [Prisma Schema Design](#prisma-schema-design)
- [Module Migration Plan](#module-migration-plan)
- [Socket.IO Event Migration](#socketio-event-migration)
- [Database Migrations](#database-migrations)
- [Testing Strategy](#testing-strategy)
- [Deployment Strategy](#deployment-strategy)
- [Timeline & Milestones](#timeline--milestones)

---

## Decision Summary

### Why Node.js + TypeScript + Prisma?

**Context**: ACARS Hub React frontend is complete (Phase 1-10). Backend is Python/Flask with SQLite database and no formal migration system.

**Decision**: Migrate to Node.js + TypeScript + Prisma

**Rationale**:

1. **Single Language Stack**
   - TypeScript everywhere (frontend + backend)
   - Shared types between client and server
   - Easier to maintain as solo developer
   - No mental context switching

2. **Desktop App Possibility**
   - Electron is viable path (80-150MB binaries)
   - Keep React frontend as-is (no Tauri rewrite needed)
   - Desktop app can be added later without backend rewrite

3. **Contributor Accessibility**
   - TypeScript/Node.js more accessible than Rust
   - Existing contributors understand JavaScript/TypeScript
   - Lowers barrier for future PRs

4. **Prisma > Alembic**
   - Auto-migration generation from schema changes
   - Type-safe database access
   - Excellent developer experience
   - Better than Python + Alembic

5. **No Future Rewrite**
   - This is the last backend rewrite
   - Python + Alembic would close desktop app door
   - Node.js keeps all options open

**Alternatives Considered**:

- **Python + Alembic**: Closes desktop app door, would require rewrite later
- **Rust + Tauri**: Best desktop app story, but requires React rewrite and higher learning curve
- **Hybrid Python + Tauri**: Complex packaging, not better than Electron

---

## Architecture Overview

### Current Architecture (Python/Flask)

```text
┌─────────────────────────────────────────────────────────────┐
│ Python/Flask Backend                                        │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  │
│  │ Flask Routes │   │ Socket.IO    │   │ SQLite DB    │  │
│  └──────────────┘   └──────────────┘   └──────────────┘  │
│         │                   │                   │          │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Message Processing (ACARS decoding, alerts, etc.)    │ │
│  └──────────────────────────────────────────────────────┘ │
│         │                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │ RRD Stats    │   │ Flight APIs  │   │ upgrade_db   │ │
│  └──────────────┘   └──────────────┘   └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ React Frontend│
                    └───────────────┘
```

### Target Architecture (Node.js/TypeScript)

```text
┌─────────────────────────────────────────────────────────────┐
│ Node.js/TypeScript Backend                                  │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  │
│  │ Express API  │   │ Socket.IO    │   │ Prisma ORM   │  │
│  └──────────────┘   └──────────────┘   └──────────────┘  │
│         │                   │                   │          │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Message Processing (TypeScript, type-safe)           │ │
│  └──────────────────────────────────────────────────────┘ │
│         │                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │ RRD Stats    │   │ Flight APIs  │   │ Prisma       │ │
│  │ (node-rrd)   │   │ (axios/fetch)│   │ Migrations   │ │
│  └──────────────┘   └──────────────┘   └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ React Frontend│
                    │ (no changes)  │
                    └───────────────┘
```

### Key Differences

| Component           | Python                     | Node.js                  |
| ------------------- | -------------------------- | ------------------------ |
| **Web Framework**   | Flask                      | Express or Fastify       |
| **ORM**             | SQLAlchemy (no migrations) | Prisma (with migrations) |
| **Database**        | SQLite (stays)             | SQLite (stays)           |
| **Socket.IO**       | Flask-SocketIO             | Socket.IO (official)     |
| **RRD Integration** | Python `rrdtool`           | `node-rrd` package       |
| **Type Safety**     | None (Python is dynamic)   | Full TypeScript          |
| **Migrations**      | Custom `upgrade_db.py`     | Prisma migrations        |

---

## Technology Stack

### Core Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.8.3",
    "prisma": "^6.0.0",
    "@prisma/client": "^6.0.0",
    "better-sqlite3": "^11.0.0",
    "node-rrd": "^1.0.0",
    "axios": "^1.6.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.0",
    "tsx": "^4.7.0",
    "typescript": "^5.9.3",
    "vitest": "^4.0.0"
  }
}
```

### Framework Choice: Express vs Fastify

**Recommendation**: Express

**Why**:

- Proven, stable, mature (14+ years)
- Excellent Socket.IO integration
- Massive ecosystem
- Easy to find help/examples
- Fastify is faster, but Express is fast enough for ACARS Hub

### Database: SQLite (stays)

- **No change** - Keep existing SQLite database
- Prisma has excellent SQLite support
- Migration path: Prisma introspection → generate schema → create migrations

### ORM: Prisma

**Why Prisma over alternatives**:

- Auto-generates TypeScript types from schema
- Migration system built-in (like Rails migrations)
- Excellent SQLite support
- Can introspect existing database
- Type-safe queries (catch errors at compile time)

---

## Migration Strategy

### Overall Approach: Parallel Development

**Do NOT attempt in-place migration.** Build Node.js backend alongside Python backend.

```text
Phase 11 Timeline:
┌─────────────────────────────────────────────────────────────┐
│ Week 1-2: Foundation & Schema                               │
│ Week 3-4: Core Business Logic                              │
│ Week 5-6: Socket.IO & Real-time Features                   │
│ Week 7-8: Testing & Edge Cases                             │
│ Week 9-10: Deployment & Cutover                            │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```text
docker-acarshub/
├── acarshub-typescript/     # OLD: Legacy jQuery frontend (will delete)
├── acarshub-react/          # NEW: React frontend (DONE)
├── acarshub-backend/        # NEW: Node.js backend (Phase 11)
│   ├── src/
│   │   ├── server.ts        # Main entry point
│   │   ├── app.ts           # Express app setup
│   │   ├── socket.ts        # Socket.IO setup
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── database/        # Prisma client
│   │   └── types/           # Shared types
│   ├── prisma/
│   │   ├── schema.prisma    # Database schema
│   │   └── migrations/      # Migration files
│   ├── tests/               # Backend tests
│   ├── package.json
│   └── tsconfig.json
├── rootfs/webapp/           # OLD: Python backend (will deprecate)
└── AGENTS.md
```

### Migration Phases

#### Phase 11.1: Foundation (Weeks 1-2)

**Goal**: Set up Node.js project, Prisma schema, basic Express server

- ✅ Initialize Node.js/TypeScript project
- ✅ Install dependencies (Express, Prisma, Socket.IO)
- ✅ Configure TypeScript with strict mode
- ✅ Set up Prisma with SQLite
- ✅ Introspect existing database schema
- ✅ Generate Prisma schema
- ✅ Create initial migration
- ✅ Set up Express server with basic routes
- ✅ Configure logging (similar to React frontend)

#### Phase 11.2: Database & Models (Weeks 3-4)

**Goal**: Replicate all database operations with Prisma

- ✅ Define Prisma schema for all tables
- ✅ Implement CRUD operations for messages
- ✅ Implement CRUD operations for aircraft
- ✅ Implement alert term management
- ✅ Implement station configuration
- ✅ Create FTS5 virtual table migration
- ✅ Create indexes migration
- ✅ Test migrations on fresh database
- ✅ Test migrations on production database copy

#### Phase 11.3: Message Processing (Weeks 5-6)

**Goal**: Port all message decoding and processing logic

- ✅ Port ACARS message parsing (TypeScript version of Rust libraries)
- ✅ Port duplicate detection logic
- ✅ Port multi-part message merging
- ✅ Port alert matching logic
- ✅ Port message enrichment (flight lookup, etc.)
- ✅ Port signal level processing
- ✅ Implement message storage with Prisma

#### Phase 11.4: Socket.IO Events (Week 7)

**Goal**: Replicate all real-time Socket.IO events

- ✅ Port `acars_msg` event
- ✅ Port `adsb_aircraft` event
- ✅ Port `labels` event
- ✅ Port `terms` event
- ✅ Port `database_search_results` event
- ✅ Port `system_status` event
- ✅ Port `signal` event
- ✅ Port `rrd_timeseries` event
- ✅ Test Socket.IO with React frontend

#### Phase 11.5: API Routes (Week 8)

**Goal**: Port remaining Flask routes to Express

- ✅ Port `/metrics` endpoint
- ✅ Port health check endpoints
- ✅ Port configuration endpoints
- ✅ Remove legacy HTML generation routes
- ✅ Test all routes with integration tests

#### Phase 11.6: RRD Integration (Week 9)

**Goal**: Replicate RRD statistics functionality

- ✅ Install `node-rrd` package
- ✅ Port RRD database queries
- ✅ Port time-series data formatting
- ✅ Implement `rrd_timeseries` Socket.IO handler
- ✅ Test with Stats page in React frontend

#### Phase 11.7: Testing & Edge Cases (Week 10)

**Goal**: Comprehensive testing and edge case handling

- ✅ Unit tests for message processing
- ✅ Integration tests for Socket.IO
- ✅ Integration tests for API routes
- ✅ Database migration tests
- ✅ Performance testing (500+ messages/sec)
- ✅ Edge case handling (malformed messages, etc.)

#### Phase 11.8: Deployment (Week 11)

**Goal**: Deploy Node.js backend to production

- ✅ Update Dockerfile for Node.js backend
- ✅ Update nginx configuration
- ✅ Create systemd service (or Docker Compose)
- ✅ Test deployment locally
- ✅ Deploy to production
- ✅ Monitor for errors
- ✅ Retire Python backend

---

## Prisma Schema Design

### Schema File: `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// ACARS Messages
model Message {
  id            Int      @id @default(autoincrement())
  uid           String   @unique
  timestamp     Int      // Unix timestamp (seconds)
  station_id    String?
  toaddr        String?
  fromaddr      String?
  depa          String?
  dsta          String?
  eta           String?
  gtout         String?
  gtin          String?
  wloff         String?
  wlin          String?
  lat           Float?
  lon           Float?
  alt           String?
  text          String?
  tail          String?
  flight        String?
  icao          String?
  freq          String?
  ack           String?
  mode          String?
  label         String?
  block_id      String?
  msgno         String?
  is_response   String?
  is_onground   String?
  error         Int      @default(0)
  level         Float?
  noise_level   Float?
  signal_power  Float?
  channel       Int?
  freq_skew     Float?
  assigned_ac   String?
  msg_text      String?  // Processed/decoded message text
  msg_html      String?  // Legacy HTML (to be removed)
  libacars      String?  // JSON string
  vdl2          String?  // JSON string
  hfdl          String?  // JSON string
  dsta_iata     String?
  depa_iata     String?
  airline       String?
  iata_flight   String?
  icao_flight   String?

  // Client-side additions (from React frontend)
  matched       Boolean  @default(false)
  matched_text  String?  // JSON array of matched terms
  duplicates    String   @default("0")
  msgno_parts   String?
  decodedText   String?  // JSON string from @airframes/acars-decoder

  @@index([timestamp])
  @@index([station_id])
  @@index([tail])
  @@index([flight])
  @@index([icao])
  @@index([error])
  @@index([matched])
}

// FTS5 Virtual Table (handled via raw SQL migration)
// Note: Prisma doesn't natively support FTS5, use raw SQL in migration

// Alert Terms
model AlertTerms {
  id         Int      @id @default(autoincrement())
  terms      String   // JSON array
  ignore     String   // JSON array
  updated_at DateTime @default(now()) @updatedAt

  @@map("alert_terms")
}

// Station Configuration
model Station {
  id        Int     @id @default(autoincrement())
  lat       Float?
  lon       Float?
  name      String?

  @@map("station")
}

// Enabled Decoders
model Decoders {
  id     Int     @id @default(autoincrement())
  name   String  @unique
  enabled Boolean @default(true)

  @@map("decoders")
}

// Signal Levels - Per Decoder (NEW: refactored from single table)
model SignalLevelACARS {
  id         Int   @id @default(autoincrement())
  timestamp  Int   // Unix timestamp
  level      Float
  freq       String?

  @@index([timestamp])
  @@map("level_acars")
}

model SignalLevelVDLM {
  id         Int   @id @default(autoincrement())
  timestamp  Int
  level      Float
  freq       String?

  @@index([timestamp])
  @@map("level_vdlm")
}

model SignalLevelHFDL {
  id         Int   @id @default(autoincrement())
  timestamp  Int
  level      Float
  freq       String?

  @@index([timestamp])
  @@map("level_hfdl")
}

model SignalLevelIMSL {
  id         Int   @id @default(autoincrement())
  timestamp  Int
  level      Float
  freq       String?

  @@index([timestamp])
  @@map("level_imsl")
}

model SignalLevelIRDM {
  id         Int   @id @default(autoincrement())
  timestamp  Int
  level      Float
  freq       String?

  @@index([timestamp])
  @@map("level_irdm")
}
```

### Prisma Migration Workflow

1. **Introspect existing database**:

   ```bash
   npx prisma db pull
   ```

2. **Review generated schema**, make adjustments

3. **Create initial migration**:

   ```bash
   npx prisma migrate dev --name init
   ```

4. **Create FTS5 migration** (raw SQL):

   ```sql
   -- Create FTS5 virtual table
   CREATE VIRTUAL TABLE messages_fts USING fts5(
     text,
     tail,
     flight,
     depa,
     dsta,
     content='messages',
     content_rowid='id'
   );

   -- Triggers to keep FTS in sync
   CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
     INSERT INTO messages_fts(rowid, text, tail, flight, depa, dsta)
     VALUES (new.id, new.text, new.tail, new.flight, new.depa, new.dsta);
   END;

   -- ... (UPDATE and DELETE triggers)
   ```

5. **Create signal level refactor migration**:
   - Drop old `level` table
   - Create new per-decoder tables (`level_acars`, `level_vdlm`, etc.)

---

## Module Migration Plan

### 1. Message Processing (`services/messageProcessor.ts`)

**Python equivalent**: `rootfs/webapp/acarshub_helpers.py`

**Responsibilities**:

- Parse ACARS messages from `acars_router`
- Detect duplicates (full field match, text match, multi-part)
- Merge multi-part messages
- Match against alert terms
- Enrich with flight data (airline, IATA/ICAO callsign)
- Store to database via Prisma

**TypeScript structure**:

```typescript
// services/messageProcessor.ts
import { PrismaClient } from "@prisma/client";
import { MessageData, ProcessedMessage } from "../types";

export class MessageProcessor {
  constructor(private prisma: PrismaClient) {}

  async processMessage(data: MessageData): Promise<ProcessedMessage> {
    // 1. Check for duplicates
    const duplicate = await this.checkDuplicate(data);

    // 2. Merge multi-part if needed
    const merged = await this.handleMultiPart(data);

    // 3. Match alert terms
    const alertMatch = this.matchAlerts(data);

    // 4. Enrich with flight data
    const enriched = await this.enrichFlightData(data);

    // 5. Store to database
    const stored = await this.storeMessage(enriched);

    return stored;
  }

  private async checkDuplicate(data: MessageData): Promise<boolean> {
    // Port duplicate detection logic from Python
  }

  private async handleMultiPart(data: MessageData): Promise<MessageData> {
    // Port multi-part merging logic from Python
  }

  private matchAlerts(data: MessageData): boolean {
    // Port alert matching logic from Python
  }

  private async enrichFlightData(data: MessageData): Promise<MessageData> {
    // Port flight_finder() logic from Python
  }

  private async storeMessage(data: MessageData): Promise<ProcessedMessage> {
    return this.prisma.message.create({
      data: {
        uid: data.uid,
        timestamp: data.timestamp,
        // ... all fields
      },
    });
  }
}
```

### 2. Socket.IO Server (`socket.ts`)

**Python equivalent**: `rootfs/webapp/acarshub.py` (Socket.IO handlers)

**Responsibilities**:

- Accept Socket.IO connections from React frontend
- Handle client events (`query_search`, `update_alerts`, etc.)
- Emit server events (`acars_msg`, `adsb_aircraft`, etc.)
- Broadcast to all connected clients

**TypeScript structure**:

```typescript
// socket.ts
import { Server } from "socket.io";
import { MessageProcessor } from "./services/messageProcessor";

export function setupSocketIO(io: Server) {
  const messageProcessor = new MessageProcessor(prisma);

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Handle search queries
    socket.on("query_search", async (params) => {
      const results = await searchMessages(params);
      socket.emit("database_search_results", results);
    });

    // Handle alert term updates
    socket.on("update_alerts", async (terms) => {
      await updateAlertTerms(terms);
      io.emit("terms", terms); // Broadcast to all clients
    });

    // Handle RRD time-series requests
    socket.on("rrd_timeseries", async (params) => {
      const data = await fetchRRDData(params);
      socket.emit("rrd_timeseries_data", data);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });
}
```

### 3. ACARS Router Integration (`services/acarsRouter.ts`)

**Python equivalent**: Background thread listening to `acars_router` UDP/TCP

**Responsibilities**:

- Listen for ACARS messages from `acars_router`
- Parse JSON payloads
- Pass to MessageProcessor
- Emit to connected Socket.IO clients

**TypeScript structure**:

```typescript
// services/acarsRouter.ts
import * as net from "net";
import { MessageProcessor } from "./messageProcessor";

export class ACARSRouterClient {
  private socket: net.Socket;

  constructor(
    private host: string,
    private port: number,
    private messageProcessor: MessageProcessor,
    private io: Server,
  ) {}

  connect() {
    this.socket = net.createConnection(this.port, this.host);

    this.socket.on("data", async (data) => {
      const messages = this.parseMessages(data.toString());

      for (const msg of messages) {
        const processed = await this.messageProcessor.processMessage(msg);

        // Emit to all Socket.IO clients
        this.io.emit("acars_msg", processed);
      }
    });

    this.socket.on("error", (err) => {
      console.error("ACARS Router connection error:", err);
    });
  }

  private parseMessages(data: string): MessageData[] {
    // Parse JSON from acars_router
    // Handle line-delimited JSON or single JSON objects
  }
}
```

### 4. Flight Data APIs (`services/flightData.ts`)

**Python equivalent**: `flight_finder()` in `acarshub_helpers.py`

**Responsibilities**:

- Lookup airline name from ICAO/IATA code
- Convert between IATA and ICAO callsigns
- Cache results to minimize API calls

**TypeScript structure**:

```typescript
// services/flightData.ts
import axios from "axios";

interface FlightInfo {
  airline: string | null;
  iataFlight: string | null;
  icaoFlight: string | null;
}

export class FlightDataService {
  private cache = new Map<string, FlightInfo>();

  async lookupFlight(callsign: string): Promise<FlightInfo> {
    // Check cache
    if (this.cache.has(callsign)) {
      return this.cache.get(callsign)!;
    }

    // Lookup from API or database
    const info = await this.fetchFlightInfo(callsign);

    // Cache result
    this.cache.set(callsign, info);

    return info;
  }

  private async fetchFlightInfo(callsign: string): Promise<FlightInfo> {
    // Port flight_finder() logic
    // Use airline database or API
  }
}
```

### 5. RRD Integration (`services/rrdService.ts`)

**Python equivalent**: `rrdtool.fetch()` calls in `acarshub.py`

**Responsibilities**:

- Query RRD database for time-series data
- Format data for React Stats page
- Support all time periods (1hr, 6hr, 12hr, 24hr, 1wk, 30day, 6mon, 1yr)

**TypeScript structure**:

```typescript
// services/rrdService.ts
import * as rrd from "node-rrd";

export class RRDService {
  private rrdPath = "/run/acars/acarshub.rrd";

  async fetchTimeSeries(
    period: "1h" | "6h" | "12h" | "24h" | "1w" | "30d" | "6m" | "1y",
  ): Promise<TimeSeriesData> {
    const resolution = this.getResolution(period);
    const start = this.getStartTime(period);

    const data = await rrd.fetch(
      this.rrdPath,
      "AVERAGE",
      start,
      "now",
      resolution,
    );

    return this.formatData(data);
  }

  private getResolution(period: string): number {
    // Map period to RRA resolution
  }

  private getStartTime(period: string): number {
    // Calculate start timestamp
  }

  private formatData(raw: any): TimeSeriesData {
    // Format RRD data for React frontend
  }
}
```

---

## Socket.IO Event Migration

### Events Emitted by Server → Client

| Event Name                | Python Location    | Payload                                 | Status                |
| ------------------------- | ------------------ | --------------------------------------- | --------------------- |
| `acars_msg`               | `emit_acars_msg()` | `{ msghtml: Message, ... }`             | ⏳ Port to TypeScript |
| `adsb_aircraft`           | `poll_adsb()`      | `{ aircraft: ADSBAircraft[] }`          | ⏳ Port to TypeScript |
| `labels`                  | `send_labels()`    | `{ labels: Label[] }`                   | ⏳ Port to TypeScript |
| `terms`                   | `send_terms()`     | `{ terms: string[], ignore: string[] }` | ⏳ Port to TypeScript |
| `database_search_results` | `handle_message()` | `SearchResults`                         | ⏳ Port to TypeScript |
| `system_status`           | `status_updater()` | `SystemStatus`                          | ⏳ Port to TypeScript |
| `signal`                  | `send_to_socket()` | `SignalData`                            | ⏳ Port to TypeScript |
| `rrd_timeseries_data`     | `rrd_timeseries()` | `TimeSeriesData`                        | ⏳ Port to TypeScript |

### Events Received by Server ← Client

| Event Name       | Python Handler     | Action             | Status                |
| ---------------- | ------------------ | ------------------ | --------------------- |
| `query_search`   | `handle_message()` | Database search    | ⏳ Port to TypeScript |
| `update_alerts`  | `update_terms()`   | Update alert terms | ⏳ Port to TypeScript |
| `signal_freqs`   | `send_to_socket()` | Send signal data   | ⏳ Port to TypeScript |
| `rrd_timeseries` | `rrd_timeseries()` | Fetch RRD data     | ⏳ Port to TypeScript |

### Type Definitions (Shared with React Frontend)

Create shared types package or duplicate types:

```typescript
// types/socketEvents.ts
export interface SocketEvents {
  // Server → Client
  acars_msg: (data: { msghtml: Message }) => void;
  adsb_aircraft: (data: { aircraft: ADSBAircraft[] }) => void;
  labels: (data: { labels: Label[] }) => void;
  terms: (data: Terms) => void;
  database_search_results: (data: SearchResults) => void;
  system_status: (data: SystemStatus) => void;
  signal: (data: SignalData) => void;
  rrd_timeseries_data: (data: TimeSeriesData) => void;

  // Client → Server
  query_search: (params: SearchParams) => void;
  update_alerts: (terms: Terms) => void;
  signal_freqs: () => void;
  rrd_timeseries: (params: RRDParams) => void;
}
```

---

## Database Migrations

### Migration 1: Initial Schema

**File**: `prisma/migrations/001_init/migration.sql`

**Purpose**: Create all tables matching existing Python database

**Generated by**: `npx prisma migrate dev --name init`

### Migration 2: FTS5 Virtual Table

**File**: `prisma/migrations/002_fts5/migration.sql`

**Purpose**: Create FTS5 virtual table for full-text search

**Manual SQL**:

```sql
-- Create FTS5 virtual table
CREATE VIRTUAL TABLE messages_fts USING fts5(
  text,
  tail,
  flight,
  depa,
  dsta,
  msg_text,
  content='messages',
  content_rowid='id'
);

-- Populate from existing data
INSERT INTO messages_fts(rowid, text, tail, flight, depa, dsta, msg_text)
SELECT id, text, tail, flight, depa, dsta, msg_text
FROM messages;

-- Trigger: INSERT
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, text, tail, flight, depa, dsta, msg_text)
  VALUES (new.id, new.text, new.tail, new.flight, new.depa, new.dsta, new.msg_text);
END;

-- Trigger: UPDATE
CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
  UPDATE messages_fts SET
    text = new.text,
    tail = new.tail,
    flight = new.flight,
    depa = new.depa,
    dsta = new.dsta,
    msg_text = new.msg_text
  WHERE rowid = new.id;
END;

-- Trigger: DELETE
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts WHERE rowid = old.id;
END;
```

### Migration 3: Signal Level Refactor

**File**: `prisma/migrations/003_signal_levels/migration.sql`

**Purpose**: Split single `level` table into per-decoder tables

**Manual SQL**:

```sql
-- Drop old table
DROP TABLE IF EXISTS level;

-- Create per-decoder tables
CREATE TABLE level_acars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  level REAL NOT NULL,
  freq TEXT
);

CREATE INDEX idx_level_acars_timestamp ON level_acars(timestamp);

-- Repeat for VDLM, HFDL, IMSL, IRDM
```

### Migration 4: Add Client Fields

**File**: `prisma/migrations/004_client_fields/migration.sql`

**Purpose**: Add React frontend fields (matched, decodedText, etc.)

**Generated by**: Updating Prisma schema and running `npx prisma migrate dev`

---

## Testing Strategy

### Unit Tests

**Framework**: Vitest

**Coverage**:

- Message processing logic (duplicate detection, multi-part merging, alert matching)
- Flight data lookup and caching
- RRD data formatting
- Database operations (CRUD)

**Example**:

```typescript
// tests/messageProcessor.test.ts
import { describe, it, expect } from 'vitest';
import { MessageProcessor } from '../src/services/messageProcessor';

describe('MessageProcessor', () => {
  it('should detect full field duplicates', async () => {
    const processor = new MessageProcessor(prisma);

    const msg1 = { uid: 'test1', text: 'TEST', ... };
    const msg2 = { uid: 'test2', text: 'TEST', ... };

    await processor.processMessage(msg1);
    const result = await processor.checkDuplicate(msg2);

    expect(result).toBe(true);
  });
});
```

### Integration Tests

**Framework**: Vitest + Supertest (for API routes)

**Coverage**:

- Socket.IO event flow (client → server → database → broadcast)
- API routes (search, metrics, health checks)
- Database migrations (up and down)
- RRD integration

**Example**:

```typescript
// tests/socket.integration.test.ts
import { describe, it, expect } from "vitest";
import { io as Client } from "socket.io-client";

describe("Socket.IO Integration", () => {
  it("should emit acars_msg when message received", (done) => {
    const client = Client("http://localhost:3000");

    client.on("acars_msg", (data) => {
      expect(data.msghtml.uid).toBeDefined();
      done();
    });

    // Simulate message from acars_router
  });
});
```

### Performance Tests

**Goal**: Verify system can handle 500+ messages/second

**Tools**: Artillery or k6

**Scenarios**:

- Sustained message load (500 msg/sec for 5 minutes)
- Burst load (1000 msg/sec for 30 seconds)
- Memory stability (no leaks over 1 hour)

---

## Deployment Strategy

### Docker Configuration

**New Dockerfile** for Node.js backend:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

# Run migrations and start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
```

### Docker Compose (Development)

```yaml
version: "3.8"

services:
  backend:
    build: ./acarshub-backend
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=file:/data/acarshub.db
      - NODE_ENV=development
    volumes:
      - ./data:/data
      - ./acarshub-backend:/app
    command: npm run dev

  frontend:
    build: ./acarshub-react
    ports:
      - "3000:3000"
    depends_on:
      - backend
    command: npm run dev
```

### nginx Configuration Updates

**Update** `/rootfs/etc/nginx.acarshub/sites-enabled/acarshub`:

```nginx
# Proxy to Node.js backend (instead of Python/Gunicorn)
location /socket.io {
  proxy_pass http://localhost:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_cache_bypass $http_upgrade;
}

location /metrics {
  proxy_pass http://localhost:3000;
}

# Serve React frontend (no change)
location / {
  root /app/acarshub-react/dist;
  try_files $uri $uri/ /index.html;
}
```

### Environment Variables

**`.env` file**:

```bash
DATABASE_URL="file:/data/acarshub.db"
NODE_ENV=production
PORT=3000
ACARS_ROUTER_HOST=localhost
ACARS_ROUTER_PORT=15550
RRD_PATH=/run/acars/acarshub.rrd
```

---

## Timeline & Milestones

### Week 1-2: Foundation ✅

- ✅ Node.js project setup
- ✅ Prisma schema defined
- ✅ Basic Express server
- ✅ Initial migration created

### Week 3-4: Database & Models ✅

- ✅ All Prisma models implemented
- ✅ CRUD operations tested
- ✅ FTS5 migration created
- ✅ Migration tested on production DB copy

### Week 5-6: Message Processing ✅

- ✅ ACARS parsing ported to TypeScript
- ✅ Duplicate detection working
- ✅ Multi-part merging working
- ✅ Alert matching working

### Week 7: Socket.IO ✅

- ✅ All events ported
- ✅ React frontend connected
- ✅ Real-time messages flowing

### Week 8: API Routes ✅

- ✅ All Flask routes ported
- ✅ Integration tests passing

### Week 9: RRD Integration ✅

- ✅ `node-rrd` working
- ✅ Stats page displaying data

### Week 10: Testing ✅

- ✅ Unit tests passing
- ✅ Integration tests passing
- ✅ Performance tests passing

### Week 11: Deployment ✅

- ✅ Dockerfile created
- ✅ Docker Compose tested
- ✅ nginx configured
- ✅ Deployed to production

### Week 12: Stabilization & Polish

- ✅ Monitor for errors
- ✅ Fix edge cases
- ✅ Optimize performance
- ✅ Update documentation
- ✅ Retire Python backend

---

## Success Criteria

Phase 11 is **COMPLETE** when:

1. ✅ Node.js backend handles all ACARS messages
2. ✅ React frontend works with zero code changes
3. ✅ All Socket.IO events functional
4. ✅ Database migrations automated with Prisma
5. ✅ Search functionality works (FTS5)
6. ✅ Stats page displays RRD data
7. ✅ Alert matching and notifications work
8. ✅ Performance meets or exceeds Python backend
9. ✅ All tests passing (unit + integration + E2E)
10. ✅ Deployed to production successfully

---

## Post-Migration Cleanup (Phase 12)

After Node.js backend is stable:

1. **Delete Python backend** (`rootfs/webapp/`)
2. **Delete legacy frontend** (`acarshub-typescript/`)
3. **Update documentation** (remove Python references)
4. **Simplify Docker setup** (single backend)
5. **Archive migration artifacts** (for reference)

---

## Future: Desktop App (Phase 16+)

With Node.js backend, desktop app is straightforward:

**Electron Wrapper**:

```javascript
// main.js (Electron)
const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");

let backend;
let mainWindow;

app.on("ready", () => {
  // Start Node.js backend
  backend = spawn("node", ["server.js"]);

  // Create window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
    },
  });

  // Load React app
  mainWindow.loadURL("http://localhost:3000");
});

app.on("quit", () => {
  backend.kill();
});
```

**Result**: 80-150MB desktop app (acceptable for ACARS monitoring)

---

## Summary

**Phase 11** migrates ACARS Hub from Python/Flask to Node.js/TypeScript/Prisma:

- **Single language stack** (TypeScript everywhere)
- **Better migrations** (Prisma > Alembic)
- **Desktop app ready** (Electron option)
- **Contributor friendly** (TypeScript > Python for web devs)
- **Timeline**: 10-12 weeks (with AI assistance)
- **No future rewrite** (this is the last one)

**React frontend**: Zero changes required (Socket.IO events stay the same)

**Deployment**: Parallel development → testing → cutover (no downtime)

**Status**: Ready to begin implementation 🚀
