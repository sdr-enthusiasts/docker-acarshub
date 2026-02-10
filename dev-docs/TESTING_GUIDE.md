# Testing Guide

Comprehensive guide to testing in ACARS Hub, including patterns, strategies, and best practices.

## Table of Contents

- [Testing Philosophy](#testing-philosophy)
- [Test Types](#test-types)
- [Running Tests](#running-tests)
- [Unit Testing](#unit-testing)
- [Integration Testing](#integration-testing)
- [E2E Testing](#e2e-testing)
- [Accessibility Testing](#accessibility-testing)
- [Performance Testing](#performance-testing)
- [Test Patterns](#test-patterns)
- [Mocking Strategies](#mocking-strategies)
- [Coverage Goals](#coverage-goals)
- [Troubleshooting Tests](#troubleshooting-tests)

---

## Testing Philosophy

### Why We Test

1. **Prevent Regressions**: Catch bugs before they reach production
2. **Document Behavior**: Tests show how code should work
3. **Enable Refactoring**: Change code confidently
4. **Improve Design**: Testable code is better code
5. **Save Time**: Automated tests are faster than manual testing

### What to Test

**Test**:

- Business logic
- Edge cases and error handling
- User interactions
- Accessibility
- Performance-critical paths

**Don't Test**:

- Third-party library internals
- Trivial getters/setters
- Framework behavior
- Generated code

### Test Pyramid

```text
      /\
     /  \    E2E Tests (Few)
    /____\   - Critical user flows
   /      \  - Real browser
  /________\ Integration Tests (Some)
 /          \ - Component interactions
/____________\ Unit Tests (Many)
               - Pure functions
               - Individual components
```

---

## Test Types

### Unit Tests

**What**: Test individual functions, components, hooks in isolation

**Tools**: Vitest + React Testing Library

**Location**: `src/**/__tests__/`

**Example**:

```typescript
// src/utils/__tests__/formatDate.test.ts
import { describe, it, expect } from "vitest";
import { formatDate } from "../formatDate";

describe("formatDate", () => {
  it("formats date correctly", () => {
    const date = new Date("2024-01-15T10:30:00Z");
    expect(formatDate(date)).toBe("2024-01-15 10:30:00");
  });
});
```

### Integration Tests

**What**: Test how components work together

**Tools**: Vitest + React Testing Library

**Location**: `src/**/__tests__/integration/`

**Example**:

```typescript
// src/pages/__tests__/integration/LiveMessages.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LiveMessagesPage } from "../LiveMessages";

describe("LiveMessagesPage integration", () => {
  it("displays messages from store", async () => {
    // Test store + component integration
  });
});
```

### E2E Tests

**What**: Test complete user flows in real browser

**Tools**: Playwright

**Location**: `e2e/`

**Example**:

```typescript
// e2e/search.spec.ts
import { test, expect } from "@playwright/test";

test("user can search messages", async ({ page }) => {
  await page.goto("http://localhost:8080");
  await page.click("text=Search");
  await page.fill('input[name="query"]', "AAL123");
  await page.click('button:has-text("Search")');
  await expect(page.locator(".message-item")).toHaveCount(5);
});
```

---

## Running Tests

### Quick Commands

```bash
# Run all unit/integration tests
just test

# Watch mode (auto-rerun on changes)
just test-watch

# Interactive UI mode
just test-ui

# Coverage report
just test-coverage

# E2E tests (requires dev server running)
just test-e2e

# Accessibility tests
just test-a11y

# Performance tests
just lighthouse
```

### Direct npm Commands

```bash
cd acarshub-react

# Unit/integration tests
npm test
npm run test:watch
npm run test:ui
npm run test:coverage

# E2E tests
npm run test:e2e
npm run test:e2e:ui
npm run test:e2e:debug

# Accessibility tests
npm run test:a11y

# Performance tests
npm run lighthouse
```

### Running Specific Tests

```bash
# Single file
npm test -- Button.test.tsx

# Pattern matching
npm test -- --grep "Button"

# With coverage
npm test -- --coverage Button.test.tsx
```

---

## Unit Testing

### Testing Utility Functions

```typescript
import { describe, it, expect } from "vitest";
import { calculateDistance } from "../geoUtils";

describe("calculateDistance", () => {
  it("calculates distance between two points", () => {
    const result = calculateDistance({ lat: 0, lon: 0 }, { lat: 1, lon: 1 });
    expect(result).toBeCloseTo(157.2, 1);
  });

  it("returns 0 for same point", () => {
    const point = { lat: 45.5, lon: -122.6 };
    expect(calculateDistance(point, point)).toBe(0);
  });

  it("handles negative coordinates", () => {
    const result = calculateDistance(
      { lat: -45, lon: -120 },
      { lat: 45, lon: 120 },
    );
    expect(result).toBeGreaterThan(0);
  });
});
```

### Testing React Components

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../Button';

describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('applies correct variant class', () => {
    const { container } = render(<Button variant="danger">Delete</Button>);
    expect(container.firstChild).toHaveClass('button--danger');
  });

  it('calls onClick handler', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<Button onClick={handleClick}>Click</Button>);
    await user.click(screen.getByText('Click'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<Button disabled onClick={handleClick}>Click</Button>);
    await user.click(screen.getByText('Click'));

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('is keyboard accessible', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<Button onClick={handleClick}>Click</Button>);

    // Tab to button
    await user.tab();
    expect(screen.getByText('Click')).toHaveFocus();

    // Press Enter
    await user.keyboard('{Enter}');
    expect(handleClick).toHaveBeenCalled();
  });
});
```

### Testing Custom Hooks

```typescript
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCounter } from "../useCounter";

describe("useCounter", () => {
  it("initializes with default value", () => {
    const { result } = renderHook(() => useCounter());
    expect(result.current.count).toBe(0);
  });

  it("increments count", () => {
    const { result } = renderHook(() => useCounter());

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });

  it("respects max value", () => {
    const { result } = renderHook(() => useCounter({ max: 5 }));

    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.increment();
      }
    });

    expect(result.current.count).toBe(5);
  });
});
```

### Testing Zustand Stores

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSettingsStore } from "../useSettingsStore";

describe("useSettingsStore", () => {
  beforeEach(() => {
    // Reset store before each test
    useSettingsStore.setState({
      theme: "mocha",
      locale: "en",
      notifications: true,
    });
  });

  it("has correct initial state", () => {
    const { result } = renderHook(() => useSettingsStore());
    expect(result.current.theme).toBe("mocha");
    expect(result.current.notifications).toBe(true);
  });

  it("changes theme", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setTheme("latte");
    });

    expect(result.current.theme).toBe("latte");
  });

  it("toggles notifications", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.toggleNotifications();
    });

    expect(result.current.notifications).toBe(false);

    act(() => {
      result.current.toggleNotifications();
    });

    expect(result.current.notifications).toBe(true);
  });
});
```

---

## Integration Testing

### Testing Component + Store Integration

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useAppStore } from '@/store/useAppStore';
import { MessageList } from '../MessageList';

describe('MessageList with store', () => {
  beforeEach(() => {
    useAppStore.setState({
      messages: [],
      addMessage: (msg) => useAppStore.setState((state) => ({
        messages: [...state.messages, msg]
      })),
    });
  });

  it('displays messages from store', () => {
    const testMessage = {
      uid: '123',
      text: 'Test message',
      timestamp: Date.now(),
    };

    useAppStore.getState().addMessage(testMessage);
    render(<MessageList />);

    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('updates when new message added', () => {
    const { rerender } = render(<MessageList />);
    expect(screen.queryByText('New message')).not.toBeInTheDocument();

    useAppStore.getState().addMessage({
      uid: '456',
      text: 'New message',
      timestamp: Date.now(),
    });

    rerender(<MessageList />);
    expect(screen.getByText('New message')).toBeInTheDocument();
  });
});
```

### Testing Socket.IO Integration

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { io } from 'socket.io-client';
import { SocketProvider } from '@/services/socket';
import { LiveMessages } from '../LiveMessages';

vi.mock('socket.io-client');

describe('LiveMessages with Socket.IO', () => {
  let mockSocket: any;

  beforeEach(() => {
    mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      connected: true,
    };
    (io as any).mockReturnValue(mockSocket);
  });

  it('subscribes to message events', () => {
    render(
      <SocketProvider>
        <LiveMessages />
      </SocketProvider>
    );

    expect(mockSocket.on).toHaveBeenCalledWith(
      'acars_msg',
      expect.any(Function)
    );
  });

  it('displays received messages', async () => {
    render(
      <SocketProvider>
        <LiveMessages />
      </SocketProvider>
    );

    // Simulate receiving message
    const messageHandler = mockSocket.on.mock.calls.find(
      call => call[0] === 'acars_msg'
    )[1];

    messageHandler({
      uid: '789',
      text: 'Socket message',
      timestamp: Date.now(),
    });

    await waitFor(() => {
      expect(screen.getByText('Socket message')).toBeInTheDocument();
    });
  });

  it('cleans up on unmount', () => {
    const { unmount } = render(
      <SocketProvider>
        <LiveMessages />
      </SocketProvider>
    );

    unmount();

    expect(mockSocket.off).toHaveBeenCalled();
  });
});
```

---

## E2E Testing

### Basic E2E Test

```typescript
import { test, expect } from "@playwright/test";

test.describe("Live Messages", () => {
  test("displays live messages page", async ({ page }) => {
    await page.goto("http://localhost:8080");

    await expect(page.locator("h1")).toContainText("ACARS Hub");
    await expect(page.locator(".message-list")).toBeVisible();
  });

  test("filters messages by station", async ({ page }) => {
    await page.goto("http://localhost:8080/live");

    // Wait for messages to load
    await page.waitForSelector(".message-item");
    const initialCount = await page.locator(".message-item").count();

    // Apply filter
    await page.click('button:has-text("Filter")');
    await page.fill('input[name="station"]', "KSEA");
    await page.click('button:has-text("Apply")');

    // Check filtered results
    await page.waitForTimeout(500);
    const filteredCount = await page.locator(".message-item").count();
    expect(filteredCount).toBeLessThan(initialCount);
  });
});
```

### Testing User Flows

```typescript
import { test, expect } from "@playwright/test";

test("complete search flow", async ({ page }) => {
  // Navigate to search page
  await page.goto("http://localhost:8080");
  await page.click('nav a:has-text("Search")');
  await expect(page).toHaveURL(/.*search/);

  // Fill search form
  await page.fill('input[name="flight"]', "AAL123");
  await page.selectOption('select[name="timeRange"]', "24h");

  // Submit search
  await page.click('button:has-text("Search")');

  // Wait for results
  await page.waitForSelector(".search-results");
  await expect(page.locator(".message-item")).toHaveCount(5);

  // Click on a message
  await page.click(".message-item:first-child");

  // Verify details modal
  await expect(page.locator(".modal")).toBeVisible();
  await expect(page.locator(".modal h2")).toContainText("Message Details");
});
```

### Mobile E2E Testing

```typescript
import { test, expect, devices } from "@playwright/test";

test.use(devices["iPhone 13"]);

test("mobile navigation", async ({ page }) => {
  await page.goto("http://localhost:8080");

  // Check mobile menu
  const menuButton = page.locator('button[aria-label="Menu"]');
  await expect(menuButton).toBeVisible();

  // Open menu
  await menuButton.click();
  await expect(page.locator("nav")).toBeVisible();

  // Navigate
  await page.click('nav a:has-text("Search")');
  await expect(page).toHaveURL(/.*search/);

  // Menu should close
  await expect(page.locator("nav")).not.toBeVisible();
});
```

---

## Accessibility Testing

### Automated Accessibility Tests

```typescript
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility", () => {
  test("homepage is accessible", async ({ page }) => {
    await page.goto("http://localhost:8080");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test("search page is accessible", async ({ page }) => {
    await page.goto("http://localhost:8080/search");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
```

### Keyboard Navigation Testing

```typescript
import { test, expect } from "@playwright/test";

test("keyboard navigation works", async ({ page }) => {
  await page.goto("http://localhost:8080");

  // Tab through interactive elements
  await page.keyboard.press("Tab");
  await expect(page.locator("nav a:first-child")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.locator("nav a:nth-child(2)")).toBeFocused();

  // Press Enter to navigate
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/.*search/);

  // Test Escape key
  await page.keyboard.press("Escape");
  // Verify expected behavior (e.g., modal closes)
});
```

### Screen Reader Testing

```typescript
import { test, expect } from "@playwright/test";

test("screen reader labels are present", async ({ page }) => {
  await page.goto("http://localhost:8080");

  // Check ARIA labels
  const searchButton = page.locator('button[aria-label="Search messages"]');
  await expect(searchButton).toBeVisible();

  // Check landmarks
  const main = page.locator('main[role="main"]');
  await expect(main).toBeVisible();

  const nav = page.locator('nav[aria-label="Main navigation"]');
  await expect(nav).toBeVisible();

  // Check live regions
  const status = page.locator('[role="status"]');
  await expect(status).toHaveAttribute("aria-live", "polite");
});
```

---

## Performance Testing

### Lighthouse CI

```bash
# Run Lighthouse audit
just lighthouse

# Collect results only
just lighthouse-collect

# Assert against budgets
just lighthouse-assert
```

### Bundle Size Testing

```bash
# Analyze bundle size
just analyze

# Opens visualization in browser
```

### Runtime Performance Testing

```typescript
import { test, expect } from "@playwright/test";

test("renders 1000 messages performantly", async ({ page }) => {
  await page.goto("http://localhost:8080/live");

  // Measure time to render
  const startTime = Date.now();

  // Trigger rendering 1000 messages
  await page.evaluate(() => {
    for (let i = 0; i < 1000; i++) {
      window.dispatchEvent(
        new CustomEvent("acars_msg", {
          detail: {
            uid: `msg-${i}`,
            text: `Message ${i}`,
            timestamp: Date.now(),
          },
        }),
      );
    }
  });

  await page.waitForSelector(".message-item:nth-child(1000)");
  const endTime = Date.now();

  const renderTime = endTime - startTime;
  expect(renderTime).toBeLessThan(2000); // 2 seconds max
});
```

---

## Test Patterns

### Arrange-Act-Assert (AAA)

```typescript
it("adds two numbers", () => {
  // Arrange - Setup test data
  const a = 5;
  const b = 3;

  // Act - Execute the code under test
  const result = add(a, b);

  // Assert - Verify the result
  expect(result).toBe(8);
});
```

### Test Fixtures

```typescript
// tests/fixtures/messages.ts
export const mockMessages = {
  valid: {
    uid: "123",
    text: "Test message",
    timestamp: 1704067200000,
    station: "KSEA",
  },
  invalid: {
    uid: "",
    text: "",
    timestamp: 0,
  },
};

// Usage in test
import { mockMessages } from "@/tests/fixtures/messages";

it("handles valid message", () => {
  const result = processMessage(mockMessages.valid);
  expect(result).toBeDefined();
});
```

### Custom Render Function

```typescript
// tests/utils/customRender.tsx
import { render, RenderOptions } from '@testing-library/react';
import { ReactElement } from 'react';
import { SocketProvider } from '@/services/socket';

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <SocketProvider>
      {children}
    </SocketProvider>
  );
}

export function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

// Usage
import { customRender } from '@/tests/utils/customRender';

it('renders with providers', () => {
  customRender(<MyComponent />);
  // Component has access to socket context
});
```

---

## Mocking Strategies

### Mocking Functions

```typescript
import { vi } from "vitest";

// Mock a function
const mockFn = vi.fn();
mockFn("hello");
expect(mockFn).toHaveBeenCalledWith("hello");

// Mock implementation
const mockAdd = vi.fn((a, b) => a + b);
expect(mockAdd(2, 3)).toBe(5);

// Mock return value
const mockGetUser = vi.fn().mockReturnValue({ id: 1, name: "John" });
expect(mockGetUser().name).toBe("John");

// Mock rejected promise
const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
await expect(mockFetch()).rejects.toThrow("Network error");
```

### Mocking Modules

```typescript
// Mock entire module
vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  })),
}));

// Partial module mock
vi.mock("@/utils/logger", async () => {
  const actual = await vi.importActual("@/utils/logger");
  return {
    ...actual,
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  };
});
```

### Mocking Timers

```typescript
import { vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("delays execution", () => {
  const callback = vi.fn();

  setTimeout(callback, 1000);
  expect(callback).not.toHaveBeenCalled();

  vi.advanceTimersByTime(1000);
  expect(callback).toHaveBeenCalled();
});
```

---

## Coverage Goals

### Overall Coverage Targets

- **Utilities**: 90%+ coverage
- **Stores**: 80%+ coverage
- **Components**: 70%+ coverage
- **Integration**: 60%+ coverage

### View Coverage Report

```bash
just test-coverage
open acarshub-react/coverage/index.html
```

### Coverage Configuration

```javascript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/__tests__/**",
        "src/types/**",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
```

---

## Troubleshooting Tests

### Tests Failing Intermittently

```typescript
// ❌ Bad - Race condition
it("updates after async action", () => {
  fireEvent.click(button);
  expect(screen.getByText("Updated")).toBeInTheDocument();
});

// ✅ Good - Wait for update
it("updates after async action", async () => {
  fireEvent.click(button);
  await waitFor(() => {
    expect(screen.getByText("Updated")).toBeInTheDocument();
  });
});
```

### Tests Timeout

```typescript
// Increase timeout for slow tests
it("handles large dataset", async () => {
  // ... test code
}, 10000); // 10 second timeout
```

### Mock Not Working

```typescript
// ❌ Bad - Mock after import
import { fetchData } from "./api";
vi.mock("./api");

// ✅ Good - Mock before import
vi.mock("./api");
import { fetchData } from "./api";
```

### Component Not Updating

```typescript
// Use act() for state updates
import { act } from "@testing-library/react";

await act(async () => {
  result.current.updateData();
});
```

---

## Best Practices

1. **Write tests first** (TDD) when possible
2. **Keep tests simple** - One assertion per test ideally
3. **Test behavior, not implementation** - Don't test internal state
4. **Use descriptive test names** - Should read like documentation
5. **Avoid test interdependence** - Each test should run independently
6. **Mock external dependencies** - Network, filesystem, etc.
7. **Clean up after tests** - Reset state, clear mocks
8. **Run tests locally** before committing
9. **Review coverage** but don't obsess over 100%
10. **Update tests** when requirements change

---

## Resources

- **Vitest**: <https://vitest.dev/>
- **React Testing Library**: <https://testing-library.com/react>
- **Playwright**: <https://playwright.dev/>
- **Testing Best Practices**: <https://kentcdodds.com/blog/common-mistakes-with-react-testing-library>

---

## Getting Help

- Check [agent-docs/TESTING.md](../agent-docs/TESTING.md) for infrastructure details
- Search existing tests for patterns
- Ask in Discord
