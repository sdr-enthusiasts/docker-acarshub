# ACARS Decoder Features

## Overview

The React ACARS Hub implementation includes full support for two types of message decoding:

1. **@airframes/acars-decoder** - Provides structured decoding of ACARS message text
2. **libacars** - Low-level decoder for CPDLC, frequency data, and other message types

Both decoders produce formatted output that is displayed alongside or instead of raw message text.

## Decoder Support

### 1. @airframes/acars-decoder (decodedText)

**Purpose**: Parse and structure ACARS message text into human-readable label/value pairs

**Message Structure**:

```typescript
interface DecodedText {
  decoder: {
    decodeLevel: "full" | "partial" | "none";
    name?: string;
  };
  formatted: DecodedTextItem[];
}

interface DecodedTextItem {
  label?: string; // Field name (e.g., "Flight Number")
  value?: string; // Field value (e.g., "UAL123")
  description?: string; // Additional context
  // Can contain nested items
}
```

**Display Logic**:

- Decoded text is shown with badge indicating "Full" or "Partial" decode level
- Raw text is hidden on small screens (<768px) when decoded text exists
- Recursive processing handles nested label/value structures
- Alert terms are highlighted in decoded output

**Example Output**:

```text
Decoded Text (Full):
Flight Number: UAL123
Departure: KORD
Destination: KSFO
Altitude: 35000 ft
```

### 2. libacars Decoder

**Purpose**: Decode complex ACARS message types (CPDLC, frequency info, etc.)

**Message Processing**:

1. Backend sends `libacars` field as JSON string
2. Frontend cleans and parses JSON
3. Formatted based on message type:
   - **Frequency Data**: Ground station frequency information
   - **CPDLC**: Controller-Pilot Data Link Communications
   - **Generic**: Fallback formatter for unknown types

**Supported Types**:

#### Frequency Data

```typescript
interface LibacarsFrequencyData {
  freq_data?: Array<{
    gs?: {
      name?: string;
      listening_on_freqs?: Array<{ freq: number }>;
      heard_on_freqs?: Array<{ freq: number }>;
    };
  }>;
}
```

**Example Output**:

```text
Ground Station Frequency Information:
  KORD Tower
    Listening on: 118.1 kHz, 121.9 kHz
    Heard on: 118.1 kHz
```

#### CPDLC Messages

**Example Output**:

```text
CPDLC Message:
  Msg Type: uplink
  Min Alt: 35000
  Max Alt: 37000
  Timestamp: 14:32:15 UTC
```

#### Generic Decoder

Handles any libacars data structure with recursive formatting:

- Nested objects displayed with indentation
- Arrays shown with item numbers
- Special handling for timestamp objects (hour/min/sec)
- Booleans shown as Yes/No
- null values shown as italicized "null"

## Alert Term Highlighting

**Feature**: Matched alert terms are visually highlighted in message content

**Implementation**:

- Alert terms matched by backend (case-insensitive)
- Terms highlighted with `.alert-highlight` class
- Background: semi-transparent red
- Text color: bright red
- Font weight: bold

**Example**:

```text
Message text with <mark class="alert-highlight">EMERGENCY</mark> highlighted
```

**Applies to**:

- Raw message text
- Data field
- Decoded text output

## Responsive Display

**Mobile Optimization** (<768px):

- Raw text hidden when decoded text exists (save space)
- Libacars content fully visible and scrollable
- Alert highlighting remains visible

**Desktop** (≥768px):

- Both raw and decoded text shown side-by-side
- Libacars content formatted with full indentation
- All fields visible

## Utility Functions

### `formatDecodedText(decodedText, matchedTerms?)`

- Recursively process decodedText.formatted array
- Extract label/value/description fields
- Apply alert term highlighting if matched
- Returns formatted HTML string

### `parseAndFormatLibacars(libacarsString)`

- Clean JSON string (remove escape characters, quotes)
- Parse to structured object
- Detect message type (frequency, CPDLC, generic)
- Format accordingly
- Returns formatted HTML or null on error

### `highlightMatchedText(matchedTerms, text)`

- Replace alert terms with `<mark>` tags
- Case-insensitive matching
- Preserves original text case in output
- Returns HTML string with highlights

### `loopDecodedArray(input)`

