// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * ToastContainer Component Tests
 *
 * Why this exists: ToastContainer fuses three stores (app, settings,
 * toast) into a single rendered queue, and the non-trivial logic
 * pinned here is auto-injection of *alert-variant* toasts driven by
 * `alertCount` deltas.
 *
 * Behaviour contract:
 *  1. When `onPageAlerts` setting is ON and `alertCount` increased
 *     since the last render, find the newest matched message across
 *     all message groups and push an `alert` toast with its terms.
 *  2. When `alertCount` did NOT increase (equal or decreased — e.g.
 *     culling pruned alert messages), no toast is pushed.  Critical:
 *     the previousAlertCount ref must still be updated, otherwise a
 *     later increase relative to a stale baseline would mis-fire.
 *  3. When `onPageAlerts` is OFF, no alert toast is auto-pushed AND
 *     any *existing* alert-variant toasts in the queue are filtered
 *     out of the render (success/error/info still render — they
 *     represent direct user actions, not background notifications).
 *  4. Imperative `showToast({ variant: "success" | ... })` toasts
 *     are unaffected by the setting.
 *  5. The "newest matched message" search compares `timestamp * 1000`
 *     (seconds -> ms) to find the latest; if multiple groups have
 *     alerts, the globally newest one wins.
 *  6. If `alertCount` increases but no message in `messageGroups`
 *     actually has `matched=true` with non-empty `matched_text`, no
 *     toast is pushed (defensive — desync between counter and groups).
 *  7. Container returns null (renders nothing) when the visible
 *     toast list is empty — avoids an empty `.toast-container` div
 *     stealing layout space.
 */

import type { MessageGroup } from "@acarshub/types";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../../store/useAppStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useToastStore } from "../../store/useToastStore";
import { ToastContainer } from "../ToastContainer";

/**
 * Build a minimal MessageGroup containing one matched message with
 * the supplied terms and timestamp (in seconds, as the wire format).
 */
function makeAlertGroup(
  id: string,
  terms: string[],
  timestampSeconds: number,
): MessageGroup {
  return {
    identifiers: [id],
    has_alerts: true,
    num_alerts: 1,
    lastUpdated: timestampSeconds * 1000,
    messages: [
      {
        // Minimum fields the container cares about; other fields are
        // unused by the auto-inject useEffect.
        uid: `uid-${id}`,
        timestamp: timestampSeconds,
        matched: true,
        matched_text: terms,
        // biome-ignore lint/suspicious/noExplicitAny: trimmed test fixture
      } as any,
    ],
  };
}

/**
 * Reset every store touched by ToastContainer before each test.
 * Without this, tests would leak alertCount / messageGroups / toasts
 * across cases (Zustand state is module-level by design).
 */
beforeEach(() => {
  useToastStore.getState().clearAllToasts();
  useAppStore.setState({
    alertCount: 0,
    messageGroups: new Map(),
  });
  useSettingsStore.setState((state) => ({
    settings: {
      ...state.settings,
      notifications: {
        ...state.settings.notifications,
        onPageAlerts: true,
      },
    },
  }));
});

afterEach(() => {
  useToastStore.getState().clearAllToasts();
});

