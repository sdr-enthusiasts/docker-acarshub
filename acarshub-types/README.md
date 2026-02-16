# @acarshub/types

Shared TypeScript type definitions for ACARS Hub frontend and backend.

## Overview

This package contains all TypeScript interfaces and types that define the API contract between the ACARS Hub React frontend and Node.js backend. By maintaining types in a shared package, we ensure type safety and prevent drift between client and server implementations.

## Installation

This package is part of the ACARS Hub monorepo and uses npm workspaces. It's automatically linked when you run `npm install` at the workspace root.

```bash
# At repository root
npm install
```

## Usage

### In Frontend (React)

```typescript
import type { AcarsMsg, SocketEvents, CurrentSearch } from "@acarshub/types";

// Use in component
interface Props {
  message: AcarsMsg;
}

// Use with Socket.IO
socket.on("acars_msg", (data: HtmlMsg) => {
  // data is fully typed
});
```

### In Backend (Node.js)

```typescript
import type { AcarsMsg, SystemStatus, Terms } from "@acarshub/types";
import type { SocketEvents } from "@acarshub/types/socket";

// Use in Socket.IO server
io.on("connection", (socket) => {
  socket.emit("system_status", statusData); // Typed
});
```

## Module Organization

Types are organized into logical modules:

- **`messages.ts`** - ACARS message structures, message groups, decoded text
- **`adsb.ts`** - ADS-B aircraft data, positions, targets
- **`system.ts`** - System status, decoders, alerts, signals, version info
- **`search.ts`** - Search queries and results
- **`socket.ts`** - Socket.IO event definitions (the API contract)

### Exports

You can import from the main package or specific modules:

```typescript
// Import from main package
import type { AcarsMsg, SocketEvents } from "@acarshub/types";

// Import from specific modules
import type { AcarsMsg } from "@acarshub/types/messages";
import type { SocketEvents } from "@acarshub/types/socket";
import type { SystemStatus } from "@acarshub/types/system";
```

## Key Types

### Messages

- **`AcarsMsg`** - Core ACARS message structure with all fields
- **`MessageGroup`** - Collection of messages from a single source (aircraft/station)
- **`DecodedText`** - Decoded message content from @airframes/acars-decoder
- **`HtmlMsg`** - Message wrapper for Socket.IO transmission

### ADS-B

- **`ADSBAircraft`** - Simplified aircraft position data
- **`AdsbPlane`** - Complete readsb/dump1090 format
- **`ADSBData`** - Aircraft list response

### System

- **`SystemStatus`** - Complete system health and decoder status
- **`Terms`** - Alert term configuration (terms to match and ignore)
- **`Decoders`** - Enabled decoder configuration (ACARS, VDLM, HFDL, etc.)
- **`SignalLevelData`** - Signal strength statistics by decoder

### Search

- **`CurrentSearch`** - Search query parameters
- **`SearchHtmlMsg`** - Search results with messages
- **`AlertsByTermResults`** - Historical alert matches

### Socket.IO Events

- **`SocketEvents`** - Events received from backend (server → client)
- **`SocketEmitEvents`** - Events sent to backend (client → server)

These define the complete real-time API contract.

## Development

### Building

```bash
npm run build
```

This compiles TypeScript to JavaScript and generates `.d.ts` declaration files in `dist/`.

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

## Design Principles

1. **Single Source of Truth** - Types are defined once and shared everywhere
2. **Strict TypeScript** - No `any` types, strict mode enabled
3. **API Contract** - Socket.IO events define the backend/frontend contract
4. **Backward Compatibility** - Legacy type aliases maintained during migration
5. **Documentation** - All interfaces include JSDoc comments

## Migration Notes

During the Python → Node.js backend migration, this package was created by extracting types from `acarshub-react/src/types/index.ts`. Legacy type aliases (e.g., `Plane` → `MessageGroup`) are maintained for backward compatibility.

Frontend-specific types (React components, UI state, settings) remain in the frontend package.

## License

GPL-3.0-or-later

Copyright (C) 2022-2026 Frederick Clausen II
