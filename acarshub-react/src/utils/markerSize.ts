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

// ----------------------------------------------------------------------------
// FEAT-MARKER-SIZE: user-configurable aircraft marker size on the map.
//
// The scale factor here is applied to the *generation* math for both marker
// rendering paths (SVG data-URI dimensions in utils/aircraftIcons, and the
// sprite-atlas crop math in utils/spriteLoader), not via a CSS transform or
// calc() on the rendered box. Two reasons a pure-CSS approach was rejected:
//
// 1. Sprite atlas cropping: `background-position`/`background-size` are
//    exact pixel offsets into a shared spritesheet image. Scaling only the
//    button's width/height in CSS without proportionally rescaling the crop
//    offset and background-size would misalign the visible sprite (it would
//    show a shifted/wrong crop of the atlas, not just a resized version of
//    the correct one). Recomputing all of x/y/width/height/background-size
//    together from one `scale` factor (as this module's consumers do) keeps
//    the crop mathematically correct at any size.
// 2. Touch-target composition: `transform: scale()` is applied *after*
//    layout, so it would shrink a box that already has a `min-width`/
//    `min-height` touch-target floor applied — defeating the floor at the
//    "small" setting. Baking the scale into the actual generated pixel
//    dimensions lets `min-width`/`min-height` in SCSS compose correctly
//    (CSS resolves min-width against the used width in the same layout
//    pass), so the touch-target floor holds regardless of scale.
// ----------------------------------------------------------------------------

import type { MarkerSize } from "../types/ui";

/**
 * Multiplier applied to the default ("medium") marker rendering size.
 * "medium" is exactly 1 so existing (pre-feature) rendering is unchanged
 * at the default setting.
 */
const MARKER_SIZE_SCALE: Readonly<Record<MarkerSize, number>> = {
  small: 0.8,
  medium: 1,
  large: 1.25,
};

/**
 * Returns the scale multiplier for a given marker size setting.
 *
 * @param size - The user's configured marker size preference.
 */
export function getMarkerSizeScale(size: MarkerSize): number {
  return MARKER_SIZE_SCALE[size];
}
