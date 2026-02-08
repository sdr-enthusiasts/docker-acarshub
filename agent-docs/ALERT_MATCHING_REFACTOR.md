# Alert Matching Refactor - Backend as Source of Truth

**Status**: 🚧 Planning Phase
**Created**: 2025-02-03
**Estimated Duration**: 1 week

## Problem Statement

Currently, ACARS Hub has **two separate alert matching implementations**:

1. **Backend matching** in `acarshub_database.py` - Saves matches to `messages_saved` table
2. **Frontend matching** in `alertMatching.ts` - Client-side regex matching

This dual implementation causes:

- **Inconsistent results** - Backend and frontend may disagree on what matches
- **Difficult debugging** - Which implementation is wrong when they differ?
- **Duplicate logic** - Same regex patterns maintained in two places
- **Fragile read state** - No stable message identifiers for tracking read/unread
- **Missing context on page load** - Frontend doesn't know backend's alert decisions

Additionally, the current `messages_saved` table has a **poor schema design**:

- **Data duplication** - Stores complete copy of all 30+ message fields
- **Storage waste** - Message matching 3 terms = 3 full duplicate rows
- **Inconsistency risk** - Updates to `messages` table don't reflect in `messages_saved`
- **Poor normalization** - Violates database design principles

## Solution: Backend as Sole Arbiter

### Core Principles

1. **Backend owns alert matching** - Single source of truth
2. **Stable UUIDs** - Every message gets a UUID (one message = one UID, always)
3. **Normalized schema** - New `alert_matches` junction table instead of duplicating messages
4. **Rich API responses** - Backend sends match metadata with every message
5. **Frontend trusts backend** - No client-side matching logic
6. **Persistent read state** - UIDs enable reliable read/unread tracking

---

## Phase 1: Database Migration for UUIDs ✅ COMPLETE

**Status**: ✅ Complete (2025-02-03)
**Migration File**: `204a67756b9a_add_message_uids.py`

### What Was Done

- Added `uid VARCHAR(36)` column to `messages` table (unique, indexed)
- Added `uid VARCHAR(36)` column to `messages_saved` table (unique, indexed)
- Backfilled UUIDs for existing messages using SQLite `randomblob()`
- Created unique indexes `ix_messages_uid` and `ix_messages_saved_uid`
- Updated SQLAlchemy models in `acarshub_database.py`
- Tested upgrade and downgrade successfully

**Note**: The `messages_saved` table UID column will be used in Phase 1b to migrate data to the new `alert_matches` table before being dropped.

---

## Phase 1b: Create Normalized alert_matches Table (1 day)

**Goal**: Replace `messages_saved` with normalized `alert_matches` junction table

### New Schema Design

**Before (Denormalized)**:

```sql
messages_saved:
  - id, uid, message_type, timestamp, tail, flight, text, ...
  - 30+ duplicate columns from messages table
  - term, type_of_match (only 2 unique columns!)
```

**After (Normalized)**:

```sql
messages:
  - id, uid, message_type, timestamp, tail, flight, text, ...
  - (single source of truth)

alert_matches:
  - id (primary key)
  - message_uid (foreign key → messages.uid, indexed)
  - term (alert term that matched, VARCHAR(32))
  - match_type (text/icao/tail/flight, VARCHAR(32))
  - matched_at (timestamp, INTEGER)
```

### Step 1b.1: Create Migration

**File**: `rootfs/webapp/migrations/versions/<timestamp>_create_alert_matches_table.py`

