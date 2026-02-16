# Backend Migration Setup Decisions

## Branch Created

✅ Created branch: `feature/nodejs-backend-migration`

## Task 1: Frontend Dependencies Analysis

### Current Frontend Structure

The frontend (`acarshub-react/`) has a comprehensive type system in `src/types/index.ts` containing:

- **Core Message Types**: `AcarsMsg`, `MessageGroup`, `ADSBAircraft`
- **Socket.IO Events**: `SocketEvents`, `SocketEmitEvents`
- **System Status**: `SystemStatus`, `StatusDecoder`, `StatusServer`
- **Search & Alerts**: `CurrentSearch`, `AlertTerm`, `AlertMatched`, `Terms`
- **Configuration**: `UserSettings`, `MapSettings`, `Decoders`
- **UI Types**: Component props, modal states, form configs

### Key Dependencies for Backend Consideration

From `acarshub-react/package.json`:

**Shared with Backend (will need in both)**:

- `socket.io-client` (4.8.3) - Frontend uses this; backend needs `socket.io` server
- `date-fns` (4.1.0) - Date formatting (likely needed in backend too)
- TypeScript (5.9.3) - Type system
- Vitest (4.0.18) - Testing framework

**Frontend-Only** (not needed in backend):

- React ecosystem (19.2.0)
- MapLibre GL (5.18.0)
- Chart.js (4.5.1)
- Zustand (5.0.11)
- All UI/styling tools

**Backend-Specific** (per migration plan):

- Drizzle ORM
- Pino logger
- Fastify
- Prometheus metrics
- Node.js TCP socket libraries

## Task 2: Shared Type Definitions Strategy

### Critical Requirement

The migration plan explicitly states:

> "There is very likely going to be a shared set of typedefs, and we need to use the SAME typedefs between the front and back end. Not mirror them, THE SAME source file."

### Types That MUST Be Shared

1. **Socket.IO Event Contracts**
   - `SocketEvents` - All events backend emits to frontend
   - `SocketEmitEvents` - All events frontend sends to backend
   - These define the API contract and MUST match exactly

2. **Message Data Structures**
   - `AcarsMsg` - Core ACARS message format
   - `ADSBAircraft` - ADS-B aircraft data
   - `MessageGroup` - Message grouping structure
   - All decoder-related interfaces

3. **System Status & Configuration**
   - `SystemStatus`, `StatusDecoder`, `StatusServer`
   - `Decoders` configuration
   - `Terms`, `AlertTerm`, `AlertMatched`

4. **Search & Database**
   - `CurrentSearch` - Search query structure
   - `SearchHtmlMsg` - Search result format
   - `AlertsByTermResults` - Alert search results

### Types That Are Frontend-Only

- `BaseComponentProps`, `MessageComponentProps` - React component props
- `TabState`, `ModalState`, `TooltipConfig` - UI state
- `ChartDataPoint`, `ChartSeries` - Chart.js types
- `ThemeConfig`, `WindowSize` - UI appearance
- `UserSettings` - Frontend preferences (though backend may need to store these)
- Map-related UI types (overlays, providers, settings)

## Task 3: Project Structure Decision

### Evaluation of Options

#### Option A: Separate Backend Directory (Migration Plan Proposal)

```text
docker-acarshub/
├── acarshub-backend/
│   ├── src/
│   ├── node_modules/
│   └── package.json
└── acarshub-react/
    ├── src/
    ├── node_modules/
    └── package.json
```

**Pros**:

- Clear separation
- Independent versioning
- Matches migration plan structure

**Cons**:

- Duplicate `node_modules/` (TypeScript, Socket.IO types, testing tools)
- Type sharing requires complex path resolution or symlinking
- Risk of dependency version mismatches
- Larger disk footprint

#### Option B: Backend Inside Frontend

```text
docker-acarshub/
└── acarshub-react/
    ├── backend/
    ├── src/ (frontend)
    └── node_modules/ (shared)
```

**Pros**:

- Single `node_modules/`
- Easy type sharing

**Cons**:

- Conceptually wrong - backend is not part of React app
- Build tooling confusion
- Deployment complexity

#### Option C: Monorepo with Shared Types Package

```text
docker-acarshub/
├── package.json (workspace root)
├── packages/
│   ├── types/
│   │   ├── src/
│   │   └── package.json
│   ├── frontend/ (renamed from acarshub-react)
│   │   └── package.json
│   └── backend/
│       └── package.json
└── node_modules/ (hoisted shared deps)
```

**Pros**:

- Types are first-class shared package
- npm workspaces handles linking automatically
- Prevents type drift completely
- Shared dependencies hoisted to root
- Industry standard approach

**Cons**:

- Requires renaming/moving existing `acarshub-react/`
- More complex initial setup
- Changes existing paths

#### Option D: Minimal Monorepo (RECOMMENDED)

```text
docker-acarshub/
├── package.json (workspace root, minimal)
├── acarshub-types/
│   ├── src/
│   │   ├── index.ts (extracted from frontend)
│   │   ├── messages.ts
│   │   ├── socket.ts
│   │   └── ...
│   ├── package.json
│   └── tsconfig.json
├── acarshub-react/ (MINIMAL CHANGES)
│   ├── src/
│   │   ├── types/ (frontend-only types remain)
│   │   └── ...
│   └── package.json (adds dependency on @acarshub/types)
└── acarshub-backend/ (NEW)
    ├── src/
    ├── package.json (depends on @acarshub/types)
    └── tsconfig.json
```

