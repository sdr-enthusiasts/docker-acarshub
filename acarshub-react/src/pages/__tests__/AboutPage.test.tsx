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

import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../store/useAppStore";
import { AboutPage } from "../AboutPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../services/socket", () => ({
  socketService: {
    notifyPageChange: vi.fn(),
  },
}));

// Image asset import in AboutPage.tsx; vitest needs a stub so the module
// resolves under jsdom (it never renders the <img src> meaningfully here).
vi.mock("../../assets/images/safari.png", () => ({ default: "safari.png" }));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function setVersion(version: {
  container_version: string;
  backend_version: string;
  frontend_version: string;
  github_version: string;
  is_outdated: boolean;
}): void {
  useAppStore.setState({ version });
}

describe("AboutPage", () => {
  beforeEach(() => {
    // Reset version each test; setCurrentPage side-effect lives on the store
    // and doesn't matter for these assertions.
    useAppStore.setState({ version: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("NIT-02 regression: warning emoji a11y", () => {
    // The "newer version available" banner used to render a bare `⚠️`
    // glyph in the text node. Screen readers announce that as
    // "warning warning", once for the emoji and once for the word
    // "warning" later in the sentence. The fix wraps the emoji in a
    // <span aria-hidden="true"> so assistive technology ignores it
    // and relies on the readable text instead.
    it("hides the ⚠️ glyph from assistive technology when an update is available", () => {
      setVersion({
        container_version: "1.0.0",
        backend_version: "1.0.0",
        frontend_version: "1.0.0",
        github_version: "1.1.0",
        is_outdated: true,
      });

      const { container } = render(<AboutPage />);

      // Find the span that wraps the warning emoji. It must:
      //   1. exist (i.e. the emoji is no longer a bare text node)
      //   2. carry aria-hidden="true"
      const ariaHiddenSpans = container.querySelectorAll(
        'span[aria-hidden="true"]',
      );
      const warningSpan = Array.from(ariaHiddenSpans).find((node) =>
        node.textContent?.includes("⚠"),
      );

      expect(warningSpan).toBeDefined();
      expect(warningSpan?.getAttribute("aria-hidden")).toBe("true");
    });

    it("does not render the warning banner when no update is available", () => {
      setVersion({
        container_version: "1.0.0",
        backend_version: "1.0.0",
        frontend_version: "1.0.0",
        github_version: "1.0.0",
        is_outdated: false,
      });

      const { container } = render(<AboutPage />);

      // Sanity check: no warning emoji anywhere when not outdated.
      expect(container.textContent).not.toContain("⚠");
    });
  });
});