```python
def upgrade() -> None:
    """Create alert_matches table and migrate data from messages_saved."""

    # Create new alert_matches table
    op.create_table(
        'alert_matches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('message_uid', sa.String(36), nullable=False),
        sa.Column('term', sa.String(32), nullable=False),
        sa.Column('match_type', sa.String(32), nullable=False),
        sa.Column('matched_at', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # Create index on message_uid for fast JOIN queries
    op.create_index('ix_alert_matches_message_uid', 'alert_matches', ['message_uid'])

    # Migrate data from messages_saved to alert_matches
    # Extract only the unique alert metadata (term, type_of_match, timestamp)
    op.execute("""
        INSERT INTO alert_matches (message_uid, term, match_type, matched_at)
        SELECT uid, term, type_of_match, msg_time
        FROM messages_saved
        WHERE uid IS NOT NULL
    """)

    # Drop messages_saved table (data preserved in alert_matches)
    op.drop_table('messages_saved')

def downgrade() -> None:
    """Restore messages_saved table from alert_matches."""

    # Recreate messages_saved table structure
    # (Full schema from initial migration - 30+ columns)
    op.create_table(
        'messages_saved',
        # ... all columns from messages table ...
        sa.Column('term', sa.String(32), nullable=False),
        sa.Column('type_of_match', sa.String(32), nullable=False),
    )

    # Restore data by JOINing alert_matches with messages
    op.execute("""
        INSERT INTO messages_saved
        SELECT m.*, am.term, am.match_type as type_of_match
        FROM messages m
        INNER JOIN alert_matches am ON m.uid = am.message_uid
    """)

    # Drop alert_matches table
    op.drop_index('ix_alert_matches_message_uid', table_name='alert_matches')
    op.drop_table('alert_matches')
```

### Step 1b.2: Update SQLAlchemy Models

**File**: `rootfs/webapp/acarshub_database.py`

```python
# NEW: Alert matches junction table
class AlertMatch(Messages):
    __tablename__ = "alert_matches"
    id = Column(Integer, primary_key=True)
    message_uid = Column("message_uid", String(36), nullable=False, index=True)
    term = Column("term", String(32), nullable=False)
    match_type = Column("match_type", String(32), nullable=False)
    matched_at = Column("matched_at", Integer, nullable=False)

# REMOVE: messages_saved class (no longer needed)
# class messages_saved(Messages):
#     ...
```

### Step 1b.3: Benefits

✅ **No data duplication** - Message stored once in `messages` table
✅ **Storage efficient** - Message matching 5 terms = 1 message row + 5 alert_match rows
✅ **Consistent data** - Updates to `messages` immediately reflect everywhere
✅ **Easy queries**:

- Get all alert messages: `SELECT DISTINCT m.* FROM messages m JOIN alert_matches am ON m.uid = am.message_uid`
- Get matches for message: `SELECT term, match_type FROM alert_matches WHERE message_uid = ?`
- Count unique alert messages: `SELECT COUNT(DISTINCT message_uid) FROM alert_matches`

**Success Criteria**:

- ✅ alert_matches table created with proper schema
- ✅ All messages_saved data migrated to alert_matches
- ✅ messages_saved table dropped
- ✅ Downgrade restores messages_saved correctly
- ✅ No data loss during migration

---

---

## Phase 2: Backend Alert Matching Enhancement (2 days)

**Goal**: Backend generates UIDs, saves to normalized alert_matches table, returns metadata

### Step 2.1: Generate UUIDs in `add_message()`

**File**: `rootfs/webapp/acarshub_database.py`

**Changes**:

```python
def add_message(params, message_type, message_from_json, backup=False):
    try:
        if backup:
            session = db_session_backup()
        else:
            session = db_session()

        # Generate stable UUID for this message (ONE UID PER MESSAGE)
        message_uid = str(uuid.uuid4())
        params['uid'] = message_uid

        update_frequencies(params["freq"], message_type, session)
        if acarshub_configuration.DB_SAVEALL or is_message_not_empty(message_from_json):
            # Write message to messages table (single source of truth)
            session.add(messages(message_type=message_type, **params))
```

### Step 2.2: Save Alert Matches to alert_matches Table

**Modify `add_message()` to use normalized schema**:

