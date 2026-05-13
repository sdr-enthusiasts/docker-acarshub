// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * ConnectionStatus Component Tests
 *
 * Why this exists: ConnectionStatus is the only piece of UI that tells a
 * user the Socket.IO connection to the backend has dropped.  Three
 * silent-failure modes have to stay locked down:
 *
 *  1. When the user has disabled the indicator (settings.appearance.
 *     showConnectionStatus = false) the banner must NEVER render, even
 *     while disconnected — otherwise the setting is meaningless.
 *  2. When connected the banner must NEVER render, even with the setting
 *     enabled — otherwise the user sees a phantom warning on every page
 *     load before the first heartbeat lands.
 *  3. When disconnected AND the setting is enabled, the banner MUST
 *     render with the warning copy and the .disconnected class so the
 *     SCSS theme can colour it (Catppuccin red on Mocha, peach on
 *     Latte).  A render-without-class regression would silently leave
 *     the banner styled like a normal info bar.
 *
 * The component takes `isConnected` as a prop (not from a store) so the
 * tests drive that directly; only the showConnectionStatus setting is
 * mutated through useSettingsStore.setState.
 */

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "../../store/useSettingsStore";
import { ConnectionStatus } from "../ConnectionStatus";

/**
 * Reset the showConnectionStatus setting to its default (true) before
 * every test so cases that rely on the default don't have to set it
 * explicitly, and cases that flip it off don't leak to later tests.
 */
beforeEach(() => {
  useSettingsStore.setState((state) => ({
    settings: {
      ...state.settings,
      appearance: {
        ...state.settings.appearance,
        showConnectionStatus: true,
      },
    },
  }));
});

describe("ConnectionStatus", () => {
  describe("visibility gating", () => {
    it("renders nothing when showConnectionStatus is disabled, even while disconnected", () => {
      // Critical: a disabled-by-setting indicator must NEVER render, or
      // the setting has no effect.
      useSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          appearance: {
            ...state.settings.appearance,
            showConnectionStatus: false,
          },
        },
      }));

      const { container } = render(<ConnectionStatus isConnected={false} />);
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when connected, regardless of the setting", () => {
      // Connected state must collapse to null, not render an empty
      // wrapper — otherwise the fixed-position banner would still
      // intercept clicks/layout on every page.
      const { container } = render(<ConnectionStatus isConnected={true} />);
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when connected even if setting is explicitly disabled", () => {
      // Regression guard: both conditions hit the early-return paths
      // and the AND of them must still produce null (not some weird
      // overlap-edge banner).
      useSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          appearance: {
            ...state.settings.appearance,
            showConnectionStatus: false,
          },
        },
      }));

      const { container } = render(<ConnectionStatus isConnected={true} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("disconnected banner rendering", () => {
    it("renders the disconnect banner when disconnected and the setting is enabled", () => {
      const { container } = render(<ConnectionStatus isConnected={false} />);
      const banner = container.querySelector(".connection-status");
      expect(banner).not.toBeNull();
    });

    it("applies the .disconnected modifier class for SCSS theming", () => {
      // Regression guard: the SCSS theme keys off .disconnected to
      // colour the banner red/peach.  Losing this class would silently
      // leave the warning styled like a normal info bar.
      const { container } = render(<ConnectionStatus isConnected={false} />);
      const banner = container.querySelector(".connection-status");
      expect(banner?.classList.contains("disconnected")).toBe(true);
    });

    it("includes the warning icon and reconnect copy", () => {
      // The text content is part of the public UX contract — a copy
      // change should be a deliberate decision, not a silent edit.
      const { container } = render(<ConnectionStatus isConnected={false} />);
      const text = container.textContent ?? "";
      expect(text).toContain("⚠️");
      expect(text).toContain("Disconnected from ACARS Hub backend");
      expect(text).toContain("reconnect");
    });

    it("uses the expected DOM structure for SCSS targeting", () => {
      // Pin the .connection-status > .connection-status-content >
      // (.connection-status-icon + .connection-status-text) structure.
      // The SCSS depends on this nesting; flattening or renaming would
      // silently break the layout.
      const { container } = render(<ConnectionStatus isConnected={false} />);
      const content = container.querySelector(
        ".connection-status > .connection-status-content",
      );
      expect(content).not.toBeNull();
      expect(content?.querySelector(".connection-status-icon")).not.toBeNull();
      expect(content?.querySelector(".connection-status-text")).not.toBeNull();
    });
  });
});
