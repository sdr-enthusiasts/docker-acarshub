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
 * Version utilities for ACARS Hub frontend.
 *
 * Version strings are baked in at `vite build` time by reading the three
 * workspace package.json files in vite.config.ts via the `define` option:
 *
 *   __CONTAINER_VERSION__  — workspace root package.json  (overall release tag)
 *   __FRONTEND_VERSION__   — acarshub-react/package.json
 *   __BACKEND_VERSION__    — acarshub-backend/package.json (informational only
 *                            at the frontend; the authoritative value is sent
 *                            by the server in the AcarshubVersion socket event)
 *
 * VITE_BUILD_NUMBER is the only value that still comes from the environment at
 * Docker build time because it is a CI artifact (GitHub Actions run number),
 * not a version string that lives in source control.
 */

/**
 * Frontend version information derived from package.json files and CI metadata.
 */
export interface VersionInfo {
  /** Version from workspace root package.json (overall container release tag). */
  containerVersion: string;
  /** Version from acarshub-react/package.json. */
  frontendVersion: string;
  /** Version from acarshub-backend/package.json (as known at build time). */
  backendVersion: string;
  /** GitHub Actions run number, or "dev" for local builds. */
  buildNumber: string;
  /**
   * Human-readable full version string, e.g.
   *   "v4.1.0 Build 42"  (Docker/CI build)
   *   "v4.1.0-alpha.1 (Development)"  (local dev)
   */
  fullVersion: string;
  /** True when VITE_BUILD_NUMBER was provided (i.e. this is a Docker/CI build). */
  isDockerBuild: boolean;
}

/**
 * Returns version information for the application.
 *
 * In local dev builds none of the VITE_* env vars are set, so buildNumber
 * defaults to "dev" and isDockerBuild is false.
 *
 * In Docker/CI builds VITE_BUILD_NUMBER is set to the GitHub Actions run
 * number, making isDockerBuild true.
 */
export const getVersionInfo = (): VersionInfo => {
  const buildNumber = import.meta.env.VITE_BUILD_NUMBER ?? "dev";
  const isDockerBuild = buildNumber !== "dev";

  const fullVersion = isDockerBuild
    ? `v${__CONTAINER_VERSION__} Build ${buildNumber}`
    : `v${__CONTAINER_VERSION__} (Development)`;

  return {
    containerVersion: __CONTAINER_VERSION__,
    frontendVersion: __FRONTEND_VERSION__,
    backendVersion: __BACKEND_VERSION__,
    buildNumber,
    fullVersion,
    isDockerBuild,
  };
};

/**
 * Returns the formatted full version string for display.
 *
 * @returns e.g. "v4.1.0 Build 42" or "v4.1.0-alpha.1 (Development)"
 */
export const getFormattedVersion = (): string => getVersionInfo().fullVersion;
