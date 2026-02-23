# ACARS Hub - Testing Guide

This document describes the testing strategy, patterns, and infrastructure for ACARS Hub.

## Testing Mandate

**All new code MUST have tests. All bug fixes MUST have regression tests.**

This is a non-negotiable quality requirement, not a goal. See the Testing Mandate section in
`AGENTS.md` for the full policy. This document describes how to fulfill that requirement.

**The rule in plain terms**:

- Writing a new service, utility, formatter, or component → write tests for it
- Fixing a bug → first write a test that reproduces the bug (it must fail), then fix it (test must pass)
- Refactoring existing code → existing tests must continue to pass; add tests if coverage gaps are exposed

## Testing Overview

**Total Test Coverage**: 621+ tests across frontend and backend

- **Frontend Unit Tests**: 505 tests (Vitest)
- **Frontend Integration Tests**: 98 tests (Vitest + React Testing Library)
- **Backend Unit Tests**: Vitest (services, formatters, DB, socket handlers)
- **E2E Tests**: 15 tests (Playwright)
- **Accessibility Tests**: 25+ tests (Playwright + axe-core)

**Coverage Goals**:

- Frontend utilities: 90%+ (achieved: 100%)
- Frontend stores: 80%+ (achieved: comprehensive)
- Frontend components: 70%+ (achieved: core components)
- Backend services: 80%+
- Backend formatters/enrichment: 90%+
- Backend DB/migrations: comprehensive (every migration path tested)

## Test Structure

### Frontend (`acarshub-react/`)

```text
acarshub-react/
├── src/
│   ├── utils/__tests__/          # Unit tests for utilities
│   ├── store/__tests__/          # Unit tests for Zustand stores
│   └── components/__tests__/     # Integration tests for components
├── e2e/                          # Playwright E2E tests
│   ├── smoke.spec.ts
│   ├── settings-sound-alerts.spec.ts
│   └── accessibility.spec.ts
└── tests/
    └── fixtures/                 # Test data (JSONL files)
```

### Backend (`acarshub-backend/`)

```text
acarshub-backend/src/
├── __tests__/                    # Top-level tests (config, startup)
├── db/
│   └── __tests__/                # Migration tests, query helpers, DB integration
├── services/
│   └── __tests__/                # Service tests (poller, queue, scheduler, TCP listener)
├── formatters/
│   └── __tests__/                # Enrichment pipeline tests
└── socket/
    └── __tests__/                # Socket handler unit and integration tests
```

**Backend test conventions**:

- Migration tests create a real temporary SQLite DB, apply migrations, and verify schema
- Service tests use Vitest's `vi.mock()` for external dependencies (filesystem, network)
- Integration tests (`.integration.test.ts`) may run against real files and are slower
- Always clean up temp DB files in `afterEach`/`afterAll`

## Running Tests

```bash
# Frontend: all tests (unit + integration)
cd acarshub-react && npm test

# Frontend: watch mode
cd acarshub-react && npm run test:watch

# Frontend: coverage report
cd acarshub-react && npm run test:coverage

# Backend: all tests
cd acarshub-backend && npm test

# Backend: watch mode
cd acarshub-backend && npm run test:watch

# E2E tests (Chromium only)
cd acarshub-react && npm run test:e2e

# Accessibility tests
cd acarshub-react && npm run test:a11y

# Complete CI check (runs everything)
just ci
```

## Test Data Strategy

### Hand-Crafted Mock Fixtures

**Purpose**: Fast, deterministic unit and integration tests

**Location**: `src/__fixtures__/messages.ts`

**Examples** (11 fixtures):

- Simple ACARS message
- Multi-part sequence (M01A, M02A, M03A)
- Libacars CPDLC message
- Alert message (contains "EMERGENCY")
- Duplicate message
- HFDL and VDLM2 examples
- Empty message (no text/data)

**Benefits**:

- No Python backend required
- Millisecond execution time
- Deterministic results
- Edge case coverage

### Real-World Message Captures

**Purpose**: E2E testing with actual decoder output

**Location**: `tests/fixtures/`

**Files**:

- `raw-acars-messages.jsonl` - 1,220 messages
- `raw-vdlm2-messages.jsonl` - 798 messages
- `raw-hfdl-messages.jsonl` - 842 messages

**Total**: 2,860 real messages (collected over ~1 hour)

**Usage**: Backend integration testing, performance validation

## Unit Testing

### Testing Utilities

**Pattern**:

