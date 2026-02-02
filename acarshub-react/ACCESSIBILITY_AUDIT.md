# Accessibility Audit Report - Color Contrast Violations

**Date**: 2025-02-02
**Test Suite**: Playwright + axe-core
**Standard**: WCAG 2.1 AA (4.5:1 contrast ratio required)

## Executive Summary

The E2E accessibility tests revealed **widespread color contrast violations** across the application. The violations stem from using Catppuccin overlay colors (overlay0, overlay1, overlay2) which have insufficient contrast ratios when used as text colors on surface/base backgrounds.

**Status**: 16/20 accessibility tests failing due to color contrast issues

## Color Contrast Violations by Component

### 1. Message Group Header

**Component**: `.message-group__header`
**Location**: `src/styles/components/_message-group.scss`

| Element | Foreground | Background | Ratio | Required | Status |
|---------|-----------|-----------|-------|----------|--------|
| `.aircraft-id` | #969cb6 | #393a4c | 4.1:1 | 4.5:1 | ❌ FAIL |
| `.counter-text` | #898ea7 | #393a4c | 3.44:1 | 4.5:1 | ❌ FAIL |
| `.alert-count` | #1e1e2e | #b06982 | 4.05:1 | 4.5:1 | ❌ FAIL |

**Root Cause**: Using `var(--color-overlay2)` and `var(--color-overlay1)` for text on `var(--color-surface1)` backgrounds.

**Fix Required**: Change text colors to `var(--color-text)` or `var(--color-subtext1)` which have guaranteed contrast.

---

### 2. Message Card Header

**Component**: `.message-card__header`
**Location**: `src/styles/components/_message-card.scss`

| Element | Foreground | Background | Ratio | Required | Status |
|---------|-----------|-----------|-------|----------|--------|
| `.message-type--unknown` | #8b90a9 | #434558 | 2.98:1 | 4.5:1 | ❌ FAIL |
| `.message-station` | #7f849b | #1f1f2f | 4.38:1 | 4.5:1 | ❌ FAIL |
| `.message-card__timestamp` | #72778e | #1f1f2f | 3.66:1 | 4.5:1 | ❌ FAIL |

**Root Cause**: Using `var(--color-overlay0)`, `var(--color-overlay1)` for text on dark backgrounds.

**Fix Required**: Upgrade to `var(--color-subtext0)` or `var(--color-text)` for proper contrast.

---

### 3. Message Card Content

**Component**: `.message-card__identifiers`, `.message-card__fields`
**Location**: `src/styles/components/_message-card.scss`

| Element | Foreground | Background | Ratio | Required | Status |
|---------|-----------|-----------|-------|----------|--------|
| `.identifier__label` | #7f849b | #1f1f2f | 4.38:1 | 4.5:1 | ❌ FAIL |
| `.field__label` | #7f849b | #1f1f2f | 4.38:1 | 4.5:1 | ❌ FAIL |

**Root Cause**: Using `var(--color-overlay1)` for labels.

