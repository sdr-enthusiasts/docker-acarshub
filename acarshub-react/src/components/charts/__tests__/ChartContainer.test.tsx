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
import { describe, expect, it } from "vitest";
import { ChartContainer } from "../ChartContainer";

// ---------------------------------------------------------------------------
// ChartContainer is a pure presentational wrapper — no Chart.js, no stores,
// no async behaviour. Tests target the conditional header rendering, header
// composition, custom className pass-through, and children rendering.
// ---------------------------------------------------------------------------

describe("ChartContainer", () => {
  describe("structure", () => {
    it("always renders a .chart-container root with the canvas slot", () => {
      const { container } = render(
        <ChartContainer>
          <span data-testid="child">child</span>
        </ChartContainer>,
      );
      const root = container.querySelector(".chart-container");
      expect(root).toBeInTheDocument();
      expect(
        root?.querySelector(".chart-container__canvas"),
      ).toBeInTheDocument();
    });

    it("renders children inside the canvas slot", () => {
      render(
        <ChartContainer>
          <span data-testid="child">payload</span>
        </ChartContainer>,
      );
      const canvas = document.querySelector(".chart-container__canvas");
      expect(canvas).toContainElement(screen.getByTestId("child"));
    });
  });

  describe("header conditional rendering", () => {
    it("does NOT render the header when neither title nor subtitle is provided", () => {
      const { container } = render(
        <ChartContainer>
          <span>x</span>
        </ChartContainer>,
      );
      expect(
        container.querySelector(".chart-container__header"),
      ).not.toBeInTheDocument();
    });

    it("renders the header when only a title is provided", () => {
      render(
        <ChartContainer title="Signal Levels">
          <span>x</span>
        </ChartContainer>,
      );
      expect(
        document.querySelector(".chart-container__header"),
      ).toBeInTheDocument();
      // Title renders as <h3>.
      expect(
        screen.getByRole("heading", { level: 3, name: /signal levels/i }),
      ).toBeInTheDocument();
      // Subtitle absent.
      expect(
        document.querySelector(".chart-container__subtitle"),
      ).not.toBeInTheDocument();
    });

    it("renders the header when only a subtitle is provided", () => {
      render(
        <ChartContainer subtitle="Last 100 samples">
          <span>x</span>
        </ChartContainer>,
      );
      expect(
        document.querySelector(".chart-container__header"),
      ).toBeInTheDocument();
      expect(screen.getByText(/last 100 samples/i)).toBeInTheDocument();
      expect(
        document.querySelector(".chart-container__title"),
      ).not.toBeInTheDocument();
    });

    it("renders both title and subtitle when provided together", () => {
      render(
        <ChartContainer title="Frequencies" subtitle="By decoder">
          <span>x</span>
        </ChartContainer>,
      );
      expect(
        screen.getByRole("heading", { level: 3, name: /frequencies/i }),
      ).toBeInTheDocument();
      expect(screen.getByText(/by decoder/i)).toBeInTheDocument();
    });
  });

  describe("className", () => {
    it("appends the custom className to the root element", () => {
      const { container } = render(
        <ChartContainer className="custom-extra">
          <span>x</span>
        </ChartContainer>,
      );
      const root = container.querySelector(".chart-container");
      expect(root).toHaveClass("chart-container");
      expect(root).toHaveClass("custom-extra");
    });

    it("renders without a trailing extra class when className is omitted", () => {
      const { container } = render(
        <ChartContainer>
          <span>x</span>
        </ChartContainer>,
      );
      const root = container.querySelector(".chart-container");
      expect(root?.className).toBe("chart-container ");
    });
  });
});
