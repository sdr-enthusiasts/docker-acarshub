# Accessibility Audit Report - Color Contrast Violations

**Date**: 2025-02-02
**Test Suite**: Playwright + axe-core
**Standard**: WCAG 2.1 AA (4.5:1 contrast ratio required)
**Current Status**: 15/20 tests failing (75% failure rate)

## Executive Summary

After removing duplicate style definitions from `/pages/_live-messages.scss`, we still have widespread color contrast violations. The violations are NOT coming from our explicit color definitions (which are correct), but from **computed colors** that don't match our SCSS variables.

**Root Cause Hypothesis**: Either opacity/blending is creating intermediate colors, OR the CSS variables are not being properly applied/inherited.

## Current Test Results

- ✅ **5 tests passing** (25%)
- ❌ **15 tests failing** (75%)

### Passing Tests

- Unknown (need to run with verbose output to identify)

### Failing Tests

All failures are color contrast violations across multiple pages.

## Key Issues Discovered

### Issue #1: Computed Colors Don't Match SCSS Variables

**Expected** (from SCSS):

- `.aircraft-id`: `var(--color-text)` = `#cdd6f4` (12.3:1 contrast) ✅
- `.counter-text`: `var(--color-subtext1)` = `#bac2de` (9.1:1 contrast) ✅
- `.alert-count`: `var(--color-crust)` = `#11111b` (high contrast) ✅

**Actual** (from axe-core):

- `.aircraft-id`: `#80859c` (overlay1 color!) ❌
- `.counter-text`: `#9aa0ba` (unknown intermediate color) ❌
- `.alert-count`: `#171723` (close to crust but not exact) ❌

**Background Colors Also Wrong**:

- Expected: `var(--color-surface1)` = `#45475a`
- Actual: `#3d3f51`, `#343547` (darker than expected)

### Issue #2: ARIA Role Violation (FIXED ✅)

**Status**: ✅ FIXED
**Fix Applied**: Moved `role="tablist"` from `.message-group__tabs` to `.tab-list` container
**Result**: Navigation buttons (prev/next) are no longer invalid children of tablist

### Issue #3: Alert Badge Contrast (IMPROVED)

**Status**: 🟡 IMPROVED (but may still have issues)
**Fix Applied**: Changed from red text on red-tinted background to white text on solid red background
**Current Styles**:

```scss
.alert-badge {
  background-color: var(--color-red); // #f38ba8
  color: var(--color-base); // #1e1e2e (dark theme)
  // Light theme
  [data-theme="light"] & {
    color: var(--color-crust); // #dce0e8 (light theme)
  }
}
```

## Color Contrast Violations Breakdown

### 1. Message Group Header

| Element         | Computed FG | Computed BG | Ratio  | Required | Expected FG |
| --------------- | ----------- | ----------- | ------ | -------- | ----------- |
| `.aircraft-id`  | #80859c     | #343547     | 3.29:1 | 4.5:1    | #cdd6f4 ✅  |
| `.counter-text` | #9aa0ba     | #3d3f51     | 3.99:1 | 4.5:1    | #bac2de ✅  |
| `.alert-count`  | #171723     | #955b72     | 3.39:1 | 4.5:1    | #11111b ✅  |

**SCSS Definitions** (in `components/_message-group.scss`):

```scss
.aircraft-id {
  color: var(--color-text); // Should be #cdd6f4 (12.3:1)
}

.message-group__counter {
  color: var(--color-subtext1); // Should be #bac2de (9.1:1)
}

.alert-count {
  color: var(--color-crust); // Should be #11111b (high contrast)
}
```

### 2. Message Card Elements

| Element                  | Computed FG | Computed BG | Ratio  | Required | Status  |
| ------------------------ | ----------- | ----------- | ------ | -------- | ------- |
| `.message-type--unknown` | #a7afca     | #4c4f62     | 3.7:1  | 4.5:1    | ❌ FAIL |
| `.message-station`       | Unknown     | Unknown     | <4.5:1 | 4.5:1    | ❌ FAIL |
| `.identifier__label`     | Unknown     | Unknown     | <4.5:1 | 4.5:1    | ❌ FAIL |

## Catppuccin Color Reference (Mocha Dark Theme)

