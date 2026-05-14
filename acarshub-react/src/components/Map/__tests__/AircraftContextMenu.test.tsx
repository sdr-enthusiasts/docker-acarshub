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

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PairedAircraft } from "../../../utils/aircraftPairing";
import { AircraftContextMenu } from "../AircraftContextMenu";

// Minimal PairedAircraft factory — only the fields the component reads matter
function makeAircraft(overrides: Partial<PairedAircraft> = {}): PairedAircraft {
  return {
    hex: "abc123",
    flight: undefined,
    tail: undefined,
    hasMessages: false,
    hasAlerts: false,
    messageCount: 0,
    alertCount: 0,
    decoderTypes: [],
    ...overrides,
  };
}

interface RenderOpts {
  aircraft?: PairedAircraft;
  isFollowed?: boolean;
}

function renderMenu(opts: RenderOpts = {}) {
  const onClose = vi.fn();
  const onViewMessages = vi.fn();
  const onFollow = vi.fn();
  const onUnfollow = vi.fn();

  render(
    <AircraftContextMenu
      aircraft={opts.aircraft ?? makeAircraft()}
      x={100}
      y={200}
      isFollowed={opts.isFollowed ?? false}
      onClose={onClose}
      onViewMessages={onViewMessages}
      onFollow={onFollow}
      onUnfollow={onUnfollow}
    />,
  );

  return { onClose, onViewMessages, onFollow, onUnfollow };
}

