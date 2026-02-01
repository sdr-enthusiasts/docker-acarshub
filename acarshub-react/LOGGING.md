# Logging System Documentation

## Overview

ACARS Hub React uses **loglevel** for application logging with a custom in-memory buffer and user-facing log viewer. The logging system provides:

- **Multiple log levels** (trace, debug, info, warn, error, silent)
- **In-memory log buffer** (stores last 1000 logs)
- **Optional persistence** to localStorage
- **Module-specific loggers** for different parts of the application
- **User-friendly log viewer** in Settings > Advanced tab
- **Export capabilities** (text and JSON formats)

## Log Levels

| Level    | When to Use                                 | Production Default |
| -------- | ------------------------------------------- | ------------------ |
| `trace`  | Very verbose debugging (performance impact) | ❌                 |
| `debug`  | Detailed debugging information              | ❌                 |
| `info`   | General information messages                | ✅                 |
| `warn`   | Warning messages (potential issues)         | ✅                 |
| `error`  | Error messages (critical issues)            | ✅                 |
| `silent` | No logging                                  | ❌                 |

**Default Levels:**

- **Development**: `info`
- **Production**: `warn`

Users can change the log level in **Settings > Advanced > Log Level**.

## Basic Usage

### Import the Logger

```typescript
import log from "@/utils/logger";

// Basic logging
log.info("Application started");
log.debug("Processing data:", data);
log.warn("API rate limit approaching");
log.error("Failed to fetch data", error);
```

### Module-Specific Loggers

For better organization, create module-specific loggers:

```typescript
import { createLogger } from "@/utils/logger";

const logger = createLogger("myModule");

logger.info("Module initialized");
logger.debug("Processing item:", item);
```

**Pre-configured loggers** are available:

```typescript
import { socketLogger, mapLogger, storeLogger, uiLogger } from "@/utils/logger";

socketLogger.debug("Socket event received:", event);
mapLogger.info("Map initialized at coordinates:", lat, lon);
storeLogger.debug("State updated:", newState);
uiLogger.warn("Component took too long to render");
```

## Advanced Usage

### Setting Log Level Programmatically

```typescript
import { setLogLevel, getLogLevel } from "@/utils/logger";

// Change log level
setLogLevel("debug");

// Get current level
const currentLevel = getLogLevel();
console.log("Current log level:", currentLevel);
```

### Accessing the Log Buffer

```typescript
import { logBuffer } from "@/utils/logger";

// Get all logs
const logs = logBuffer.getLogs();

// Get statistics
const stats = logBuffer.getStats();
console.log("Total logs:", stats.total);
console.log("Errors:", stats.error);
console.log("Warnings:", stats.warn);

// Clear all logs
logBuffer.clear();

// Export logs
const textExport = logBuffer.exportLogs(); // Plain text
const jsonExport = logBuffer.exportLogsJSON(); // JSON format
```

### Subscribing to Log Updates

```typescript
import { logBuffer } from "@/utils/logger";

// Subscribe to real-time log updates
const unsubscribe = logBuffer.subscribe((logs) => {
  console.log("Logs updated:", logs.length);
});

// Unsubscribe when done
unsubscribe();
```

### Persistence Control

```typescript
import { logBuffer } from "@/utils/logger";

// Enable persistence (logs survive page refreshes)
logBuffer.setPersistence(true);

// Disable persistence
logBuffer.setPersistence(false);

// Check persistence state
const isPersistent = logBuffer.getPersistence();
```

## User Interface

### Log Viewer Component

The `LogsViewer` component provides a user-friendly interface for viewing logs:

```typescript
import { LogsViewer } from '@/components/LogsViewer';

<LogsViewer
  maxHeight={400}
  showStats={true}
/>
```

**Features:**

- **Filtering** by log level (all, error, warn, info, debug, trace)
- **Text search** across log messages and module names
- **Auto-scroll** toggle (scroll to newest logs automatically)
- **Statistics** display (total, filtered, errors, warnings, etc.)
- **Export** buttons (Copy, Export TXT, Export JSON)
- **Clear** button to remove all logs

### Settings Integration

Users can access logging settings in **Settings > Advanced**:

1. **Log Level**: Control verbosity (silent → trace)
2. **Persist Logs**: Save logs to localStorage across page refreshes
3. **Log Viewer**: View, filter, search, and export logs