- Recursively process DecodedTextItem arrays
- Handle nested objects and arrays
- Extract label/value/description pattern
- Returns formatted text string

## Styling

**Catppuccin Color Scheme**:

- **Decoded Text**: Mauve border-left accent
- **Libacars**: Lavender border-left accent
- **Alert Highlights**: Red background with 30% opacity
- **Error Messages**: Red text on light red background

**SCSS Classes**:

- `.message-content--decoded` - Decoded text container
- `.libacars-content` - Libacars formatted output
- `.libacars-freq-data` - Frequency data specific
- `.libacars-cpdlc` - CPDLC message specific
- `.libacars-generic` - Generic decoder output
- `.alert-highlight` - Highlighted alert term
- `.message-content--hide-small` - Hidden on mobile when decoded exists

## Error Handling

**DecodedText Errors**:

- Gracefully skipped if malformed
- Falls back to showing raw text only

**Libacars Errors**:

- JSON parse errors caught and logged
- Error message displayed to user
- Console logging for debugging
- Encourages bug report submission

## Type Safety

All decoder functions are fully typed with **zero `any` usage**:

- ✅ `DecodedText` and `DecodedTextItem` interfaces
- ✅ `LibacarsData` union type
- ✅ Recursive type handling in `loopDecodedArray()`
- ✅ Type guards for message type detection
- ✅ Strict TypeScript mode compliant

## Performance

**Optimizations**:

- Memoized message cards prevent re-parsing
- Decoder functions run once per message
- HTML generation is synchronous (no async overhead)
- Efficient regex for alert term matching

**Bundle Impact**:

- Decoder utilities: ~10 KB uncompressed
- No external dependencies required
- Uses native JSON parsing

## Testing Recommendations

1. **Unit Tests**:
   - Test `loopDecodedArray()` with nested structures
   - Test `parseAndFormatLibacars()` with malformed JSON
   - Test `highlightMatchedText()` with special characters

2. **Integration Tests**:
   - Verify decoded messages render correctly
   - Test alert highlighting in various message types
   - Confirm mobile hiding logic works

3. **E2E Tests**:
   - Simulate messages with decodedText field
   - Simulate messages with libacars field
   - Verify error handling for malformed data

## Migration Notes

**From Legacy Implementation**:

The React decoder implementation is functionally **identical** to the legacy jQuery/TypeScript version:

- Same JSON cleaning logic for libacars
- Same recursive array processing for decodedText
- Same alert term highlighting approach
- Same formatting patterns and output

**Key Improvements**:

- ✅ Full TypeScript type safety (no `any`)
- ✅ Proper React component integration
- ✅ Better error handling and logging
- ✅ Responsive mobile-first design
- ✅ Catppuccin themed styling
- ✅ Accessibility improvements (semantic HTML)

## References

- **Legacy Implementation**: `acarshub-typescript/src/helpers/html_functions.ts`
- **React Implementation**: `acarshub-react/src/utils/decoderUtils.ts`
- **Type Definitions**: `acarshub-react/src/types/index.ts`
- **Component**: `acarshub-react/src/components/MessageCard.tsx`
- **Styling**: `acarshub-react/src/styles/pages/_live-messages.scss`

## Client-Side Decoding Implementation

### Architecture

The React ACARS Hub implementation performs **client-side message decoding** using the `@airframes/acars-decoder` library. This matches the legacy implementation's approach.

**Decoding Flow**:

1. Message received via Socket.IO (`acars_msg` event)
2. Message passed to `messageDecoder.decode()` in Zustand store
3. If message has `text` field, decoder attempts to decode
4. Successful decoding adds `decodedText` field to message
5. Message stored in state with decoded data
6. MessageCard component displays decoded output

**Key Differences from Backend Decoding**:

- ✅ **Pro**: No server processing overhead
- ✅ **Pro**: Immediate decoding without round-trip
- ✅ **Pro**: Can decode historical/searched messages
- ⚠️ **Con**: Larger bundle size (~120 KB additional for decoder + polyfills)
- ⚠️ **Con**: Requires Node.js polyfills for browser compatibility

### Decoder Service

**Location**: `acarshub-react/src/services/messageDecoder.ts`

**Singleton Pattern**:

