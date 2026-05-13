// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * AlertSoundManager Component Tests
 *
 * Why this exists: AlertSoundManager is a render-nothing side-effect
 * component that owns the contract "play a sound when the alert count
 * goes up, but only sometimes". The "sometimes" is the entire reason
 * it's hard to get right, and every clause of that contract is a
 * separate silent-failure surface:
 *
 *  1. soundEnabled gate — settings.notifications.sound=false MUST
 *     suppress audio. A regression here turns the user's "off"
 *     preference into a no-op; the most user-visible privacy/UX
 *     failure this component can have.
 *
 *  2. Strict-increase gate — sound only fires when alertCount goes
 *     UP. Equal counts (re-renders) and decreases (alerts dismissed)
 *     MUST be silent. A regression to ">=" would re-play on every
 *     render; a regression to "!==" would chirp on dismissal.
 *
 *  3. 2-second debounce — rapid back-to-back increases produce ONE
 *     sound, not N. A regression here generates audio spam during
 *     burst arrivals (which is the exact scenario this protects).
 *
 *  4. Initial mount with non-zero count — previousAlertCount.current
 *     starts at 0, so a first render with alertCount>0 looks like a
 *     fresh increase. This IS intentional (user reloads the page
 *     with active alerts → one chime), but the test pins it so a
 *     refactor that initialises previousAlertCount=alertCount
 *     doesn't silently break the reload UX.
 *
 *  5. AUTOPLAY_BLOCKED branch — caught Errors with this message must
 *     log at warn level (recoverable, user action required), not
 *     error. A regression that conflates them buries the actionable
 *     "click Test Sound in Settings" signal under generic error
 *     noise.
 *
 *  6. Render contract — component returns null. Any DOM output would
 *     break the mount points it lives in (it's typically a sibling
 *     of routed pages, where stray output would shift layout).
 */

import { render } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import { audioService } from "../../services/audioService";
import { useAppStore } from "../../store/useAppStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { AlertSoundManager } from "../AlertSoundManager";

vi.mock("../../services/audioService", () => ({
  audioService: {
    playAlertSound: vi.fn(),
  },
}));

/**
 * Convenience: typed handle on the mock. vi.mocked() would lose the
 * resolved-value typing we need below.
 */
const mockPlay = audioService.playAlertSound as unknown as Mock;

/**
 * Baseline: sound on, volume at default, alertCount=0. Every test
 * that needs a different starting point sets it explicitly so the
 * intent is obvious in the test body.
 */
