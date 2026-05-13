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
 * Tests for runMigrationsInWorker()
 *
 * The function has THREE relevant execution paths in the current
 * (child_process.spawn-based) implementation:
 *
 *   1. tsx-loader-absent fallback (the "dev/test" branch):
 *      `isDev && !hasTsxLoader` ⇒ run runMigrations() synchronously on
 *      the main thread.  This is the path vitest hits by default because
 *      vitest does not put `/tsx/` in process.execArgv.  See L1441-1453
 *      of migrate.ts.
 *
 *   2. Worker file missing (production-degraded):
 *      `existsSync(workerPath) === false` ⇒ warn and fall back to
 *      synchronous runMigrations().  Reached when the Docker image was
 *      built without the migrate-worker.mjs esbuild step.  L1474-1498.
 *
 *   3. spawn() / child failure:
 *      - child.on('error') ⇒ warn and fall back to synchronous
 *        runMigrations() (L1516-1533).
 *      - child.on('close', code) with non-zero code ⇒ reject with
 *        "Migration process exited with code <n>" (L1535-1544).
 *      - child.on('close', 0) ⇒ resolve.
 *
 * Vitest cannot natively reach paths (2) and (3) because:
 *   - import.meta.url ends with '.ts' (vitest evaluates source) ⇒
 *     isDev=true, but
 *   - process.execArgv contains no '/tsx/' fragment ⇒ hasTsxLoader=false,
 *   - so the function takes the early-return at L1441 unconditionally.
 *
 * To reach (2) and (3) we monkey-patch `process.execArgv` to contain a
 * synthetic '/tsx/' entry (making hasTsxLoader=true) and override the
 * `existsSync` and `spawn` exports via `vi.mock` partial factories.  The
 * partial-factory approach preserves the rest of `node:fs` and
 * `node:child_process` so unrelated test setup code (fs.mkdtempSync,
 * fs.rmSync, etc.) still functions.
 *
 * Regression tests:
 *   - Dev/tsx fallback: runMigrations succeeds, rejects on bad path,
 *     idempotent on second call.
 *   - Worker-missing fallback: existsSync=false ⇒ resolves and DB is
 *     actually migrated synchronously (proves we fell back, not
 *     silently skipped).
 *   - Worker-missing fallback rejects when the underlying sync migration
 *     throws (e.g. unwritable DB path).
 *   - Spawn error fallback: spawn-emitted 'error' triggers sync fallback
 *     and resolves when the sync migration succeeds.
 *   - Spawn error fallback: spawn 'error' + bad DB path rejects.
 *   - Close non-zero: child exits with code 1 ⇒ rejects with
 *     "Migration process exited with code 1".
 *   - Close zero: child exits with code 0 ⇒ resolves.
 */

import type { ChildProcess } from "node:child_process";
import * as child_process from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import Database from "better-sqlite3";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks for the production-path suite.
//
// We use partial factories so unrelated callers (fs.mkdtempSync,
// fs.rmSync, the dev-mode suite below) keep their real implementations.
// Only `existsSync` and `spawn` are replaced with vi.fn() spies whose
// default implementation is the real one — individual tests override
// behaviour via mockImplementationOnce().
// ---------------------------------------------------------------------------

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
  };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: vi.fn(actual.spawn),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a temporary directory and return its path.
 * The directory is cleaned up in afterEach.
 */
function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "acars-migrate-worker-test-"));
}

/**
 * Remove a directory tree, silently ignoring errors.
 */
function rmDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

// Import lazily so that vi.mock() calls above take effect before the module
// is evaluated.  The import() call is inside each test that needs the
// production-worker path.
import { runMigrationsInWorker } from "../migrate.js";

// ---------------------------------------------------------------------------
// Suite: dev-mode (tsx) synchronous fallback
//
// When vitest/tsx runs tests, import.meta.url ends with '.ts' AND
// process.execArgv does not contain '/tsx/', so runMigrationsInWorker
// takes the synchronous branch unconditionally.
// ---------------------------------------------------------------------------