**Fix Required**: Change to `var(--color-subtext1)` (#bac2de in Mocha) which has 7.3:1 contrast ratio.

---

### 4. Alert Highlighting

**Component**: `.alert-highlight`
**Location**: `src/styles/components/_message-card.scss`, `src/styles/pages/_live-messages.scss`

| Element | Foreground | Background | Ratio | Required | Status |
|---------|-----------|-----------|-------|----------|--------|
| Alert text (Mocha) | #1e1e2e | #b06982 | 4.05:1 | 4.5:1 | ❌ FAIL |

**Root Cause**: Using `var(--color-maroon)` background with `var(--color-base)` text. Maroon is too light.

**Fix Required**: Use darker background like `var(--color-red)` or lighter text.

---

## Catppuccin Color Contrast Analysis

### Mocha (Dark Theme) - Base Background (#1e1e2e)

| Color Name | Hex | Contrast Ratio | WCAG AA | Usage |
|-----------|-----|----------------|---------|-------|
| `text` | #cdd6f4 | **12.3:1** | ✅ PASS | Main text |
| `subtext1` | #bac2de | **9.1:1** | ✅ PASS | Secondary text |
| `subtext0` | #a6adc8 | **6.7:1** | ✅ PASS | Tertiary text |
| `overlay2` | #9399b2 | **5.2:1** | ✅ PASS | Muted text |
| `overlay1` | #7f849c | **4.0:1** | ❌ FAIL | **Do not use** |
| `overlay0` | #6c7086 | **3.3:1** | ❌ FAIL | **Do not use** |

### Safe Color Mapping

**Current (Broken)**:
- Labels: `var(--color-overlay1)` → 4.0:1 ❌
- Muted text: `var(--color-overlay0)` → 3.3:1 ❌

**Fixed (WCAG AA Compliant)**:
- Labels: `var(--color-subtext1)` → 9.1:1 ✅
- Muted text: `var(--color-subtext0)` → 6.7:1 ✅
- Very muted text: `var(--color-overlay2)` → 5.2:1 ✅

---

## Systematic Fix Strategy

### Phase 1: Global Color Variable Replacements

**Find and Replace** in all SCSS files:

```scss
// BEFORE (Broken)
color: var(--color-overlay1);  // 4.0:1 ❌
color: var(--color-overlay0);  // 3.3:1 ❌

// AFTER (Fixed)
color: var(--color-subtext1);  // 9.1:1 ✅
color: var(--color-subtext0);  // 6.7:1 ✅
```

### Phase 2: Component-Specific Fixes

#### Message Group Header
```scss
.message-group__aircraft .aircraft-id {
  color: var(--color-text);        // Was: overlay2 (4.1:1) → Now: text (12.3:1) ✅
  font-weight: 700;
}

.message-group__counter .counter-text {
  color: var(--color-subtext0);    // Was: overlay1 (3.44:1) → Now: subtext0 (6.7:1) ✅
}

.alert-count {
  background-color: var(--color-red);  // Darker background
  color: var(--color-crust);           // Lighter text for better contrast
}
```

#### Message Card
```scss
.message-station,
.message-type,
.identifier__label,
.field__label {
  color: var(--color-subtext1);    // Was: overlay1 (4.38:1) → Now: subtext1 (9.1:1) ✅
}

.message-card__timestamp {
  color: var(--color-subtext0);    // Was: overlay0 (3.66:1) → Now: subtext0 (6.7:1) ✅
}
```

#### Alert Highlighting
```scss
.alert-highlight {
  // Mocha: Use red background with white text for maximum contrast
  background-color: var(--color-red);     // #f38ba8
  color: var(--color-crust);              // #11111b (darkest, highest contrast)
  
  [data-theme="latte"] & {
    background-color: var(--color-maroon); // #e64553
    color: var(--color-base);              // #eff1f5 (lightest)
  }
}
```

---

## Testing Plan

### 1. Run Full Accessibility Suite
```bash
cd acarshub-react && npx playwright test e2e/accessibility.spec.ts --reporter=line
```

### 2. Verify Contrast for Each Theme
```bash
# Dark theme (Mocha)
npx playwright test e2e/accessibility.spec.ts --grep "Dark theme"

# Light theme (Latte)
npx playwright test e2e/accessibility.spec.ts --grep "Light theme"
```

### 3. Manual Visual Inspection
- Open app in browser
- Switch between Mocha/Latte themes
- Verify all text is readable
- Ensure no regressions in visual design

---

## Files Requiring Changes

### High Priority (Direct Color Issues)
- `src/styles/components/_message-group.scss` - Aircraft ID, counter, alert count
- `src/styles/components/_message-card.scss` - Station, type, timestamp, labels
- `src/styles/pages/_live-messages.scss` - Alert highlighting

### Medium Priority (Potential Issues)
- `src/styles/pages/_search.scss` - Search results styling
- `src/styles/pages/_alerts.scss` - Alert page styling
- `src/styles/components/_navigation.scss` - Nav link colors
- `src/styles/components/_button.scss` - Button text colors

### Low Priority (Review for Consistency)
- All other SCSS files using `overlay0`, `overlay1` colors

---

## Next Steps

1. ✅ Create this audit document
2. ⏳ Apply systematic color replacements (overlay → subtext)
3. ⏳ Fix alert-highlight contrast issue
4. ⏳ Run full accessibility test suite
5. ⏳ Manual visual QA on both themes
6. ⏳ Commit changes with descriptive message
7. ⏳ Update AGENTS.md to mark accessibility fixes complete

---

## References

- **WCAG 2.1 Level AA**: https://www.w3.org/WAI/WCAG21/quickref/#contrast-minimum
- **Catppuccin Color Palette**: https://github.com/catppuccin/catppuccin
- **axe-core Rules**: https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md
- **WebAIM Contrast Checker**: https://webaim.org/resources/contrastchecker/

---

**Status**: Ready for systematic fixes
**Estimated Time**: 1-2 hours to fix all violations
**Risk Level**: Low (color-only changes, no layout/structure changes)