```typescript
import { messageDecoder } from "../services/messageDecoder";

// Decode a message
const decodedMessage = messageDecoder.decode(message);
```

**Features**:

- Singleton instance (shared across app)
- Type-safe wrapper around `@airframes/acars-decoder`
- Error handling with console logging
- Returns original message if decoding fails
- Only adds `decodedText` if `decoded === true`

### Integration Points

**Zustand Store** (`useAppStore.ts`):

```typescript
addMessage: (message) =>
  set((state) => {
    // Decode the message if it has text
    const decodedMessage = messageDecoder.decode(message);

    // ... rest of message processing
  });
```

**MessageCard Component**:

- Displays decoded output if `message.decodedText` exists
- Falls back to raw text if decoding failed
- Applies alert highlighting to decoded output

### Node.js Polyfills

The `@airframes/acars-decoder` library uses Node.js modules that require polyfills for browser usage.

**Vite Configuration** (`vite.config.ts`):

```typescript
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ["events", "stream", "string_decoder", "buffer", "util"],
      globals: {
        Buffer: true,
        process: true,
      },
    }),
  ],
});
```

**Required Polyfills**:

- `events` - EventEmitter (used by streaming decoders)
- `stream` - Node.js streams
- `string_decoder` - String decoding utilities
- `buffer` - Buffer global
- `util` - Utility functions

**Bundle Impact**:

- Base bundle: ~676 KB (212 KB gzipped)
- With decoder: ~1,084 KB (335 KB gzipped)
- Delta: +408 KB (+123 KB gzipped)

### Type Definitions

The `@airframes/acars-decoder` library exports proper TypeScript types:

**Library Types** (from `@airframes/acars-decoder`):

```typescript
interface Message {
  label?: string;
  sublabel?: string;
  text: string; // Required
}

interface DecodeResult {
  decoded: boolean;
  decoder: {
    name: string;
    type: "pattern-match" | "none";
    decodeLevel: "none" | "partial" | "full";
  };
  formatted: {
    description: string;
    items: {
      type: string;
      code: string;
      label: string;
      value: string;
    }[];
  };
  remaining: { text?: string };
}
```

**Our Types** (`acarshub-react/src/types/index.ts`):

```typescript
export interface DecodedTextItem {
  type: string;
  code: string;
  label: string;
  value: string;
}

export interface DecodedText {
  decoder: {
    decodeLevel: "full" | "partial" | "none";
    name?: string;
  };
  formatted: DecodedTextItem[];
}
```

### Migration from Legacy

**Legacy Implementation** (`acarshub-typescript`):

```typescript
const { MessageDecoder } = require("@airframes/acars-decoder");

class LiveMessagePage {
  #lm_md = new MessageDecoder();

  new_acars_message(html_msg) {
    if ("text" in new_msg) {
      try {
        const decoded_msg = this.#lm_md.decode(new_msg);
        if (decoded_msg.decoded === true) {
          new_msg.decodedText = decoded_msg;
        }
      } catch (e) {
        console.error(`Decoder Error: ${e}`);
      }
    }
  }
}
```

**React Implementation**:

```typescript
import { messageDecoder } from "../services/messageDecoder";

// In Zustand store
addMessage: (message) => {
  const decodedMessage = messageDecoder.decode(message);
  // ... store decoded message
};
```

**Key Improvements**:

- ✅ TypeScript type safety throughout
- ✅ Proper ES module imports (not `require`)
- ✅ Centralized decoder service
- ✅ Cleaner error handling
- ✅ Singleton pattern for efficiency

### Future Optimizations

**Code Splitting**:
The decoder could be lazily loaded to reduce initial bundle size:

```typescript
// Lazy load decoder
const decoder = await import("./services/messageDecoder");
const decodedMessage = decoder.messageDecoder.decode(message);
```

**Web Worker**:
Decoding could be offloaded to a Web Worker for better performance:

```typescript
// worker.ts
import { messageDecoder } from "./services/messageDecoder";

self.onmessage = (e) => {
  const decoded = messageDecoder.decode(e.data);
  self.postMessage(decoded);
};
```

**Selective Decoding**:
Only decode messages that will be displayed (skip filtered messages):

```typescript
// Only decode if message passes filters
if (shouldDisplayMessage(message)) {
  message = messageDecoder.decode(message);
}
```

