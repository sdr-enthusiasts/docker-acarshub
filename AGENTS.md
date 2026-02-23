# ACARS Hub - AI Agent Guide

## READ THIS DOCUMENT BEFORE MAKING ANY CHANGES\*\*

## Overview

ACARS Hub is a web application for receiving, decoding, and displaying ACARS (Aircraft Communications Addressing and Reporting System) messages.

- **Frontend**: React 19 + TypeScript with Catppuccin theming
- **Backend**: Node.js + Fastify + Socket.IO for real-time messaging
- **Database**: SQLite with Drizzle ORM (custom migration runner, no Alembic)
- **Deployment**: Docker container with nginx + Node.js

## Documentation Structure

**Start here**, then refer to specialized docs:

- **AGENTS.md** (this file) - Coding standards, quality requirements, workflow
- **agent-docs/ARCHITECTURE.md** - System design, data flow, deployment architecture
- **agent-docs/DESIGN_LANGUAGE.md** - UI/UX patterns, component usage, accessibility
- **agent-docs/CATPPUCCIN.md** - Color palette reference for theming
- **agent-docs/FEATURES.md** - Feature documentation (decoders, search, alerts, map)
- **agent-docs/TESTING.md** - Test strategy, patterns, and infrastructure
- **agent-docs/V4.2.md** - v4.2 aircraft session architecture and implementation plan

## Critical Rules

### 🧪 TESTING MANDATE

**All new code MUST have tests. No exceptions.**

- ✅ Every new function, service, or module requires corresponding tests
- ✅ Every bug fix requires a **regression test** that fails without the fix and passes with it
- ✅ Tests are written alongside code, not after — they are part of the definition of "done"
- ✅ A PR or change that adds untested code is **incomplete**, not "done but needs tests later"

**Regression tests are non-negotiable for bug fixes:**

```typescript
// When fixing a bug, first write a test that reproduces it
it("regression: session matching does not create duplicate sessions for same hex", () => {
  // This test must FAIL before the fix and PASS after
  const session1 = findOrCreateSession({ hex: "ABC123" });
  const session2 = findOrCreateSession({ hex: "ABC123" });
  expect(session1.sessionId).toBe(session2.sessionId);
});
```

See `agent-docs/TESTING.md` for patterns, structure, and backend vs frontend test conventions.

### 🚫 NO SUMMARIES

**Never create summary documents.** Only reference documentation. If you need to document something, create a standards document (like DESIGN_LANGUAGE.md).

Bad:

- "PHASE_X_SUMMARY.md"
- "IMPLEMENTATION_PROGRESS.md"
- "REFACTOR_NOTES.md"

Good:

- "ARCHITECTURE.md" (describes how the system works)
- "TESTING.md" (describes how to test)
- "FEATURES.md" (describes what features exist)

### 📋 Markdown Standards

- Always include language specifier for code blocks (e.g., `bash`, `typescript`, `json`)
- Use headings, not emphasis, for section titles
- No duplicate headings with same content in same document
- Blank lines around headings and code blocks
- GitHub-flavored markdown with strict linting

**Documentation Purpose**:

- Document **WHY**, not **WHAT** (code shows what)
- Document architectural decisions
- Document standards and patterns
- Document complex business logic
- Do NOT document implementation progress

## Code Quality Requirements

### Continuous Integration

All changes MUST pass:

```bash
just ci
```

This runs:

- Biome linting and formatting
- TypeScript compilation (strict mode)
- Markdown linting
- All tests (unit, integration, E2E)

### TypeScript Standards

**Strict Mode Always**:

- ✅ No `any` type - use `unknown` with type guards
- ✅ Explicit function return types
- ✅ Explicit parameter types
- ✅ Leverage type inference only when obvious
- ✅ Create interfaces for complex objects
- ✅ Use generics where appropriate

**Example**:

```typescript
// ❌ Bad
function processData(data: any): any {
  return data.value;
}

// ✅ Good
interface MessageData {
  uid: string;
  text: string;
  timestamp: number;
}

function processData(data: MessageData): string {
  return data.text;
}
```

### SCSS/Styling Standards

**Core Principles**:

- 🚫 **NO INLINE STYLES** - All styling in SCSS files
- 🚫 **NO CSS FRAMEWORKS** - No Bootstrap, Tailwind, Material-UI, etc.
- ✅ **Catppuccin theming required** - Mocha (dark) and Latte (light)
- ✅ **Mobile-first responsive design** - Critical, not optional
- ✅ **SCSS modules** - Use `@use`/`@forward`, not deprecated `@import`

**Catppuccin Colors**:

