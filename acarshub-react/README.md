# ACARS Hub React Frontend

This is the React-based frontend for ACARS Hub, a complete rewrite of the legacy jQuery/TypeScript frontend.

## Project Overview

**Status**: Phase 1 Complete ✅

This is an independent React application being built alongside the legacy frontend (`acarshub-typescript/`). The goal is to achieve functional parity with improved architecture, maintainability, and modern best practices.

## Tech Stack

- **React 19** - UI framework
- **TypeScript 5.9** - Type safety (strict mode enabled)
- **Vite 7** - Build tool and dev server
- **Zustand** - State management
- **Socket.IO Client** - Real-time communication with backend
- **React Router** - Client-side routing
- **SCSS** - Styling (NO third-party CSS frameworks)
- **Catppuccin** - Color scheme (Mocha dark theme, Latte light theme)
- **Biome** - Linter and formatter

## Development

### Prerequisites

Development environment is managed via Nix flakes. All required tools are provided by the Nix development shell.

### Available Scripts

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type check (no emit)
npx tsc --noEmit

# Lint and format (use project root biome)
cd .. && biome check acarshub-react/src/ --write
```

### Project Structure

```text
acarshub-react/
├── src/
│   ├── components/         # Reusable React components
│   │   ├── Navigation.tsx
│   │   └── ConnectionStatus.tsx
│   ├── pages/              # Page components (route handlers)
│   │   ├── LiveMessagesPage.tsx
│   │   ├── SearchPage.tsx
│   │   ├── AlertsPage.tsx
│   │   ├── StatsPage.tsx
│   │   ├── LiveMapPage.tsx
│   │   ├── StatusPage.tsx
│   │   └── AboutPage.tsx
│   ├── hooks/              # Custom React hooks
│   │   └── useSocketIO.ts
│   ├── services/           # External services (Socket.IO)
│   │   └── socket.ts
│   ├── store/              # Zustand state management
│   │   └── useAppStore.ts
│   ├── types/              # TypeScript type definitions
│   │   └── index.ts
│   ├── styles/             # SCSS styles (Catppuccin themed)
│   │   ├── _variables.scss     # Catppuccin color variables
│   │   ├── _mixins.scss        # Theme mixins and utilities
│   │   ├── _themes.scss        # Theme definitions (mocha/latte)
│   │   ├── _reset.scss         # CSS reset
│   │   ├── components/         # Component-specific styles
│   │   ├── pages/              # Page-specific styles
│   │   └── main.scss           # Main import file
│   ├── utils/              # Utility functions
│   ├── App.tsx             # Root component
│   └── main.tsx            # Application entry point
├── public/                 # Static assets
├── dist/                   # Build output (gitignored)
├── package.json
├── tsconfig.json
├── tsconfig.app.json
└── vite.config.ts
```

## Architecture

### State Management

**Zustand Store** (`src/store/useAppStore.ts`):

- Single source of truth for application state
- Type-safe selectors
- Reactive updates trigger component re-renders
- Stores messages, configuration, system status, UI state

### Real-time Communication

**Socket.IO Service** (`src/services/socket.ts`):

- Type-safe event definitions (`ServerToClientEvents`, `ClientToServerEvents`)
- Singleton service managing WebSocket connection
- Auto-reconnection with exponential backoff
- Connection state monitoring

**Socket Integration Hook** (`src/hooks/useSocketIO.ts`):

- Initializes Socket.IO connection on app mount
- Wires Socket.IO events to Zustand store updates
- Handles cleanup on unmount

### Routing

**React Router**:

- Hash-based routing for SPA
- Routes: `/live-messages`, `/search`, `/alerts`, `/stats`, `/adsb`, `/status`, `/about`
- Default redirect to `/live-messages`
- Conditional routes (e.g., `/adsb` only shown if ADS-B enabled)

## Phase 1 Deliverables ✅

- [x] Project setup with Vite + React + TypeScript
- [x] Biome configuration (uses project root config)
- [x] TypeScript strict mode enabled
- [x] Socket.IO client integration with type-safe events
- [x] Base layout shell with navigation
- [x] React Router setup with all routes
- [x] Zustand state management
- [x] All page placeholders created
- [x] Connection status indicator
- [x] Quality checks passing (Biome, TypeScript)
- [x] Production build successful

## Phase 2 Goals (Current)

- [ ] Remove Bootstrap dependency
- [ ] Set up SCSS file structure (partials, components, pages)
- [ ] Implement Catppuccin Mocha (dark) theme variables
- [ ] Implement Catppuccin Latte (light) theme variables
- [ ] Create theme switching mechanism with SCSS mixins
- [ ] Build custom button components (no Bootstrap)
- [ ] Build custom form components (inputs, selects, checkboxes)
- [ ] Build custom modal/dialog components (replaces jBox)
- [ ] Restyle navigation with Catppuccin colors
- [ ] Create reusable SCSS mixins for common patterns
- [ ] Set up testing infrastructure (Vitest + React Testing Library)

## Styling Requirements

### Theme System

The application uses **Catppuccin** color schemes exclusively:

- **Catppuccin Mocha** (Dark theme) - Default
- **Catppuccin Latte** (Light theme) - User switchable

### Rules

1. **NO third-party CSS frameworks** - No Bootstrap, Tailwind, Material-UI, etc.
2. **SCSS only** - All styles must be written in SCSS
3. **NO inline styles** - All styling in SCSS files
4. **Catppuccin colors only** - Every color must come from the Catppuccin palette
5. **Theme switching via mixins** - Only variable names should change between themes

### Catppuccin Color Palette

**Available Colors**: rosewater, flamingo, pink, mauve, red, maroon, peach, yellow, green, teal, sky, sapphire, blue, lavender, text, subtext1, subtext0, overlay2, overlay1, overlay0, surface2, surface1, surface0, base, mantle, crust

Reference: <https://github.com/catppuccin/catppuccin>

### SCSS Structure

```scss
// _mixins.scss - Theme mixin pattern
@mixin theme-mocha {
  --color-base: #{$mocha-base};
  --color-text: #{$mocha-text};
  --color-primary: #{$mocha-blue};
  // ... all Catppuccin colors
}

