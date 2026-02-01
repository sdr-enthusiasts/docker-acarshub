# AGENTS.md - ACARS Hub Project Guide for AI Agents

## Project Overview

ACARS Hub is a web application for receiving, decoding, and displaying ACARS (Aircraft Communications Addressing and Reporting System) messages. The application consists of a Python backend (Flask/Socket.IO) and a TypeScript frontend that displays live aviation messages, maps, statistics, and alerts.

Files:

- agent-docs/DESIGN_LANGUAGE.md - **Visual design language and component usage guide**
- agent-docs/CATPPUCCIN.md - Catppuccin color reference for React frontend
- agent-docs/LOGGING.md - **Logging system usage, API reference, and troubleshooting**
- agent-docs/\* - Other documentation files. MAKE SURE YOU REFER TO THESE
- acarshub-typescript/ - Current jQuery/TypeScript frontend (legacy)

## Current State

- **Backend**: Python Flask application with Socket.IO for real-time communication
- **Frontend (Legacy)**: ~7,929 lines of TypeScript using jQuery, Bootstrap 5, Leaflet, Chart.js
- **Frontend (React)**: Custom SCSS with Catppuccin theming, no third-party CSS frameworks
- **Build System (Legacy)**: Webpack with TypeScript, SASS
- **Build System (React)**: Vite with TypeScript, SCSS
- **Dependencies (Legacy)**: jQuery 3.7, jBox 1.3.3 (modals), Leaflet (maps), Socket.IO client
- **Dependencies (React)**: React 19, Zustand, Socket.IO client, React Router

## Project Goals

### Primary Goal: React Migration (Legacy Code No Longer Maintained)

The project is undergoing a **complete rewrite in React**. The legacy jQuery/TypeScript frontend is **no longer maintained**. All development efforts focus exclusively on the React migration.

**Rationale for rewrite**:

1. **Architectural Issues**:
   - Global state management problems (20+ global variables)
   - Window object pollution with global functions
   - Manual DOM manipulation throughout
   - String-based HTML generation prone to errors
   - No clear event architecture

2. **Maintainability Issues**:
   - Heavy jQuery usage with direct DOM manipulation
   - jBox dependency with TypeScript type issues
   - Monolithic components (e.g., LiveMessagePage is 991 lines)
   - Overuse of `any` type defeating TypeScript benefits

3. **Target Outcome**:
   - Functionally identical application with visual improvements
   - Proper TypeScript conventions (eliminate all `any` usage)
   - Component-based architecture
   - Reactive state management
   - Easier to maintain and extend
   - Better testing capabilities

### Backend API Changes Permitted

As part of the React migration, **backend API endpoints and data structures may be modified**:

- Refactor or remove Flask routes that only served legacy frontend needs
- Simplify JSON response structures for cleaner React integration
- Remove HTML generation from Python backend (presentation logic belongs in frontend)
- Update Socket.IO event payloads to eliminate legacy-specific fields
- Add new API endpoints as needed for React features
- Breaking changes to backend APIs are acceptable (no legacy compatibility required)
- Focus: Clean separation of data layer (Python) and presentation layer (React)

## Project Structure

### React Migration Directory

The React migration will be built **independently** from the current frontend in a new top-level directory:

```text
docker-acarshub/
├── acarshub-typescript/    # Current jQuery/TypeScript frontend (legacy)
├── acarshub-react/         # New React frontend (migration target)
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── store/          # State management (Zustand)
│   │   ├── services/       # Socket.IO and API services
│   │   ├── types/          # TypeScript interfaces (migrated from legacy)
│   │   ├── utils/          # Utility functions
│   │   │   └── logger.ts   # Logging system (loglevel + in-memory buffer)
│   │   ├── assets/         # Static assets
│   │   └── App.tsx         # Root component
│   ├── public/             # Public assets
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts      # Vite build configuration
│   ├── LOGGING.md          # Logging documentation
│   └── index.html
├── rootfs/
│   ├── etc/nginx.acarshub/ # nginx configuration
│   └── webapp/             # Python Flask backend
└── flake.nix               # Nix development environment
```

**Rationale for Separate Directory**:

- Clean slate without legacy code interference
- Independent build pipeline (Vite vs Webpack)
- Easy A/B testing and gradual rollout
- Legacy frontend remains functional during migration
- Clear separation of old vs new code for review

## Deployment Architecture

### Current State (Legacy)

- Flask serves static assets via `send_from_directory`
- nginx proxies to Flask/Gunicorn on port 8888
- Mixed responsibility between Python and nginx

### Target State (React Migration)

Flask/Python backend **ONLY** handles:

- WebSocket communication (Socket.IO)
- `/socket.io/*` endpoints
- `/metrics` endpoint
- Business logic and data processing
- **No HTML generation** - All presentation logic in React
- **No legacy route compatibility** - Clean API design for React

nginx **ONLY** handles:

- Serving static assets (HTML, CSS, JS, images)
- Asset caching with proper headers
- Routing SPA paths to `index.html`
- Proxying WebSocket connections to Python backend

**Benefits**:

- Clear separation of concerns
- Better performance (nginx is optimized for static files)
- Simplified Python codebase (remove legacy code paths)
- Standard production deployment pattern
- Easier horizontal scaling
- Freedom to redesign APIs without legacy constraints

### nginx Configuration Updates Required

The existing nginx configuration at `rootfs/etc/nginx.acarshub/sites-enabled/acarshub` already implements most of this pattern. For React migration:

- Update root path to point to React build output
- Ensure all React Router paths serve `index.html`
- Maintain existing proxy rules for `/socket.io` and `/metrics`

## Tooling and Environment Management

### Development Environment: Nix Flakes

All development tooling is managed via `flake.nix`. This includes:

- Node.js and npm
- TypeScript compiler
- Python and PDM
- Biome (linter/formatter)
- Pre-commit hooks

### Adding New Tools

**For basic npm packages** (libraries, React dependencies):

- Add to `package.json` in the appropriate directory
- Install normally with `npm install`

**For system-level tools** (compilers, formatters, build tools):

1. Add the tool to `flake.nix` in the `packages` or `buildInputs` list
2. **STOP** and notify the user: "I need to add [tool] to flake.nix. Please reload your environment with `nix develop` or `direnv allow`, then I can continue."
3. Wait for user confirmation before proceeding
4. Continue with the task after environment reload

**Examples of tools requiring flake.nix**:

- Vite, esbuild, or other build tools
- Test runners (Jest, Vitest, Playwright)
- Additional linters or formatters
- Database tools or CLIs
- Any binary that runs outside of npm scripts

### Git Commands

When using git programmatically (for inspecting changes, logs, etc.), **always** use the `--no-pager` flag:

```bash
git --no-pager diff
git --no-pager log --oneline -10
git --no-pager show HEAD
```

This prevents pagination that blocks automated processes.

## Code Quality Requirements

All code changes MUST pass the following checks before committing:

### 1. Biome (Linter/Formatter)

```bash
biome check
```

### 2. TypeScript Compilation

```bash
tsc --noEmit -p acarshub-typescript/tsconfig.json
```

### 3. Pre-commit Hooks

```bash
pre-commit run --all-files
```

### 4. Git Usage

When using git commands programmatically, use the `--no-pager` flag:

```bash
git --no-pager diff
git --no-pager log
git --no-pager show
```

### 5. Markdown