- Use CSS variables: `var(--color-text)`, `var(--color-primary)`, etc.
- Theme switching swaps variable values via SCSS mixins
- See `agent-docs/CATPPUCCIN.md` for full palette

**Mobile-First Design** (CRITICAL):

- Base styles for mobile (320px+)
- `@media (min-width: 768px)` for tablet
- `@media (min-width: 1024px)` for desktop
- Touch targets minimum 44x44px
- No horizontal scrolling on any screen size
- Test at 320px, 375px, 768px, 1024px, 1920px

**Example**:

```scss
.button {
  // Mobile-first: base styles for small screens
  padding: 0.75rem 1rem;
  font-size: 1rem;

  // Tablet and up
  @media (min-width: 768px) {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
  }
}
```

### Logging Standards

**Use the logger, not console**:

```typescript
import { createLogger } from "@/utils/logger";
const logger = createLogger("moduleName");

// ✅ Good
logger.info("Connection established", { socketId });
logger.error("Failed to decode", { uid, error: err.message });

// ❌ Bad
console.log("Connection established");
console.error("Failed to decode", err);
```

**Log Levels**:

- `error` - Critical failures preventing functionality
- `warn` - Potential issues, degraded functionality
- `info` - Important state changes, major events
- `debug` - Detailed debugging, state transitions
- `trace` - Very verbose, high-frequency events

## Development Environment

### Nix Flakes

All system-level tools managed via `flake.nix`:

- Node.js, npm, TypeScript
- Python, PDM
- Biome, Playwright
- Pre-commit hooks

**Adding Tools**:

**npm packages** (React libs):

- Add to `package.json`
- Run `npm install`

**System tools** (compilers, test runners):

1. Add to `flake.nix`
2. **STOP** and tell user: "Please run `nix develop` or `direnv allow`"
3. Wait for confirmation
4. Continue

### Git Commands

Always use `--no-pager` for programmatic git usage:

```bash
git --no-pager diff
git --no-pager log --oneline -10
git --no-pager show HEAD
```

## Code Organization

### File Structure

```text
acarshub-react/
├── src/
│   ├── components/     # Reusable React components
│   ├── pages/          # Page components (Live Messages, Map, etc.)
│   ├── hooks/          # Custom React hooks
│   ├── store/          # Zustand state management
│   ├── services/       # Socket.IO, API services
│   ├── types/          # TypeScript interfaces
│   ├── utils/          # Utility functions
│   └── styles/         # SCSS modules
├── e2e/                # Playwright E2E tests
├── public/             # Static assets
└── tests/              # Test fixtures
```

### Component Patterns

**See `agent-docs/DESIGN_LANGUAGE.md` for**:

- Component usage patterns
- Accessibility guidelines
- Mobile UX patterns
- Spacing, typography, colors

**Example Component**:

```typescript
import type { ReactNode } from "react";
import "./Button.scss";

interface ButtonProps {
  variant?: "primary" | "secondary" | "danger";
  size?: "small" | "medium" | "large";
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "medium",
  disabled = false,
  onClick,
  children,
}: ButtonProps) {
  return (
    <button
      className={`button button--${variant} button--${size}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
```

### State Management

**Zustand Stores**:

- `useAppStore` - Global app state (messages, alerts, connection)
- `useSettingsStore` - User preferences (theme, locale, notifications)

**Store Pattern**:

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  theme: "mocha" | "latte";
  setTheme: (theme: "mocha" | "latte") => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "mocha",
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "acars-settings",
    },
  ),
);
```

### Socket.IO Communication

**Backend Events** (received by frontend):

- `acars_msg` - New ACARS message
- `adsb_aircraft` - ADS-B aircraft positions
- `system_status` - Backend health status
- `terms` - Alert term updates
- `database_search_results` - Search results

**Frontend Events** (sent to backend):

- `query_search` - Database search request
- `update_alerts` - Update alert terms
- `request_status` - Request system status

**Flask-SocketIO Quirk** (CRITICAL):

```typescript
// Flask-SocketIO requires namespace as THIRD argument
socket.emit("query_search", payload, "/main"); // ✅ Correct

// Standard Socket.IO (won't work with Flask-SocketIO)
socket.emit("query_search", payload); // ❌ Wrong
```

## Testing Standards

> **Reminder**: The Testing Mandate in Critical Rules above applies here. Every new module
> needs tests. Every bug fix needs a regression test. Coverage goals are a floor, not a ceiling.

### Test Coverage Goals

- Utilities: 90%+ coverage
- Stores: 80%+ coverage
- Components: 70%+ coverage
- Backend services: 80%+ coverage
- Backend formatters/enrichment: 90%+ coverage

### Test Types

**Frontend Unit Tests** (Vitest + React Testing Library):

