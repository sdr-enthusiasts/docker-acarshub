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
 * Runtime validation for the migrate-worker's `workerData` input.
 *
 * Lives in a dedicated module (not in migrate-worker.ts) so unit tests can
 * import the validator without triggering migrate-worker's top-level
 * "open DB, run migrations, exit" script body.  See TYPE-06 in
 * agent-docs/REMEDIATION_PLAN.md.
 */

export interface MigrateWorkerData {
  dbPath: string;
}

/**
 * Validate `workerData` arriving from `node:worker_threads` (typed `unknown`).
 *
 * Returns:
 *   - `undefined`         when input is null/undefined (child-process path —
 *                         dbPath will come from process.argv[2])
 *   - `MigrateWorkerData` when input is a well-formed `{ dbPath: string }`
 *
 * Throws `TypeError` when input is present but mis-shaped — a programmer
 * error that must be loud, not silently swallowed into the
 * "no dbPath provided" branch.
 */
export function validateWorkerData(
  raw: unknown,
): MigrateWorkerData | undefined {
  if (raw === null || raw === undefined) return undefined;

  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError(
      `migrate-worker: workerData must be a plain object or null/undefined, got ${
        Array.isArray(raw) ? "array" : typeof raw
      }`,
    );
  }

  const candidate = raw as Record<string, unknown>;
  if (!("dbPath" in candidate)) {
    throw new TypeError(
      "migrate-worker: workerData is missing required key 'dbPath'",
    );
  }
  if (typeof candidate.dbPath !== "string" || candidate.dbPath.length === 0) {
    throw new TypeError(
      `migrate-worker: workerData.dbPath must be a non-empty string, got ${typeof candidate.dbPath}`,
    );
  }

  return { dbPath: candidate.dbPath };
}
