# Phase 10.2: Integration Testing - Kickoff Summary

**Status:** Ready to begin
**Previous Phase:** Phase 10.1 (Unit Testing) - COMPLETE ✅
**Next Phase:** Phase 10.3 (End-to-End Testing with Playwright)

---

## Phase 10.1 Completion Summary

### Achievements

- **505 tests passing** (0 failures)
- **Test coverage:**
  - Utilities: 282 tests (100% coverage)
  - Stores: 113 tests (comprehensive coverage)
  - Components: 110 tests (Button, Card)
- **All quality checks passing:**
  - TypeScript strict mode ✅
  - Biome linter/formatter ✅
  - Production build successful ✅
- **Documentation complete:**
  - `agent-docs/PHASE_10_1_COMPLETE.md`
  - `agent-docs/PHASE_10_1_TESTING_SETUP.md`

### Deferred to Phase 10.2

- **MessageCard component tests** - Requires Socket.IO mocks, decoder integration
- **SettingsModal component tests** - Requires store integration, Socket.IO mocks
- Both deferred because they are integration tests, not unit tests

---

## Test Data Strategy

### ✅ Setup Complete

Two distinct test data sources have been prepared:

#### 1. Hand-Crafted Mock Fixtures (For Phase 10.2)

**Location:** `acarshub-react/src/__fixtures__/messages.ts`

**Contents:**

- `simpleAcarsMessage` - Basic ACARS text message
- `multiPartMessages` - 3-part sequence (M01A, M02A, M03A)
- `libacarsMessage` - CPDLC libacars decoder example
- `alertMessage` - Contains "EMERGENCY" term
- `duplicateMessage` - Identical to simple message
- `hfdlMessage` - HF datalink example
- `vdlm2Message` - VDL Mode 2 example
- `emptyMessage` - No text/data (label SQ)

**Total:** 11 carefully crafted messages (~5-10KB)

**Format:** TypeScript objects in Socket.IO `acars_msg` event format (post-backend processing)

**Why:** Fast, deterministic, focused tests without Python backend dependency

#### 2. Real-World Message Captures (For Phase 10.3)

**Location:** `acarshub-react/tests/fixtures/`

**Files:**

- `raw-acars-messages.jsonl` - 1,220 ACARS messages (285KB)
- `raw-vdlm2-messages.jsonl` - 798 VDLM2 messages (308KB)
- `raw-hfdl-messages.jsonl` - 842 HFDL messages (362KB)

**Total:** 2,860 real messages collected over ~1 hour

**Format:** JSON-lines (newline-delimited), raw decoder output (acarsdec, dumpvdl2, dumphfdl)

**Why:** E2E validation of full stack (Python backend → Socket.IO → React UI)

**Documentation:** `acarshub-react/tests/fixtures/README.md` and `agent-docs/TEST_DATA_STRATEGY.md`

---

## Phase 10.2: Integration Testing Goals

### Primary Objectives

1. **Component Integration Tests**
   - MessageCard component (most complex)
   - SettingsModal component (Socket.IO integration)
   - Form behaviors and validation

2. **Socket.IO Event Flow**
   - Mock Socket.IO server
   - Message reception → decoding → store updates → UI updates
   - Alert matching → notifications (sound + desktop)

3. **Store Integration**
   - AppStore + SettingsStore interactions
   - Message grouping, culling, duplicate detection
   - Unread/alert count tracking
   - localStorage persistence across reloads

4. **Search & Pagination**
   - Database query mocking
   - Pagination calculations
   - Result display

---

## Test Plan Overview

### Priority 1: MessageCard Component (Highest Impact)

**Complexity:** High (~100+ tests estimated)

**Test Coverage:**

1. **Basic Rendering**
   - All field types (tail, flight, ICAO hex, airline)
   - Timestamps with settings integration
   - Signal level, frequency, station
   - Message metadata (label, block ID, msgno)

2. **Decoder Output**
   - `decodedText` from @airframes/acars-decoder
   - Libacars JSON parsing and formatting (CPDLC, frequency data)
   - Alert term highlighting (`<mark>` tags)

3. **Multi-Part Messages**
   - `msgno_parts` display (e.g., "M01A M02A M03A")
   - Merged text re-decoding

4. **Duplicate Detection**
   - `duplicates` counter display
   - Duplicate badge styling

5. **Read/Unread State**
   - Mark read button behavior
   - Read badge display
   - Reduced opacity for read messages
   - Store integration (readMessageUids Set)

6. **Responsive Display**
   - Mobile view (hide verbose fields)
   - Desktop view (show all fields)
   - Density mode support

7. **Accessibility**
   - Semantic HTML
   - ARIA labels
   - Keyboard navigation

**Mock Fixtures:** Use `src/__fixtures__/messages.ts`

**Dependencies:**

- `@testing-library/react`
- `@testing-library/user-event`
- Zustand store mocking
- Settings store mocking

---

### Priority 2: SettingsModal Component

**Complexity:** High (~80+ tests estimated)

**Test Coverage:**

1. **Form Validation**
   - Volume slider (0-100 range)
   - Message count sliders (min/max validation)
   - API key input (optional field)

2. **Store Persistence**
   - Setting updates reflected in store
   - localStorage writes
   - Batch updates

3. **Import/Export**
   - JSON export validation
   - JSON import with error handling
   - Version migration testing

4. **Socket.IO Integration**
   - `update_alerts` event emission
   - Alert terms add/remove
   - Real-time sync with backend

