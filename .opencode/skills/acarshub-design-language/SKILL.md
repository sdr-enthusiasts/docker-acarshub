---
name: acarshub-design-language
description: Use ONLY when working in the docker-acarshub repository AND building UI -- React components, SCSS modules, theme variables, accessibility, mobile responsiveness, Catppuccin color usage, Zustand store wiring. Points at the in-repo agent-docs/ as the canonical reference and codifies the rules that the model otherwise forgets between sessions (no inline styles, mobile-first, 44x44 touch targets, WCAG 2.1 AA, namespace logger, Socket.IO `/main` binding quirk).
---

# ACARS Hub: design language & UI rules

The full design language lives in `agent-docs/DESIGN_LANGUAGE.md` and
`agent-docs/CATPPUCCIN.md` in the docker-acarshub repo. Read those
first when doing real UI work. This skill captures the rules that
otherwise leak between sessions.

## Styling

- **No inline styles.** Every style lives in `.scss` modules.
- **No CSS frameworks.** No Tailwind, Bootstrap, Material-UI, etc.
  ACARS Hub does Catppuccin tokens directly via CSS variables.
- **`@use` / `@forward`**, not deprecated `@import`.
- **Catppuccin colors via CSS variables**: `var(--color-text)`,
  `var(--color-primary)`, etc. Theme switching is a value swap on
  the variables via SCSS mixins (Mocha = dark, Latte = light). See
  `agent-docs/CATPPUCCIN.md` for the full palette.

## Mobile-first responsive (non-negotiable)

- Base styles for **320px+**.
- `@media (min-width: 768px)` for tablet.
- `@media (min-width: 1024px)` for desktop.
- **Touch targets minimum 44x44px**.
- **No horizontal scrolling at any screen size.**
- Test at: 320px, 375px, 768px, 1024px, 1920px.

Example:

```scss
.button {
  // Base: mobile
  padding: 0.75rem 1rem;
  font-size: 1rem;

  // Tablet and up
  @media (min-width: 768px) {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
  }
}
```

## Accessibility (WCAG 2.1 AA)

- Color contrast: 4.5:1 for normal text, 3:1 for large text.
- Touch targets: minimum 44x44px (same as mobile rule above).
- Keyboard navigation: every interactive element reachable.
- ARIA labels, roles, landmarks on non-obvious widgets.
- Visible focus indicators; focus traps in modals.

Verify with `just test-a11y` (axe-core automated tests).

## Component patterns

See `agent-docs/DESIGN_LANGUAGE.md` for the canonical examples. The
quick-reference shape:

```typescript
import type { ReactNode } from "react";
import "./Button.scss";

interface ButtonProps {
  variant?: "primary" | "secondary" | "danger";
  size?: "small" | "medium" | "large";
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "medium",
  disabled = false,
  onClick,
  children,
}: ButtonProps) {
  return (
    <button
      className={`button button--${variant} button--${size}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
```

BEM-style class naming (`button button--primary`) is the convention.

## State (Zustand)

- `useAppStore` -- global app state (messages, alerts, connection).
- `useSettingsStore` -- user preferences (theme, locale,
  notifications). Persisted via `zustand/middleware`'s `persist`.

Store pattern (canonical):

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  theme: "mocha" | "latte";
  setTheme: (theme: "mocha" | "latte") => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "mocha",
      setTheme: (theme) => set({ theme }),
    }),
    { name: "acars-settings" },
  ),
);
```

## Performance gates

- Target: <500KB per chunk (gzipped). Monitor with `npm run analyze`.
- 60fps with 100+ aircraft on the map.
- No memory leaks in long-running sessions.
- `React.memo`, `useMemo`, `useCallback` where they earn it -- not
  prophylactically everywhere.
- `just lighthouse` runs Lighthouse CI.

## When to stop and ask

- A UI requirement looks like it needs a CSS framework. It doesn't.
  Surface the requirement; the project's stance is "no frameworks"
  and the right answer is custom SCSS following the existing
  patterns.
- A new design pattern is needed that isn't in `DESIGN_LANGUAGE.md`.
  Propose adding the pattern to that doc as part of the PR; do NOT
  inline a one-off pattern without updating the standard.
- An accessibility violation is intrinsic to the design (e.g. a
  custom widget that can't meet WCAG 2.1 AA with a reasonable
  amount of work). Stop and surface -- a11y is the floor, not a
  preference.
