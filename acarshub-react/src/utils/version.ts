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

import packageJson from "../../package.json";

/**
 * Version Information Interface
 */
export interface VersionInfo {
  version: string;
  buildNumber: string;
  fullVersion: string;
  isDockerBuild: boolean;
}

/**
 * Get application version information
 *
 * In development/local builds:
 * - Uses version from package.json
 * - Build number is "dev"
 *
 * In Docker builds:
 * - Uses VERSION from environment (injected during Docker build)
 * - Uses BUILD_NUMBER from environment (GitHub Actions run number)
 * - Falls back to package.json if env vars not available
 *
 * @returns Version information object
 */
export const getVersionInfo = (): VersionInfo => {
  // Check if this is a Docker build (env var set during build)
  const isDockerBuild = import.meta.env.VITE_DOCKER_BUILD === "true";

  // Get version from environment (Docker) or package.json (dev)
  const version = import.meta.env.VITE_VERSION || packageJson.version;

  // Get build number from environment (Docker) or use "dev"
  const buildNumber = import.meta.env.VITE_BUILD_NUMBER || "dev";

  // Format full version string
  const fullVersion =
    buildNumber === "dev"
      ? `v${version} (Development)`
      : `v${version} Build ${buildNumber}`;

  return {
    version,
    buildNumber,
    fullVersion,
    isDockerBuild,
  };
};

/**
 * Get formatted version string for display
 *
 * @returns Formatted version string (e.g., "v4.0.0 Build 123" or "v4.0.0-alpha.5 (Development)")
 */
export const getFormattedVersion = (): string => {
  return getVersionInfo().fullVersion;
};

/**
 * Get package.json version (useful for development)
 *
 * @returns Package.json version string
 */
export const getPackageVersion = (): string => {
  return packageJson.version;
};