5. **Tab Navigation**
   - 4 tabs (Appearance, Regional, Notifications, Data)
   - Keyboard navigation
   - Mobile scrollable tabs

6. **Component Behavior**
   - Reset to defaults with confirmation
   - Test Sound button (audioService integration)
   - Theme switching

**Mock Requirements:**

- Socket.IO emit mocking
- audioService.playAlertSound mock
- localStorage mock
- Settings store

---

### Priority 3: Socket.IO Integration Tests

**Test Coverage:**

1. **Message Reception Flow**
   - `acars_msg` event → AppStore.addMessage()
   - Decoder invocation (messageDecoder.decode)
   - Alert matching (checkMessageForAlerts)
   - Store state updates

2. **Notification Triggers**
   - Sound alert playback
   - Desktop notification creation
   - Debouncing logic

3. **Alert Term Updates**
   - `terms` event → AppStore update
   - Client-side alert re-matching

4. **Search Queries**
   - `query_search` emit with proper namespace
   - `database_search_results` response handling
   - Pagination state updates

**Mock Requirements:**

- Mock Socket.IO server (or manual emit simulation)
- Audio mock (already in vitest.setup.ts)
- Notification API mock (already in vitest.setup.ts)

---

### Priority 4: Store Integration Tests

**Test Coverage:**

1. **Message Grouping**
   - Aircraft/station identifier matching
   - Message array ordering (newest first)
   - Group creation and updates

2. **Culling System**
   - maxMessagesPerAircraft enforcement
   - maxMessageGroups enforcement
   - Oldest group removal (by lastUpdated)

3. **Duplicate Detection**
   - Full field match
   - Text-only match
   - Multi-part duplicate tracking

4. **Multi-Part Merging**
   - Sequence detection (M01A, M02A, M03A)
   - Text concatenation
   - Re-decoding merged message

5. **Alert Tracking**
   - Global alertCount updates
   - Per-group has_alerts and num_alerts
   - Unread alert count calculation

6. **Persistence**
   - localStorage reads/writes
   - Cross-reload state restoration
   - Migration logic

**Already Tested in Phase 10.1:**

- useAppStore basics (41 tests)
- useSettingsStore basics (72 tests)

**Phase 10.2 Focus:**

- Cross-store interactions
- Complex state flows
- Edge cases with real-world scenarios

---

## Tools and Configuration

### Already Configured ✅

- **Vitest** - Test runner with jsdom environment
- **@testing-library/react** - Component testing
- **@testing-library/user-event** - User interaction simulation
- **Mocks:**
  - Chart.js (vitest.setup.ts)
  - MapLibre GL JS (vitest.setup.ts)
  - Audio API (vitest.setup.ts)
  - Notification API (vitest.setup.ts)

### To Add (If Needed)

- **MSW (Mock Service Worker)** - HTTP API mocking (optional, may not be needed)
- **socket.io-mock** or manual Socket.IO mock patterns

---

## Success Criteria

### Phase 10.2 Complete When

- ✅ MessageCard component fully tested (100+ tests)
- ✅ SettingsModal component fully tested (80+ tests)
- ✅ Socket.IO event flow tested (message reception → UI updates)
- ✅ Store integration tested (cross-store interactions, complex flows)
- ✅ All tests passing with TypeScript strict mode
- ✅ All Biome checks passing
- ✅ No `any` types in test code
- ✅ Coverage reports show comprehensive integration coverage
- ✅ Documentation updated (AGENTS.md, summary docs)

**Estimated Total:** 200-250+ new integration tests

---

## Timeline Estimate

- **MessageCard tests:** 1-2 days
- **SettingsModal tests:** 1 day
- **Socket.IO integration tests:** 1 day
- **Store integration tests:** 1 day
- **Documentation and cleanup:** 0.5 days

**Total:** 4.5-5.5 days of focused work

---

## Next Steps (Immediate)

1. **Create MessageCard.test.tsx**
   - Start with basic rendering tests
   - Add decoder output tests
   - Add multi-part/duplicate tests
   - Add read/unread interaction tests

2. **Mock Socket.IO patterns**
   - Decide on mocking approach (manual vs library)
   - Create reusable mock helpers

3. **Iterate and refine**
   - Run tests frequently
   - Fix issues as they arise
   - Keep TypeScript strict mode happy

---

## Questions Before Starting

### Resolved ✅

- **Q:** Where do real-world message files fit in?
  - **A:** Phase 10.3 (E2E tests), NOT Phase 10.2
- **Q:** Should we pre-process raw messages for frontend tests?
  - **A:** No, use hand-crafted mocks for Phase 10.2
- **Q:** What format should mock fixtures use?
  - **A:** Socket.IO `acars_msg` format (post-backend processing)

---

## Documentation References

- **Test Data Strategy:** `agent-docs/TEST_DATA_STRATEGY.md`
- **Mock Fixtures:** `acarshub-react/src/__fixtures__/messages.ts`
- **Real Fixtures:** `acarshub-react/tests/fixtures/README.md`
- **Phase 10.1 Summary:** `agent-docs/PHASE_10_1_COMPLETE.md`
- **Main Project Guide:** `AGENTS.md` (Phase 10.2 section lines 2190-2231)

---

## Ready to Begin! 🚀

Phase 10.2 is now ready to start with:

- Clear test data strategy
- Mock fixtures prepared
- Real-world data reserved for E2E
- Success criteria defined
- Timeline estimated

**First Task:** Create `MessageCard.test.tsx` and start testing the most complex component.
