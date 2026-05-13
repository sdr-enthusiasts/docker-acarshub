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
  });
});
