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

import { beforeEach, describe, expect, it, vi } from "vitest";

let mockEnabled = {
  enableAcars: false,
  enableVdlm: false,
  enableHfdl: false,
  enableImsl: false,
  enableIrdm: false,
};

vi.mock("../../config.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../config.js")>();
  return {
    ...original,
    getConfig: () => ({
      ...original.getConfig(),
      ...mockEnabled,
    }),
  };
});

import {
  buildDecoderFeatures,
  getXngMessageCount,
  isDecoderEnabled,
  isFedByXng,
  markDecoderActive,
  recordXngMessage,
  resetDecoderActivity,
} from "../decoder-activity.js";

describe("decoder-activity", () => {
  beforeEach(() => {
    mockEnabled = {
      enableAcars: false,
      enableVdlm: false,
      enableHfdl: false,
      enableImsl: false,
      enableIrdm: false,
    };
    resetDecoderActivity();
  });

  it("reports enabled when the config flag is on", () => {
    mockEnabled.enableHfdl = true;

    expect(isDecoderEnabled("HFDL")).toBe(true);
  });

  it("maps each type to its own config flag", () => {
    mockEnabled.enableAcars = true;
    mockEnabled.enableImsl = true;

    expect(isDecoderEnabled("ACARS")).toBe(true);
    expect(isDecoderEnabled("VDLM2")).toBe(false);
    expect(isDecoderEnabled("HFDL")).toBe(false);
    expect(isDecoderEnabled("IMSL")).toBe(true);
    expect(isDecoderEnabled("IRDM")).toBe(false);
  });

  it("reports disabled when the config flag is off until marked active", () => {
    expect(isDecoderEnabled("VDLM2")).toBe(false);

    markDecoderActive("VDLM2");

    expect(isDecoderEnabled("VDLM2")).toBe(true);
    expect(isDecoderEnabled("ACARS")).toBe(false);
  });

  it("markDecoderActive returns true once, then false", () => {
    expect(markDecoderActive("IRDM")).toBe(true);
    expect(markDecoderActive("IRDM")).toBe(false);
    expect(markDecoderActive("IRDM")).toBe(false);
  });

  it("markDecoderActive returns false when the config flag is already on", () => {
    mockEnabled.enableVdlm = true;

    expect(markDecoderActive("VDLM2")).toBe(false);
    expect(markDecoderActive("VDLM2")).toBe(false);
    expect(isDecoderEnabled("VDLM2")).toBe(true);
  });

  it("resetDecoderActivity clears runtime activation", () => {
    markDecoderActive("HFDL");
    expect(isDecoderEnabled("HFDL")).toBe(true);

    resetDecoderActivity();

    expect(isDecoderEnabled("HFDL")).toBe(false);
    expect(markDecoderActive("HFDL")).toBe(true);
  });

  describe("isFedByXng", () => {
    it("is false until markDecoderActive is called for the type", () => {
      expect(isFedByXng("VDLM2")).toBe(false);

      markDecoderActive("VDLM2");

      expect(isFedByXng("VDLM2")).toBe(true);
      expect(isFedByXng("ACARS")).toBe(false);
    });

    it("marks a config-enabled type as xng-fed without changing the return value", () => {
      mockEnabled.enableAcars = true;

      expect(markDecoderActive("ACARS")).toBe(false);
      expect(isFedByXng("ACARS")).toBe(true);
    });

    it("is cleared by resetDecoderActivity", () => {
      markDecoderActive("HFDL");

      resetDecoderActivity();

      expect(isFedByXng("HFDL")).toBe(false);
    });
  });

  describe("xng message counter", () => {
    it("starts at zero and counts each recorded message", () => {
      expect(getXngMessageCount()).toBe(0);

      recordXngMessage();
      recordXngMessage();
      recordXngMessage();

      expect(getXngMessageCount()).toBe(3);
    });

    it("is reset by resetDecoderActivity", () => {
      recordXngMessage();

      resetDecoderActivity();

      expect(getXngMessageCount()).toBe(0);
    });
  });

  describe("buildDecoderFeatures", () => {
    it("reflects config flags", () => {
      mockEnabled.enableAcars = true;

      const features = buildDecoderFeatures();

      expect(features.acars).toBe(true);
      expect(features.vdlm).toBe(false);
      expect(features.hfdl).toBe(false);
      expect(features.imsl).toBe(false);
      expect(features.irdm).toBe(false);
    });

    it("includes runtime-activated types", () => {
      markDecoderActive("VDLM2");
      markDecoderActive("IMSL");

      const features = buildDecoderFeatures();

      expect(features.acars).toBe(false);
      expect(features.vdlm).toBe(true);
      expect(features.imsl).toBe(true);
    });
  });
});
