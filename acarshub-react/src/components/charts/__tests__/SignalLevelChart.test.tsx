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
import type { SignalLevelData } from "../../../types";

// ---------------------------------------------------------------------------
// Capture the data prop passed to <Line> so we can assert on:
//   - whole-number filtering (legacy acarsdec spike workaround)
//   - x-axis sort order (ascending level)
//   - per-decoder dataset construction
//   - missing-level → 0 fill for a decoder
// without rendering canvas.
// ---------------------------------------------------------------------------
type CapturedLine = {
  data: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      borderColor: string;
    }[];
  };
};

let capturedLine: CapturedLine | null = null;

vi.mock("react-chartjs-2", () => ({
  Line: (props: CapturedLine) => {
    capturedLine = props;
    return <div data-testid="line-chart" />;
  },
}));

// Minimal settings store mock — theme value only
vi.mock("../../../store/useSettingsStore", () => ({
  useSettingsStore: (
    selector: (s: { settings: { appearance: { theme: string } } }) => unknown,
  ) => selector({ settings: { appearance: { theme: "mocha" } } }),
}));

import { SignalLevelChart } from "../SignalLevelChart";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SignalLevelChart", () => {
  beforeEach(() => {
    capturedLine = null;
  });

  describe("empty / no-data state", () => {
    it("renders the no-data message when signalData is null", () => {
      render(<SignalLevelChart signalData={null} />);
      expect(
        screen.getByText(/no signal level data available/i),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("line-chart")).not.toBeInTheDocument();
    });

    it("renders the no-data message when signalData is an empty object", () => {
      render(<SignalLevelChart signalData={{}} />);
      expect(
        screen.getByText(/no signal level data available/i),
      ).toBeInTheDocument();
    });

    it("renders the no-data message when every level is a whole number (legacy artifact filter)", () => {
      // All whole numbers — must be filtered out, leaving no data.
      const signalData: SignalLevelData = {
        ACARS: [
          { level: -10, count: 5 },
          { level: -20, count: 8 },
          { level: -30, count: 12 },
        ],
      };
      render(<SignalLevelChart signalData={signalData} />);
      expect(
        screen.getByText(/no signal level data available/i),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("line-chart")).not.toBeInTheDocument();
    });
  });

  describe("regression: legacy whole-number levels are filtered out", () => {
    it("excludes whole-number levels while keeping float levels in the same decoder", () => {
      const signalData: SignalLevelData = {
        ACARS: [
          { level: -10.5, count: 5 }, // kept (float)
          { level: -20, count: 100 }, // dropped (whole number)
          { level: -15.25, count: 7 }, // kept (float)
          { level: -30, count: 50 }, // dropped (whole number)
        ],
      };

      render(<SignalLevelChart signalData={signalData} />);

      // Whole-number levels (-20, -30) are dropped by the legacy filter
      // (`level % 1 !== 0`). The kept floats -15.25 and -10.5 are sorted
      // ascending and rendered via toFixed(1) → "-15.3" and "-10.5".
      const labels = capturedLine?.data.labels ?? [];
      expect(labels).toEqual(["-15.3", "-10.5"]);

      // And the kept dataset values must match the kept levels in order.
      const acars = capturedLine?.data.datasets.find(
        (d) => d.label === "ACARS",
      );
      expect(acars?.data).toEqual([7, 5]);
    });
  });

  describe("regression: x-axis labels sorted ascending by signal level", () => {
    it("orders unique levels low → high regardless of insertion order", () => {
      const signalData: SignalLevelData = {
        ACARS: [
          { level: -10.5, count: 5 },
          { level: -30.25, count: 2 },
          { level: -20.75, count: 9 },
        ],
      };

      render(<SignalLevelChart signalData={signalData} />);

      const labels = capturedLine?.data.labels ?? [];
      expect(labels).toEqual(["-30.3", "-20.8", "-10.5"]);
    });
  });

  describe("per-decoder dataset construction", () => {
    it("creates one dataset per decoder with the decoder name as label", () => {
      const signalData: SignalLevelData = {
        ACARS: [{ level: -10.5, count: 5 }],
        "VDL-M2": [{ level: -15.25, count: 7 }],
        HFDL: [{ level: -20.75, count: 9 }],
      };

      render(<SignalLevelChart signalData={signalData} />);

      const labels = (capturedLine?.data.datasets ?? []).map((d) => d.label);
      expect(labels).toEqual(
        expect.arrayContaining(["ACARS", "VDL-M2", "HFDL"]),
      );
      expect(capturedLine?.data.datasets).toHaveLength(3);
    });

    it("fills 0 for levels missing from a given decoder so all datasets align with labels", () => {
      // ACARS has level -10.5 only; VDL-M2 has level -15.5 only.
      // Combined x-axis: [-15.5, -10.5]. ACARS dataset must be [0, 5];
      // VDL-M2 dataset must be [7, 0].
      const signalData: SignalLevelData = {
        ACARS: [{ level: -10.5, count: 5 }],
        "VDL-M2": [{ level: -15.5, count: 7 }],
      };

      render(<SignalLevelChart signalData={signalData} />);

      const labels = capturedLine?.data.labels ?? [];
      expect(labels).toEqual(["-15.5", "-10.5"]);

      const acars = capturedLine?.data.datasets.find(
        (d) => d.label === "ACARS",
      );
      const vdl = capturedLine?.data.datasets.find((d) => d.label === "VDL-M2");

      expect(acars?.data).toEqual([0, 5]);
      expect(vdl?.data).toEqual([7, 0]);
    });

    it("skips a decoder that has only whole-number / null entries (empty after filter)", () => {
      const signalData: SignalLevelData = {
        ACARS: [{ level: -10.5, count: 5 }], // valid
        IRDM: [
          { level: -20, count: 100 }, // whole number — dropped
          { level: null, count: null }, // null — dropped
        ],
      };

      render(<SignalLevelChart signalData={signalData} />);

      // IRDM dataset is still emitted (the SUT pushes per decoder if decoderData
      // is non-empty), but all its data points should be 0 since no levels match.
      const irdm = capturedLine?.data.datasets.find((d) => d.label === "IRDM");
      // Either IRDM dataset is absent, or — if present — all values are 0.
      if (irdm) {
        for (const v of irdm.data) {
          expect(v).toBe(0);
        }
      }

      const acars = capturedLine?.data.datasets.find(
        (d) => d.label === "ACARS",
      );
      expect(acars?.data).toEqual([5]);
    });
  });

  describe("unknown decoder fallback", () => {
    it("renders an unknown decoder using the fallback color palette without crashing", () => {
      const signalData: SignalLevelData = {
        UNKNOWN_DECODER: [{ level: -12.5, count: 3 }],
      };

      render(<SignalLevelChart signalData={signalData} />);

      const ds = capturedLine?.data.datasets.find(
        (d) => d.label === "UNKNOWN_DECODER",
      );
      expect(ds).toBeDefined();
      expect(ds?.data).toEqual([3]);
      // Fallback color exists (non-empty string)
      expect(ds?.borderColor.length).toBeGreaterThan(0);
    });
  });
});
