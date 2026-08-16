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

import { describe, expect, it, vi } from "vitest";
import { getInstalledDecoderVersion } from "../decoder-version.js";

describe("getInstalledDecoderVersion", () => {
  it("returns the installed @airframes/acars-decoder semver string", () => {
    const version = getInstalledDecoderVersion();
    expect(typeof version).toBe("string");
    expect(version.length).toBeGreaterThan(0);
    // Loosely shaped semver check (x.y.z) rather than pinning the exact
    // installed version, which would make this test churn on every bump.
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("is stable across repeated calls", () => {
    expect(getInstalledDecoderVersion()).toBe(getInstalledDecoderVersion());
  });

  it("falls back to 'unknown' rather than throwing when the package cannot be resolved", async () => {
    // The fallback exists so an unreadable version cannot block message
    // indexing: the variant key just groups under "unknown" until it is
    // resolved. Untested, that guarantee is only a comment — and this is the
    // branch that runs in exactly the situation where nothing else works.
    vi.resetModules();
    vi.doMock("node:module", () => ({
      createRequire: () => () => {
        throw new Error("ENOENT: package.json is unreadable");
      },
    }));

    const { getInstalledDecoderVersion: withBrokenResolver } = await import(
      "../decoder-version.js"
    );

    expect(() => withBrokenResolver()).not.toThrow();
    expect(withBrokenResolver()).toBe("unknown");

    vi.doUnmock("node:module");
    vi.resetModules();
  });
});