```python
        # Initialize alert tracking (for return value)
        alert_metadata = {
            'matched': False,
            'matched_text': [],
            'matched_icao': [],
            'matched_tail': [],
            'matched_flight': []
        }

        if alert_terms:
            # Helper function to save alert match to alert_matches table
            def save_alert_match(term, match_type):
                # Track this match for return value
                alert_metadata['matched'] = True

                if match_type == 'text':
                    alert_metadata['matched_text'].append(term.upper())
                elif match_type == 'icao':
                    alert_metadata['matched_icao'].append(term.upper())
                elif match_type == 'tail':
                    alert_metadata['matched_tail'].append(term.upper())
                elif match_type == 'flight':
                    alert_metadata['matched_flight'].append(term.upper())

                # Update alert stats (for statistics page)
                found_term = (
                    session.query(alertStats)
                    .filter(alertStats.term == term.upper())
                    .first()
                )
                if found_term is not None:
                    found_term.count += 1
                else:
                    session.add(alertStats(term=term.upper(), count=1))

                # Save to alert_matches table (normalized schema)
                # Only stores: message_uid, term, match_type, timestamp
                session.add(
                    AlertMatch(
                        message_uid=message_uid,  # Links to messages.uid
                        term=term.upper(),
                        match_type=match_type,
                        matched_at=params['time']  # Message timestamp
                    )
                )

            # Check message text for alert terms
            if len(params["text"]) > 0:
                for search_term in alert_terms:
                    if re.findall(r"\b{}\b".format(search_term), params["text"]):
                        should_add = True
                        for ignore_term in alert_terms_ignore:
                            if re.findall(r"\b{}\b".format(ignore_term), params["text"]):
                                should_add = False
                                break
                        if should_add:
                            save_alert_match(search_term, "text")

            # Check ICAO hex
            if len(params["icao"]) > 0:
                icao_upper = params["icao"].upper()
                for search_term in alert_terms:
                    term_upper = search_term.upper()
                    if icao_upper == term_upper or term_upper in icao_upper:
                        # Check ignore terms
                        should_add = True
                        for ignore_term in alert_terms_ignore:
                            ignore_upper = ignore_term.upper()
                            if icao_upper == ignore_upper or ignore_upper in icao_upper:
                                should_add = False
                                break
                        if should_add:
                            save_alert_match(search_term, "icao")

            # Check tail number
            if len(params["tail"]) > 0:
                tail_upper = params["tail"].upper()
                for search_term in alert_terms:
                    term_upper = search_term.upper()
                    if tail_upper == term_upper or term_upper in tail_upper:
                        should_add = True
                        for ignore_term in alert_terms_ignore:
                            ignore_upper = ignore_term.upper()
                            if tail_upper == ignore_upper or ignore_upper in tail_upper:
                                should_add = False
                                break
                        if should_add:
                            save_alert_match(search_term, "tail")

            # Check flight number
            if len(params["flight"]) > 0:
                flight_upper = params["flight"].upper()
                for search_term in alert_terms:
                    term_upper = search_term.upper()
                    if flight_upper == term_upper or term_upper in flight_upper:
                        should_add = True
                        for ignore_term in alert_terms_ignore:
                            ignore_upper = ignore_term.upper()
                            if flight_upper == ignore_upper or ignore_upper in flight_upper:
                                should_add = False
                                break
                        if should_add:
                            save_alert_match(search_term, "flight")

        session.commit()

        # Return alert match metadata for Socket.IO emission
        return alert_metadata

    except Exception as e:
        acarshub_logging.acars_traceback(e, "database")
        session.rollback()
        return None
    finally:
        session.close()
```

### Step 2.3: Update Message Formatter

**File**: `rootfs/webapp/acarshub_helpers.py`

**Modify `update_keys()` to preserve backend alert metadata**:

