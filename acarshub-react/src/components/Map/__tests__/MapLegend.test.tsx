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

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "../../../store/useSettingsStore";
import { MapLegend } from "../MapLegend";

function setColorByDecoder(enabled: boolean) {
  useSettingsStore.setState((state) => ({
    settings: {
      ...state.settings,
      map: { ...state.settings.map, colorByDecoder: enabled },
    },
  }));
}

function setGroundAltitudeThreshold(altitude: number) {
  useSettingsStore.setState((state) => ({
    settings: {
      ...state.settings,
      map: { ...state.settings.map, groundAltitudeThreshold: altitude },
    },
  }));
}

describe("MapLegend", () => {
  beforeEach(() => {
    useSettingsStore.getState().resetToDefaults();
  });

  afterEach(() => {
    useSettingsStore.getState().resetToDefaults();
  });

  describe("toggle behaviour", () => {
    it("renders the toggle button collapsed by default (no panel)", () => {
      render(<MapLegend />);

      const toggle = screen.getByRole("button", { name: /show legend/i });
      expect(toggle).toBeInTheDocument();
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("Aircraft Colors")).not.toBeInTheDocument();
    });

    it("opens the panel when the toggle is clicked, updating aria-expanded and aria-label", async () => {
      const user = userEvent.setup();
      render(<MapLegend />);

      await user.click(screen.getByRole("button", { name: /show legend/i }));

      expect(screen.getByText("Aircraft Colors")).toBeInTheDocument();
      const toggle = screen.getByRole("button", { name: /hide legend/i });
      expect(toggle).toHaveAttribute("aria-expanded", "true");
    });

    it("closes the panel via the toggle (second click)", async () => {
      const user = userEvent.setup();
      render(<MapLegend />);

      const toggle = screen.getByRole("button", { name: /show legend/i });
      await user.click(toggle);
      expect(screen.getByText("Aircraft Colors")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /hide legend/i }));
      expect(screen.queryByText("Aircraft Colors")).not.toBeInTheDocument();
    });

    it("closes the panel via the in-panel close button", async () => {
      const user = userEvent.setup();
      render(<MapLegend />);

      await user.click(screen.getByRole("button", { name: /show legend/i }));
      expect(screen.getByText("Aircraft Colors")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /close legend/i }));
      expect(screen.queryByText("Aircraft Colors")).not.toBeInTheDocument();
    });
  });

  describe("colour-mode branch (colorByDecoder=false, default)", () => {
    it("renders the legacy 'Aircraft with ACARS messages' item and NOT the per-decoder items", async () => {
      const user = userEvent.setup();
      setColorByDecoder(false);
      render(<MapLegend />);

      await user.click(screen.getByRole("button", { name: /show legend/i }));

      expect(
        screen.getByText("Aircraft with ACARS messages"),
      ).toBeInTheDocument();
      // Per-decoder items must NOT appear when colorByDecoder is false
      expect(screen.queryByText("ACARS messages")).not.toBeInTheDocument();
      expect(screen.queryByText("VDLM messages")).not.toBeInTheDocument();
      expect(screen.queryByText("HFDL messages")).not.toBeInTheDocument();
      expect(screen.queryByText("IMSL messages")).not.toBeInTheDocument();
      expect(screen.queryByText("IRDM messages")).not.toBeInTheDocument();
    });
  });

  describe("colour-mode branch (colorByDecoder=true)", () => {
    it("renders all five per-decoder items and NOT the legacy item", async () => {
      const user = userEvent.setup();
      setColorByDecoder(true);
      render(<MapLegend />);

      await user.click(screen.getByRole("button", { name: /show legend/i }));

      expect(screen.getByText("ACARS messages")).toBeInTheDocument();
      expect(screen.getByText("VDLM messages")).toBeInTheDocument();
      expect(screen.getByText("HFDL messages")).toBeInTheDocument();
      expect(screen.getByText("IMSL messages")).toBeInTheDocument();
      expect(screen.getByText("IRDM messages")).toBeInTheDocument();
      // Legacy item must NOT appear
      expect(
        screen.queryByText("Aircraft with ACARS messages"),
      ).not.toBeInTheDocument();
    });

    it("renders the per-decoder swatches with the expected per-type modifier classes", async () => {
      const user = userEvent.setup();
      setColorByDecoder(true);
      const { container } = render(<MapLegend />);

      await user.click(screen.getByRole("button", { name: /show legend/i }));

      // Each decoder type should produce a swatch with its modifier
      expect(
        container.querySelector(".map-legend__swatch--acars"),
      ).toBeInTheDocument();
      expect(
        container.querySelector(".map-legend__swatch--vdlm"),
      ).toBeInTheDocument();
      expect(
        container.querySelector(".map-legend__swatch--hfdl"),
      ).toBeInTheDocument();
      expect(
        container.querySelector(".map-legend__swatch--imsl"),
      ).toBeInTheDocument();
      expect(
        container.querySelector(".map-legend__swatch--irdm"),
      ).toBeInTheDocument();
    });
  });

  describe("always-present items", () => {
    it("always renders the alert, ground, and default items regardless of colour mode", async () => {
      const user = userEvent.setup();
      render(<MapLegend />);

      await user.click(screen.getByRole("button", { name: /show legend/i }));

      expect(screen.getByText("Aircraft with alerts")).toBeInTheDocument();
      expect(screen.getByText(/Aircraft on ground/)).toBeInTheDocument();
      expect(screen.getByText("Aircraft with no messages")).toBeInTheDocument();
    });

    it("interpolates the configured groundAltitudeThreshold into the ground-aircraft label", async () => {
      const user = userEvent.setup();
      setGroundAltitudeThreshold(1234);
      render(<MapLegend />);

      await user.click(screen.getByRole("button", { name: /show legend/i }));

      // <= entity is rendered as the actual character "≤"
      expect(
        screen.getByText(/Aircraft on ground.*1234.*ft MSL/),
      ).toBeInTheDocument();
    });

    it("reflects a different groundAltitudeThreshold value (proves the label isn't hard-coded)", async () => {
      const user = userEvent.setup();
      setGroundAltitudeThreshold(0);
      render(<MapLegend />);

      await user.click(screen.getByRole("button", { name: /show legend/i }));

      expect(
        screen.getByText(/Aircraft on ground.*\b0\b.*ft MSL/),
      ).toBeInTheDocument();
    });
  });
});
