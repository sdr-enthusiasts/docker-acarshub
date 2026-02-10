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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAbsoluteUrl, resolveBasePath, resolvePathOrUrl } from "../pathUtils";

describe("pathUtils", () => {
  // Store original BASE_URL
  const originalBaseUrl = import.meta.env.BASE_URL;

  beforeEach(() => {
    // Reset to original after each test
    vi.stubEnv("BASE_URL", originalBaseUrl);
  });

  describe("resolveBasePath", () => {
    describe("with BASE_URL = './' (production/Docker)", () => {
      beforeEach(() => {
        vi.stubEnv("BASE_URL", "./");
      });

      it("should resolve absolute path with leading slash", () => {
        expect(resolveBasePath("/geojson/file.geojson")).toBe(
          "./geojson/file.geojson",
        );
      });

      it("should resolve relative path without leading slash", () => {
        expect(resolveBasePath("geojson/file.geojson")).toBe(
          "./geojson/file.geojson",
        );
      });

      it("should handle nested paths", () => {
        expect(resolveBasePath("/geojson/IFT/IFT_NAV_Routes.geojson")).toBe(
          "./geojson/IFT/IFT_NAV_Routes.geojson",
        );
      });

      it("should handle paths with special characters", () => {
        expect(resolveBasePath("/geojson/uk_advisory/airports.geojson")).toBe(
          "./geojson/uk_advisory/airports.geojson",
        );
      });
    });

    describe("with BASE_URL = '/acarshub-test/' (subpath deployment)", () => {
      beforeEach(() => {
        vi.stubEnv("BASE_URL", "/acarshub-test/");
      });

      it("should resolve absolute path with leading slash", () => {
        expect(resolveBasePath("/geojson/file.geojson")).toBe(
          "/acarshub-test/geojson/file.geojson",
        );
      });

      it("should resolve relative path without leading slash", () => {
        expect(resolveBasePath("geojson/file.geojson")).toBe(
          "/acarshub-test/geojson/file.geojson",
        );
      });

      it("should handle nested paths", () => {
        expect(resolveBasePath("/geojson/IFT/IFT_NAV_Routes.geojson")).toBe(
          "/acarshub-test/geojson/IFT/IFT_NAV_Routes.geojson",
        );
      });

      it("should not create double slashes", () => {
        expect(resolveBasePath("/geojson/file.geojson")).not.toContain("//");
        expect(resolveBasePath("geojson/file.geojson")).not.toContain("//");
      });
    });

    describe("with BASE_URL = '/' (development/root)", () => {
      beforeEach(() => {
        vi.stubEnv("BASE_URL", "/");
      });

      it("should resolve absolute path with leading slash", () => {
        expect(resolveBasePath("/geojson/file.geojson")).toBe(
          "/geojson/file.geojson",
        );
      });

      it("should resolve relative path without leading slash", () => {
        expect(resolveBasePath("geojson/file.geojson")).toBe(
          "/geojson/file.geojson",
        );
      });

      it("should handle nested paths", () => {
        expect(resolveBasePath("/geojson/IFT/IFT_NAV_Routes.geojson")).toBe(
          "/geojson/IFT/IFT_NAV_Routes.geojson",
        );
      });
    });

    describe("with BASE_URL without trailing slash", () => {
      beforeEach(() => {
        vi.stubEnv("BASE_URL", "/acarshub-test");
      });

      it("should add slash between base and path", () => {
        expect(resolveBasePath("/geojson/file.geojson")).toBe(
          "/acarshub-test/geojson/file.geojson",
        );
      });

      it("should not create double slashes", () => {
        expect(resolveBasePath("/geojson/file.geojson")).not.toMatch(/\/\//);
      });
    });

    describe("edge cases", () => {
      beforeEach(() => {
        vi.stubEnv("BASE_URL", "./");
      });

      it("should handle empty path", () => {
        expect(resolveBasePath("")).toBe("./");
      });

      it("should handle root path", () => {
        expect(resolveBasePath("/")).toBe("./");
      });

      it("should preserve query strings", () => {
        expect(resolveBasePath("/geojson/file.geojson?v=1")).toBe(
          "./geojson/file.geojson?v=1",
        );
      });

      it("should preserve hash fragments", () => {
        expect(resolveBasePath("/geojson/file.geojson#section")).toBe(
          "./geojson/file.geojson#section",
        );
      });
    });

    describe("double slash normalization", () => {
      beforeEach(() => {
        vi.stubEnv("BASE_URL", "/");
      });

      it("should remove double slashes in path", () => {
        expect(resolveBasePath("//geojson//file.geojson")).toBe(
          "/geojson/file.geojson",
        );
      });

      it("should not affect protocol double slashes", () => {
        // This test verifies the regex doesn't break if somehow an absolute URL
        // is passed (though resolvePathOrUrl should be used for that)
        const path = "http://example.com/file.geojson";
        expect(resolveBasePath(path)).toContain("http://");
      });
    });
  });

  describe("isAbsoluteUrl", () => {
    it("should detect http URLs", () => {
      expect(isAbsoluteUrl("http://example.com")).toBe(true);
      expect(isAbsoluteUrl("http://example.com/path")).toBe(true);
    });

    it("should detect https URLs", () => {
      expect(isAbsoluteUrl("https://example.com")).toBe(true);
      expect(isAbsoluteUrl("https://example.com/path")).toBe(true);
    });

    it("should detect protocol-relative URLs", () => {
      expect(isAbsoluteUrl("//example.com")).toBe(true);
      expect(isAbsoluteUrl("//example.com/path")).toBe(true);
    });

    it("should detect other protocols", () => {
      expect(isAbsoluteUrl("ftp://example.com")).toBe(true);
      expect(isAbsoluteUrl("ws://example.com")).toBe(true);
      expect(isAbsoluteUrl("wss://example.com")).toBe(true);
    });

    it("should reject absolute paths", () => {
      expect(isAbsoluteUrl("/path/to/file")).toBe(false);
      expect(isAbsoluteUrl("/")).toBe(false);
    });

    it("should reject relative paths", () => {
      expect(isAbsoluteUrl("path/to/file")).toBe(false);
      expect(isAbsoluteUrl("./path/to/file")).toBe(false);
      expect(isAbsoluteUrl("../path/to/file")).toBe(false);
    });

    it("should reject empty string", () => {
      expect(isAbsoluteUrl("")).toBe(false);
    });
  });

  describe("resolvePathOrUrl", () => {
    beforeEach(() => {
      vi.stubEnv("BASE_URL", "/acarshub-test/");
    });

    describe("with relative paths", () => {
      it("should resolve absolute paths", () => {
        expect(resolvePathOrUrl("/geojson/file.geojson")).toBe(
          "/acarshub-test/geojson/file.geojson",
        );
      });

      it("should resolve relative paths", () => {
        expect(resolvePathOrUrl("geojson/file.geojson")).toBe(
          "/acarshub-test/geojson/file.geojson",
        );
      });
    });

    describe("with absolute URLs", () => {
      it("should not modify http URLs", () => {
        const url = "http://example.com/data.json";
        expect(resolvePathOrUrl(url)).toBe(url);
      });

      it("should not modify https URLs", () => {
        const url = "https://example.com/data.json";
        expect(resolvePathOrUrl(url)).toBe(url);
      });

      it("should not modify protocol-relative URLs", () => {
        const url = "//example.com/data.json";
        expect(resolvePathOrUrl(url)).toBe(url);
      });

      it("should not modify other protocol URLs", () => {
        const url = "ftp://example.com/data.json";
        expect(resolvePathOrUrl(url)).toBe(url);
      });
    });

    describe("real-world GeoJSON examples", () => {
      it("should resolve US ARTCC boundaries path", () => {
        expect(resolvePathOrUrl("/geojson/US_ARTCC_boundaries.geojson")).toBe(
          "/acarshub-test/geojson/US_ARTCC_boundaries.geojson",
        );
      });

      it("should resolve IFT NAV routes path", () => {
        expect(resolvePathOrUrl("/geojson/IFT/IFT_NAV_Routes.geojson")).toBe(
          "/acarshub-test/geojson/IFT/IFT_NAV_Routes.geojson",
        );
      });

      it("should resolve UK Mil RC path", () => {
        expect(resolvePathOrUrl("/geojson/UK_Mil_RC.geojson")).toBe(
          "/acarshub-test/geojson/UK_Mil_RC.geojson",
        );
      });

      it("should not modify external GeoJSON URL", () => {
        const url = "https://cdn.example.com/geojson/boundaries.geojson";
        expect(resolvePathOrUrl(url)).toBe(url);
      });
    });
  });

  describe("integration scenarios", () => {
    it("should handle production deployment (BASE_URL = './')", () => {
      vi.stubEnv("BASE_URL", "./");
      expect(resolvePathOrUrl("/geojson/US_ARTCC_boundaries.geojson")).toBe(
        "./geojson/US_ARTCC_boundaries.geojson",
      );
    });

    it("should handle subpath deployment (BASE_URL = '/acarshub-test/')", () => {
      vi.stubEnv("BASE_URL", "/acarshub-test/");
      expect(resolvePathOrUrl("/geojson/US_ARTCC_boundaries.geojson")).toBe(
        "/acarshub-test/geojson/US_ARTCC_boundaries.geojson",
      );
    });

    it("should handle root deployment (BASE_URL = '/')", () => {
      vi.stubEnv("BASE_URL", "/");
      expect(resolvePathOrUrl("/geojson/US_ARTCC_boundaries.geojson")).toBe(
        "/geojson/US_ARTCC_boundaries.geojson",
      );
    });

    it("should handle external URLs in all deployment modes", () => {
      const url = "https://example.com/geojson/data.geojson";

      vi.stubEnv("BASE_URL", "./");
      expect(resolvePathOrUrl(url)).toBe(url);

      vi.stubEnv("BASE_URL", "/acarshub-test/");
      expect(resolvePathOrUrl(url)).toBe(url);

      vi.stubEnv("BASE_URL", "/");
      expect(resolvePathOrUrl(url)).toBe(url);
    });
  });
});
