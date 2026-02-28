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
 * Unit tests for MigrationStatus component
 *
 * Tests:
 *   - renders nothing when migrationInProgress is false
 *   - renders the banner when migrationInProgress is true
 *   - banner has correct ARIA role and label
 *   - banner contains expected text content
 *   - spinner element is present when banner is shown
 *   - banner disappears when migrationInProgress transitions false → true → false
 */

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../../store/useAppStore";
import { MigrationStatus } from "../MigrationStatus";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set migrationInProgress directly in the Zustand store */
function setMigrationInProgress(value: boolean): void {
  useAppStore.setState({ migrationInProgress: value });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Start every test with migration NOT in progress
  setMigrationInProgress(false);
});

afterEach(() => {
  setMigrationInProgress(false);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MigrationStatus", () => {
  describe("when migrationInProgress is false", () => {
    it("renders nothing", () => {
      const { container } = render(<MigrationStatus />);
      expect(container.firstChild).toBeNull();
    });

    it("does not render the banner element", () => {
      render(<MigrationStatus />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  describe("when migrationInProgress is true", () => {
    beforeEach(() => {
      setMigrationInProgress(true);
    });

    it("renders the migration banner", () => {
      render(<MigrationStatus />);
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("has the correct aria-label", () => {
      render(<MigrationStatus />);
      expect(
        screen.getByRole("status", {
          name: /database migration in progress/i,
        }),
      ).toBeInTheDocument();
    });

    it("has aria-live set to polite", () => {
      render(<MigrationStatus />);
      const banner = screen.getByRole("status");
      expect(banner).toHaveAttribute("aria-live", "polite");
    });

    it("displays the title text", () => {
      render(<MigrationStatus />);
      expect(
        screen.getByText(/database migration in progress/i),
      ).toBeInTheDocument();
    });

    it("displays detail text mentioning the wait", () => {
      render(<MigrationStatus />);
      expect(screen.getByText(/one-time operation/i)).toBeInTheDocument();
    });

    it("renders the spinner element", () => {
      render(<MigrationStatus />);
      const banner = screen.getByRole("status");
      const spinner = banner.querySelector(".migration-status__spinner");
      expect(spinner).toBeInTheDocument();
    });

    it("spinner has aria-hidden to keep it decorative", () => {
      render(<MigrationStatus />);
      const banner = screen.getByRole("status");
      const spinner = banner.querySelector(".migration-status__spinner");
      expect(spinner).toHaveAttribute("aria-hidden", "true");
    });

    it("applies the migration-status class to the root element", () => {
      render(<MigrationStatus />);
      const banner = screen.getByRole("status");
      expect(banner).toHaveClass("migration-status");
    });
  });

  describe("reactive behavior", () => {
    it("shows banner when migrationInProgress transitions from false to true", () => {
      render(<MigrationStatus />);

      // Initially hidden
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      // Trigger migration — wrap in act() so React flushes the re-render
      act(() => {
        setMigrationInProgress(true);
      });

      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("hides banner when migrationInProgress transitions from true to false", () => {
      setMigrationInProgress(true);
      render(<MigrationStatus />);

      // Banner visible
      expect(screen.getByRole("status")).toBeInTheDocument();

      // Migration finishes — wrap in act() so React flushes the re-render
      act(() => {
        setMigrationInProgress(false);
      });

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("regression: does not re-render banner after migration clears", () => {
      setMigrationInProgress(true);
      render(<MigrationStatus />);

      act(() => {
        setMigrationInProgress(false);
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      // Ensure it stays hidden — no flicker
      act(() => {
        setMigrationInProgress(false);
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
