# Phase 15: Bug Fix & Refinement Pass - Kickoff Document

**Status**: 🚧 IN PROGRESS
**Started**: 2025-02-02
**Current Day**: Day 1 - Accessibility fixes tabled, proceeding with critical bugs
**Estimated Duration**: 5-7 days
**Goal**: Fix all known bugs and quality issues before beta release

---

## Overview

Phase 15 focuses on systematically fixing all known bugs, improving code quality, and ensuring production readiness. This is the final bug fix pass before E2E testing (Phase 16) and beta release (Phase 18).

---

## Bug Categories

### 1. Critical (Must Fix Before Beta)

**Priority**: P0 - Blocking

1. **Accessibility - WCAG AA Compliance** (⏸️ TABLED - 12/20 tests still failing)
   - Color contrast violations across multiple components
   - **Issue**: Computed colors don't match SCSS variables (complex debugging required)
   - **Decision**: Table this for deeper investigation after other critical bugs
   - Estimated time: 8-12 hours (more complex than initially estimated)
   - Files affected: 8-10 SCSS files + potential theme application issues

2. **Message Culling with ADS-B** (Data Loss Issue)
   - Messages discarded even when aircraft is active on ADS-B
   - Estimated time: 3-4 hours
   - Files affected: `store/useAppStore.ts`, `hooks/useSocketIO.ts`

3. **Socket Connection State** (False Disconnects) ⏭️ NEXT PRIORITY
   - Disconnected state shows when socket is valid
   - Estimated time: 1-2 hours
   - Files affected: `services/socket.ts`, `store/useAppStore.ts`

### 2. High Priority (Should Fix Before Beta)

**Priority**: P1 - Important

1. **System Status Timestamp Locale** (UX Issue)
   - Time Updated doesn't respect user locale settings
   - Estimated time: 30 minutes
   - Files affected: `pages/StatusPage.tsx`

2. **Message Card Timestamp Padding** (Visual Bug)
   - Timestamp needs right padding in header
   - Estimated time: 15 minutes
   - Files affected: `components/_message-card.scss`

3. **Density Setting Cleanup** (Technical Debt)
   - Deferred from earlier phases - hardcoded sizes in some places
   - Estimated time: 2-3 hours
   - Files affected: 14+ files (TypeScript + SCSS)

### 3. Medium Priority (Nice to Have)

**Priority**: P2 - Refinement

1. **Spacing Consistency** (Code Quality)
   - Padding/margin values inconsistent (hardcoded)
   - Estimated time: 2-3 hours
   - Files affected: Multiple SCSS files

2. **Healthcheck Script Review** (Operational)
   - Determine if healthcheck.sh meets container health objectives
   - Estimated time: 1-2 hours
   - Files affected: `rootfs/scripts/healthcheck.sh`

---

## Detailed Bug Analysis

### Bug 1: Accessibility - WCAG AA Compliance ⚠️ CRITICAL

**Current State**:
- 16 out of 20 E2E accessibility tests failing
- Root cause: Using `overlay0` and `overlay1` colors for text (3.3:1 and 4.0:1 contrast)
- Required: WCAG AA minimum 4.5:1 contrast ratio

**Affected Components**:
- Message Group Header: `.aircraft-id`, `.counter-text`, `.alert-count`
- Message Card: `.message-station`, `.message-type--*`, `.identifier__label`, timestamps, field labels
- Settings Modal: placeholder text, disabled states
- Form Controls: disabled inputs, placeholder text
- Navigation: muted text states

**Safe Color Mapping (Mocha Dark Theme)**:
| Variable | Contrast | Status | Use Case |
|----------|----------|--------|----------|
| `var(--color-text)` | 12.3:1 | ✅ SAFE | Main text |
| `var(--color-subtext1)` | 9.1:1 | ✅ SAFE | Secondary text, labels |
| `var(--color-subtext0)` | 6.7:1 | ✅ SAFE | Tertiary text, muted |
| `var(--color-overlay2)` | 5.2:1 | ✅ SAFE | Very muted (minimum) |
| `var(--color-overlay1)` | 4.0:1 | ❌ UNSAFE | DO NOT USE for text |
| `var(--color-overlay0)` | 3.3:1 | ❌ UNSAFE | DO NOT USE for text |

