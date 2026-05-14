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

// ----------------------------------------------------------------------------
// logger-namespaces.test.ts — LOG-02 convention enforcement.
//
// AGENTS.md "Logging Standards > Namespace convention" mandates that every
// backend createLogger(...) call use one of:
//
//   1. `<area>:<module>`  (e.g. "services:adsb-poller", "db:migrate")
//   2. A whitelisted single-token aggregator: app, config, server,
//      services, formatters
//
// This test walks every .ts source file under acarshub-backend/src (excluding
// __tests__ and the logger module itself) and asserts that every literal
// argument to createLogger(...) is conformant. The test must FAIL if anyone
// reintroduces kebab-only ("adsb-poller"), bare-area ("database"), or any
// other non-colon non-whitelisted form.
// ----------------------------------------------------------------------------

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(__dirname, "..", "..");

const SINGLE_TOKEN_WHITELIST = new Set([
  "app",
  "config",
  "server",
  "services",
  "formatters",
]);

/** `<area>:<module>` — both segments lowercase, dashes allowed, no further colons. */
const COLON_NAMESPACE = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

/** Matches `createLogger("...")` or `createLogger('...')` — captures literal. */
const CALL_RE = /createLogger\(\s*["']([^"']+)["']\s*\)/g;

function listTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      // Skip test directories and the logger module itself (which defines
      // createLogger and uses "app" as a definitionally-exempt sentinel).
      if (entry === "__tests__" || entry === "node_modules") continue;
      listTsFiles(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      // Skip the logger module itself — it owns the createLogger definition.
      if (full.endsWith(join("utils", "logger.ts"))) continue;
      out.push(full);
    }
  }
  return out;
}

function extractNamespaces(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const found: string[] = [];
  for (const match of src.matchAll(CALL_RE)) {
    found.push(match[1]);
  }
  return found;
}

describe("logger namespace convention (LOG-02)", () => {
  const files = listTsFiles(SRC_ROOT);

  it("scans the backend src tree and finds createLogger call sites", () => {
    // Sanity guard: if this drops to 0 the test is silently passing.
    const total = files
      .flatMap((f) => extractNamespaces(f))
      .filter((n) => n.length > 0).length;
    expect(total).toBeGreaterThan(10);
  });

  it("every createLogger() namespace is colon-form or whitelisted single-token", () => {
    const violations: { file: string; namespace: string }[] = [];
    for (const file of files) {
      for (const ns of extractNamespaces(file)) {
        const okColon = COLON_NAMESPACE.test(ns);
        const okSingle = !ns.includes(":") && SINGLE_TOKEN_WHITELIST.has(ns);
        if (!okColon && !okSingle) {
          violations.push({ file: relative(SRC_ROOT, file), namespace: ns });
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