**Pros**:

- Minimal disruption to existing frontend
- Types properly shared via package
- Shared deps hoisted by npm workspaces
- Clear separation of concerns
- Prevents type drift

**Cons**:

- Requires extracting types from frontend
- Frontend imports need updating

### RECOMMENDATION: Option D - Minimal Monorepo

This approach balances all concerns:

1. **Type Safety**: Types are single source of truth in `acarshub-types/`
2. **Minimal Disruption**: Frontend mostly unchanged, just updated imports
3. **Efficient**: Shared dependencies (`socket.io-client` types, TypeScript, etc.) hoisted to root
4. **Clear Architecture**: Three packages with clear boundaries
5. **Standard Tooling**: npm workspaces (built-in, no extra tools)

### Disk Size Impact Analysis

**Current Structure**:

- `acarshub-react/node_modules/`: ~500MB (estimate)

**Option A (Separate)**:

- `acarshub-react/node_modules/`: ~500MB
- `acarshub-backend/node_modules/`: ~400MB (overlap with frontend)
- **Total: ~900MB** (many duplicates)

**Option D (Monorepo)**:

- `node_modules/` (root, hoisted): ~550MB
- `acarshub-types/node_modules/`: minimal (~5MB)
- `acarshub-react/node_modules/`: ~50MB (frontend-only)
- `acarshub-backend/node_modules/`: ~100MB (backend-only)
- **Total: ~705MB** (shared deps hoisted)

**Savings**: ~200MB (~22% reduction)

Backend-only dependencies that won't be in frontend:

- Drizzle ORM + better-sqlite3
- Pino logger
- Fastify
- Prometheus client
- TCP socket libraries

Frontend-only dependencies that won't be in backend:

- React + React DOM
- MapLibre GL
- Chart.js
- Vite
- Sass

Shared dependencies (will be hoisted):

- TypeScript
- Socket.IO types (@types/socket.io)
- Vitest (for testing both)
- date-fns
- Biome (linting)

## Implementation Plan

### Phase 0: Monorepo Setup (Do First)

1. **Create workspace root `package.json`**:

```json
{
  "name": "acarshub-workspace",
  "private": true,
  "workspaces": ["acarshub-types", "acarshub-react", "acarshub-backend"],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces",
    "ci": "just ci"
  }
}
```

1. **Create `acarshub-types/` package**:
   - Extract shared types from `acarshub-react/src/types/index.ts`
   - Split into logical modules (messages, socket, system, alerts)
   - Create package.json with `"name": "@acarshub/types"`
   - Add tsconfig.json for type declarations

1. **Update `acarshub-react/`**:
   - Add `"@acarshub/types": "*"` to dependencies
   - Update imports from `@/types` to `@acarshub/types`
   - Keep frontend-only types in `src/types/`
   - Update tsconfig paths

1. **Create `acarshub-backend/` skeleton**:
   - Create package.json with `"@acarshub/types": "*"`
   - Create basic tsconfig extending workspace config
   - Add placeholder src/ structure

1. **Install and verify**:
   - Run `npm install` at root (installs all workspaces)
   - Verify type resolution in both frontend and backend
   - Run `just ci` to ensure frontend still works

### Phase 1-6: Follow Migration Plan

After Phase 0 setup, proceed with migration plan phases:

- Week 1: Database Layer (using shared types)
- Week 2: Socket.IO Server (using shared socket event types)
- Week 3: Background Services
- Week 4: Message Formatters (using shared message types)
- Week 5-6: Testing & Deployment

## Questions for Consideration

1. **Should `acarshub-types` be TypeScript-only or compiled?**
   - Recommendation: Compiled to JS + .d.ts files for better IDE support
   - Both frontend (Vite) and backend (Node) can consume compiled output

2. **Version management for types package?**
   - Start with `"*"` (always use workspace version)
   - Later: Semantic versioning if packages need independent releases

3. **Where should type-related utilities live?**
   - Type guards (e.g., `isAcarsMsg()`) should live in `acarshub-types/`
   - Validation schemas (Zod) should also live there

4. **How to handle frontend-specific type extensions?**
   - Keep in `acarshub-react/src/types/`
   - Use TypeScript intersection types to extend shared types
   - Example: `type AcarsMsgWithUI = AcarsMsg & { selected: boolean }`

## Next Steps

1. ✅ Create branch (DONE)
2. ✅ Analyze dependencies (DONE)
3. ✅ Document architecture decision (DONE)
4. **Create Phase 0 implementation checklist**
5. **Create `acarshub-types/` package structure**
6. **Extract and organize shared types**
7. **Set up npm workspaces**
8. **Update frontend imports**
9. **Verify with `just ci`**
10. **Proceed to Week 1 (Database Layer)**

## References

- Migration Plan: `dev-docs/NODEJS_MIGRATION_PLAN.md`
- Frontend Types: `acarshub-react/src/types/index.ts`
- Agent Standards: `AGENTS.md`
- Architecture: `agent-docs/ARCHITECTURE.md`
