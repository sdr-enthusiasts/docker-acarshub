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

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToastStore } from "../../store/useToastStore";
import { LogsViewer } from "../LogsViewer";

describe("LogsViewer", () => {
  beforeEach(() => {
    useToastStore.getState().clearAllToasts();
    // jsdom does not implement scrollIntoView; LogsViewer's auto-scroll
    // effect would otherwise throw and unmount the tree.
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
});
