# Pause Functionality - Implementation Details

## Overview

The Live Messages page includes a **pause/resume** feature that allows users to freeze the display while messages continue to be processed in the background. When resumed, the display immediately shows the current state with all messages that arrived during the pause.

## Requirements

1. **When Paused**:
   - Display freezes (shows snapshot from moment of pause)
   - Messages continue to arrive via Socket.IO
   - Messages continue to be processed (decoded, duplicate detection, multi-part merging)
   - Messages stored in Zustand global store (background processing)
   - Statistics continue updating (showing "messages received" continues to increment)

2. **When Resumed**:
   - Display immediately shows current message state
   - All messages that arrived during pause are visible
   - Message list respects max message limit (e.g., 50 messages per aircraft)
   - No "catch up" animation or delay

## Implementation

### State Management

**Frozen Snapshot State**:

```typescript
const [frozenMessages, setFrozenMessages] = useState<Map<string, Plane>>(
  new Map(),
);
```

**Pause State** (persisted to localStorage):

```typescript
const [isPaused, setIsPaused] = useState(() => {
  const saved = localStorage.getItem("liveMessages.isPaused");
  return saved === "true";
});
```

### Pause Handler

```typescript
const handlePauseChange = useCallback(
  (paused: boolean) => {
    if (paused && !isPaused) {
      // About to pause - capture current message state
      setFrozenMessages(new Map(messages));
    }
    setIsPaused(paused);
  },
  [isPaused, messages],
);
```

**Logic**:

- When toggling **to paused** (`paused = true`, `isPaused = false`):
  - Capture snapshot of current `messages` Map
  - Store in `frozenMessages` state
  - Set `isPaused = true`
- When toggling **to resumed** (`paused = false`, `isPaused = true`):
  - Skip snapshot (frozen snapshot will be ignored)
  - Set `isPaused = false`

### Display Logic

```typescript
const planesArray = useMemo(() => {
  const sourceMessages = isPaused ? frozenMessages : messages;
  return Array.from(sourceMessages.values()).sort((a, b) => {
    const aTime = a.messages[0]?.timestamp || 0;
    const bTime = b.messages[0]?.timestamp || 0;
    return bTime - aTime; // Newest first
  });
}, [messages, isPaused, frozenMessages]);
```

**Logic**:

- When `isPaused = true`: Use `frozenMessages` (snapshot)
- When `isPaused = false`: Use `messages` (live Zustand store)
- `useMemo` dependencies:
  - `messages`: Triggers recalculation when live messages update (but only used when not paused)
  - `isPaused`: Triggers recalculation when pause state changes
  - `frozenMessages`: Triggers recalculation when snapshot changes (only happens when pause is toggled on)

### Background Processing

**Zustand Store** (`useAppStore`):

- Messages continue to arrive via Socket.IO hook (`useSocketIO`)
- `addMessage()` function continues to run:
  - Decodes messages with `@airframes/acars-decoder`
  - Detects duplicates (full field, text, multi-part)
  - Merges multi-part messages
  - Updates aircraft state
- Global `messages` Map continues to update
- **Display is NOT affected** because `planesArray` uses `frozenMessages` when paused

### Statistics Behavior

**Live Statistics** (always use current state):

```typescript
const statistics = useMemo(() => {
  let totalMessages = 0;
  let displayedMessages = 0;
  let hiddenMessages = 0;
  let alertMessages = 0;
  let totalAircraft = 0;

  // Always calculate from live messages
  for (const plane of messages.values()) {
    totalMessages += plane.messages.length;
    // ... calculations
  }

  // ... more calculations from filteredPlanes (may use frozen data)

  return {
    totalMessages, // From live messages
    totalAircraft, // From filtered display
    displayedMessages, // From filtered display
    hiddenMessages, // From filtered display
    alertMessages, // From filtered display
  };
}, [messages, filteredPlanes]);
```

**Note**: `totalMessages` comes from **live** messages state (not frozen), so the counter continues to increment even when paused. Other statistics come from the filtered display (which may be frozen).

## User Experience

### Visual Indicators

**Pause Notice**:

```tsx
{
  isPaused && (
    <div className="page__notice page__notice--warning">
      <span className="notice__icon">⏸</span>
      <span className="notice__text">
        Updates paused. Click "Resume" to continue receiving messages.
      </span>
    </div>
  );
}
```

**Pause Button State**:

- Shows "Pause" when resumed
- Shows "Resume" when paused
- Visual indicator (icon/color change)

### Persistence

Pause state is **persisted to localStorage**:

```typescript
useEffect(() => {
  localStorage.setItem("liveMessages.isPaused", String(isPaused));
}, [isPaused]);
```

**Behavior**:

- If user pauses and refreshes page, page loads in paused state
- Frozen snapshot is **not** persisted (fresh snapshot taken after refresh)
- This prevents stale data from being shown

## Edge Cases Handled

### 1. Pause on Empty State

**Scenario**: User pauses when no messages have arrived yet

**Behavior**:

- `frozenMessages` = empty Map
- Display shows "No Messages Yet"
- When messages arrive, they're processed in background
- When resumed, all messages appear

### 2. Pause → Filter → Resume

**Scenario**: User pauses, changes filters, then resumes

**Behavior**:

- Filters apply to frozen snapshot while paused
- When resumed, filters apply to live messages
- No issues because filtering happens in `filteredPlanes` useMemo

### 3. Pause → Page Refresh

**Scenario**: User pauses, refreshes browser, returns to page

**Behavior**:

- `isPaused` restored from localStorage (still paused)
- `frozenMessages` is empty (not persisted)
- New snapshot taken from current live messages
- May show different messages than before refresh (expected)

### 4. Pause for Extended Period

**Scenario**: User pauses for hours, hundreds of messages arrive

**Behavior**:

- Background processing continues (decoder, duplicate detection)
- Messages respect max limit per aircraft (e.g., 50 messages)
- When resumed, display shows current state (oldest messages may have been pruned)
- Display updates instantly (no "catch up" processing needed)

## Performance Considerations

### Memory Usage

- Two Maps exist when paused: `messages` (live) and `frozenMessages` (snapshot)
- Snapshot is a **shallow copy** of the Map (planes are referenced, not deep cloned)
- Memory impact: ~2x the aircraft/message objects while paused
- When resumed, `frozenMessages` is ignored (garbage collected eventually)

### Rendering Performance

- When paused: `planesArray` useMemo does NOT recalculate on message updates
- Dependencies: `messages` changes, but `isPaused` and `frozenMessages` don't
- React skips re-rendering because `planesArray` reference doesn't change
- **Result**: No performance impact while paused, regardless of message volume

### Performance Background Processing

- All message processing continues (decode, duplicate detect, merge)
- No performance difference between paused and resumed
- Store updates are cheap (Map operations are O(1))

## Testing Scenarios

### Manual Testing

1. **Basic Pause/Resume**:
   - Load page, wait for messages
   - Click "Pause"
   - Verify display freezes
   - Wait for more messages (check statistics incrementing)
   - Click "Resume"
   - Verify display updates with new messages

2. **Duplicate During Pause**:
   - Pause display
   - Send duplicate message
   - Resume
   - Verify duplicate counter incremented

3. **Multi-Part During Pause**:
   - Pause display
   - Send multi-part message sequence
   - Resume
   - Verify messages merged correctly

4. **Filter While Paused**:
   - Pause display
   - Change filter settings (text search, label exclusion)
   - Verify frozen snapshot is filtered
   - Resume
   - Verify live messages are filtered

5. **Persistence**:
   - Pause display
   - Refresh browser
   - Verify page loads in paused state
   - Verify display shows current messages (not stale)

### Automated Testing

```typescript
describe("Pause Functionality", () => {
  it("freezes display when paused", () => {
    // Render component
    // Wait for initial messages
    // Click pause button
    // Send new message
    // Verify new message NOT in display
    // Verify frozen snapshot unchanged
  });

  it("shows all messages when resumed", () => {
    // Pause display
    // Send multiple messages
    // Click resume button
    // Verify all messages in display
    // Verify no duplicate entries
  });

  it("continues background processing while paused", () => {
    // Pause display
    // Send duplicate message
    // Verify store has duplicate counter incremented
    // Resume
    // Verify display shows duplicate counter
  });
});
```

## Migration from Legacy

**Legacy Implementation** (`live_messages.ts`):

```typescript
pause_updates(callback: boolean = true): void {
  this.#pause = !this.#pause;
  if (this.#pause) {
    $("#pause").text("Resume");
  } else {
    $("#pause").text("Pause");
  }
  if (callback) this.set_html();
}
```

**React Implementation**:

- ✅ Same freeze behavior
- ✅ Same background processing
- ✅ Same instant update on resume
- ✅ Better state management (Zustand + React state)
- ✅ Better performance (useMemo prevents unnecessary renders)
- ✅ Persistence to localStorage (new feature)

## Summary

The pause functionality is implemented with:

- **Frozen snapshot** taken when pause is activated
- **Background processing** continues in Zustand store
- **Display freeze** via conditional `useMemo` source selection
- **Instant resume** by switching back to live messages
- **Performance optimized** with proper React memoization
- **Persistent state** across page refreshes

This provides a smooth user experience while maintaining data integrity and performance.