These optimizations are **not currently implemented** but could be added if performance becomes an issue.

## Duplicate Detection and Multi-Part Message Handling

### Overviews

The React ACARS Hub implements sophisticated duplicate detection and multi-part message merging, matching the legacy implementation's behavior exactly.

### Duplicate Detection Strategies

#### 1. Full Field Match

**Method**: `checkForDuplicate(existingMessage, newMessage)`

Compares all monitored fields between messages:

- `text`, `data`, `libacars`
- `dsta`, `depa`, `eta`
- `gtout`, `gtin`, `wloff`, `wlin`
- `lat`, `lon`, `alt`

**Logic**:

- Both fields `undefined`/`null` = Match ✓
- Both fields have same value = Match ✓
- One field `undefined`, other has value = No match ✗

**Action on Duplicate**:

- Update timestamp to newest message
- Increment `duplicates` counter (e.g., "1", "2", "3")
- Move message to front of aircraft's message list
- Do **not** add new message

#### 2. Text Field Match

**Check**: `existingMsg.text === newMsg.text`

**Action on Duplicate**:

- Same as full field match
- Update timestamp, increment counter, move to front

#### 3. Multi-Part Message Detection

**Method**: `isMultiPartMessage(existingMessage, newMessage)`

**Criteria** (all must be true):

1. Same `station_id` (keep ACARS/VDLM separate)
2. Timestamp difference < 8 seconds
3. Both messages have `msgno` field
4. Message numbers match pattern:
   - **AzzA pattern**: `A00A`, `A01A`, `A02A` (chars 0 and 3 match)
   - **AAAz pattern**: `AAA1`, `AAA2`, `AAA3` (first 3 chars match)

**Action on Multi-Part Match**:

1. Check if this specific part already exists
2. If exists: update `msgno_parts` with duplicate counter
3. If new: merge text fields and update `msgno_parts`
4. Re-decode merged text with ACARS decoder
5. Move message to front

### Multi-Part Message Merging

#### Duplicate Part Handling

**Method**: `checkMultiPartDuplicate(msgno_parts, msgno)`

**Input**: `msgno_parts = "M01A M02A M03A"`, `msgno = "M02A"`

**Output**:

```typescript
{
  exists: true,
  updatedParts: "M01A M02Ax2 M03A"  // Incremented duplicate counter
}
```

**Subsequent duplicate**:

```typescript
// Input: msgno_parts = "M01A M02Ax2 M03A", msgno = "M02A"
// Output: updatedParts = "M01A M02Ax3 M03A"
```

#### Text Merging

**Method**: `mergeMultiPartMessage(existingMessage, newMessage, decoder)`

**Logic**:

1. **Both have text**: `existingMsg.text += newMsg.text` (append)
2. **Only new has text**: `existingMsg.text = newMsg.text` (set)
3. **Update `msgno_parts`**:
   - First multi-part: `msgno_parts = "M01A M02A"`
   - Additional parts: `msgno_parts += " M03A"`

**Re-decoding**:
After merging text, the combined text is re-decoded:

```typescript
const decoded = decoder.decode(updated);
if (decoded.decodedText) {
  updated.decodedText = decoded.decodedText;
}
```

This ensures the decoded output reflects the **complete merged message**, not just individual parts.

### Implementation in Store

**Location**: `acarshub-react/src/store/useAppStore.ts` - `addMessage` function

**Flow**:

1. Decode incoming message
2. Find matching aircraft
3. Loop through existing messages for that aircraft
4. Check for duplicates (full field, then text)
5. Check for multi-part messages
6. If duplicate/multi-part: update existing message
7. If new: add to message list
8. Move updated message to front
9. Update plane state with new message list

### Examples

#### Example 1: Full Duplicate

```typescript
// Existing message
{
  uid: "msg1",
  text: "Position report",
  lat: 40.7128,
  lon: -74.0060,
  duplicates: "1",
  timestamp: 1234567890
}

// New message (duplicate)
{
  uid: "msg2",
  text: "Position report",
  lat: 40.7128,
  lon: -74.0060,
  timestamp: 1234567895
}

// Result: Update existing message
{
  uid: "msg1",
  text: "Position report",
  lat: 40.7128,
  lon: -74.0060,
  duplicates: "2",  // Incremented
  timestamp: 1234567895  // Updated
}
// msg2 is NOT added to list
```

