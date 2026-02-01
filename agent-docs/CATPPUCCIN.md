# Catppuccin Color Reference

This document provides quick reference for all Catppuccin colors used in ACARS Hub React frontend.

**Official Reference**: <https://github.com/catppuccin/catppuccin>

## Theme Usage

- **Catppuccin Mocha** (Dark) - Default theme
- **Catppuccin Latte** (Light) - Alternative theme

## Color Palette

### Mocha (Dark Theme)

| Color Name  | Hex Code  | Usage                   |
| ----------- | --------- | ----------------------- |
| `rosewater` | `#f5e0dc` | Highlights, accents     |
| `flamingo`  | `#f2cdcd` | Accents, warnings       |
| `pink`      | `#f5c2e7` | Accents, highlights     |
| `mauve`     | `#cba6f7` | Primary purple accent   |
| `red`       | `#f38ba8` | Errors, alerts, danger  |
| `maroon`    | `#eba0ac` | Errors, alerts          |
| `peach`     | `#fab387` | Warnings, secondary     |
| `yellow`    | `#f9e2af` | Warnings, highlights    |
| `green`     | `#a6e3a1` | Success, positive       |
| `teal`      | `#94e2d5` | Accents, info           |
| `sky`       | `#89dceb` | Info, accents           |
| `sapphire`  | `#74c7ec` | Info, links             |
| `blue`      | `#89b4fa` | Primary, links, actions |
| `lavender`  | `#b4befe` | Accents, highlights     |
| `text`      | `#cdd6f4` | Primary text            |
| `subtext1`  | `#bac2de` | Secondary text          |
| `subtext0`  | `#a6adc8` | Tertiary text, muted    |
| `overlay2`  | `#9399b2` | Overlays, borders       |
| `overlay1`  | `#7f849c` | Overlays, borders       |
| `overlay0`  | `#6c7086` | Overlays, borders       |
| `surface2`  | `#585b70` | Surface elements        |
| `surface1`  | `#45475a` | Surface elements        |
| `surface0`  | `#313244` | Surface elements        |
| `base`      | `#1e1e2e` | Primary background      |
| `mantle`    | `#181825` | Secondary background    |
| `crust`     | `#11111b` | Tertiary background     |

### Latte (Light Theme)

| Color Name  | Hex Code  | Usage                   |
| ----------- | --------- | ----------------------- |
| `rosewater` | `#dc8a78` | Highlights, accents     |
| `flamingo`  | `#dd7878` | Accents, warnings       |
| `pink`      | `#ea76cb` | Accents, highlights     |
| `mauve`     | `#8839ef` | Primary purple accent   |
| `red`       | `#d20f39` | Errors, alerts, danger  |
| `maroon`    | `#e64553` | Errors, alerts          |
| `peach`     | `#fe640b` | Warnings, secondary     |
| `yellow`    | `#df8e1d` | Warnings, highlights    |
| `green`     | `#40a02b` | Success, positive       |
| `teal`      | `#179299` | Accents, info           |
| `sky`       | `#04a5e5` | Info, accents           |
| `sapphire`  | `#209fb5` | Info, links             |
| `blue`      | `#1e66f5` | Primary, links, actions |
| `lavender`  | `#7287fd` | Accents, highlights     |
| `text`      | `#4c4f69` | Primary text            |
| `subtext1`  | `#5c5f77` | Secondary text          |
| `subtext0`  | `#6c6f85` | Tertiary text, muted    |
| `overlay2`  | `#7c7f93` | Overlays, borders       |
| `overlay1`  | `#8c8fa1` | Overlays, borders       |
| `overlay0`  | `#9ca0b0` | Overlays, borders       |
| `surface2`  | `#acb0be` | Surface elements        |
| `surface1`  | `#bcc0cc` | Surface elements        |
| `surface0`  | `#ccd0da` | Surface elements        |
| `base`      | `#eff1f5` | Primary background      |
| `mantle`    | `#e6e9ef` | Secondary background    |
| `crust`     | `#dce0e8` | Tertiary background     |

## SCSS Variables

### Mocha Variables

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

### Latte Variables

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

## Recommended Color Usage

### Backgrounds

