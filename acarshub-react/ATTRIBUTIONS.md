# Third-Party Attributions

This document provides attribution for third-party assets, algorithms, and resources used in ACARS Hub React frontend.

## Aircraft Silhouettes

### pw-silhouettes

- **Source**: <https://github.com/plane-watch/pw-silhouettes>
- **License**: CC BY-NC-SA 4.0 (Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International)
- **Usage**: Aircraft sprite silhouettes for map markers
- **Assets**: `public/static/sprites/spritesheet.png`, `public/static/sprites/spritesheet.json`
- **Version**: 20260210.1

All silhouettes, artwork, and metadata from pw-silhouettes are licensed under CC BY-NC-SA 4.0.

**Commercial use is not permitted under this license.** Commercial licensing is available upon request from the pw-silhouettes project maintainers.

**Attribution Requirements**:

- Credit to plane-watch project
- Link to repository
- License notice (CC BY-NC-SA 4.0)
- Indication of changes (if modified)

## CSS Filter Algorithm

### HEX Color to CSS Filter Converter

- **Source**: <https://codepen.io/sosuke/pen/Pjoqqp>
- **Author**: Barrett Sonntag (@sosuke)
- **License**: MIT
- **Usage**: Algorithm for computing CSS filter values to achieve exact color transformations
- **Implementation**: `src/components/Map/AircraftSprite.scss`

The color matrix solver uses SPSA (Simultaneous Perturbation Stochastic Approximation) to compute optimal CSS filter combinations (`invert()`, `sepia()`, `saturate()`, `hue-rotate()`, `brightness()`, `contrast()`) that transform white sprites into target Catppuccin colors.

**Filter Values Computed**:

- Catppuccin Mocha (dark theme): 4 state colors
- Catppuccin Latte (light theme): 4 state colors

All computed filter values achieve Loss <5 (near-perfect color accuracy).

## ACARS Decoder

### @airframes/acars-decoder

- **Source**: <https://www.npmjs.com/package/@airframes/acars-decoder>
- **License**: MIT
- **Usage**: Decoding ACARS messages
- **Version**: See `package.json`

## Catppuccin Color Palette

### Catppuccin

- **Source**: <https://github.com/catppuccin/catppuccin>
- **License**: MIT
- **Usage**: Color palette for theming (Mocha dark theme, Latte light theme)
- **Implementation**: `src/styles/_variables.scss`, `src/styles/_mixins.scss`

All colors in ACARS Hub React frontend are sourced from the Catppuccin palette to ensure consistent, accessible theming.

## Font Awesome Icons

### Font Awesome Free

- **Source**: <https://fontawesome.com>
- **License**: Font Awesome Free License
  - Icons: CC BY 4.0
  - Fonts: SIL OFL 1.1
  - Code: MIT
- **Usage**: UI icons throughout application
- **Version**: See `package.json`

## Stack Overflow Code Snippets

### CSS Filter Technique Reference

- **Source**: <https://stackoverflow.com/a/76502306>
- **Author**: mikemaccana (modified by community)
- **License**: CC BY-SA 4.0
- **Usage**: Initial research and validation of CSS filter colorization approach

This specific technique was used as a reference during investigation but not directly implemented. The final implementation uses the MIT-licensed algorithm from Barrett Sonntag (see above).

## License Compliance Summary

| Asset/Code               | License                       | Commercial Use                    | Attribution Required |
| ------------------------ | ----------------------------- | --------------------------------- | -------------------- |
| pw-silhouettes           | CC BY-NC-SA 4.0               | ❌ No (requires separate license) | ✅ Yes               |
| CSS Filter Algorithm     | MIT                           | ✅ Yes                            | ✅ Yes               |
| @airframes/acars-decoder | MIT                           | ✅ Yes                            | ✅ Yes               |
| Catppuccin               | MIT                           | ✅ Yes                            | ✅ Yes               |
| Font Awesome Free        | CC BY 4.0 / SIL OFL 1.1 / MIT | ✅ Yes                            | ✅ Yes               |

## ACARS Hub License

ACARS Hub is open-source software. See `LICENSE` file in repository root for details.

**Note**: While ACARS Hub itself may be open-source, the pw-silhouettes assets are licensed under CC BY-NC-SA 4.0, which **prohibits commercial use** without obtaining a separate commercial license from the pw-silhouettes project maintainers.

## Contact

For questions about third-party licenses or to report attribution issues:

- Open an issue on the ACARS Hub GitHub repository
- For pw-silhouettes commercial licensing: Contact plane-watch project maintainers

## Updates

This attribution file should be updated whenever:

- New third-party assets are added
- Versions of dependencies are significantly updated
- License terms change
- New code snippets from external sources are incorporated

**Last Updated**: 2026-02-11
