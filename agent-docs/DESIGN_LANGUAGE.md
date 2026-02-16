# ACARS Hub Visual Design Language

This document defines the visual design patterns and component usage guidelines for the ACARS Hub React application.

## Core Principles

1. **Consistency** - Use the same components and patterns throughout the application
2. **Catppuccin Theming** - All colors come from Catppuccin Mocha (dark) and Latte (light) palettes
3. **Mobile-First** - All layouts must be responsive and work on phones, tablets, and desktops
4. **Accessibility** - Minimum 44px touch targets, keyboard navigation, ARIA labels, proper contrast
5. **No Inline Styles** - All styling in SCSS files
6. **No Third-Party CSS** - Custom components only, no Bootstrap/Tailwind/Material-UI

## Component Hierarchy

### Card Component

The **Card** is our primary layout component for grouping related content.

#### When to Use Cards

- Grouping related settings or options
- Displaying information blocks
- Creating visual sections within a page
- Any content that needs visual separation

#### Card Variants

```tsx
<Card variant="default">    // Neutral, general content
<Card variant="info">       // Informational content (blue accent)
<Card variant="success">    // Positive/working features (green accent)
<Card variant="warning">    // Cautionary content (yellow accent)
<Card variant="error">      // Error states (red accent)
```

#### Card Structure

```tsx
<Card
  title="Section Title"
  subtitle="Optional description of what this section contains"
  variant="success"
>
  {/* Card content goes here */}
</Card>
```

#### Card Props

- `title` - Optional header text
- `subtitle` - Optional description below title
- `variant` - Visual style (default, info, success, warning, error)
- `padded` - Whether content is padded (default: true)
- `hoverable` - Adds hover effect (for clickable cards)
- `footer` - Optional footer content

#### Example: Settings Section with Card

```tsx
<Card
  title="Appearance"
  subtitle="Customize the look and feel of the application"
  variant="success"
>
  <div className="settings-info settings-info--success">
    ✓ All appearance settings are fully functional
  </div>

  <RadioGroup
    name="theme"
    label="Theme"
    value={theme}
    options={themeOptions}
    onChange={setTheme}
  />

  <Select
    id="density"
    label="Display Density"
    value={density}
    options={densityOptions}
    onChange={setDensity}
  />
</Card>
```

### Form Components

#### Select Component

Styled dropdown with Catppuccin theming.

```tsx
<Select
  id="time-format"
  label="Time Format"
  value={timeFormat}
  options={[
    { value: "auto", label: "Auto-detect from locale" },
    { value: "12h", label: "12-hour (3:45 PM)" },
    { value: "24h", label: "24-hour (15:45)" },
  ]}
  onChange={setTimeFormat}
  helpText="Choose how times are displayed"
  fullWidth
/>
```

**Props:**

- `id` - Unique identifier
- `label` - Label text above select
- `value` - Current selected value
- `options` - Array of {value, label, disabled?}
- `onChange` - Callback when value changes
- `helpText` - Optional help text below select
- `disabled` - Whether disabled
- `required` - Whether required
- `fullWidth` - Spans full container width

#### Toggle/Switch Component

Binary on/off control with smooth animation.

```tsx
<Toggle
  id="animations"
  label="Enable Animations"
  checked={animationsEnabled}
  onChange={setAnimationsEnabled}
  helpText="Show smooth transitions and effects"
/>
```

**Props:**

- `id` - Unique identifier
- `label` - Label text next to toggle
- `checked` - Current on/off state
- `onChange` - Callback when toggled
- `helpText` - Optional help text
- `disabled` - Whether disabled
- `size` - "small" | "medium" | "large"

#### RadioGroup Component

Group of mutually exclusive options with descriptions.

```tsx
<RadioGroup
  name="timezone"
  label="Timezone Display"
  value={timezone}
  options={[
    {
      value: "local",
      label: "Local Time",
      description: "Display times in your local timezone",
    },
    {
      value: "utc",
      label: "UTC",
      description: "Display times in UTC (Coordinated Universal Time)",
    },
  ]}
  onChange={setTimezone}
  helpText="Choose which timezone to use"
  direction="vertical"
/>
```

**Props:**

- `name` - Group name for radio inputs
- `label` - Group label
- `value` - Current selected value
- `options` - Array of {value, label, description?, disabled?}
- `onChange` - Callback when selection changes
- `helpText` - Optional help text
- `disabled` - Whether entire group disabled
- `required` - Whether selection required
- `direction` - "vertical" | "horizontal" (forces vertical on mobile)

#### Button Component

Standard button with multiple variants and sizes.

```tsx
<Button variant="primary" size="md" onClick={handleClick}>
  Save Changes
</Button>
```

**Variants:**

- `primary` - Blue, main action
- `secondary` - Gray, secondary action
- `success` - Green, positive action
- `warning` - Yellow, cautionary action
- `danger` - Red, destructive action
- `ghost` - Transparent, subtle action
- `blue`, `lavender`, `sapphire`, `teal`, `green` - Colored variants

