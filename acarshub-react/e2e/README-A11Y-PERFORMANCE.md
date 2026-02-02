# Accessibility & Performance Testing Guide

**Purpose**: Guide for running and interpreting accessibility and performance tests for ACARS Hub React application.

**Related**: See `agent-docs/PHASE_10_4_ACCESSIBILITY_PERFORMANCE.md` for complete implementation details.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Accessibility Testing](#accessibility-testing)
- [Performance Testing](#performance-testing)
- [Bundle Size Analysis](#bundle-size-analysis)
- [CI Integration](#ci-integration)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

```bash
# Install dependencies (if not already done)
cd acarshub-react
npm install

# Ensure Playwright browsers are installed
npx playwright install chromium
```

### Run All Quality Checks

```bash
# From project root
just ci              # Unit + integration tests + linting
just test-a11y       # Accessibility tests (requires dev server)
just lighthouse      # Performance audit (builds + runs Lighthouse)
just analyze         # Bundle size analysis
```

---

## Accessibility Testing

### What It Tests

- **WCAG 2.1 AA Compliance**: Automated scans for 60% of WCAG criteria
- **Keyboard Navigation**: Tab, Arrow keys, Enter, Escape
- **Color Contrast**: Both Mocha (dark) and Latte (light) themes
- **Focus Management**: Focus trapping, return-to-trigger
- **Screen Reader Support**: ARIA landmarks, labels, roles
- **Form Accessibility**: Labels, error messages, instructions

### Running Tests

**Step 1**: Start development server

```bash
# Terminal 1
cd acarshub-react
npm run dev
```

**Step 2**: Run accessibility tests

```bash
# Terminal 2 (from project root)
just test-a11y

# Or with npm directly
cd acarshub-react
npm run test:a11y
```

**Step 3**: Debug failures (optional)

```bash
just test-a11y-debug

# Or with npm
npm run test:a11y:debug
```

### Test Coverage

**25+ Tests Across**:

- ✅ All 6 pages (Live Messages, Stats, Map, Alerts, Search, About)
- ✅ Settings modal (all 4 tabs)
- ✅ Keyboard navigation
- ✅ Color contrast (both themes)
- ✅ Form controls
- ✅ Focus management
- ✅ Screen reader support

### Expected Output

```bash
Running 25 tests using 1 worker

✓ [chromium] › accessibility.spec.ts:18:3 › Live Messages page (2.3s)
✓ [chromium] › accessibility.spec.ts:42:3 › Statistics page (2.1s)
✓ [chromium] › accessibility.spec.ts:56:3 › Live Map page (2.8s)
✓ [chromium] › accessibility.spec.ts:71:3 › Alerts page (1.9s)
✓ [chromium] › accessibility.spec.ts:85:3 › Search page (1.8s)
✓ [chromium] › accessibility.spec.ts:99:3 › About page (1.7s)
✓ [chromium] › accessibility.spec.ts:119:3 › Settings modal (2.4s)
... (18 more tests)

25 passed (45s)
```

### Interpreting Failures

**Failure Example**:

```bash
✗ [chromium] › accessibility.spec.ts:18:3 › Live Messages page
  Expected: []
  Received: [
    {
      id: 'color-contrast',
      impact: 'serious',
      description: 'Elements must have sufficient color contrast',
      nodes: [
        {
          html: '<span class="badge">ERROR</span>',
          target: ['.message-card__type-badge']
        }
      ]
    }
  ]
```

**Resolution Steps**:

1. Identify violation type (`color-contrast`, `button-name`, `label`, etc.)
2. Locate affected element (CSS selector: `.message-card__type-badge`)
3. Fix issue:
   - **Color contrast**: Adjust colors to meet 4.5:1 ratio (use Catppuccin palette)
   - **Button name**: Add `aria-label` to icon-only buttons
   - **Label**: Ensure form inputs have `<label>` or `aria-label`
4. Re-run tests to verify

**Common Violations**:

| Violation ID        | Cause                           | Fix                                          |
| ------------------- | ------------------------------- | -------------------------------------------- |
| `color-contrast`    | Text/background contrast <4.5:1 | Use Catppuccin color palette correctly       |
| `button-name`       | Icon-only button without label  | Add `aria-label` attribute                   |
| `label`             | Form input without label        | Add `<label>` or `aria-label`                |
| `landmark-one-main` | Multiple `<main>` elements      | Ensure only one `<main>` per page            |
| `image-alt`         | Image without alt text          | Add `alt` attribute or `role="presentation"` |

---

## Performance Testing

### Performance Metrics

- **Core Web Vitals**: LCP, FID, CLS, FCP, TBT
- **Performance Score**: Overall Lighthouse performance rating
- **Accessibility Score**: Automated a11y checks (different engine than axe-core)
- **Best Practices**: HTTPS, console errors, deprecated APIs
- **SEO**: Meta tags, structured data, mobile-friendly

### Running Performance Tests

**Full Lighthouse Audit** (collect + assert + upload):

```bash
# From project root
just lighthouse

# Or with npm
cd acarshub-react
npm run lighthouse
```

**Step-by-Step**:

```bash
# Collect metrics only
just lighthouse-collect

# Assert against budgets
just lighthouse-assert
```

### Configuration

**Location**: `acarshub-react/lighthouserc.json`

**Pages Tested**:

- `/` (Live Messages)
- `/stats`
- `/live-map`
- `/alerts`
- `/search`
- `/about`

**Performance Budgets**:

| Metric                   | Budget  | Severity                |
| ------------------------ | ------- | ----------------------- |
| Performance Score        | ≥85%    | warn                    |
| Accessibility Score      | ≥95%    | **error** (fails build) |
| Best Practices           | ≥90%    | warn                    |
| SEO Score                | ≥90%    | warn                    |
| First Contentful Paint   | ≤2000ms | warn                    |
| Largest Contentful Paint | ≤3000ms | warn                    |
| Cumulative Layout Shift  | ≤0.1    | warn                    |
| Total Blocking Time      | ≤300ms  | warn                    |
| Time to Interactive      | ≤4000ms | warn                    |

### Expected Performance Output

```bash
Running Lighthouse 3 time(s) on http://localhost:4173/
Run #1...done.
Run #2...done.
Run #3...done.

Median scores:
  Performance: 88
  Accessibility: 98
  Best Practices: 96
  SEO: 92

Assertions:
✓ categories:performance ≥ 85
✓ categories:accessibility ≥ 95
✓ categories:best-practices ≥ 90
✓ first-contentful-paint ≤ 2000ms
✓ largest-contentful-paint ≤ 3000ms

All assertions passed!

View full report:
https://storage.googleapis.com/lighthouse-infrastructure.appspot.com/reports/...
```

### Interpreting Performance Failures

**Failure Example**:

```bash
✗ categories:performance (75) expected ≥ 85
✗ largest-contentful-paint (4200ms) expected ≤ 3000ms
```

**Resolution**:

1. Open HTML report: `.lighthouseci/lhr-*.html`
2. Review "Opportunities" section for specific recommendations
3. Common issues:
   - **Large bundle size**: Run `just analyze` to identify bloat
   - **Render-blocking resources**: Lazy load non-critical JS/CSS
   - **Large images**: Optimize or lazy load
   - **Slow server response**: Check backend performance

---

## Bundle Size Analysis

### What It Shows

- **Total bundle size** (uncompressed, gzipped, brotli)
- **Per-chunk breakdown** (react, charts, map, decoder, app code)
- **Interactive treemap** visualization
- **Module-level detail** (which files are largest)

### Running Analysis

```bash
# From project root
just analyze

# Or with npm
cd acarshub-react
npm run analyze
```

**Output**: Opens `dist/stats.html` in browser with interactive treemap.

### Interpreting Results

**Treemap Colors/Sizes**:

- Each rectangle = one module/file
- Size = gzipped file size
- Color = chunk grouping (react, charts, map, etc.)

**Key Metrics**:

```text
Total bundle size: 1,318 KB (415 KB gzipped)

Breakdown:
- react.js:      145 KB (47 KB gzipped)
- charts.js:      80 KB (28 KB gzipped)
- map.js:        119 KB (42 KB gzipped)
- decoder.js:     32 KB (11 KB gzipped)
- index.js:      941 KB (287 KB gzipped)
```

**Target**: Each chunk <500 KB gzipped ✅

**Red Flags**:

- ⚠️ Single chunk >500 KB gzipped (split further)
- ⚠️ Duplicate dependencies (e.g., two versions of React)
- ⚠️ Unnecessary polyfills in modern browsers

### Optimization Strategies

**If bundle too large**:

1. **Lazy load pages** (React Router code splitting):

   ```typescript
   const Stats = lazy(() => import("./pages/Stats"));
   ```

2. **Split vendor chunks more granularly** (`vite.config.ts`):

   ```typescript
   manualChunks: {
     'chart-core': ['chart.js'],
     'chart-react': ['react-chartjs-2'],
     // ... more splits
   }
   ```

3. **Use lighter alternatives**:
   - Replace heavy libraries with lighter options
   - Tree-shake unused exports

4. **Dynamic imports for conditional features**:

   ```typescript
   if (user.hasMapAccess) {
     const { Map } = await import("./components/Map");
   }
   ```

---

## CI Integration

**Status**: Deferred to Phase 14 (Polish and Deployment)

**Planned Workflow** (`.github/workflows/ci.yml`):

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20

      # Unit + Integration tests
      - run: cd acarshub-react && npm ci
      - run: cd acarshub-react && npm test

      # E2E + Accessibility tests
      - run: npx playwright install chromium
      - run: cd acarshub-react && npm run dev &
      - run: sleep 5 && cd acarshub-react && npm run test:e2e:chromium
      - run: cd acarshub-react && npm run test:a11y

      # Lighthouse CI
      - run: cd acarshub-react && npm run lighthouse

      # Upload artifacts
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: test-reports
          path: |
            acarshub-react/playwright-report/
            acarshub-react/.lighthouseci/
```

---

## Troubleshooting

### Accessibility Tests

**Problem**: `Error: net::ERR_CONNECTION_REFUSED`

**Cause**: Dev server not running

**Fix**:

```bash
# Terminal 1 - Start dev server
cd acarshub-react && npm run dev

# Terminal 2 - Run tests
just test-a11y
```

---

**Problem**: Tests timeout waiting for selectors

**Cause**: App not loading or selectors changed

**Fix**:

1. Open browser to `http://localhost:3000`
2. Verify app loads correctly
3. Inspect DOM to verify selectors
4. Update test selectors if needed

---

### Lighthouse CI

**Problem**: `Error: Failed to start preview server`

**Cause**: Build not created or port 4173 in use

**Fix**:

```bash
# Kill process on port 4173
lsof -ti:4173 | xargs kill -9

# Run lighthouse (builds automatically)
just lighthouse
```

---

**Problem**: Performance score lower than expected

**Cause**: Local environment differences, CPU throttling

**Fix**:

1. Close other applications (reduce CPU load)
2. Lighthouse uses simulated throttling (Fast 3G)
3. Real-world performance may be better
4. Focus on trends, not absolute scores

---

### Bundle Analysis

**Problem**: `dist/stats.html` not opening

**Cause**: Different OS or browser not found

**Fix**:

```bash
# Manually open file
cd acarshub-react/dist
open stats.html           # macOS
xdg-open stats.html      # Linux
start stats.html         # Windows
```

---

**Problem**: Bundle larger than expected

**Cause**: Check treemap for largest contributors

**Fix**:

1. Open `dist/stats.html`
2. Identify largest modules
3. Consider:
   - Lazy loading
   - Alternative libraries
   - Code splitting
4. Update `vite.config.ts` with new `manualChunks`

---

## Manual Testing Checklist

Some accessibility criteria require manual testing:

### Screen Reader Testing

- [ ] Test with VoiceOver (macOS): `Cmd+F5`
- [ ] Test with NVDA (Windows): Free download
- [ ] Navigate entire app with screen reader
- [ ] Verify all interactive elements announced correctly
- [ ] Verify focus order makes sense

### Keyboard Navigation

- [ ] Navigate entire app with Tab key only
- [ ] All interactive elements focusable
- [ ] Focus indicators visible
- [ ] No keyboard traps (can always Tab out)
- [ ] Shortcuts work (Escape to close modals)

### Cognitive/Usability

- [ ] Error messages are clear and helpful
- [ ] Form validation provides guidance
- [ ] Complex interactions have instructions
- [ ] Consistent navigation across pages

### Color Blindness

- [ ] Test with color blindness simulator (browser extension)
- [ ] Information not conveyed by color alone
- [ ] Error states use icons + text, not just red color

---

## Resources

- **axe-core**: <https://github.com/dequelabs/axe-core>
- **Lighthouse CI**: <https://github.com/GoogleChrome/lighthouse-ci>
- **WCAG 2.1 Guidelines**: <https://www.w3.org/WAI/WCAG21/quickref/>
- **WebAIM Contrast Checker**: <https://webaim.org/resources/contrastchecker/>
- **Catppuccin Colors**: <https://github.com/catppuccin/catppuccin>

---

## Summary

**Accessibility Testing**:

- ✅ 25+ automated tests covering WCAG 2.1 AA
- ✅ Keyboard navigation, color contrast, focus management
- ✅ Run with: `just test-a11y`

**Performance Testing**:

- ✅ Lighthouse CI with strict budgets
- ✅ Core Web Vitals monitoring
- ✅ Run with: `just lighthouse`

**Bundle Analysis**:

- ✅ Interactive treemap visualization
- ✅ Gzipped size reporting
- ✅ Run with: `just analyze`

**Quality Gates**:

- ❌ **Fail**: Accessibility score <95% (blocks deployment)
- ⚠️ **Warn**: Performance score <85% (investigate)
- ⚠️ **Warn**: Bundle chunk >500KB (optimize)
