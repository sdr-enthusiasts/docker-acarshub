# End-to-End Testing Guide

This directory contains Playwright-based end-to-end tests for ACARS Hub React application.

## Prerequisites

1. **Nix environment** - Playwright is available via flake.nix
2. **Node.js dependencies** - Run `npm install` in `acarshub-react/`
3. **Playwright browsers** - Run `npx playwright install chromium` (or `firefox`, `webkit`)

## Running E2E Tests

### Local Development

E2E tests require the dev server to be running. Use two terminal windows:

**Terminal 1 - Start dev server:**

```bash
cd acarshub-react
npm run dev
```

**Terminal 2 - Run tests:**

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npm run test:e2e smoke.spec.ts

# Run tests in UI mode (interactive)
npm run test:e2e:ui

# Run tests in debug mode
npm run test:e2e:debug

# Run tests in specific browser
npm run test:e2e:chromium
npm run test:e2e:firefox
npm run test:e2e:webkit
```

### Using Just Commands

```bash
# Run all E2E tests (requires dev server running separately)
just test-e2e

# Run E2E tests in UI mode
just test-e2e-ui

# Run E2E tests in debug mode
just test-e2e-debug
```

### CI/CD

In CI environments, the Playwright config will automatically start and stop the dev server.

```bash
CI=true npm run test:e2e
```

## Test Structure

```text
e2e/
├── README.md                           # This file
├── smoke.spec.ts                       # Basic smoke tests
├── settings-sound-alerts.spec.ts       # Sound alert tests (deferred from Phase 10.2)
└── ...                                 # Additional test files
```

## Test Files

### smoke.spec.ts

Basic smoke tests to verify:

- App loads and navigation works
- Settings modal can be opened/closed
- Theme switching works
- Mobile responsiveness
- No horizontal scroll

### settings-sound-alerts.spec.ts

Tests for Settings Modal sound alerts functionality:

- Test Sound button visibility (conditional rendering)
- Audio playback when Test Sound clicked
- Autoplay blocking handling
- Volume slider functionality
- Browser-specific warnings (Chromium vs Firefox)

**Note:** These tests were deferred from Phase 10.2 integration tests due to test environment limitations with Zustand conditional rendering. E2E tests verify behavior in real browser environment.

## Writing New Tests

### Basic Test Structure

```typescript
import { test, expect } from "@playwright/test";

test.describe("Feature Name", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Common setup
  });

  test("should do something", async ({ page }) => {
    // Test implementation
    await expect(page.locator("selector")).toBeVisible();
  });
});
```

### Best Practices

1. **Use semantic selectors** - Prefer `getByRole`, `getByText`, `getByLabel` over CSS selectors
2. **Wait for elements** - Use `await expect(...).toBeVisible()` instead of arbitrary timeouts
3. **Test user journeys** - Focus on realistic user workflows
4. **Mobile-first** - Test responsive behavior with `page.setViewportSize()`
5. **Cleanup** - Tests should be independent and not rely on state from previous tests
6. **Browser-specific** - Use `test.skip()` for browser-specific features

### Example: Testing Navigation

```typescript
test("should navigate to Stats page", async ({ page }) => {
  await page.goto("/");

  // Click navigation link
  await page.getByRole("link", { name: /stats/i }).click();

  // Verify URL changed
  await expect(page).toHaveURL(/\/stats/);

  // Verify page content loaded
  await expect(
    page.getByRole("heading", { name: /statistics/i }),
  ).toBeVisible();
});
```

### Example: Testing Forms

```typescript
test("should submit search form", async ({ page }) => {
  await page.goto("/search");

  // Fill form fields
  await page.getByLabel(/flight number/i).fill("UAL123");
  await page.getByLabel(/tail number/i).fill("N12345");

  // Submit form
  await page.getByRole("button", { name: /search/i }).click();

  // Verify results
  await expect(page.getByText(/search results/i)).toBeVisible();
});
```

### Example: Testing Modals

```typescript
test("should open and close modal", async ({ page }) => {
  await page.goto("/");

  // Open modal
  await page.getByRole("button", { name: /settings/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Close modal with Escape key
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
```

## Browser Testing

### Chromium (Chrome, Edge, Brave)

```bash
npm run test:e2e:chromium
```

### Firefox

```bash
npm run test:e2e:firefox
```

### WebKit (Safari)

```bash
npx playwright install webkit
npm run test:e2e:webkit
```

### Mobile Viewports

Tests automatically run on mobile viewports (defined in `playwright.config.ts`):

- Mobile Chrome (Pixel 5)
- Mobile Safari (iPhone 12)

## Debugging Tests

### Interactive Mode

```bash
npm run test:e2e:ui
```

### Debug Mode (step through)

```bash
npm run test:e2e:debug
```

### Screenshots and Traces

Failed tests automatically generate:

- **Screenshots** - `playwright-report/` directory
- **Traces** - Open with `npx playwright show-trace trace.zip`

### Verbose Output

```bash
npm run test:e2e -- --debug
```

## Common Issues

### Dev Server Not Running

```text
Error: Timed out waiting for http://localhost:3000
```

**Solution:** Start dev server in separate terminal: `npm run dev`

### Browser Not Installed

```text
Error: Executable doesn't exist at /path/to/browser
```

**Solution:** Install browsers: `npx playwright install chromium`

### Tests Timeout

```text
Error: Test timeout of 30000ms exceeded
```

**Solution:** Increase timeout in test or check if app is loading slowly:

```typescript
test("slow test", async ({ page }) => {
  test.setTimeout(60000); // 60 seconds
  // ...
});
```

### Socket.IO Connection Issues

If tests fail due to missing backend:

- E2E tests expect Socket.IO connection to fail gracefully
- Tests should not depend on backend being available
- Mock Socket.IO responses for predictable tests

## Phase 10.3 Test Coverage

### Completed

- ✅ Smoke tests (app loads, navigation, settings, theme switching)
- ✅ Settings Modal sound alerts tests (deferred from Phase 10.2)

### TODO

- ⏳ User journey: First visit → Configure alerts → Receive messages
- ⏳ User journey: Search historical messages → View details
- ⏳ User journey: Map → Click aircraft → View messages
- ⏳ Real message processing (feed JSONL fixtures → verify UI)
- ⏳ Performance validation (2,860 messages, UI responsiveness)
- ⏳ Mobile responsiveness (320px to 2560px)
- ⏳ Accessibility audit (keyboard nav, screen readers)

## References

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [AGENTS.md - Phase 10.3](../../AGENTS.md#phase-103-end-to-end-testing)
