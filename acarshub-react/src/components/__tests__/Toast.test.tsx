// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Toast Component Tests
 *
 * Why this exists: Toast surfaces alert-term matches, success/error
 * banners, and other transient notifications. The non-trivial logic
 * pinned here:
 *  - Variant -> ARIA role/aria-live mapping (alert/error = assertive;
 *    success/info = polite). Wrong mapping = screen readers either
 *    interrupt for benign info or ignore critical alerts.
 *  - Auto-dismiss timing: setTimeout(duration) -> exit-animation
 *    300ms -> onDismiss(id). Real timers are slow; this suite uses
 *    fake timers to step through the sequence.
 *  - duration=0 disables auto-dismiss (toast persists until manual
 *    close) AND hides the progress bar. Both branches pinned.
 *  - `terms` (alert match list) overrides `message` rendering.
 *  - Title falls back to a per-variant default when not supplied.
 *  - Manual dismiss triggers the same exit-then-callback sequence as
 *    auto-dismiss.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toast } from "../Toast";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Toast", () => {
  describe("title resolution", () => {
    it("uses the explicit title when provided", () => {
      render(
        <Toast id="t1" title="Custom title" message="x" onDismiss={vi.fn()} />,
      );
      expect(screen.getByText("Custom title")).toBeInTheDocument();
    });

    it("falls back to 'Alert Matched' for variant='alert' (default)", () => {
      render(<Toast id="t1" message="x" onDismiss={vi.fn()} />);
      // 'alert' is the default variant; pin its title fallback so a
      // refactor of the DEFAULT_TITLES map doesn't silently change
      // user-visible copy.
      expect(screen.getByText("Alert Matched")).toBeInTheDocument();
    });

    it.each([
      ["success", "Success"],
      ["error", "Error"],
      ["info", "Info"],
    ] as const)(
      "falls back to '%s' default title for variant=%s",
      (variant, expected) => {
        render(
          <Toast id="t1" variant={variant} message="x" onDismiss={vi.fn()} />,
        );
        expect(screen.getByText(expected)).toBeInTheDocument();
      },
    );
  });

  describe("variant -> ARIA mapping (critical for screen readers)", () => {
    it("alert variant uses role='alert' + aria-live='assertive'", () => {
      const { container } = render(
        <Toast id="t1" variant="alert" message="x" onDismiss={vi.fn()} />,
      );
      const toast = container.querySelector(".toast") as HTMLElement;
      // 'alert' role + 'assertive' live region = interrupts current
      // speech to announce. Critical for safety-of-flight ACARS
      // alerts where the user MUST hear the match immediately.
      expect(toast.getAttribute("role")).toBe("alert");
      expect(toast.getAttribute("aria-live")).toBe("assertive");
    });

    it("error variant uses role='alert' + aria-live='assertive'", () => {
      const { container } = render(
        <Toast id="t1" variant="error" message="x" onDismiss={vi.fn()} />,
      );
      const toast = container.querySelector(".toast") as HTMLElement;
      expect(toast.getAttribute("role")).toBe("alert");
      expect(toast.getAttribute("aria-live")).toBe("assertive");
    });

    it("success variant uses role='status' + aria-live='polite'", () => {
      const { container } = render(
        <Toast id="t1" variant="success" message="x" onDismiss={vi.fn()} />,
      );
      const toast = container.querySelector(".toast") as HTMLElement;
      // 'status' role + 'polite' live region = waits for current
      // speech to finish. Right call for benign notifications.
      // Regression: if success accidentally became 'alert', screen
      // readers would interrupt the user for every minor confirmation.
      expect(toast.getAttribute("role")).toBe("status");
      expect(toast.getAttribute("aria-live")).toBe("polite");
    });

    it("info variant uses role='status' + aria-live='polite'", () => {
      const { container } = render(
        <Toast id="t1" variant="info" message="x" onDismiss={vi.fn()} />,
      );
      const toast = container.querySelector(".toast") as HTMLElement;
      expect(toast.getAttribute("role")).toBe("status");
      expect(toast.getAttribute("aria-live")).toBe("polite");
    });

    it("sets aria-atomic='true' so AT re-announce the full toast on update", () => {
      const { container } = render(
        <Toast id="t1" message="x" onDismiss={vi.fn()} />,
      );
      // aria-atomic=true tells AT to re-read the entire toast content
      // when any part changes, rather than just the diff. Without
      // this, partial re-renders could announce nonsense fragments.
      expect(
        container.querySelector(".toast")?.getAttribute("aria-atomic"),
      ).toBe("true");
    });
  });

  describe("body content: terms vs message", () => {
    it("renders the message when terms is undefined", () => {
      render(<Toast id="t1" message="Hello world" onDismiss={vi.fn()} />);
      expect(screen.getByText("Hello world")).toBeInTheDocument();
    });

    it("renders comma-joined terms when terms array is non-empty", () => {
      render(
        <Toast id="t1" terms={["FOO", "BAR", "BAZ"]} onDismiss={vi.fn()} />,
      );
      // Alert variant renders matched alert terms in monospace; the
      // join format is part of the visual contract.
      expect(screen.getByText("FOO, BAR, BAZ")).toBeInTheDocument();
    });

    it("renders message (not terms) when terms is an empty array", () => {
      render(
        <Toast id="t1" message="fallback msg" terms={[]} onDismiss={vi.fn()} />,
      );
      // The guard is `terms && terms.length > 0` — an empty array
      // falls through to the message branch. Pin this to guard
      // against `terms && ...` (truthy-only) regressions.
      expect(screen.getByText("fallback msg")).toBeInTheDocument();
    });
  });

  describe("auto-dismiss timing", () => {
    it("calls onDismiss after duration + 300ms exit animation", () => {
      const onDismiss = vi.fn();
      render(
        <Toast id="my-id" duration={2000} message="x" onDismiss={onDismiss} />,
      );
      // Step through the 10ms show-timer (no dismiss yet)
      act(() => {
        vi.advanceTimersByTime(10);
      });
      expect(onDismiss).not.toHaveBeenCalled();
      // Advance to just before the dismiss timer fires
      act(() => {
        vi.advanceTimersByTime(1990);
      });
      expect(onDismiss).not.toHaveBeenCalled();
      // Now the 2000ms timer fires; setIsExiting + 300ms then onDismiss
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onDismiss).not.toHaveBeenCalled(); // still in exit animation
      act(() => {
        vi.advanceTimersByTime(300);
      });
      // The component calls onDismiss with its own id so the parent
      // ToastContainer can remove the right entry from the store.
      expect(onDismiss).toHaveBeenCalledWith("my-id");
    });

    it("uses default duration of 5000ms when not specified", () => {
      const onDismiss = vi.fn();
      render(<Toast id="t1" message="x" onDismiss={onDismiss} />);
      // Default: 5000ms wait + 300ms exit = 5300ms total before
      // onDismiss fires. Pin the default so a refactor of the default
      // arg doesn't change visible behavior.
      act(() => {
        vi.advanceTimersByTime(5299);
      });
      expect(onDismiss).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onDismiss).toHaveBeenCalledWith("t1");
    });

    it("does NOT auto-dismiss when duration=0 (persistent toast)", () => {
      const onDismiss = vi.fn();
      render(<Toast id="t1" duration={0} message="x" onDismiss={onDismiss} />);
      // duration=0 is the documented "persist until manually closed"
      // mode. The component skips creating the dismissTimer entirely.
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it("hides the progress bar when duration=0", () => {
      const { container } = render(
        <Toast id="t1" duration={0} message="x" onDismiss={vi.fn()} />,
      );
      // Visual: a persistent toast must not show a progress bar (it
      // would imply a countdown that never fires).
      expect(container.querySelector(".toast__progress")).toBeNull();
    });

    it("shows the progress bar when duration > 0", () => {
      const { container } = render(
        <Toast id="t1" duration={5000} message="x" onDismiss={vi.fn()} />,
      );
      expect(container.querySelector(".toast__progress")).not.toBeNull();
    });

    it("sets the progress bar CSS variable to the duration value", () => {
      const { container } = render(
        <Toast id="t1" duration={7000} message="x" onDismiss={vi.fn()} />,
      );
      const bar = container.querySelector(
        ".toast__progress-bar",
      ) as HTMLElement;
      // The CSS animation duration is driven by --toast-progress-duration;
      // this is the visible countdown animation linkage.
      expect(bar.style.getPropertyValue("--toast-progress-duration")).toBe(
        "7000ms",
      );
    });
  });

  describe("manual dismiss", () => {
    it("invokes onDismiss after 300ms exit animation when close button clicked", () => {
      const onDismiss = vi.fn();
      render(
        <Toast id="my-id" duration={0} message="x" onDismiss={onDismiss} />,
      );
      // Using fireEvent (sync) instead of userEvent because the
      // latter awaits a microtask cycle that doesn't advance fake
      // timers cleanly and leads to a 5s timeout.
      fireEvent.click(
        screen.getByRole("button", { name: "Dismiss notification" }),
      );
      // Manual dismiss path: setIsExiting -> 300ms -> onDismiss(id)
      // Mirror the auto-dismiss exit-animation gate so the slide-out
      // animation completes before the DOM node is removed.
      expect(onDismiss).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(onDismiss).toHaveBeenCalledWith("my-id");
    });
  });

  describe("variant CSS class", () => {
    it.each(["alert", "success", "error", "info"] as const)(
      "applies toast--%s class for variant=%s",
      (variant) => {
        const { container } = render(
          <Toast id="t1" variant={variant} message="x" onDismiss={vi.fn()} />,
        );
        expect(container.querySelector(`.toast--${variant}`)).not.toBeNull();
      },
    );
  });

  describe("timer cleanup", () => {
    it("clears pending timers on unmount (no setState after unmount)", () => {
      const onDismiss = vi.fn();
      const { unmount } = render(
        <Toast id="t1" duration={5000} message="x" onDismiss={onDismiss} />,
      );
      unmount();
      // The cleanup must clear both showTimer and dismissTimer so a
      // parent unmounting the toast mid-flight doesn't call setState
      // on an unmounted component (React warning) or invoke
      // onDismiss after the parent has already disposed of the state.
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(onDismiss).not.toHaveBeenCalled();
    });
  });
});
