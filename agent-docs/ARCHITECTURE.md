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
│  • Serves React static files (HTML/CSS/JS)                  │
│  • Proxies /socket.io/* → Python backend                    │
│  • Proxies /metrics → Python backend                        │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Proxy
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Python Flask Backend (Port 8888)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Socket.IO   │  │   Database   │  │   Decoders   │     │
│  │   Handlers   │  │   (SQLite)   │  │  (libacars)  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ TCP Sockets
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Radio Decoders (External)                   │
│  • acarsdec (ACARS)                                          │
│  • vdlm2dec (VDL Mode 2)                                     │
│  • dumphfdl (HFDL)                                           │
│  • dumpvdl2 (VDLM2)                                          │
└─────────────────────────────────────────────────────────────┘
```

## Frontend Architecture

### Technology Stack

- **React 19** - UI framework
- **TypeScript** - Type safety (strict mode, no `any`)
- **Vite** - Build tool and dev server
- **Zustand** - State management
- **Socket.IO Client** - Real-time communication
- **React Router** - Client-side routing
- **MapLibre GL JS** - Map rendering
- **Chart.js** - Statistics visualization
- **SCSS** - Styling with Catppuccin theming

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
│   ├── types/               # TypeScript interfaces
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

- `/` - Live Messages (default)
- `/live-map` - Aircraft map
- `/alerts` - Filtered alert messages
- `/search` - Database search
- `/stats` - Statistics and graphs
- `/status` - System health
- `/about` - Help and information

## Backend Architecture

### Backend Technology Stack

- **Python 3.x** - Runtime
- **Flask** - Web framework (API-only, no templates)
- **Flask-SocketIO** - WebSocket support
- **SQLAlchemy** - ORM
- **Alembic** - Database migrations
- **SQLite** - Database
- **RRDtool** - Time-series statistics
- **libacars** - ACARS message decoding

### Backend Directory Structure

```text
rootfs/webapp/
├── acarshub.py                  # Main Flask application
├── acarshub_helpers.py          # Helper functions
├── acarshub_database.py         # Database operations
├── acarshub_logging.py          # Logging setup
├── database/
│   ├── models.py                # SQLAlchemy models
│   └── migrations/              # Alembic migrations
│       └── versions/
└── static/                      # (empty - nginx serves React)
```

### Database Schema

**Tables**:

- `messages` - All received ACARS messages (with FTS5 index)
- `messages_saved` - Alert-matched messages (deprecated, legacy)
- `level_acars`, `level_vdlm2`, `level_hfdl`, `level_imsl`, `level_irdm` - Signal level statistics per decoder
- `freqs_acars`, `freqs_vdlm2`, `freqs_hfdl`, `freqs_imsl`, `freqs_irdm` - Frequency statistics per decoder
- `alert_terms` - User-configured alert terms
- `alembic_version` - Migration tracking

**Full-Text Search**:

- `messages_fts` - FTS5 virtual table for message content search
- Triggers keep FTS index in sync with `messages` table

### API Endpoints

**HTTP**:

- `/metrics` - Prometheus metrics (Gunicorn stats)

**Socket.IO Events** (namespace: `/main`):

**Server → Client**:

- `acars_msg` - New ACARS message
- `adsb_aircraft` - ADS-B aircraft positions
- `system_status` - Backend health status
- `terms` - Alert term updates
- `database_search_results` - Search results
- `signal_freqs` - Frequency statistics
- `signal_count` - Message count statistics
- `rrd_timeseries` - Time-series graph data
- `labels` - Message label definitions
- `decoders` - Enabled decoder configuration
- `features_enabled` - Feature flags

**Client → Server**:

- `query_search` - Database search request
- `update_alerts` - Update alert terms
- `request_status` - Request system status
- `signal_freqs` - Request frequency data
- `rrd_timeseries` - Request time-series data

**Flask-SocketIO Quirk** (CRITICAL):

```typescript
// Frontend MUST include namespace as third argument
socket.emit("event_name", payload, "/main");
```

## Data Flow

### Message Processing Pipeline

```text
Radio Decoder → TCP Socket → Python Backend → Database → Socket.IO → React Frontend
```

**Step by step**:

1. **Radio decoder** (acarsdec, vdlm2dec, etc.) receives radio signal
2. **Decoder** sends JSON message via TCP socket to Python backend
3. **Python backend** receives message:
   - Parses JSON
   - Runs through libacars decoder (if applicable)
   - Checks for duplicate messages
   - Checks for alert term matches
   - Stores in SQLite database
   - Updates signal/frequency statistics
4. **Socket.IO** broadcasts message to all connected clients
5. **React frontend** receives message:
   - Decodes with @airframes/acars-decoder (client-side)
   - Checks for duplicates
   - Merges multi-part messages
   - Updates Zustand store
   - Triggers re-render of components

### ADS-B Data Flow

```text
readsb/dump1090 → aircraft.json → Python Backend → Socket.IO → React Frontend
```

**Step by step**:

1. **readsb/dump1090** writes `aircraft.json` every second
2. **Python backend** polls `aircraft.json` every 5 seconds (background task)
3. **Backend** optimizes payload (52 fields → 13 fields = 75% reduction)
4. **Socket.IO** broadcasts `adsb_aircraft` event to all clients
5. **React frontend** receives ADS-B data:
   - Updates aircraft positions in Zustand store
   - Pairs with ACARS messages (hex > callsign > tail matching)
   - Updates map markers
   - Triggers re-render

### Search Flow

```text
React Frontend → Socket.IO → Python Backend → SQLite FTS → Socket.IO → React Frontend
```

**Step by step**:

1. **User** enters search terms in React search form
2. **React** emits `query_search` event with search criteria
3. **Python backend** receives search request:
   - Builds SQL query with FTS5 MATCH
   - Executes query against `messages_fts` table
   - Paginates results (50 per page)
4. **Socket.IO** sends `database_search_results` event (only to requester)
5. **React frontend** displays paginated results

## Message Groups & Culling

### Message Groups (Not Aircraft)

**Terminology**: "Message Group" - can be aircraft, ground station, or unknown source.

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

**Base Image**: `ghcr.io/sdr-enthusiasts/docker-baseimage:python`

**Services** (s6-overlay):

- `nginx` - Serves React static files, proxies WebSocket/API
- `acarshub` - Python Flask backend
- `decoders` - Radio decoder processes (optional)

**Volumes**:

- `/run/acars` - Database and RRD files
- `/etc/acars` - Configuration files

**Ports**:

- `80` - HTTP (nginx)
- `8888` - Python backend (internal only)
- `15550-15559` - Decoder TCP ports (optional)

### nginx Configuration

**Server root**: `/webapp/dist` (React build output)

**Routes**:

- `/*` - Serve React static files, fallback to `index.html` (SPA routing)
- `/socket.io/*` - Proxy to Python backend (WebSocket)
- `/metrics` - Proxy to Python backend (Prometheus)

**Benefits**:

- nginx optimized for static file serving
- Python only handles API and WebSocket
- Clean separation of concerns
- Easy horizontal scaling

## Real-Time Features

### Live Message Updates

- Messages appear instantly (< 100ms latency)
- Automatic duplicate detection (3 strategies)
- Multi-part message merging
- Client-side ACARS decoding
- Alert term highlighting

### Live Map Updates

- ADS-B positions update every 5 seconds
- Aircraft markers rotate based on heading
- Color-coded by message status (alerts, unread, etc.)
- Hover tooltips with aircraft details
- Click to view messages

### Live Statistics

- RRD time-series graphs (1hr → 1yr)
- Real-time frequency distribution
- Signal level distribution
- Message count statistics
- Auto-refresh every 30 seconds

### System Status

- Real-time decoder health monitoring
- Thread status (database, scheduler, decoders)
- Message rate (total, per-minute)
- Error tracking
- Auto-refresh every 10 seconds

## Performance Considerations

### Frontend

- **Bundle size**: ~730 KB gzipped (map chunk 1MB, index 588KB, decoder 455KB)
- **Code splitting**: React, Chart.js, MapLibre, decoder in separate chunks
- **Efficient re-rendering**: React.memo, useMemo, useCallback
- **Memory management**: Two-level culling system (messages + groups)
- **Map performance**: GPU-accelerated rendering (60fps with 100+ aircraft)

### Backend

- **Non-blocking I/O**: Flask-SocketIO with gevent
- **Database optimization**: Indexes on common queries, FTS5 for search
- **Message deduplication**: Prevents database bloat
- **Signal statistics**: Per-decoder tables for efficient queries
- **RRD database**: Constant-size time-series storage

### Network

- **WebSocket**: Binary protocol, minimal overhead
- **Payload optimization**: ADS-B reduced from 52 → 13 fields (75% reduction)
- **Event-driven**: No polling, push-only architecture
- **Compression**: gzip for static assets

## Security Considerations

### Frontend Optimization

- **No API keys in code**: Map tiles use CartoDB (no key required) or user-provided Maptiler key
- **Input sanitization**: All user input escaped before display
- **XSS prevention**: React automatically escapes JSX content

### Backend Optimization

- **No authentication** (designed for private network deployment)
- **CORS**: Configured for local network access
- **SQL injection**: Protected by SQLAlchemy parameterized queries
- **Rate limiting**: None (trusted environment assumption)

**Deployment Assumption**: ACARS Hub runs on private network, not internet-exposed.

## Testing Architecture

### Unit Tests (Vitest)

- **Utilities**: 100% coverage (282 tests)
- **Stores**: Comprehensive coverage (113 tests)
- **Components**: Button, Card components (110 tests)

### Integration Tests (Vitest + React Testing Library)

- **Complex components**: MessageCard, SettingsModal (98 tests)
- **Socket.IO event flow**: Mock backend
- **Store integration**: Message processing, alert matching

### E2E Tests (Playwright)

- **Smoke tests**: 8 tests (navigation, theme switching, mobile responsiveness)
- **Feature tests**: 7 tests (sound alerts, settings)
- **Browser**: Chromium only (CI environment)

### Accessibility Tests (Playwright + axe-core)

- **WCAG 2.1 AA**: 25+ automated tests
- **Color contrast**: Both themes tested
- **Keyboard navigation**: All pages
- **Screen reader**: ARIA landmarks, labels, roles

## Monitoring & Observability

### Logging

- **Frontend**: loglevel with in-memory buffer (1000 logs)
  - Levels: error, warn, info, debug, trace
  - Module-specific loggers (socket, decoder, store, map, ui)
  - Exportable for user support
- **Backend**: Python logging with rotating file handler
  - Levels: DEBUG, INFO, WARNING, ERROR, CRITICAL
  - Per-decoder logging
  - System event logging

### Metrics

- **Prometheus**: `/metrics` endpoint (Gunicorn stats)
- **RRD**: Time-series statistics (messages, errors, signal levels)
- **System status**: Real-time decoder health, thread status, message rates

## Future Considerations

### Desktop Application

**Tauri** can bundle Python backend as sidecar process:

- Same codebase
- Native executable
- Python bundled with app
- No Docker required

### Horizontal Scaling

**Current limitation**: Single instance (SQLite)

**Path to scaling**:

1. Replace SQLite with PostgreSQL
2. Add Redis for Socket.IO session storage
3. Run multiple Python backend instances
4. nginx load balances WebSocket connections
5. Shared database and RRD storage (NFS or S3)

### Mobile App

**React Native** could reuse most React components:

- Same state management (Zustand)
- Same Socket.IO client
- Same business logic
- Different UI components (native)
