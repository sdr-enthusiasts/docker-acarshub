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

/**
 * TYPE-06 regression tests for `validateWorkerData`.
 *
 * The migrate worker is invoked in two modes:
 *
 *   1. `node migrate-worker.mjs <dbPath>` — child-process path; `workerData`
 *      is null/undefined, dbPath comes from argv[2].
 *   2. `new Worker(..., { workerData: { dbPath } })` — worker_threads path.
 *
 * `node:worker_threads` types `workerData` as `unknown` (rightly so).  The
 * pre-TYPE-06 code cast it with `workerData as MigrateWorkerData | null`,
 * which is a footgun: a caller passing the wrong shape (`{ path: ... }`,
 * a primitive, a different object key, …) would silently fall through to
 * the "no dbPath provided" branch with a misleading error.  Even worse,
 * a future caller passing `{ dbPath: 0 }` or `{ dbPath: null }` would
 * type-check at the cast site but blow up later inside runMigrations.
 *
 * `validateWorkerData` is the runtime guard that distinguishes:
 *   - absent (null/undefined)        → return undefined  (legitimate)
 *   - present and well-formed        → return narrowed   (legitimate)
 *   - present but mis-shaped/typed   → throw TypeError   (programmer error)
 */

import { describe, expect, it } from "vitest";

// We import `validateWorkerData` from its dedicated module (not from
// migrate-worker.ts) precisely to avoid triggering migrate-worker's
// top-level script body — which reads `workerData`, opens the DB, runs
// migrations, and exits the process.  TYPE-06 extracted the validator
// into migrate-worker-validate.ts for exactly this reason.
import { validateWorkerData } from "../migrate-worker-validate.js";

describe("validateWorkerData (TYPE-06)", () => {
  it("returns undefined when workerData is null", () => {
    expect(validateWorkerData(null)).toBeUndefined();
  });

  it("returns undefined when workerData is undefined", () => {
    expect(validateWorkerData(undefined)).toBeUndefined();
  });

  it("returns the narrowed object when workerData is well-formed", () => {
    const result = validateWorkerData({ dbPath: "/var/lib/acarshub/messages.db" });
    expect(result).toEqual({ dbPath: "/var/lib/acarshub/messages.db" });
  });

  it("ignores extra keys on a well-formed input", () => {
    // Defensive: the caller may add fields in the future; we only require
    // dbPath.  This is by design.
    const result = validateWorkerData({
      dbPath: "/tmp/x.db",
      extra: 123,
      another: "value",
    });
    expect(result?.dbPath).toBe("/tmp/x.db");
  });

  it("throws TypeError when workerData is a string", () => {
    expect(() => validateWorkerData("/tmp/x.db")).toThrowError(TypeError);
    expect(() => validateWorkerData("/tmp/x.db")).toThrowError(
      /must be a plain object or null\/undefined, got string/,
    );
  });

  it("throws TypeError when workerData is a number", () => {
    expect(() => validateWorkerData(42)).toThrowError(/got number/);
  });

  it("throws TypeError when workerData is an array", () => {
    expect(() => validateWorkerData(["/tmp/x.db"])).toThrowError(/got array/);
  });

  it("throws TypeError when workerData is missing 'dbPath'", () => {
    // Regression: the original footgun.  A caller migrating to a new key
    // name (say, `path` or `databasePath`) would have silently produced
    // a "no dbPath provided" warning before TYPE-06.  Now it throws loudly.
    expect(() => validateWorkerData({ path: "/tmp/x.db" })).toThrowError(
      /missing required key 'dbPath'/,
    );
  });

  it("throws TypeError when dbPath is not a string", () => {
    expect(() => validateWorkerData({ dbPath: 42 })).toThrowError(
      /dbPath must be a non-empty string, got number/,
    );
    expect(() => validateWorkerData({ dbPath: null })).toThrowError(
      /dbPath must be a non-empty string, got object/,
    );
    expect(() => validateWorkerData({ dbPath: undefined })).toThrowError(
      /dbPath must be a non-empty string, got undefined/,
    );
  });

  it("throws TypeError when dbPath is an empty string", () => {
    expect(() => validateWorkerData({ dbPath: "" })).toThrowError(
      /dbPath must be a non-empty string/,
    );
  });

  it("regression: catches the silent dbPath-rename footgun", () => {
    // Before TYPE-06: `workerData as MigrateWorkerData | null` typed
    // `{ databasePath: "..." }` as MigrateWorkerData, then
    // `typedWorkerData?.dbPath` was `undefined`, then the worker
    // postMessaged "no dbPath provided" and exited — masking the real
    // bug (a caller renamed the key).  After TYPE-06 we throw a
    // TypeError that names the missing key.
    expect(() =>
      validateWorkerData({ databasePath: "/tmp/x.db" }),
    ).toThrowError(/missing required key 'dbPath'/);
  });
});
