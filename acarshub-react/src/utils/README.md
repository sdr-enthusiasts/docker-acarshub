# Utility Functions Documentation

This directory contains utility functions organized by category. All utilities are:

- **Fully typed** with TypeScript strict mode
- **Zero `any` usage** - proper type safety throughout
- **Tree-shakeable** - import only what you need
- **Well-documented** - JSDoc comments on all functions
- **Tested** - passes all Biome and TypeScript checks

## Importing Utilities

You can import from the barrel export or individual modules:

```typescript
// From barrel export (recommended)
import { formatTimestamp, ensureHexFormat, groupBy } from "@/utils";

// From individual modules (for better tree-shaking)
import { formatTimestamp } from "@/utils/dateUtils";
import { ensureHexFormat } from "@/utils/stringUtils";
import { groupBy } from "@/utils/arrayUtils";
```

## Module Overview

### Date Utilities (`dateUtils.ts`)

Functions for date/time formatting and manipulation:

- `prefers24HourClock()` - Detects user's time format preference
- `formatTimestamp(timestamp)` - Full date/time formatting
- `formatDate(timestamp)` - Date only formatting
- `formatTime(timestamp)` - Time only formatting
- `formatRelativeTime(timestamp)` - "2 minutes ago" style
- `formatDuration(seconds)` - "2h 34m 12s" style
- `isWithinLastMinutes(timestamp, minutes)` - Time range checking
- `unixToMs(unixTimestamp)` - Unix seconds to milliseconds
- `msToUnix(ms)` - Milliseconds to Unix seconds

**Example:**

```typescript
import { formatTimestamp, formatRelativeTime } from "@/utils";

const message = {
  timestamp: 1704067200000,
  // ...
};

console.log(formatTimestamp(message.timestamp));
// "Mon, Jan 1, 2024, 12:00:00 AM"

console.log(formatRelativeTime(message.timestamp));
// "5 minutes ago"
```

### String Utilities (`stringUtils.ts`)

Functions for string manipulation and formatting:

**Formatting:**

- `ensureHexFormat(hex)` - Uppercase and pad hex to 6 chars
- `truncate(str, maxLength)` - Truncate with ellipsis
- `capitalize(str)` - First letter uppercase
- `titleCase(str)` - Title Case Each Word
- `pad(str, length, char, position)` - Pad strings

**Safety:**

- `escapeHtml(str)` - Prevent XSS attacks
- `stripHtml(str)` - Remove HTML tags
- `escapeRegex(str)` - Escape regex special chars

**Case Conversion:**

- `toKebabCase(str)` - "kebab-case"
- `toCamelCase(str)` - "camelCase"
- `toPascalCase(str)` - "PascalCase"

**Validation:**

- `isBlank(str)` - Check for empty/whitespace
- `removeWhitespace(str)` - Remove all whitespace
- `normalizeWhitespace(str)` - Collapse multiple spaces

**Search/Highlight:**

- `highlightText(text, searchTerm)` - Mark search matches
- `slugify(str)` - Create URL-safe slugs

**Formatting:**

- `formatNumber(num)` - "1,234,567"
- `formatBytes(bytes)` - "1.23 MB"
- `pluralize(count, singular, plural)` - "1 message" / "2 messages"
- `getInitials(name, max)` - "FC" from "Frederick Clausen"

**Utilities:**

- `randomString(length, charset)` - Generate random strings

**Example:**

```typescript
import { ensureHexFormat, formatBytes, truncate } from "@/utils";

const icao = "a1b2c3";
console.log(ensureHexFormat(icao)); // "A1B2C3"

const dbSize = 1536000;
console.log(formatBytes(dbSize)); // "1.46 MB"

const longText = "This is a very long message that needs truncation";
console.log(truncate(longText, 30)); // "This is a very long mess..."
```

### Array & Object Utilities (`arrayUtils.ts`)

Functions for data manipulation and transformation:

**Array Grouping & Organization:**

- `groupBy(array, key)` - Group by property
- `unique(array, key?)` - Remove duplicates
- `sortBy(array, key, direction)` - Sort by property
- `chunk(array, size)` - Split into chunks

**Array Flattening:**

- `flatten(array)` - Flatten one level
- `flattenDeep(array)` - Deeply flatten nested arrays

**Set Operations:**

- `intersection(arr1, arr2)` - Common elements
- `difference(arr1, arr2)` - Elements in first only
- `union(arr1, arr2)` - All unique elements

**Array Manipulation:**