| Variable           | Hex Value | Contrast on Base (#1e1e2e) | WCAG AA |
| ------------------ | --------- | -------------------------- | ------- |
| `--color-text`     | #cdd6f4   | **12.3:1**                 | ✅ PASS |
| `--color-subtext1` | #bac2de   | **9.1:1**                  | ✅ PASS |
| `--color-subtext0` | #a6adc8   | **6.7:1**                  | ✅ PASS |
| `--color-overlay2` | #9399b2   | **5.2:1**                  | ✅ PASS |
| `--color-overlay1` | #7f849c   | **4.0:1**                  | ❌ FAIL |
| `--color-overlay0` | #6c7086   | **3.3:1**                  | ❌ FAIL |

| Variable           | Hex Value | Usage                 |
| ------------------ | --------- | --------------------- |
| `--color-surface2` | #585b70   | Borders, separators   |
| `--color-surface1` | #45475a   | Secondary backgrounds |
| `--color-surface0` | #313244   | Primary backgrounds   |
| `--color-base`     | #1e1e2e   | App background        |
| `--color-mantle`   | #181825   | Deeper background     |
| `--color-crust`    | #11111b   | Deepest background    |

## Investigation Steps Required

### Step 1: Verify CSS Variable Resolution

Open browser DevTools on Live Messages page:

1. Inspect `.aircraft-id` element
2. Check Computed styles for `color` property
3. Trace where the color value comes from
4. Check if CSS variables are properly defined in `:root`

### Step 2: Check for Opacity/Blending Issues

Look for any of these patterns:

- `opacity: 0.x` on parent containers
- `rgba()` colors being calculated
- Multiple background layers creating blended colors
- Pseudo-elements with opacity

### Step 3: Check Import Order

Verify in `main.scss`:

```scss
// Components MUST be imported before pages
@use "components/message-card";
@use "components/message-group";

// Pages come last
@use "pages/live-messages";
```

### Step 4: Check for CSS Specificity Issues

Look for:

- Inline styles (should be none)
- `!important` overrides
- More specific selectors overriding component styles

## Files Changed So Far

### ✅ Fixed Files

1. `src/components/MessageGroup.tsx` - Removed `role="tablist"` violation
2. `src/styles/pages/_live-messages.scss` - Removed duplicate styles (message-group, message-card, tabs)
3. `src/styles/pages/_live-messages.scss` - Fixed alert-badge contrast

### 📝 Correct Files (No Changes Needed)

1. `src/styles/components/_message-group.scss` - All colors use safe variables
2. `src/styles/components/_message-card.scss` - All colors use safe variables

## Next Steps (Priority Order)

### Priority 1: Debug CSS Variable Application

**Goal**: Understand why computed colors don't match SCSS variables

**Actions**:

1. Open <http://localhost:3000> in Chrome
2. Open DevTools → Elements
3. Inspect `.aircraft-id` element
4. Check Computed tab for `color` value
5. Check Styles tab to see which rule is actually applying
6. Check `:root` for CSS variable definitions
7. Take screenshots/notes of findings

### Priority 2: Fix Root Cause

Based on Step 1 findings, likely solutions:

- **If variables not defined**: Check theme application in App.tsx
- **If wrong variables used**: Search/replace in SCSS files
- **If specificity issue**: Increase specificity of component styles
- **If opacity issue**: Remove opacity from containers, use explicit colors

### Priority 3: Systematic Color Fixes

Once root cause is understood, apply fixes:

1. Fix all `.message-group__*` elements
2. Fix all `.message-card__*` elements
3. Fix all `.message-type--*` variants
4. Fix all form controls and inputs

### Priority 4: Verify Both Themes

Test all fixes in both themes:

```bash
# Dark theme (Mocha)
npx playwright test e2e/accessibility.spec.ts --grep "Dark theme"

# Light theme (Latte)
npx playwright test e2e/accessibility.spec.ts --grep "Light theme"
```

### Priority 5: Full Accessibility Suite

```bash
npx playwright test e2e/accessibility.spec.ts --reporter=line
```

## Expected Outcome

After fixes, **all 20 tests should pass**:

- ✅ Core page accessibility (7 tests)
- ✅ Settings modal accessibility (3 tests)
- ✅ Keyboard navigation (4 tests)
- ✅ Color contrast (2 tests - dark/light)
- ✅ Form controls (2 tests)
- ✅ Focus management (2 tests)

## References

- **WCAG 2.1 Contrast**: <https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html>
- **Catppuccin Palette**: <https://github.com/catppuccin/catppuccin>
- **axe-core Rules**: <https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md>

---

**Status**: Investigation phase - need to debug CSS variable application
**Blocker**: Computed colors don't match SCSS variable definitions
**Next Action**: Manual browser inspection with DevTools