- Always include a language specifier for code blocks (e.g., ```typescript)
- No summary markdown documents allowed
- You may create documents for documenting standards (e.g., DESIGN_LANGUAGE.md)
- Do not use emphasis in place of a heading
- Do not use the same heading with the same content multiple times in the same document (eg "## Introduction")
- Use blank lines around headings for readability and code blocks
- This project uses GitHub-flavored markdown
- This project uses strict linting rules for markdown files

## Logging Guidelines

### Overview

ACARS Hub uses **loglevel** with a custom in-memory buffer for application logging. All logging must follow these guidelines to ensure consistency, debuggability, and performance.

**📚 Full Documentation**: See [`agent-docs/LOGGING.md`](agent-docs/LOGGING.md) for:

- Detailed usage examples
- Complete API reference
- Module logger patterns
- Export capabilities
- User support workflows
- Troubleshooting guide

### Core Principles

1. **No `console.*` statements** - Always use the logger
2. **Use appropriate log levels** - Match severity to the event
3. **Module-specific loggers** - Create loggers for different subsystems
4. **Provide context** - Include relevant data in log messages
5. **Performance aware** - Use trace for high-frequency events

### Log Levels

| Level    | When to Use                                          | Examples                                                             | Production Default     |
| -------- | ---------------------------------------------------- | -------------------------------------------------------------------- | ---------------------- |
| `error`  | Critical failures, errors that prevent functionality | Socket connection failures, decoder crashes, data corruption         | ✅ Shown               |
| `warn`   | Potential issues, degraded functionality             | Socket disconnections, rate limit warnings, missing optional data    | ✅ Shown               |
| `info`   | Important state changes, major events                | Connections established, version info, alert matches, initialization | ✅ Shown (dev default) |
| `debug`  | Detailed debugging, state transitions                | Configuration updates, duplicate detection, message grouping         | ❌ Hidden              |
| `trace`  | Very verbose, high-frequency events                  | Every message received, skip conditions, signal updates              | ❌ Hidden              |
| `silent` | No logging                                           | N/A                                                                  | ❌ Never use           |

**Default Levels**:

- Development: `info`
- Production: `warn`
- User-configurable in Settings → Advanced

### Module-Specific Loggers

Create dedicated loggers for different subsystems:

```typescript
import { createLogger } from "@/utils/logger";

const logger = createLogger("moduleName");
```

**Pre-configured loggers** (use these when appropriate):

```typescript
import { socketLogger, mapLogger, storeLogger, uiLogger } from "@/utils/logger";
```

**Existing Module Loggers**:

- `socket` - Socket.IO communication, connection lifecycle
- `decoder` - ACARS message decoding, duplicate detection, multi-part messages
- `store` - Zustand state management, message processing
- `alerts` - Alert term matching logic
- `map` - Map operations and rendering
- `ui` - UI lifecycle, component mounting, settings changes

### Usage Patterns

#### ✅ Good Examples

```typescript
// Error with full context
logger.error("Failed to decode message", {
  uid: message.uid,
  label: message.label,
  text: message.text?.substring(0, 50),
  error: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack : undefined,
});

// Info for important events
logger.info("Socket.IO connected", {
  socketId: socket.id,
  transport: socket.io.engine.transport.name,
});

// Debug for state changes
logger.debug("Duplicate message detected", {
  existingUid: existingMessage.uid,
  newUid: newMessage.uid,
  duplicateCount,
});

// Trace for high-frequency events
logger.trace("Received acars_msg event", {
  uid: data.msghtml?.uid,
  station: data.msghtml?.station_id,
});
```

#### ❌ Bad Examples

```typescript
// ❌ Using console instead of logger
console.log("Message received");

// ❌ Wrong log level (not an error)
logger.error("Button clicked");

// ❌ No context
logger.error("Error occurred");

// ❌ Sensitive data
logger.debug("Login attempt", { username, password });

// ❌ Too verbose for info level
logger.info("Processing pixel", { x, y, rgb });
```

### When to Add Logging

Add logging at these key points:

1. **Module initialization** (info)

   ```typescript
   logger.info("Module initialized", { config });
   ```

2. **Network events** (info for success, warn for disconnect, error for failures)

   ```typescript
   logger.info("Connected to backend", { socketId });
   logger.warn("Disconnected from backend", { reason });
   logger.error("Connection error", { message, stack });
   ```

3. **State changes** (debug)

   ```typescript
   logger.debug("State updated", { previousValue, newValue });
   ```

4. **Error handling** (error with full context)

   ```typescript
   try {
     // operation
   } catch (error) {
     logger.error("Operation failed", {
       operation: "decode",
       input,
       error: error instanceof Error ? error.message : String(error),
       stack: error instanceof Error ? error.stack : undefined,
     });
   }
   ```

5. **High-frequency events** (trace only)

   ```typescript
   socket.on("frequent_event", (data) => {
     logger.trace("Event received", { dataSize: data.length });
     // process
   });
   ```

6. **Alert/important business logic** (info)

   ```typescript
   logger.info("Alert match detected", {
     uid: message.uid,
     matchedTerms,
   });
   ```

### Performance Considerations

1. **Use trace for frequent events**
   - Message reception
   - Mouse/scroll events
   - Animation frames
   - Signal updates

2. **Avoid expensive operations in log calls**

   ```typescript
   // ❌ Bad - serializes even if not logged
   logger.debug("Data", JSON.stringify(largeObject));

   // ✅ Good - only if debug level active
   if (log.getLevel() <= log.levels.DEBUG) {
     logger.debug("Data", expensiveToSerialize());
   }
   ```

3. **Be mindful of log buffer size**
   - Buffer stores last 1000 logs
   - Excessive trace logging can push out important logs
   - Use appropriate levels

### Error Logging Best Practices

Always include:

- **Operation context** - What were you trying to do?
- **Input data** - What was being processed? (sanitize sensitive data)
- **Error details** - Message and stack trace
- **Unique identifiers** - UIDs, IDs, keys

```typescript
logger.error("Failed to process message", {
  operation: "decode",
  uid: message.uid,
  label: message.label,
  text: message.text?.substring(0, 100), // Truncate long text
  error: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack : undefined,
});
```

### Testing Logging

When testing code that logs:

1. Set log level to `trace` in Settings → Advanced
2. Reproduce the scenario
3. Check logs in Settings → Advanced → Log Viewer
4. Verify appropriate levels are used
5. Verify context is sufficient for debugging

### User Support Workflow

For non-technical users reporting issues:

1. Ask user to open Settings → Advanced
2. Set Log Level to Debug or Trace
3. Ask them to reproduce the issue
4. Click "Export TXT" button
5. Send the exported file to support

This captures all necessary debugging information without requiring DevTools access.

### Migration from Console Statements

When you encounter `console.log/warn/error`:

```typescript
// Before
console.log("Message received");
console.error("Error:", error);

// After
import log from "@/utils/logger";
// or
import { socketLogger } from "@/utils/logger";

log.info("Message received");
logger.error("Error occurred", { error });
```

## Development Guidelines

### TypeScript Standards

1. **No `any` Type**: Eliminate all uses of `any` in new code
   - Use proper type definitions
   - Create interfaces for complex objects
   - Use generics where appropriate
   - For external libraries without types, create `.d.ts` declarations

2. **Proper Typing**:
   - All function parameters must be typed
   - All function return types must be explicit
   - Use strict TypeScript settings
   - Leverage type inference only when obvious

3. **Interfaces**: Use existing interfaces in `src/interfaces.ts` and add new ones as needed

### Style Standards

1. **NO INLINE STYLES** - All styling must be in SCSS files

2. **NO THIRD-PARTY CSS FRAMEWORKS** - Do not use Bootstrap, Tailwind, Material-UI, or any other CSS framework
   - Write all styles from scratch using SCSS
   - Create custom components and utilities as needed

3. **MOBILE-FIRST RESPONSIVE DESIGN IS PARAMOUNT** ⚠️ CRITICAL
   - **All layouts MUST be fully responsive and mobile-friendly**
   - **Mobile experience is first-class, not an afterthought**
   - Use mobile-first approach: base styles for mobile, `min-width` media queries for larger screens
   - Test all features on mobile devices (phones and tablets)
   - Touch targets must be at least 44x44px for accessibility
   - Navigation must work seamlessly on small screens
   - Tables and data displays must adapt to narrow viewports (stack, scroll, or truncate)
   - Forms must be usable on mobile keyboards
   - Modals and dialogs must fit mobile screens
   - No horizontal scrolling on any screen size
   - Performance matters: optimize for mobile network speeds

4. **CATPPUCCIN THEMING REQUIRED**:
   - **Dark Theme**: Catppuccin Mocha (default)
   - **Light Theme**: Catppuccin Latte
   - Use SCSS mixins and CSS variables from Catppuccin color palettes
   - Theme switching should only swap variable names in mixins
   - Follow Catppuccin color naming conventions: base, mantle, crust, text, subtext0, subtext1, overlay0, overlay1, overlay2, surface0, surface1, surface2, blue, lavender, sapphire, sky, teal, green, yellow, peach, maroon, red, mauve, pink, flamingo, rosewater
   - Reference: <https://github.com/catppuccin/catppuccin>

5. **SCSS Requirements**:
   - Use SCSS for all styling (not plain CSS)
   - Organize styles with partials: `_variables.scss`, `_mixins.scss`, `_themes.scss`, `_components.scss`
   - Use nesting, variables, and mixins appropriately
   - Follow BEM or similar naming convention for class names
   - Keep specificity low, avoid deep nesting (max 3-4 levels)

### Code Organization

1. **Separation of Concerns**:
   - HTML generation separate from business logic
   - Data processing separate from presentation
   - Event handlers separate from state management

2. **Function Size**:
   - Keep functions small and focused (prefer <50 lines)
   - Extract complex logic into helper functions
   - Use meaningful function and variable names

3. **Comments**:
   - Document WHY, not WHAT
   - Explain complex algorithms or business logic
   - Add JSDoc comments for public functions
   - No summary markdown documents allowed

### HTML Generation

Current approach uses string concatenation (will be eliminated in React migration):

```typescript
// Current pattern in html_functions.ts
function generate_html(data: SomeType): string {
  let html = "<div>";
  html += `<span>${data.value}</span>`;
  html += "</div>";
  return html;
}
```

When adding new formatters:

- Follow existing patterns for consistency
- Use template literals for readability
- Properly escape user input
- Keep formatters focused on single responsibility

### State Management

Current architecture (to be replaced):

- Global variables in `index.ts`
- Window object methods
- Page classes with internal state

Avoid adding new global state. Prefer passing data through function parameters.

### Event Handling

Current system uses:

- Socket.IO events for backend communication
- jQuery event handlers
- Window object global functions

For new code:

- Document event flow clearly
- Avoid creating new global functions on window
- Keep event handlers simple, delegate to methods

## File Structure

```text
acarshub-typescript/
├── src/
│   ├── assets/          # Images, icons, static assets
│   ├── css/             # SCSS styles (modules, components, pages)
│   ├── helpers/         # Utility functions and helpers
│   │   ├── html_functions.ts      # HTML generation utilities
│   │   ├── html_generator.ts      # Message display logic
│   │   ├── menu.ts                # Navigation menu
│   │   ├── settings_manager.ts    # Settings modal system
│   │   └── tooltips.ts            # jBox tooltip definitions
│   ├── js-other/        # Third-party JS utilities
│   ├── pages/           # Page classes
│   │   ├── master.ts              # Base page class
│   │   ├── live_messages.ts       # Main message display
│   │   ├── live_map.ts            # Aircraft map view
│   │   ├── alerts.ts              # Alert filtering
│   │   ├── search.ts              # Database search
│   │   ├── stats.ts               # Statistics/graphs
│   │   ├── status.ts              # System status
│   │   └── about.ts               # About/help page
│   ├── index.ts         # Main entry point
│   ├── interfaces.ts    # TypeScript type definitions
│   └── typings.d.ts     # External library type declarations
├── package.json
├── tsconfig.json
└── webpack.config.js
```

## Key Interfaces

All message and data types are defined in `src/interfaces.ts`:

- `acars_msg`: Core ACARS message structure
- `plane`: Aircraft with messages
- `adsb_plane`: ADS-B aircraft position data
- `decoders`: Enabled decoders configuration
- `system_status`: Backend system status
- And many more...

Always use these interfaces. Add new interfaces to this file when needed.

## Socket.IO Communication

Backend communicates via Socket.IO with these key events:

**Received Events**:

- `acars_msg`: New ACARS message
- `labels`: Message label definitions
- `terms`: Alert term updates
- `database_search_results`: Search results
- `system_status`: System health status
- `signal`: Signal level data
- And more...

**Emitted Events** (React):

- `query_search`: Database search request
- `update_alerts`: Update alert terms
- `signal_freqs`: Request frequency data
- `rrd_timeseries`: RRD time-series data request
- And more...

**Flask-SocketIO Emit Pattern** (CRITICAL):

When emitting events from client to server, Flask-SocketIO requires the namespace as the **third argument**:

```typescript
socket.emit("event_name", payload, "/main");
```

This is different from standard Socket.IO client patterns. All emit calls in the React app MUST follow this pattern:

- ✅ Correct: `socket.emit("query_search", { search_term: {...} }, "/main")`
- ❌ Wrong: `socket.emit("query_search", { search_term: {...} })`

Without the namespace argument, the backend will not receive the event.

See `src/index.ts` lines 257-416 (legacy) for complete event handling.

## Dependencies to Replace in React Migration

1. **jBox** → Custom React modals (no third-party library)
2. **jQuery** → React + vanilla JS
3. **Manual DOM manipulation** → React components
4. **String HTML generation** → JSX
5. **Global state** → Zustand
6. **Bootstrap 5** → Custom SCSS with Catppuccin theming
7. **Chart.js** → Recharts or react-chartjs-2
8. **Leaflet** → react-leaflet

## Styling Guidelines (React Migration)

### Theme System

The React application uses **Catppuccin** color schemes exclusively:

- **Catppuccin Mocha** (Dark theme) - default
- **Catppuccin Latte** (Light theme)

### Color Palette Variables

All colors must come from Catppuccin palettes. Do not use arbitrary colors.

**Mocha (Dark) Colors**:

```scss
$mocha-rosewater: #f5e0dc;
$mocha-flamingo: #f2cdcd;
$mocha-pink: #f5c2e7;
$mocha-mauve: #cba6f7;
$mocha-red: #f38ba8;
$mocha-maroon: #eba0ac;
$mocha-peach: #fab387;
$mocha-yellow: #f9e2af;
$mocha-green: #a6e3a1;
$mocha-teal: #94e2d5;
$mocha-sky: #89dceb;
$mocha-sapphire: #74c7ec;
$mocha-blue: #89b4fa;
$mocha-lavender: #b4befe;
$mocha-text: #cdd6f4;
$mocha-subtext1: #bac2de;
$mocha-subtext0: #a6adc8;
$mocha-overlay2: #9399b2;
$mocha-overlay1: #7f849c;
$mocha-overlay0: #6c7086;
$mocha-surface2: #585b70;
$mocha-surface1: #45475a;
$mocha-surface0: #313244;
$mocha-base: #1e1e2e;
$mocha-mantle: #181825;
$mocha-crust: #11111b;
```

**Latte (Light) Colors**:

```scss
$latte-rosewater: #dc8a78;
$latte-flamingo: #dd7878;
$latte-pink: #ea76cb;
$latte-mauve: #8839ef;
$latte-red: #d20f39;
$latte-maroon: #e64553;
$latte-peach: #fe640b;
$latte-yellow: #df8e1d;
$latte-green: #40a02b;
$latte-teal: #179299;
$latte-sky: #04a5e5;
$latte-sapphire: #209fb5;
$latte-blue: #1e66f5;
$latte-lavender: #7287fd;
$latte-text: #4c4f69;
$latte-subtext1: #5c5f77;
$latte-subtext0: #6c6f85;
$latte-overlay2: #7c7f93;
$latte-overlay1: #8c8fa1;
$latte-overlay0: #9ca0b0;
$latte-surface2: #acb0be;
$latte-surface1: #bcc0cc;
$latte-surface0: #ccd0da;
$latte-base: #eff1f5;
$latte-mantle: #e6e9ef;
$latte-crust: #dce0e8;
```

### SCSS File Structure

```text
src/
├── styles/
│   ├── _variables.scss      # Catppuccin color variables
│   ├── _mixins.scss          # Theme mixins and utilities
│   ├── _themes.scss          # Theme definitions (mocha/latte)
│   ├── _reset.scss           # CSS reset
│   ├── components/
│   │   ├── _navigation.scss
│   │   ├── _button.scss
│   │   ├── _modal.scss
│   │   └── ...
│   ├── pages/
│   │   ├── _live-messages.scss
│   │   ├── _search.scss
│   │   └── ...
│   └── main.scss             # Main import file
```

### Theme Switching Pattern

Use SCSS mixins to define themes. Only variable names should change:

```scss
// _mixins.scss
@mixin theme-mocha {
  --color-base: #{$mocha-base};
  --color-text: #{$mocha-text};
  --color-primary: #{$mocha-blue};
  // ... etc
}

@mixin theme-latte {
  --color-base: #{$latte-base};
  --color-text: #{$latte-text};
  --color-primary: #{$latte-blue};
  // ... etc
}

// _themes.scss
:root {
  @include theme-mocha; // Default dark theme
}

[data-theme="light"] {
  @include theme-latte;
}
```

### Styling Rules

1. **No arbitrary colors** - Every color must be from Catppuccin palette
2. **Use CSS custom properties** - Define in mixins, use in components
3. **Component-scoped styles** - Each component has its own SCSS partial
4. **MOBILE-FIRST RESPONSIVE DESIGN** ⚠️ PARAMOUNT - Use `min-width` media queries, test on mobile devices
5. **Accessibility** - Maintain WCAG AA contrast ratios, focus states, ARIA support, 44px touch targets
6. **No !important** - Structure CSS to avoid specificity wars
7. **Semantic class names** - Use BEM: `.block__element--modifier`
8. **No horizontal scroll** - All content must fit viewport width at any screen size
9. **Performance** - Optimize for mobile network speeds, minimize bundle size

## Testing Strategy (Future)

React migration should include:

- Component unit tests (Jest + React Testing Library)
- Integration tests for Socket.IO communication
- E2E tests for critical user flows (Playwright/Cypress)

## Application Performance Considerations

- Application handles real-time message streams
- Live map may show 100+ aircraft simultaneously
- Message history limited to 50 messages per aircraft
- Efficient re-rendering critical for user experience

## Browser Support

Target modern browsers with ES6+ support:

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Documentation Standards

- No summary markdown documents allowed
- Comments must explain complex logic and business rules
- Keep documentation close to code (JSDoc, inline comments)
- **Visual design patterns documented in DESIGN_LANGUAGE.md**
- Update this AGENTS.md file when project goals change

## Questions to Ask Before Making Changes

1. Does this align with the React migration goal?
2. Will this code be throwaway or reusable in React?
3. Does it pass all quality checks (biome, tsc, pre-commit)?
4. Does it introduce new global state? (Avoid if possible)
5. Does it use `any` type? (Eliminate if possible)
6. Is it properly commented?
7. Does it follow existing patterns for consistency?

## React Migration Phases

### Phase 1: Project Setup and Foundation ✅ COMPLETE

- ✅ Create `acarshub-react/` directory structure
- ✅ Initialize Vite + React + TypeScript project
- ✅ Configure Biome for React (extends existing config)
- ✅ Set up TypeScript with strict mode
- ✅ Integrate Socket.IO client with type-safe events
- ✅ Create base layout shell with navigation
- ✅ Implement routing with React Router (7 routes)
- ✅ Set up Zustand for state management
- ✅ All page placeholders created
- ✅ Connection status indicator
- ✅ Production build successful
- **Deliverable**: Empty app shell with navigation and Socket.IO connection ✅

**Next Steps**: Remove Bootstrap, implement SCSS with Catppuccin theming

### Phase 2: Styling System and Theme Implementation ✅ COMPLETE

- ✅ Remove Bootstrap dependency
- ✅ Set up SCSS file structure (partials, components, pages)
- ✅ Implement Catppuccin Mocha (dark) theme with full color palette
- ✅ Implement Catppuccin Latte (light) theme with full color palette
- ✅ Create theme switching mechanism using SCSS mixins and CSS variables
- ✅ Build custom button components with Catppuccin colors (11 variants, 3 sizes, loading state)
- ✅ Build custom modal/dialog components (accessible, keyboard support)
- ✅ Create responsive navigation with Catppuccin styling
- ✅ Establish reusable SCSS mixins for common patterns (30+ utility mixins)
- ✅ ThemeSwitcher component with localStorage persistence
- ✅ Modern CSS reset with Catppuccin integration
- ✅ Modern @use/@forward SCSS module system (no deprecated @import)
- **Deliverable**: Complete custom styling system with Catppuccin theming ✅

**Next Steps**: Form components will be added in Phase 3 as needed; Testing infrastructure deferred to Phase 10

### Phase 3: Type System and Shared Utilities ✅ COMPLETE

- ✅ Complete migration of all interfaces from `acarshub-typescript/src/interfaces.ts`
- ✅ Added Socket.IO event type definitions (SocketEvents, SocketEmitEvents)
- ✅ Added React component prop types (BaseComponentProps, MessageComponentProps, etc.)
- ✅ Added UI state types (TabState, ModalState, TooltipConfig)
- ✅ Added form and input types (FormFieldConfig, SelectOption)
- ✅ Added statistics and chart types (ChartDataPoint, ChartSeries, StatisticCard)
- ✅ Added theme types (Theme, ThemeConfig)
- ✅ Added error and loading state types
- ✅ Added pagination, filter, and sort types
- ✅ Created comprehensive date utilities (formatTimestamp, formatRelativeTime, etc.)
- ✅ Created string utilities (ensureHexFormat, truncate, escapeHtml, etc.)
- ✅ Created array/object utilities (groupBy, sortBy, deepClone, deepMerge, etc.)
- ✅ Created validation utilities (type guards, format validators, sanitization)
- ✅ All utilities are properly typed with zero `any` usage
- ✅ All code passes Biome checks and TypeScript strict mode
- **Deliverable**: Complete type definitions and utility foundations ✅

**Next Steps**: Begin Phase 4 - About Page implementation

### Phase 4: About Page (Simplest Page - Proof of Concept) ✅ COMPLETE

**Goal**: Build the simplest page first to establish component patterns and prove the architecture

#### Tasks

- ✅ Read legacy About page content and structure
- ✅ Create About page layout component
- ✅ Implement help/documentation sections
- ✅ Create reusable Card component for content sections
- ✅ Add version information display
- ✅ Implement update checker integration
- ✅ Add keyboard shortcuts reference
- ✅ Add license and copyright information
- ✅ Ensure full mobile responsiveness
- ✅ Test on multiple screen sizes (via build validation)

**Deliverable**: Fully functional About page demonstrating component patterns and Catppuccin theming ✅

**Completed Components**:

- Card component with variants (default, info, success, warning, error)
- Card grid layout helpers (responsive 1-4 column grids)
- Complete About page with all legacy help content migrated
- Mobile-first responsive design with proper breakpoints
- Image asset handling (safari.png for alert configuration example)
- Keyboard shortcut reference section
- All content sections: About, Navigation Overview, ACARS explanation, Field Definitions, General Tips, Alerts guide, Feedback/Help, Version Info, License

### Phase 5: Settings System and User Preferences ✅ COMPLETE

**Goal**: Create a persistent settings system before building feature-heavy pages

**Why Now**:

- Theme persistence already working (from Phase 2)
- Need to establish settings patterns before pages that depend on them
- Locale preferences (24hr time, date formatting) affect all subsequent pages
- Better to build settings infrastructure now than retrofit later

#### Settings Tasks

- ✅ Create Settings store with Zustand (persistent via localStorage)
- ✅ Define settings interface:
  - ✅ Theme preference (Mocha/Latte)
  - ✅ Time format preference (12hr/24hr/auto-detect)
  - ✅ Date format preference (locale-based options)
  - ✅ Display density (compact/comfortable/spacious)
  - ✅ Animations toggle
  - ✅ Connection status visibility
  - ✅ Notification preferences (desktop, sound, volume, alerts-only)
  - ✅ Data management (max messages, caching, auto-clear)
- ✅ Create Settings modal component with tabbed interface
- ✅ Settings form sections:
  - ✅ Appearance (theme, display density, animations, connection status)
  - ✅ Regional & Time (time format, date format, timezone)
  - ✅ Notifications (desktop, sound alerts, volume slider, alerts-only)
  - ✅ Data & Privacy (max messages slider, caching toggle, auto-clear slider)
- ✅ Integrate settings into utility functions:
  - ✅ `formatTimestamp()` accepts time/date format parameters
  - ✅ `formatDate()` respects date format preference
  - ✅ `formatTime()` respects time format preference
  - ✅ Auto-detect remains available as option
- ✅ Settings already integrated in Navigation (button existed)
- ✅ Create reusable form components:
  - ✅ RadioGroup component with Catppuccin styling
  - ✅ Select/dropdown component with custom styling
  - ✅ Toggle/switch component with smooth animations
  - ✅ All components support density modes and mobile-first design
- ✅ Settings persistence to localStorage via Zustand middleware
- ✅ Settings import/export functionality (JSON)
- ✅ Mobile-responsive tabbed layout with scrollable tabs
- ✅ Keyboard shortcuts (Escape to close modal)
- ✅ ThemeSwitcher updated to use settings store
- ✅ App.tsx applies settings to document root (density, animations, theme)

**Deliverable**: Complete settings system with persistent user preferences that subsequent pages will consume ✅

**Completed Components**:

- Settings store (useSettingsStore) with full CRUD operations
- Select, Toggle, RadioGroup form components
- Settings modal with 4 tabs (Appearance, Regional & Time, Notifications, Data & Privacy)
- Card-based layout matching About page visual language
- Import/Export settings functionality
- Reset to defaults with confirmation
- All components fully typed with zero `any` usage
- Mobile-first responsive design throughout
- Full-screen modal on mobile (no wasted space)
- Visible scrollbar on mobile for tab navigation
- Density mode support (compact/comfortable/spacious)
- Animation toggle support
- Consistent button sizing in footer

**Design Language Documentation**:

- Created comprehensive DESIGN_LANGUAGE.md
- Documents all component patterns and usage
- Mobile UX patterns (scrollable containers, full-screen modals)
- Accessibility guidelines
- Spacing, typography, and color systems
- Anti-patterns and what to avoid
- Real examples from codebase

### Phase 6: Statistics and Graphs ✅ COMPLETE

**Implementation Complete** ✅:

- ✅ Added chart.js, react-chartjs-2, chartjs-plugin-datalabels dependencies
- ✅ Created reusable chart components:
  - ChartContainer wrapper with Catppuccin theming
  - SignalLevelChart (line chart for signal distribution)
  - AlertTermsChart (bar chart for alert term frequency)
  - FrequencyChart (bar chart for decoder frequency distribution)
  - MessageCountChart (bar chart for message statistics)
- ✅ Implemented real-time chart updates via Socket.IO
- ✅ Added statistics data to AppStore (alertTermData, signalFreqData, signalCountData)
- ✅ Updated useSocketIO hook to listen for signal_freqs and signal_count events
- ✅ Complete Stats page implementation with:
  - Interactive RRD time-series charts with Chart.js (1hr, 6hr, 12hr, 24hr, 1wk, 30day, 6mon, 1yr)
  - Dynamic tab switcher for time periods and decoder types
  - Real-time data fetching from RRD database via Socket.IO
  - Signal level distribution chart
  - Alert terms frequency chart
  - Frequency distribution charts per decoder type (ACARS, VDLM, HFDL, IMSL, IRDM)
  - Message count statistics (data and empty messages)
- ✅ Chart SCSS with Catppuccin theming and responsive design
- ✅ Mobile-first responsive layout for all charts
- ✅ Density mode support (compact/comfortable/spacious)
- ✅ All TypeScript strict mode checks passing
- ✅ All Biome checks passing

**Backend Implementation** ✅:

- Created `rrd_timeseries` Socket.IO handler in `rootfs/webapp/acarshub.py`
- Fetches RRD data from `/run/acars/acarshub.rrd` using `rrdtool.fetch()`
- Returns JSON with all 7 data sources: ACARS, VDLM, HFDL, IMSL, IRDM, TOTAL, ERROR
- Supports all 8 time periods with appropriate RRA resolutions
- Graceful error handling for local test mode and missing database

**Frontend Implementation** ✅:

- Created `TimeSeriesChart` component with Chart.js line charts
- Created `TabSwitcher` component for time period and decoder selection
- Created `useRRDTimeSeriesData` custom hook for Socket.IO data fetching
- Dynamic decoder tabs based on enabled decoders (from `decoders` state)
- Full Catppuccin theming integration (Mocha/Latte)
- Mobile-first responsive design
- Proper TypeScript types (zero `any` usage)
- Chart.js time-series support with `chartjs-adapter-date-fns`

**Key Features**:

- **Dynamic Tab System**: Time periods (1hr → 1yr) + Decoder types (Combined, ACARS, VDLM, HFDL, IMSL, IRDM, Errors)
- **Interactive Charts**: Hover tooltips, responsive scaling, theme-aware colors
- **Real-time Updates**: Data fetched on-demand via Socket.IO
- **Consistent Theming**: Matches Catppuccin design language throughout
- **Accessibility**: Keyboard navigation, ARIA labels, 44px touch targets

**Completed Components**:

- **Backend**: `rrd_timeseries` Socket.IO event handler with RRD database querying
- **TimeSeriesChart**: Chart.js line chart component with Catppuccin theming
- **TabSwitcher**: Reusable tab navigation component (horizontal scroll, keyboard nav)
- **useRRDTimeSeriesData**: Custom hook for RRD data fetching
- **ChartContainer**: Wrapper with title/subtitle support
- **SignalLevelChart**: Float filtering for legacy database
- **AlertTermsChart**: Tol color palette (12 colors)
- **FrequencyChart**: Rainbow color palette with "Other" aggregation
- **MessageCountChart**: Separate charts for data/empty messages
- **Stats page SCSS**: Print styles, animation support, tab switcher styles
- **Socket.IO types**: Added `rrd_timeseries` and `rrd_timeseries_data` events
- **Dependencies**: Added `chartjs-adapter-date-fns` and `date-fns` for time-series support

**Technical Notes**:

- Flask-SocketIO requires namespace as third argument: `socket.emit("event", data, "/main")`
- TypeScript doesn't recognize this syntax, requires `@ts-expect-error` comment
- Chart.js v4 uses `border.display` instead of deprecated `grid.drawBorder`
- All TypeScript strict mode checks passing
- All Biome lint/format checks passing
- Production build successful (648 KB gzipped)

### Phase 7: Live Messages (Core Functionality) ✅ COMPLETE

**Implementation Complete** ✅:

- ✅ Created MessageCard component for individual ACARS message display
- ✅ Created MessageGroup component with tab navigation for multiple messages per aircraft
- ✅ Created MessageFilters component with:
  - Text search across message content
  - Label filtering (exclude specific message types via modal)
  - Filter no-text messages toggle
  - Show alerts-only toggle
  - Pause/resume live updates
- ✅ Complete LiveMessagesPage implementation with:
  - Real-time message updates via Socket.IO
  - Filtering by text, label, alerts, and no-text messages
  - Pause functionality (freezes display while continuing to receive in background)
  - Statistics display (aircraft count, message count, alert count)
  - localStorage persistence for filter preferences
  - Mobile-first responsive design
- ✅ Comprehensive SCSS styling with Catppuccin theming
- ✅ All message fields displayed:
  - Aircraft identifiers (tail, flight, ICAO)
  - Message metadata (timestamp, station, type, label)
  - Addresses (to/from with hex conversion)
  - Flight information (DEPA, DSTA, ETA, gate times, runway times)
  - Position data (lat/lon/altitude)
  - Technical details (frequency, ACK, mode, block ID, message number)
  - Signal level, error status, duplicates, multi-part messages
  - Message content (text, data, decoded)
  - **Decoder Support**: decodedText from @airframes/acars-decoder with full/partial decode levels
  - **Libacars Support**: Parsed and formatted libacars data (CPDLC, frequency info, generic)
  - **Alert Highlighting**: Matched alert terms highlighted in red within message content
  - Alert match information with matched terms highlighted
- ✅ Tab navigation for aircraft with multiple messages
- ✅ Keyboard navigation support (arrow keys, focus management)
- ✅ Accessibility features (ARIA labels, roles, 44px touch targets)
- ✅ Performance optimizations:
  - React.memo for MessageCard and MessageGroup
  - useMemo for filtered message lists
  - Efficient re-rendering with proper keys
- ✅ Settings integration (time/date format, density mode, animations)
- ✅ All TypeScript strict mode checks passing
- ✅ All Biome checks passing
- ✅ Production build successful (1,086 KB / 336 KB gzipped)
- ✅ Client-side ACARS decoding with @airframes/acars-decoder library
- ✅ Node.js polyfills configured for browser compatibility (events, stream, buffer, util, zlib)
- ✅ zlib polyfill required for minizlib dependency (used by decoder)
- ✅ Duplicate detection with three strategies (full field, text, multi-part)
- ✅ Multi-part message merging with re-decoding
- ✅ **Message Groups (not Aircraft)** - proper terminology for all message sources
- ✅ **Global state architecture** - message groups shared between Live Messages and Live Map
- ✅ **Two-level culling system** - messages per group + total groups limit
- ✅ **Accurate group counting** - reflects actual groups in memory, not total received

**Completed Components**:

- **MessageCard**: Displays single ACARS message with all fields, decoder output, libacars data
- **MessageGroup**: Handles message groups (aircraft/stations) with multiple messages, tab navigation
- **MessageFilters**: Filter toolbar with search, toggles, label modal
- **LiveMessagesPage**: Main page with filtering logic, statistics, state management
- **MessageGroup Type** (formerly Plane):
  - `identifiers[]` - All known IDs (flight, tail, icao_hex)
  - `messages[]` - Array of messages (newest first, limited by settings)
  - `lastUpdated` - Unix timestamp for culling oldest groups
  - `has_alerts`, `num_alerts` - Alert tracking
- **messageDecoder**: Singleton service for client-side ACARS message decoding
  - Wraps `@airframes/acars-decoder` library
  - Decodes messages in Zustand store before display
  - Type-safe wrapper with error handling
  - Only adds `decodedText` if decoding successful
  - **Duplicate Detection Functions**:
    - `checkForDuplicate()` - Full field comparison (text, data, libacars, location, times)
    - `isMultiPartMessage()` - Detect multi-part sequences (AzzA, AAAz patterns)
    - `checkMultiPartDuplicate()` - Track duplicate parts with counters
    - `mergeMultiPartMessage()` - Merge text and re-decode combined message
- **decoderUtils**: Complete decoder formatting utilities for decodedText and libacars
  - `formatDecodedText()` - Process @airframes/acars-decoder output
  - `parseAndFormatLibacars()` - Parse and format libacars JSON strings
  - `highlightMatchedText()` - Highlight alert terms in message content
  - `loopDecodedArray()` - Process decoded text item structures
- **Type Definitions**:
  - `DecodedText`, `DecodedTextItem` - Proper typing for ACARS decoder output
  - `LibacarsData`, `LibacarsFrequencyData`, `LibacarsCPDLC` - Libacars decoder types
- **SCSS**: Complete styling in `pages/_live-messages.scss` with 1000+ lines
  - Alert highlighting styles (`.alert-highlight`)
  - Libacars content styles (`.libacars-content`, `.libacars-freq-data`, etc.)
  - Responsive visibility (`.message-content--hide-small`)
- **Mixins**: Added `breakpoint()`, `breakpoint-max()`, and `scrollbar-thin` mixins
- **Theme**: Added color shortcuts and RGB variables to theme mixins
- **Settings Integration**:
  - `maxMessagesPerAircraft` (10-200, default 50) - Messages per group
  - `maxMessageGroups` (10-200, default 50) - Total groups in memory
  - Culling system automatically removes oldest groups when limit exceeded

**Key Features**:

- **Real-time Updates**: Messages appear instantly via Socket.IO
- **Comprehensive Filtering**: Text search, label exclusion, alerts-only, no-text filter
- **Pause Functionality**:
  - **Freezes display** on pause - takes snapshot of current message state
  - **Background processing continues** - messages decoded, duplicates detected, multi-part merged
  - **Instant resume** - display immediately shows all messages that arrived during pause
  - **Persistent state** - pause state saved to localStorage across page refreshes
  - **Performance optimized** - frozen snapshot via useMemo prevents unnecessary re-renders
- **Statistics**: Live counters for aircraft, messages, hidden messages, alerts
- **Persistent Preferences**: Filter settings saved to localStorage
- **Advanced Decoding**:
  - **Client-side decoding** with @airframes/acars-decoder library (matches legacy implementation)
  - Decoding happens in Zustand store when messages received via Socket.IO
  - Full support for formatted label/value pairs from decoder
  - Complete libacars decoder integration (CPDLC messages, frequency data, generic types)
  - Alert term highlighting within message text/data with visual emphasis
  - Smart display logic: hide raw text on mobile when decoded text available
  - Node.js polyfills (events, stream, buffer) for browser compatibility
- **Duplicate Detection & Multi-Part Messages**:
  - **Three detection strategies**: Full field match, text match, multi-part sequence
  - **Full field duplicate**: Compares 13 fields (text, data, libacars, location, times)
  - **Multi-part detection**: Matches AzzA (e.g., M01A, M02A) and AAAz (e.g., AAA1, AAA2) patterns
  - **Multi-part merging**: Appends text fields, tracks parts in `msgno_parts` (e.g., "M01A M02A")
  - **Duplicate tracking**: Increments counter (e.g., duplicates: "1", "2", "3")
  - **Part duplicate tracking**: Shows duplicate parts (e.g., msgno_parts: "M01A M02Ax2 M03A")
  - **Re-decoding**: Merged multi-part text re-decoded for accurate output
  - **Message promotion**: Duplicate/multi-part messages moved to front of aircraft list
  - **Time-based filtering**: Multi-part messages must be within 8 seconds
  - **Station separation**: ACARS and VDLM messages kept separate
- **Message Group Architecture** (Critical):
  - **Terminology**: Message Group (not Aircraft) - can be aircraft, ground station, or unknown source
  - **Global state**: Stored in Zustand (shared between Live Messages and Live Map)
  - **Two-level culling**:
    - Level 1: `maxMessagesPerAircraft` (default 50) - messages per group
    - Level 2: `maxMessageGroups` (default 50) - total groups in memory
  - **Automatic culling**: Oldest groups (by `lastUpdated`) removed when limit exceeded
  - **Accurate counting**: "Aircraft" count = actual groups in memory (not total received)
  - **Future ready**: Count will include ADS-B-only aircraft when integrated
- **Client-Side Alert Matching**:
  - **Alert term checking** - Messages checked against alert terms on arrival
  - **Word boundary matching** - Uses regex `\b{term}\b` (same as backend logic)
  - **Ignore terms support** - Excludes matches when ignore terms also present
  - **Multi-field search** - Checks text, data, and decoded_msg fields
  - **Automatic flagging** - Sets `matched=true` and `matched_text[]` on messages
  - **Alert highlighting** - Matched terms highlighted in red within message content
  - **Live statistics** - Alert count updated in navigation bar in real-time
  - **Type-safe implementation** - Zero `any` usage with proper regex escaping
- **Comprehensive Text Search**:
  - **40+ searchable fields** - text, data, identifiers, metadata, flight info, numeric fields
  - **Smart filtering** - identifier match shows all messages, otherwise filters individual messages
  - **Live filtering** - new messages appear only if they match active search
  - **Clear button** - instant search reset
  - **Type-safe helpers** - `fieldMatches()` for strings, `numberMatches()` for numbers
  - **Performance optimized** - useMemo prevents unnecessary re-filtering
  - **Works with other filters** - combines with pause, labels, alerts, no-text filters
- **Mobile-First**: Fully responsive from 320px to 4K displays
- **Accessibility**: WCAG AA compliant with keyboard navigation
- **Performance**: Bounded memory usage, efficient culling, handles sustained load

**Backend Refactoring** ✅:

- **flight_finder() cleanup** (rootfs/webapp/acarshub_helpers.py):
  - **Removed**: All HTML generation, tooltips, and ADSB URL embedding
  - **Removed**: `url` parameter and `hex_code` parameter
  - **Now returns**: Clean data tuple `(airline_name, iata_flight, icao_flight)`
  - **Breaking change**: Always returns structured data, no URL generation
  - **Benefits**: Complete separation of data and presentation layers
- **New JSON fields** sent to frontend:
  - `airline` - Airline name (e.g., "United Airlines")
  - `iata_flight` - IATA format flight number (e.g., "UA123")
  - `icao_flight` - ICAO format flight number (e.g., "UAL123")
- **Display logic**:
  - Top identifiers section: Shows ICAO flight only (clean, no airline)
  - Message fields section: Shows IATA callsign and airline name separately
  - Search: All three fields searchable (icao_flight, iata_flight, airline)
  - Grouping: Uses icao_flight for proper message grouping (IATA/ICAO variants group together)

**Documentation**:

- `PAUSE_FUNCTIONALITY.md` - Complete pause/resume implementation details
- `MESSAGE_GROUPS_AND_CULLING.md` - Critical architecture for message groups and memory management
- `DECODER_FEATURES.md` - Complete decoder implementation (decodedText, libacars, duplicates, multi-part)
- `SEARCH_FUNCTIONALITY.md` - Comprehensive text search across 40+ message fields (includes airline, iata_flight, icao_flight)
- `acarshub-react/src/utils/alertMatching.ts` - Client-side alert matching implementation

**Deliverable**: Fully functional message viewer with proper architecture and clean backend API ✅

### Phase 8: Live Map 🚧 IN PROGRESS

**Goal**: High-performance aircraft map with custom Catppuccin theming

**Technology Stack**:

- **MapLibre GL JS** - WebGL-based map rendering (high performance)
- **react-map-gl** - React wrapper for MapLibre
- **CartoDB** - Default tile provider (free, no API key required)
- **Maptiler** - Optional tile provider (requires free/paid API key)

**Why MapLibre over Leaflet**:

- ✅ **GPU-accelerated rendering** - Smooth with 100+ aircraft markers
- ✅ **Better performance** - 60fps with many markers vs Leaflet's 30fps
- ✅ **Flexible tile support** - Raster tiles (CartoDB) or vector tiles (Maptiler)
- ✅ **Theme-aware** - Dark (Mocha) and Light (Latte) map styles
- ✅ **Modern stack** - Future-proof, actively maintained

**Map Providers Strategy**:

- Default: CartoDB (No API Key Required)
  - Free raster tiles: Dark Matter (dark theme) and Light All (light theme)
  - No signup, no API key, unlimited use
  - CORS-friendly (works from localhost and any domain)
  - Professional-looking dark/light map styles
  - Widely used in aviation and tracking applications

- Optional: Maptiler (API Key in Settings)
  - Users can add free/paid Maptiler API key in Settings
  - Unlocks vector tiles and additional professional styles
  - Free tier: 100,000 map loads/month
  - Settings UI: "Map Provider: CartoDB (default) | Maptiler (requires API key)"

**ADS-B Data Flow Refactoring** ✅ COMPLETE:

- ✅ Backend polls aircraft.json every 5 seconds (via background task)
- ✅ Backend optimizes payload (52 fields → 13 fields = 75% reduction)
- ✅ Backend broadcasts via Socket.IO `adsb_aircraft` event
- ✅ Frontend receives data via Socket.IO (no polling, no fetch)
- ✅ Clean separation: backend owns data fetching, frontend just displays
- ✅ Removed `url`, `bypass`, `flight_tracking_url` from `features_enabled` event
- ✅ TypeScript types updated (`ADSBAircraft`, `ADSBData`)
- ✅ All quality checks passing (TypeScript, build)

**Implementation Tasks**:

#### Map Rendering & Theming ✅ COMPLETE

- ✅ Install `maplibre-gl` and `react-map-gl` dependencies
- ✅ Create MapLibre map component with CartoDB raster tiles
- ✅ Create Catppuccin Mocha style JSON (dark theme with CartoDB Dark Matter)
  - Uses CartoDB Dark Matter raster tiles with Catppuccin background
- ✅ Create Catppuccin Latte style JSON (light theme with CartoDB Light All)
  - Uses CartoDB Light All raster tiles with Catppuccin background
- ✅ Implement theme switching (loads appropriate style JSON)
- ✅ Add Maptiler provider option in Settings store
- ✅ Add Maptiler API key input in Settings modal
- ✅ Implement provider switching logic (CartoDB vs Maptiler)

#### ADS-B Data Flow ✅ COMPLETE

- ✅ Backend background task polls aircraft.json every 5 seconds
- ✅ Field optimization (13 essential fields from 52 total)
- ✅ Socket.IO `adsb_aircraft` event with optimized payload
- ✅ Frontend Socket.IO listener and Zustand store integration
- ✅ TypeScript types: `ADSBAircraft`, `ADSBData` interfaces
- ✅ Removed frontend polling logic (clean architecture)

#### Aircraft Markers & Pairing ✅ COMPLETE

- ✅ Port aircraft SVG icons from legacy (getBaseMarker, svgShapeToURI)
- ✅ Implement MapLibre markers with aircraft rotation
- ✅ Color-coding logic (alerts, ACARS messages, signal strength)
- ✅ Hover tooltips with aircraft details
- ✅ Performance optimization for 100+ markers
- ✅ Complete aircraft icon library (1,477 lines, **81 shapes**, 300+ type mappings)
- ✅ AircraftMarkers component (277 lines)
- ✅ **Theme-aware colors** - Icons use Catppuccin CSS variables (adapt to Mocha/Latte)
- ✅ Integration with ACARS message system (color coding)
- ✅ **Intelligent ADS-B ↔ ACARS pairing** with three strategies:
  - ✅ Hex match (ICAO 24-bit address) - highest priority
  - ✅ ICAO callsign match (flight number) - medium priority
  - ✅ Tail/registration match - fallback
- ✅ **Hover tooltips** showing:
  - ✅ Callsign/tail/hex (priority order)
  - ✅ Match strategy badge (hex/flight/tail)
  - ✅ Altitude, speed, heading
  - ✅ Aircraft type
  - ✅ Message count (green highlight)
  - ✅ Alert count (red highlight)
- ✅ Accessibility: Semantic `<button>` elements, keyboard navigation, ARIA labels
- ✅ Density mode support (compact/comfortable/spacious)
- ✅ Mobile responsive tooltips
- ✅ **Click handlers for aircraft messages**:
  - ✅ Click marker → open ACARS messages modal
  - ✅ Modal displays MessageGroup component (reuses Live Messages display)
  - ✅ Keyboard support (Escape to close)
  - ✅ Click outside to close
  - ✅ Focus management for accessibility
  - ✅ Mobile-first full-screen modal layout
  - ✅ Desktop centered dialog with animations
  - ✅ Theme-aware with Catppuccin colors
  - ✅ Only aircraft with paired messages are clickable

#### Map Features & Overlays

- ✅ **Range rings from station location** (dynamic viewport-based sizing)
  - ✅ GeoJSON-based circle rendering (64-point polygon with great circle formula)
  - ✅ **Dynamic radii calculation** - automatically adjusts to viewport zoom level
  - ✅ Always shows 3 rings that fit current view perfectly
  - ✅ **Distance to nearest edge calculation** - prevents clipping at viewport boundaries
  - ✅ **70% safety margin** - optimal balance between ring size and clipping prevention
  - ✅ Smart interval rounding (multiples of 10, 20, 50, 100, 200, 500, etc.)
  - ✅ Real-time recalculation as user zooms/pans the map
  - ✅ Theme-aware styling with Catppuccin colors
  - ✅ **Cardinal direction labels** - distance text at N, S, E, W positions on each ring (5% outside ring)
  - ✅ Bold text with strong halos for readability on any background
  - ✅ **Privacy protection** - completely disabled if backend sets `ENABLE_RANGE_RINGS=false`
  - ✅ Toggle button hidden when backend disables range rings
  - ✅ Station location from settings or backend decoder config
  - ✅ Fallback to static rings from settings if viewport unavailable
- ✅ **NEXRAD weather radar overlay** (WMS tiles from Iowa State Mesonet)
  - ✅ MapLibre GL JS raster layer integration with Source/Layer components
  - ✅ Auto-refresh every 5 minutes with timestamp display
  - ✅ Theme-aware timestamp styling (Catppuccin Mocha/Latte)
  - ✅ Toggle button in MapControls (cloud-sun-rain icon)
  - ✅ Settings store integration (showNexrad preference)
  - ✅ Mobile-responsive timestamp positioning
  - ✅ Reduced motion support
- ✅ **Station marker (ground receiver location)**
  - ✅ Pulsing animated marker showing receiver position
  - ✅ Theme-aware with Catppuccin red color scheme
  - ✅ Respects reduced motion preferences
  - ✅ Station location priority: user settings → backend config
  - ✅ Accessible with ARIA labels and SVG title
- ✅ **Aircraft list sidebar** (sortable, filterable)
  - ✅ Sortable by callsign, altitude, speed, messages, alerts
  - ✅ Text search across callsign, hex, tail, type
  - ✅ Filter toggles (ACARS-only, alerts-only)
  - ✅ Hover sync with map markers
  - ✅ Click to center map on aircraft
  - ✅ Persistent filter/sort preferences to localStorage
  - ✅ Mobile-responsive table layout
  - ✅ Theme-aware with Catppuccin colors
  - ✅ Real-time updates from Socket.IO
- ✅ Map controls (NavigationControl, ScaleControl)

#### Filtering & Display Options

- ✅ Show only aircraft with ACARS messages toggle (in aircraft list)
- ✅ Show/hide range rings toggle (MapControls component, hidden if backend disables)
- ✅ Show only alerts toggle (in aircraft list)
- ⏳ Show only unread messages toggle
- ⏳ Mark all messages as read action
- ✅ Filter persistence to localStorage (aircraft list filters)
- ❌ Show/hide data blocks toggle (removed - not implemented)
- ❌ Show/hide extended data blocks toggle (removed - not implemented)
- ✅ Show/hide NEXRAD overlay toggle (MapControls component)
- ✅ **Show only unread messages toggle** (aircraft list filter)
- ✅ **Mark all messages as read action** (aircraft list button with unread count)

#### Aircraft List & Sorting ✅ COMPLETE

- ✅ Sortable columns (callsign, altitude, speed, messages, alerts)
- ✅ Ascending/descending toggle (click same column to toggle)
- ✅ Highlight hovered aircraft (from list or map)
- ✅ Click to center map on aircraft (with flyTo animation)
- ✅ Hover sync between list and map markers (bidirectional)

#### Integration with Message System

- ✅ Connect to messageGroupsStore (shared with Live Messages)
- ✅ Display ACARS message count per aircraft (in hover tooltip)
- ✅ Show alert indicators for aircraft with alerts (color coding + tooltip)
- ✅ Click aircraft → open messages modal (AircraftMessagesModal component)
- ✅ **Unread message tracking** (complete system with localStorage persistence)
  - ✅ Read state tracked in AppStore (Set of message UIDs)
  - ✅ Automatic marking as read when modal opened
  - ✅ Mark all messages as read button with live unread count
  - ✅ Unread-only filter in aircraft list
  - ✅ Persistent read state across page refreshes
- ✅ Real-time updates via Socket.IO (ADS-B positions via `adsb_aircraft` event)

#### Settings Integration

- ✅ Map provider selection (Protomaps/Maptiler)
- ✅ Maptiler API key input
- ✅ Station lat/lon configuration
- ✅ Range ring radii configuration
- ✅ Default map center/zoom
- ✅ Display preferences persistence

**Style JSON Files** (New):

- `acarshub-react/src/styles/map-styles/catppuccin-mocha.json` - Dark theme
- `acarshub-react/src/styles/map-styles/catppuccin-latte.json` - Light theme

**Dependencies to Add**:

```json
{
  "maplibre-gl": "^4.7.1",
  "react-map-gl": "^7.1.7"
}
```

**Performance Expectations**:

- 100+ aircraft markers at 60fps (vs Leaflet ~30fps)
- Smooth zoom/pan with GPU acceleration
- Native rotation support (no CSS transform hacks)
- MapLibre bundle: ~1MB (275KB gzipped)

**CartoDB Free Tier**:

- Truly unlimited tile requests (reasonable use policy)
- No API key or signup required
- CORS-enabled for browser access
- Suitable for personal/hobbyist aviation tracking
- Fallback: Users can add Maptiler key for vector tiles

**Testing Requirements**:

- Test with 0, 1, 10, 50, 100, 200+ aircraft
- Verify smooth performance on mobile devices
- Test theme switching (Mocha ↔ Latte)
- Test provider switching (CartoDB ↔ Maptiler)
- Verify all legacy features work (data blocks, NEXRAD, etc.)
- Test keyboard navigation and accessibility
- Test CORS access from localhost and production domains

**Deliverable**: High-performance real-time aircraft map with Catppuccin-aware theming (CartoDB Dark/Light), no API key required by default

**Status**:

- ✅ Map rendering complete with CartoDB raster tiles
- ✅ Theme switching functional (Mocha/Latte)
- ✅ Settings integration complete
- ✅ ADS-B data flow refactored (backend polling, Socket.IO push, 75% payload reduction)
- ✅ Aircraft markers complete (SVG icons, rotation, color coding, 100+ aircraft capable)
- ✅ **ADS-B ↔ ACARS pairing complete** (hex > callsign > tail matching)
- ✅ **Hover tooltips complete** (comprehensive aircraft details, theme-aware, accessible)
- ✅ **Click handlers complete** (AircraftMessagesModal opens on click, full message display)
- ✅ **Aircraft list sidebar complete** (sortable, filterable, hover sync, localStorage persistence)
- ✅ **Station marker complete** (pulsing animation, theme-aware, accessible)
- ✅ **Range rings complete** (dynamic sizing, 70% margin, cardinal labels, privacy protection)
- ✅ **Map controls complete** (MapControls component with privacy-aware toggle buttons)
- ✅ **NEXRAD overlay complete** (WMS raster tiles, auto-refresh, timestamp display)
- ✅ **Unread message tracking complete** (AppStore integration, auto-mark read, filters, localStorage)
- ✅ **Map controls complete** (NavigationControl with zoom buttons, ScaleControl with nautical miles)
- ✅ **Phase 8: Live Map COMPLETE** 🎉

**All Live Map features implemented:**

- High-performance MapLibre GL JS rendering
- Catppuccin-themed map styles (Mocha/Latte)
- Aircraft markers with rotation and color coding
- ADS-B ↔ ACARS pairing (hex > callsign > tail)
- Hover tooltips with aircraft details
- Click handlers to open message modals
- Sortable, filterable aircraft list sidebar
- Station marker with pulsing animation
- Dynamic range rings with privacy protection
- NEXRAD weather radar overlay
- Unread message tracking system
- Navigation controls (zoom buttons, scale bar with nautical miles)
- All filters persist to localStorage
- Mobile-first responsive design
- Full accessibility support

### Phase 9: Alerts and Search ✅ COMPLETE

**Implementation Complete** ✅:

- ✅ Complete Alerts page implementation
- ✅ Complete Search page implementation
- ✅ Socket.IO integration for database queries
- ✅ Alert sound notifications
- ✅ Multi-field search with pagination
- ✅ All TypeScript strict mode checks passing
- ✅ All Biome checks passing
- ✅ Production build successful (1,309 KB / 413 KB gzipped)

**Alerts Page Features**:

- **Alert Term Management**:
  - Display messages matching configured alert terms
  - Filter messages by text terms, callsigns, tail numbers, ICAO hex codes
  - Support for ignore terms (negative matching)
  - Real-time alert matching using existing alertMatching utility
- **User Interface**:
  - Empty state when no terms configured (links to Settings)
  - Empty state when no matches (shows active terms)
  - Sound toggle button (mute/unmute with FontAwesome icons)
  - Statistics display (total alerts, unique aircraft, active terms)
  - Reuses MessageGroup component for display consistency
- **Sound Notifications**:
  - Optional sound alerts for new matches
  - Debounced to prevent spam (2-second minimum between alerts)
  - Volume control from Settings store
  - Audio file: `/static/sounds/alert.mp3`
  - useCallback optimization for playAlertSound
- **Settings Integration**:
  - Reads sound and volume from notifications settings
  - Page-specific sound toggle (doesn't persist to settings)
  - Alert terms managed in AppStore (Terms interface)

**Search Page Features**:

- **Multi-Field Search Form**:
  - Flight number
  - Tail number
  - ICAO hex code
  - Departure airport (DEPA)
  - Destination airport (DSTA)
  - Frequency
  - Message label
  - Message number
  - Message text (full-text search)
  - Station ID
- **Search Functionality**:
  - Debounced search (500ms after typing stops)
  - Manual search submit button
  - Clear all fields button
  - Empty state detection (clears results)
  - Real-time search as user types
- **Pagination System**:
  - 50 results per page
  - Smart page number display (shows first, last, current range, ellipsis)
  - Previous/Next navigation
  - Dual pagination (top and bottom of results)
  - Jump to page capability
  - Scroll to top on page change
- **Results Display**:
  - Reuses MessageCard component for consistency
  - Query time display (milliseconds)
  - Result count display
  - Loading state during search
  - Empty state when no results
- **Backend Integration**:
  - Socket.IO `query_search` event with proper payload structure
  - Payload: `{ search_term: CurrentSearch, results_after?: number }`
  - Receives `database_search_results` event with SearchHtmlMsg
  - Type-safe Socket.IO communication (with necessary any escape hatch)

**Completed Components**:

- **AlertsPage.tsx** (271 lines):
  - Filters message groups to show only alerts
  - Calculates statistics (totalAlerts, uniqueAircraft)
  - Sound toggle and playback logic
  - Empty states and term display
  - Full Catppuccin theming
- **AlertsPage.scss** (235 lines):
  - Empty state styling
  - Term badge displays
  - Sound toggle button
  - Density mode support
  - Mobile-first responsive design
- **SearchPage.tsx** (560 lines):
  - Search form with 10 input fields
  - Debounced search logic
  - Pagination calculations and rendering
  - Socket.IO query emission
  - Results display
- **SearchPage.scss** (355 lines):
  - Responsive 3-column grid (mobile → tablet → desktop)
  - Form field styling
  - Pagination button styling
  - Loading and empty states
  - Full Catppuccin theming

**Type Definitions Updated**:

- **CurrentSearch interface** - Already existed in types/index.ts
- **SearchHtmlMsg interface** - Already existed
- **SocketEmitEvents.query_search** - Updated to match backend API:

  ```typescript
  query_search: (params: {
    search_term: CurrentSearch;
    results_after?: number;
    show_all?: boolean;
  }) => void;
  ```

**Backend Compatibility**:

- Backend handler: `@socketio.on("query_search", namespace="/main")`
- Backend delegates to: `acarshub_helpers.handle_message(message)`
- Frontend sends correct payload structure matching backend expectations
- Socket.IO namespace: `/main`
- Results sent only to requester (not broadcast)

**Key Technical Decisions**:

- **Sound management**: useCallback wrapper prevents recreation on every render
- **Pagination keys**: Use page number context instead of array index for unique keys
- **Socket.IO typing**: Use `(socket as any).emit()` with biome-ignore for backend compatibility
- **Component reuse**: MessageCard and MessageGroup components reused from Live Messages
- **Empty states**: Clear guidance for users on how to configure alerts or search
- **Debouncing**: 500ms delay prevents hammering database with every keystroke

**Mobile-First Design**:

- Search form: 1 column mobile → 2 columns tablet → 3 columns desktop
- Pagination: Wraps on small screens, horizontal on desktop
- Form fields: Full width labels, 44px touch targets
- Empty states: Responsive padding and typography
- Term badges: Wrap naturally on small screens

**Accessibility**:

- All form inputs properly labeled
- Keyboard navigation for pagination
- Focus states on all interactive elements
- ARIA labels on icon-only buttons
- Semantic HTML structure
- 44px minimum touch targets

**Performance Optimizations**:

- useMemo for filtered message groups
- useMemo for pagination calculations
- useCallback for playAlertSound
- Debounced search prevents excessive queries
- Results limited to 50 per page

**Deliverable**: Complete alert management and database search functionality ✅

**Post-Phase 9 Improvements**:

- **Shared Component Styling Extraction**:
  - Created `/components/_message-card.scss` (486 lines) - All message card display styles
  - Created `/components/_message-group.scss` (328 lines) - Message group and tab navigation styles
  - Both components imported in `main.scss` for global availability
  - Consistent styling across Live Messages, Search, Alerts, and Map modal
  - Includes: message types, identifiers, fields, content, libacars, alert highlighting
  - Full support: density modes, animations, reduced motion, print styles
  - Mobile-first responsive design throughout

- **Search Page Card Styling**:
  - Each MessageCard wrapped in `.search-page__result-card` container
  - Matches visual appearance of Live Messages page
  - Proper borders, backgrounds, hover effects
  - Catppuccin theming with responsive layout

- **Map Modal Consistency**:
  - AircraftMessagesModal automatically inherits shared component styles
  - MessageGroup component displays with proper card styling
  - Tab navigation and message cards themed consistently
  - No modal-specific overrides needed

### Phase 9.1: Notifications & Alert Management 🚧 IN PROGRESS

**Goal**: Complete the notification system and alert term management

**Current State Issues**:

- Sound alerts work on Alerts page but Settings says "Coming Soon" (inconsistency)
- Desktop notifications not implemented
- Alert terms are client-side only (no persistence)
- Alert badge shows total alerts instead of unread (misleading)

#### Phase 9.1.1: Fix Sound Alerts (Quick Win) ✅ COMPLETE

**Goal**: Resolve inconsistency between Alerts page and Settings

- ✅ Remove local sound toggle from AlertsPage
- ✅ Wire sound playback to Settings store exclusively
- ✅ Enable sound toggle in Settings Modal (remove "Coming Soon" and disabled state)
- ✅ Enable volume slider in Settings Modal
- ✅ Add alert sound file to public assets (`/static/sounds/alert.mp3`)
- ✅ Test sound playback with Settings integration

**Completed Changes**:

- Removed local `soundEnabled` state and toggle button from AlertsPage
- Settings Modal sound toggle is now enabled and functional
- Volume slider is now enabled when sound is on
- Alert sound file copied from legacy codebase to `public/static/sounds/alert.mp3`
- Updated Settings Modal card variant to "success" with updated help text
- **Created shared `audioService.ts`** - Single Audio element shared across entire app
- **Added auto-unlock on first user interaction** - Audio automatically unlocks on first click/keypress/touch
- **Created `AlertSoundManager` component** - Global sound manager that works on ALL pages
- **Added AlertSoundManager to App.tsx** - Renders at app level, monitors alertCount globally
- Settings Modal uses `audioService.playAlertSound()` for Test Sound button
- AlertsPage no longer handles sound (delegated to global manager)
- Removed unused autoplay warning styles from AlertsPage.scss
- AppStore `addMessage()` auto-calculates global `alertCount` on every message
- All TypeScript and Biome checks passing
- Production build successful (1,311 KB / 413 KB gzipped)

**Key Architecture Changes**:

- **Global Sound System**: AlertSoundManager component runs at app level, plays sounds on ANY page (Live Messages, Map, Stats, etc.)
- **Shared Audio Element**: Single Audio instance in audioService prevents browser autoplay blocking per-component
- **Alert Count Monitoring**: Tracks `alertCount` from AppStore, plays sound when count increases
- **Debouncing**: 2-second minimum between alert sounds to prevent spam
- **Comprehensive Logging**: Debug logs show exactly when/why sounds play or are blocked

**Browser Autoplay Behavior (Firefox vs Chromium)**:
Browser autoplay policies differ significantly between Firefox and Chromium-based browsers (Chrome, Brave, Edge):

**Firefox** ✅:

- Audio permissions persist across page reloads
- Clicking "Test Sound" once is sufficient
- Alert sounds work automatically after initial unlock
- Best user experience for alert sounds

**Chromium Browsers** (Chrome, Brave, Edge) ⚠️:

- Audio permissions reset on every page reload
- Requires clicking "Test Sound" after each page reload
- This is a fundamental Chromium security policy
- Cannot be bypassed with silent playback or localStorage

**Why Chromium is More Restrictive**:

- Chromium resets autoplay permissions on page reload for security
- Silent playback tricks are detected and blocked
- localStorage persistence doesn't carry over browser audio permissions
- This is intentional behavior to prevent malicious auto-playing audio

**User Experience**:

- **Firefox users**: Click "Test Sound" once, works forever (until browser restart)
- **Chromium users**: Click "Test Sound" once per page reload
- **Recommendation**: Use Firefox for the best alert sound experience
- Settings modal shows browser-specific warning for Chromium users

**How It Works (Per Session)**:

1. User loads page and enables sound in Settings → Notifications
2. User clicks "Test Sound" button → unlocks browser audio for this session
3. User navigates to any page (Live Messages, Map, etc.)
4. New alert arrives → AppStore `addMessage()` automatically calculates and updates `alertCount`
5. AlertSoundManager detects count increase → plays sound via shared audioService
6. Sound plays successfully because Audio element was unlocked via Test Sound
7. **After page reload**: Repeat steps 2-6 (one Test Sound click per session)

**Critical Fix** (alert count auto-calculation):

- Previously: `alertCount` only updated when AlertsPage was active (manual setAlertCount call)
- Problem: If you were on Live Messages/Map/etc., alertCount never updated, so no sound played
- Solution: `addMessage()` now automatically calculates total alerts from all message groups and updates `alertCount`
- Result: Alert sounds now work on ALL pages, not just the Alerts page

**Console Debug Output** (when alert arrives):

```shell
[DEBUG] Alert sound manager: checking for new alerts { soundEnabled: true, alertCount: 5, previousCount: 4 }
[DEBUG] Alert count increased, checking debounce { timeSinceLastAlert: 5432, debounceThreshold: 2000, willPlay: true }
[INFO] Playing alert sound for new alerts { newAlertCount: 5, previousCount: 4 }
[DEBUG] Attempting to play alert sound { volume: 50, audioUnlocked: true }
[INFO] Global alert sound played { alertCount: 5, volume: 50 }
```

**Deliverable**: Sound alerts controlled by Settings → Notifications ✅

#### Phase 9.1.2: Desktop Notifications 🔔 ✅ COMPLETE

**Goal**: Implement browser notifications for alert messages

- ✅ Add permission request flow when user enables desktop notifications
- ✅ Show browser notifications for new alert messages
- ✅ Respect `alertsOnly` setting (only notify for alerts if enabled)
- ✅ Add notification click handler (focus/open Alerts page)
- ✅ Enable desktop notifications toggle in Settings Modal
- ✅ Test on Chrome, Firefox, Safari
- ✅ Handle permission denied gracefully
- ✅ Add notification icon and proper formatting

**Completed Changes**:

- Desktop notifications toggle enabled in Settings Modal
- Permission request flow implemented with browser support detection
- Handles `granted`, `denied`, and `default` permission states
- Alert user with helpful messages when permissions are blocked
- Notifications only trigger for alert messages (matched=true)
- Notification logic moved after alert matching to ensure `matched_text` is populated
- Time-based filtering prevents notifications on page load (only messages within 5 seconds)
- Timestamp conversion fix (backend sends seconds, converted to milliseconds)
- HTML stripping from matched terms (notifications are plain text only)
- Notification body shows only matched terms: "Matched terms: TERM1, TERM2"
- Click handler focuses browser window
- Syncs with Settings store for `desktop` and `alertsOnly` preferences
- All TypeScript and Biome checks passing
- Production build successful

**Key Implementation Details**:

- **Permission Handling**: Checks `'Notification' in window` for browser support
- **Permission Request**: Uses `Notification.requestPermission()` when toggle is enabled
- **Alert-Only Notifications**: Only messages with `matched=true` trigger notifications
- **Time Filtering**: `Date.now() - message.timestamp * 1000 <= 5000` prevents old messages from notifying
- **HTML Stripping**: `stripHtml()` function removes any HTML tags from matched terms
- **Notification Body**: Simple format showing only matched alert terms
- **Click Handler**: `notification.onclick` focuses the browser window

**Browser Behavior**:

- **Firefox**: Works seamlessly, permissions persist across sessions
- **Chrome/Brave/Edge**: Works correctly, permissions persist across sessions
- **Safari**: Works with permission grant
- **Notification Center**: OS-level notification centers may add their own action links (this is normal behavior)

**Known Limitations**:

- Notifications are plain text only (browser API limitation)
- OS notification centers may add automatic links or actions (not controllable via JavaScript)
- Notifications only work when browser tab is open (browser API limitation)
- Some notification centers auto-detect URLs and make them clickable (OS behavior, not a bug)

**Deliverable**: Working desktop notifications with permission handling ✅

#### Phase 9.1.3: Alert Badge & Manual Read Controls 🎯 ✅ COMPLETE

**Goal**: Add explicit "Mark as Read" controls for alert messages

**Design Decision**: Unread alert count in badge, NO auto-mark, explicit user control only

- ✅ Navigation badge shows **unread alerts** (count of alert messages NOT marked as read)
- ✅ NO auto-mark-as-read when visiting Alerts page
- ✅ Add "Mark Read" button on each individual alert message
- ✅ Add "Mark All Alerts Read" button to Alerts page header
- ✅ Alert stats show "X unread / Y total"
- ✅ Read messages have visual styling (reduced opacity)
- ✅ Badge disappears when all alerts marked as read

**Navigation Display**:

```text
Alerts (5)   ← Shows UNREAD alert count
Alerts       ← Badge hidden when all alerts marked as read
```

**Alerts Page Stats**:

```text
5 unread  |  12 total alerts  |  8 aircraft  |  [Mark All Read]
```

**Individual Message Controls**:

- Each alert message has a "Mark Read" button in the header
- Button changes to "Read" badge after clicking
- Read messages have reduced opacity (60%)

**Completed Changes**:

- Added `getUnreadAlertCount()` method to AppStore (counts only unread matched messages)
- Added `markAllAlertsAsRead()` method to AppStore (marks only alert messages as read)
- Added `showMarkReadButton` prop to MessageCard component
- Added `showMarkReadButton` prop to MessageGroup component (passes to MessageCard)
- AlertsPage passes `showMarkReadButton={true}` to all MessageGroup components
- Navigation badge uses `selectUnreadAlertCount` (unread alerts only, reactive to readMessageUids changes)
- MessageCard subscribes to `readMessageUids` Set to trigger re-render when read state changes
- Removed auto-mark-as-read logic from AlertsPage (NO automatic marking)
- MessageCard header displays "Mark Read" button or "Read" badge based on read state
- Button disappears immediately when clicked (component re-renders on readMessageUids update)
- Added `.message-card--read` CSS class (60% opacity for read messages)
- Added `.message-card__mark-read-btn` styling (green button with 44px touch target)
- Added `.message-card__read-badge` styling (gray badge for read state)
- Added `.message-card__header-right` flex container for timestamp/button layout
- Updated page stats display to show "X unread | Y total alerts | Z aircraft"
- "Mark All Alerts Read" button only visible when `unreadAlerts > 0`
- Alert message groups sorted by most recent message timestamp (newest first)
- Fixed React compiler warning (impure Date.now() call) using useState with lazy initialization
- All TypeScript strict mode checks passing
- All Biome checks passing
- Production build successful (1,314 KB / 414 KB gzipped)

**Key Implementation Details**:

- **Unread Count**: Badge shows only unread alerts, disappears when all marked as read
- **Explicit Control**: User MUST click "Mark Read" or "Mark All Read" - no auto-mark behavior
- **Reactive Updates**: MessageCard subscribes to `readMessageUids` Set for immediate UI updates
- **Visual Feedback**: Read messages appear dimmed (60% opacity) but remain visible
- **Per-Message Control**: Each alert can be marked individually for granular management
- **Persistent State**: Read state persists in localStorage via `readMessageUids` Set
- **Sound/Notification Triggers**: Based on alert matching in addMessage(), NOT count changes
- **Sorting**: Alert groups sorted by most recent message timestamp (newest alerts at top)

**Deliverable**: Explicit alert read controls with unread badge count and no auto-mark behavior ✅

#### Phase 9.1.4: Alert Term Management UI 📝 ✅ COMPLETE

**Goal**: Provide Settings interface for managing alert terms

**Implementation Complete** ✅:

- ✅ Added "Alert Terms" card to Notifications tab in Settings Modal
- ✅ Display current alert terms as removable chips/badges (red chips)
- ✅ Display current ignore terms as removable chips/badges (gray chips)
- ✅ Add input field for new alert terms (Enter to add)
- ✅ Add input field for new ignore terms (Enter to add)
- ✅ Delete button for each term (× button on chips)
- ✅ Helpful examples shown (text, callsign, tail, hex)
- ✅ Mobile-first responsive design with larger touch targets
- ✅ Terms automatically converted to uppercase on add
- ✅ Duplicate prevention (can't add same term twice)
- ✅ Empty input validation (Add button disabled when empty)

**Backend Integration** ✅:

- ✅ Backend `update_alerts` Socket.IO event already existed
- ✅ Backend handler saves terms to SQLite database (not JSON file)
- ✅ Backend loads saved terms from database on startup
- ✅ Backend broadcasts `terms` event to all clients on connect
- ✅ Terms persist across page refreshes and server restarts
- ✅ Real-time sync: changes immediately sent to backend and saved

**Payload Structure**:

```typescript
socket.emit(
  "update_alerts",
  {
    terms: ["EMERGENCY", "UAL123", "N12345"],
    ignore: ["TEST", "CHECK"],
  },
  "/main",
);
```

**Implementation Details**:

- Alert terms stored in AppStore (`alertTerms: Terms`)
- Settings Modal includes state for `newAlertTerm` and `newIgnoreTerm`
- Handlers: `handleAddAlertTerm`, `handleRemoveAlertTerm`, `handleAddIgnoreTerm`, `handleRemoveIgnoreTerm`
- Enter key support for adding terms
- Socket.IO emit on every add/remove operation
- SCSS styling with Catppuccin theming (red chips for alerts, gray for ignore)
- Density mode support (compact/comfortable/spacious)
- Animation toggle support
- Mobile: larger touch targets (28px × button vs 20px desktop)
- Chips use monospace font for better readability
- Input field responsive font sizing (1rem on mobile for better keyboard UX)

**Completed Components**:

- **SettingsModal.tsx**: Alert terms management UI with state and handlers
- **\_settings-modal.scss**: Complete styling for chips, input groups, density modes
- All TypeScript strict mode checks passing
- All Biome checks passing
- Production build successful (1,318 KB / 415 KB gzipped)

**Deliverable**: Complete alert term management with database persistence ✅

**Phase 9.1 Completion Checklist**:

- ✅ Sound alerts fully integrated with Settings
- ✅ Desktop notifications working with permission handling
- ✅ Alert badge shows unread count (Phase 9.1.3)
- ✅ Mark as read functionality working (Phase 9.1.3)
- ✅ Alert term management UI complete
- ✅ Backend persistence for alert terms (SQLite database)
- ✅ All TypeScript strict mode checks passing
- ✅ All Biome checks passing
- ✅ Mobile-first responsive design verified
- ✅ Real-time sync with backend via Socket.IO

**Phase 9.1: Notifications & Alert Management COMPLETE** 🎉

### Phase 10: Testing Infrastructure 🧪

**Goal**: Add comprehensive automated testing to ensure code quality and prevent regressions

**Priority**: High - Required before production deployment

**Why Now**:

- Application has reached feature completeness for MVP
- Tests will catch regressions during backend migration
- Provides confidence for refactoring legacy code
- Essential for desktop app packaging validation

#### Phase 10.1: Unit Testing Setup

**Testing Framework**:

- **Vitest** - Fast, Vite-native test runner
- **React Testing Library** - Component testing
- **@testing-library/user-event** - User interaction simulation

**Coverage Goals**:

- Utility functions: 90%+ coverage
- Store logic: 80%+ coverage
- Components: 70%+ coverage

**Tasks**:

- ✅ Configure Vitest with TypeScript
- ✅ Set up React Testing Library
- ✅ Add test scripts to package.json
- ✅ Configure coverage reporting
- ⏳ Add GitHub Actions CI integration

**Test Files to Create**:

```text
acarshub-react/src/
├── utils/__tests__/
│   ├── dateUtils.test.ts        ✅ COMPLETE (70 tests)
│   ├── stringUtils.test.ts      ✅ COMPLETE (86 tests)
│   ├── alertMatching.test.ts    ⏳ TODO
│   └── decoderUtils.test.ts     ⏳ TODO
├── store/__tests__/
│   ├── useAppStore.test.ts      ⏳ TODO
│   └── useSettingsStore.test.ts ⏳ TODO
└── components/__tests__/
    ├── Button.test.tsx           ⏳ TODO
    ├── Card.test.tsx             ⏳ TODO
    ├── MessageCard.test.tsx      ⏳ TODO
    └── SettingsModal.test.tsx    ⏳ TODO
```

**Status**:

- ✅ Vitest configured with TypeScript and React Testing Library
- ✅ Test setup complete with jsdom environment
- ✅ Mock configuration for Chart.js, MapLibre, Audio, Notification APIs
- ✅ Test scripts added: `npm test`, `npm run test:ui`, `npm run test:watch`, `npm run test:coverage`
- ✅ String utilities: **86 tests passing** (100% coverage)
- ✅ Date utilities: **70 tests passing** (100% coverage)
- ✅ **Total: 156 tests passing**

**Next Steps**:

- Add tests for alertMatching utility
- Add tests for decoderUtils utility
- Add tests for Zustand stores
- Add tests for React components

**Deliverable**: Unit test suite with 80%+ coverage ⏳ IN PROGRESS

#### Phase 10.2: Integration Testing

**Focus Areas**:

- Socket.IO event flow (mock backend)
- Store state management (message processing, alert matching)
- Component integration (form submissions, navigation)

**Tools**:

- Vitest with mock Socket.IO server
- MSW (Mock Service Worker) for API mocking

**Critical Test Cases**:

- ⏳ Message reception and decoding flow
- ⏳ Alert matching and notification triggers
- ⏳ Settings persistence and restoration
- ⏳ Search query and pagination
- ⏳ Alert term management (add/remove/persist)

**Deliverable**: Integration test suite covering critical user flows

#### Phase 10.3: End-to-End Testing

**Framework**: Playwright

**Test Scenarios**:

- ⏳ User journey: First visit → Configure alerts → Receive messages
- ⏳ User journey: Search historical messages → View details
- ⏳ User journey: Settings → Theme switch → Verify persistence
- ⏳ User journey: Map → Click aircraft → View messages
- ⏳ Mobile responsiveness validation (320px to 2560px)

**Browser Coverage**:

- Chrome/Chromium
- Firefox
- Safari (WebKit)
- Mobile Safari (iOS)
- Chrome Mobile (Android)

**Deliverable**: E2E test suite for critical user journeys

#### Phase 10.4: Accessibility & Performance Testing

**Accessibility**:

- ⏳ Automated WCAG 2.1 AA audits (axe-core)
- ⏳ Keyboard navigation testing
- ⏳ Screen reader compatibility (VoiceOver, NVDA)
- ⏳ Color contrast validation

**Performance**:

- ⏳ Lighthouse CI integration
- ⏳ Bundle size monitoring (fail if >500KB gzipped)
- ⏳ Rendering performance (100+ aircraft on map)
- ⏳ Memory leak detection

**Deliverable**: Automated accessibility and performance checks in CI

**Phase 10 Completion Checklist**:

- ⏳ All utility functions have unit tests
- ⏳ All stores have comprehensive tests
- ⏳ Critical components have integration tests
- ⏳ E2E tests cover main user journeys
- ⏳ CI/CD pipeline runs all tests on PR
- ⏳ Coverage reports published
- ⏳ WCAG AA compliance verified
- ⏳ Performance budgets enforced

### Phase 11: Backend Evaluation & Migration Planning 🔧

**Goal**: Evaluate backend architecture and plan migration strategy

**Priority**: Critical - Determines deployment and maintenance strategy for next 5+ years

**Current State Analysis**:

**Python/Flask Backend**:

- ✅ Mature, stable codebase
- ✅ Extensive library ecosystem (SQLAlchemy, Flask-SocketIO, rrdtool)
- ✅ Well-documented, easy to maintain
- ❌ No built-in migration system (custom `upgrade_db.py` script)
- ❌ Packaging for desktop apps complex (PyInstaller, py2app)
- ❌ Large runtime footprint (~50MB Python + dependencies)
- ❌ SQLAlchemy configured without Alembic migrations

**Evaluation Criteria**:

1. **Database Migrations** (Critical)
   - ORM with migration support required
   - Must support upgrading existing SQLite database
   - Schema changes must be versioned and reversible

2. **Desktop App Packaging** (Future Requirement)
   - Ability to bundle backend + frontend into single executable
   - Small binary size (<100MB total)
   - Fast startup time (<2 seconds)
   - Cross-platform support (Windows, macOS, Linux)

3. **Maintainability**
   - Developer experience
   - Community support
   - Long-term viability
   - Learning curve for contributors

4. **Performance**
   - Message throughput (500+ messages/sec)
   - WebSocket handling
   - Database query performance

#### Migration Options Analysis

**Option 1: Keep Python + Add Alembic Migrations** ✅ RECOMMENDED

**Pros**:

- ✅ Minimal migration effort (~1-2 weeks)
- ✅ SQLAlchemy + Alembic is industry standard
- ✅ Existing codebase remains stable
- ✅ Preserves institutional knowledge
- ✅ Alembic provides full migration history
- ✅ Can autogenerate migrations from model changes
- ✅ Desktop packaging possible with PyInstaller/Nuitka

**Cons**:

- ❌ Python runtime adds ~50MB to desktop app
- ❌ Slower startup than compiled languages
- ❌ Two-process architecture (Python + Node/Electron for desktop)

**Implementation Plan**:

1. Install Alembic: `pip install alembic`
2. Initialize Alembic in project: `alembic init migrations`
3. Configure Alembic to use existing database
4. Create initial migration from current schema
5. Test migration on fresh database
6. Replace `upgrade_db.py` with Alembic migrations
7. Document migration workflow for developers

**Desktop App Strategy** (Python):

- Nuitka or PyInstaller for Python bundling
- Electron or Tauri for frontend shell
- Two-process architecture: Python backend + Frontend webview
- Total size: ~100-150MB (acceptable)

---

#### Option 2: Migrate to Node.js + Prisma ORM

**Pros**:

- ✅ Single-language stack (TypeScript everywhere)
- ✅ Prisma has excellent migration system
- ✅ Better desktop app integration (Electron, Tauri)
- ✅ Smaller total bundle size (~80MB with Electron)
- ✅ Unified tooling and dependencies

**Cons**:

- ❌ Major migration effort (~4-6 weeks)
- ❌ Rewrite all backend logic in TypeScript
- ❌ RRD database integration unclear (need C bindings or alternative)
- ❌ Flight data APIs may need reimplementation
- ❌ Risk of introducing bugs during migration
- ❌ Community has Python expertise, not Node for backend

**Implementation Plan**:

1. Set up Node.js project with Express + Socket.IO
2. Configure Prisma ORM with SQLite
3. Port database models to Prisma schema
4. Rewrite Flask routes as Express routes
5. Migrate message processing logic
6. Migrate alert matching logic
7. Migrate RRD integration (or replace with alternative)
8. Migrate decoder integrations
9. Comprehensive testing
10. Gradual rollout with feature flags

---

#### Option 3: Migrate to Rust + SeaORM/Diesel

**Pros**:

- ✅ Extremely fast (~10x Python performance)
- ✅ Tiny binary size (~20MB total)
- ✅ Near-instant startup (<100ms)
- ✅ Single executable (no runtime needed)
- ✅ Memory safe, prevents common bugs
- ✅ Best desktop app story (Tauri native)
- ✅ SeaORM has migration support
- ✅ Excellent WebSocket libraries (tokio-tungstenite)

**Cons**:

- ❌ Massive migration effort (~8-12 weeks)
- ❌ Steep learning curve for contributors
- ❌ Smaller ecosystem for aviation libraries
- ❌ Requires rewriting all backend logic
- ❌ Community may lack Rust expertise
- ❌ RRD bindings need custom FFI wrapper
- ❌ Higher development velocity cost

**Implementation Plan**:

1. Set up Rust project with Actix-Web/Axum + SocketIO
2. Configure SeaORM with SQLite
3. Create database migrations
4. Port message processing to Rust
5. Port alert logic
6. Create RRD FFI bindings
7. Port all Flask routes
8. Comprehensive testing
9. Performance benchmarking
10. Gradual rollout

---

#### Recommendation: Python + Alembic ✅

**Rationale**:

1. **Lowest Risk**: Minimal code changes, preserves stability
2. **Fast Implementation**: 1-2 weeks vs 4-12 weeks for rewrites
3. **Proven Stack**: SQLAlchemy + Alembic is battle-tested
4. **Desktop App Viable**: Nuitka/PyInstaller proven solutions
5. **Team Familiarity**: Existing Python expertise preserved
6. **Migration Safety**: Alembic provides rollback capabilities

**When to Reconsider**:

- If desktop app becomes primary deployment (then consider Rust + Tauri)
- If performance becomes bottleneck (unlikely with current load)
- If team composition shifts to primarily JS/TS developers

#### Phase 11 Tasks

**Database Migration System** (Week 1):

- ⏳ Install and configure Alembic
- ⏳ Create initial migration from current schema
- ⏳ **Create FTS5 migration** (replaces `upgrade_db.py` FTS logic)
  - Virtual table creation via `op.execute()` raw SQL
  - INSERT/UPDATE/DELETE triggers for auto-sync
  - Rebuild command to populate existing data
  - Full rollback support in `downgrade()`
- ⏳ Create index migration (port `add_indexes()` from upgrade_db.py)
- ⏳ Create data cleanup migrations (port `de_null()`, `normalize_freqs()`)
- ⏳ Test migration on fresh database
- ⏳ Test migration on production database copy
- ⏳ Verify FTS search works after migration
- ⏳ Document migration workflow
- ⏳ Remove `upgrade_db.py` script
- ⏳ Create separate maintenance scripts for VACUUM and pruning

**Signal Level Table Refactoring** (Week 2):

- ⏳ Create Alembic migration to DROP existing `level` table
- ⏳ Create new tables: `level_acars`, `level_vdlm`, `level_hfdl`, `level_imsl`, `level_irdm`
- ⏳ Update backend code to write to decoder-specific tables
- ⏳ Update Stats page queries to read from decoder-specific tables
- ⏳ Update React frontend to display per-decoder signal charts
- ⏳ Test migration with existing data (if any)

**Backend Code Cleanup**:

- ⏳ Remove legacy HTML generation functions
- ⏳ Remove unused Flask routes
- ⏳ Simplify JSON responses (remove legacy fields)
- ⏳ Clean up acarshub_helpers.py
- ⏳ Audit Socket.IO events (remove deprecated)
- ⏳ Update inline documentation

**Desktop App Proof of Concept** (Optional):

- ⏳ Create Nuitka build configuration
- ⏳ Test bundling Python backend
- ⏳ Test Electron/Tauri shell integration
- ⏳ Measure bundle size and startup time
- ⏳ Document packaging workflow

**Deliverable**: Alembic-based migration system, refactored signal level tables, clean backend codebase

---

### Phase 12: Legacy Code Cleanup

**Goal**: Eliminate all unused legacy code paths from both React and Python codebases

#### React Codebase Audit (`acarshub-react/`)

- Review all components for unused props, functions, or imports
- Remove any legacy compatibility shims or workarounds
- Eliminate dead code paths that were never used
- Clean up commented-out code blocks
- Verify all TypeScript types are used (no orphaned interfaces)
- Remove unused dependencies from `package.json`
- Audit and remove unused SCSS partials or rules

#### Python Backend Cleanup (`rootfs/webapp/`)

- **Remove legacy HTML generation functions** - All presentation in React now
- **Remove unused Flask routes** - Only keep Socket.IO, `/metrics`, and necessary API endpoints
- **Simplify JSON responses** - Remove fields that were only for legacy frontend
- **Remove legacy-specific helpers** - Functions like tooltip generation, HTML formatting
- **Clean up `acarshub_helpers.py`** - Remove presentation logic
- **Audit Socket.IO events** - Remove deprecated events, clean up payloads
- **Remove unused imports and dependencies**
- **Update comments** - Remove references to legacy frontend

#### Documentation Updates

- Update code comments to reflect React-only architecture
- Remove legacy workaround explanations
- Document new API contracts between React and Python
- Update inline TODOs and FIXMEs

#### Quality Gates

- All Biome checks passing
- All TypeScript strict mode checks passing
- No unused imports or variables
- Python backend tests passing (if they exist)
- `git grep` for "legacy", "TODO", "FIXME" to catch stragglers

**Deliverable**: Clean, minimal codebase with no legacy cruft

---

### Phase 13: System Status

- Migrate Status page
- Display decoder health and statistics
- Implement system monitoring UI
  **Deliverable**: System status dashboard

---

### Phase 14: Polish and Deployment

- Comprehensive component tests
- Integration tests for Socket.IO flows
- E2E tests for critical user journeys (Playwright)
- Performance optimization and bundle analysis
- Accessibility audit and fixes
- Update nginx configuration for production
- Documentation updates
  **Deliverable**: Production-ready React application

---

### Phase 15: Documentation & User Guide

- Create user documentation (setup, configuration, troubleshooting)
- Create developer documentation (architecture, contributing guide)
- Create deployment guide (Docker, bare metal, cloud)
- Create migration guide (from legacy to React)
- Record video tutorials (optional)
- **Deliverable**: Complete documentation suite

---

### Phase 16: Beta Release & Feedback

- Deploy to beta testers
- Collect feedback on UX, performance, bugs
- Iterate on critical issues
- Performance tuning based on real-world load
- **Deliverable**: Stable beta release with user feedback incorporated

---

### Phase 17: Final Cutover (Production Release)

- Update Docker build to only include React frontend
- Remove `acarshub-typescript/` directory entirely
- Remove legacy build tooling (Webpack configs, etc.)
- Update documentation to remove all legacy references
- Final production deployment
- **Deliverable**: React-only application in production

## Current Focus

**Current Phase**: Phase 10.1 - Unit Testing Setup 🧪 IN PROGRESS

**Current Progress**:

- ✅ Vitest and React Testing Library configured
- ✅ Test setup complete (mocks, environment, coverage)
- ✅ String utilities: 86 tests passing
- ✅ Date utilities: 70 tests passing
- ✅ **Total: 156 tests passing**

**Next Priority**:

1. **Phase 10.1**: Complete utility and store tests (alertMatching, decoderUtils, stores)
2. **Phase 10.2**: Integration testing (Socket.IO, state management)
3. **Phase 10.3**: End-to-end testing (Playwright)
4. **Phase 11**: Backend evaluation and Alembic migration integration
5. **Phase 12**: Legacy code cleanup

**Recently Completed**:

- ✅ Phase 9.1: Notifications & Alert Management (complete alert system with sound, desktop notifications, unread tracking, and term management)
- ✅ Phase 10.1 (partial): Vitest setup and utility function tests (156 tests passing)

**Critical Decision Point**: Phase 11 (Backend Migration Strategy)

- **Recommendation**: Python + Alembic (lowest risk, fast implementation)
- **Future Option**: Rust + Tauri (if desktop app becomes primary deployment)

**Development Philosophy**:

- React migration is the only active development effort
- Legacy codebase is frozen and will be deleted
- Backend API changes are acceptable and encouraged for cleaner architecture
- Focus on building the best React application, not maintaining legacy compatibility

### During React Migration

- Focus on one phase at a time
- Aim for functional parity with legacy frontend (as baseline)
- Improvements and redesigns beyond legacy are encouraged
- Eliminate all `any` types in React code
- Write tests alongside components
- Document component APIs with JSDoc
- Regular check-ins on bundle size and performance
- **Backend changes permitted** - Refactor APIs as needed for clean React integration

### Legacy Codebase Status

**The legacy codebase (`acarshub-typescript/`) is NO LONGER MAINTAINED**:

- No bug fixes
- No new features
- No refactoring efforts
- Will be deleted in Phase 13
- Exists only as reference during migration
- All development effort goes to React migration

### Quality Gates for React Migration

Before moving to the next phase:

1. All TypeScript strict mode errors resolved
2. No `any` types (use `unknown` with type guards if necessary)
3. Component tests written and passing
4. Biome checks passing
5. No console errors or warnings
6. Performance benchmarked (no regressions)
7. Accessibility checked (keyboard navigation, ARIA labels, 44px touch targets)
8. **Mobile responsiveness verified** - Test on actual mobile devices or browser DevTools mobile emulation
9. **No horizontal scroll** - Verified at 320px, 375px, 768px, 1024px, and 1920px widths

## Agent Workflow Guidelines

### Before Starting Work

1. Read AGENTS.md (this file) completely
2. **Read DESIGN_LANGUAGE.md for visual patterns and component usage**
3. Understand which phase of migration is active
4. Check if new tooling is needed → update flake.nix → wait for user
5. Review quality requirements

### During Development

1. Make incremental changes
2. Run quality checks frequently (`biome check`, `tsc --noEmit`)
3. Test in browser regularly
4. **Follow patterns in DESIGN_LANGUAGE.md for consistent UI**
5. Use Card component for content organization
6. Ensure mobile responsiveness (test at 375px, 768px, 1024px widths)
7. Document complex logic with comments
8. Ask clarifying questions if requirements are unclear

### Before Completing Work

1. Run all quality checks
2. Verify no `any` types introduced
3. Ensure proper TypeScript typing
4. Confirm no inline styles
5. Verify mobile responsiveness works
6. Check that patterns match DESIGN_LANGUAGE.md
7. Run `git --no-pager diff` to review changes
8. Suggest next steps or improvements

### Communication Style

- Be direct and technical
- Explain architectural decisions
- Highlight trade-offs when they exist
- Point out potential issues proactively
- Provide code examples when explaining concepts

## Bugs before final release

- Global:
  - Disconnected state will show disconnected, but the socket is valid
  - ⚠️ NOTE: Density setting is inconsistent (hardcoded sizes in some places). Recommend removing entirely - deferred to Phase 12.

- Bug Fix Pass (Pre-Phase 10) - ✅ COMPLETE (6 bugs fixed, 1 deferred):
  - ✅ FIXED: Alert matching now checks decodedText field from @airframes/acars-decoder
  - ✅ FIXED: Time series graphs show breaks for data gaps (spanGaps: false, intelligent gap detection)
  - ✅ FIXED: Message card header gap completely removed (colored badge flush with separator line)
  - ✅ FIXED: Bar chart number labels always dark (rgba(0,0,0,0.9)) for readability on all themes
  - ✅ FIXED: Stats page theme switching instant (CSS variables re-read when theme changes via useMemo)
  - ✅ FIXED: Live map highlights aircraft with unread messages (yellow/peach glow)
  - ⏳ DEFERRED: Remove density setting entirely (requires 14+ file changes, deferred to Phase 12)
  - 📄 Documentation: agent-docs/BUG_FIX_PASS_SUMMARY.md (complete implementation details)
  - ⏱️ Total time: ~4 hours (as estimated)
  - 📦 Build status: 1,318 KB / 415 KB gzipped ✅

- Notifications & Alerts (Phase 9.1 - ✅ COMPLETE):
  - ✅ FIXED: Alert sound file added to `public/static/sounds/alert.mp3`
  - ✅ FIXED: Sound alerts now fully controlled by Settings (removed page-specific toggle)
  - ✅ FIXED: Shared audioService prevents per-component autoplay blocking
  - ✅ FIXED: Global AlertSoundManager plays sounds on ALL pages (Live Messages, Map, etc.)
  - ✅ FIXED: alertCount auto-calculated in AppStore addMessage() function
  - ✅ FIXED: Browser detection shows Chromium-specific warning (Firefox works perfectly)
  - ⚠️ LIMITATION: Chromium browsers require "Test Sound" click per reload (Firefox does not)
  - ✅ FIXED: Desktop notifications fully implemented with permission handling
  - ✅ FIXED: Notifications only trigger for alert messages (not all messages)
  - ✅ FIXED: Notification body shows only matched terms (no message text)
  - ✅ FIXED: HTML stripping from matched terms (plain text notifications)
  - ✅ FIXED: Time-based filtering prevents notifications on page load
  - ✅ FIXED: Alert badge shows unread alert count (Phase 9.1.3 complete)
  - ✅ FIXED: Badge disappears when all alerts marked as read
  - ✅ FIXED: Individual "Mark Read" buttons added to each alert message
  - ✅ FIXED: Mark Read button disappears immediately when clicked (reactive state updates)
  - ✅ FIXED: Manual "Mark All Alerts Read" button added to Alerts page
  - ✅ FIXED: "Mark All Read" only visible when unread > 0
  - ✅ FIXED: No auto-mark behavior - explicit user control only
  - ✅ FIXED: Alert terms management UI complete (Phase 9.1.4)
  - ✅ FIXED: Backend alert term persistence working (SQLite database, real-time sync)
  - ✅ FIXED: Search queries now properly emit with Flask-SocketIO namespace pattern (third argument)
  - ✅ FIXED: Search and Alerts pages now scrollable (changed `height: 100%` to `min-height: 100%`)
  - ✅ FIXED: Search page card styling (created shared \_message-card.scss and \_message-group.scss components)
  - ✅ FIXED: Map modal aircraft messages now use shared component styling
