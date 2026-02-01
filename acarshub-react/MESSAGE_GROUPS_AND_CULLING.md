# Message Groups and Culling - Critical Architecture

## Terminology Clarification

### Message Group ≠ Aircraft

**IMPORTANT**: We use "Message Group" not "Aircraft" because the source of messages can be:

- Aircraft (most common)
- Ground stations
- Unknown sources

A **Message Group** is a collection of messages from a single source, identified by matching:

- `flight` (callsign)
- `tail` (registration)
- `icao_hex` (ICAO hex identifier)

**In code**: `MessageGroup` type (with `Plane` as legacy alias during migration)

## Global State Architecture

### Zustand Store (Global)

Message groups are stored in the **global Zustand store**, not scoped to individual pages.

**Why Global**:

1. **Live Map needs message data** - Will display aircraft positions from ACARS messages
2. **Live Messages needs ADS-B data** - Will update identifiers from ADS-B stream
3. **Shared state prevents duplication** - Single source of truth for all message data

**Store Location**: `acarshub-react/src/store/useAppStore.ts`

```typescript
interface AppState {
  messageGroups: Map<string, MessageGroup>; // Global message groups
  addMessage: (message: AcarsMsg) => void;
  clearMessages: () => void;
  // ... other state
}
```

### Message Group Type

```typescript
export interface MessageGroup {
  identifiers: string[]; // All known IDs (flight, tail, icao_hex)
  has_alerts: boolean; // Has any alert messages
  num_alerts: number; // Count of alert messages
  messages: AcarsMsg[]; // Array of messages (newest first)
  lastUpdated: number; // Unix timestamp for culling
}
```

**Key Fields**:

- `identifiers`: All known identifiers for this source (can have multiple)
- `lastUpdated`: Timestamp of most recent message (used for culling old groups)
- `messages`: Limited to `maxMessagesPerAircraft` (default 50)

## Culling System

### Two-Level Limits

Level 1: Messages per Group

- Setting: `maxMessagesPerAircraft` (default 50)
- Controls: How many messages to keep for **each** message group
- Oldest messages dropped when limit exceeded
- Prevents individual groups from consuming too much memory

Level 2: Total Message Groups

- Setting: `maxMessageGroups` (default 50)
- Controls: How many message **groups** to keep in memory total
- Oldest **groups** (by `lastUpdated`) dropped when limit exceeded
- Prevents unbounded memory growth

### Culling Implementation

**Location**: `useAppStore.ts` - `addMessage` function

```typescript
// After adding/updating message
if (newMessageGroups.size > maxGroups) {
  // Sort groups by lastUpdated (oldest first)
  const sortedGroups = Array.from(newMessageGroups.entries()).sort(
    (a, b) => a[1].lastUpdated - b[1].lastUpdated,
  );

  // Remove oldest groups until we're at the limit
  const groupsToRemove = sortedGroups.slice(
    0,
    newMessageGroups.size - maxGroups,
  );
  for (const [key] of groupsToRemove) {
    newMessageGroups.delete(key);
  }
}
```

**Logic**:

1. Check if total groups > `maxMessageGroups`
2. Sort all groups by `lastUpdated` (oldest first)
3. Calculate how many to remove: `size - maxGroups`
4. Delete oldest groups from Map
5. Return updated state

**Performance**: O(n log n) for sorting, but runs only when limit exceeded

### Last Updated Tracking

```typescript
// Update message group with current timestamp
newMessageGroups.set(primaryKey, {
  identifiers: Array.from(identifiers),
  has_alerts: hasAlerts,
  num_alerts: numAlerts,
  messages: updatedMessages,
  lastUpdated: decodedMessage.timestamp || Date.now() / 1000,
});
```

**Timestamp Source**:

- Prefer: `message.timestamp` (from message itself)
- Fallback: `Date.now() / 1000` (current time if no timestamp)

**Updates**:

- Every new message updates `lastUpdated`
- Duplicate messages update `lastUpdated` (keeps group fresh)
- Multi-part message merges update `lastUpdated`

## Message Group Count

### What "Aircraft" Count Represents

The "Aircraft" count shown in the UI is:

- **Total message groups in memory** (from Zustand store)
- Not total messages received (that's a different counter)
- Not aircraft currently transmitting (that's filtered display count)

**Formula**:

```typescript
totalAircraft: messageGroups.size; // Size of Map = number of groups in memory
```

### Future: ADS-B Integration

When ADS-B is wired in, the count will be:

```text
totalAircraft = messageGroups.size + adsbOnlyAircraft.size
```

Where:

- `messageGroups.size` = Sources with ACARS messages
- `adsbOnlyAircraft.size` = Aircraft with ADS-B only (no ACARS yet)

**Example**:

- 30 message groups (ACARS sources)
- 70 ADS-B aircraft (no ACARS)
- Total count: 100

## Settings Integration

### Data & Privacy Settings

```typescript
export interface DataSettings {
  maxMessagesPerAircraft: number; // Messages per group (10-200, default 50)
  maxMessageGroups: number; // Total groups (10-200, default 50)
  enableCaching: boolean; // Not yet implemented
  autoClearMinutes: number; // Not yet implemented
}
```

**UI Location**: Settings Modal → Data & Privacy tab

**Sliders**:

1. "Max Messages per Source" (10-200, step 10)
   - Controls messages kept per message group
   - Help text: "Maximum messages to keep per source (aircraft, station, etc.)"

2. "Max Message Groups" (10-200, step 10)
   - Controls total message groups in memory
   - Help text: "Maximum number of message sources to track (oldest groups are culled)"

## Migration from Legacy

### Legacy Implementation

**Legacy** used "aircraft" terminology exclusively:

- Variable names: `planes`, `aircraft`, `lm_msgs_received.planes`
- No formal type definition
- No global state (scoped to LiveMessages page)
- No culling (memory leaked indefinitely)

### React Implementation

**Improvements**:

- ✅ Proper terminology: `MessageGroup` (with `Plane` alias for migration)
- ✅ Type-safe: Full TypeScript interface
- ✅ Global state: Shared via Zustand across pages
- ✅ Automatic culling: Two-level limit system
- ✅ Last updated tracking: Groups sorted by freshness
- ✅ Settings integration: User-configurable limits

**Breaking Changes**:

- State variable renamed: `messages` → `messageGroups`
- Type renamed: `Plane` → `MessageGroup` (alias exists)
- Component prop renamed: `plane` → `messageGroup` (legacy alias exists)

## Examples

### Example 1: Normal Operation

**Scenario**: 45 message groups, limit 50

**Behavior**:

- New message arrives
- Message added to group (or new group created)
- Total groups: 45 → 46
- No culling needed (below limit)

### Example 2: Culling Triggered

**Scenario**: 50 message groups (at limit), new message from unknown source

**Before**:

```text
Groups (sorted by lastUpdated, oldest first):
1. UAL123 (lastUpdated: 1000)
2. DAL456 (lastUpdated: 1100)
3. AAL789 (lastUpdated: 1200)
... 47 more ...
50. SWA111 (lastUpdated: 5000)
```

**New Message**: FDX999 (lastUpdated: 5100)

**After Culling**:

```text
Groups (51 total, need to remove 1):
- Remove: UAL123 (oldest, lastUpdated: 1000)
- Keep: 49 existing groups + FDX999
- Total: 50 groups
```

### Example 3: Active Group Stays

**Scenario**: UAL123 is oldest by creation time but still receiving messages

**Before Culling**:

```text
Groups:
1. UAL123 (created: 1000, lastUpdated: 5200)  ← Recently active
2. DAL456 (created: 1100, lastUpdated: 1150)  ← Old and stale
3. AAL789 (created: 1200, lastUpdated: 1250)  ← Old and stale
```

**Culling**:

- Sort by `lastUpdated` (not creation time)
- DAL456 removed (lastUpdated: 1150, oldest)
- UAL123 kept (lastUpdated: 5200, very fresh)

## Testing Scenarios

### Manual Testing

1. **Normal Operation**:
   - Set maxMessageGroups to 10
   - Wait for 10 groups to populate
   - Verify count shows 10
   - Wait for 11th group
   - Verify oldest group removed
   - Verify count still shows 10

2. **Active Group Retention**:
   - Set maxMessageGroups to 5
   - Create 5 groups
   - Keep sending messages to group #1
   - Add 5 more groups
   - Verify group #1 still present (active)
   - Verify oldest stale groups removed

3. **Settings Integration**:
   - Change maxMessageGroups to 20
   - Verify system culls at 20
   - Change to 30
   - Verify new limit applies immediately

### Automated Testing

```typescript
describe("Message Group Culling", () => {
  it("culls oldest groups when limit exceeded", () => {
    // Set limit to 3
    // Add 4 groups with different timestamps
    // Verify oldest group removed
    // Verify size = 3
  });

  it("keeps recently updated groups", () => {
    // Create 3 groups at limit
    // Update group #1 timestamp
    // Add 4th group
    // Verify group #1 still present
    // Verify oldest stale group removed
  });
});
```

## Performance Implications

### Memory Usage

**Before Culling**:

- Unbounded growth
- 100 aircraft × 50 messages = 5,000 message objects
- Memory leak over long sessions

**With Culling**:

- Bounded at `maxMessageGroups × maxMessagesPerAircraft`
- Default: 50 groups × 50 messages = 2,500 message objects max
- Stable memory usage

### CPU Usage

**Culling Cost**:

- Sorting: O(n log n) where n = number of groups
- Deletion: O(k) where k = groups to remove
- Only runs when limit exceeded
- Typical: 50 groups sorted = negligible cost

**Per-Message Cost**:

- Most messages: O(1) Map lookup/update
- Culling triggered: ~1 in 50 messages (when at limit)
- Amortized: Still very cheap

## Summary

**Critical Points**:

1. ✅ **Terminology**: Message Group (not Aircraft) - can be aircraft, station, or unknown
2. ✅ **Global State**: Shared via Zustand for Live Messages + Live Map
3. ✅ **Two-Level Culling**: Messages per group + total groups
4. ✅ **Last Updated Tracking**: Groups sorted by freshness, not creation time
5. ✅ **Accurate Counts**: Reflects actual groups in memory, not total received
6. ✅ **Future Ready**: Prepared for ADS-B integration (count = ACARS + ADS-B only)

This architecture ensures:

- Bounded memory usage
- Accurate UI counts
- Efficient operations
- Shared state for multiple pages
- Proper terminology for all message sources