describe("AircraftContextMenu", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Replace navigator.clipboard.writeText with a vitest mock.
   *
   * MUST be called AFTER `userEvent.setup()` because user-event v14 installs
   * its own clipboard implementation during setup that would otherwise stomp
   * on this assignment (see LogsViewer.test.tsx for the same gotcha).
   */
  function mockClipboardAfterSetup(): ReturnType<typeof vi.fn> {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    return writeText;
  }

  describe("View Messages item", () => {
    it("renders View Messages as disabled when aircraft has no messages", () => {
      renderMenu({ aircraft: makeAircraft({ hasMessages: false }) });
      const item = screen.getByRole("menuitem", { name: /view messages/i });
      expect(item).toBeDisabled();
      expect(item).toHaveAttribute("aria-disabled", "true");
    });

    it("renders View Messages as enabled when aircraft has messages", () => {
      renderMenu({ aircraft: makeAircraft({ hasMessages: true }) });
      const item = screen.getByRole("menuitem", { name: /view messages/i });
      expect(item).not.toBeDisabled();
    });

    it("invokes onViewMessages and closes when clicked (enabled)", async () => {
      const user = userEvent.setup();
      const { onViewMessages, onClose } = renderMenu({
        aircraft: makeAircraft({ hasMessages: true }),
      });

      await user.click(
        screen.getByRole("menuitem", { name: /view messages/i }),
      );

      expect(onViewMessages).toHaveBeenCalledTimes(1);
      // ContextMenu auto-closes after item click. AircraftContextMenu passes
      // the raw handler (no wrapper), so onClose fires exactly once — unlike
      // MapContextMenu (see NIT-09 in REMEDIATION_PLAN.md).
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not invoke onViewMessages when clicked while disabled", async () => {
      const user = userEvent.setup();
      const { onViewMessages, onClose } = renderMenu({
        aircraft: makeAircraft({ hasMessages: false }),
      });

      await user.click(
        screen.getByRole("menuitem", { name: /view messages/i }),
      );

      expect(onViewMessages).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("Follow / Unfollow toggle", () => {
    it("shows 'Follow Aircraft' with target icon when not followed", () => {
      renderMenu({ isFollowed: false });
      const item = screen.getByRole("menuitem", { name: /follow aircraft/i });
      expect(item).toHaveTextContent("Follow Aircraft");
      expect(item).toHaveTextContent("🎯");
      expect(
        screen.queryByRole("menuitem", { name: /unfollow aircraft/i }),
      ).not.toBeInTheDocument();
    });

    it("shows 'Unfollow Aircraft' with pin icon when followed", () => {
      renderMenu({ isFollowed: true });
      const item = screen.getByRole("menuitem", { name: /unfollow aircraft/i });
      expect(item).toHaveTextContent("Unfollow Aircraft");
      expect(item).toHaveTextContent("📍");
      expect(
        screen.queryByRole("menuitem", { name: /^follow aircraft/i }),
      ).not.toBeInTheDocument();
    });

    it("invokes onFollow when clicked while not followed", async () => {
      const user = userEvent.setup();
      const { onFollow, onUnfollow } = renderMenu({ isFollowed: false });

      await user.click(
        screen.getByRole("menuitem", { name: /follow aircraft/i }),
      );

      expect(onFollow).toHaveBeenCalledTimes(1);
      expect(onUnfollow).not.toHaveBeenCalled();
    });

    it("invokes onUnfollow when clicked while followed", async () => {
      const user = userEvent.setup();
      const { onFollow, onUnfollow } = renderMenu({ isFollowed: true });

      await user.click(
        screen.getByRole("menuitem", { name: /unfollow aircraft/i }),
      );

      expect(onUnfollow).toHaveBeenCalledTimes(1);
      expect(onFollow).not.toHaveBeenCalled();
    });
  });

  describe("Copy Hex item", () => {
    it("renders the hex in uppercase in the label", () => {
      // Use a flight to disambiguate: copy-hex label is "Copy Hex (ABC123)"
      // while copy-identifier label becomes "Copy Callsign (UAL123)".
      renderMenu({
        aircraft: makeAircraft({ hex: "abc123", flight: "UAL123" }),
      });
      expect(
        screen.getByRole("menuitem", { name: /copy hex \(ABC123\)/i }),
      ).toBeInTheDocument();
    });

    it("writes uppercase hex to the clipboard when clicked", async () => {
      const user = userEvent.setup();
      const writeText = mockClipboardAfterSetup();
      renderMenu({
        aircraft: makeAircraft({ hex: "abc123", flight: "UAL123" }),
      });

      await user.click(
        screen.getByRole("menuitem", { name: /copy hex \(ABC123\)/i }),
      );

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledWith("ABC123");
    });
  });

  describe("Copy Identifier item — dynamic label", () => {
    it("labels as 'Copy Callsign (FLIGHT)' when flight is present", () => {
      renderMenu({
        aircraft: makeAircraft({ flight: "UAL123", tail: "N12345" }),
      });
      // Both copy items exist; pick the one with UAL123
      const item = screen.getByRole("menuitem", {
        name: /copy callsign \(UAL123\)/i,
      });
      expect(item).toBeInTheDocument();
    });

    it("labels as 'Copy Registration (TAIL)' when only tail is present", () => {
      renderMenu({
        aircraft: makeAircraft({ flight: undefined, tail: "n12345" }),
      });
      expect(
        screen.getByRole("menuitem", {
          name: /copy registration \(N12345\)/i,
        }),
      ).toBeInTheDocument();
    });

    it("labels as 'Copy Hex (HEX)' when neither flight nor tail is present", () => {
      renderMenu({
        aircraft: makeAircraft({ hex: "abc123" }),
      });
      // There are TWO menu items both matching /copy hex \(ABC123\)/ in this
      // case: the dedicated "Copy Hex" item AND the fallback "Copy <type>" item
      // which also resolves to "Copy Hex (ABC123)". Both being present is the
      // correct behaviour — copy works regardless of which one the user picks.
      const items = screen.getAllByRole("menuitem", {
        name: /copy hex \(ABC123\)/i,
      });
      expect(items).toHaveLength(2);
    });

    it("writes uppercase identifier to clipboard — flight wins over tail", async () => {
      const user = userEvent.setup();
      const writeText = mockClipboardAfterSetup();
      renderMenu({
        aircraft: makeAircraft({ flight: "ual123", tail: "n12345" }),
      });

      await user.click(
        screen.getByRole("menuitem", { name: /copy callsign \(UAL123\)/i }),
      );

      expect(writeText).toHaveBeenCalledWith("UAL123");
    });

    it("writes uppercase tail to clipboard when flight is missing", async () => {
      const user = userEvent.setup();
      const writeText = mockClipboardAfterSetup();
      renderMenu({
        aircraft: makeAircraft({ flight: undefined, tail: "n12345" }),
      });

      await user.click(
        screen.getByRole("menuitem", { name: /copy registration \(N12345\)/i }),
      );

      expect(writeText).toHaveBeenCalledWith("N12345");
    });
  });

  describe("Clipboard error handling", () => {
    it("does not throw when clipboard.writeText rejects on hex copy", async () => {
      const user = userEvent.setup();
      const writeText = mockClipboardAfterSetup();
      writeText.mockRejectedValueOnce(new Error("clipboard blocked"));
      renderMenu({
        aircraft: makeAircraft({ hex: "abc123", flight: "UAL123" }),
      });

      await user.click(
        screen.getByRole("menuitem", { name: /copy hex \(ABC123\)/i }),
      );

      // The component swallows the rejection via logger.error. Assert the
      // promise eventually settles without bubbling up.
      await expect(writeText.mock.results[0]?.value).rejects.toThrow();
    });
  });

  describe("Menu structure", () => {
    it("renders dividers between action groups", () => {
      const { container } = render(
        <AircraftContextMenu
          aircraft={makeAircraft({ hasMessages: true })}
          x={0}
          y={0}
          isFollowed={false}
          onClose={vi.fn()}
          onViewMessages={vi.fn()}
          onFollow={vi.fn()}
          onUnfollow={vi.fn()}
        />,
      );

      // Two divider <hr>s separating: view-messages | follow | copy-hex+copy-id
      const dividers = container.querySelectorAll("hr.context-menu__divider");
      expect(dividers).toHaveLength(2);
    });

    it("renders four interactive menu items (view, follow, copy hex, copy id)", () => {
      renderMenu({
        aircraft: makeAircraft({
          hasMessages: true,
          flight: "UAL123",
          hex: "abc123",
        }),
      });
      // Dividers are <hr>, not menuitems
      expect(screen.getAllByRole("menuitem")).toHaveLength(4);
    });
  });
});