#### Example 2: Multi-Part Message

```typescript
// Existing message
{
  uid: "msg1",
  msgno: "M01A",
  text: "Part 1 text",
  station_id: "STATION1",
  timestamp: 1234567890
}

// New message (part 2)
{
  uid: "msg2",
  msgno: "M02A",
  text: " Part 2 text",
  station_id: "STATION1",
  timestamp: 1234567892
}

// Result: Merged message
{
  uid: "msg1",
  msgno: "M01A",
  text: "Part 1 text Part 2 text",  // Merged
  msgno_parts: "M01A M02A",  // Added
  station_id: "STATION1",
  timestamp: 1234567892,  // Updated
  decodedText: { /* re-decoded from merged text */ }
}
// msg2 is NOT added to list
```

#### Example 3: Multi-Part Duplicate

```typescript
// Existing message with parts
{
  uid: "msg1",
  msgno: "M01A",
  text: "Part 1 text Part 2 text",
  msgno_parts: "M01A M02A",
  timestamp: 1234567892
}

// New message (duplicate of part 2)
{
  uid: "msg3",
  msgno: "M02A",
  text: " Part 2 text",
  station_id: "STATION1",
  timestamp: 1234567893
}

// Result: Updated duplicate counter
{
  uid: "msg1",
  msgno: "M01A",
  text: "Part 1 text Part 2 text",  // Not changed
  msgno_parts: "M01A M02Ax2",  // Duplicate counter added
  timestamp: 1234567893  // Updated
}
// msg3 is NOT added to list
```

### Display in UI

The `MessageCard` component displays duplicate and multi-part information:

**Duplicates**:

```tsx
{
  message.duplicates && (
    <div className="message-field">
      <dt>Duplicate(s) Received</dt>
      <dd>{message.duplicates}</dd>
    </div>
  );
}
```

**Multi-Part**:

```tsx
{
  message.msgno_parts && (
    <div className="message-field">
      <dt>Message Parts</dt>
      <dd>{message.msgno_parts}</dd>
    </div>
  );
}
```

### Benefits

1. **Reduces clutter**: Duplicate messages don't create new entries
2. **Better readability**: Multi-part messages merged into single view
3. **Preserves history**: Duplicate counters and part lists maintained
4. **Accurate decoding**: Re-decoding merged text produces correct output
5. **Performance**: Fewer message objects in state

### Edge Cases Handled

1. **Out-of-order parts**: Messages can arrive in any order (timestamp check handles this)
2. **Mixed duplicates**: Same part can be received multiple times (duplicate counter tracks)
3. **Incomplete sequences**: Missing parts don't break merging (each part tracked individually)
4. **Station separation**: ACARS and VDLM messages kept separate (station_id check)
5. **Time gaps**: Messages >8 seconds apart not merged (prevents false positives)

### More Migration from Legacy

The React implementation is **functionally identical** to the legacy implementation:

**Legacy** (`live_messages.ts` lines 689-887):

- Full field duplicate check ✓
- Text field duplicate check ✓
- Multi-part message detection (AzzA, AAAz patterns) ✓
- Multi-part duplicate tracking with counters ✓
- Text merging and re-decoding ✓
- Message promotion to front of list ✓

**React**:

- All logic extracted into reusable functions
- Type-safe throughout (no `any` usage)
- Clearer separation of concerns
- Easier to test and maintain
- Same behavior, better code quality

### More Testing Recommendations

1. **Unit Tests**:
   - Test `checkForDuplicate()` with various field combinations
   - Test `isMultiPartMessage()` with AzzA and AAAz patterns
   - Test `checkMultiPartDuplicate()` with counter increments
   - Test `mergeMultiPartMessage()` text concatenation

2. **Integration Tests**:
   - Send duplicate messages, verify counter increments
   - Send multi-part sequence, verify merging
   - Send out-of-order parts, verify correct merging
   - Send duplicate parts, verify duplicate counter

3. **E2E Tests**:
   - Verify UI displays duplicate counter
   - Verify UI displays message parts
   - Verify merged text shows in message card
   - Verify re-decoded text updates correctly
