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

/**
 * Direct unit tests for the pure SystemStatus / message-rate payload
 * builders extracted from services/index.ts in GOD-04.
 *
 * These functions have no side effects (they do not call socketio.emit
 * themselves — that's BackgroundServices' job), so they can be tested
 * without spinning up decoder listeners, a scheduler, or a real database.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionStatus } from "../listener-manager.js";
import type { MessageStatistics } from "../message-queue.js";

const mockDecoderCounts = {
  acars: 0,
  vdlm2: 0,
  hfdl: 0,
  imsl: 0,
  irdm: 0,
};

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

vi.mock("../../db/index.js", () => ({
  getPerDecoderMessageCounts: () => mockDecoderCounts,
}));

const defaultStats: MessageStatistics = {
  acars: { lastMinute: 0, total: 0 },
  vdlm2: { lastMinute: 0, total: 0 },
  hfdl: { lastMinute: 0, total: 0 },
  imsl: { lastMinute: 0, total: 0 },
  irdm: { lastMinute: 0, total: 0 },
  error: { lastMinute: 0, total: 0 },
};

let mockStats: MessageStatistics = defaultStats;
let mockRollingRates: Record<string, number> = {
  acars: 0,
  vdlm2: 0,
  hfdl: 0,
  imsl: 0,
  irdm: 0,
};

vi.mock("../message-queue.js", () => ({
  getMessageQueue: () => ({
    getStats: () => mockStats,
    getRollingRates: () => mockRollingRates,
  }),
}));

const emptyConnectionStatus: ConnectionStatus = {
  ACARS: false,
  VDLM2: false,
  HFDL: false,
  IMSL: false,
  IRDM: false,
};

describe("system-status", () => {
  beforeEach(() => {
    mockEnabled = {
      enableAcars: false,
      enableVdlm: false,
      enableHfdl: false,
      enableImsl: false,
      enableIrdm: false,
    };
    mockDecoderCounts.acars = 0;
    mockDecoderCounts.vdlm2 = 0;
    mockDecoderCounts.hfdl = 0;
    mockDecoderCounts.imsl = 0;
    mockDecoderCounts.irdm = 0;
    mockStats = defaultStats;
    mockRollingRates = { acars: 0, vdlm2: 0, hfdl: 0, imsl: 0, irdm: 0 };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("buildSystemStatus", () => {
    it("omits disabled decoders entirely from decoders/servers/global", async () => {
      const { buildSystemStatus } = await import("../system-status.js");

      const status = buildSystemStatus(emptyConnectionStatus);

      expect(status.status.decoders).toEqual({});
      expect(status.status.servers).toEqual({});
      expect(status.status.global).toEqual({});
    });

    it("reports Connected:true/Alive:true and Status:'Ok' when a decoder is enabled and connected", async () => {
      mockEnabled.enableAcars = true;
      mockDecoderCounts.acars = 42;
      mockStats = {
        ...defaultStats,
        acars: { lastMinute: 7, total: 42 },
      };

      const { buildSystemStatus } = await import("../system-status.js");
      const status = buildSystemStatus({
        ...emptyConnectionStatus,
        ACARS: true,
      });

      expect(status.status.decoders.ACARS).toEqual({
        Status: "Ok",
        Connected: true,
        Alive: true,
      });
      expect(status.status.servers.acars_server).toEqual({
        Status: "Ok",
        Messages: 42,
      });
      expect(status.status.global.ACARS).toEqual({
        Status: "Ok",
        Count: 42,
        LastMinute: 7,
      });
    });

    it("reports Status:'Not Connected' and Connected:false when a decoder is enabled but not connected", async () => {
      mockEnabled.enableVdlm = true;

      const { buildSystemStatus } = await import("../system-status.js");
      const status = buildSystemStatus(emptyConnectionStatus);

      expect(status.status.decoders.VDLM2).toEqual({
        Status: "Not Connected",
        Connected: false,
        Alive: false,
      });
    });

    it("independently reports every enabled decoder (HFDL, IMSL, IRDM)", async () => {
      mockEnabled = {
        enableAcars: false,
        enableVdlm: false,
        enableHfdl: true,
        enableImsl: true,
        enableIrdm: true,
      };

      const { buildSystemStatus } = await import("../system-status.js");
      const status = buildSystemStatus({
        ...emptyConnectionStatus,
        HFDL: true,
        IMSL: false,
        IRDM: true,
      });

      expect(status.status.decoders.HFDL?.Connected).toBe(true);
      expect(status.status.decoders.IMSL?.Connected).toBe(false);
      expect(status.status.decoders.IRDM?.Connected).toBe(true);
      expect(status.status.decoders.ACARS).toBeUndefined();
      expect(status.status.decoders.VDLM2).toBeUndefined();
    });

    it("passes through queue error stats unconditionally", async () => {
      mockStats = {
        ...defaultStats,
        error: { lastMinute: 3, total: 99 },
      };

      const { buildSystemStatus } = await import("../system-status.js");
      const status = buildSystemStatus(emptyConnectionStatus);

      expect(status.status.errors).toEqual({ Total: 99, LastMinute: 3 });
    });

    it("always reports error_state:false and threads all-true (no direct DB/scheduler health signal)", async () => {
      const { buildSystemStatus } = await import("../system-status.js");
      const status = buildSystemStatus(emptyConnectionStatus);

      expect(status.status.error_state).toBe(false);
      expect(status.status.threads).toEqual({
        database: true,
        scheduler: true,
      });
    });
  });

  describe("buildMessageRate", () => {
    it("delegates directly to MessageQueue.getRollingRates()", async () => {
      mockRollingRates = {
        acars: 12,
        vdlm2: 0,
        hfdl: 3,
        imsl: 0,
        irdm: 0,
      };

      const { buildMessageRate } = await import("../system-status.js");

      expect(buildMessageRate()).toEqual(mockRollingRates);
    });
  });
});
