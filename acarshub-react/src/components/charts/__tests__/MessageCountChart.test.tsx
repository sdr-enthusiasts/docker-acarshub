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
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SignalCountData } from "../../../types";

// ---------------------------------------------------------------------------
// Capture the data + options passed to <Bar> so we can assert on the
// computed math (good = total - errors), labels, dataset label, and the
// `title.text` toggle between empty/data variants without rendering canvas.
// ---------------------------------------------------------------------------
type CapturedBar = {
  data: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      backgroundColor: string[];
    }[];
  };
  options: {
    plugins: {
      title: { text: string };
    };
  };
};

let capturedBar: CapturedBar | null = null;

vi.mock("react-chartjs-2", () => ({
  Bar: (props: CapturedBar) => {
    capturedBar = props;
    return <div data-testid="bar-chart" />;
  },
}));

// Minimal settings store mock — theme value only
vi.mock("../../../store/useSettingsStore", () => ({
  useSettingsStore: (
    selector: (s: { settings: { appearance: { theme: string } } }) => unknown,
  ) => selector({ settings: { appearance: { theme: "mocha" } } }),
}));

import { MessageCountChart } from "../MessageCountChart";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCount(
  overrides: Partial<SignalCountData["count"]> = {},
): SignalCountData {
  return {
    count: {
      non_empty_total: 1000,
      non_empty_errors: 25,
      empty_total: 200,
      empty_errors: 5,
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MessageCountChart", () => {
  beforeEach(() => {
    capturedBar = null;
  });

  describe("empty / no-data state", () => {
    it("renders the no-data message when countData is null", () => {
      render(<MessageCountChart countData={null} showEmptyMessages={false} />);
      expect(
        screen.getByText(/no message count data available/i),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("bar-chart")).not.toBeInTheDocument();
    });

    it("renders the no-data message when data totals are zero (data variant)", () => {
      const data = makeCount({ non_empty_total: 0, non_empty_errors: 0 });
      render(<MessageCountChart countData={data} showEmptyMessages={false} />);
      expect(
        screen.getByText(/no message count data available/i),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("bar-chart")).not.toBeInTheDocument();
    });

    it("renders the no-data message when empty totals are zero (empty variant)", () => {
      const data = makeCount({ empty_total: 0, empty_errors: 0 });
      render(<MessageCountChart countData={data} showEmptyMessages={true} />);
      expect(
        screen.getByText(/no message count data available/i),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("bar-chart")).not.toBeInTheDocument();
    });
  });

  describe("data-messages variant (showEmptyMessages=false)", () => {
    it("computes good = non_empty_total - non_empty_errors and renders [good, errors, total]", () => {
      const data = makeCount({
        non_empty_total: 1000,
        non_empty_errors: 25,
      });

      render(<MessageCountChart countData={data} showEmptyMessages={false} />);

      expect(capturedBar?.data.labels).toEqual([
        "Good Messages",
        "Errors",
        "Total",
      ]);
      expect(capturedBar?.data.datasets[0].data).toEqual([975, 25, 1000]);
      expect(capturedBar?.data.datasets[0].label).toBe("Data Message Counts");
    });

    it("titles the chart with the Data Message Statistics text", () => {
      render(
        <MessageCountChart countData={makeCount()} showEmptyMessages={false} />,
      );
      expect(capturedBar?.options.plugins.title.text).toBe(
        "Data Message Statistics",
      );
    });
  });

  describe("empty-messages variant (showEmptyMessages=true)", () => {
    it("computes good = empty_total - empty_errors and uses empty_* fields", () => {
      const data = makeCount({
        empty_total: 200,
        empty_errors: 5,
      });

      render(<MessageCountChart countData={data} showEmptyMessages={true} />);

      expect(capturedBar?.data.datasets[0].data).toEqual([195, 5, 200]);
      expect(capturedBar?.data.datasets[0].label).toBe("Empty Message Counts");
    });

    it("titles the chart with the Empty Message Statistics text", () => {
      render(
        <MessageCountChart countData={makeCount()} showEmptyMessages={true} />,
      );
      expect(capturedBar?.options.plugins.title.text).toBe(
        "Empty Message Statistics",
      );
    });

    it("does NOT use non_empty_* fields when showEmptyMessages=true", () => {
      // Pathological data: empty_* small, non_empty_* huge. Output must
      // reflect empty_* only.
      const data = makeCount({
        non_empty_total: 999_999,
        non_empty_errors: 999_999,
        empty_total: 10,
        empty_errors: 3,
      });

      render(<MessageCountChart countData={data} showEmptyMessages={true} />);

      expect(capturedBar?.data.datasets[0].data).toEqual([7, 3, 10]);
    });
  });

  describe("regression: zero-error case", () => {
    it("renders good == total and errors == 0 without crashing", () => {
      const data = makeCount({
        non_empty_total: 500,
        non_empty_errors: 0,
      });

      render(<MessageCountChart countData={data} showEmptyMessages={false} />);

      expect(capturedBar?.data.datasets[0].data).toEqual([500, 0, 500]);
    });
  });

  describe("backgroundColor palette", () => {
    it("assigns three colors in order [good, error, total]", () => {
      render(
        <MessageCountChart countData={makeCount()} showEmptyMessages={false} />,
      );
      const colors = capturedBar?.data.datasets[0].backgroundColor ?? [];
      expect(colors).toHaveLength(3);
      // All three must be distinct strings
      expect(new Set(colors).size).toBe(3);
    });
  });
});
