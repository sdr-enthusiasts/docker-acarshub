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
 * Installed `@airframes/acars-decoder` Version Reader
 *
 * `decoder_variant.decoder_version` (agent-docs/V4.3.md "decoded_messages -
 * Decoded Text Storage") is part of the interning key, so every write needs
 * the installed package version. `@airframes/acars-decoder`'s own
 * `DecodeResult` does not carry a version field (see its `.d.ts`), so this
 * has to be read from the package's `package.json`.
 *
 * Why `createRequire` + `require.resolve`-style lookup rather than the
 * relative-path approach `config.ts` uses for the workspace's own three
 * `package.json` files:
 * `config.ts`'s `readPkgVersion()` depends on knowing whether the process is
 * running from the dev layout (cwd = acarshub-backend/) or the Docker layout
 * (cwd = /backend/) to build the right relative path. That distinction does
 * not exist for a third-party dependency: `@airframes/acars-decoder` is
 * always resolved by Node's normal `node_modules` walk from wherever this
 * compiled module happens to live, so `createRequire(import.meta.url)` finds
 * it correctly in both layouts (and in the hoisted-monorepo dev layout, where
 * it lives in the workspace root's `node_modules`, not this package's own)
 * without needing to know which layout it is in.
 *
 * This is also the function Phase 4 (search-index rebuild on decoder change,
 * agent-docs/V4.3.md "Phase 4") will use for its startup version comparison —
 * see that phase's `getInstalledDecoderVersion()` pseudocode.
 */

import { createRequire } from "node:module";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("services:decoder-version");

const requireFromHere = createRequire(import.meta.url);

/**
 * Read the installed `@airframes/acars-decoder` version from its
 * `package.json`.
 *
 * @returns The installed semver string, or `"unknown"` if it cannot be
 *          determined (package.json missing/unparseable). Never throws —
 *          an unreadable version must not block message indexing, it just
 *          means the interned variant key groups under `"unknown"` instead
 *          of a real version until this is resolved.
 */
export function getInstalledDecoderVersion(): string {
  try {
    const pkg = requireFromHere("@airframes/acars-decoder/package.json") as {
      version?: string;
    };
    return typeof pkg.version === "string" && pkg.version.length > 0
      ? pkg.version
      : "unknown";
  } catch (error) {
    logger.error(
      "Failed to resolve installed @airframes/acars-decoder version",
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return "unknown";
  }
}
