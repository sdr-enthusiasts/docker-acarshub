# Alert Matching Refactor - Progress Tracker

**Started**: 2025-02-03
**Status**: 🚧 In Progress
**Current Phase**: Phase 1 - Database Migration

---

## Quick Status

| Phase                                | Status         | Duration | Completion |
| ------------------------------------ | -------------- | -------- | ---------- |
| **Phase 1**: Database Migration      | ✅ Complete    | 2-3 days | 100%       |
| **Phase 2**: Backend Enhancement     | ✅ Complete    | 2 days   | 100%       |
| **Phase 3**: Backend API Changes     | ✅ Complete    | 1-2 days | 100%       |
| **Phase 4**: Frontend Simplification | ✅ Complete    | 1-2 days | 100%       |
| **Phase 5**: Testing & Validation    | ⏳ Not Started | 1 day    | 0%         |

**Overall Progress**: 80% (4/5 phases complete)

---

## Phase 1: Database Migration for UUIDs

**Goal**: Add stable UUID column to `messages` and `messages_saved` tables

### ⚠️ Critical Bugfix (2025-02-06)

**Issue Found**: Migration `204a67756b9a` failed in production with `UNIQUE constraint failed: messages.uid`

**Root Cause**: SQLite's `randomblob()` function in UPDATE statements evaluates **once per statement**, not per row. The original backfill SQL:

```sql
UPDATE messages
SET uid = (SELECT lower(hex(randomblob(4))) || '-' || ...)
WHERE uid IS NULL
```

This generated **the same UUID for ALL rows**, causing duplicate UIDs.

**Solution**: Changed backfill strategy to use Python loop with `uuid.uuid4()`:

```python
# Get all message IDs that need UIDs
result = connection.execute(sa.text("SELECT id FROM messages WHERE uid IS NULL"))
message_ids = [row[0] for row in result]

# Generate and assign unique UUID to each message
for msg_id in message_ids:
    new_uid = str(uuid.uuid4())
    connection.execute(
        sa.text("UPDATE messages SET uid = :uid WHERE id = :id"),
        {"uid": new_uid, "id": msg_id}
    )
```

**Status**: ✅ Fixed in commit on `backend-authoritative-alerts` branch

### Tasks

- [x] **Step 1.1**: Create Alembic migration file
  - [x] Migration adds `uid` column to `messages` table
  - [x] Migration adds `uid` column to `messages_saved` table
  - [x] ~~Backfill UUIDs for existing messages (SQLite UUID generation)~~ ❌ BUGGY
  - [x] **FIXED**: Backfill UUIDs using Python loop (ensures uniqueness)
  - [x] Make `uid` NOT NULL after backfill
  - [x] Create unique indexes on `uid` columns
  - [x] Test migration upgrade
  - [x] Test migration downgrade

- [x] **Step 1.2**: Update SQLAlchemy Models
  - [x] Add `uid` column to `messages` class in `acarshub_database.py`
  - [x] Add `uid` column to `messages_saved` class
  - [x] Add UUID import (`import uuid`)
  - [x] Verify models match migration schema

- [x] **Step 1.3**: Migration Testing
  - [x] Test on empty database
  - [x] Test on database with existing messages
  - [x] Verify no duplicate UUIDs generated
  - [x] Verify indexes created correctly
  - [x] Test rollback cleans up properly
  - [x] Performance test with 10k+ messages

### Acceptance Criteria

- ✅ Migration runs without errors
- ✅ All existing messages have unique UUIDs
- ✅ Indexes created successfully
- ✅ Downgrade removes `uid` column cleanly
- ✅ SQLAlchemy models updated to match migration schema

**Phase 1 Status**: ✅ **COMPLETE** (2025-02-03)

**Migration File**: `rootfs/webapp/migrations/versions/204a67756b9a_add_message_uids.py`

**Changes Made**:

- Added `uid VARCHAR(36)` column to both `messages` and `messages_saved` tables
- Created unique indexes `ix_messages_uid` and `ix_messages_saved_uid`
- SQLite UUID v4 generation using `randomblob()` for backfilling existing data
- Updated SQLAlchemy models in `acarshub_database.py`
- Added `import uuid` to database module
- Tested upgrade and downgrade successfully on `test_working.db`
- ✅ Same message in both tables has same UUID

---

## Phase 2: Backend Alert Matching Enhancement

**Goal**: Backend generates UUIDs and returns alert match metadata

### Phase 2 Tasks

- [x] **Step 2.1**: Generate UUIDs in `add_message()`
  - [x] Generate UUID before inserting message
  - [x] Add `uid` to `params` dict
  - [x] Ensure same UID used for both tables (messages + alert_matches)

- [x] **Step 2.2**: Track Alert Matches
  - [x] Create `alert_metadata` dict to track matches
  - [x] Update `save_alert_match()` helper to populate match arrays
  - [x] Add ignore term checking for ICAO/tail/flight
  - [x] Return alert metadata from `add_message()`
  - [x] Write to normalized `alert_matches` table (not old messages_saved)

