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

import { describe, expect, it } from "vitest";
import { getMarkerSizeScale } from "../markerSize";

describe("getMarkerSizeScale", () => {
  it("returns 1 (no-op) for 'medium', so default rendering is unchanged", () => {
    expect(getMarkerSizeScale("medium")).toBe(1);
  });

  it("returns a scale below 1 for 'small'", () => {
    expect(getMarkerSizeScale("small")).toBeLessThan(1);
  });

  it("returns a scale above 1 for 'large'", () => {
    expect(getMarkerSizeScale("large")).toBeGreaterThan(1);
  });

  it("orders small < medium < large", () => {
    const small = getMarkerSizeScale("small");
    const medium = getMarkerSizeScale("medium");
    const large = getMarkerSizeScale("large");
    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
  });
});
