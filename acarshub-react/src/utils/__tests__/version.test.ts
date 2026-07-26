/**
 * Tests for utils/version.
 *
 * Covers getVersionInfo() and getFormattedVersion() across:
 * - Local dev builds (VITE_BUILD_NUMBER unset -> "dev")
 * - Docker/CI builds (VITE_BUILD_NUMBER set to a numeric run id)
 *
 * The vite-define globals __CONTAINER_VERSION__, __FRONTEND_VERSION__,
 * __BACKEND_VERSION__ are injected by vitest.config.ts (mirroring vite's
 * production define block) from the actual workspace package.json files.
 * Vite's `define` substitutes those identifiers inside source files at
 * transform time -- it does NOT expose them as runtime globals. So in
 * these tests we read the same package.json values directly and assert
 * the version module reflects them.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getFormattedVersion, getVersionInfo } from "../version";

function readPkgVersion(absPath: string): string {
  const pkg = JSON.parse(readFileSync(absPath, "utf-8")) as {
    version?: string;
  };
  return pkg.version ?? "unknown";
}

// Resolve package.json paths relative to this test file so the test works
// regardless of where vitest is invoked from.
const __dirname = dirname(fileURLToPath(import.meta.url));
const REACT_ROOT = resolve(__dirname, "../../..");
const REPO_ROOT = resolve(REACT_ROOT, "..");
const CONTAINER_VERSION = readPkgVersion(resolve(REPO_ROOT, "package.json"));
const FRONTEND_VERSION = readPkgVersion(resolve(REACT_ROOT, "package.json"));
const BACKEND_VERSION = readPkgVersion(
  resolve(REPO_ROOT, "acarshub-backend/package.json"),
);

describe("utils/version", () => {
  afterEach(() => {
    // Reset any env stubs so subsequent tests see the natural import.meta.env.
    vi.unstubAllEnvs();
  });

  describe("getVersionInfo()", () => {
    it("returns dev defaults when VITE_BUILD_NUMBER is not set", () => {
      // Ensure no leftover stub from another test; explicitly clearing the
      // env variable yields the `?? "dev"` fallback branch.
      vi.stubEnv("VITE_BUILD_NUMBER", "");
      // Empty string is truthy-stripped to "dev" only if `??` treated it as
      // nullish. It does NOT (?? only checks null/undefined), so we need
      // to actually delete it. vi.stubEnv with undefined assigns undefined.
      vi.stubEnv("VITE_BUILD_NUMBER", undefined as unknown as string);

      const info = getVersionInfo();
      expect(info.buildNumber).toBe("dev");
      expect(info.isDockerBuild).toBe(false);
      expect(info.fullVersion).toBe(`v${CONTAINER_VERSION} (Development)`);
    });

    it("returns Docker-build metadata when VITE_BUILD_NUMBER is set to a numeric string", () => {
      vi.stubEnv("VITE_BUILD_NUMBER", "42");

      const info = getVersionInfo();
      expect(info.buildNumber).toBe("42");
      expect(info.isDockerBuild).toBe(true);
      expect(info.fullVersion).toBe(`v${CONTAINER_VERSION} Build 42`);
    });

    it("treats any non-'dev' build number as a Docker build (sentinel check, not numeric parse)", () => {
      // isDockerBuild is computed via `buildNumber !== "dev"` -- so any
      // non-empty, non-"dev" string passes. This documents/pins the current
      // behavior: a CI pipeline that produces a non-numeric run id (e.g.
      // a git sha) still surfaces as a Docker build.
      vi.stubEnv("VITE_BUILD_NUMBER", "abc123-sha");

      const info = getVersionInfo();
      expect(info.isDockerBuild).toBe(true);
      expect(info.fullVersion).toBe(`v${CONTAINER_VERSION} Build abc123-sha`);
    });

    it("exposes the three vite-define version constants verbatim", () => {
      const info = getVersionInfo();
      // We assert against the package.json values so this test stays
      // resilient to package.json version bumps -- it pins the *wiring*
      // (define -> module -> return value) rather than a literal version.
      expect(info.containerVersion).toBe(CONTAINER_VERSION);
      expect(info.frontendVersion).toBe(FRONTEND_VERSION);
      expect(info.backendVersion).toBe(BACKEND_VERSION);
    });

    it("the three vite-define versions are non-empty strings", () => {
      // Smoke check: vitest.config.ts's readPkgVersion() falls back to
      // "unknown" if a package.json is missing or malformed. We assert
      // the values are non-empty so a misconfigured test env can't silently
      // emit "unknown" without us noticing.
      const info = getVersionInfo();
      for (const v of [
        info.containerVersion,
        info.frontendVersion,
        info.backendVersion,
      ]) {
        expect(typeof v).toBe("string");
        expect(v.length).toBeGreaterThan(0);
        expect(v).not.toBe("unknown");
      }
    });
  });

  describe("getFormattedVersion()", () => {
    it("returns the dev fullVersion when no build number is set", () => {
      vi.stubEnv("VITE_BUILD_NUMBER", undefined as unknown as string);
      expect(getFormattedVersion()).toBe(`v${CONTAINER_VERSION} (Development)`);
    });

    it("returns the Docker fullVersion when a build number is set", () => {
      vi.stubEnv("VITE_BUILD_NUMBER", "7");
      expect(getFormattedVersion()).toBe(`v${CONTAINER_VERSION} Build 7`);
    });

    it("is a thin wrapper around getVersionInfo().fullVersion", () => {
      // Defensive sanity check: getFormattedVersion must remain a delegation,
      // not duplicate the formatting logic. We verify by comparing both
      // outputs under the same env in a single tick.
      vi.stubEnv("VITE_BUILD_NUMBER", "99");
      expect(getFormattedVersion()).toBe(getVersionInfo().fullVersion);
    });
  });
});
