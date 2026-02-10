# ACARS Hub - Testing Guide

This document describes the testing strategy, patterns, and infrastructure for ACARS Hub.

## Testing Overview

**Total Test Coverage**: 621 tests (619 passing, 2 skipped)

- **Unit Tests**: 505 tests (Vitest)
- **Integration Tests**: 98 tests (Vitest + React Testing Library)
- **E2E Tests**: 15 tests (Playwright)
- **Accessibility Tests**: 25+ tests (Playwright + axe-core)

**Coverage Goals**:

- Utilities: 90%+ (achieved: 100%)
- Stores: 80%+ (achieved: comprehensive)
- Components: 70%+ (achieved: core components)

## Test Structure

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

## Running Tests

```bash
# All tests (unit + integration)
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# E2E tests (Chromium only)
npm run test:e2e

# Accessibility tests
npm run test:a11y

# Complete CI check
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

## Test Maintenance

### Adding New Tests

1. **Unit test** for new utility:
   - Create `utils/__tests__/myUtil.test.ts`
   - Test all edge cases
   - Aim for 90%+ coverage

2. **Integration test** for new component:
   - Create `components/__tests__/MyComponent.test.tsx`
   - Test rendering, interactions, accessibility
   - Mock external dependencies

3. **E2E test** for new feature:
   - Add to appropriate `e2e/*.spec.ts`
   - Test critical user flows only
   - Keep tests fast and reliable

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
