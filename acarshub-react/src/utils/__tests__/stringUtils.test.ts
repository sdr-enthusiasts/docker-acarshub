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

import { describe, expect, it } from "vitest";
import {
  capitalize,
  ensureHexFormat,
  escapeHtml,
  escapeRegex,
  formatBytes,
  formatNumber,
  getInitials,
  highlightText,
  isBlank,
  normalizeWhitespace,
  pad,
  pluralize,
  randomString,
  removeWhitespace,
  slugify,
  stripHtml,
  titleCase,
  toCamelCase,
  toKebabCase,
  toPascalCase,
  truncate,
} from "../stringUtils";

describe("stringUtils", () => {
  describe("ensureHexFormat", () => {
    it("should convert hex to uppercase", () => {
      expect(ensureHexFormat("abc123")).toBe("ABC123");
    });

    it("should pad hex to 6 characters", () => {
      expect(ensureHexFormat("123")).toBe("000123");
      expect(ensureHexFormat("A")).toBe("00000A");
    });

    it("should handle already formatted hex", () => {
      expect(ensureHexFormat("ABCDEF")).toBe("ABCDEF");
    });

    it("should handle longer hex strings", () => {
      expect(ensureHexFormat("1234567")).toBe("1234567");
    });
  });

  describe("truncate", () => {
    it("should not truncate short strings", () => {
      expect(truncate("hello", 10)).toBe("hello");
    });

    it("should truncate long strings with ellipsis", () => {
      expect(truncate("hello world", 8)).toBe("hello...");
    });

    it("should handle exact length", () => {
      expect(truncate("hello", 5)).toBe("hello");
    });

    it("should handle empty strings", () => {
      expect(truncate("", 10)).toBe("");
    });
  });

  describe("capitalize", () => {
    it("should capitalize first letter", () => {
      expect(capitalize("hello")).toBe("Hello");
    });

    it("should lowercase remaining letters", () => {
      expect(capitalize("HELLO")).toBe("Hello");
      expect(capitalize("hELLO")).toBe("Hello");
    });

    it("should handle empty strings", () => {
      expect(capitalize("")).toBe("");
    });

    it("should handle single character", () => {
      expect(capitalize("a")).toBe("A");
    });
  });

  describe("titleCase", () => {
    it("should capitalize each word", () => {
      expect(titleCase("hello world")).toBe("Hello World");
    });

    it("should handle multiple spaces", () => {
      expect(titleCase("hello  world")).toBe("Hello  World");
    });

    it("should lowercase non-first letters", () => {
      expect(titleCase("HELLO WORLD")).toBe("Hello World");
    });
  });

  describe("escapeHtml", () => {
    it("should escape HTML special characters", () => {
      expect(escapeHtml("<script>alert('xss')</script>")).toContain("&lt;");
      expect(escapeHtml("<script>alert('xss')</script>")).toContain("&gt;");
    });

    it("should escape ampersands", () => {
      expect(escapeHtml("a & b")).toContain("&amp;");
    });

    it("should handle plain text", () => {
      expect(escapeHtml("hello world")).toBe("hello world");
    });
  });

  describe("stripHtml", () => {
    it("should remove HTML tags", () => {
      expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
    });

    it("should handle nested tags", () => {
      expect(stripHtml("<div><p><span>text</span></p></div>")).toBe("text");
    });

    it("should handle plain text", () => {
      expect(stripHtml("plain text")).toBe("plain text");
    });

    it("should handle empty strings", () => {
      expect(stripHtml("")).toBe("");
    });
  });

  describe("isBlank", () => {
    it("should return true for empty string", () => {
      expect(isBlank("")).toBe(true);
    });

    it("should return true for whitespace only", () => {
      expect(isBlank("   ")).toBe(true);
      expect(isBlank("\n\t")).toBe(true);
    });

    it("should return true for null", () => {
      expect(isBlank(null)).toBe(true);
    });

    it("should return true for undefined", () => {
      expect(isBlank(undefined)).toBe(true);
    });

    it("should return false for non-blank strings", () => {
      expect(isBlank("hello")).toBe(false);
      expect(isBlank(" a ")).toBe(false);
    });
  });

  describe("removeWhitespace", () => {
    it("should remove all whitespace", () => {
      expect(removeWhitespace("hello world")).toBe("helloworld");
    });

    it("should remove tabs and newlines", () => {
      expect(removeWhitespace("hello\n\tworld")).toBe("helloworld");
    });

    it("should handle strings without whitespace", () => {
      expect(removeWhitespace("hello")).toBe("hello");
    });
  });

  describe("normalizeWhitespace", () => {
    it("should replace multiple spaces with single space", () => {
      expect(normalizeWhitespace("hello    world")).toBe("hello world");
    });

    it("should trim leading and trailing whitespace", () => {
      expect(normalizeWhitespace("  hello world  ")).toBe("hello world");
    });

    it("should handle mixed whitespace", () => {
      expect(normalizeWhitespace("hello\n\t  world")).toBe("hello world");
    });
  });

  describe("toKebabCase", () => {
    it("should convert camelCase to kebab-case", () => {
      expect(toKebabCase("helloWorld")).toBe("hello-world");
    });

    it("should convert PascalCase to kebab-case", () => {
      expect(toKebabCase("HelloWorld")).toBe("hello-world");
    });

    it("should convert spaces to hyphens", () => {
      expect(toKebabCase("hello world")).toBe("hello-world");
    });

    it("should convert underscores to hyphens", () => {
      expect(toKebabCase("hello_world")).toBe("hello-world");
    });

    it("should lowercase everything", () => {
      expect(toKebabCase("HELLO WORLD")).toBe("hello-world");
    });
  });

  describe("toCamelCase", () => {
    it("should convert kebab-case to camelCase", () => {
      expect(toCamelCase("hello-world")).toBe("helloWorld");
    });

    it("should convert spaces to camelCase", () => {
      expect(toCamelCase("hello world")).toBe("helloWorld");
    });

    it("should convert underscores to camelCase", () => {
      expect(toCamelCase("hello_world")).toBe("helloWorld");
    });

    it("should handle PascalCase input", () => {
      expect(toCamelCase("HelloWorld")).toBe("helloWorld");
    });
  });

  describe("toPascalCase", () => {
    it("should convert kebab-case to PascalCase", () => {
      expect(toPascalCase("hello-world")).toBe("HelloWorld");
    });

    it("should convert camelCase to PascalCase", () => {
      expect(toPascalCase("helloWorld")).toBe("HelloWorld");
    });

    it("should convert spaces to PascalCase", () => {
      expect(toPascalCase("hello world")).toBe("HelloWorld");
    });
  });

  describe("pad", () => {
    it("should pad at end by default", () => {
      expect(pad("hello", 10)).toBe("hello     ");
    });

    it("should pad at start", () => {
      expect(pad("hello", 10, " ", "start")).toBe("     hello");
    });

    it("should use custom padding character", () => {
      expect(pad("hello", 10, "*")).toBe("hello*****");
    });

    it("should not pad if already long enough", () => {
      expect(pad("hello world", 5)).toBe("hello world");
    });
  });

  describe("highlightText", () => {
    it("should highlight matching terms", () => {
      const result = highlightText("hello world", "world");
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ text: "hello ", highlighted: false });
      expect(result[1]).toEqual({ text: "world", highlighted: true });
      expect(result[2]).toEqual({ text: "", highlighted: false });
    });

    it("should be case insensitive by default", () => {
      const result = highlightText("Hello WORLD", "world");
      expect(
        result.some((r) => r.highlighted && r.text.toLowerCase() === "world"),
      ).toBe(true);
    });

    it("should handle no matches", () => {
      const result = highlightText("hello world", "xyz");
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ text: "hello world", highlighted: false });
    });

    it("should handle empty search term", () => {
      const result = highlightText("hello world", "");
      expect(result).toEqual([{ text: "hello world", highlighted: false }]);
    });
  });

  describe("escapeRegex", () => {
    it("should escape special regex characters", () => {
      expect(escapeRegex("hello.world")).toBe("hello\\.world");
      expect(escapeRegex("test*")).toBe("test\\*");
      expect(escapeRegex("a+b")).toBe("a\\+b");
    });

    it("should escape brackets", () => {
      expect(escapeRegex("[test]")).toBe("\\[test\\]");
      expect(escapeRegex("(test)")).toBe("\\(test\\)");
    });

    it("should handle plain text", () => {
      expect(escapeRegex("hello")).toBe("hello");
    });
  });

  describe("formatNumber", () => {
    it("should format numbers with thousand separators", () => {
      const result = formatNumber(1234567);
      expect(result).toContain("1");
      expect(result).toContain("234");
      expect(result).toContain("567");
    });

    it("should handle small numbers", () => {
      expect(formatNumber(42)).toBe("42");
    });

    it("should handle zero", () => {
      expect(formatNumber(0)).toBe("0");
    });

    it("should handle negative numbers", () => {
      const result = formatNumber(-1234);
      expect(result).toContain("1");
      expect(result).toContain("234");
    });
  });

  describe("formatBytes", () => {
    it("should format zero bytes", () => {
      expect(formatBytes(0)).toBe("0 Bytes");
    });

    it("should format bytes", () => {
      expect(formatBytes(500)).toBe("500 Bytes");
    });

    it("should format kilobytes", () => {
      expect(formatBytes(1024)).toBe("1 KB");
    });

    it("should format megabytes", () => {
      expect(formatBytes(1048576)).toBe("1 MB");
    });

    it("should format gigabytes", () => {
      expect(formatBytes(1073741824)).toBe("1 GB");
    });

    it("should respect decimal places", () => {
      expect(formatBytes(1536, 1)).toBe("1.5 KB");
      expect(formatBytes(1536, 0)).toBe("2 KB");
    });
  });

  describe("randomString", () => {
    it("should generate string of specified length", () => {
      expect(randomString(10)).toHaveLength(10);
      expect(randomString(20)).toHaveLength(20);
    });

    it("should use alphanumeric characters by default", () => {
      const result = randomString(100);
      expect(/^[A-Za-z0-9]+$/.test(result)).toBe(true);
    });

    it("should use custom charset", () => {
      const result = randomString(10, "abc");
      expect(/^[abc]+$/.test(result)).toBe(true);
    });

    it("should generate different strings", () => {
      const str1 = randomString(20);
      const str2 = randomString(20);
      expect(str1).not.toBe(str2);
    });
  });

  describe("slugify", () => {
    it("should create URL-safe slug", () => {
      expect(slugify("Hello World")).toBe("hello-world");
    });

    it("should remove special characters", () => {
      expect(slugify("Hello! World?")).toBe("hello-world");
    });

    it("should replace spaces with hyphens", () => {
      expect(slugify("hello   world")).toBe("hello-world");
    });

    it("should trim hyphens", () => {
      expect(slugify("-hello-world-")).toBe("hello-world");
    });

    it("should handle underscores", () => {
      expect(slugify("hello_world")).toBe("hello-world");
    });
  });

  describe("pluralize", () => {
    it("should return singular for count of 1", () => {
      expect(pluralize(1, "item")).toBe("item");
    });

    it("should return plural for count of 0", () => {
      expect(pluralize(0, "item")).toBe("items");
    });

    it("should return plural for count > 1", () => {
      expect(pluralize(2, "item")).toBe("items");
      expect(pluralize(100, "item")).toBe("items");
    });

    it("should use custom plural form", () => {
      expect(pluralize(2, "child", "children")).toBe("children");
      expect(pluralize(1, "child", "children")).toBe("child");
    });

    it("should handle irregular plurals", () => {
      expect(pluralize(2, "person", "people")).toBe("people");
      expect(pluralize(0, "mouse", "mice")).toBe("mice");
    });
  });

  describe("getInitials", () => {
    it("should extract initials from full name", () => {
      expect(getInitials("John Doe")).toBe("JD");
    });

    it("should handle single name", () => {
      expect(getInitials("John")).toBe("J");
    });

    it("should handle three names", () => {
      expect(getInitials("John Paul Jones")).toBe("JP");
    });

    it("should respect maxInitials parameter", () => {
      expect(getInitials("John Paul Jones", 3)).toBe("JPJ");
      expect(getInitials("John Paul Jones", 1)).toBe("J");
    });

    it("should uppercase initials", () => {
      expect(getInitials("john doe")).toBe("JD");
    });

    it("should handle extra whitespace", () => {
      expect(getInitials("John   Doe")).toBe("JD");
    });
  });
});
