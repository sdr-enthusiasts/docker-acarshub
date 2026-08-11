// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.

// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Shared viewport breakpoints for the small number of places where JS layout
 * decisions must agree *exactly* with a CSS media query.
 *
 * WHY this file exists:
 * Most responsive behaviour in ACARS Hub is pure SCSS (`@include
 * breakpoint(md)`) and needs no JS counterpart. A few cases genuinely cannot
 * be expressed in CSS alone — notably relocating a control into a *different
 * part of the DOM tree* (a React portal) rather than merely restyling it in
 * place. Those cases require JS to evaluate the same threshold that the SCSS
 * uses, and if the two ever disagree the UI breaks in ways that are invisible
 * to both the type checker and to any single-viewport test: a control can end
 * up rendered into a portal target that CSS has hidden, or duplicated in two
 * visible places at once.
 *
 * The values below are therefore *mirrors* of SCSS declarations, and
 * `utils/__tests__/breakpoints.test.ts` parses the SCSS at test time to prove
 * the mirror is still accurate. Change one and the test tells you to change
 * the other.
 *
 * NOTE: this is deliberately NOT a general re-export of the SCSS
 * `$breakpoint-*` scale. Duplicating the whole scale into TS would invite JS
 * media queries where a plain SCSS rule would do. Only add an entry here when
 * a JS consumer provably needs it.
 */

/**
 * Viewport height (px) at or below which `.page__header` is hidden.
 *
 * Mirrors: `@media (max-height: 800px) { .page__header { display: none } }`
 * in `styles/pages/_common.scss`.
 *
 * The header carries each page's title, stat line, and (on Alerts) the
 * "Mark All Read" action. It is suppressed on short viewports because the
 * information it holds is largely redundant with the nav bar and the page
 * body, and the vertical space is worth more to the message list.
 */
export const PAGE_HEADER_HIDDEN_MAX_HEIGHT_PX = 800;

/**
 * Viewport width (px) at or below which `Navigation` renders its mobile
 * layout (`.mobile_nav_container`) instead of the desktop nav (`ul.primary`).
 *
 * This is one below the SCSS `$breakpoint-md` (768px) so that the JS
 * `max-width` query and the SCSS `min-width` query partition the axis with no
 * overlap and no gap.
 */
export const MOBILE_NAV_MAX_WIDTH_PX = 767;

/**
 * Matches when `.page__header` is hidden by CSS.
 *
 * Consumers that render into or depend on the header MUST gate on this rather
 * than on a hand-written height query, otherwise they will disagree with the
 * SCSS at the boundary pixel.
 */
export const PAGE_HEADER_HIDDEN_QUERY = `(max-height: ${PAGE_HEADER_HIDDEN_MAX_HEIGHT_PX}px)`;

/**
 * Matches when `Navigation` is rendering its mobile layout.
 *
 * Anything that portals into the mobile nav bar must gate on this exact query
 * so the portal target is guaranteed to be mounted.
 */
export const MOBILE_NAV_QUERY = `(max-width: ${MOBILE_NAV_MAX_WIDTH_PX}px)`;