- `acarshub-react/src/utils/__tests__/` - Utility function tests
- `acarshub-react/src/store/__tests__/` - Zustand store tests
- `acarshub-react/src/components/__tests__/` - Component tests

**Backend Unit Tests** (Vitest):

- `acarshub-backend/src/__tests__/` - Config and top-level tests
- `acarshub-backend/src/db/__tests__/` - Database query and migration tests
- `acarshub-backend/src/services/__tests__/` - Service tests (poller, queue, scheduler, etc.)
- `acarshub-backend/src/formatters/__tests__/` - Enrichment pipeline tests
- `acarshub-backend/src/socket/__tests__/` - Socket handler tests

**Integration Tests** (Vitest):

- Complex component interactions
- Store + component integration
- Mock Socket.IO events
- Backend: real SQLite in-memory DB for DB/migration tests

**E2E Tests** (Playwright):

- Critical user flows
- Accessibility audits (WCAG 2.1 AA)
- Performance validation (Lighthouse)

See `agent-docs/TESTING.md` for patterns and strategies.

## Accessibility Requirements

**WCAG 2.1 AA Compliance**:

- Color contrast: 4.5:1 for normal text, 3:1 for large text
- Touch targets: Minimum 44x44px
- Keyboard navigation: All interactive elements accessible
- Screen reader support: ARIA labels, roles, landmarks
- Focus management: Visible focus indicators, focus traps in modals

**Test with**:

```bash
just test-a11y  # Automated axe-core tests
```

## Performance Standards

**Bundle Size**:

- Target: <500KB per chunk (gzipped)
- Monitor: `npm run analyze` (rollup-plugin-visualizer)

**Runtime Performance**:

- 60fps with 100+ aircraft on map
- No memory leaks in long-running sessions
- Efficient re-rendering (React.memo, useMemo, useCallback)

**Test with**:

```bash
just lighthouse  # Lighthouse CI
```

## Quality Gates

Before committing:

1. ✅ `just ci` passes (all linting, tests, TypeScript)
2. ✅ No `any` types introduced
3. ✅ No inline styles
4. ✅ No console statements (use logger)
5. ✅ Mobile responsiveness verified (DevTools or actual device)
6. ✅ Accessibility checked (keyboard nav, screen reader)
7. ✅ Component patterns match DESIGN_LANGUAGE.md
8. ✅ Tests written for ALL new code (not optional, not deferred)
9. ✅ Regression test written if this is a bug fix

## Agent Workflow

### Before Starting Work

1. Read AGENTS.md (this file)
2. Read DESIGN_LANGUAGE.md for UI patterns
3. Read ARCHITECTURE.md for system understanding
4. Check if new system tools needed → update flake.nix → wait for user
5. Understand current task scope

### During Development

1. Make incremental changes
2. Run quality checks frequently (`biome check`, `tsc --noEmit`)
3. Test in browser regularly
4. Follow DESIGN_LANGUAGE.md patterns
5. Ensure mobile responsiveness (test at 375px, 768px, 1024px)
6. Document complex logic with WHY, not WHAT
7. Ask clarifying questions if unclear
8. Write tests as you go — do not defer until the end

### Before Completing Work

1. Run `just ci` to verify all checks pass
2. Verify no `any` types introduced
3. Verify no inline styles
4. Verify mobile responsiveness
5. Check patterns match DESIGN_LANGUAGE.md
6. Confirm every new function/service/module has test coverage
7. Confirm bug fixes have regression tests
8. Run `git --no-pager diff` to review changes
9. Suggest next steps or improvements

### Communication Style

- Be direct and technical
- Explain architectural decisions
- Highlight trade-offs when they exist
- Point out potential issues proactively
- Provide code examples when explaining concepts
- No apologies for expected behavior

## Getting Help

**For specific topics**:

- UI/UX questions → `agent-docs/DESIGN_LANGUAGE.md`
- Color usage → `agent-docs/CATPPUCCIN.md`
- Feature details → `agent-docs/FEATURES.md`
- Testing → `agent-docs/TESTING.md`
- System design → `ARCHITECTURE.md`

**For debugging**:

1. Check logs in Settings → Advanced → Log Viewer
2. Set log level to Debug or Trace
3. Reproduce issue
4. Export logs for analysis

## Questions Before Making Changes

1. Does this follow TypeScript strict mode? (no `any`)
2. Does this use the logger? (no `console.*`)
3. Is styling in SCSS files? (no inline styles)
4. Is it mobile-first responsive? (test at 320px+)
5. Does it match DESIGN_LANGUAGE.md patterns?
6. Will `just ci` pass?
7. Are tests written for ALL new code?
8. If this is a bug fix, is there a regression test?
9. Is the documentation updated (if needed)?
