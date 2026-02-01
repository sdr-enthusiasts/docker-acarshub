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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatDate,
  formatDuration,
  formatRelativeTime,
  formatTime,
  formatTimestamp,
  isWithinLastMinutes,
  msToUnix,
  prefers24HourClock,
  resolveTimeFormat,
  unixToMs,
} from "../dateUtils";

describe("dateUtils", () => {
  // Use a fixed date for consistent testing
  const FIXED_DATE = new Date("2024-01-15T14:30:45Z"); // 2:30:45 PM UTC
  const FIXED_TIMESTAMP = FIXED_DATE.getTime();

  describe("prefers24HourClock", () => {
    it("should detect 24-hour or 12-hour preference", () => {
      const result = prefers24HourClock();
      expect(typeof result).toBe("boolean");
    });

    it("should return consistent results", () => {
      const result1 = prefers24HourClock();
      const result2 = prefers24HourClock();
      expect(result1).toBe(result2);
    });
  });

  describe("resolveTimeFormat", () => {
    it("should return 24h when specified", () => {
      expect(resolveTimeFormat("24h")).toBe("24h");
    });

    it("should return 12h when specified", () => {
      expect(resolveTimeFormat("12h")).toBe("12h");
    });

    it("should auto-detect when set to auto", () => {
      const result = resolveTimeFormat("auto");
      expect(result === "12h" || result === "24h").toBe(true);
    });

    it("should return same value as prefers24HourClock for auto", () => {
      const autoPrefers24 = prefers24HourClock();
      const resolved = resolveTimeFormat("auto");
      expect(resolved).toBe(autoPrefers24 ? "24h" : "12h");
    });
  });

  describe("formatTimestamp", () => {
    it("should handle Date objects", () => {
      const result = formatTimestamp(FIXED_DATE);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle timestamp numbers", () => {
      const result = formatTimestamp(FIXED_TIMESTAMP);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should format with MDY date format", () => {
      const result = formatTimestamp(FIXED_DATE, "24h", "mdy", "utc");
      expect(result).toContain("01/15/2024");
    });

    it("should format with DMY date format", () => {
      const result = formatTimestamp(FIXED_DATE, "24h", "dmy", "utc");
      expect(result).toContain("15/01/2024");
    });

    it("should format with YMD date format", () => {
      const result = formatTimestamp(FIXED_DATE, "24h", "ymd", "utc");
      expect(result).toContain("2024-01-15");
    });

    it("should include time in formatted output", () => {
      const result = formatTimestamp(FIXED_DATE, "24h", "ymd", "utc");
      expect(result).toContain("14:30:45");
    });

    it("should handle 12-hour time format", () => {
      const result = formatTimestamp(FIXED_DATE, "12h", "auto", "utc");
      // Should contain AM or PM
      expect(/AM|PM/i.test(result)).toBe(true);
    });

    it("should handle 24-hour time format", () => {
      const result = formatTimestamp(FIXED_DATE, "24h", "ymd", "utc");
      // Should not contain AM or PM
      expect(/AM|PM/i.test(result)).toBe(false);
      expect(result).toContain("14:30:45");
    });

    it("should handle auto time format", () => {
      const result = formatTimestamp(FIXED_DATE, "auto", "ymd", "utc");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle short date format", () => {
      const result = formatTimestamp(FIXED_DATE, "24h", "short", "utc");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle long date format", () => {
      const result = formatTimestamp(FIXED_DATE, "24h", "long", "utc");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should respect UTC timezone", () => {
      const result = formatTimestamp(FIXED_DATE, "24h", "ymd", "utc");
      expect(result).toContain("2024-01-15");
      expect(result).toContain("14:30:45");
    });

    it("should handle local timezone", () => {
      const result = formatTimestamp(FIXED_DATE, "24h", "ymd", "local");
      expect(typeof result).toBe("string");
      expect(result).toContain("2024-01-15"); // Date should be same
    });
  });

  describe("formatDate", () => {
    it("should format date only (no time)", () => {
      const result = formatDate(FIXED_DATE, "ymd", "utc");
      expect(result).toBe("2024-01-15");
      expect(result).not.toContain(":");
    });

    it("should handle MDY format", () => {
      const result = formatDate(FIXED_DATE, "mdy", "utc");
      expect(result).toBe("01/15/2024");
    });

    it("should handle DMY format", () => {
      const result = formatDate(FIXED_DATE, "dmy", "utc");
      expect(result).toBe("15/01/2024");
    });

    it("should handle YMD format", () => {
      const result = formatDate(FIXED_DATE, "ymd", "utc");
      expect(result).toBe("2024-01-15");
    });

    it("should handle timestamp numbers", () => {
      const result = formatDate(FIXED_TIMESTAMP, "ymd", "utc");
      expect(result).toBe("2024-01-15");
    });

    it("should handle short format", () => {
      const result = formatDate(FIXED_DATE, "short", "utc");
      expect(typeof result).toBe("string");
      expect(result).not.toContain(":");
    });

    it("should handle long format", () => {
      const result = formatDate(FIXED_DATE, "long", "utc");
      expect(typeof result).toBe("string");
      expect(result).not.toContain(":");
    });

    it("should handle auto format", () => {
      const result = formatDate(FIXED_DATE, "auto", "utc");
      expect(typeof result).toBe("string");
      expect(result).not.toContain(":");
    });

    it("should respect UTC timezone", () => {
      const result = formatDate(FIXED_DATE, "ymd", "utc");
      expect(result).toBe("2024-01-15");
    });

    it("should handle local timezone", () => {
      const result = formatDate(FIXED_DATE, "ymd", "local");
      expect(typeof result).toBe("string");
      expect(result).toContain("2024");
    });
  });

  describe("formatTime", () => {
    it("should format time only (no date)", () => {
      const result = formatTime(FIXED_DATE, "24h", "utc");
      expect(result).toContain("14:30:45");
      expect(result).not.toContain("2024");
    });

    it("should handle 24-hour format", () => {
      const result = formatTime(FIXED_DATE, "24h", "utc");
      expect(/AM|PM/i.test(result)).toBe(false);
      expect(result).toContain("14:30:45");
    });

    it("should handle 12-hour format", () => {
      const result = formatTime(FIXED_DATE, "12h", "utc");
      expect(/AM|PM/i.test(result)).toBe(true);
    });

    it("should handle timestamp numbers", () => {
      const result = formatTime(FIXED_TIMESTAMP, "24h", "utc");
      expect(result).toContain("14:30:45");
    });

    it("should handle auto format", () => {
      const result = formatTime(FIXED_DATE, "auto", "utc");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should respect UTC timezone", () => {
      const result = formatTime(FIXED_DATE, "24h", "utc");
      expect(result).toContain("14:30:45");
    });

    it("should handle local timezone", () => {
      const result = formatTime(FIXED_DATE, "24h", "local");
      expect(typeof result).toBe("string");
      expect(result).toContain(":");
    });
  });

  describe("formatRelativeTime", () => {
    beforeEach(() => {
      // Mock system time for consistent testing
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-15T15:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should format seconds ago", () => {
      const date = new Date("2024-01-15T14:59:30Z"); // 30 seconds ago
      const result = formatRelativeTime(date);
      expect(result).toContain("second");
      expect(result).toContain("ago");
    });

    it("should handle singular second", () => {
      const date = new Date("2024-01-15T14:59:59Z"); // 1 second ago
      const result = formatRelativeTime(date);
      expect(result).toBe("1 second ago");
    });

    it("should format minutes ago", () => {
      const date = new Date("2024-01-15T14:55:00Z"); // 5 minutes ago
      const result = formatRelativeTime(date);
      expect(result).toContain("minute");
      expect(result).toContain("ago");
    });

    it("should handle singular minute", () => {
      const date = new Date("2024-01-15T14:59:00Z"); // 1 minute ago
      const result = formatRelativeTime(date);
      expect(result).toBe("1 minute ago");
    });

    it("should format hours ago", () => {
      const date = new Date("2024-01-15T12:00:00Z"); // 3 hours ago
      const result = formatRelativeTime(date);
      expect(result).toContain("hour");
      expect(result).toContain("ago");
    });

    it("should handle singular hour", () => {
      const date = new Date("2024-01-15T14:00:00Z"); // 1 hour ago
      const result = formatRelativeTime(date);
      expect(result).toBe("1 hour ago");
    });

    it("should format days ago", () => {
      const date = new Date("2024-01-13T15:00:00Z"); // 2 days ago
      const result = formatRelativeTime(date);
      expect(result).toContain("day");
      expect(result).toContain("ago");
    });

    it("should handle singular day", () => {
      const date = new Date("2024-01-14T15:00:00Z"); // 1 day ago
      const result = formatRelativeTime(date);
      expect(result).toBe("1 day ago");
    });

    it("should handle timestamp numbers", () => {
      const timestamp = new Date("2024-01-15T14:55:00Z").getTime();
      const result = formatRelativeTime(timestamp);
      expect(result).toContain("minute");
      expect(result).toContain("ago");
    });
  });

  describe("formatDuration", () => {
    it("should format seconds only", () => {
      expect(formatDuration(45)).toBe("45s");
    });

    it("should format minutes and seconds", () => {
      expect(formatDuration(125)).toBe("2m 5s");
    });

    it("should format hours, minutes, and seconds", () => {
      expect(formatDuration(3665)).toBe("1h 1m 5s");
    });

    it("should format hours and minutes (no seconds)", () => {
      expect(formatDuration(3600)).toBe("1h");
    });

    it("should format hours and seconds (no minutes)", () => {
      expect(formatDuration(3605)).toBe("1h 5s");
    });

    it("should handle zero seconds", () => {
      expect(formatDuration(0)).toBe("0s");
    });

    it("should handle large durations", () => {
      const result = formatDuration(86400); // 24 hours
      expect(result).toContain("24h");
    });

    it("should not include zero values", () => {
      const result = formatDuration(3600); // Exactly 1 hour
      expect(result).not.toContain("0m");
      expect(result).not.toContain("0s");
    });
  });

  describe("isWithinLastMinutes", () => {
    beforeEach(() => {
      // Mock system time for consistent testing
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-15T15:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return true for recent timestamps", () => {
      const date = new Date("2024-01-15T14:55:00Z"); // 5 minutes ago
      expect(isWithinLastMinutes(date, 10)).toBe(true);
    });

    it("should return false for old timestamps", () => {
      const date = new Date("2024-01-15T14:40:00Z"); // 20 minutes ago
      expect(isWithinLastMinutes(date, 10)).toBe(false);
    });

    it("should handle exact boundary", () => {
      const date = new Date("2024-01-15T14:50:00Z"); // Exactly 10 minutes ago
      expect(isWithinLastMinutes(date, 10)).toBe(true);
    });

    it("should handle timestamp numbers", () => {
      const timestamp = new Date("2024-01-15T14:55:00Z").getTime();
      expect(isWithinLastMinutes(timestamp, 10)).toBe(true);
    });

    it("should handle zero minutes", () => {
      const date = new Date("2024-01-15T15:00:00Z"); // Now
      expect(isWithinLastMinutes(date, 0)).toBe(true);
    });

    it("should handle future timestamps", () => {
      const date = new Date("2024-01-15T15:05:00Z"); // 5 minutes in future
      // Future timestamps have negative diff, which is <= minutes, so returns true
      // This is expected behavior - the function checks if within time window
      expect(isWithinLastMinutes(date, 10)).toBe(true);
    });
  });

  describe("unixToMs", () => {
    it("should convert Unix timestamp to milliseconds", () => {
      expect(unixToMs(1705329045)).toBe(1705329045000);
    });

    it("should handle zero", () => {
      expect(unixToMs(0)).toBe(0);
    });

    it("should handle large timestamps", () => {
      expect(unixToMs(2000000000)).toBe(2000000000000);
    });

    it("should multiply by 1000", () => {
      const unix = 1234567890;
      expect(unixToMs(unix)).toBe(unix * 1000);
    });
  });

  describe("msToUnix", () => {
    it("should convert milliseconds to Unix timestamp", () => {
      expect(msToUnix(1705329045000)).toBe(1705329045);
    });

    it("should handle zero", () => {
      expect(msToUnix(0)).toBe(0);
    });

    it("should handle large timestamps", () => {
      expect(msToUnix(2000000000000)).toBe(2000000000);
    });

    it("should divide by 1000 and floor", () => {
      expect(msToUnix(1234567890123)).toBe(1234567890);
    });

    it("should floor fractional seconds", () => {
      expect(msToUnix(1234567890999)).toBe(1234567890);
    });
  });

  describe("unixToMs and msToUnix round-trip", () => {
    it("should convert back and forth", () => {
      const unix = 1705329045;
      expect(msToUnix(unixToMs(unix))).toBe(unix);
    });

    it("should handle Date.now() conversions", () => {
      const ms = Date.now();
      const unix = msToUnix(ms);
      const backToMs = unixToMs(unix);
      // Allow 1 second tolerance due to flooring
      expect(Math.abs(backToMs - ms)).toBeLessThan(1000);
    });
  });
});