beforeEach(() => {
  mockPlay.mockReset();
  mockPlay.mockResolvedValue(undefined);

  useSettingsStore.setState((state) => ({
    settings: {
      ...state.settings,
      notifications: {
        ...state.settings.notifications,
        sound: true,
        volume: 50,
      },
    },
  }));
  useAppStore.setState({ alertCount: 0 });

  // Date.now() drives the debounce window. Freeze it so every test
  // starts at the same "now" and advances time explicitly.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AlertSoundManager", () => {
  describe("render contract", () => {
    it("renders nothing", () => {
      // Any DOM output would shift layout in the mount point.
      const { container } = render(<AlertSoundManager />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("soundEnabled gate (privacy/UX surface)", () => {
    it("does NOT play even when alertCount increases if sound is disabled", () => {
      useSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          notifications: {
            ...state.settings.notifications,
            sound: false,
          },
        },
      }));

      const { rerender } = render(<AlertSoundManager />);
      useAppStore.setState({ alertCount: 5 });
      rerender(<AlertSoundManager />);

      expect(mockPlay).not.toHaveBeenCalled();
    });

    it("does NOT play when sound is toggled off mid-session", () => {
      // Regression guard: toggling off between two increases must
      // immediately suppress the next sound, not wait for a render
      // cycle.
      const { rerender } = render(<AlertSoundManager />);
      useAppStore.setState({ alertCount: 1 });
      rerender(<AlertSoundManager />);
      expect(mockPlay).toHaveBeenCalledTimes(1);

      mockPlay.mockClear();
      useSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          notifications: {
            ...state.settings.notifications,
            sound: false,
          },
        },
      }));
      // Advance past the 2s debounce so the only reason for silence
      // is the soundEnabled gate.
      vi.setSystemTime(new Date("2026-01-01T00:00:03Z"));
      useAppStore.setState({ alertCount: 2 });
      rerender(<AlertSoundManager />);

      expect(mockPlay).not.toHaveBeenCalled();
    });
  });

  describe("strict-increase gate", () => {
    it("plays on a fresh increase (0 → 3)", () => {
      const { rerender } = render(<AlertSoundManager />);
      useAppStore.setState({ alertCount: 3 });
      rerender(<AlertSoundManager />);

      expect(mockPlay).toHaveBeenCalledTimes(1);
      expect(mockPlay).toHaveBeenCalledWith(50);
    });

    it("does NOT play when alertCount is unchanged across renders", () => {
      // Regression guard: a ">=" instead of ">" would re-play on
      // every render. Equal counts must be silent.
      //
      // We deliberately advance past the 2s debounce between renders
      // so the debounce can NOT mask a mutation in the
      // strict-increase gate — without this advance, the second
      // render's debounce check would suppress the sound and the
      // mutation would slip through.
      const { rerender } = render(<AlertSoundManager />);
      useAppStore.setState({ alertCount: 5 });
      rerender(<AlertSoundManager />);
      expect(mockPlay).toHaveBeenCalledTimes(1);

      mockPlay.mockClear();
      vi.setSystemTime(new Date("2026-01-01T00:00:05Z"));
      // Force a rerender without changing alertCount (volume change).
      useSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          notifications: {
            ...state.settings.notifications,
            volume: 75,
          },
        },
      }));
      rerender(<AlertSoundManager />);

      expect(mockPlay).not.toHaveBeenCalled();
    });

    it("does NOT play when alertCount DECREASES (alert dismissed)", () => {
      // Regression guard: a "!==" instead of ">" would chirp on
      // dismissal. Dismissals must be silent.
      const { rerender } = render(<AlertSoundManager />);
      useAppStore.setState({ alertCount: 5 });
      rerender(<AlertSoundManager />);
      mockPlay.mockClear();

      vi.setSystemTime(new Date("2026-01-01T00:00:05Z"));
      useAppStore.setState({ alertCount: 2 });
      rerender(<AlertSoundManager />);

      expect(mockPlay).not.toHaveBeenCalled();
    });
  });

  describe("debounce (2 second window)", () => {
    it("suppresses a second increase within 2 seconds", () => {
      // Burst protection: rapid arrivals should produce ONE chime,
      // not N. A regression that drops the debounce produces audio
      // spam in the exact scenario this protects against.
      const { rerender } = render(<AlertSoundManager />);
      useAppStore.setState({ alertCount: 1 });
      rerender(<AlertSoundManager />);
      expect(mockPlay).toHaveBeenCalledTimes(1);

      // 500ms later, another alert arrives.
      vi.setSystemTime(new Date("2026-01-01T00:00:00.500Z"));
      useAppStore.setState({ alertCount: 2 });
      rerender(<AlertSoundManager />);

      expect(mockPlay).toHaveBeenCalledTimes(1);
    });

    it("allows a second sound after the debounce window elapses", () => {
      const { rerender } = render(<AlertSoundManager />);
      useAppStore.setState({ alertCount: 1 });
      rerender(<AlertSoundManager />);
      expect(mockPlay).toHaveBeenCalledTimes(1);

      // 2001ms later — just past the 2000ms threshold (strict >).
      vi.setSystemTime(new Date("2026-01-01T00:00:02.001Z"));
      useAppStore.setState({ alertCount: 2 });
      rerender(<AlertSoundManager />);

      expect(mockPlay).toHaveBeenCalledTimes(2);
    });

    it("treats exactly 2000ms as INSIDE the debounce window (strict >)", () => {
      // Boundary pin: code uses `timeSinceLastAlert > 2000`, so
      // exactly 2000 must be silent. A regression to `>=` would
      // flip this. Catches off-by-one mistakes.
      const { rerender } = render(<AlertSoundManager />);
      useAppStore.setState({ alertCount: 1 });
      rerender(<AlertSoundManager />);
      expect(mockPlay).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
      useAppStore.setState({ alertCount: 2 });
      rerender(<AlertSoundManager />);

      expect(mockPlay).toHaveBeenCalledTimes(1);
    });
  });

  describe("initial-mount reload behaviour", () => {
    it("plays once when mounted with a pre-existing non-zero count (reload-with-active-alerts UX)", () => {
      // previousAlertCount.current starts at 0, so a first render
      // with alertCount>0 is treated as a fresh increase. This is
      // intentional UX (user reloads page → one chime), and we pin
      // it so a refactor that initialises
      // previousAlertCount=alertCount doesn't silently break it.
      useAppStore.setState({ alertCount: 5 });
      render(<AlertSoundManager />);

      expect(mockPlay).toHaveBeenCalledTimes(1);
    });
  });

  describe("AUTOPLAY_BLOCKED error branch", () => {
    it("does not throw when audioService rejects with AUTOPLAY_BLOCKED", () => {
      // The actual log-level distinction (warn vs error) is logged
      // through uiLogger; we don't assert on the logger here
      // because it's noise. What we DO need to pin is that the
      // rejection is caught and does not bubble — otherwise React
      // would log an unhandled-promise warning on every blocked
      // play attempt, drowning out everything else in the console.
      mockPlay.mockRejectedValueOnce(new Error("AUTOPLAY_BLOCKED"));

      const { rerender } = render(<AlertSoundManager />);
      useAppStore.setState({ alertCount: 1 });
      // Must not throw or trigger an unhandled rejection.
      expect(() => rerender(<AlertSoundManager />)).not.toThrow();
    });

    it("does not throw when audioService rejects with a generic Error", () => {
      mockPlay.mockRejectedValueOnce(new Error("decode failed"));

      const { rerender } = render(<AlertSoundManager />);
      useAppStore.setState({ alertCount: 1 });
      expect(() => rerender(<AlertSoundManager />)).not.toThrow();
    });
  });

  describe("volume forwarding", () => {
    it("passes the current volume to audioService.playAlertSound", () => {
      // Regression guard: a refactor that hardcodes a volume or
      // forgets to thread it through silently breaks the user's
      // volume setting.
      useSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          notifications: {
            ...state.settings.notifications,
            volume: 33,
          },
        },
      }));

      const { rerender } = render(<AlertSoundManager />);
      useAppStore.setState({ alertCount: 1 });
      rerender(<AlertSoundManager />);

      expect(mockPlay).toHaveBeenCalledWith(33);
    });
  });
});
