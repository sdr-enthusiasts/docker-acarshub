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
 * Unit tests for the shared message-type mapping in @acarshub/types.
 *
 * Lives in the backend because acarshub-types has no test runner.
 */

import {
  type DecoderKey,
  decoderKeyFromMessageType,
  STORED_MESSAGE_TYPES,
  type StoredMessageType,
  toStoredMessageType,
} from "@acarshub/types";
import { describe, expect, it } from "vitest";
import type { MessageType } from "../services/listener-types.js";

const SPELLINGS: ReadonlyArray<{ spelling: string; key: DecoderKey }> = [
  { spelling: "ACARS", key: "acars" },
  { spelling: "VDL-M2", key: "vdlm2" },
  { spelling: "VDLM2", key: "vdlm2" },
  { spelling: "VDLM", key: "vdlm2" },
  { spelling: "HFDL", key: "hfdl" },
  { spelling: "IMS-L", key: "imsl" },
  { spelling: "IMSL", key: "imsl" },
  { spelling: "IRDM", key: "irdm" },
];

const UNKNOWN = [
  "",
  "   ",
  "UNKNOWN",
  "VDL",
  "VDL-M",
  "IMS",
  "VDL M2",
  "ACARS2",
  "__proto__",
  "constructor",
  "toString",
];

describe("STORED_MESSAGE_TYPES", () => {
  it("keeps the legacy Python spellings that existing databases contain", () => {
    expect(STORED_MESSAGE_TYPES).toEqual({
      acars: "ACARS",
      vdlm2: "VDL-M2",
      hfdl: "HFDL",
      imsl: "IMS-L",
      irdm: "IRDM",
    });
  });

  it("is frozen", () => {
    expect(Object.isFrozen(STORED_MESSAGE_TYPES)).toBe(true);
  });
});

describe("decoderKeyFromMessageType", () => {
  it.each(SPELLINGS)("maps $spelling -> $key", ({ spelling, key }) => {
    expect(decoderKeyFromMessageType(spelling)).toBe(key);
  });

  it.each(SPELLINGS)(
    "is case-insensitive for $spelling",
    ({ spelling, key }) => {
      expect(decoderKeyFromMessageType(spelling.toLowerCase())).toBe(key);
      const mixed = spelling
        .split("")
        .map((c, i) => (i % 2 === 0 ? c.toLowerCase() : c))
        .join("");
      expect(decoderKeyFromMessageType(mixed)).toBe(key);
    },
  );

  it.each(SPELLINGS)(
    "trims whitespace around $spelling",
    ({ spelling, key }) => {
      expect(decoderKeyFromMessageType(`  ${spelling}\t\n`)).toBe(key);
    },
  );

  it.each(UNKNOWN)("returns null for unknown input %j", (value) => {
    expect(decoderKeyFromMessageType(value)).toBeNull();
  });
});

describe("toStoredMessageType", () => {
  const expectedStored: Record<DecoderKey, StoredMessageType> = {
    acars: "ACARS",
    vdlm2: "VDL-M2",
    hfdl: "HFDL",
    imsl: "IMS-L",
    irdm: "IRDM",
  };

  it.each(SPELLINGS)(
    "maps $spelling to its stored form",
    ({ spelling, key }) => {
      expect(toStoredMessageType(spelling)).toBe(expectedStored[key]);
      expect(toStoredMessageType(spelling.toLowerCase())).toBe(
        expectedStored[key],
      );
      expect(toStoredMessageType(` ${spelling} `)).toBe(expectedStored[key]);
    },
  );

  it("is idempotent on stored values", () => {
    for (const stored of Object.values(STORED_MESSAGE_TYPES)) {
      expect(toStoredMessageType(stored)).toBe(stored);
    }
  });

  it.each(UNKNOWN)("returns null for unknown input %j", (value) => {
    expect(toStoredMessageType(value)).toBeNull();
  });

  it("maps every wire MessageType (listener-types) to a stored type", () => {
    const wire: Record<MessageType, StoredMessageType> = {
      ACARS: toStoredMessageType("ACARS"),
      VDLM2: toStoredMessageType("VDLM2"),
      HFDL: toStoredMessageType("HFDL"),
      IMSL: toStoredMessageType("IMSL"),
      IRDM: toStoredMessageType("IRDM"),
    };
    expect(wire).toEqual({
      ACARS: "ACARS",
      VDLM2: "VDL-M2",
      HFDL: "HFDL",
      IMSL: "IMS-L",
      IRDM: "IRDM",
    });
  });
});