```typescript
import { describe, it, expect } from "vitest";
import { formatTimestamp } from "@/utils/dateUtils";

describe("formatTimestamp", () => {
  it("formats 12hr time correctly", () => {
    const result = formatTimestamp(1640000000, "12hr", "ISO", "UTC");
    expect(result).toContain("PM");
  });

  it("formats 24hr time correctly", () => {
    const result = formatTimestamp(1640000000, "24hr", "ISO", "UTC");
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});
```

**Completed Tests**:

- `dateUtils.test.ts` - 70 tests (100% coverage)
- `stringUtils.test.ts` - 86 tests (100% coverage)
- `alertMatching.test.ts` - 56 tests (100% coverage)
- `decoderUtils.test.ts` - 70 tests (100% coverage)

### Testing Stores

**Pattern** (Zustand):

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "@/store/useSettingsStore";

describe("useSettingsStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    const store = useSettingsStore.getState();
    store.reset();
  });

  it("sets theme correctly", () => {
    const store = useSettingsStore.getState();
    store.setTheme("latte");
    expect(store.theme).toBe("latte");
  });
});
```

**Completed Tests**:

- `useAppStore.test.ts` - 41 tests
- `useSettingsStore.test.ts` - 72 tests

**Key Patterns**:

- Reset state in `beforeEach`
- Test state changes
- Test persistence (localStorage)
- Test computed selectors

## Integration Testing

### Testing Components

**Pattern** (React Testing Library):

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/Button';

describe('Button', () => {
  it('renders with correct variant', () => {
    render(<Button variant="primary">Click me</Button>);
    expect(screen.getByRole('button')).toHaveClass('button--primary');
  });

  it('handles click events', async () => {
    const handleClick = vi.fn();
    const { user } = render(<Button onClick={handleClick}>Click</Button>);

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });
});
```

**Completed Tests**:

- `Button.test.tsx` - 56 tests (all variants, sizes, states)
- `Card.test.tsx` - 54 tests (all variants, grid layouts)
- `MessageCard.test.tsx` - 51 tests (rendering, settings, alerts)
- `SettingsModal.test.tsx` - 47 tests (all tabs, functionality)

**Key Patterns**:

- Use `@testing-library/user-event` for interactions
- Test accessibility (ARIA labels, roles)
- Test responsive behavior
- Mock external dependencies (Socket.IO, Chart.js, MapLibre)

### Mocking Socket.IO

**Pattern**:

```typescript
import { vi } from "vitest";

// Mock Socket.IO client
vi.mock("@/services/socket", () => ({
  socket: {
    on: vi.fn(),
    emit: vi.fn(),
    off: vi.fn(),
  },
}));
```

### Mocking Zustand Stores

**Pattern**:

```typescript
import { vi } from "vitest";

// Mock store with partial implementation
vi.mock("@/store/useAppStore", () => ({
  useAppStore: vi.fn((selector) =>
    selector({
      messageGroups: [],
      addMessage: vi.fn(),
      // ... other state
    }),
  ),
}));
```

## E2E Testing

### Playwright Configuration

**Browser Support**:

- ✅ Chromium (CI environment)
- ❌ Firefox (NixOS environment issues)
- ❌ WebKit (NixOS environment issues)

**Configuration** (`playwright.config.ts`):

- Headless mode by default
- 30-second timeout per test
- Screenshots on failure
- Traces on retry

**Running E2E Tests**:

```bash
# Chromium only (recommended for CI)
npm run test:e2e:chromium

# Interactive mode
npm run test:e2e:ui

# With headed browser
npm run test:e2e:headed
```

### E2E Test Patterns

**Smoke Tests** (`e2e/smoke.spec.ts`):

```typescript
import { test, expect } from "@playwright/test";

test("app loads and navigation works", async ({ page }) => {
  await page.goto("http://localhost:3000");

  // Check page loads
  await expect(page.locator("h1")).toContainText("Live Messages");

  // Test navigation
  await page.click('a[href="/live-map"]');
  await expect(page).toHaveURL(/live-map/);
});
```

**Settings Tests** (`e2e/settings-sound-alerts.spec.ts`):

```typescript
test("sound alert settings work", async ({ page }) => {
  await page.goto("http://localhost:3000");

  // Open settings
  await page.click('button[aria-label="Settings"]');

  // Navigate to Notifications tab
  await page.click('button:has-text("Notifications")');

  // Enable sound
  await page.click('input[type="checkbox"][aria-label*="sound"]');

  // Verify enabled
  await expect(
    page.locator('input[type="checkbox"][aria-label*="sound"]'),
  ).toBeChecked();
});
```

