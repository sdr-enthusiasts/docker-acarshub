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
 * Aircraft icon generation utilities — barrel.
 *
 * GOD-06: this used to be a single 1510-line utils/aircraftIcons.ts file
 * mixing ~1250 lines of pure lookup-table data with ~200 lines of logic.
 * Split into:
 *   - data.ts  — ShapeDefinition interface + shapes/TypeDesignatorIcons/
 *     TypeDescriptionIcons/CategoryIcons lookup tables (data only, no logic)
 *   - logic.ts — getBaseMarker/svgShapeToURI/getAircraftColor/shouldRotate
 *     (the functions that consume the lookup tables)
 *
 * Re-exported here so existing consumers (AircraftMarkers.tsx, the test
 * suite) keep importing from "utils/aircraftIcons" unchanged.
 */

export type { ShapeDefinition } from "./data";
export {
  getAircraftColor,
  getBaseMarker,
  type SVGResult,
  shouldRotate,
  svgShapeToURI,
} from "./logic";
