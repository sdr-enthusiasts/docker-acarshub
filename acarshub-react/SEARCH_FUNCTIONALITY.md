# Search Functionality - Live Messages

## Overview

The Live Messages page includes a comprehensive text search feature that filters messages in real-time. The search functionality is designed to be intuitive, performant, and thorough - searching across nearly all message fields.

## How It Works

### User Interface

1. **Search Input**: Located in the filter toolbar at the top of the Live Messages page
2. **Search Activation**: User types search text and presses Enter (
   or clicks away from the input)
3. **Clear Button**: X button appears when search text is present, clears search instantly
4. **Live Filtering**: Once activated, search filters messages in real-time as new messages arrive

### Search Behavior

Unlike the **Pause** button (which freezes the entire display), the search feature applies a **live filter**:

- **Search Active + Matching Message Arrives** → Message appears immediately
- **Search Active + Non-Matching Message Arrives** → Message is hidden (not shown)
- **Search Cleared** → All messages reappear (returns to unfiltered view)

This means:

- Background processing continues (decoding, duplicate detection, etc.)
- Statistics continue updating (total messages received)
- Only the **display** is filtered - matching messages appear, non-matching are hidden
- When search is cleared, all messages that arrived during the search are instantly visible

### Message Group Filtering

The search intelligently handles message groups (aircraft/stations with multiple messages):

1. **Identifier Match**: If any identifier (flight, tail, ICAO) matches, **all messages** for that group are shown
2. **Message-Level Match**: If identifier doesn't match, search filters **individual messages** within the group
3. **Group Exclusion**: If no messages in a group match, the entire group is hidden

**Example**:

- User searches "AAL123"
- Aircraft AAL123 has 5 messages (only 2 contain "AAL123" in the text)
- **Result**: All 5 messages shown (because identifier matched)

**Example 2**:

- User searches "BOARDING"
- Aircraft UAL456 has 5 messages:
  - Message 1: "BOARDING COMPLETE" ✓ matches
  - Message 2: "TAXI TO RUNWAY 27" ✗ doesn't match
  - Message 3: "READY FOR DEPARTURE" ✗ doesn't match
  - Message 4: "GATE BOARDING" ✓ matches
  - Message 5: "DEPARTURE" ✗ doesn't match
- **Result**: Only messages 1 and 4 shown (message-level filtering)

## Searchable Fields

The search is **comprehensive** and checks nearly every field in the ACARS message:

### Message Content

- `text` - Primary message text
- `data` - Raw data field
- `decoded_msg` - Decoded message text
- `libacars` - Libacars JSON data (as string)

### Identifiers

- `tail` - Aircraft registration
- `flight` - Flight number/callsign (original format)
- `icao_flight` - ICAO flight identifier (normalized ICAO format, e.g., "UAL123")
- `iata_flight` - IATA flight identifier (normalized IATA format, e.g., "UA123")
- `airline` - Airline name (e.g., "United Airlines")
- `flight_number` - Flight number only (e.g., "123")
- `icao` - ICAO address (numeric)
- `icao_hex` - ICAO address (hex string)

### Message Metadata

- `label` - Message label (e.g., "H1", "5Z")
- `label_type` - Label type description
- `toaddr` - Destination address
- `toaddr_decoded` - Decoded destination address
- `toaddr_hex` - Destination address (hex)
- `fromaddr` - Source address
- `fromaddr_decoded` - Decoded source address
- `fromaddr_hex` - Source address (hex)
- `msgno` - Message number
- `msgno_parts` - Multi-part message tracking
- `ack` - Acknowledgment field
- `mode` - Message mode
- `block_id` - Block identifier
- `message_type` - Type of message
- `freq` - Frequency (numeric)
- `level` - Signal level (numeric)

### Flight Information

- `depa` - Departure airport
- `dsta` - Destination airport
- `eta` - Estimated time of arrival
- `gtout` - Gate out time
- `gtin` - Gate in time
- `wloff` - Wheels off time
- `wlin` - Wheels on time
- `lat` - Latitude (numeric)
- `lon` - Longitude (numeric)
- `alt` - Altitude (numeric)

### Message Group Identifiers

- All identifiers in `group.identifiers[]` array

## Technical Implementation

### Type Safety

- String fields use `fieldMatches()` helper (null-safe, case-insensitive)
- Numeric fields use `numberMatches()` helper (converts to string, then searches)
- All field accesses use optional chaining (`?.`) to handle undefined/null safely

### Performance

- Search uses `useMemo` to avoid unnecessary re-filtering
- Only re-filters when:
  - Search text changes
  - Message groups update
  - Other filters change (excludedLabels, filterNoText, showAlertsOnly)
- Message group filtering happens in a single pass (O(n) messages)

### Filter Order

Filters are applied in this order for optimal performance:

1. **Alerts Only** - Filter groups with alerts (if enabled)
2. **Text Search** - Filter messages by search text (most selective)
3. **Excluded Labels** - Remove messages with excluded labels
4. **No Text Filter** - Remove messages without text content

### Edge Cases Handled

- **Empty Search**: Treated as no filter (shows all messages)
- **Whitespace Only**: Trimmed and treated as empty
- **Case Insensitive**: All searches are case-insensitive
- **Null/Undefined Fields**: Safely handled with type checking
- **Non-String Values**: Type-checked before string operations to prevent errors
- **Numeric Fields**: Converted to strings for searching
- **Special Characters**: No escaping needed (simple substring match)
- **station_id Excluded**: Not searchable because it matches all messages from the same ground station

## Integration with Other Features

### Pause Button

- Search and Pause are **independent** features
- Can be used together:
  - Pause + Search = Frozen snapshot of matching messages only
  - Resume + Search = Live filtering of matching messages
- Pause takes precedence for display source (frozen vs live)

### Excluded Labels Filter

- Works together with search
- Both filters applied simultaneously
- Search first, then label exclusion

### Hide No-Text Filter

- Works together with search
- Both filters applied simultaneously
- Search first, then no-text filter

### Alerts Only Filter

- Works together with search
- Applied before search (more efficient)
- Shows only groups with alerts, then applies search

## Keyboard Shortcuts

- **Enter**: Activate search (submit current text)
- **Escape**: Focus remains in input (browser default)
- **Click X**: Clear search and restore all messages

## Persistence

- Search text is **not persisted** to localStorage (intentional)
- Search resets to empty on page refresh
- Other filter settings (pause, excludedLabels, filterNoText) are persisted

## Future Enhancements

Potential improvements for future versions:

1. **Regular Expression Support**: Allow regex patterns for advanced searches
2. **Field-Specific Search**: Syntax like `tail:N12345` or `label:H1`
3. **Search History**: Dropdown of recent searches
4. **Highlight Matches**: Highlight matching text within messages
5. **Case-Sensitive Option**: Toggle for case-sensitive searches
6. **Search Persistence**: Option to save search to localStorage
7. **Search Suggestions**: Auto-complete based on common values
8. **Performance**: Virtual scrolling for very large result sets

## Comparison with Legacy Frontend

**Legacy Frontend**: Did not have a text search feature

**React Migration**: New feature added with comprehensive field coverage and intelligent message group filtering

---

**Last Updated**: 2026-02-01
**Related Documentation**:

- `PAUSE_FUNCTIONALITY.md` - Pause/resume behavior
- `MESSAGE_GROUPS_AND_CULLING.md` - Message group architecture
- `DECODER_FEATURES.md` - Decoder and message field details