## Accessibility Testing

### Automated Tests

**axe-core Integration** (`e2e/accessibility.spec.ts`):

```typescript
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Live Messages page is accessible", async ({ page }) => {
  await page.goto("http://localhost:3000");

  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});
```

**Test Coverage**:

- All 6 pages (Live Messages, Map, Alerts, Search, Stats, About)
- Settings modal (all 4 tabs)
- Keyboard navigation
- Color contrast (both themes)
- Focus management
- Form accessibility

### Manual Testing Checklist

- [ ] Screen reader testing (VoiceOver, NVDA)
- [ ] Keyboard-only navigation
- [ ] High contrast mode
- [ ] Zoom levels (100%, 200%, 400%)
- [ ] Reduced motion preferences

## Performance Testing

### Lighthouse CI

**Configuration** (`lighthouserc.json`):

- Performance Score ≥85% (warn)
- Accessibility Score ≥95% (error)
- Best Practices ≥90% (warn)
- SEO ≥90% (warn)

**Running Lighthouse**:

```bash
npm run lighthouse
```

### Bundle Size Analysis

**Tool**: rollup-plugin-visualizer

**Running**:

```bash
npm run analyze
```

**Output**: `dist/stats.html` (interactive treemap)

**Current Sizes**:

- Map chunk: 1,021 KB
- Index chunk: 588 KB
- Decoder chunk: 455 KB
- **Total gzipped**: ~730 KB

## Regression Testing

**Every bug fix requires a regression test.** This ensures the bug cannot silently reappear in
future changes.

### The Regression Test Workflow

1. **Reproduce the bug in a test first** — the test must fail before your fix is applied
2. **Apply the fix** — the test must now pass
3. **The test stays in the codebase permanently** — it guards against regression

### Regression Test Pattern

```typescript
describe("regression", () => {
  it("session matching does not create duplicate sessions for same ICAO hex", () => {
    // Bug: findOrCreateSession was creating a new session on every call
    // even when an active session already existed for the same hex.
    // Fix: query active sessions before creating new one.
    const session1 = sessionService.findOrCreateSession({
      hex: "ABC123",
      callsign: "UAL123",
    });
    const session2 = sessionService.findOrCreateSession({
      hex: "ABC123",
      callsign: "UAL123",
    });

    expect(session1.sessionId).toBe(session2.sessionId); // Must be the SAME session
  });
});
```

**Name regression tests clearly**: use `"regression: <description of the bug>"` so it is
obvious what failure the test prevents, and a future agent can understand its purpose without
reading the fix.

## Test Maintenance

### Adding New Tests

**Frontend utility**:

1. Create `acarshub-react/src/utils/__tests__/myUtil.test.ts`
2. Test all edge cases and error paths
3. Aim for 90%+ coverage

**Frontend component**:

1. Create `acarshub-react/src/components/__tests__/MyComponent.test.tsx`
2. Test rendering, interactions, accessibility
3. Mock external dependencies (Socket.IO, stores)

**Backend service**:

1. Create `acarshub-backend/src/services/__tests__/myService.test.ts`
2. Mock filesystem/network dependencies with `vi.mock()`
3. Test happy path, error handling, and edge cases

**Backend migration**:

1. Create or extend `acarshub-backend/src/db/__tests__/migrate-*.test.ts`
2. Use a real temporary SQLite DB (better-sqlite3 in-memory or temp file)
3. Verify schema before and after migration
4. Clean up in `afterEach`

**E2E test for new feature**:

1. Add to appropriate `acarshub-react/e2e/*.spec.ts`
2. Test critical user flows only
3. Keep tests fast and reliable

### Debugging Test Failures

**Unit/Integration Tests**:

```bash
# Run specific test file
npm test -- dateUtils.test.ts

# Run in watch mode
npm run test:watch

# Run with UI
npm run test:ui
```

**E2E Tests**:

```bash
# Run with headed browser
npm run test:e2e:headed

# Debug mode (pauses on failure)
npx playwright test --debug

# Show report
npx playwright show-report
```

## Backend Test Patterns

### Testing a Service (Unit)

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MyService } from "../myService.js";