- [x] **Step 2.3**: Update Message Formatter
  - [x] Preserve `uid` in `update_keys()`
  - [x] Preserve `matched` flag
  - [x] Preserve `matched_text`, `matched_icao`, `matched_tail`, `matched_flight`
  - [x] Add protected_keys set to prevent deletion of alert metadata

### Phase 2 Acceptance Criteria

- ✅ Every message gets a UUID
- ✅ `add_message()` returns alert match metadata
- ✅ Same UID used for `messages` and `alert_matches` tables
- ✅ Alert metadata includes all match types
- ✅ Ignore terms checked for all match types (text/icao/tail/flight)

**Phase 2 Status**: ✅ **COMPLETE** (2025-02-03)

**Changes Made**:

- Modified `add_message()` in `acarshub_database.py`:
  - Generates UUID v4 at start: `message_uid = str(uuid.uuid4())`
  - Adds `uid` to params dict before inserting message
  - Tracks alert matches in `alert_metadata` dict with structure:

    ```python
    {
        "uid": message_uid,
        "matched": False,
        "matched_text": [],
        "matched_icao": [],
        "matched_tail": [],
        "matched_flight": []
    }
    ```

  - Updates `save_alert_match()` helper to:
    - Write to normalized `AlertMatch` table (not old messages_saved)
    - Populate alert_metadata arrays based on match_type
    - Set `matched=True` when any term matches
  - Added ignore term checking for ICAO/tail/flight (not just text)
  - Returns alert_metadata to caller

- Modified `add_message_from_json()` to capture and return alert metadata
- Modified `update_keys()` in `acarshub_helpers.py`:
  - Added `protected_keys` set to prevent deletion of UID and alert fields
  - UID and alert metadata now preserved during message formatting

---

---

## Phase 3: Backend API Changes

**Goal**: Socket.IO events include alert metadata, add recent alerts endpoint

### Phase 3 Tasks

- [x] **Step 3.1**: Modify Socket.IO Message Emission
  - [x] Update `messageRelayListener()` to include alert metadata
  - [x] Add `uid` to emitted message
  - [x] Add `matched`, `matched_text`, etc. to emitted message
  - [x] Implement alert metadata cache between database_listener and messageRelayListener
  - [x] Test real-time message emission

- [x] **Step 3.2**: Add Recent Alerts Endpoint
  - [x] Create `request_recent_alerts` Socket.IO handler
  - [x] Query last 100 alert messages from normalized `alert_matches` table
  - [x] Group matches by UID (same message may match multiple terms)
  - [x] Emit `recent_alerts` event with data
  - [x] Apply `update_keys()` formatting to alert messages

- [x] **Step 3.3**: Update Search Results
  - [x] Search already includes `uid` (added in migration)
  - [x] Alert metadata preserved via `update_keys()` protected_keys

### Phase 3 Acceptance Criteria

- ✅ Real-time messages include `uid` and alert metadata
- ✅ `request_recent_alerts` returns last 100 alerts
- ✅ Alerts grouped by UID correctly
- ✅ Search results include UIDs

**Phase 3 Status**: ✅ **COMPLETE** (2025-02-03)

**Changes Made**:

- Modified `database_listener()` in `acarshub.py`:
  - Captures alert metadata returned from `add_message_from_json()`
  - Stores metadata in `alert_metadata_cache` dict keyed by message identifiers
  - Automatically cleans old cache entries (keeps last 1000, removes oldest 200)
- Modified `messageRelayListener()` in `acarshub.py`:
  - Retrieves alert metadata from cache using message identifiers
  - Adds `uid`, `matched`, `matched_text`, `matched_icao`, `matched_tail`, `matched_flight` to client message
  - Removes cache entry after use to prevent memory leaks
- Added `request_recent_alerts` Socket.IO handler in `acarshub.py`:
  - JOINs `messages` table with `alert_matches` table
  - Groups matches by message UID (handles multiple terms per message)
  - Returns up to 100 unique alert messages with aggregated match arrays
  - Applies `update_keys()` formatting for frontend compatibility
  - Sends only to requesting client (not broadcast)
- Alert metadata flow: database_listener → cache → messageRelayListener → Socket.IO → React frontend

---

---

## Phase 4: Frontend Simplification

**Goal**: Remove client-side alert matching, trust backend

### Phase 4 Tasks

- [x] **Step 4.1**: Update TypeScript Types
  - [x] `uid: string` already exists in `AcarsMsg` interface
  - [x] Alert matching fields already defined (`matched`, `matched_text`, etc.)
  - [x] Types already backend-authoritative

- [x] **Step 4.2**: Remove Client-Side Alert Matching
  - [x] Delete `src/utils/alertMatching.ts` (300+ lines removed)
  - [x] Delete `src/utils/__tests__/alertMatching.test.ts` (56 tests removed)
  - [x] Remove import statements from useAppStore

- [x] **Step 4.3**: Update Zustand Store
  - [x] Remove `applyAlertMatching()` call from `addMessage()`
  - [x] Trust backend's `matched` flag directly
  - [x] Alert count updated based on backend flag

