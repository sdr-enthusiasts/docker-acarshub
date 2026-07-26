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

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToastStore } from "../../store/useToastStore";
import { logBuffer } from "../../utils/logger";
import { LogsViewer } from "../LogsViewer";

describe("LogsViewer", () => {
  beforeEach(() => {
    useToastStore.getState().clearAllToasts();
    // Full isolation for every test in this file: LogsViewer reads from the
    // real (singleton) logBuffer, which persists across tests unless reset.
    logBuffer.clear();
    // BUG-SETTINGS-SCROLL: LogsViewer used to call scrollIntoView on a
    // sentinel element, which jsdom does not implement and which had the
    // side-effect of scrolling every ancestor (including the Settings
    // modal). The fix sets scrollTop on the viewer's own scroll container
    // — jsdom supports that natively, so no mock is required. The mock
    // below is kept as a safety net in case any unrelated callsite still
    // invokes scrollIntoView during these tests.
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Replace `navigator.clipboard.writeText` with a vitest mock.  Must be
   * called AFTER `userEvent.setup()` because user-event v14 installs its
   * own clipboard implementation during setup that would otherwise stomp
   * on this assignment.
   */
  function mockClipboardAfterSetup(): ReturnType<typeof vi.fn> {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    return writeText;
  }

  describe("copy-to-clipboard (LOG-04 regression)", () => {
    it("regression: pushes a success toast when clipboard write succeeds — replaces the legacy alert() call", async () => {
      // The pre-LOG-04 implementation called `window.alert(...)` here, which
      // blocks the UI thread and is untestable in jsdom.  The fix routes
      // success feedback through useToastStore so it is observable, themable,
      // and accessible (role=status, aria-live=polite).
      const user = userEvent.setup();
      const writeText = mockClipboardAfterSetup();
      writeText.mockResolvedValue(undefined);
      render(<LogsViewer showStats={false} />);

      await user.click(screen.getByRole("button", { name: /^copy$/i }));

      await waitFor(() => {
        const { toasts } = useToastStore.getState();
        expect(toasts).toHaveLength(1);
        expect(toasts[0].variant).toBe("success");
        expect(toasts[0].message).toMatch(/copied/i);
      });

      expect(writeText).toHaveBeenCalledOnce();
    });

    it("regression: pushes an error toast when clipboard write rejects — replaces the legacy alert() call", async () => {
      // Same fix path on the failure side: previously a blocking alert(),
      // now an observable, accessible toast (role=alert, aria-live=assertive).
      const user = userEvent.setup();
      const writeText = mockClipboardAfterSetup();
      writeText.mockRejectedValue(new Error("clipboard denied"));
      render(<LogsViewer showStats={false} />);

      await user.click(screen.getByRole("button", { name: /^copy$/i }));

      await waitFor(() => {
        const { toasts } = useToastStore.getState();
        expect(toasts).toHaveLength(1);
        expect(toasts[0].variant).toBe("error");
        expect(toasts[0].message).toMatch(/failed.*copy/i);
      });
    });

    it("does not call window.alert on success or failure", async () => {
      // Strong negative assertion: the alert() escape hatch is gone.  Spy on
      // window.alert and verify it is never invoked, regardless of clipboard
      // outcome.  Run both branches in the same test for tight coupling.
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

      const user = userEvent.setup();
      const writeText = mockClipboardAfterSetup();

      writeText.mockResolvedValueOnce(undefined);
      const { unmount } = render(<LogsViewer showStats={false} />);
      await user.click(screen.getByRole("button", { name: /^copy$/i }));
      await waitFor(() =>
        expect(useToastStore.getState().toasts).toHaveLength(1),
      );
      unmount();

      useToastStore.getState().clearAllToasts();
      writeText.mockRejectedValueOnce(new Error("denied"));
      render(<LogsViewer showStats={false} />);
      await user.click(screen.getByRole("button", { name: /^copy$/i }));
      await waitFor(() =>
        expect(useToastStore.getState().toasts).toHaveLength(1),
      );

      expect(alertSpy).not.toHaveBeenCalled();
    });

    it("logs a stringified error when the clipboard rejects with a non-Error value", async () => {
      // Covers the `err instanceof Error ? err.message : String(err)` branch
      // that a plain-Error rejection (tested above) does not exercise.
      const user = userEvent.setup();
      const writeText = mockClipboardAfterSetup();
      writeText.mockRejectedValue("plain string rejection");
      render(<LogsViewer showStats={false} />);

      await user.click(screen.getByRole("button", { name: /^copy$/i }));

      await waitFor(() => {
        const { toasts } = useToastStore.getState();
        expect(toasts).toHaveLength(1);
        expect(toasts[0].variant).toBe("error");
      });
    });
  });

  describe("auto-scroll scoping (BUG-SETTINGS-SCROLL regression)", () => {
    // The pre-fix implementation called
    //   logsEndRef.current.scrollIntoView({ behavior: "smooth" })
    // which scrolls every scrolling ancestor of the sentinel. Embedded in
    // the Settings modal, that scrolled the modal itself to its bottom,
    // hiding the settings controls above the log panel. The fix sets
    // scrollTop on the LogsViewer's own scroll container so the scroll is
    // scoped to this component and ancestors are left alone. It also
    // corrects the effect dep array — previously [autoScroll], so the
    // effect only fired when the toggle flipped — to also include `logs`
    // so new entries actually trigger the scroll.

    it("regression: does not call scrollIntoView (which scrolls all ancestors) when new logs arrive", () => {
      // If the legacy scrollIntoView path returns, this spy records the
      // call. The fix must therefore never touch scrollIntoView.
      const spy = vi.spyOn(Element.prototype, "scrollIntoView");

      logBuffer.clear();
      render(<LogsViewer showStats={false} />);

      act(() => {
        logBuffer.add({
          level: "info",
          message: ["test entry"],
          timestamp: new Date().toISOString(),
        });
      });

      expect(spy).not.toHaveBeenCalled();
    });

    it("regression: auto-scroll only sets scrollTop on the log viewer's own scroll container", () => {
      // Mount a wrapping scroll container to simulate the Settings modal.
      // Assert that adding a new log does NOT alter the wrapper's
      // scrollTop — only the inner viewer scrolls.
      logBuffer.clear();
      const { container } = render(
        <div data-testid="modal-scroll-wrapper">
          <LogsViewer showStats={false} />
        </div>,
      );

      const wrapper = screen.getByTestId("modal-scroll-wrapper") as HTMLElement;
      // Force the wrapper into a known scroll state.
      Object.defineProperty(wrapper, "scrollHeight", {
        configurable: true,
        value: 1000,
      });
      wrapper.scrollTop = 0;

      const viewer = container.querySelector(
        ".logs-viewer-display",
      ) as HTMLElement;
      expect(viewer).toBeTruthy();
      // Stub a scrollHeight the auto-scroll effect can read.
      Object.defineProperty(viewer, "scrollHeight", {
        configurable: true,
        value: 500,
      });
      viewer.scrollTop = 0;

      act(() => {
        logBuffer.add({
          level: "info",
          message: ["new entry"],
          timestamp: new Date().toISOString(),
        });
      });

      // The wrapper (stand-in for the modal) must NOT have been scrolled.
      expect(wrapper.scrollTop).toBe(0);
      // The viewer itself should have scrolled to the bottom.
      expect(viewer.scrollTop).toBe(500);
    });

    it("regression: new log entries trigger auto-scroll (previously the effect dep was [autoScroll] only)", () => {
      logBuffer.clear();
      const { container } = render(<LogsViewer showStats={false} />);

      const viewer = container.querySelector(
        ".logs-viewer-display",
      ) as HTMLElement;
      Object.defineProperty(viewer, "scrollHeight", {
        configurable: true,
        value: 250,
      });
      viewer.scrollTop = 0;

      act(() => {
        logBuffer.add({
          level: "warn",
          message: ["first"],
          timestamp: new Date().toISOString(),
        });
      });

      // The effect must have re-run on the new log entry and set scrollTop
      // to scrollHeight. Pre-fix, this stayed at 0.
      expect(viewer.scrollTop).toBe(250);
    });

    it("does not auto-scroll when the toggle is unchecked before a new log arrives", async () => {
      const user = userEvent.setup();
      const { container } = render(<LogsViewer showStats={false} />);

      await user.click(screen.getByRole("checkbox", { name: /auto-scroll/i }));
      expect(
        screen.getByRole("checkbox", { name: /auto-scroll/i }),
      ).not.toBeChecked();

      const viewer = container.querySelector(
        ".logs-viewer-display",
      ) as HTMLElement;
      Object.defineProperty(viewer, "scrollHeight", {
        configurable: true,
        value: 500,
      });
      viewer.scrollTop = 0;

      act(() => {
        logBuffer.add({
          level: "info",
          message: ["should not scroll"],
          timestamp: new Date().toISOString(),
        });
      });

      expect(viewer.scrollTop).toBe(0);
    });
  });

  describe("NIT-10: rendering states", () => {
    it("shows 'No logs yet' when the buffer is empty", () => {
      render(<LogsViewer showStats={false} />);
      expect(screen.getByText("No logs yet")).toBeInTheDocument();
    });

    it("shows 'No logs match current filters' when logs exist but none match", async () => {
      const user = userEvent.setup();
      logBuffer.add({
        level: "info",
        message: ["hello world"],
        timestamp: new Date().toISOString(),
      });
      render(<LogsViewer showStats={false} />);

      await user.type(
        screen.getByLabelText(/search/i),
        "no-such-term-anywhere",
      );

      expect(
        screen.getByText("No logs match current filters"),
      ).toBeInTheDocument();
    });

    it("renders timestamp, level, and message for a log entry", () => {
      logBuffer.add({
        level: "info",
        message: ["hello", "world"],
        timestamp: new Date().toISOString(),
      });
      const { container } = render(<LogsViewer showStats={false} />);

      const entry = container.querySelector(".log-entry--info");
      expect(entry).toBeTruthy();
      expect(entry?.querySelector(".log-entry__level")?.textContent).toBe(
        "INFO",
      );
      expect(entry?.querySelector(".log-entry__message")?.textContent).toBe(
        "hello world",
      );
      expect(
        entry?.querySelector(".log-entry__timestamp")?.textContent,
      ).toBeTruthy();
    });

    it("renders the module bracket when a module is present, and omits it otherwise", () => {
      logBuffer.add({
        level: "warn",
        message: ["with module"],
        timestamp: new Date().toISOString(),
        module: "test-module",
      });
      logBuffer.add({
        level: "warn",
        message: ["without module"],
        timestamp: new Date().toISOString(),
      });
      const { container } = render(<LogsViewer showStats={false} />);

      const entries = container.querySelectorAll(".log-entry");
      expect(entries).toHaveLength(2);
      expect(entries[0].querySelector(".log-entry__module")?.textContent).toBe(
        "[test-module]",
      );
      expect(entries[1].querySelector(".log-entry__module")).toBeNull();
    });

    it("renders a stack trace when present, and omits it otherwise", () => {
      logBuffer.add({
        level: "error",
        message: ["boom"],
        timestamp: new Date().toISOString(),
        stack: "Error: boom\n  at foo (bar.ts:1:1)",
      });
      logBuffer.add({
        level: "error",
        message: ["no stack"],
        timestamp: new Date().toISOString(),
      });
      const { container } = render(<LogsViewer showStats={false} />);

      const entries = container.querySelectorAll(".log-entry");
      expect(entries[0].querySelector(".log-entry__stack")?.textContent).toBe(
        "Error: boom\n  at foo (bar.ts:1:1)",
      );
      expect(entries[1].querySelector(".log-entry__stack")).toBeNull();
    });
  });

  describe("NIT-10: level filtering", () => {
    beforeEach(() => {
      logBuffer.add({
        level: "error",
        message: ["error entry"],
        timestamp: new Date().toISOString(),
      });
      logBuffer.add({
        level: "warn",
        message: ["warn entry"],
        timestamp: new Date().toISOString(),
      });
      logBuffer.add({
        level: "info",
        message: ["info entry"],
        timestamp: new Date().toISOString(),
      });
      logBuffer.add({
        level: "debug",
        message: ["debug entry"],
        timestamp: new Date().toISOString(),
      });
      logBuffer.add({
        level: "trace",
        message: ["trace entry"],
        timestamp: new Date().toISOString(),
      });
    });

    it("defaults to 'all' and shows every level", () => {
      const { container } = render(<LogsViewer showStats={false} />);
      expect(screen.getByLabelText(/level/i)).toHaveValue("all");
      expect(container.querySelectorAll(".log-entry")).toHaveLength(5);
    });

    it.each([
      ["error", 1],
      ["warn", 1],
      ["info", 1],
      ["debug", 1],
      ["trace", 1],
    ] as const)(
      "filtering by '%s' shows only that level's entries",
      async (level, expectedCount) => {
        const user = userEvent.setup();
        const { container } = render(<LogsViewer showStats={false} />);

        await user.selectOptions(screen.getByLabelText(/level/i), level);

        const entries = container.querySelectorAll(".log-entry");
        expect(entries).toHaveLength(expectedCount);
        expect(entries[0].classList.contains(`log-entry--${level}`)).toBe(true);
      },
    );

    it("switching back to 'all' restores every entry", async () => {
      const user = userEvent.setup();
      const { container } = render(<LogsViewer showStats={false} />);

      const select = screen.getByLabelText(/level/i);
      await user.selectOptions(select, "error");
      expect(container.querySelectorAll(".log-entry")).toHaveLength(1);

      await user.selectOptions(select, "all");
      expect(container.querySelectorAll(".log-entry")).toHaveLength(5);
    });
  });

  describe("NIT-10: search filtering", () => {
    beforeEach(() => {
      logBuffer.add({
        level: "info",
        message: ["decoder connected"],
        timestamp: new Date().toISOString(),
        module: "tcp-listener",
      });
      logBuffer.add({
        level: "error",
        message: ["parse failure"],
        timestamp: new Date().toISOString(),
        module: "formatters",
      });
    });

    it("filters by a substring of the message text, case-insensitively", async () => {
      const user = userEvent.setup();
      const { container } = render(<LogsViewer showStats={false} />);

      await user.type(screen.getByLabelText(/search/i), "DECODER");

      const entries = container.querySelectorAll(".log-entry");
      expect(entries).toHaveLength(1);
      expect(entries[0].textContent).toContain("decoder connected");
    });

    it("filters by module name", async () => {
      const user = userEvent.setup();
      const { container } = render(<LogsViewer showStats={false} />);

      await user.type(screen.getByLabelText(/search/i), "formatters");

      const entries = container.querySelectorAll(".log-entry");
      expect(entries).toHaveLength(1);
      expect(entries[0].textContent).toContain("parse failure");
    });

    it("combines level filter and search — an entry must match both", async () => {
      const user = userEvent.setup();
      const { container } = render(<LogsViewer showStats={false} />);

      await user.selectOptions(screen.getByLabelText(/level/i), "info");
      await user.type(screen.getByLabelText(/search/i), "parse");

      // "parse failure" is level=error, so the info filter excludes it even
      // though the search term matches.
      expect(container.querySelectorAll(".log-entry")).toHaveLength(0);
      expect(
        screen.getByText("No logs match current filters"),
      ).toBeInTheDocument();
    });

    it("clearing the search term restores the active level filter's matches", async () => {
      const user = userEvent.setup();
      const { container } = render(<LogsViewer showStats={false} />);

      const searchInput = screen.getByLabelText(/search/i);
      await user.type(searchInput, "decoder");
      expect(container.querySelectorAll(".log-entry")).toHaveLength(1);

      await user.clear(searchInput);
      expect(container.querySelectorAll(".log-entry")).toHaveLength(2);
    });
  });

  describe("NIT-10: statistics bar", () => {
    it("reflects logBuffer.getStats() totals per level", () => {
      logBuffer.add({
        level: "error",
        message: ["e1"],
        timestamp: new Date().toISOString(),
      });
      logBuffer.add({
        level: "error",
        message: ["e2"],
        timestamp: new Date().toISOString(),
      });
      logBuffer.add({
        level: "warn",
        message: ["w1"],
        timestamp: new Date().toISOString(),
      });
      logBuffer.add({
        level: "info",
        message: ["i1"],
        timestamp: new Date().toISOString(),
      });
      logBuffer.add({
        level: "debug",
        message: ["d1"],
        timestamp: new Date().toISOString(),
      });
      const { container } = render(<LogsViewer showStats />);

      expect(
        container.querySelector(".logs-viewer-stats")?.textContent,
      ).toContain("Total: 5");
      expect(
        container.querySelector(".logs-viewer-stat--error")?.textContent,
      ).toContain("Errors: 2");
      expect(
        container.querySelector(".logs-viewer-stat--warn")?.textContent,
      ).toContain("Warnings: 1");
      expect(
        container.querySelector(".logs-viewer-stat--info")?.textContent,
      ).toContain("Info: 1");
      expect(
        container.querySelector(".logs-viewer-stat--debug")?.textContent,
      ).toContain("Debug: 1");
    });

    it("updates the 'Filtered' count as the active filter narrows the list", async () => {
      const user = userEvent.setup();
      logBuffer.add({
        level: "error",
        message: ["e1"],
        timestamp: new Date().toISOString(),
      });
      logBuffer.add({
        level: "warn",
        message: ["w1"],
        timestamp: new Date().toISOString(),
      });
      const { container } = render(<LogsViewer showStats />);

      expect(
        container.querySelector(".logs-viewer-stats")?.textContent,
      ).toContain("Filtered: 2");

      await user.selectOptions(screen.getByLabelText(/level/i), "error");

      expect(
        container.querySelector(".logs-viewer-stats")?.textContent,
      ).toContain("Filtered: 1");
    });

    it("does not render the statistics bar when showStats is false", () => {
      const { container } = render(<LogsViewer showStats={false} />);
      expect(container.querySelector(".logs-viewer-stats")).toBeNull();
    });
  });

  describe("NIT-10: export", () => {
    function mockDownloadPlumbing(): {
      createObjectURL: ReturnType<typeof vi.fn>;
      revokeObjectURL: ReturnType<typeof vi.fn>;
      click: ReturnType<typeof vi.fn>;
      anchor: HTMLAnchorElement | undefined;
    } {
      const originalCreateElement = document.createElement.bind(document);
      const click = vi.fn();
      let anchor: HTMLAnchorElement | undefined;
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const element = originalCreateElement(tag);
        if (tag === "a") {
          element.click = click;
          anchor = element as HTMLAnchorElement;
        }
        return element;
      });
      const createObjectURL = vi
        .spyOn(URL, "createObjectURL")
        .mockReturnValue("blob:mock-url");
      const revokeObjectURL = vi
        .spyOn(URL, "revokeObjectURL")
        .mockImplementation(() => {});

      return {
        createObjectURL,
        revokeObjectURL,
        click,
        get anchor() {
          return anchor;
        },
      };
    }

    it("Export TXT builds a text/plain blob and triggers a .txt download", async () => {
      const user = userEvent.setup();
      const plumbing = mockDownloadPlumbing();
      logBuffer.add({
        level: "info",
        message: ["exportable entry"],
        timestamp: new Date().toISOString(),
      });
      render(<LogsViewer showStats={false} />);

      await user.click(screen.getByRole("button", { name: /export txt/i }));

      expect(plumbing.createObjectURL).toHaveBeenCalledOnce();
      const blobArg = plumbing.createObjectURL.mock
        .calls[0][0] as unknown as Blob;
      expect(blobArg.type).toBe("text/plain");
      expect(plumbing.click).toHaveBeenCalledOnce();
      expect(plumbing.anchor?.download).toMatch(/^acarshub-logs-.*\.txt$/);
      expect(plumbing.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });

    it("Export JSON builds an application/json blob and triggers a .json download", async () => {
      const user = userEvent.setup();
      const plumbing = mockDownloadPlumbing();
      logBuffer.add({
        level: "info",
        message: ["exportable entry"],
        timestamp: new Date().toISOString(),
      });
      render(<LogsViewer showStats={false} />);

      await user.click(screen.getByRole("button", { name: /export json/i }));

      expect(plumbing.createObjectURL).toHaveBeenCalledOnce();
      const blobArg = plumbing.createObjectURL.mock
        .calls[0][0] as unknown as Blob;
      expect(blobArg.type).toBe("application/json");
      expect(plumbing.click).toHaveBeenCalledOnce();
      expect(plumbing.anchor?.download).toMatch(/^acarshub-logs-.*\.json$/);
      expect(plumbing.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });
  });

  describe("NIT-10: clear", () => {
    it("clears the buffer when the user confirms the window.confirm prompt", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      logBuffer.add({
        level: "info",
        message: ["will be cleared"],
        timestamp: new Date().toISOString(),
      });
      const { container } = render(<LogsViewer showStats={false} />);
      expect(container.querySelectorAll(".log-entry")).toHaveLength(1);

      await user.click(screen.getByRole("button", { name: /^clear$/i }));

      expect(container.querySelectorAll(".log-entry")).toHaveLength(0);
      expect(screen.getByText("No logs yet")).toBeInTheDocument();
    });

    it("does not clear the buffer when the user cancels the window.confirm prompt", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(false);
      logBuffer.add({
        level: "info",
        message: ["should survive"],
        timestamp: new Date().toISOString(),
      });
      const { container } = render(<LogsViewer showStats={false} />);

      await user.click(screen.getByRole("button", { name: /^clear$/i }));

      expect(container.querySelectorAll(".log-entry")).toHaveLength(1);
    });
  });

  describe("NIT-10: subscription lifecycle", () => {
    it("subscribes to logBuffer on mount and unsubscribes on unmount", () => {
      // Wrap the real subscribe/unsubscribe so the component's actual
      // listener-registration logic still runs (this is not a pure stub),
      // while letting us assert on call counts and timing.
      let capturedUnsubscribe: ReturnType<typeof vi.fn<() => void>> | undefined;
      const originalSubscribe = logBuffer.subscribe.bind(logBuffer);
      const subscribeSpy = vi
        .spyOn(logBuffer, "subscribe")
        .mockImplementation((listener) => {
          const realUnsubscribe = originalSubscribe(listener);
          capturedUnsubscribe = vi.fn(() => realUnsubscribe());
          return capturedUnsubscribe;
        });

      const { unmount } = render(<LogsViewer showStats={false} />);

      expect(subscribeSpy).toHaveBeenCalledOnce();
      expect(capturedUnsubscribe).not.toHaveBeenCalled();

      unmount();

      expect(capturedUnsubscribe).toHaveBeenCalledOnce();
    });
  });

  describe("NIT-10: maxHeight prop", () => {
    it("defaults to 400px on the --logs-viewer-max-height custom property", () => {
      const { container } = render(<LogsViewer showStats={false} />);
      const viewer = container.querySelector(
        ".logs-viewer-display",
      ) as HTMLElement;
      expect(viewer.style.getPropertyValue("--logs-viewer-max-height")).toBe(
        "400px",
      );
    });

    it("threads a custom maxHeight through to the custom property", () => {
      const { container } = render(
        <LogsViewer showStats={false} maxHeight={600} />,
      );
      const viewer = container.querySelector(
        ".logs-viewer-display",
      ) as HTMLElement;
      expect(viewer.style.getPropertyValue("--logs-viewer-max-height")).toBe(
        "600px",
      );
    });
  });

  describe("NIT-10: accessibility", () => {
    it("exposes the log display as a keyboard-focusable live region", () => {
      render(<LogsViewer showStats={false} />);
      const region = screen.getByRole("log");
      expect(region).toHaveAttribute("aria-live", "polite");
      expect(region).toHaveAttribute("aria-label", "Application log output");
      expect(region).toHaveAttribute("tabIndex", "0");
    });
  });
});
