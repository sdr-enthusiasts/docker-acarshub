# ACARS Hub React Frontend

This is the React-based frontend for ACARS Hub, currently under active development as part of the migration from jQuery to React.

## 🚧 Project Status

**Phase 2 Complete**: Styling System and Theme Implementation ✅

- Custom SCSS with Catppuccin theming (Mocha dark / Latte light)
- Reusable Button, Modal, and ThemeSwitcher components
- No Bootstrap - all custom styling
- Modern React 19 with TypeScript

**Next**: Phase 3 - Type System and Shared Utilities

See [PHASE-2-COMPLETE.md](./PHASE-2-COMPLETE.md) for detailed Phase 2 accomplishments.

## 🚀 Development Setup

### Prerequisites

- Node.js 18+ and npm
- Python backend running (see below)

### Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at <http://localhost:3000>

### Running with Backend

The React frontend needs the Flask backend running to connect via Socket.IO.

#### Option 1: Use the legacy frontend's backend

From the project root:

```bash
# Terminal 1: Start Flask backend
pdm run dev

# Terminal 2: Start React dev server
cd acarshub-react && npm run dev
```

Backend runs on `http://localhost:8080` (proxied by Vite)

#### Option 2: Docker development environment

See main project [DEV-QUICK-START.md](../DEV-QUICK-START.md)

### Without Backend (UI Development Only)

You can view the UI components without a backend connection:

1. Start dev server: `npm run dev`
2. Navigate to **About** page to see component showcase
3. Theme switching and UI components work without backend

The app will show "Disconnected" status but UI is fully functional.

## 📁 Project Structure

```text
acarshub-react/
├── src/
│   ├── components/       # Reusable React components
│   │   ├── Button.tsx
│   │   ├── Modal.tsx
│   │   ├── ThemeSwitcher.tsx
│   │   ├── Navigation.tsx
│   │   └── ConnectionStatus.tsx
│   ├── hooks/            # Custom React hooks
│   │   └── useSocketIO.ts
│   ├── pages/            # Page components (routes)
│   │   ├── AboutPage.tsx
│   │   ├── LiveMessagesPage.tsx
│   │   ├── LiveMapPage.tsx
│   │   ├── SearchPage.tsx
│   │   ├── AlertsPage.tsx
│   │   ├── StatsPage.tsx
│   │   └── StatusPage.tsx
│   ├── services/         # API and Socket.IO services
│   │   └── socket.ts
│   ├── store/            # Zustand state management
│   │   └── useAppStore.ts
│   ├── styles/           # SCSS styling system
│   │   ├── _variables.scss
│   │   ├── _mixins.scss
│   │   ├── _themes.scss
│   │   ├── _reset.scss
│   │   ├── components/
│   │   ├── pages/
│   │   └── main.scss
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   ├── App.tsx           # Root component
│   └── main.tsx          # Entry point
├── public/               # Static assets
├── dist/                 # Production build output
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 🛠 Available Scripts

```bash
# Development server with hot reload
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Type checking
npm run type-check
# or
npx tsc --noEmit

# Linting and formatting (Biome)
npx biome check .
npx biome check --write .

# Full quality check
npx tsc --noEmit && npx biome check .
```

## 🎨 Styling System

### Catppuccin Themes

- **Mocha (Dark)**: Default theme - warm dark colors
- **Latte (Light)**: Light theme - soft pastel colors

Switch themes using the sun/moon icon in the navigation bar.

### SCSS Architecture

All styling uses custom SCSS with no third-party frameworks:

- `_variables.scss` - Colors, spacing, typography, breakpoints
- `_mixins.scss` - Utility mixins (30+ helpers including responsive breakpoints)
- `_themes.scss` - Theme switching logic
- `components/` - Component-specific styles
- `pages/` - Page layout styles

**Mobile-First Approach:**

- Base styles target mobile devices (320px+)
- Use `@include media-sm`, `@include media-md`, etc. for larger screens
- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px), 2xl (1536px)

See [CATPPUCCIN.md](./CATPPUCCIN.md) for color reference.

### Adding Styles

1. Create component SCSS in `src/styles/components/`
2. Import in `src/styles/main.scss`
3. Use CSS variables: `var(--color-primary)`, `var(--color-text)`, etc.
4. Use mixins: `@use "../mixins" as *;`
5. **Use mobile-first approach**: Base styles for mobile, `min-width` media queries for larger screens
6. **Test on mobile devices**: Use DevTools mobile emulation or real devices

**Critical Requirements:**

- **No inline styles allowed** - all styling must be in SCSS files
- **Mobile-first responsive design is PARAMOUNT** - all layouts must work on mobile devices first
- **No horizontal scrolling** - content must fit viewport at any screen size

## 🧩 Components

### Button

```tsx
import { Button } from './components/Button';

