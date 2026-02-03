# Phase 15 Day 3: Density Setting Removal

**Date**: 2025-02-03
**Status**: 🚧 IN PROGRESS
**Priority**: P1 (High Priority - Cleanup Deferred from Earlier)
**Estimated Time**: 2-3 hours

---

## Problem Statement

### Current Issue

The display density setting is **inconsistent** across the application:

- Some components use density selectors (`[data-density="compact"]`, etc.)
- Some components have hardcoded sizes (ignore density setting)
- Creates confusion and maintenance burden
- User preference doesn't always work as expected

### User Requirement

> "Density setting is inconsistent (hardcoded sizes in some places). Remove the setting, and SCSS selectors. Use the compact density setting where the selector was doing work before."

---

## Scope

### Files to Modify

**TypeScript/TSX** (4 files):
1. `src/types/index.ts` - Remove `density` from AppearanceSettings
2. `src/store/useSettingsStore.ts` - Remove density state and actions
3. `src/App.tsx` - Remove `data-density` attribute application
4. `src/components/SettingsModal.tsx` - Remove density UI

**SCSS** (12 files):
1. `src/styles/components/_aircraft-markers.scss`
2. `src/styles/components/_chart.scss`
3. `src/styles/components/_message-card.scss`
4. `src/styles/components/_message-group.scss`
5. `src/styles/components/_radio.scss`
6. `src/styles/components/_select.scss`
7. `src/styles/components/_settings-modal.scss`
8. `src/styles/components/_toggle.scss`
9. `src/styles/pages/_live-messages.scss`
10. `src/styles/pages/_stats.scss`
11. `src/pages/AlertsPage.scss`
12. `src/pages/SearchPage.scss`

**Tests** (2 files):
1. `src/store/__tests__/useSettingsStore.test.ts` - Remove density tests
2. `src/components/__tests__/SettingsModal.test.tsx` - Remove density UI tests

**Total**: 18 files

---

## Implementation Strategy

### Step 1: Identify Compact Styles

For each SCSS file with density selectors:

```scss
// BEFORE - Multiple density variants
.component {
  padding: 1rem; // Default (comfortable)
  
  [data-density="compact"] & {
    padding: 0.5rem; // ✅ We want THIS
  }
  
  [data-density="spacious"] & {
    padding: 1.5rem; // ❌ Remove
  }
}

// AFTER - Use compact as default
.component {
  padding: 0.5rem; // Compact is now the only option
}
```

### Step 2: TypeScript Changes

#### `src/types/index.ts`

Remove `density` from `AppearanceSettings`:

```typescript
export interface AppearanceSettings {
  /** Theme (Mocha/Latte) */
  theme: Theme;
  // ❌ REMOVE: density: DisplayDensity;
  /** Show connection status indicator */
  showConnectionStatus: boolean;
  /** Enable animations */
  animations: boolean;
}
```

**Note**: Keep `DisplayDensity` type definition (not exported, internal only).

#### `src/store/useSettingsStore.ts`

Remove density state and actions:

```typescript
// Remove from default settings
const DEFAULT_SETTINGS: Settings = {
  appearance: {
    theme: "mocha",
    // ❌ REMOVE: density: "comfortable",
    showConnectionStatus: true,
    animations: true,
  },
  // ... rest
};

// Remove action
interface SettingsStore {
  // ❌ REMOVE: setDensity: (density: DisplayDensity) => void;
}

// Remove implementation
// ❌ REMOVE: setDensity: (density) => set((state) => ({ ... })),
```

#### `src/App.tsx`

Remove density attribute application:

```typescript
// ❌ REMOVE this entire section:
// Apply density setting
root.setAttribute("data-density", settings.appearance.density);

// ❌ REMOVE from dependency array:
settings.appearance.density,
```

#### `src/components/SettingsModal.tsx`

Remove density UI:

```tsx
{/* ❌ REMOVE entire Select component for density */}
<Select
  id="density"
  label="Display Density"
  value={settings.appearance.density}
  onChange={(e) => setDensity(e.target.value as DisplayDensity)}
  options={[
    { value: "compact", label: "Compact" },
    { value: "comfortable", label: "Comfortable" },
    { value: "spacious", label: "Spacious" },
  ]}
/>
```

### Step 3: SCSS Changes

**Pattern to follow for all 12 files**:

1. Find all `[data-density="..."]` selectors
2. Identify the compact variant styles
3. Move compact styles to the base selector
4. Delete comfortable and spacious variants
5. Ensure no orphaned selectors

**Example** (`_message-card.scss`):

```scss
// BEFORE
.message-card {
  padding: 1rem;
  
  [data-density="compact"] & {
    padding: 0.5rem;
    font-size: 0.875rem;
  }
  
  [data-density="spacious"] & {
    padding: 1.5rem;
    font-size: 1.125rem;
  }
}

// AFTER
.message-card {
  padding: 0.5rem;
  font-size: 0.875rem;
}
```

### Step 4: Test Updates

#### `src/store/__tests__/useSettingsStore.test.ts`

Remove density tests:

```typescript
// ❌ REMOVE
it("should update density", () => {
  expect(settings.appearance.density).toBe("compact");
  // ...
});
```

#### `src/components/__tests__/SettingsModal.test.tsx`

Remove density UI tests:

```typescript
// ❌ REMOVE
it("should update display density", async () => {
  const densitySelect = screen.getByLabelText("Display Density");
  // ...
});
```

---