describe("MyService", () => {
  let service: MyService;

  beforeEach(() => {
    service = new MyService();
  });

  afterEach(() => {
    service.destroy();
    vi.restoreAllMocks();
  });

  it("emits data event on successful fetch", async () => {
    const handler = vi.fn();
    service.on("data", handler);

    await service.fetchOnce();

    expect(handler).toHaveBeenCalledOnce();
  });

  it("emits error event on failed fetch", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network failure"),
    );

    const handler = vi.fn();
    service.on("error", handler);

    await service.fetchOnce();

    expect(handler).toHaveBeenCalledWith(expect.any(Error));
  });
});
```

### Testing a Database Migration

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runMigrations } from "../migrate.js";

const TEST_DB = path.join(process.cwd(), "test-migration-N.db");

describe("Migration N: my_new_feature", () => {
  let db: Database.Database;

  beforeEach(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = new Database(TEST_DB);
    // Set up pre-migration state here
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  test("creates new_table with correct columns", () => {
    runMigrations(TEST_DB);

    const columns = db.prepare("PRAGMA table_info(new_table)").all() as Array<{
      name: string;
    }>;
    const colNames = columns.map((c) => c.name);

    expect(colNames).toContain("id");
    expect(colNames).toContain("session_id");
  });

  test("is idempotent when run twice", () => {
    runMigrations(TEST_DB);
    // Should not throw
    expect(() => runMigrations(TEST_DB)).not.toThrow();
  });
});
```

### Testing the Enrichment Pipeline

```typescript
import { beforeAll, describe, expect, it } from "vitest";
import { initializeConfig } from "../../config.js";
import { enrichMessage } from "../enrichment.js";

// Config must be loaded for airline/ground-station lookups to work
beforeAll(async () => {
  await initializeConfig();
});

describe("enrichMessage", () => {
  it("attaches decodedText when message can be decoded", () => {
    const msg = {
      uid: "test-uid",
      message_type: "ACARS",
      text: "some decodable text",
      label: "H1",
      timestamp: Date.now(),
    };

    const result = enrichMessage(msg);

    expect(result.decodedText).toBeDefined();
    expect(result.decodedText?.decoder.decodeLevel).not.toBe("none");
  });
});
```

## CI Integration

### GitHub Actions (Planned)

**Workflow**:

1. Run `just ci` (linting, TypeScript, unit/integration tests)
2. Run Playwright E2E tests (Chromium)
3. Run Lighthouse CI
4. Upload test reports and coverage

**Quality Gates**:

- All tests must pass
- No TypeScript errors
- Biome checks pass
- Accessibility score ≥95%

## Best Practices

### Do's

- ✅ Write tests alongside code
- ✅ Test behavior, not implementation
- ✅ Use descriptive test names
- ✅ Keep tests focused and small
- ✅ Mock external dependencies
- ✅ Test accessibility
- ✅ Test error states

### Don'ts

- ❌ Don't test third-party libraries
- ❌ Don't use implementation details (class names, internal state)
- ❌ Don't make tests depend on each other
- ❌ Don't skip cleanup (use `beforeEach`/`afterEach`)
- ❌ Don't ignore flaky tests (fix them)
- ❌ Don't test visual appearance (use E2E instead)

## Common Test Patterns

### Testing Async Operations

```typescript
import { waitFor } from '@testing-library/react';

it('loads data asynchronously', async () => {
  render(<MyComponent />);

  await waitFor(() => {
    expect(screen.getByText('Loaded')).toBeInTheDocument();
  });
});
```

### Testing User Interactions

```typescript
import { userEvent } from '@testing-library/user-event';

it('handles user input', async () => {
  const user = userEvent.setup();
  render(<MyComponent />);

  await user.type(screen.getByRole('textbox'), 'Hello');
  await user.click(screen.getByRole('button'));

  expect(screen.getByText('Hello')).toBeInTheDocument();
});
```

### Testing Hooks

```typescript
import { renderHook } from "@testing-library/react";

it("custom hook returns correct value", () => {
  const { result } = renderHook(() => useMyHook());

  expect(result.current.value).toBe("expected");
});
```

## Troubleshooting

### Tests Failing Locally but Passing in CI

- Check Node.js version matches CI
- Clear `node_modules` and reinstall
- Check for timezone/locale differences
- Verify environment variables

### Flaky Tests

- Avoid hardcoded timeouts
- Use `waitFor` for async operations
- Mock date/time for consistency
- Check for race conditions

### Slow Tests

- Mock heavy dependencies (Chart.js, MapLibre)
- Use test data fixtures (not real data)
- Run tests in parallel
- Profile with `npm run test:ui`