**Sizes:**

- `sm` - Small button
- `md` - Medium (default)
- `lg` - Large button

**Props:**

- `variant` - Visual style
- `size` - Button size
- `disabled` - Whether disabled
- `loading` - Shows loading spinner
- `iconOnly` - For icon-only buttons
- `fullWidth` - Spans full width

### Modal Component

Overlay dialog with header, body, and optional footer.

```tsx
<Modal isOpen={isOpen} onClose={handleClose} title="Settings">
  <div className="modal-content">{/* Modal content */}</div>
</Modal>
```

**Props:**

- `isOpen` - Whether modal is visible
- `onClose` - Callback when user closes modal
- `title` - Modal title in header
- `children` - Modal body content

### Info Banners

Inline informational messages within content.

```tsx
<div className="settings-info settings-info--success">
  ✓ All appearance settings are fully functional
</div>

<div className="settings-info">
  ℹ️ These settings are saved but not yet used
</div>

<div className="settings-info settings-info--warning">
  ℹ️ Notification features are not yet implemented
</div>
```

**Variants:**

- Default (blue) - Informational
- `settings-info--success` (green) - Positive/working features
- `settings-info--warning` (yellow) - Coming soon/not implemented
- `settings-info--error` (red) - Error states

## Layout Patterns

### Page Layout

```tsx
<div className="page">
  <div className="page-header">
    <h1>Page Title</h1>
    <p>Page description</p>
  </div>

  <div className="page-content">
    <Card title="Section 1">{/* Content */}</Card>

    <Card title="Section 2">{/* Content */}</Card>
  </div>
</div>
```

### Tabbed Interface

```tsx
<div className="tabs">
  <button className="tab tab--active">Tab 1</button>
  <button className="tab">Tab 2</button>
</div>

<div className="tab-panel">
  <Card title="Content">
    {/* Active tab content */}
  </Card>
</div>
```

### Settings/Form Layout

```tsx
<Card title="Settings Section" variant="success">
  {/* Info banner */}
  <div className="settings-info settings-info--success">
    ✓ These settings are working
  </div>

  {/* Form controls with proper spacing */}
  <Select {...selectProps} />
  <Toggle {...toggleProps} />
  <RadioGroup {...radioProps} />
</Card>
```

## Spacing System

Use consistent spacing values from density modes:

### Compact Mode

- Small gaps (0.5rem)
- Minimal padding (0.75rem)
- Tight line heights

### Comfortable Mode (Default)

- Medium gaps (1rem)
- Balanced padding (1rem)
- Standard line heights

### Spacious Mode

- Large gaps (1.5rem)
- Generous padding (1.5rem)
- Relaxed line heights

## Typography

### Headings

- Page title: `<h1>` - 2rem, weight 700
- Card title: `<h3 className="card__title">` - 1.25rem, weight 600
- Section label: `<label>` - 0.875-0.9375rem, weight 500-600

### Body Text

- Main content: 0.9375rem (15px)
- Help text: 0.8125rem (13px)
- Descriptions: 0.875rem (14px)

### Colors

- Primary text: `var(--color-text)`
- Secondary text: `var(--color-subtext0)` or `var(--color-subtext1)`
- Muted text: `var(--color-overlay0)`

## Color Usage

### Backgrounds

- Page: `var(--color-base)`
- Cards: `var(--color-mantle)`
- Surfaces: `var(--color-surface0)`, `var(--color-surface1)`, `var(--color-surface2)`

### Accents

- Primary action: `var(--color-blue)`
- Success: `var(--color-green)`
- Warning: `var(--color-yellow)`
- Error: `var(--color-red)`
- Info: `var(--color-sapphire)` or `var(--color-blue)`

### Borders

- Subtle: `var(--color-surface1)`
- Default: `var(--color-surface2)`
- Focused: `var(--color-blue)`

## Responsive Design

### Breakpoints

```scss
// Mobile first - base styles for mobile
.component {
  // Mobile styles
}

// Tablet and up
@media (min-width: 768px) {
  .component {
    // Tablet styles
  }
}

// Desktop and up
@media (min-width: 1024px) {
  .component {
    // Desktop styles
  }
}
```

### Mobile Adaptations

- **Tabs**: Horizontal scroll with **visible scrollbar on mobile** (hidden/hover on desktop)
- **Forms**: Full-width inputs, larger touch targets (44px minimum)
- **Cards**: Full-width, reduced padding
- **Buttons**: Stack vertically when space is tight
- **Modals**: Full-screen on mobile (100vw × 100vh, no padding, square corners)
- **Scrollable Containers**: Always show scrollbar on mobile for clear affordance

## Accessibility

### Focus States

All interactive elements must have visible focus indicators:

```scss
&:focus-visible {
  outline: 2px solid var(--color-blue);
  outline-offset: 2px;
}
```

### Touch Targets

Minimum 44x44 pixels for all interactive elements.

### ARIA Labels

