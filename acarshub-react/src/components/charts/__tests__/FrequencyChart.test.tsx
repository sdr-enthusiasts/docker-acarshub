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
import type { SignalData } from "../../../types";

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

import { FrequencyChart } from "../FrequencyChart";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFreqData(
  entries: { freq: string; count: number }[],
): SignalData[] {
  return entries.map(({ freq, count }) => ({
    freq_type: "ACARS",
    freq,
    count,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FrequencyChart", () => {
  beforeEach(() => {
    capturedBarData = null;
  });

  describe("empty / no-data state", () => {
    it("renders the no-data message when frequencyData is empty", () => {
      render(<FrequencyChart frequencyData={[]} decoderType="ACARS" />);
      expect(screen.getByText(/no frequency data available/i)).toBeTruthy();
    });
  });

  describe("regression: frequency distribution is sorted most to least", () => {
    it("renders bars in descending count order when data arrives unsorted", () => {
      const unsorted = makeFreqData([
        { freq: "131.550", count: 10 },
        { freq: "130.025", count: 500 },
        { freq: "129.125", count: 75 },
        { freq: "136.900", count: 1200 },
        { freq: "131.725", count: 42 },
      ]);

      render(<FrequencyChart frequencyData={unsorted} decoderType="ACARS" />);

      const labels = capturedBarData?.labels ?? [];
      const counts = capturedBarData?.datasets[0].data ?? [];

      // Labels should be ordered highest → lowest count
      expect(labels).toEqual([
        "136.900", // 1200
        "130.025", // 500
        "129.125", // 75
        "131.725", // 42
        "131.550", // 10
      ]);

      // Counts must be strictly non-increasing
      for (let i = 0; i < counts.length - 1; i++) {
        expect(counts[i]).toBeGreaterThanOrEqual(counts[i + 1]);
      }
    });

    it("renders bars in descending count order when data arrives already sorted ascending", () => {
      const ascending = makeFreqData([
        { freq: "129.125", count: 5 },
        { freq: "130.025", count: 20 },
        { freq: "131.550", count: 60 },
        { freq: "136.900", count: 300 },
      ]);

      render(<FrequencyChart frequencyData={ascending} decoderType="VDLM" />);

      const counts = capturedBarData?.datasets[0].data ?? [];

      // First bar must be the highest count
      expect(counts[0]).toBe(300);
      // Last bar must be the lowest count
      expect(counts[counts.length - 1]).toBe(5);
    });

    it("places the highest-count frequency first regardless of original position", () => {
      const data = makeFreqData([
        { freq: "A", count: 1 },
        { freq: "B", count: 999 },
        { freq: "C", count: 50 },
      ]);

      render(<FrequencyChart frequencyData={data} decoderType="HFDL" />);

      expect(capturedBarData?.labels[0]).toBe("B");
      expect(capturedBarData?.datasets[0].data[0]).toBe(999);
    });
  });

  describe("regression: >15 frequencies — top 14 are the highest-count ones", () => {
    it("aggregates overflow into Other using the lowest-count frequencies, not first-in-order", () => {
      // Build 20 frequencies with varying counts; the highest 14 should be kept
      const entries: { freq: string; count: number }[] = [];
      for (let i = 1; i <= 20; i++) {
        entries.push({
          freq: `FREQ-${i.toString().padStart(2, "0")}`,
          count: i * 10,
        });
      }
      // Shuffle so the natural array order is NOT highest-first
      const shuffled = [...entries].sort(() => 0.5 - Math.random());

      render(
        <FrequencyChart
          frequencyData={makeFreqData(shuffled)}
          decoderType="IMSL"
        />,
      );

      const labels = capturedBarData?.labels ?? [];
      const counts = capturedBarData?.datasets[0].data ?? [];

      // Should be 15 entries: 14 top frequencies + "Other"
      expect(labels).toHaveLength(15);
      expect(labels[labels.length - 1]).toBe("Other");

      // The 14 kept bars must be non-increasing
      const keptCounts = counts.slice(0, 14);
      for (let i = 0; i < keptCounts.length - 1; i++) {
        expect(keptCounts[i]).toBeGreaterThanOrEqual(keptCounts[i + 1]);
      }

      // The top bar must be the global maximum (count = 200)
      expect(counts[0]).toBe(200);

      // "Other" must equal the sum of the 6 lowest-count entries (10+20+30+40+50+60 = 210)
      expect(counts[counts.length - 1]).toBe(210);
    });
  });

  describe("single frequency", () => {
    it("renders a single bar with the correct label and count", () => {
      const single = makeFreqData([{ freq: "131.550", count: 42 }]);

      render(<FrequencyChart frequencyData={single} decoderType="ACARS" />);

      expect(capturedBarData?.labels).toEqual(["131.550"]);
      expect(capturedBarData?.datasets[0].data).toEqual([42]);
    });
  });

  describe("tied counts", () => {
    it("renders all tied frequencies without dropping any", () => {
      const tied = makeFreqData([
        { freq: "A", count: 100 },
        { freq: "B", count: 100 },
        { freq: "C", count: 100 },
      ]);

      render(<FrequencyChart frequencyData={tied} decoderType="IRDM" />);

      expect(capturedBarData?.labels).toHaveLength(3);
      // All counts still equal 100
      for (const c of capturedBarData?.datasets[0].data ?? []) {
        expect(c).toBe(100);
      }
    });
  });
});
