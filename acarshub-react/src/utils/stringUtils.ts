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
 * String Utility Functions
 * Provides string manipulation, formatting, and validation utilities
 */

/**
 * Ensures a hex string is uppercase and padded to 6 characters
 * @param hex - Hex string to format
 * @returns Uppercase hex string padded to 6 characters
 */
export function ensureHexFormat(hex: string): string {
  return hex.toUpperCase().padStart(6, "0");
}

/**
 * Truncates a string to a maximum length with ellipsis
 * @param str - String to truncate
 * @param maxLength - Maximum length (including ellipsis)
 * @returns Truncated string with ellipsis if needed
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
}

/**
 * Capitalizes the first letter of a string
 * @param str - String to capitalize
 * @returns String with first letter capitalized
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Formats bytes to human-readable size (KB, MB, GB, TB)
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string (e.g., "5.26 GB")
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";
  if (!bytes || bytes < 0) return "N/A";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Capitalizes the first letter of each word in a string
 * @param str - String to title case
 * @returns String with each word capitalized
 */
export function titleCase(str: string): string {
  return str
    .split(" ")
    .map((word) => capitalize(word))
    .join(" ");
}

/**
 * Escapes HTML special characters to prevent XSS
 * @param str - String to escape
 * @returns HTML-safe string
 */
export function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Removes HTML tags from a string
 * @param str - String potentially containing HTML
 * @returns String with HTML tags removed
 */
export function stripHtml(str: string): string {
  const div = document.createElement("div");
  div.innerHTML = str;
  return div.textContent || div.innerText || "";
}

/**
 * Checks if a string is empty or contains only whitespace
 * @param str - String to check
 * @returns true if string is empty or whitespace only
 */
export function isBlank(str: string | null | undefined): boolean {
  return !str || str.trim().length === 0;
}

/**
 * Removes all whitespace from a string
 * @param str - String to process
 * @returns String with all whitespace removed
 */
export function removeWhitespace(str: string): string {
  return str.replace(/\s+/g, "");
}

/**
 * Normalizes whitespace (replaces multiple spaces with single space, trims)
 * @param str - String to normalize
 * @returns String with normalized whitespace
 */
export function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, " ").trim();
}

/**
 * Converts a string to kebab-case
 * @param str - String to convert
 * @returns kebab-case string
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

/**
 * Converts a string to camelCase
 * @param str - String to convert
 * @returns camelCase string
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ""))
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
}

/**
 * Converts a string to PascalCase
 * @param str - String to convert
 * @returns PascalCase string
 */
export function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Pads a string to a specific length with a character
 * @param str - String to pad
 * @param length - Target length
 * @param char - Character to pad with (default: space)
 * @param position - Padding position ('start' or 'end')
 * @returns Padded string
 */
export function pad(
  str: string,
  length: number,
  char = " ",
  position: "start" | "end" = "end",
): string {
  if (str.length >= length) return str;
  const padding = char.repeat(length - str.length);
  return position === "start" ? padding + str : str + padding;
}

/**
 * Highlights search terms in text by wrapping them in a marker
 * Useful for search result highlighting
 * @param text - Text to search in
 * @param searchTerm - Term to highlight
 * @param caseSensitive - Whether search is case sensitive
 * @returns Array of objects with text and highlighted flag
 */
export function highlightText(
  text: string,
  searchTerm: string,
  caseSensitive = false,
): Array<{ text: string; highlighted: boolean }> {
  if (!searchTerm) return [{ text, highlighted: false }];

  const flags = caseSensitive ? "g" : "gi";
  const regex = new RegExp(`(${escapeRegex(searchTerm)})`, flags);
  const parts = text.split(regex);

  return parts.map((part) => ({
    text: part,
    highlighted: regex.test(part),
  }));
}

/**
 * Escapes special regex characters in a string
 * @param str - String to escape
 * @returns String with regex special characters escaped
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Formats a number with thousand separators
 * @param num - Number to format
 * @param locale - Locale to use for formatting (default: user's locale)
 * @returns Formatted number string
 */
export function formatNumber(num: number, locale?: string): string {
  return new Intl.NumberFormat(locale).format(num);
}

/**
 * Generates a random string of specified length
 * @param length - Length of random string
 * @param charset - Character set to use (default: alphanumeric)
 * @returns Random string
 */
export function randomString(
  length: number,
  charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

/**
 * Creates a URL-safe slug from a string
 * @param str - String to convert to slug
 * @returns URL-safe slug
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Pluralizes a word based on count
 * @param count - Number to check
 * @param singular - Singular form of word
 * @param plural - Plural form of word (optional, adds 's' if not provided)
 * @returns Appropriate form of the word
 */
export function pluralize(
  count: number,
  singular: string,
  plural?: string,
): string {
  return count === 1 ? singular : plural || `${singular}s`;
}

/**
 * Extracts initials from a name
 * @param name - Full name
 * @param maxInitials - Maximum number of initials to extract
 * @returns Initials string
 */
export function getInitials(name: string, maxInitials = 2): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase())
    .slice(0, maxInitials)
    .join("");
}