```python
def update_keys(json_message):
    # Sanitize empty/None values
    stale_keys = []
    for key in json_message:
        if not has_specified_key_not_none(json_message, key):
            stale_keys.append(key)

    for key in stale_keys:
        del json_message[key]

    # Preserve these keys if they exist (from database query or backend matching)
    preserve_keys = [
        'uid',           # Stable message identifier
        'matched',       # Alert match flag
        'matched_text',  # Matched text terms
        'matched_icao',  # Matched ICAO terms
        'matched_tail',  # Matched tail terms
        'matched_flight' # Matched flight terms
    ]

    # ... existing key transformations (msg_text -> text, time -> timestamp, etc.)
```

---

## Phase 3: Backend API Changes (1-2 days)

### Step 3.1: Modify Socket.IO Message Emission

**File**: `rootfs/webapp/acarshub.py`

**Current Code** (messageRelayListener, line ~150):

```python
def messageRelayListener():
    while True:
        if not thread_message_relay_event.is_set():
            try:
                message_json = incoming_messages.popleft()
                # ... process message ...
                socketio.emit("acars_msg", msghtml, namespace="/main", broadcast=True)
```

**New Code**:

```python
def messageRelayListener():
    while True:
        if not thread_message_relay_event.is_set():
            try:
                message_json = incoming_messages.popleft()

                # Save message to database and get alert match results
                db_safe_params = acarshub_database.create_db_safe_params(message_json)
                alert_matches = acarshub_database.add_message(
                    db_safe_params,
                    message_json.get("message_type", "ACARS"),
                    message_json
                )

                # Add alert metadata to message before sending to frontend
                if alert_matches is not None:
                    message_json['uid'] = db_safe_params['uid']
                    message_json['matched'] = alert_matches['matched']
                    message_json['matched_text'] = alert_matches['matched_text']
                    message_json['matched_icao'] = alert_matches['matched_icao']
                    message_json['matched_tail'] = alert_matches['matched_tail']
                    message_json['matched_flight'] = alert_matches['matched_flight']

                # Format message for frontend
                msghtml = acars_formatter.build_message_object(message_json)

                # Emit to all connected clients
                socketio.emit("acars_msg", msghtml, namespace="/main", broadcast=True)
```

### Step 3.2: Add Recent Alerts Endpoint (Using Normalized Schema)

**File**: `rootfs/webapp/acarshub.py`

**Add new Socket.IO handler**:

```python
@socketio.on("request_recent_alerts", namespace="/main")
def handle_recent_alerts_request():
    """
    Send recent alert messages to client on request.
    Called when React app loads to populate initial alert state.

    Uses normalized schema: JOINs messages with alert_matches table.
    """
    try:
        session = acarshub_database.db_session()

        # Get distinct alert messages with their match metadata
        # JOIN messages with alert_matches to get complete data
        recent_alerts_query = (
            session.query(
                acarshub_database.messages,
                acarshub_database.AlertMatch.term,
                acarshub_database.AlertMatch.match_type
            )
            .join(
                acarshub_database.AlertMatch,
                acarshub_database.messages.uid == acarshub_database.AlertMatch.message_uid
            )
            .order_by(desc(acarshub_database.messages.time))
            .limit(200)  # Increased limit since we'll deduplicate by UID
            .all()
        )

        # Group matches by message UID (same message may match multiple terms)
        alerts_by_uid = {}
        for msg, term, match_type in recent_alerts_query:
            msg_dict = acarshub_database.query_to_dict(msg)
            msg_dict = acarshub_helpers.update_keys(msg_dict)

            uid = msg_dict['uid']

            if uid not in alerts_by_uid:
                # First match for this message
                alerts_by_uid[uid] = msg_dict
                alerts_by_uid[uid]['matched'] = True
                alerts_by_uid[uid]['matched_text'] = []
                alerts_by_uid[uid]['matched_icao'] = []
                alerts_by_uid[uid]['matched_tail'] = []
                alerts_by_uid[uid]['matched_flight'] = []

            # Append match to appropriate array
            if match_type == 'text':
                alerts_by_uid[uid]['matched_text'].append(term)
            elif match_type == 'icao':
                alerts_by_uid[uid]['matched_icao'].append(term)
            elif match_type == 'tail':
                alerts_by_uid[uid]['matched_tail'].append(term)
            elif match_type == 'flight':
                alerts_by_uid[uid]['matched_flight'].append(term)

        # Convert to list and limit to 100 unique messages
        alerts_data = list(alerts_by_uid.values())[:100]

        # Send to requesting client only (not broadcast)
        socketio.emit("recent_alerts", {"alerts": alerts_data}, namespace="/main")

    except Exception as e:
        acarshub_logging.acars_traceback(e, "socketio")
    finally:
        session.close()
```

