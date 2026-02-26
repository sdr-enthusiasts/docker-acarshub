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
import type { AlertTerm } from "../../../types";

// ---------------------------------------------------------------------------
// Capture the data prop passed to <Bar> so we can assert on sort order
// without relying on canvas rendering.
// ---------------------------------------------------------------------------
let capturedBarData: {
  labels: string[];
  datasets: { data: number[] }[];
} | null = null;

vi.mock("react-chartjs-2", () => ({
  Bar: (props: {
    data: { labels: string[]; datasets: { data: number[] }[] };
  }) => {
    capturedBarData = props.data;
    return <div data-testid="bar-chart" />;
  },
}));

// Minimal settings store mock — theme value only
vi.mock("../../../store/useSettingsStore", () => ({
  useSettingsStore: (
    selector: (s: { settings: { appearance: { theme: string } } }) => unknown,
  ) => selector({ settings: { appearance: { theme: "mocha" } } }),
}));

import { AlertTermsChart } from "../AlertTermsChart";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an AlertTerm object from a plain array of {term, count} pairs.
 * The AlertTerm interface uses numeric index keys — we use insertion order
 * here so tests can verify that the output order is driven by count, not
 * by key order.
 */
function makeAlertTermData(
  entries: { term: string; count: number }[],
): AlertTerm {
  const result: AlertTerm = {};
  entries.forEach(({ term, count }, i) => {
    result[i] = { id: i, term, count };
  });
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AlertTermsChart", () => {
  beforeEach(() => {
    capturedBarData = null;
  });

  describe("empty / no-data state", () => {
    it("renders the no-data message when alertTermData is null", () => {
      render(<AlertTermsChart alertTermData={null} />);
      expect(screen.getByText(/no alert terms data available/i)).toBeTruthy();
    });

    it("renders the no-data message when alertTermData is an empty object", () => {
      render(<AlertTermsChart alertTermData={{} as AlertTerm} />);
      expect(screen.getByText(/no alert terms data available/i)).toBeTruthy();
    });
  });

  describe("regression: alert terms are sorted most to least", () => {
    it("renders bars in descending count order when data arrives unsorted", () => {
      const unsorted = makeAlertTermData([
        { term: "AAL", count: 10 },
        { term: "UAL", count: 500 },
        { term: "SWA", count: 75 },
        { term: "DAL", count: 1200 },
        { term: "SKW", count: 42 },
      ]);

      render(<AlertTermsChart alertTermData={unsorted} />);

      const labels = capturedBarData?.labels ?? [];
      const counts = capturedBarData?.datasets[0].data ?? [];

      // Labels should be ordered highest → lowest count
      expect(labels).toEqual([
        "DAL", // 1200
        "UAL", // 500
        "SWA", // 75
        "SKW", // 42
        "AAL", // 10
      ]);

      // Counts must be strictly non-increasing
      for (let i = 0; i < counts.length - 1; i++) {
        expect(counts[i]).toBeGreaterThanOrEqual(counts[i + 1]);
      }
    });

    it("renders bars in descending count order when data arrives already sorted ascending", () => {
      const ascending = makeAlertTermData([
        { term: "AAL", count: 5 },
        { term: "DAL", count: 20 },
        { term: "UAL", count: 60 },
        { term: "SWA", count: 300 },
      ]);

      render(<AlertTermsChart alertTermData={ascending} />);

      const counts = capturedBarData?.datasets[0].data ?? [];

      // First bar must be the highest count
      expect(counts[0]).toBe(300);
      // Last bar must be the lowest count
      expect(counts[counts.length - 1]).toBe(5);
    });

    it("places the highest-count term first regardless of its original key position", () => {
      const data = makeAlertTermData([
        { term: "LOW", count: 1 },
        { term: "HIGH", count: 999 },
        { term: "MED", count: 50 },
      ]);

      render(<AlertTermsChart alertTermData={data} />);

      expect(capturedBarData?.labels[0]).toBe("HIGH");
      expect(capturedBarData?.datasets[0].data[0]).toBe(999);
    });

    it("places the lowest-count term last regardless of its original key position", () => {
      const data = makeAlertTermData([
        { term: "MED", count: 50 },
        { term: "LOW", count: 1 },
        { term: "HIGH", count: 999 },
      ]);

      render(<AlertTermsChart alertTermData={data} />);

      const labels = capturedBarData?.labels ?? [];
      const counts = capturedBarData?.datasets[0].data ?? [];

      expect(labels[labels.length - 1]).toBe("LOW");
      expect(counts[counts.length - 1]).toBe(1);
    });
  });

  describe("single term", () => {
    it("renders a single bar with the correct label and count", () => {
      const single = makeAlertTermData([{ term: "AAL", count: 42 }]);

      render(<AlertTermsChart alertTermData={single} />);

      expect(capturedBarData?.labels).toEqual(["AAL"]);
      expect(capturedBarData?.datasets[0].data).toEqual([42]);
    });
  });

  describe("tied counts", () => {
    it("renders all tied terms without dropping any", () => {
      const tied = makeAlertTermData([
        { term: "AAL", count: 100 },
        { term: "DAL", count: 100 },
        { term: "UAL", count: 100 },
      ]);

      render(<AlertTermsChart alertTermData={tied} />);

      expect(capturedBarData?.labels).toHaveLength(3);
      // All counts still equal 100
      for (const c of capturedBarData?.datasets[0].data ?? []) {
        expect(c).toBe(100);
      }
    });
  });

  describe("totalCount calculation", () => {
    it("totalCount is the sum of all term counts regardless of sort order", () => {
      // We verify this indirectly: the chart renders (doesn't crash), and
      // all counts are present in the dataset.
      const data = makeAlertTermData([
        { term: "A", count: 10 },
        { term: "B", count: 20 },
        { term: "C", count: 30 },
      ]);

      render(<AlertTermsChart alertTermData={data} />);

      const sum = (capturedBarData?.datasets[0].data ?? []).reduce(
        (a, b) => a + b,
        0,
      );
      expect(sum).toBe(60);
    });
  });
});
