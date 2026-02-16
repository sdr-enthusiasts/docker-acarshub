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
 * Path Utilities
 *
 * Handles URL path resolution with respect to Vite's base URL configuration.
 * Ensures assets (GeoJSON, images, etc.) work correctly when the app is
 * served under a subpath (e.g., /acarshub-test/).
 */

/**
 * Resolves a path relative to the application's base URL.
 *
 * Vite's `import.meta.env.BASE_URL` contains the configured base path:
 * - Production (Docker): "./" (relative paths)
 * - Subpath deployment: "/acarshub-test/" (absolute with subpath)
 * - Development: "/" (root)
 *
 * This function handles all cases correctly:
 * - Removes leading slash from path if present
 * - Joins with BASE_URL
 * - Normalizes double slashes
 *
 * @param path - Path to resolve (e.g., "/geojson/file.geojson" or "geojson/file.geojson")
 * @returns Resolved path relative to BASE_URL
 *
 * @example
 * // With BASE_URL = "./"
 * resolveBasePath("/geojson/file.geojson") // => "./geojson/file.geojson"
 *
 * @example
 * // With BASE_URL = "/acarshub-test/"
 * resolveBasePath("/geojson/file.geojson") // => "/acarshub-test/geojson/file.geojson"
 *
 * @example
 * // With BASE_URL = "/"
 * resolveBasePath("/geojson/file.geojson") // => "/geojson/file.geojson"
 */
export function resolveBasePath(path: string): string {
  const baseUrl = import.meta.env.BASE_URL;

  // Remove leading slashes from path (handles both / and //)
  const normalizedPath = path.replace(/^\/+/, "");

  // Join base URL and path
  let resolved: string;
  if (baseUrl.endsWith("/")) {
    resolved = baseUrl + normalizedPath;
  } else {
    resolved = `${baseUrl}/${normalizedPath}`;
  }

  // Normalize: remove double slashes (but preserve protocol slashes like "http://")
  return resolved.replace(/([^:]\/)\/+/g, "$1");
}

/**
 * Checks if a URL is absolute (has protocol).
 *
 * @param url - URL to check
 * @returns True if URL is absolute (starts with http://, https://, //, etc.)
 *
 * @example
 * isAbsoluteUrl("http://example.com") // => true
 * isAbsoluteUrl("https://example.com") // => true
 * isAbsoluteUrl("//example.com") // => true
 * isAbsoluteUrl("/path/to/file") // => false
 * isAbsoluteUrl("relative/path") // => false
 */
export function isAbsoluteUrl(url: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url);
}

/**
 * Resolves a path, but only if it's not already an absolute URL.
 *
 * Useful for handling paths that might be either relative or absolute:
 * - Relative paths get resolved via resolveBasePath()
 * - Absolute URLs are returned unchanged
 *
 * @param path - Path or URL to resolve
 * @returns Resolved path or original URL
 *
 * @example
 * // Relative path gets resolved
 * resolvePathOrUrl("/geojson/file.geojson") // => "./geojson/file.geojson" (or with subpath)
 *
 * @example
 * // Absolute URL unchanged
 * resolvePathOrUrl("https://example.com/data.json") // => "https://example.com/data.json"
 */
export function resolvePathOrUrl(path: string): string {
  return isAbsoluteUrl(path) ? path : resolveBasePath(path);
}
