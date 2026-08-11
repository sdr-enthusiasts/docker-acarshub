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

import {
  MOBILE_NAV_QUERY,
  PAGE_HEADER_HIDDEN_QUERY,
} from "../utils/breakpoints";
import { useMediaQuery } from "./useMediaQuery";

/**
 * Where the Alerts page anchors its primary action ("Mark All Read").
 *
 * The action must remain reachable at every viewport, but its natural home —
 * `.page__header` — is hidden on short viewports. Rather than encode that as a
 * pair of booleans at the call site (which would admit the meaningless
 * "header hidden AND rendering into the header" combination), the resolved
 * position is a single named state.
 */
export type AlertActionPlacement =
  /**
   * Inside `.page__header`, alongside the title and stat line.
   * The preferred home: the action sits with the counts it acts upon.
   */
  | "page-header"
  /**
   * Inside the Live/Historical control row, anchored to its right edge.
   * Used when the header is hidden but the viewport is still wide enough that
   * a third item on the mode row does not crowd the two mode buttons.
   */
  | "controls-bar"
  /**
   * Portalled into the mobile nav bar, right of the msg/min widget.
   * Used when the header is hidden AND the viewport is narrow: at phone
   * widths the mode buttons already span the full row, so the nav bar is the
   * only remaining always-visible position.
   */
  | "nav-slot";

/**
 * useAlertActionPlacement
 *
 * Resolves the placement of the Alerts page's "Mark All Read" action from the
 * current viewport.
 *
 * The rule, in priority order:
 *
 * | Condition                          | Placement      |
 * | ---------------------------------- | -------------- |
 * | header visible (height > 800px)    | `page-header`  |
 * | header hidden, width >= 768px      | `controls-bar` |
 * | header hidden, width <= 767px      | `nav-slot`     |
 *
 * WHY height is checked before width:
 * the header is suppressed by a height query alone, so whenever it is on
 * screen it is the correct home regardless of how narrow the viewport is —
 * relocating the action out of a *visible* header would leave a conspicuous
 * gap next to the stats it belongs with. Width only becomes relevant once the
 * header is gone and an alternative must be chosen.
 *
 * WHY the thresholds come from `utils/breakpoints`:
 * both queries mirror CSS that governs whether the corresponding container is
 * even on screen. A locally-written threshold that drifted from the SCSS would
 * place the action into a hidden container — a failure that renders the
 * action invisible while every unit test still passes.
 */
export function useAlertActionPlacement(): AlertActionPlacement {
  const pageHeaderHidden = useMediaQuery(PAGE_HEADER_HIDDEN_QUERY);
  const mobileNav = useMediaQuery(MOBILE_NAV_QUERY);

  if (!pageHeaderHidden) return "page-header";
  return mobileNav ? "nav-slot" : "controls-bar";
}
