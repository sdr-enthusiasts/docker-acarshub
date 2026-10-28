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
 * addMessage() -> per-decoder signal-level tables.
 *
 * Runs against a fully migrated tmp-file database (not the simplified
 * fixture in messages.test.ts, which has no level_* tables) so the real
 * level_* schema is exercised.
 *
 * Regression: addMessage() used to look the level table up in a
 * hand-written map that had "IMSL" but not "IMS-L". Live IMSL traffic is
 * stored as "IMS-L", so level_imsl was never updated.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getDatabase, initDatabase } from "../../../client.js";
import { runMigrations } from "../../../migrate.js";
import {
  levelAcars,
  levelHfdl,
  levelImsl,
  levelIrdm,
  levelVdlm2,
  type NewMessage,
} from "../../../schema.js";
import { initializeAlertCache } from "../../alerts.js";
import {
  initializeMessageCounters,
  resetCountersForTesting,
} from "../../statistics.js";
import { addMessage } from "../index.js";

type LevelTable =
  | typeof levelAcars
  | typeof levelVdlm2
  | typeof levelHfdl
  | typeof levelImsl
  | typeof levelIrdm;

const ALL_LEVEL_TABLES: ReadonlyArray<LevelTable> = [
  levelAcars,
  levelVdlm2,
  levelHfdl,
  levelImsl,
  levelIrdm,
];

function makeMessage(
  messageType: string,
  level: string,
): Omit<NewMessage, "id"> {
  return {
    messageType,
    time: 1_700_000_000,
    stationId: "TEST",
    toaddr: "",
    fromaddr: "",
    depa: "",
    dsta: "",
    eta: "",
    gtout: "",
    gtin: "",
    wloff: "",
    wlin: "",
    lat: "",
    lon: "",
    alt: "",
    text: "LEVEL TEST",
    tail: "N12345",
    flight: "",
    icao: "",
    freq: "",
    ack: "",
    mode: "",
    label: "H1",
    blockId: "",
    msgno: "",
    isResponse: "",
    isOnground: "",
    error: "0",
    libacars: "",
    level,
  };
}

function levelRows(
  table: LevelTable,
): Array<{ level: number | null; count: number | null }> {
  return getDatabase()
    .select({ level: table.level, count: table.count })
    .from(table)
    .all();
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "acarshub-insert-levels-"));
  const dbPath = join(tmpDir, "test.db");
  runMigrations(dbPath);
  initDatabase(dbPath);
  initializeAlertCache();
  resetCountersForTesting();
  initializeMessageCounters();
});

afterEach(() => {
  closeDatabase();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("addMessage() signal-level tracking", () => {
  const cases: ReadonlyArray<{ messageType: string; table: LevelTable }> = [
    { messageType: "ACARS", table: levelAcars },
    { messageType: "VDL-M2", table: levelVdlm2 },
    { messageType: "HFDL", table: levelHfdl },
    { messageType: "IMS-L", table: levelImsl },
    { messageType: "IRDM", table: levelIrdm },
  ];

  it.each(cases)(
    "stored type $messageType increments only its own level table",
    ({ messageType, table }) => {
      addMessage(makeMessage(messageType, "-21.5"));
      addMessage(makeMessage(messageType, "-21.5"));

      expect(levelRows(table)).toEqual([{ level: -21.5, count: 2 }]);
      for (const other of ALL_LEVEL_TABLES) {
        if (other !== table) {
          expect(levelRows(other)).toEqual([]);
        }
      }
    },
  );

  it("regression: IMS-L (the stored IMSL spelling) updates level_imsl", () => {
    addMessage(makeMessage("IMS-L", "-30"));
    expect(levelRows(levelImsl)).toEqual([{ level: -30, count: 1 }]);
  });

  it("accepts wire spellings and case variants", () => {
    addMessage(makeMessage("IMSL", "-10"));
    addMessage(makeMessage("vdlm2", "-11"));
    addMessage(makeMessage("acars", "-12"));

    expect(levelRows(levelImsl)).toEqual([{ level: -10, count: 1 }]);
    expect(levelRows(levelVdlm2)).toEqual([{ level: -11, count: 1 }]);
    expect(levelRows(levelAcars)).toEqual([{ level: -12, count: 1 }]);
  });

  it("does not touch any level table for an unknown message type", () => {
    addMessage(makeMessage("BOGUS", "-20"));
    for (const table of ALL_LEVEL_TABLES) {
      expect(levelRows(table)).toEqual([]);
    }
  });

  it("does not touch any level table when level is empty", () => {
    addMessage(makeMessage("IMS-L", ""));
    expect(levelRows(levelImsl)).toEqual([]);
  });
});