- `shuffle(array)` - Random shuffle
- `take(array, n)` - First n items
- `drop(array, n)` - Skip first n items
- `compact(array)` - Remove falsy values
- `pluck(array, key)` - Extract property values

**Math Operations:**

- `min(array)` - Minimum value
- `max(array)` - Maximum value
- `sum(array)` - Sum all numbers
- `average(array)` - Calculate average
- `countBy(array)` - Count occurrences

**Object Utilities:**

- `deepClone(obj)` - Deep copy objects
- `deepMerge(target, source)` - Deep merge objects
- `pick(obj, keys)` - Select specific keys
- `omit(obj, keys)` - Exclude specific keys
- `deepEqual(a, b)` - Deep equality check
- `isEmpty(obj)` - Check if empty
- `get(obj, path, default)` - Safe nested access
- `set(obj, path, value)` - Set nested value

**Example:**

```typescript
import { groupBy, sortBy, pluck } from "@/utils";

const messages = [
  { tail: "N12345", flight: "AA100", timestamp: 1000 },
  { tail: "N12345", flight: "AA101", timestamp: 2000 },
  { tail: "N67890", flight: "UA200", timestamp: 1500 },
];

// Group messages by tail number
const byTail = groupBy(messages, "tail");
// { "N12345": [...], "N67890": [...] }

// Sort by timestamp descending
const sorted = sortBy(messages, "timestamp", "desc");

// Extract all flight numbers
const flights = pluck(messages, "flight");
// ["AA100", "AA101", "UA200"]
```

### Validation Utilities (`validationUtils.ts`)

Type guards, validators, and sanitization:

**Type Guards:**

- `isString(value)` - Type guard for strings
- `isNumber(value)` - Type guard for numbers
- `isBoolean(value)` - Type guard for booleans
- `isObject(value)` - Type guard for objects
- `isArray(value)` - Type guard for arrays
- `isFunction(value)` - Type guard for functions
- `isDate(value)` - Type guard for Date objects
- `isDefined(value)` - Not null/undefined
- `isNullOrUndefined(value)` - Check for null/undefined

**Format Validators:**

- `isValidEmail(email)` - Email format
- `isValidUrl(url)` - URL format
- `isValidHexColor(color)` - Hex color format
- `isValidIcao(icao)` - ICAO hex code (6 chars)
- `isValidFrequency(freq)` - Radio frequency
- `isValidLatitude(lat)` - Latitude (-90 to 90)
- `isValidLongitude(lon)` - Longitude (-180 to 180)
- `isValidCoordinates(lat, lon)` - Both coordinates

**Aviation-Specific:**

- `isValidFlightNumber(flight)` - "AA100" format
- `isValidTailNumber(tail)` - Registration format
- `isValidAirportCode(airport)` - 3 or 4 letters

**Value Checks:**

- `isPositive(value)` - Positive number
- `isNegative(value)` - Negative number
- `isZero(value)` - Exactly zero
- `isInteger(value)` - Integer check
- `isInRange(value, min, max)` - Range check
- `isLengthInRange(str, min, max)` - String length range

**String Pattern Checks:**

- `isAlphanumeric(str)` - Only letters and numbers
- `isAlphabetic(str)` - Only letters
- `isNumeric(str)` - Only numbers
- `matches(str, pattern)` - Regex or string match

**Empty Checks:**

- `isEmptyString(str)` - Empty or whitespace only
- `isEmptyArray(array)` - Array with no items
- `isEmptyObject(obj)` - Object with no properties
- `isRequired(value)` - Has a value (not empty/null/undefined)

**Security:**

- `sanitizeInput(input)` - Prevent XSS

**Validation Helpers:**

- `validateAll(validations)` - Run multiple validations
- `minLength(n)` - Create min length validator
- `maxLength(n)` - Create max length validator
- `required(message?)` - Create required validator

**Example:**

```typescript
import {
  isValidIcao,
  isValidFrequency,
  isValidCoordinates,
  sanitizeInput,
} from "@/utils";

// Validate ACARS message data
const icao = "A1B2C3";
if (isValidIcao(icao)) {
  // Process ICAO
}

const freq = 131.55;
if (isValidFrequency(freq)) {
  // Process frequency
}

// Validate position data
const lat = 40.7128;
const lon = -74.006;
if (isValidCoordinates(lat, lon)) {
  // Show on map
}

// Sanitize user input before display
const userInput = '<script>alert("xss")</script>';
const safe = sanitizeInput(userInput);
// Safe to render: &lt;script&gt;alert("xss")&lt;/script&gt;
```

## Best Practices