**Investigation Steps**:
1. ✅ DONE: Removed duplicate styles from `pages/_live-messages.scss`
2. ✅ DONE: Fixed ARIA role violation (moved `role="tablist"`)
3. ✅ DONE: Improved alert badge contrast
4. ✅ PARTIAL: Fixed obvious overlay0/overlay1 text usage (SearchPage, AlertsPage, settings)
5. ⏸️ TABLED: Debug why computed colors don't match SCSS variables
   - **Problem**: SCSS uses correct variables (--color-text, --color-subtext1)
   - **Computed**: Browser shows wrong colors (#969cb6 instead of #cdd6f4)
   - **Hypothesis**: Theme application issue, opacity blending, or specificity problem
   - **Needs**: Deep CSS debugging with browser DevTools on running app
   - **Decision**: Table for later - requires significant investigation time
6. ⏸️ TABLED: Systematic color replacements (pending root cause fix)
7. ⏸️ TABLED: Test both Mocha and Latte themes (pending fixes)

**Files Partially Fixed** (obvious overlay usage):
- ✅ `src/styles/pages/_search.scss` - Replaced overlay1 → subtext0 (4 instances)
- ✅ `src/styles/pages/_alerts.scss` - Replaced overlay1 → subtext0 (1 instance)
- ✅ `src/styles/components/_settings-modal.scss` - Replaced overlay1 → overlay2 (alert chip)
- ✅ `src/styles/components/_message-card.scss` - Replaced overlay0 → overlay2 (read badge)
- ✅ `src/styles/_reset.scss` - Replaced accent-pink → lavender (code tag)
- ✅ `src/styles/components/_aircraft-list.scss` - Fixed typo (subtext-0 → subtext0)

**Files Still Need Root Cause Fix**:
- `src/styles/components/_message-group.scss` - Uses correct variables but wrong colors computed
- `src/styles/components/_message-card.scss` - Uses correct variables but wrong colors computed
- Theme application in `App.tsx` or `_mixins.scss` may need investigation

**Testing**:
```bash
# Full accessibility suite
npx playwright test e2e/accessibility.spec.ts --reporter=line

# Just color contrast tests
npx playwright test e2e/accessibility.spec.ts --grep "color contrast"
```

**Success Criteria** (TABLED):
- ⏸️ All 20 E2E accessibility tests pass (currently 8/20 passing)
- ⏸️ No colors with contrast < 4.5:1 used for text
- ⏸️ Both Mocha and Latte themes WCAG AA compliant

**Current Status**: Partial progress made, tabled for deeper investigation

---

### Bug 2: Message Culling with ADS-B 🚨 CRITICAL

**Current Behavior**:
Messages are discarded based on `maxMessageGroups` setting without considering ADS-B pairing. If you're tracking 60 aircraft on ADS-B but `maxMessageGroups=50`, you'll lose messages for 10 aircraft even though they're actively visible on the map.

**Desired Behavior**:
1. Page load → receive messages from backend
2. If ADS-B enabled → wait for first `adsb_aircraft` event
3. Pair ADS-B aircraft with message groups
4. Culling pass:
   - **Keep ALL message groups paired with active ADS-B aircraft** (no limit)
   - Only apply `maxMessageGroups` to unpaired message groups
   - Within each group, keep `maxMessagesPerAircraft` newest messages

**Implementation Plan**:

**Step 1: Update Culling Logic** (`store/useAppStore.ts`)

Current code (lines ~450-480):
```typescript
// Cull oldest message groups if over limit
if (state.messageGroups.length > maxMessageGroups) {
  const sortedGroups = [...state.messageGroups].sort(
    (a, b) => a.lastUpdated - b.lastUpdated
  );
  const groupsToKeep = sortedGroups.slice(-maxMessageGroups);
  state.messageGroups = groupsToKeep;
}
```

New code:
```typescript
// Cull message groups, but preserve ADS-B paired aircraft
if (state.messageGroups.length > maxMessageGroups) {
  const adsbHexCodes = new Set(
    state.adsbAircraft?.aircraft.map(a => a.hex.toLowerCase()) ?? []
  );
  
  // Partition groups into ADS-B paired and unpaired
  const pairedGroups: MessageGroup[] = [];
  const unpairedGroups: MessageGroup[] = [];
  
  for (const group of state.messageGroups) {
    const isPaired = group.identifiers.some(id => 
      adsbHexCodes.has(id.toLowerCase())
    );
    if (isPaired) {
      pairedGroups.push(group);
    } else {
      unpairedGroups.push(group);
    }
  }
  
  // Keep ALL paired groups (no limit)
  // Apply maxMessageGroups limit only to unpaired groups
  const sortedUnpaired = unpairedGroups.sort(
    (a, b) => a.lastUpdated - b.lastUpdated
  );
  
  // Calculate how many unpaired groups we can keep
  const maxUnpaired = Math.max(0, maxMessageGroups - pairedGroups.length);
  const unpairedToKeep = sortedUnpaired.slice(-maxUnpaired);
  
  state.messageGroups = [...pairedGroups, ...unpairedToKeep];
  
  // Log culling stats
  if (unpairedGroups.length > maxUnpaired) {
    logger.info("Message groups culled", {
      totalBefore: pairedGroups.length + unpairedGroups.length,
      pairedKept: pairedGroups.length,
      unpairedKept: unpairedToKeep.length,
      unpairedCulled: unpairedGroups.length - unpairedToKeep.length,
    });
  }
}
```

**Step 2: Update Tests**

Add test case in `store/__tests__/useAppStore.test.ts`:
```typescript
it("should preserve ADS-B paired message groups during culling", () => {
  const store = useAppStore.getState();
  
  // Set max to 5 groups
  useSettingsStore.getState().setDataSettings({ maxMessageGroups: 5 });
  
  // Add 10 message groups (3 with ADS-B pairing)
  // ... test implementation
  
  // Verify: 3 paired groups kept + 2 oldest unpaired groups
  expect(store.messageGroups).toHaveLength(5);
  expect(pairedGroups).toHaveLength(3);
  expect(unpairedGroups).toHaveLength(2);
});
```

**Step 3: Add Logging**

Use existing `decoderLogger` or create `cullingLogger`:
```typescript
import { createLogger } from "@/utils/logger";
const cullingLogger = createLogger("culling");
```

**Testing**:
1. Manual test: Set `maxMessageGroups=10`, receive 20+ message groups, enable ADS-B with 15 aircraft
2. Verify: All 15 ADS-B aircraft retain messages, only unpaired groups are culled
3. Check logs: Verify culling stats logged correctly

**Files to Change**:
- `src/store/useAppStore.ts` - Culling logic
- `src/store/__tests__/useAppStore.test.ts` - Add tests
- `src/utils/logger.ts` - Add cullingLogger (if needed)

**Success Criteria**:
- ✅ ADS-B paired aircraft NEVER have messages culled
- ✅ Unpaired groups culled correctly by lastUpdated timestamp
- ✅ Logging shows culling stats (paired kept, unpaired culled)
- ✅ Unit tests pass

---

### Bug 3: Socket Connection State 🔴 CRITICAL

**Current Issue**:
Socket shows "disconnected" state even when connection is valid. This is likely a race condition or state sync issue.

**Investigation Steps**:

**Step 1: Add Detailed Logging**

Update `services/socket.ts`:
```typescript
import { socketLogger } from "@/utils/logger";

socket.on("connect", () => {
  socketLogger.info("Socket.IO connected", {
    socketId: socket.id,
    transport: socket.io.engine.transport.name,
    connected: socket.connected,
    disconnected: socket.disconnected,
  });
  // ... existing code
});

socket.on("disconnect", (reason) => {
  socketLogger.warn("Socket.IO disconnected", {
    reason,
    connected: socket.connected,
    disconnected: socket.disconnected,
  });
  // ... existing code
});

socket.on("connect_error", (error) => {
  socketLogger.error("Socket.IO connection error", {
    message: error.message,
    connected: socket.connected,
    disconnected: socket.disconnected,
  });
  // ... existing code
});
```

**Step 2: Check State Updates**

Verify in `hooks/useSocketIO.ts` that `setConnected()` is called correctly:
```typescript
socket.on("connect", () => {
  setConnected(true);
  socketLogger.debug("useSocketIO: State updated", { connected: true });
});

socket.on("disconnect", () => {
  setConnected(false);
  socketLogger.debug("useSocketIO: State updated", { connected: false });
});
```

**Step 3: Check for Race Conditions**

Look for these patterns:
- Multiple socket instances created
- State updates in wrong order
- Cleanup functions interfering with state
- React StrictMode double-mounting effects

**Step 4: Add Connection Status Debug UI**

Temporarily add to Navigation component:
```typescript
<div style={{ position: 'fixed', top: 0, right: 0, background: 'black', color: 'white', padding: '4px', fontSize: '10px', zIndex: 9999 }}>
  Socket: {socket?.connected ? '🟢 Connected' : '🔴 Disconnected'}
  | ID: {socket?.id || 'none'}
  | Store: {connected ? '✅' : '❌'}
</div>
```

**Files to Change**:
- `src/services/socket.ts` - Add detailed logging
- `src/hooks/useSocketIO.ts` - Verify state updates
- `src/store/useAppStore.ts` - Check connection state management

**Testing**:
1. Start app, verify connection shows correctly
2. Stop backend, verify disconnection shows
3. Restart backend, verify reconnection shows
4. Check logs for any state mismatches

**Success Criteria**:
- ✅ Connection state always matches actual socket.connected
- ✅ No false "disconnected" states
- ✅ Logs show accurate state transitions

---

### Bug 4: System Status Timestamp Locale 🕐 HIGH PRIORITY

**Current Issue**:
"Time Updated" on Status page doesn't respect user's locale settings (12hr/24hr format, timezone).

**Current Code** (`pages/StatusPage.tsx`):
```typescript
// Likely using Date.toLocaleString() or similar without settings
```

**Fix**:
Use existing `formatTimestamp()` utility with settings:
```typescript
import { formatTimestamp } from "@/utils/dateUtils";
import { useSettingsStore } from "@/store/useSettingsStore";

// In component
const { timeFormat, dateFormat, timezone } = useSettingsStore();

// Format timestamp
const formattedTime = formatTimestamp(
  status.timestamp,
  timeFormat,
  dateFormat,
  timezone
);
```

**Files to Change**:
- `src/pages/StatusPage.tsx` - Use formatTimestamp utility

**Testing**:
1. Change Settings → Regional & Time → Time Format (12hr/24hr/auto)
2. Change Settings → Regional & Time → Date Format
3. Navigate to Status page
4. Verify "Time Updated" reflects chosen formats

**Success Criteria**:
- ✅ Timestamp respects timeFormat setting
- ✅ Timestamp respects dateFormat setting
- ✅ Timestamp respects timezone setting
- ✅ Auto-detect works correctly

---

### Bug 5: Message Card Timestamp Padding 📐 HIGH PRIORITY

**Current Issue**:
Timestamp in message card header ("Decoder Kind - Station Name - Time") needs right padding.

**Current SCSS** (`components/_message-card.scss`):
```scss
.message-card__header {
  // ... existing styles
}
```

**Fix**:
Add padding to timestamp element:
```scss
.message-card__timestamp {
  padding-right: 0.75rem; // or use spacing variable
}
```

**Files to Change**:
- `src/styles/components/_message-card.scss`

**Testing**:
1. Open Live Messages page
2. Verify timestamp has proper spacing from right edge

**Success Criteria**:
- ✅ Visual spacing looks balanced
- ✅ Matches other header elements' spacing
- ✅ Works on mobile (320px width)

---

### Bug 6: Density Setting Cleanup 🧹 MEDIUM PRIORITY

**Background**:
Deferred from earlier phases. Density setting exists but some sizes are hardcoded.

**Goal**:
Remove density setting entirely and standardize on compact layout.

**Current State**:
- Settings has density toggle (compact/comfortable/spacious)
- Some components use `data-density` selectors
- Some components have hardcoded sizes

**Implementation Plan**:

**Step 1: Audit Current Usage**
```bash
# Find all density references
cd acarshub-react
grep -r "density" src/
grep -r "data-density" src/
```

**Step 2: Remove Setting**
- Delete from `store/useSettingsStore.ts`
- Delete from Settings Modal UI
- Delete from `types/index.ts`

**Step 3: Simplify SCSS**
Remove all `[data-density="..."]` selectors, keep only compact styles.

**Step 4: Update Tests**
Remove density-related tests.

**Files to Change** (estimated 14+ files):
- `src/store/useSettingsStore.ts`
- `src/components/SettingsModal.tsx`
- `src/types/index.ts`
- `src/styles/components/*.scss` (remove density selectors)
- `src/styles/pages/*.scss` (remove density selectors)
- `src/store/__tests__/useSettingsStore.test.ts`
- `src/components/__tests__/SettingsModal.test.tsx`

**Testing**:
```bash
just ci  # All tests must pass
```

**Success Criteria**:
- ✅ No density setting in UI
- ✅ No density-related TypeScript code
- ✅ No `[data-density]` selectors in SCSS
- ✅ All tests pass
- ✅ Visual appearance unchanged (uses compact by default)

---

### Bug 7: Spacing Consistency 📏 MEDIUM PRIORITY

**Current Issue**:
Padding and margin values are hardcoded throughout SCSS files. Feels inconsistent.

**Goal**:
Create spacing variables and use them consistently.

**Implementation Plan**:

**Step 1: Define Spacing Scale**

In `src/styles/_variables.scss`:
```scss
// Spacing scale (based on 8px grid)
$spacing-xs: 0.25rem;  // 4px
$spacing-sm: 0.5rem;   // 8px
$spacing-md: 0.75rem;  // 12px
$spacing-lg: 1rem;     // 16px
$spacing-xl: 1.5rem;   // 24px
$spacing-2xl: 2rem;    // 32px
$spacing-3xl: 3rem;    // 48px
```

**Step 2: Audit Current Values**
```bash
# Find all hardcoded spacing
grep -r "padding:" src/styles/ | grep -E "[0-9]+rem|[0-9]+px"
grep -r "margin:" src/styles/ | grep -E "[0-9]+rem|[0-9]+px"
```

**Step 3: Create Mapping**
Map existing values to variables:
- `0.5rem` → `$spacing-sm`
- `1rem` → `$spacing-lg`
- `1.5rem` → `$spacing-xl`
- etc.

**Step 4: Replace Systematically**
Replace hardcoded values file by file.

**Files to Change**:
- `src/styles/_variables.scss` - Add spacing scale
- All SCSS files with padding/margin

**Testing**:
1. Visual regression testing (manual)
2. No layout shifts expected
3. `just ci` must pass

**Success Criteria**:
- ✅ Spacing scale defined
- ✅ All hardcoded values replaced
- ✅ No visual regressions
- ✅ More maintainable codebase

---

### Bug 8: Healthcheck Script Review 🏥 LOW PRIORITY

**Current State**:
`rootfs/scripts/healthcheck.sh` exists for Docker container health checks.

**Goal**:
Determine if it meets operational objectives for container health.

**Investigation**:

**Step 1: Read Current Script**
```bash
cat rootfs/scripts/healthcheck.sh
```

**Step 2: Test Current Behavior**
```bash
# Run in container
docker exec <container> /scripts/healthcheck.sh
echo $?  # Should be 0 if healthy
```

**Step 3: Review Requirements**
- Does it check Python backend health?
- Does it check nginx health?
- Does it check database connectivity?
- Does it have appropriate timeout?
- Does it produce useful output?

**Step 4: Recommend Improvements**
If needed:
- Add Socket.IO connection check
- Add database query check
- Add decoder thread check
- Improve timeout handling

**Files to Review**:
- `rootfs/scripts/healthcheck.sh`
- `Dockerfile` (HEALTHCHECK instruction)

**Success Criteria**:
- ✅ Script accurately reflects container health
- ✅ False positives/negatives minimized
- ✅ Useful for orchestration (Kubernetes, Docker Swarm)

---

## Work Schedule

### Day 1: Accessibility Investigation + Socket State Fix ✅ PARTIAL / 🚧 IN PROGRESS
**Duration**: 4 hours (2 spent on a11y, 2 on socket state)
- ✅ DONE: Quick wins - Fixed obvious overlay0/overlay1 text usage (1 hour)
- ✅ DONE: Build test - Verified no compilation errors (15 minutes)
- ✅ PARTIAL: Ran accessibility tests - 8/20 passing (45 minutes)
- ⏸️ TABLED: Deep CSS debugging (requires more time than budgeted)
- 🚧 NOW: Socket connection state debugging (2 hours)

**Deliverable**: Socket connection state fixed, accessibility partially improved (tabled for later)

---

### Day 2: Message Culling with ADS-B (Critical)
**Duration**: 4 hours
- Implement ADS-B-aware culling logic (2 hours)
- Add unit tests for culling (1 hour)
- Add detailed logging (30 minutes)
- Manual testing (30 minutes)

**Deliverable**: No message loss for ADS-B aircraft

---

### Day 3: Quick Fixes + Density Cleanup + Healthcheck
**Duration**: 6 hours
- Fix System Status timestamp locale (30 minutes)
- Fix Message Card timestamp padding (15 minutes)
- Remove density setting (3 hours)
- Update tests (45 minutes)
- Healthcheck script review (1 hour)
- Verify no regressions (30 minutes)

**Deliverable**: Timestamp fixes, density setting removed, healthcheck reviewed

---

### Day 4: Spacing Consistency + Accessibility Deep Dive
**Duration**: 6 hours
- Define spacing scale (30 minutes)
- Audit current values (1 hour)
- Replace systematically (1.5 hours)
- Visual regression testing (30 minutes)
- Accessibility: Debug CSS variable application (2.5 hours)

**Deliverable**: Consistent spacing + accessibility root cause identified

---

### Day 5: Accessibility Fixes + Final Testing
**Duration**: 6 hours
- Implement accessibility fixes based on Day 4 findings (3 hours)
- Test both themes (Mocha/Latte) (1 hour)
- Full regression testing (2 hours)

**Deliverable**: All critical bugs fixed, accessibility passing

---

## Quality Gates

Before marking Phase 15 complete:

1. ✅ All accessibility tests pass (20/20)
2. ✅ All unit tests pass (603/605 or better)
3. ✅ All E2E tests pass (15/15 Chromium)
4. ✅ `just ci` passes with no errors
5. ✅ Manual testing on mobile (375px, 768px viewports)
6. ✅ Manual testing on desktop (1920px viewport)
7. ✅ Both themes tested (Mocha and Latte)
8. ✅ Docker build succeeds
9. ✅ Container health check works
10. ✅ No console errors or warnings

---

## Documentation Updates

After Phase 15 completion:

1. Update `AGENTS.md` - Mark Phase 15 complete
2. Update bug list in `AGENTS.md` - Mark all fixed bugs with ✅
3. Create `agent-docs/PHASE_15_SUMMARY.md` - Document all fixes
4. Update `ACCESSIBILITY_AUDIT.md` - Final results
5. Update `CHANGELOG.md` - List all bug fixes

---

## Next Steps After Phase 15

1. **Phase 16**: E2E Testing & Quality Assurance
   - Comprehensive Playwright tests
   - Backend mocking for stable tests
   - Full user journey coverage

2. **Phase 17**: Documentation & User Guide
   - User documentation
   - Developer documentation
   - Deployment guides

3. **Phase 18**: Beta Release & Feedback
   - Deploy to beta testers
   - Collect feedback
   - Iterate on critical issues

---

## Notes

- Phase 15 is **critical** for production readiness
- **Accessibility tabled**: Requires deeper investigation than initially estimated
- Focus on **data integrity bugs** first (socket state, message culling)
- **Test thoroughly** after each fix
- **Document everything** for future reference
- Keep commits **small and focused** (one bug per commit)
- **Revised priority**: Socket state → Message culling → Quick fixes → Spacing → Accessibility deep dive

---

**Last Updated**: 2025-02-02 (updated after 2 hours work)
**Status**: Day 1 in progress - Accessibility tabled, proceeding with Socket State fix
**Changes**: Accessibility requires deeper investigation; pivoting to critical data integrity bugs