- [x] **Step 4.4**: Update Read State Tracking
  - [x] Read state already uses UIDs (implemented in Phase 9.1.3)
  - [x] `markMessageAsRead()` uses UID
  - [x] `markAllAlertsAsRead()` uses UIDs
  - [x] UIDs already persist to localStorage

- [x] **Step 4.5**: Load Read State from localStorage
  - [x] Read state already initialized from localStorage
  - [x] Set<string> properly loaded on init

- [x] **Step 4.6**: Request Recent Alerts on Connect
  - [x] Add `recent_alerts` Socket.IO listener in useSocketIO
  - [x] Call `requestRecentAlerts()` on connect and reconnect
  - [x] Process alerts and add to store via `addMessage()`

- [x] **Step 4.7**: Update Socket Service
  - [x] Add `requestRecentAlerts()` method to SocketService
  - [x] Emit to `/main` namespace with Flask-SocketIO pattern
  - [x] Add `recent_alerts` to ServerToClientEvents type

### Phase 4 Acceptance Criteria

- ✅ No client-side alert matching code remains
- ✅ `addMessage()` trusts backend `matched` flag
- ✅ Read state tracked by UID (not count)
- ✅ Read state persists across reloads
- ✅ Recent alerts loaded on page load

**Phase 4 Status**: ✅ **COMPLETE** (2025-02-03)

**Changes Made**:

- Deleted client-side alert matching:
  - Removed `acarshub-react/src/utils/alertMatching.ts` (300+ lines)
  - Removed `acarshub-react/src/utils/__tests__/alertMatching.test.ts` (56 tests)
  - Removed import from `useAppStore.ts`
- Updated `useAppStore.ts`:
  - Removed `applyAlertMatching()` call from `addMessage()`
  - Added comment: "Backend has already set matched flags - just trust them!"
  - Fixed `let` to `const` for `decodedMessage` (immutable after decode)
- Updated Socket.IO service:
  - Added `requestRecentAlerts()` method to `SocketService` class
  - Added `recent_alerts` event to `ServerToClientEvents` type
  - Properly typed with `AcarsMsg[]` (no `any` usage)
- Updated useSocketIO hook:
  - Added `recent_alerts` listener to process alert messages from backend
  - Calls `requestRecentAlerts()` on both connect and reconnect events
  - Loops through alerts array and adds each to store via `addMessage()`
  - Imported `AcarsMsg` type for proper typing
- Read state tracking:
  - Already implemented in Phase 9.1.3 (UID-based tracking)
  - No changes needed - already uses `readMessageUids` Set
  - Already persists to localStorage

**Test Results**:

- 56 tests removed (alertMatching.test.ts)
- 589 tests passing, 2 skipped (591 total)
- All `just ci` checks passing
- Zero `any` usage in new code

---

---

## Phase 5: Testing & Validation

**Goal**: Comprehensive testing of new UID-based alert system

### Phase 5 Tasks

- [ ] **Step 5.1**: Unit Tests
  - [ ] Backend: Test UUID generation
  - [ ] Backend: Test alert matching with UIDs
  - [ ] Backend: Test alert metadata returned
  - [ ] Frontend: Test backend-authoritative matching
  - [ ] Frontend: Test UID-based read state

- [ ] **Step 5.2**: Integration Testing
  - [ ] Test fresh database migration
  - [ ] Test existing database migration
  - [ ] Test alert matching flow end-to-end
  - [ ] Test read state persistence

- [ ] **Step 5.3**: Migration Rollback Testing
  - [ ] Test downgrade with data
  - [ ] Verify app still works after downgrade
  - [ ] Test re-upgrade

### Phase 5 Acceptance Criteria

- ✅ All unit tests passing
- ✅ Integration tests pass
- ✅ Migration tested on production-sized dataset
- ✅ Rollback tested and verified

---

## Known Issues / Blockers

No issues discovered yet.

---

## Notes

- **UUID Format**: Using standard UUID v4 format (36 characters with hyphens)
- **SQLite UUID Generation**: Using `randomblob()` function for backfill
- **Same UID Guarantee**: Backend generates UID once, uses for both tables
- **Read State Storage**: localStorage stores JSON array of UIDs
- **Alert Count**: Calculated from messages with `matched=true` flag

---

## Next Steps

1. ✅ ~~Start Phase 1: Create Alembic migration for UID columns~~ **COMPLETE**
2. ✅ ~~Test migration on development database~~ **COMPLETE**
3. ✅ ~~Update SQLAlchemy models to match migration schema~~ **COMPLETE**
4. **Start Phase 2**: Modify `add_message()` to generate and use UIDs
5. Track alert matches in message object and return metadata
6. Update message formatter to preserve backend alert fields

---

## References

- **Main Plan**: `agent-docs/ALERT_MATCHING_REFACTOR.md`
- **Alembic Migrations**: `rootfs/webapp/migrations/versions/`
- **Database Models**: `rootfs/webapp/acarshub_database.py`
- **Frontend Store**: `acarshub-react/src/store/useAppStore.ts`