### Step 3.3: Update Search Results to Include UIDs

**File**: `rootfs/webapp/acarshub_helpers.py`

**Modify `handle_message()` search handler** to include `uid` in results.

---

## Phase 4: Frontend Simplification (1-2 days)

### Step 4.1: Update TypeScript Types

**File**: `acarshub-react/src/types/index.ts`

```typescript
export interface AcarsMsg {
  // Existing fields...

  // NEW: Stable message identifier from backend
  uid: string;

  // UPDATED: Alert matching now comes from backend
  matched: boolean; // Backend sets this
  matched_text?: string[]; // Backend provides matched terms
  matched_icao?: string[];
  matched_tail?: string[];
  matched_flight?: string[];

  // Remove client-side only fields (no longer needed)
  // matchedTerms, matchedIcao, etc. are now server-authoritative
}
```

### Step 4.2: Remove Client-Side Alert Matching

**Files to Delete**:

- `acarshub-react/src/utils/alertMatching.ts` (entire file - 300+ lines)
- `acarshub-react/src/utils/__tests__/alertMatching.test.ts` (56 tests - no longer needed)

### Step 4.3: Update Zustand Store

**File**: `acarshub-react/src/store/useAppStore.ts`

**Before** (lines ~200-250):

```typescript
addMessage: (message: AcarsMsg) => {
  // Client-side alert matching (REMOVE THIS)
  const { matched, matchedTerms, matchedIcao, matchedTail, matchedFlight } =
    checkMessageForAlerts(message, get().alertTerms);

  message.matched = matched;
  message.matched_text = matchedTerms;
  // ... etc

  // Decode message
  const decodedMessage = messageDecoder.decodeMessage(message);

  // Add to store
  // ...
};
```

**After**:

```typescript
addMessage: (message: AcarsMsg) => {
  // Backend has already set matched flags - just trust them!
  // No client-side matching needed

  // Decode message
  const decodedMessage = messageDecoder.decodeMessage(message);

  // Add to store
  // ...

  // Update alert count if this is an alert
  if (decodedMessage.matched) {
    set({ alertCount: get().alertCount + 1 });
  }
};
```

### Step 4.4: Update Read State Tracking to Use UIDs

**File**: `acarshub-react/src/store/useAppStore.ts`

**Before**:

```typescript
// Current: Set of message counts (fragile, doesn't survive culling)
readMessageUids: new Set<string>(),
```

**After**:

```typescript
// NEW: Set of actual message UIDs (stable, survives culling)
readMessageUids: new Set<string>(),

markMessageAsRead: (uid: string) => {
  const readUids = get().readMessageUids;
  readUids.add(uid);
  set({ readMessageUids: new Set(readUids) });

  // Persist to localStorage
  localStorage.setItem('readMessageUids', JSON.stringify([...readUids]));
},

markAllAlertsAsRead: () => {
  const messageGroups = get().messageGroups;
  const readUids = get().readMessageUids;

  // Mark all alert messages as read by UID
  messageGroups.forEach(group => {
    group.messages.forEach(msg => {
      if (msg.matched) {
        readUids.add(msg.uid);
      }
    });
  });

  set({ readMessageUids: new Set(readUids) });
  localStorage.setItem('readMessageUids', JSON.stringify([...readUids]));
},
```

### Step 4.5: Load Read State from localStorage on Init

**File**: `acarshub-react/src/store/useAppStore.ts`