describe("runMigrationsInWorker – dev mode (tsx synchronous fallback)", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    dbPath = path.join(tmpDir, "test.db");
  });

  afterEach(() => {
    rmDir(tmpDir);
  });

  it("resolves when migrations succeed on a fresh database", async () => {
    // Fresh database — runMigrations() should apply all migrations and resolve.
    await expect(runMigrationsInWorker(dbPath)).resolves.toBeUndefined();

    // Verify the DB was actually migrated: alembic_version table must exist.
    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT version_num FROM alembic_version LIMIT 1")
      .get() as { version_num: string } | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(typeof row?.version_num).toBe("string");
    expect(row?.version_num.length).toBeGreaterThan(0);
  });

  it("resolves when the database is already at the latest version", async () => {
    // First run: migrate to latest
    await runMigrationsInWorker(dbPath);

    // Second run: no-op, must still resolve cleanly
    await expect(runMigrationsInWorker(dbPath)).resolves.toBeUndefined();
  });

  it("rejects when runMigrations() throws (e.g. bad db path in read-only dir)", async () => {
    // Use a path inside a non-existent sub-directory to force an open error.
    const badPath = path.join(tmpDir, "nonexistent", "sub", "bad.db");

    await expect(runMigrationsInWorker(badPath)).rejects.toThrow();
  });

  it("regression: second call on same path does not throw", async () => {
    // Regression guard: calling runMigrationsInWorker twice must not leave the
    // DB in a broken state or throw on the second call.
    await runMigrationsInWorker(dbPath);
    await expect(runMigrationsInWorker(dbPath)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite: spawn path (mocked spawn + existsSync)
//
// To reach the spawn-based branches we monkey-patch process.execArgv so
// it contains a '/tsx/' fragment.  That makes hasTsxLoader=true, which
// bypasses the early sync-fallback return at L1441 and forces the
// function to walk through existsSync(workerPath) and (if present)
// spawn().
// ---------------------------------------------------------------------------

describe("runMigrationsInWorker – spawn path (mocked)", () => {
  let tmpDir: string;
  let dbPath: string;
  let originalExecArgv: string[];

  // Cast vitest's mocked exports.  These are the same instances created by
  // the vi.mock() factories above; we grab references once for ergonomic
  // mockImplementationOnce() in each test.
  const existsSyncMock = vi.mocked(fs.existsSync);
  const spawnMock = vi.mocked(child_process.spawn);

  beforeAll(() => {
    // Save and patch execArgv so hasTsxLoader becomes true.
    originalExecArgv = process.execArgv;
    process.execArgv = [
      ...originalExecArgv,
      "--import=file:///fake/path/tsx/dist/loader.mjs",
    ];
  });

  afterAll(() => {
    process.execArgv = originalExecArgv;
  });

  beforeEach(() => {
    tmpDir = makeTmpDir();
    dbPath = path.join(tmpDir, "test.db");
    existsSyncMock.mockClear();
    spawnMock.mockClear();
  });

  afterEach(() => {
    rmDir(tmpDir);
  });

  // -------------------------------------------------------------------------
  // Worker-file-missing fallback (L1474-1498)
  // -------------------------------------------------------------------------

  it("falls back to synchronous migrations when the worker file is missing", async () => {
    // existsSync(workerPath) returns false on the *first* call (the worker
    // check).  Subsequent calls (none expected here) hit the real impl.
    existsSyncMock.mockImplementationOnce(() => false);

    await expect(runMigrationsInWorker(dbPath)).resolves.toBeUndefined();

    // Spawn must NOT have been called when the worker is missing.
    expect(spawnMock).not.toHaveBeenCalled();

    // DB must actually be migrated (proves we fell back, not skipped).
    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT version_num FROM alembic_version LIMIT 1")
      .get() as { version_num: string } | undefined;
    db.close();
    expect(row?.version_num).toBeTruthy();
  });

  it("rejects when worker file is missing and the sync fallback also fails", async () => {
    existsSyncMock.mockImplementationOnce(() => false);
    const badPath = path.join(tmpDir, "nonexistent", "sub", "bad.db");

    await expect(runMigrationsInWorker(badPath)).rejects.toThrow();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // spawn child.on('error') fallback (L1516-1533)
  // -------------------------------------------------------------------------

  it("falls back to synchronous migrations when spawn child emits 'error'", async () => {
    // Worker file appears present so we reach spawn().
    existsSyncMock.mockImplementationOnce(() => true);

    // Return a fake ChildProcess that immediately emits 'error'.
    const fakeChild = new EventEmitter() as unknown as ChildProcess;
    spawnMock.mockImplementationOnce(() => {
      // Emit asynchronously so the .on() listeners are registered first.
      setImmediate(() => {
        (fakeChild as EventEmitter).emit("error", new Error("EACCES"));
      });
      return fakeChild;
    });

    await expect(runMigrationsInWorker(dbPath)).resolves.toBeUndefined();

    // Spawn was attempted exactly once before the fallback ran.
    expect(spawnMock).toHaveBeenCalledTimes(1);

    // DB must actually be migrated by the fallback.
    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT version_num FROM alembic_version LIMIT 1")
      .get() as { version_num: string } | undefined;
    db.close();
    expect(row?.version_num).toBeTruthy();
  });

  it("rejects when spawn 'error' fires and the sync fallback also fails", async () => {
    existsSyncMock.mockImplementationOnce(() => true);
    const fakeChild = new EventEmitter() as unknown as ChildProcess;
    spawnMock.mockImplementationOnce(() => {
      setImmediate(() => {
        (fakeChild as EventEmitter).emit("error", new Error("EACCES"));
      });
      return fakeChild;
    });

    const badPath = path.join(tmpDir, "nonexistent", "sub", "bad.db");
    await expect(runMigrationsInWorker(badPath)).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // spawn child.on('close', code) (L1535-1544)
  // -------------------------------------------------------------------------

  it("rejects when the child process exits with a non-zero code", async () => {
    existsSyncMock.mockImplementationOnce(() => true);
    const fakeChild = new EventEmitter() as unknown as ChildProcess;
    spawnMock.mockImplementationOnce(() => {
      setImmediate(() => {
        (fakeChild as EventEmitter).emit("close", 1);
      });
      return fakeChild;
    });

    await expect(runMigrationsInWorker(dbPath)).rejects.toThrow(
      "Migration process exited with code 1",
    );
  });

  it("rejects with the actual non-zero exit code in the error message", async () => {
    existsSyncMock.mockImplementationOnce(() => true);
    const fakeChild = new EventEmitter() as unknown as ChildProcess;
    spawnMock.mockImplementationOnce(() => {
      setImmediate(() => {
        (fakeChild as EventEmitter).emit("close", 137);
      });
      return fakeChild;
    });

    // 137 = SIGKILL (OOM-killer is the canonical real-world example).
    await expect(runMigrationsInWorker(dbPath)).rejects.toThrow(
      "Migration process exited with code 137",
    );
  });

  it("resolves when the child process exits with code 0", async () => {
    existsSyncMock.mockImplementationOnce(() => true);
    const fakeChild = new EventEmitter() as unknown as ChildProcess;
    spawnMock.mockImplementationOnce(() => {
      setImmediate(() => {
        (fakeChild as EventEmitter).emit("close", 0);
      });
      return fakeChild;
    });

    await expect(runMigrationsInWorker(dbPath)).resolves.toBeUndefined();
  });

  it("regression: spawn is invoked with execArgv, workerPath and dbPath", async () => {
    // Regression guard: the spawn argv shape must remain stable so the
    // worker process inherits the tsx loader and receives the DB path.
    existsSyncMock.mockImplementationOnce(() => true);
    const fakeChild = new EventEmitter() as unknown as ChildProcess;
    spawnMock.mockImplementationOnce(() => {
      setImmediate(() => {
        (fakeChild as EventEmitter).emit("close", 0);
      });
      return fakeChild;
    });

    await runMigrationsInWorker(dbPath);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [execPath, args, options] = spawnMock.mock.calls[0];
    expect(execPath).toBe(process.execPath);
    // args must end with [..., workerPath, dbPath]
    expect(Array.isArray(args)).toBe(true);
    const argv = args as string[];
    expect(argv[argv.length - 1]).toBe(dbPath);
    expect(argv[argv.length - 2]).toMatch(/migrate-worker\.(ts|mjs)$/);
    // execArgv (with our injected tsx loader) is prefixed.
    expect(argv).toEqual(
      expect.arrayContaining([
        "--import=file:///fake/path/tsx/dist/loader.mjs",
      ]),
    );
    expect((options as { stdio: string }).stdio).toBe("inherit");
  });
});
