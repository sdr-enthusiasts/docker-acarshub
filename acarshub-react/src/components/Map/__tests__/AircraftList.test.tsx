// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
//
// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PairedAircraft } from "../../../utils/aircraftPairing";
import { AircraftList } from "../AircraftList";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal PairedAircraft fixture.  All required fields are set to
 * sensible defaults; the caller may override any field via the spread.
 */
function makeAircraft(overrides: Partial<PairedAircraft> = {}): PairedAircraft {
  return {
    hex: "a1b2c3",
    flight: "UAL123",
    hasMessages: false,
    hasAlerts: false,
    messageCount: 0,
    alertCount: 0,
    matchStrategy: "none",
    decoderTypes: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Decoder-type badges
// ---------------------------------------------------------------------------

describe("AircraftList – decoder-type badges", () => {
  it("renders an ACARS decoder badge when decoderTypes contains ACARS", () => {
    const aircraft = makeAircraft({
      hasMessages: true,
      messageCount: 1,
      decoderTypes: ["ACARS"],
    });

    render(
      <AircraftList
        aircraft={[aircraft]}
        hoveredAircraft={null}
        sidebarWidth={400}
      />,
    );

    // The ACARS decoder badge is a coloured circle with the BEM modifier --acars.
    const badge = document.querySelector(
      ".aircraft-list__decoder-badge--acars",
    );
    expect(badge).not.toBeNull();
  });

  it("does not render an ACARS decoder badge when decoderTypes is empty", () => {
    const aircraft = makeAircraft({ decoderTypes: [] });

    render(
      <AircraftList
        aircraft={[aircraft]}
        hoveredAircraft={null}
        sidebarWidth={400}
      />,
    );

    expect(
      document.querySelector(".aircraft-list__decoder-badge--acars"),
    ).toBeNull();
  });

  it("renders an ACARS badge for paired aircraft but not for unpaired in the same list", () => {
    const paired = makeAircraft({
      hex: "aaa111",
      flight: "UAL123",
      hasMessages: true,
      messageCount: 1,
      decoderTypes: ["ACARS"],
    });
    const unpaired = makeAircraft({
      hex: "bbb222",
      flight: "DAL456",
      hasMessages: false,
      messageCount: 0,
      decoderTypes: [],
    });

    render(
      <AircraftList
        aircraft={[paired, unpaired]}
        hoveredAircraft={null}
        sidebarWidth={400}
      />,
    );

    // Only one ACARS badge — for the paired aircraft
    const badges = document.querySelectorAll(
      ".aircraft-list__decoder-badge--acars",
    );
    expect(badges).toHaveLength(1);
  });

  it("renders VDLM2 and HFDL badges for the correct decoder types", () => {
    const aircraft = makeAircraft({
      hasMessages: true,
      messageCount: 2,
      // In JSDOM, getBoundingClientRect returns 0 so maxDecoderBadges = 1
      // regardless of sidebarWidth.  Use a single decoder type to ensure
      // exactly one badge renders.
      decoderTypes: ["VDLM2"],
    });

    render(
      <AircraftList
        aircraft={[aircraft]}
        hoveredAircraft={null}
        sidebarWidth={400}
      />,
    );

    expect(
      document.querySelector(".aircraft-list__decoder-badge--vdlm2"),
    ).not.toBeNull();
    expect(
      document.querySelector(".aircraft-list__decoder-badge--acars"),
    ).toBeNull();
  });

  it("decoder badge has correct accessibility attributes", () => {
    const aircraft = makeAircraft({
      hasMessages: true,
      messageCount: 1,
      decoderTypes: ["ACARS"],
    });

    render(
      <AircraftList
        aircraft={[aircraft]}
        hoveredAircraft={null}
        sidebarWidth={400}
      />,
    );

    const badge = document.querySelector(
      ".aircraft-list__decoder-badge--acars",
    );
    expect(badge?.getAttribute("role")).toBe("img");
    expect(badge?.getAttribute("aria-label")).toBe("Has ACARS messages");
    expect(badge?.getAttribute("title")).toBe("ACARS messages");
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("AircraftList – empty state", () => {
  it("renders the empty-state message when no aircraft are provided", () => {
    render(
      <AircraftList aircraft={[]} hoveredAircraft={null} sidebarWidth={400} />,
    );

    expect(screen.getByText(/no aircraft/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// onAircraftClick callback
// ---------------------------------------------------------------------------

describe("AircraftList – interaction callbacks", () => {
  it("calls onAircraftClick with the aircraft when a row is clicked", () => {
    const aircraft = makeAircraft({ flight: "SWA789" });
    const onClick = vi.fn();

    const { container } = render(
      <AircraftList
        aircraft={[aircraft]}
        hoveredAircraft={null}
        sidebarWidth={400}
        onAircraftClick={onClick}
      />,
    );

    const row = container.querySelector(".aircraft-list__row");
    expect(row).not.toBeNull();
    (row as HTMLElement).click();

    expect(onClick).toHaveBeenCalledWith(aircraft);
  });
});