```typescript
// Initialize read state from localStorage
const storedReadUids = localStorage.getItem("readMessageUids");
const initialReadUids = storedReadUids
  ? new Set<string>(JSON.parse(storedReadUids))
  : new Set<string>();

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // ... other state ...
      readMessageUids: initialReadUids,
      // ...
    }),
    {
      name: "app-store",
      partialize: (state) => ({
        // Don't persist readMessageUids here (handled separately)
        // ... other persisted state
      }),
    },
  ),
);
```

### Step 4.6: Request Recent Alerts on Connect

**File**: `acarshub-react/src/hooks/useSocketIO.ts`

```typescript
socket.on("connect", () => {
  logger.info("Socket.IO connected", { socketId: socket.id });

  useAppStore.getState().setIsConnected(true);

  // Request recent alerts to populate initial state
  socketService.requestRecentAlerts();
});

socket.on("recent_alerts", (data: { alerts: AcarsMsg[] }) => {
  logger.info("Received recent alerts", { count: data.alerts.length });

  // Add alerts to store (they already have matched flags from backend)
  data.alerts.forEach((alert) => {
    useAppStore.getState().addMessage(alert);
  });
});
```

### Step 4.7: Update Socket Service

**File**: `acarshub-react/src/services/socket.ts`

```typescript
export const socketService = {
  // ... existing methods ...

  requestRecentAlerts(): void {
    if (!socket.connected) {
      logger.warn("Cannot request recent alerts - socket not connected");
      return;
    }

    logger.debug("Requesting recent alerts from backend");
    (socket as any).emit("request_recent_alerts", {}, "/main");
  },
};
```

---

## Phase 5: Testing & Validation (1 day)

### Step 5.1: Unit Tests

**Backend Tests** (`rootfs/webapp/tests/test_alert_matching.py`):

```python
def test_uuid_generation():
    """Verify UUIDs are generated for new messages"""
    # Insert test message
    # Verify uid column is populated
    # Verify UUID is valid format

def test_alert_matching_with_uid():
    """Verify alert matches saved with same UID as message"""
    # Insert message that matches alert term
    # Query messages table for uid
    # Query messages_saved table for same uid
    # Assert UIDs match

def test_alert_metadata_returned():
    """Verify add_message returns alert match metadata"""
    # Call add_message with alert-triggering content
    # Assert return value contains matched=True
    # Assert matched_text array contains expected term
```

**Frontend Tests** (`acarshub-react/src/store/__tests__/useAppStore.test.ts`):

```typescript
describe("Backend-Authoritative Alert Matching", () => {
  it("should trust backend matched flag", () => {
    // Create message with matched=true from backend
    const message: AcarsMsg = {
      uid: "test-uuid-123",
      matched: true,
      matched_text: ["EMERGENCY"],
      // ... other fields
    };

    store.getState().addMessage(message);

    // Verify message added with matched flag intact
    const groups = store.getState().messageGroups;
    const addedMsg = groups[0].messages[0];
    expect(addedMsg.matched).toBe(true);
    expect(addedMsg.matched_text).toContain("EMERGENCY");
  });

  it("should track read state by UID", () => {
    const uid = "test-uuid-456";

    store.getState().markMessageAsRead(uid);

    expect(store.getState().readMessageUids.has(uid)).toBe(true);
  });

  it("should persist read UIDs to localStorage", () => {
    const uid = "test-uuid-789";

    store.getState().markMessageAsRead(uid);

    const stored = localStorage.getItem("readMessageUids");
    expect(stored).toBeTruthy();
    const uids = JSON.parse(stored!);
    expect(uids).toContain(uid);
  });
});
```

### Step 5.2: Integration Testing

**Test Scenarios**:

1. **Fresh database migration**
   - Run migration on empty database
   - Insert messages
   - Verify UUIDs generated

2. **Existing database migration**
   - Run migration on database with 10k+ messages
   - Verify all messages get UUIDs
   - Verify no duplicates