## SCSS Files Detailed Audit

### 1. `_aircraft-markers.scss` (2 occurrences)

```scss
[data-density="compact"] .aircraft-marker { /* ... */ }
[data-density="spacious"] .aircraft-marker { /* ... */ }
```

**Action**: Apply compact styles to `.aircraft-marker`, delete selectors.

### 2. `_chart.scss` (1 occurrence)

```scss
[data-density="compact"] .chart-container { /* ... */ }
```

**Action**: Apply compact styles to `.chart-container`.

### 3. `_message-card.scss` (1 occurrence)

```scss
[data-density="compact"] & { padding: 0.5rem; }
```

**Action**: Apply `padding: 0.5rem` to base `.message-card`.

### 4. `_message-group.scss` (2 occurrences)

```scss
[data-density="compact"] & { /* ... */ }
[data-density="spacious"] & { /* ... */ }
```

**Action**: Apply compact styles to base selectors.

### 5. `_radio.scss` (4 occurrences)

```scss
[data-density="compact"] & { /* ... */ }
[data-density="spacious"] & { /* ... */ }
```

**Action**: Apply compact styles to base selectors.

### 6. `_select.scss` (4 occurrences)

```scss
[data-density="compact"] & { /* ... */ }
[data-density="spacious"] & { /* ... */ }
```

**Action**: Apply compact styles to base selectors.

### 7. `_settings-modal.scss` (4 occurrences)

```scss
[data-density="compact"] & { /* ... */ }
[data-density="spacious"] & { /* ... */ }
```

**Action**: Apply compact styles to base selectors.

### 8. `_toggle.scss` (4 occurrences)

```scss
[data-density="compact"] & { /* ... */ }
[data-density="spacious"] & { /* ... */ }
```

**Action**: Apply compact styles to base selectors.

### 9. `_live-messages.scss` (1 occurrence)

```scss
[data-density="compact"] & { /* ... */ }
```

**Action**: Apply compact styles to base selector.

### 10. `_stats.scss` (2 occurrences)

```scss
[data-density="compact"] & { /* ... */ }
[data-density="spacious"] & { /* ... */ }
```

**Action**: Apply compact styles to base selectors.

### 11. `AlertsPage.scss` (2 occurrences)

```scss
[data-density="compact"] & { margin-top: 0.5rem; }
[data-density="spacious"] & { margin-top: 1.5rem; }
```

**Action**: Apply `margin-top: 0.5rem` to base selector.

### 12. `SearchPage.scss` (1 occurrence)

```scss
[data-density="compact"] & { /* ... */ }
```

**Action**: Apply compact styles to base selector.

---

## Migration Strategy

### Settings Migration (localStorage)

**Existing user settings** may have `density` key in localStorage:

```json
{
  "appearance": {
    "theme": "mocha",
    "density": "comfortable"
  }
}
```

**After migration**:

```json
{
  "appearance": {
    "theme": "mocha"
    // density key removed
  }
}
```

**Action**: No migration needed. Settings store will ignore unknown keys. Users lose density preference (intentional - removing feature).

---

## Testing Strategy

### Manual Testing

1. **Settings Modal**:
   - Open Settings → Appearance
   - Verify density control is GONE
   - Verify other controls still work (theme, animations, connection status)

2. **Visual Inspection**:
   - Check all pages for consistent spacing
   - Verify components use compact layout
   - Compare before/after screenshots

3. **Component Inspection**:
   - Message cards should be compact
   - Forms (radio, select, toggle) should be compact
   - Charts should be compact
   - Aircraft list should be compact

### Automated Testing

1. **TypeScript Compilation**: `npx tsc --noEmit`
2. **Unit Tests**: `npm test` (621 tests should still pass, minus removed density tests)
3. **Linting**: `biome check`
4. **Build**: `npm run build` (should succeed)

---

## Expected Changes Summary

**Lines Removed**: ~150-200 lines (SCSS selectors, TypeScript, tests)
**Lines Modified**: ~50-60 lines (base selectors updated with compact styles)
**Net Change**: ~100-150 lines removed

**User-Visible Changes**:
- ✅ Display Density setting removed from Settings Modal
- ✅ All components now use compact layout (slightly tighter spacing)
- ✅ Consistent spacing across entire application
- ✅ No user customization of density (one less decision to make)

**Developer Benefits**:
- ✅ Simpler SCSS (no density variants)
- ✅ Easier maintenance (one layout to test)
- ✅ Faster builds (less CSS to process)
- ✅ Clearer mental model (no magic selectors)

---

## Rollback Plan

If issues arise:

1. **Revert commit**: `git revert <commit-hash>`
2. **Restore from backup**: Git history contains all removed code
3. **Quick fix**: Re-add density with single default value

---

## Definition of Done

- [ ] All 18 files modified
- [ ] TypeScript compilation passes
- [ ] All tests pass (except removed density tests)
- [ ] Biome linting passes
- [ ] Production build succeeds
- [ ] Manual visual inspection complete
- [ ] Settings Modal has no density control
- [ ] All components use compact layout
- [ ] Documentation updated (AGENTS.md)
- [ ] Day 3 summary document created

---

## Time Estimates

- Step 1: Identify compact styles (30 min)
- Step 2: TypeScript changes (30 min)
- Step 3: SCSS changes (60 min)
- Step 4: Test updates (15 min)
- Testing & validation (30 min)
- Documentation (15 min)

**Total**: ~3 hours

---

**Status**: Ready to begin implementation