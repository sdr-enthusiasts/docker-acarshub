# Coding Standards - Quick Reference

Essential code quality rules for ACARS Hub development. For complete guidelines, see [AGENTS.md](../AGENTS.md).

## Table of Contents

- [TypeScript Standards](#typescript-standards)
- [SCSS/Styling Standards](#scssstyling-standards)
- [React Component Standards](#react-component-standards)
- [State Management](#state-management)
- [Logging Standards](#logging-standards)
- [File Organization](#file-organization)
- [Testing Standards](#testing-standards)
- [Accessibility Standards](#accessibility-standards)
- [Performance Standards](#performance-standards)

---

## TypeScript Standards

### Strict Mode Always

```typescript
// ❌ Bad - Never use any
function processData(data: any): any {
  return data.value;
}

// ✅ Good - Explicit types
interface MessageData {
  uid: string;
  text: string;
  timestamp: number;
}

function processData(data: MessageData): string {
  return data.text;
}
```

### Type Safety Rules

- ✅ **NO `any` type** - Use `unknown` with type guards
- ✅ **Explicit function return types**
- ✅ **Explicit parameter types**
- ✅ **Leverage type inference only when obvious**
- ✅ **Create interfaces for complex objects**
- ✅ **Use generics where appropriate**

### Using `unknown` Instead of `any`

```typescript
// ❌ Bad
function handleError(error: any) {
  console.error(error.message);
}

// ✅ Good
function handleError(error: unknown) {
  if (error instanceof Error) {
    logger.error("Error occurred", { message: error.message });
  } else {
    logger.error("Unknown error", { error });
  }
}
```

### Type Guards

```typescript
// Type guard for checking properties
function isMessageData(obj: unknown): obj is MessageData {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "uid" in obj &&
    "text" in obj &&
    "timestamp" in obj
  );
}

// Usage
function process(data: unknown) {
  if (isMessageData(data)) {
    // TypeScript knows data is MessageData here
    return data.text;
  }
  throw new Error("Invalid data");
}
```

---

## SCSS/Styling Standards

### Core Principles

- 🚫 **NO INLINE STYLES** - All styling in SCSS files
- 🚫 **NO CSS FRAMEWORKS** - No Bootstrap, Tailwind, Material-UI
- ✅ **Catppuccin theming required** - Mocha (dark) and Latte (light)
- ✅ **Mobile-first responsive design** - Critical, not optional
- ✅ **SCSS modules** - Use `@use`/`@forward`, not `@import`

### Mobile-First Design (CRITICAL)

```scss
.button {
  // Mobile-first: base styles for small screens (320px+)
  padding: 0.75rem 1rem;
  font-size: 1rem;
  width: 100%;

  // Tablet and up (768px+)
  @media (min-width: 768px) {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    width: auto;
  }

  // Desktop (1024px+)
  @media (min-width: 1024px) {
    padding: 0.5rem 1.5rem;
  }
}
```

### Catppuccin Colors

```scss
// ✅ Good - Use CSS variables
.alert {
  background-color: var(--color-surface0);
  color: var(--color-text);
  border: 1px solid var(--color-primary);
}

// ❌ Bad - Hardcoded colors
.alert {
  background-color: #1e1e2e;
  color: #cdd6f4;
  border: 1px solid #89b4fa;
}
```

### SCSS Modules

```scss
// ❌ Bad - Deprecated @import
@import "variables";
@import "mixins";

// ✅ Good - Modern @use
@use "sass:math";
@use "variables" as vars;
@use "mixins" as mx;

.component {
  color: vars.$primary-color;
  @include mx.flex-center;
}
```

### Responsive Breakpoints

```scss
// Standard breakpoints
$mobile: 320px;   // Base (mobile-first)
$tablet: 768px;   // Tablet
$desktop: 1024px; // Desktop
$wide: 1920px;    // Wide screens

// Usage
.container {
  padding: 1rem; // Mobile

  @media (min-width: $tablet) {
    padding: 1.5rem;
  }

  @media (min-width: $desktop) {
    padding: 2rem;
  }
}
```

### Touch Targets

```scss
// All interactive elements MUST be at least 44x44px
.button {
  min-height: 44px;
  min-width: 44px;
  padding: 0.75rem 1rem;

  // Touch area can extend beyond visual bounds
  position: relative;

  &::after {
    content: "";
    position: absolute;
    inset: -8px; // Extends touch area
  }
}
```

---

## React Component Standards

### Component Structure

```typescript
import type { ReactNode } from "react";
import { createLogger } from "@/utils/logger";
import "./Button.scss";

const logger = createLogger("Button");

interface ButtonProps {
  variant?: "primary" | "secondary" | "danger";
  size?: "small" | "medium" | "large";
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  ariaLabel?: string; // For accessibility
}

export function Button({
  variant = "primary",
  size = "medium",
  disabled = false,
  onClick,
  children,
  ariaLabel,
}: ButtonProps) {
  const handleClick = () => {
    if (disabled) return;
    logger.debug("Button clicked", { variant, size });
    onClick?.();
  };

  return (
    <button
      className={`button button--${variant} button--${size}`}
      disabled={disabled}
      onClick={handleClick}
      type="button"
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
```

### Component Checklist

- [ ] Explicit prop types (interface)
- [ ] Default values for optional props
- [ ] Proper event handling
- [ ] Accessibility attributes (ARIA)
- [ ] Logger usage (not console)
- [ ] SCSS module import
- [ ] Responsive design
- [ ] Keyboard navigation support

### Performance Optimization

```typescript
import { memo, useMemo, useCallback } from "react";

// Memoize expensive components
export const MessageList = memo(function MessageList({ messages }: Props) {
  // Memoize expensive calculations
  const sortedMessages = useMemo(
    () => messages.sort((a, b) => b.timestamp - a.timestamp),
    [messages],
  );

  // Memoize callbacks
  const handleDelete = useCallback(
    (id: string) => {
      logger.info("Deleting message", { id });
      deleteMessage(id);
    },
    [deleteMessage],
  );

  return (
    <ul>
      {sortedMessages.map((msg) => (
        <MessageItem key={msg.uid} message={msg} onDelete={handleDelete} />
      ))}
    </ul>
  );
});
```

---

## State Management

### Zustand Store Pattern

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createLogger } from "@/utils/logger";

const logger = createLogger("useSettingsStore");

interface SettingsState {
  theme: "mocha" | "latte";
  locale: string;
  notifications: boolean;

  // Actions
  setTheme: (theme: "mocha" | "latte") => void;
  setLocale: (locale: string) => void;
  toggleNotifications: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "mocha",
      locale: "en",
      notifications: true,

      setTheme: (theme) => {
        logger.info("Theme changed", { theme });
        set({ theme });
      },

      setLocale: (locale) => {
        logger.info("Locale changed", { locale });
        set({ locale });
      },

      toggleNotifications: () => {
        set((state) => {
          const notifications = !state.notifications;
          logger.info("Notifications toggled", { notifications });
          return { notifications };
        });
      },
    }),
    {
      name: "acars-settings",
    },
  ),
);
```

### Store Usage

```typescript
import { useSettingsStore } from "@/store/useSettingsStore";

export function ThemeToggle() {
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);

  const toggleTheme = () => {
    setTheme(theme === "mocha" ? "latte" : "mocha");
  };

  return <button onClick={toggleTheme}>Toggle Theme</button>;
}
```

---

## Logging Standards

### Use Logger, Not Console

```typescript
import { createLogger } from "@/utils/logger";

const logger = createLogger("moduleName");

// ✅ Good
logger.error("Failed to decode", { uid, error: err.message });
logger.warn("Connection unstable", { attempts });
logger.info("Message received", { uid, type });
logger.debug("State transition", { from, to });
logger.trace("Raw data", { data });

// ❌ Bad
console.log("Message received");
console.error("Failed to decode", err);
console.warn("Connection unstable");
```

### Log Levels

- **error** - Critical failures preventing functionality
- **warn** - Potential issues, degraded functionality
- **info** - Important state changes, major events
- **debug** - Detailed debugging, state transitions
- **trace** - Very verbose, high-frequency events

### Structured Logging

```typescript
// ✅ Good - Structured data
logger.info("User action", {
  action: "filter",
  filters: { station: "KSEA", airline: "AAL" },
  resultCount: 42,
});

// ❌ Bad - String concatenation
logger.info(
  "User filtered by station KSEA and airline AAL, got 42 results",
);
```

---

## File Organization

### Directory Structure

```text
acarshub-react/
├── src/
│   ├── components/     # Reusable UI components
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.scss
│   │   │   └── __tests__/
│   │   │       └── Button.test.tsx
│   │   └── ...
│   ├── pages/          # Page components
│   │   ├── LiveMessages/
│   │   ├── Map/
│   │   └── ...
│   ├── hooks/          # Custom React hooks
│   ├── store/          # Zustand state management
│   ├── services/       # Socket.IO, API services
│   ├── types/          # TypeScript interfaces
│   ├── utils/          # Utility functions
│   └── styles/         # Global SCSS, themes
└── e2e/                # Playwright E2E tests
```

### Naming Conventions

- **Components**: PascalCase (`Button.tsx`, `MessageList.tsx`)
- **Hooks**: camelCase with `use` prefix (`useSocket.ts`)
- **Utilities**: camelCase (`formatDate.ts`)
- **Stores**: camelCase with `use` prefix and `Store` suffix (`useAppStore.ts`)
- **Types**: PascalCase (`MessageData.ts`)
- **SCSS**: Same as component (`Button.scss`)
- **Tests**: Same as file with `.test.` or `.spec.` (`Button.test.tsx`)

---

## Testing Standards

### Coverage Goals

- **Utilities**: 90%+ coverage
- **Stores**: 80%+ coverage
- **Components**: 70%+ coverage

### Test Structure

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  it("renders children correctly", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByText("Click me"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const handleClick = vi.fn();
    render(
      <Button disabled onClick={handleClick}>
        Click me
      </Button>,
    );

    fireEvent.click(screen.getByText("Click me"));
    expect(handleClick).not.toHaveBeenCalled();
  });
});
```

### Test Checklist

- [ ] Test happy path
- [ ] Test edge cases
- [ ] Test error conditions
- [ ] Test accessibility
- [ ] Mock external dependencies
- [ ] Use meaningful assertions
- [ ] Clear test descriptions

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for more details.

---

## Accessibility Standards

### WCAG 2.1 AA Compliance

**Required**:

- ✅ **Color contrast**: 4.5:1 for normal text, 3:1 for large text
- ✅ **Touch targets**: Minimum 44x44px
- ✅ **Keyboard navigation**: All interactive elements accessible
- ✅ **Screen reader support**: ARIA labels, roles, landmarks
- ✅ **Focus management**: Visible focus indicators

### Semantic HTML

```typescript
// ✅ Good - Semantic elements
<nav aria-label="Main navigation">
  <ul>
    <li><a href="/live">Live Messages</a></li>
    <li><a href="/search">Search</a></li>
  </ul>
</nav>

// ❌ Bad - Divs everywhere
<div className="nav">
  <div className="nav-item" onClick={goToLive}>Live Messages</div>
  <div className="nav-item" onClick={goToSearch}>Search</div>
</div>
```

### ARIA Attributes

```typescript
// ✅ Good - Proper ARIA usage
<button
  aria-label="Close dialog"
  aria-pressed={isActive}
  onClick={handleClick}
>
  <IconClose aria-hidden="true" />
</button>

// For live regions
<div role="status" aria-live="polite" aria-atomic="true">
  {statusMessage}
</div>

// For modals
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
  aria-describedby="dialog-description"
>
  <h2 id="dialog-title">Confirm Action</h2>
  <p id="dialog-description">Are you sure?</p>
</div>
```

### Keyboard Navigation

```typescript
// ✅ Good - Keyboard support
function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    handleClick();
  } else if (event.key === "Escape") {
    handleClose();
  }
}

<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={handleKeyDown}
>
  Click me
</div>;
```

---

## Performance Standards

### Bundle Size

- **Target**: < 500KB per chunk (gzipped)
- **Monitor**: `npm run analyze`

### React Performance

```typescript
// ✅ Good - Optimized rendering
import { memo, useMemo, useCallback } from "react";

const ExpensiveComponent = memo(({ data }: Props) => {
  const processed = useMemo(() => processData(data), [data]);

  const handleClick = useCallback(() => {
    doSomething(processed);
  }, [processed]);

  return <div onClick={handleClick}>{processed}</div>;
});

// ❌ Bad - Unnecessary re-renders
function ExpensiveComponent({ data }: Props) {
  const processed = processData(data); // Runs every render
  const handleClick = () => doSomething(processed); // New function every render

  return <div onClick={handleClick}>{processed}</div>;
}
```

### Avoid Memory Leaks

```typescript
// ✅ Good - Cleanup subscriptions
useEffect(() => {
  const subscription = socket.on("message", handleMessage);

  return () => {
    subscription.off("message", handleMessage);
  };
}, [socket, handleMessage]);

// ❌ Bad - No cleanup
useEffect(() => {
  socket.on("message", handleMessage);
}, [socket, handleMessage]);
```

---

## Quality Gates (Before Committing)

Run the full quality check:

```bash
just ci
```

This verifies:

1. ✅ TypeScript compiles with no errors
2. ✅ Biome linting passes
3. ✅ All tests pass
4. ✅ Pre-commit hooks pass

### Manual Checklist

- [ ] No `any` types introduced
- [ ] No inline styles
- [ ] No console statements (use logger)
- [ ] Mobile responsiveness verified (375px, 768px, 1024px)
- [ ] Accessibility checked (keyboard nav, screen reader)
- [ ] Component patterns match DESIGN_LANGUAGE.md
- [ ] Tests written and passing
- [ ] Documentation updated (if needed)

---

## Common Patterns

### Socket.IO Communication

**Flask-SocketIO Quirk** (CRITICAL):

```typescript
// ✅ Good - Flask-SocketIO requires namespace as THIRD argument
socket.emit("query_search", payload, "/main");

// ❌ Bad - Standard Socket.IO (won't work)
socket.emit("query_search", payload);
```

### Error Handling

```typescript
// ✅ Good - Structured error handling
try {
  const result = await fetchData();
  logger.info("Data fetched successfully", { count: result.length });
  return result;
} catch (error) {
  if (error instanceof NetworkError) {
    logger.error("Network error", { message: error.message });
    throw new UserFacingError("Unable to connect to server");
  } else if (error instanceof ValidationError) {
    logger.warn("Validation error", { errors: error.errors });
    throw error;
  } else {
    logger.error("Unexpected error", { error });
    throw new UserFacingError("An unexpected error occurred");
  }
}
```

---

## Resources

- **[AGENTS.md](../AGENTS.md)** - Complete coding guidelines
- **[DESIGN_LANGUAGE.md](../agent-docs/DESIGN_LANGUAGE.md)** - UI/UX patterns
- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Testing patterns
- **[CATPPUCCIN.md](../agent-docs/CATPPUCCIN.md)** - Color palette reference

---

## Questions?

Check the specific documentation for your area of work, or ask in Discord.