3. **Alert matching flow**
   - Configure alert term
   - Send message matching term via decoder
   - Verify Socket.IO emission includes matched=true
   - Verify React UI shows alert

4. **Read state persistence**
   - Mark alert as read
   - Reload page
   - Verify alert still marked as read

### Step 5.3: Migration Rollback Testing

```bash
# With test data
alembic upgrade head
# Verify UIDs exist
alembic downgrade -1
# Verify UIDs removed, app still works
alembic upgrade head
# Verify UIDs restored
```

---

## Rollout Plan

### Development Environment

1. ✅ Create migration (Phase 1)
2. ✅ Test migration on dev database
3. ✅ Update backend code (Phase 2)
4. ✅ Update API layer (Phase 3)
5. ✅ Update frontend (Phase 4)
6. ✅ Run test suite (Phase 5)
7. ✅ Manual testing

### Production Deployment

**Pre-Deployment**:

- Backup production database
- Test migration on copy of production data
- Verify rollback works

**Deployment**:

```bash
# 1. Stop container
docker stop acarshub

# 2. Backup database
cp /opt/acarshub/acarshub.db /opt/acarshub/acarshub.db.backup

# 3. Pull new image
docker pull ghcr.io/sdr-enthusiasts/docker-acarshub:latest

# 4. Start container (migration runs automatically)
docker start acarshub

# 5. Monitor logs
docker logs -f acarshub
```

**Rollback Plan** (if migration fails):

```bash
# 1. Stop container
docker stop acarshub

# 2. Restore backup
cp /opt/acarshub/acarshub.db.backup /opt/acarshub/acarshub.db

# 3. Revert to previous image
docker run --rm -d \
  --name acarshub \
  -v /opt/acarshub:/run/acars \
  ghcr.io/sdr-enthusiasts/docker-acarshub:previous-version
```

---

## Success Criteria

- ✅ All messages have stable UUIDs
- ✅ Backend alert matching is sole source of truth
- ✅ Frontend receives match metadata via Socket.IO
- ✅ No client-side alert matching code remains
- ✅ Read state persists correctly using UIDs
- ✅ Alert count accurate on page load
- ✅ All unit tests passing
- ✅ Migration rollback tested and working
- ✅ Production deployment successful

---

## Breaking Changes

### Database Schema

- **Messages table**: Added `uid` column (indexed, unique, not null)
- **NEW: alert_matches table**: Replaces `messages_saved` (normalized schema)
- **REMOVED: messages_saved table**: Data migrated to `alert_matches` (no data loss)

### API Changes

- **Socket.IO `acars_msg` event**: Now includes `uid`, `matched`, `matched_text`, `matched_icao`, `matched_tail`, `matched_flight` fields
- **New Socket.IO event**: `request_recent_alerts` / `recent_alerts`

### Frontend Changes

- **Removed**: `alertMatching.ts` utility (300+ lines deleted)
- **Removed**: Client-side alert matching logic
- **Changed**: `readMessageUids` now stores actual UIDs (not counts)
- **Changed**: Alert state initialization (requests from backend via `request_recent_alerts`)

### Query Changes

- Queries that used `messages_saved` must now JOIN `messages` with `alert_matches`
- Example: `SELECT m.* FROM messages m JOIN alert_matches am ON m.uid = am.message_uid`

---

## Future Enhancements

1. **Alert history API** - Query alerts by date range, term, aircraft
2. **Alert export** - Download matched messages as CSV/JSON
3. **Alert statistics** - Trending terms, busiest times, etc.
4. **Alert notifications** - Webhook support, email alerts
5. **UID-based message linking** - Link related messages by UID

---

## References

- **Alembic Documentation**: <https://alembic.sqlalchemy.org/>
- **UUID RFC 4122**: <https://tools.ietf.org/html/rfc4122>
- **SQLite UUID Functions**: <https://www.sqlite.org/lang_corefunc.html#randomblob>
- **React Query Invalidation**: Future consideration for cache management
