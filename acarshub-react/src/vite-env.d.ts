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

/// <reference types="vite/client" />

/**
 * Type definitions for Vite environment variables
 */
interface ImportMetaEnv {
  /** GitHub Actions run number, set at Docker build time. Absent in local dev builds. */
  readonly VITE_BUILD_NUMBER?: string;
  /** Set to "true" when building for E2E tests — exposes the app store on window for test injection */
  readonly VITE_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Build-time version constants injected by vite.config.ts via `define`.
 *
 * These are resolved from the workspace package.json files at `vite build` time
 * so no Docker ARG injection is required — the package.json files are the single
 * source of truth for each component's version.
 */
declare const __CONTAINER_VERSION__: string;
declare const __FRONTEND_VERSION__: string;
declare const __BACKEND_VERSION__: string;

/**
 * Type definitions for static asset imports in Vite
 */

declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.jpg" {
  const src: string;
  export default src;
}

declare module "*.jpeg" {
  const src: string;
  export default src;
}

declare module "*.gif" {
  const src: string;
  export default src;
}

declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*.webp" {
  const src: string;
  export default src;
}

declare module "*.ico" {
  const src: string;
  export default src;
}
