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

import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ListenerType,
  MessageType,
} from "../../services/listener-types.js";
import {
  isXngEnvelope,
  routeListenerMessage,
  type XngEnvelope,
  xngCarrierType,
} from "../xng.js";

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
}));

vi.mock("../../utils/logger.js", () => ({
  createLogger: () => loggerMocks,
}));

// Shape derived from xng's serde types; to be replaced by a real capture.
const FIXTURE_JSON =
  '{"mode":"acars_poa","timestamp":"2026-10-28T18:20:00.123Z","frequency_hz":131550000,"signal":{"rssi_db":-18.4,"noise_db":-55.0},"decode":{"crc_ok":true,"errors":0},"body":{"type":"acars","mode":"2","tail":"N471XG","label":"H1","block_id":"3","flight":"XG0042","msg_num":"M42A","text":"HELLO","more_to_come":false},"source":{"station":{"id":"8d5b8f0e-3d3a-4b8e-9a51-0c1f0b9e2a11","ident":"CS-KABQ-ACARS"},"app":{"name":"xng","version":"0.21.0"},"channel":{"index":2,"frequency_hz":131550000,"sample_rate":24000.0}}}';

function fixture(): Record<string, unknown> {
  return JSON.parse(FIXTURE_JSON) as Record<string, unknown>;
}

function fixtureWith(overrides: Record<string, unknown>): unknown {
  return { ...fixture(), ...overrides };
}

interface PushCall {
  type: MessageType;
  data: unknown;
}

function collectPushes(type: ListenerType, data: unknown): PushCall[] {
  const calls: PushCall[] = [];
  routeListenerMessage(type, data, (t, d) => {
    calls.push({ type: t, data: d });
  });
  return calls;
}

describe("isXngEnvelope", () => {
  it("accepts the canonical captured envelope", () => {
    expect(isXngEnvelope(fixture())).toBe(true);
  });

  it("accepts an envelope with optional raw/sdr fields", () => {
    const data = fixture();
    const source = data.source as Record<string, unknown>;
    expect(
      isXngEnvelope({
        ...data,
        raw: "deadbeef",
        source: { ...source, sdr: { driver: "rtlsdr" } },
      }),
    ).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "hello"],
    ["a number", 42],
    ["an array", []],
  ])("rejects %s", (_label, value) => {
    expect(isXngEnvelope(value)).toBe(false);
  });

  it("rejects a native acarsdec message", () => {
    expect(
      isXngEnvelope({
        timestamp: 1700000000.123,
        freq: 131.55,
        text: "HELLO",
        app: { name: "acarsdec", ver: "4.0" },
      }),
    ).toBe(false);
  });

  it("rejects a non-numeric frequency_hz", () => {
    expect(isXngEnvelope(fixtureWith({ frequency_hz: "131550000" }))).toBe(
      false,
    );
  });

  it("rejects a missing mode", () => {
    const data = fixture();
    delete data.mode;
    expect(isXngEnvelope(data)).toBe(false);
  });

  it("rejects a numeric timestamp", () => {
    expect(isXngEnvelope(fixtureWith({ timestamp: 1700000000 }))).toBe(false);
  });

  it("rejects a missing body", () => {
    const data = fixture();
    delete data.body;
    expect(isXngEnvelope(data)).toBe(false);
  });

  it("rejects a body without a string type", () => {
    expect(isXngEnvelope(fixtureWith({ body: { type: 7 } }))).toBe(false);
    expect(isXngEnvelope(fixtureWith({ body: null }))).toBe(false);
  });

  it("rejects a missing source", () => {
    const data = fixture();
    delete data.source;
    expect(isXngEnvelope(data)).toBe(false);
  });

  it("rejects a source without app", () => {
    expect(
      isXngEnvelope(
        fixtureWith({ source: { station: { id: "x", ident: "y" } } }),
      ),
    ).toBe(false);
  });

  it("rejects an app name other than xng", () => {
    expect(
      isXngEnvelope(
        fixtureWith({
          source: {
            station: { id: "x", ident: "y" },
            app: { name: "dumpvdl2", version: "2.4.0" },
          },
        }),
      ),
    ).toBe(false);
  });
});

describe("xngCarrierType", () => {
  it.each<[string, MessageType]>([
    ["acars_poa", "ACARS"],
    ["vdl2", "VDLM2"],
    ["hfdl", "HFDL"],
    ["aero_l", "IMSL"],
    ["aero_c", "IMSL"],
    ["iridium", "IRDM"],
  ])("maps %s to %s", (mode, expected) => {
    expect(xngCarrierType(mode)).toBe(expected);
  });

  it.each(["ais", "adsb", "", "ACARS_POA", "vdlm2"])(
    "returns null for unhandled mode %j",
    (mode) => {
      expect(xngCarrierType(mode)).toBeNull();
    },
  );
});

describe("routeListenerMessage", () => {
  beforeEach(() => {
    loggerMocks.debug.mockClear();
    loggerMocks.trace.mockClear();
  });

  it.each<MessageType>(["ACARS", "VDLM2", "HFDL", "IMSL", "IRDM"])(
    "passes %s listener messages through unchanged",
    (type) => {
      const data = { text: "native" };
      const calls = collectPushes(type, data);
      expect(calls).toEqual([{ type, data }]);
      expect(calls[0].data).toBe(data);
    },
  );

  it("does not validate non-XNG payloads", () => {
    const calls = collectPushes("ACARS", "not-an-object");
    expect(calls).toEqual([{ type: "ACARS", data: "not-an-object" }]);
  });

  it("re-labels the canonical acars_poa envelope as ACARS", () => {
    const data = fixture();
    const calls = collectPushes("XNG", data);
    expect(calls).toHaveLength(1);
    expect(calls[0].type).toBe("ACARS");
    expect(calls[0].data).toBe(data);
    expect((calls[0].data as XngEnvelope).body.tail).toBe("N471XG");
  });

  it.each<[string, MessageType]>([
    ["acars_poa", "ACARS"],
    ["vdl2", "VDLM2"],
    ["hfdl", "HFDL"],
    ["aero_l", "IMSL"],
    ["aero_c", "IMSL"],
    ["iridium", "IRDM"],
  ])("re-labels an XNG %s envelope as %s", (mode, expected) => {
    const data = fixtureWith({ mode });
    expect(collectPushes("XNG", data)).toEqual([{ type: expected, data }]);
  });

  it("drops an XNG payload that is not a valid envelope", () => {
    const calls = collectPushes("XNG", { timestamp: 1, text: "acarsdec" });
    expect(calls).toEqual([]);
    expect(loggerMocks.debug).toHaveBeenCalledTimes(1);
  });

  it("drops a non-object XNG payload", () => {
    expect(collectPushes("XNG", null)).toEqual([]);
  });

  it.each(["ais", "adsb"])("drops an XNG envelope with mode %s", (mode) => {
    const calls = collectPushes("XNG", fixtureWith({ mode }));
    expect(calls).toEqual([]);
    expect(loggerMocks.trace).toHaveBeenCalledWith("xng mode not handled", {
      mode,
    });
  });
});
