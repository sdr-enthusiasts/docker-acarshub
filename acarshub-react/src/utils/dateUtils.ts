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
 * Date and Time Utility Functions
 * Provides consistent date/time formatting across the application
 */

/**
 * Detects if the user's locale prefers 24-hour time format
 * @returns true if the user prefers 24-hour format, false for 12-hour format
 */
export function prefers24HourClock(): boolean {
  const date = new Date(Date.UTC(2020, 0, 1, 20, 0)); // 8:00 PM UTC
  const formatted = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    hourCycle: "h23", // Try to force 24h to detect if it works
    timeZone: "UTC",
  }).format(date);

  return !formatted.match(/AM|PM/i);
}

/**
 * Formats a timestamp for display according to user's locale preferences
 * @param timestamp - Date object or timestamp number
 * @returns Formatted date/time string
 */
export function formatTimestamp(timestamp: Date | number): string {
  const date = typeof timestamp === "number" ? new Date(timestamp) : timestamp;
  const prefers24Hour = prefers24HourClock();

  return date.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: !prefers24Hour,
  });
}

/**
 * Formats a date for short display (date only, no time)
 * @param timestamp - Date object or timestamp number
 * @returns Formatted date string
 */
export function formatDate(timestamp: Date | number): string {
  const date = typeof timestamp === "number" ? new Date(timestamp) : timestamp;

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Formats time only (no date)
 * @param timestamp - Date object or timestamp number
 * @returns Formatted time string
 */
export function formatTime(timestamp: Date | number): string {
  const date = typeof timestamp === "number" ? new Date(timestamp) : timestamp;
  const prefers24Hour = prefers24HourClock();

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: !prefers24Hour,
  });
}

/**
 * Formats a timestamp as a relative time (e.g., "2 minutes ago")
 * @param timestamp - Date object or timestamp number
 * @returns Relative time string
 */
export function formatRelativeTime(timestamp: Date | number): string {
  const date = typeof timestamp === "number" ? new Date(timestamp) : timestamp;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return `${diffSeconds} second${diffSeconds !== 1 ? "s" : ""} ago`;
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""} ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  }
  return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
}

/**
 * Formats a duration in seconds to human-readable format
 * @param seconds - Duration in seconds
 * @returns Formatted duration string (e.g., "2h 34m 12s")
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}

/**
 * Checks if a timestamp is within the last N minutes
 * @param timestamp - Date object or timestamp number
 * @param minutes - Number of minutes to check
 * @returns true if timestamp is within the specified time range
 */
export function isWithinLastMinutes(
  timestamp: Date | number,
  minutes: number,
): boolean {
  const date = typeof timestamp === "number" ? new Date(timestamp) : timestamp;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = diffMs / (1000 * 60);

  return diffMinutes <= minutes;
}

/**
 * Converts Unix timestamp (seconds) to milliseconds
 * @param unixTimestamp - Unix timestamp in seconds
 * @returns Timestamp in milliseconds
 */
export function unixToMs(unixTimestamp: number): number {
  return unixTimestamp * 1000;
}

/**
 * Converts milliseconds to Unix timestamp (seconds)
 * @param ms - Timestamp in milliseconds
 * @returns Unix timestamp in seconds
 */
export function msToUnix(ms: number): number {
  return Math.floor(ms / 1000);
}