describe("ToastContainer", () => {
  describe("empty state", () => {
    it("renders nothing (returns null) when there are no toasts", () => {
      const { container } = render(<ToastContainer />);
      // Critical: must NOT render an empty .toast-container div.
      // The fixed-position container with no children would still
      // intercept clicks / take up layout in some browsers.
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when only alert toasts exist but onPageAlerts is OFF", () => {
      useSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          notifications: {
            ...state.settings.notifications,
            onPageAlerts: false,
          },
        },
      }));
      useToastStore.getState().showToast({
        variant: "alert",
        terms: ["FOO"],
        duration: 0,
      });
      const { container } = render(<ToastContainer />);
      // The toast exists in the store but is filtered out of the
      // render — and because the filtered list is empty, the
      // container itself collapses to null rather than rendering
      // an empty wrapper div.
      expect(container.firstChild).toBeNull();
    });
  });

  describe("auto-inject from alertCount increase", () => {
    it("pushes an alert toast when alertCount increases and a matched message exists", () => {
      useAppStore.setState({
        alertCount: 1,
        messageGroups: new Map([
          ["ABC123", makeAlertGroup("ABC123", ["EMERGENCY"], 1000)],
        ]),
      });

      render(<ToastContainer />);

      const toasts = useToastStore.getState().toasts;
      // The auto-inject useEffect runs on mount because previous
      // alertCount ref starts at 0 and current is 1 (increase).
      expect(toasts).toHaveLength(1);
      expect(toasts[0]?.variant).toBe("alert");
      expect(toasts[0]?.terms).toEqual(["EMERGENCY"]);
    });

    it("renders the matched terms in the rendered Toast body", () => {
      useAppStore.setState({
        alertCount: 1,
        messageGroups: new Map([
          ["ABC123", makeAlertGroup("ABC123", ["MAYDAY", "EMERGENCY"], 1000)],
        ]),
      });
      render(<ToastContainer />);
      // End-to-end: store -> container -> Toast -> DOM. Verifies the
      // terms array is wired through props (not just stored in state).
      expect(screen.getByText("MAYDAY, EMERGENCY")).toBeInTheDocument();
    });

    it("does NOT push a toast when alertCount stays the same", () => {
      // Mount with alertCount=0 (no increase from initial 0)
      const { rerender } = render(<ToastContainer />);
      expect(useToastStore.getState().toasts).toHaveLength(0);

      // Now set alertCount=0 again with a matched message present —
      // still no increase, so no toast even though terms are
      // available. This pins the "increase only" gate.
      useAppStore.setState({
        alertCount: 0,
        messageGroups: new Map([
          ["ABC123", makeAlertGroup("ABC123", ["FOO"], 1000)],
        ]),
      });
      rerender(<ToastContainer />);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("does NOT push a toast when alertCount DECREASES (culling removed alerts)", () => {
      const { rerender } = render(<ToastContainer />);

      // First increase: 0 -> 2, one toast injected
      useAppStore.setState({
        alertCount: 2,
        messageGroups: new Map([
          ["ABC123", makeAlertGroup("ABC123", ["FOO"], 1000)],
        ]),
      });
      rerender(<ToastContainer />);
      expect(useToastStore.getState().toasts).toHaveLength(1);

      // Now a decrease (culling pruned an alert message): no new toast.
      useAppStore.setState({
        alertCount: 1,
        messageGroups: new Map([
          ["ABC123", makeAlertGroup("ABC123", ["FOO"], 1000)],
        ]),
      });
      rerender(<ToastContainer />);
      // Still exactly one toast (the original from the 0->2 increase).
      // Regression guard: if the gate became `!==` instead of `>`,
      // decrements would mis-fire as new alerts.
      expect(useToastStore.getState().toasts).toHaveLength(1);
    });

    it("does NOT push a toast when onPageAlerts setting is OFF", () => {
      useSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          notifications: {
            ...state.settings.notifications,
            onPageAlerts: false,
          },
        },
      }));
      useAppStore.setState({
        alertCount: 5,
        messageGroups: new Map([
          ["ABC123", makeAlertGroup("ABC123", ["FOO"], 1000)],
        ]),
      });
      render(<ToastContainer />);
      // User opted out of on-page alerts — even though alertCount
      // jumped 0 -> 5 (definite increase), the auto-inject branch
      // must early-return.
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("baseline-updates previousAlertCount even when onPageAlerts is OFF", () => {
      // Sequence:
      //   onPageAlerts=OFF, alertCount goes 0 -> 3 (no toast — setting off)
      //   onPageAlerts=ON,  alertCount stays 3   (no toast — no increase)
      // Regression target: if the OFF branch failed to update the
      // ref, a later flip-to-ON with the SAME alertCount would still
      // see "3 > 0" and mis-fire a toast.
      useSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          notifications: {
            ...state.settings.notifications,
            onPageAlerts: false,
          },
        },
      }));
      useAppStore.setState({
        alertCount: 3,
        messageGroups: new Map([
          ["ABC123", makeAlertGroup("ABC123", ["FOO"], 1000)],
        ]),
      });
      const { rerender } = render(<ToastContainer />);
      expect(useToastStore.getState().toasts).toHaveLength(0);

      // Flip setting ON without changing alertCount
      useSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          notifications: {
            ...state.settings.notifications,
            onPageAlerts: true,
          },
        },
      }));
      rerender(<ToastContainer />);
      // Still no toast: previousAlertCount.current was correctly
      // bumped to 3 during the OFF render, so 3 > 3 is false.
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("does NOT push a toast if alertCount increases but no group has a matched message", () => {
      // Defensive: alertCount and messageGroups can briefly desync
      // during socket churn. Without a real matched_text array the
      // container has nothing useful to show, so it must skip.
      useAppStore.setState({
        alertCount: 5,
        messageGroups: new Map(), // empty
      });
      render(<ToastContainer />);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("does NOT push a toast for messages where matched_text is empty array", () => {
      // matched=true but matched_text=[] is a legitimate edge case
      // (alert matched on icao/flight/tail, not text). The container
      // currently only handles matched_text — pin that boundary.
      const group: MessageGroup = {
        identifiers: ["ABC"],
        has_alerts: true,
        num_alerts: 1,
        lastUpdated: 1000,
        messages: [
          {
            uid: "u1",
            timestamp: 1000,
            matched: true,
            matched_text: [],
            // biome-ignore lint/suspicious/noExplicitAny: trimmed test fixture
          } as any,
        ],
      };
      useAppStore.setState({
        alertCount: 1,
        messageGroups: new Map([["ABC", group]]),
      });
      render(<ToastContainer />);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });

  describe("newest-match selection across groups", () => {
    it("picks the terms from the globally newest matched message", () => {
      // Three groups with different latest-match timestamps; the
      // container's inner loop must find the global maximum, not
      // just the first or last group iterated.
      useAppStore.setState({
        alertCount: 3,
        messageGroups: new Map([
          ["OLD", makeAlertGroup("OLD", ["OLD-TERM"], 100)],
          ["NEW", makeAlertGroup("NEW", ["NEW-TERM"], 999)],
          ["MID", makeAlertGroup("MID", ["MID-TERM"], 500)],
        ]),
      });
      render(<ToastContainer />);
      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      // Pins the latest-wins contract — if a future refactor used
      // Map iteration order instead of timestamp comparison, this
      // test would catch it (insertion order here puts NEW second).
      expect(toasts[0]?.terms).toEqual(["NEW-TERM"]);
    });
  });

  describe("filtering by onPageAlerts at render time", () => {
    it("hides existing alert toasts when onPageAlerts is OFF but keeps success/error/info", () => {
      // Three toasts in the queue with different variants
      useToastStore.getState().showToast({
        variant: "alert",
        terms: ["X"],
        duration: 0,
      });
      useToastStore.getState().showToast({
        variant: "success",
        message: "Saved",
        duration: 0,
      });
      useToastStore.getState().showToast({
        variant: "error",
        message: "Boom",
        duration: 0,
      });

      // Turn off on-page alerts
      useSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          notifications: {
            ...state.settings.notifications,
            onPageAlerts: false,
          },
        },
      }));

      render(<ToastContainer />);
      // success + error must still render (they reflect direct user
      // actions like "Copy logs" feedback). Only alert variant is
      // tied to the on-page-alerts preference.
      expect(screen.queryByText("Saved")).toBeInTheDocument();
      expect(screen.queryByText("Boom")).toBeInTheDocument();
      // The alert toast is filtered from render but still in the
      // store (no destructive side-effect from the setting toggle).
      expect(useToastStore.getState().toasts).toHaveLength(3);
    });

    it("renders all variants when onPageAlerts is ON", () => {
      useToastStore.getState().showToast({
        variant: "alert",
        terms: ["WARN"],
        duration: 0,
      });
      useToastStore.getState().showToast({
        variant: "info",
        message: "Heads up",
        duration: 0,
      });
      render(<ToastContainer />);
      expect(screen.getByText("WARN")).toBeInTheDocument();
      expect(screen.getByText("Heads up")).toBeInTheDocument();
    });
  });

  describe("imperative showToast bypasses the alert gate", () => {
    it("renders success toasts even when onPageAlerts is OFF", () => {
      useSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          notifications: {
            ...state.settings.notifications,
            onPageAlerts: false,
          },
        },
      }));
      useToastStore.getState().showToast({
        variant: "success",
        message: "Copied to clipboard",
        duration: 0,
      });
      render(<ToastContainer />);
      // LogsViewer and similar imperative call sites rely on this:
      // a user clicking "copy" must always see the confirmation,
      // regardless of the background-alerts preference.
      expect(screen.getByText("Copied to clipboard")).toBeInTheDocument();
    });
  });
});