- **Primary**: `base`
- **Secondary**: `mantle`
- **Tertiary**: `crust`
- **Elevated surfaces**: `surface0`, `surface1`, `surface2`

### Text

- **Primary**: `text`
- **Secondary**: `subtext1`
- **Muted/Disabled**: `subtext0`

### UI Elements

- **Borders**: `overlay0`, `overlay1`, `overlay2`
- **Shadows**: `crust` with opacity
- **Focus rings**: `sapphire` or `blue`

### Semantic Colors

- **Primary action**: `blue`
- **Success**: `green`
- **Warning**: `yellow` or `peach`
- **Error/Danger**: `red` or `maroon`
- **Info**: `sky` or `sapphire`

### Accent Colors

Use for highlights, badges, special UI elements:

- `rosewater`, `flamingo`, `pink`, `mauve`, `lavender`, `teal`

## Theme Mixin Template

```scss
@mixin theme-mocha {
  // Backgrounds
  --color-base: #{$mocha-base};
  --color-mantle: #{$mocha-mantle};
  --color-crust: #{$mocha-crust};
  --color-surface0: #{$mocha-surface0};
  --color-surface1: #{$mocha-surface1};
  --color-surface2: #{$mocha-surface2};

  // Text
  --color-text: #{$mocha-text};
  --color-subtext1: #{$mocha-subtext1};
  --color-subtext0: #{$mocha-subtext0};

  // Overlays
  --color-overlay0: #{$mocha-overlay0};
  --color-overlay1: #{$mocha-overlay1};
  --color-overlay2: #{$mocha-overlay2};

  // Semantic
  --color-primary: #{$mocha-blue};
  --color-success: #{$mocha-green};
  --color-warning: #{$mocha-yellow};
  --color-danger: #{$mocha-red};
  --color-info: #{$mocha-sky};

  // Accents
  --color-accent1: #{$mocha-mauve};
  --color-accent2: #{$mocha-lavender};
  --color-accent3: #{$mocha-teal};
  --color-accent4: #{$mocha-pink};
}

@mixin theme-latte {
  // Backgrounds
  --color-base: #{$latte-base};
  --color-mantle: #{$latte-mantle};
  --color-crust: #{$latte-crust};
  --color-surface0: #{$latte-surface0};
  --color-surface1: #{$latte-surface1};
  --color-surface2: #{$latte-surface2};

  // Text
  --color-text: #{$latte-text};
  --color-subtext1: #{$latte-subtext1};
  --color-subtext0: #{$latte-subtext0};

  // Overlays
  --color-overlay0: #{$latte-overlay0};
  --color-overlay1: #{$latte-overlay1};
  --color-overlay2: #{$latte-overlay2};

  // Semantic
  --color-primary: #{$latte-blue};
  --color-success: #{$latte-green};
  --color-warning: #{$latte-yellow};
  --color-danger: #{$latte-red};
  --color-info: #{$latte-sky};

  // Accents
  --color-accent1: #{$latte-mauve};
  --color-accent2: #{$latte-lavender};
  --color-accent3: #{$latte-teal};
  --color-accent4: #{$latte-pink};
}
```

## Usage Example

```scss
// Define themes
:root {
  @include theme-mocha; // Default dark theme
}

[data-theme="light"] {
  @include theme-latte;
}

// Use in components
.button {
  background-color: var(--color-primary);
  color: var(--color-base);
  border: 1px solid var(--color-overlay0);

  &:hover {
    background-color: var(--color-accent1);
  }

  &:focus {
    outline: 2px solid var(--color-primary);
  }
}

.alert {
  &--success {
    background-color: var(--color-success);
    color: var(--color-base);
  }

  &--danger {
    background-color: var(--color-danger);
    color: var(--color-base);
  }
}
```

## Rules

1. **Every color MUST come from Catppuccin palette** - No arbitrary hex values
2. **Use CSS custom properties** - Define in mixins, reference in components
3. **Theme switching** - Only variable names change between mocha/latte
4. **Semantic naming** - Use meaningful custom property names (e.g., `--color-primary` not `--color-blue`)
5. **Maintain contrast** - Ensure WCAG AA compliance for text/background combinations