## Best Practices

### 1. Use Appropriate Log Levels

```typescript
// ✅ Good
log.error("Failed to connect to server", error);
log.warn("Connection unstable, retrying...");
log.info("User logged in");
log.debug("API response:", response);

// ❌ Bad
log.error("Button clicked"); // Not an error
log.debug("Server error occurred"); // Should be error level
```

### 2. Provide Context

```typescript
// ✅ Good - includes context
log.error("Failed to fetch aircraft data", { endpoint, status, error });

// ❌ Bad - no context
log.error("Error");
```

### 3. Use Module-Specific Loggers

```typescript
// ✅ Good - organized by module
const logger = createLogger("LiveMessages");
logger.info("Received ACARS message", message.uid);

// ❌ Bad - hard to filter/debug
log.info("[LiveMessages] Received ACARS message", message.uid);
```

### 4. Don't Log Sensitive Data

```typescript
// ✅ Good - sanitized
log.debug("User authenticated", { userId: user.id });

// ❌ Bad - contains password
log.debug("Login attempt", { username, password });
```

### 5. Consider Performance

```typescript
// ✅ Good - only serializes when needed
if (log.getLevel() <= log.levels.DEBUG) {
  log.debug("Large object:", expensiveToSerialize());
}

// ❌ Bad - always serializes even if not logged
log.debug("Large object:", JSON.stringify(largeObject));
```

## Architecture

### Logging Flow

```text
User Code
   ↓
loglevel Logger
   ↓
Custom methodFactory
   ↓
├─→ Console Output (browser console)
└─→ LogBuffer (in-memory storage)
      ↓
   ├─→ React Components (via subscribe)
   └─→ localStorage (if persistence enabled)
```

### Integration with Settings Store

The logging system automatically syncs with the Settings store:

1. **Log level** changes in Settings immediately update the logger
2. **Persistence** toggle enables/disables localStorage saving
3. **Initial state** loaded from Settings on app startup

This is handled automatically in `useSettingsStore.ts`:

```typescript
// Subscribe to settings changes
useSettingsStore.subscribe((state) => {
  syncLoggerWithSettings(
    state.settings.advanced.logLevel,
    state.settings.advanced.persistLogs,
  );
});
```

## File Locations

| File                                      | Purpose                                       |
| ----------------------------------------- | --------------------------------------------- |
| `src/utils/logger.ts`                     | Core logging implementation                   |
| `src/components/LogsViewer.tsx`           | Log viewer component                          |
| `src/styles/components/_logs-viewer.scss` | Log viewer styles                             |
| `src/store/useSettingsStore.ts`           | Settings integration                          |
| `src/types/index.ts`                      | Type definitions (LogLevel, AdvancedSettings) |

## Troubleshooting

### Logs Not Appearing

1. Check log level in Settings > Advanced
2. Ensure level is set to `debug` or `trace` for verbose logs
3. Check browser console for errors

### Logs Disappearing on Refresh

1. Enable **Persist Logs** in Settings > Advanced
2. Check browser's localStorage quota
3. Clear old logs if storage is full

### Performance Issues

1. Lower log level to `warn` or `error` in production
2. Disable persistence if not needed
3. Clear logs regularly with `logBuffer.clear()`

### Export Not Working

1. Check browser's download settings
2. Ensure pop-ups are allowed
3. Try "Copy" button instead of export

## Migration Notes

### From Legacy Console Logging

**Before (legacy):**

```typescript
console.log("Message received");
console.error("Error occurred", error);
```

**After (React):**

```typescript
import log from "@/utils/logger";

log.info("Message received");
log.error("Error occurred", error);
```

### Benefits of Migration

- ✅ Centralized log level control
- ✅ User-facing log viewer (no DevTools needed)
- ✅ Export capabilities for support/debugging
- ✅ Optional persistence across sessions
- ✅ Module-based organization
- ✅ Production-ready (automatic level adjustment)

## Support

For non-technical users who experience issues:

1. Open **Settings** (gear icon in navigation)
2. Click **Advanced** tab
3. Set **Log Level** to **Debug**
4. Reproduce the issue
5. Click **Export TXT** button
6. Share the exported file with support

This captures all relevant debugging information without requiring DevTools access.