### 1. Always Use Type Guards for Unknown Data

```typescript
import { isNumber, isDefined } from "@/utils";

function processAltitude(alt: unknown) {
  if (!isDefined(alt)) return null;
  if (!isNumber(alt)) return null;
  return Math.round(alt);
}
```

### 2. Validate External Data

```typescript
import { isValidIcao, isValidFrequency } from "@/utils";

function handleSocketMessage(data: unknown) {
  if (isObject(data) && isValidIcao(data.icao) && isValidFrequency(data.freq)) {
    // Safe to process
  }
}
```

### 3. Use Proper Date Formatting

```typescript
import { formatTimestamp, prefers24HourClock } from "@/utils";

// Let the utility handle locale detection
const displayTime = formatTimestamp(message.timestamp);

// Check user preference if needed
if (prefers24HourClock()) {
  // Show 24-hour specific UI
}
```

### 4. Deep Clone Before Mutations

```typescript
import { deepClone } from "@/utils";

function updateMessage(message: AcarsMsg, updates: Partial<AcarsMsg>) {
  const clone = deepClone(message);
  return { ...clone, ...updates };
}
```

### 5. Use Proper String Escaping

```typescript
import { escapeHtml, sanitizeInput } from "@/utils";

// For React rendering - use escapeHtml
const SafeText = ({ text }: { text: string }) => (
  <div dangerouslySetInnerHTML={{ __html: escapeHtml(text) }} />
);

// For form inputs - use sanitizeInput
function handleInput(value: string) {
  const safe = sanitizeInput(value);
  // Process safe value
}
```

## Testing Utilities

When writing tests for components that use utilities:

```typescript
import { formatTimestamp } from "@/utils";

// Mock utilities if needed
vi.mock("@/utils", () => ({
  formatTimestamp: vi.fn((ts) => new Date(ts).toISOString()),
}));

test("displays formatted timestamp", () => {
  const message = { timestamp: 1704067200000 };
  render(<MessageItem message={message} />);
  expect(formatTimestamp).toHaveBeenCalledWith(message.timestamp);
});
```

## Performance Considerations

### Tree-Shaking

Import only what you need for optimal bundle size:

```typescript
// ✅ Good - only imports one function
import { formatTimestamp } from "@/utils/dateUtils";

// ⚠️ Acceptable - barrel import (still tree-shakeable with modern bundlers)
import { formatTimestamp } from "@/utils";

// ❌ Avoid - imports everything
import * as utils from "@/utils";
```

### Memoization

Some utilities (like `groupBy`, `sortBy`) create new arrays/objects. Use React's `useMemo` for expensive operations:

```typescript
import { useMemo } from "react";
import { groupBy, sortBy } from "@/utils";

function MessageList({ messages }: { messages: AcarsMsg[] }) {
  const grouped = useMemo(() => groupBy(messages, "tail"), [messages]);

  const sorted = useMemo(
    () => sortBy(messages, "timestamp", "desc"),
    [messages],
  );

  // Render...
}
```

## Adding New Utilities

When adding new utility functions:

1. **Choose the right module** - Put it in the appropriate category file
2. **Add JSDoc comments** - Document parameters and return values
3. **Use proper TypeScript** - No `any` types, use generics where appropriate
4. **Export from barrel** - Add to `utils/index.ts` if it should be public
5. **Run quality checks** - `biome check` and `tsc --noEmit`
6. **Update this README** - Document new utilities

Example:

```typescript
// In dateUtils.ts

/**
 * Checks if a date is in the future
 * @param date - Date to check
 * @returns true if date is in the future
 */
export function isFuture(date: Date | number): boolean {
  const dateObj = typeof date === "number" ? new Date(date) : date;
  return dateObj.getTime() > Date.now();
}
```

## Migration Notes

These utilities replace legacy patterns from `acarshub-typescript`:

| Legacy Pattern                                           | New Utility                      |
| -------------------------------------------------------- | -------------------------------- |
| `html_functions.prefers24HourClock()`                    | `dateUtils.prefers24HourClock()` |
| `html_functions.ensure_hex_is_uppercase_and_six_chars()` | `stringUtils.ensureHexFormat()`  |
| Manual `Object.keys().length === 0` checks               | `arrayUtils.isEmpty()`           |
| `any` type with runtime checks                           | Type guards in `validationUtils` |
| String concatenation for HTML                            | React JSX (no utility needed)    |

## Questions?

See the source code for detailed JSDoc comments on each function. All utilities are heavily documented with parameter descriptions, return types, and usage examples.