<Button variant="primary" size="lg">Click me</Button>
<Button variant="outline-danger" loading>Saving...</Button>
<Button variant="success" disabled>Done</Button>
```

**Variants**: primary, secondary, success, danger, warning, info, ghost, outline-\*

### Modal

```tsx
import { Modal } from "./components/Modal";

<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Settings"
  footer={<Button variant="primary">Save</Button>}
>
  <p>Modal content</p>
</Modal>;
```

### ThemeSwitcher

```tsx
import { ThemeSwitcher } from "./components/ThemeSwitcher";

<ThemeSwitcher />;
```

Automatically persists theme preference to localStorage.

## 📊 State Management

Uses **Zustand** for global state:

```tsx
import { useAppStore } from "./store/useAppStore";

const messages = useAppStore((state) => state.messages);
const addMessage = useAppStore((state) => state.addMessage);
```

State is synchronized with Socket.IO events from the backend.

## 🔌 Socket.IO Connection

Connection is managed automatically via `useSocketIO` hook in `App.tsx`.

Backend endpoints:

- **Development**: `http://localhost:8080/socket.io`
- **Production**: Proxied by nginx

Connection status visible in header banner.

## 🧪 Testing

Testing infrastructure planned for Phase 10:

- Vitest for unit tests
- React Testing Library for component tests
- Playwright for E2E tests

## 🏗 Building for Production

```bash
# Build optimized production bundle
npm run build

# Output in dist/ directory
dist/
├── index.html
├── assets/
│   ├── index-[hash].css
│   └── index-[hash].js
```

Bundle is optimized and tree-shaken. Gzipped sizes:

- CSS: ~4.5 KB
- JS: ~114 KB (includes React, Socket.IO, etc.)

## 📝 Code Quality Standards

All code must pass:

1. **TypeScript**: Strict mode, no `any` types
2. **Biome**: Linter and formatter
3. **Build**: Production build must succeed
4. **Mobile Responsiveness**: Test at 320px, 375px, 768px, 1024px, 1920px widths
5. **No horizontal scroll**: Verified at all breakpoints
6. **Touch targets**: Minimum 44x44px for interactive elements

```bash
# Run all checks
npm run build && npx tsc --noEmit && npx biome check .
```

### Testing Responsive Design

```bash
# Start dev server
npm run dev

# Then test in browser DevTools:
# 1. Open DevTools (F12)
# 2. Toggle device toolbar (Ctrl+Shift+M)
# 3. Test these widths: 320px, 375px, 768px, 1024px, 1920px
# 4. Verify no horizontal scroll
# 5. Check touch target sizes (44x44px minimum)
```

## 🎯 Development Guidelines

1. **No `any` types** - Use proper TypeScript types
2. **No inline styles** - All styles in SCSS files
3. **No third-party CSS** - Custom components only
4. **Catppuccin colors only** - No arbitrary hex values
5. **MOBILE-FIRST RESPONSIVE DESIGN IS PARAMOUNT** ⚠️ CRITICAL
   - Mobile experience is first-class, not an afterthought
   - Base styles for mobile, use `min-width` media queries
   - Test on mobile devices (phones and tablets)
   - Touch targets must be at least 44x44px
   - No horizontal scrolling at any screen size
   - All features must work seamlessly on small screens
6. **Accessibility** - ARIA labels, keyboard support, focus states, 44px touch targets
7. **Performance** - Optimize for mobile network speeds

See [../AGENTS.md](../AGENTS.md) for complete development guidelines.

## 🐛 Troubleshooting

### "Socket not initialized" error

Backend is not running. Start Flask backend first:

```bash
pdm run dev
```

### Port 3000 already in use

Another Vite server is running:

```bash
# Find and kill the process
lsof -ti:3000 | xargs kill -9
```

### Hot reload not working

1. Check Vite dev server is running
2. Hard refresh: `Ctrl+Shift+R`
3. Clear browser cache

### Build errors

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Theme not persisting

Check browser localStorage is enabled and not in private mode.

## 📚 Documentation

- [AGENTS.md](../AGENTS.md) - Complete project guide for AI agents
- [CATPPUCCIN.md](./CATPPUCCIN.md) - Color palette reference
- [PHASE-2-COMPLETE.md](./PHASE-2-COMPLETE.md) - Phase 2 accomplishments

## 🤝 Contributing

This is an active migration project. See [../AGENTS.md](../AGENTS.md) for:

- Migration phases and current status
- Code quality requirements
- Development workflow
- Architecture decisions

## 📄 License

GNU General Public License v3.0

Copyright (C) 2022-2024 Frederick Clausen II

See [../LICENSE](../LICENSE) for full license text.