```tsx
<button aria-label="Close modal">×</button>
<input aria-describedby="help-text" />
<div role="tabpanel" aria-labelledby="tab-1" />
```

### Keyboard Navigation

- Modals: Escape to close
- Forms: Tab order logical, Enter to submit
- Tabs: Arrow keys to navigate
- Menus: Arrow keys + Enter

## Animation Guidelines

### When to Animate

- Theme transitions (colors only)
- Modal/dialog entry/exit
- Dropdown menus opening/closing
- Hover states (subtle)
- Toggle switches

### When NOT to Animate

- Layout shifts
- Content loading
- Critical UI updates
- When user has animations disabled

### Respecting User Preferences

```scss
// Only animate when enabled
[data-animations="true"] .component {
  transition: all 0.2s ease;
}

[data-animations="false"] .component {
  transition: none;
}

// Respect system preferences
@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
  }
}
```

## Examples from Codebase

### About Page

Uses Card grid layout for organizing help content:

```tsx
<div className="card-grid card-grid--2">
  <Card title="Navigation Overview">{/* Navigation help */}</Card>

  <Card title="What is ACARS?">{/* ACARS explanation */}</Card>
</div>
```

### Settings Modal

Uses Cards for each tabbed section with variant styling:

```tsx
<Card
  title="Appearance"
  subtitle="Customize the look and feel"
  variant="success"
>
  {/* Settings controls */}
</Card>
```

## Anti-Patterns (DO NOT DO)

❌ **Inline styles**

```tsx
<div style={{ padding: '20px' }}> // WRONG
```

✅ **CSS classes**

```tsx
<div className="card"> // CORRECT
```

---

❌ **Third-party CSS frameworks**

```tsx
<div className="bootstrap-class"> // WRONG
```

✅ **Custom SCSS components**

```tsx
<div className="card"> // CORRECT
```

---

❌ **Arbitrary colors**

```scss
background: #3498db; // WRONG - not from Catppuccin
```

✅ **Catppuccin color variables**

```scss
background: var(--color-blue); // CORRECT
```

---

❌ **Missing mobile responsiveness**

```scss
.component {
  width: 800px; // WRONG - breaks on mobile
}
```

✅ **Mobile-first responsive**

```scss
.component {
  width: 100%; // CORRECT - scales to screen
  max-width: 800px;
}
```

## Mobile UX Patterns

### Scrollable Containers

When content can scroll horizontally (tabs, carousels, etc.), make it **obvious**:

**Desktop**: Hide scrollbar, show on hover

```scss
.scrollable-container {
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;

  &:hover {
    scrollbar-color: var(--color-surface2) transparent;
  }
}
```

**Mobile**: Always show scrollbar

```scss
@media (max-width: 768px) {
  .scrollable-container {
    scrollbar-width: thin;
    scrollbar-color: var(--color-overlay0) var(--color-surface1);
    padding-bottom: 0.5rem; // Space for scrollbar

    &::-webkit-scrollbar {
      height: 6px;
    }

    &::-webkit-scrollbar-track {
      background: var(--color-surface1);
      border-radius: 3px;
    }

    &::-webkit-scrollbar-thumb {
      background: var(--color-overlay0);
      border-radius: 3px;
    }
  }
}
```

**Why**: Users need clear visual indication that content scrolls. A visible scrollbar is universally understood.

### Full-Screen Modals on Mobile

On mobile devices, modals should use the entire viewport:

```scss
@media (max-width: 768px) {
  .modal-backdrop {
    padding: 0; // Remove all padding
  }

  .modal {
    width: 100%;
    height: 100vh;
    max-height: 100vh;
    border-radius: 0; // Square corners
    margin: 0;
  }
}
```

**Benefits**:

- Maximum screen real estate
- No wasted space with padding/margins
- Clearer "in a modal" context
- Easier to implement consistent layouts

### Button Sizing on Mobile

All buttons in a footer/action row should be the same size:

```tsx
// Consistent sizing
<Button size="sm">Import</Button>
<Button size="sm">Export</Button>
<Button size="sm">Done</Button>
```

**Don't**: Mix sizes - it looks inconsistent and confuses visual hierarchy

## Summary

The ACARS Hub visual design language centers around:

1. **Card components** for content organization
2. **Custom form components** (Select, Toggle, RadioGroup)
3. **Catppuccin theming** for all colors
4. **Mobile-first responsive design** as paramount
5. **Consistent spacing and typography** across all views
6. **Accessibility** built into every component
7. **Clear mobile affordances** - visible scrollbars, full-screen modals, obvious touch targets

### Key Mobile Principles

- **Scrollable content**: Always show scrollbar on mobile
- **Modals**: Full-screen (100vw × 100vh) with no padding
- **Buttons**: Consistent sizing, minimum 44px touch targets
- **Forms**: Stack vertically, full-width inputs
- **No assumptions**: Make interactions visually obvious

Use this guide when building new pages or components to maintain visual consistency throughout the application.
