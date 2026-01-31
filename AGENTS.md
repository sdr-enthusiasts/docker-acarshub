# AGENTS.md - ACARS Hub Project Guide for AI Agents

## Project Overview

ACARS Hub is a web application for receiving, decoding, and displaying ACARS (Aircraft Communications Addressing and Reporting System) messages. The application consists of a Python backend (Flask/Socket.IO) and a TypeScript frontend that displays live aviation messages, maps, statistics, and alerts.

Files:

- acarshub-react/README.md - React frontend documentation
- acarshub-react/DESIGN_LANGUAGE.md - **Visual design language and component usage guide**
- acarshub-react/CATPPUCCIN.md - Catppuccin color reference for React frontend
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

### Primary Goal: React Migration

The project is planned for a **complete rewrite in React** due to:

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

### Interim Improvements

While planning the React migration, incremental improvements to the current codebase are acceptable:

- Create custom formatters for consistent HTML generation
- Refactor large functions into smaller, logical units
- Add comprehensive comments explaining complex logic
- Improve type safety where possible
- Extract reusable utilities

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
│   │   ├── assets/         # Static assets
│   │   └── App.tsx         # Root component
│   ├── public/             # Public assets
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts      # Vite build configuration
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

nginx **ONLY** handles:

- Serving static assets (HTML, CSS, JS, images)
- Asset caching with proper headers
- Routing SPA paths to `index.html`
- Proxying WebSocket connections to Python backend

**Benefits**:

- Clear separation of concerns
- Better performance (nginx is optimized for static files)
- Simplified Python codebase
- Standard production deployment pattern
- Easier horizontal scaling

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

**Emitted Events**:

- `query_search`: Database search request
- `update_alerts`: Update alert terms
- `signal_freqs`: Request frequency data
- And more...

See `src/index.ts` lines 257-416 for complete event handling.

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

## Performance Considerations

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

### Phase 6: Statistics and Graphs (Next Phase)

- Migrate Stats page with react-chartjs-2 or Recharts
- Implement real-time chart updates via Socket.IO
- Create reusable chart components
- Handle historical data loading
- **Deliverable**: Interactive statistics dashboard

### Phase 7: Live Map (Complex Visualization)

- Migrate LiveMap page with react-leaflet
- Handle 100+ aircraft markers efficiently
- Implement clustering and filtering
- Connect to ADS-B data streams
- Optimize re-rendering for performance
- **Deliverable**: Real-time aircraft map

### Phase 8: Live Messages (Core Functionality)

- Migrate LiveMessages page (most complex)
- Break down 991-line component into smaller pieces
- Implement message list virtualization for performance
- Create message detail components
- Handle real-time message streams
- Implement filtering and search
- **Deliverable**: Fully functional message viewer

### Phase 9: Alerts and Search

- Migrate Alerts page with term filtering
- Migrate Search page with database queries
- Implement alert notification system
- **Deliverable**: Alert management and database search

### Phase 10: System Status

- Migrate Status page
- Display decoder health and statistics
- Implement system monitoring UI
- **Deliverable**: System status dashboard

### Phase 11: Testing, Polish, and Deployment

- Comprehensive component tests
- Integration tests for Socket.IO flows
- E2E tests for critical user journeys (Playwright)
- Performance optimization and bundle analysis
- Accessibility audit and fixes
- Update nginx configuration for production
- Remove Flask static file serving code
- Documentation updates
- **Deliverable**: Production-ready React application

### Phase 12: Cutover and Cleanup

- Deploy React build alongside legacy frontend
- A/B testing period
- Monitor for issues
- Full cutover to React frontend
- Archive `acarshub-typescript/` directory
- Remove legacy build tooling

## Current Focus

### During React Migration

- Focus on one phase at a time
- Maintain functional parity with legacy frontend
- Eliminate all `any` types in React code
- Write tests alongside components
- Document component APIs with JSDoc
- Regular check-ins on bundle size and performance

### For Legacy Codebase (acarshub-typescript/)

Until migration is complete:

- Bug fixes only (minimal changes)
- No new features in legacy code
- Small refactorings that improve maintainability are acceptable
- Type safety improvements are acceptable
- Keep legacy frontend functional during migration
- Avoid large architectural changes

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
