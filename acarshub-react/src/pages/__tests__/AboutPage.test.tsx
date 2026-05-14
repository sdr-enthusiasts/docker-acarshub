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
import { socketService } from "../../services/socket";
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

  describe("page-mount side effects", () => {
    // The page-mount effect drives two things outside the component:
    //   1. Marks the current page in the global app store (used by
    //      the keyboard-shortcut layer to decide whether 'p' should
    //      pause live updates — Live Messages / Live Map only).
    //   2. Notifies the backend via socket so server-side
    //      page-change-aware handlers (currently just analytics-ish
    //      logging) know which page is active.
    // A regression that passes a wrong page string here would silently
    // break the 'p' shortcut elsewhere or send misleading telemetry.

    it("marks the current page as 'About' in the store on mount", () => {
      render(<AboutPage />);
      expect(useAppStore.getState().currentPage).toBe("About");
    });

    it("notifies the backend of the page change exactly once on mount", () => {
      render(<AboutPage />);
      expect(socketService.notifyPageChange).toHaveBeenCalledTimes(1);
      expect(socketService.notifyPageChange).toHaveBeenCalledWith("About");
    });
  });

  describe("version information card", () => {
    // The Version Information card is gated on `version !== null`.
    // The whole card (and the only mention of container/github version
    // numbers in this page) appears only after the backend has sent
    // version metadata. Pinning the gate prevents a regression that
    // renders the card with literal "undefined" version strings
    // before the version event has arrived.

    it("does NOT render the Version Information card when version is null", () => {
      useAppStore.setState({ version: null });
      const { container } = render(<AboutPage />);
      expect(container.textContent).not.toContain("Version Information");
      expect(container.textContent).not.toContain("Container Version:");
    });

    it("renders the container and github versions when version is set", () => {
      setVersion({
        container_version: "2.3.4",
        backend_version: "2.3.4",
        frontend_version: "2.3.4",
        github_version: "2.3.5",
        is_outdated: true,
      });
      const { container } = render(<AboutPage />);
      expect(container.textContent).toContain("Version Information");
      expect(container.textContent).toContain("2.3.4");
      expect(container.textContent).toContain("2.3.5");
    });
  });

  describe("external link safety", () => {
    // Every `target="_blank"` link MUST carry `rel="noopener noreferrer"`.
    //
    // Why: a popup that opens in a new tab inherits a `window.opener`
    // reference back to our page. Without `rel="noopener"` a malicious
    // (or compromised) destination can call `window.opener.location =
    // '<phishing url>'` to silently redirect the original tab — a
    // classic reverse-tabnabbing attack. `noreferrer` additionally
    // strips the Referer header.
    //
    // The lint rule that catches this can be silenced or removed by a
    // refactor; pinning the runtime contract here gives us a second
    // layer of defense that survives such a refactor.

    it("every external link uses rel='noopener noreferrer'", () => {
      const { container } = render(<AboutPage />);
      const externalLinks = container.querySelectorAll('a[target="_blank"]');
      expect(externalLinks.length).toBeGreaterThan(0);
      for (const link of externalLinks) {
        const rel = link.getAttribute("rel") ?? "";
        expect(rel).toContain("noopener");
        expect(rel).toContain("noreferrer");
      }
    });
  });
});