@mixin theme-latte {
  --color-base: #{$latte-base};
  --color-text: #{$latte-text};
  --color-primary: #{$latte-blue};
  // ... all Catppuccin colors
}

// _themes.scss - Apply themes
:root {
  @include theme-mocha; // Default
}

[data-theme="light"] {
  @include theme-latte;
}

// Components use CSS variables
.button {
  background-color: var(--color-primary);
  color: var(--color-base);
}
```

### Styling Guidelines

- **Component-scoped**: Each component has its own SCSS partial
- **BEM naming**: Use `.block__element--modifier` convention
- **Mobile-first**: Use `min-width` media queries
- **Accessibility**: WCAG AA contrast, focus states, ARIA support
- **Low specificity**: Max 3-4 levels of nesting
- **No !important**: Structure to avoid specificity conflicts

## Code Quality Standards

All code must pass:

1. **TypeScript compilation** - Strict mode, no errors
2. **Biome checks** - No linting errors
3. **No `any` types** - Use proper TypeScript types or `unknown` with type guards
4. **No inline styles** - All styling in SCSS files
5. **Catppuccin colors only** - No arbitrary colors

### Running Quality Checks

```bash
# From project root
cd docker-acarshub

# TypeScript check
cd acarshub-react && npx tsc --noEmit

# Biome check
biome check acarshub-react/src/

# Biome check with auto-fix
biome check acarshub-react/src/ --write
```

## Socket.IO Events

### Received from Backend

- `acars_msg` - New ACARS message
- `labels` - Message label definitions
- `terms` - Alert term updates
- `decoders` - Decoder configuration
- `database_search_results` - Search results
- `database_size` - Database statistics
- `system_status` - System health
- `version` - Version information
- `signal` - Signal level data
- `adsb` - ADS-B aircraft data
- `adsb_status` - ADS-B availability
- `alert_terms` - Alert term statistics

### Emitted to Backend

- `query_search` - Database search request
- `update_alerts` - Update alert configuration
- `signal_freqs` - Request frequency data
- `page_change` - Notify page navigation (analytics)

## Dependencies to Remove

- [ ] Bootstrap (will be replaced with custom SCSS)
- [ ] Any other CSS frameworks or libraries

## Migration Strategy

This React app is built **independently** from the legacy frontend to allow:

- Clean architecture without legacy constraints
- Side-by-side comparison during development
- A/B testing before cutover
- Gradual feature migration
- Easy rollback if needed

Once complete, nginx will be updated to serve this React build instead of the legacy frontend, and Python will only handle WebSocket endpoints.

## Contributing

Follow the guidelines in `/AGENTS.md` at the project root. Key points:

- **No inline styles** - All styling in SCSS files
- **No third-party CSS** - Write custom styles with Catppuccin theming
- **No `any` types** - Proper TypeScript typing
- **Catppuccin colors only** - No arbitrary colors
- Document complex logic with comments
- Keep functions small and focused (<50 lines preferred)
- Use existing type definitions from `src/types/`
- Run quality checks before committing
- Follow BEM naming convention for CSS classes

## License

GPL-3.0-only

Copyright (C) 2022-2024 Frederick Clausen II
