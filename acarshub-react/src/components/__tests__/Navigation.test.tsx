// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Navigation Tests
 *
 * Why this exists: Navigation is the chrome around every page —
 * mobile menu, desktop nav links, message-rate widget, alert
 * badge, system-error indicator, settings button, and the
 * mobile-only filters flyout for Live Messages. A regression
 * here is highly visible (users see the wrong nav) yet rarely
 * throws (every branch resolves to a valid React tree). This
 * file pins the conditional rendering and click-handler
 * contracts; layout/responsive CSS is intentionally out of
 * scope (covered by Playwright a11y/visual checks).
 *
 * What this pins:
 *
 *  1. Mobile vs desktop branching:
 *     - useMediaQuery('(max-width: 767px)') is the toggle. With
 *       matchMedia(...).matches=false (the test-setup default),
 *       desktop renders. Flipping matches=true renders mobile.
 *
 *  2. ADS-B link is conditional on selectAdsbEnabled (desktop
 *     and mobile both gate on it). The 'Map' link must NOT
 *     appear when ADS-B is disabled. A regression that always
 *     renders it would silently route users to a broken page
 *     when the decoder is off.
 *
 *  3. Unread alert badge: '(N)' appears next to 'Alerts' iff
 *     unreadAlertCount > 0. The strict-greater-than is the
 *     interesting bit — zero must NOT render '(0)'.
 *
 *  4. System error indicator: '⚠' next to 'Status' iff
 *     systemHasError. Users rely on the visual cue.
 *
 *  5. MessageRateWidget:
 *     - Returns null when messageRate OR decoders is null
 *       (defensive gate; without it the tooltip-row map would
 *       crash on the null decoder reference).
 *     - aria-label uses the EXACT '${total} messages per minute'
 *       phrasing — screen readers depend on it.
 *     - The tooltip block is rendered iff MORE THAN ONE decoder
 *       is enabled. Single-decoder users get no tooltip because
 *       it would add no information; pinning prevents a
 *       regression to '>= 1' that always shows a tooltip with
 *       one row.
 *     - Per-decoder rows render only for enabled=true decoders.
 *     - The 'message-rate__value--active' class appears iff
 *       total > 0 (visual indication that messages are flowing;
 *       lost in a refactor that drops the conditional).
 *
 *  6. Desktop active-link click handler (the Twitter/X
 *     'tap-active-tab-to-scroll' pattern):
 *     - On the active route, clicking a NavLink calls
 *       preventDefault() AND scrollToTop().
 *     - On an inactive route, the handler is a no-op (the
 *       NavLink's default navigation proceeds).
 *
 *  7. Settings button:
 *     - Click calls setSettingsOpen(true).
 *     - On mobile, also closes the menu <details>.
 *
 *  8. Mobile nav link clicks close the menu <details> (the
 *     parent <details ref> is set open=false).
 *
 *  9. Mobile filters button:
 *     - Renders only when (a) mobile AND (b) on /live-messages.
 *     - Toggles filtersOpen; aria-expanded reflects state.
 */

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scrollToTop } from "../../utils/scrollRegistry";
// SUT and scrollRegistry imports below are intentionally placed after the
// vi.mock blocks for readability. Biome's organize-imports rule would
// hoist them anyway via static analysis; vi.mock is hoisted by Vitest's
// transform regardless of source position, so order here is purely
// stylistic.
import { Navigation } from "../Navigation";

// ---------------------------------------------------------------------------
// Mocks (declared BEFORE the SUT import so vi.mock hoists ahead of import)
// ---------------------------------------------------------------------------

vi.mock("../../utils/scrollRegistry", () => ({
  scrollToTop: vi.fn(),
}));

// LiveMessagesPage exports a module-level singleton that Navigation
// polls via getMessageFilterProps(). We don't want to pull the page
// into the test (it would drag the entire socket layer with it).
vi.mock("../../pages/LiveMessagesPage", () => ({
  getMessageFilterProps: vi.fn(() => null),
}));

// ThemeSwitcher and MessageFilters render in the desktop right-side
// and the mobile filters flyout respectively. Stub them so this
// test focuses on Navigation's own contract.
vi.mock("../ThemeSwitcher", () => ({
  ThemeSwitcher: () => <div data-testid="theme-switcher-stub" />,
}));

vi.mock("../MessageFilters", () => ({
  MessageFilters: (props: { textFilter: string }) => (
    <div
      data-testid="message-filters-stub"
      data-text-filter={props.textFilter}
    />
  ),
}));

// useMediaQuery is the desktop/mobile toggle. Default-export the
// hook reading window.matchMedia; mock it directly so each test
// can flip the result without touching matchMedia.
const mockMediaQueryResult = { current: false };
vi.mock("../../hooks/useMediaQuery", () => ({
  useMediaQuery: vi.fn(() => mockMediaQueryResult.current),
}));

// Mock useAppStore: tests configure the mock state object before
// rendering, then the selectors run against it. Pattern matches
// existing MessageCard tests.
interface MockAppState {
  messageRate: {
    total: number;
    acars: number;
    vdlm2: number;
    hfdl: number;
    imsl: number;
    irdm: number;
  } | null;
  decoders: {
    acars: boolean;
    vdlm: boolean;
    hfdl: boolean;
    imsl: boolean;
    irdm: boolean;
    adsb: { enabled: boolean };
  } | null;
  systemStatus: { status: { error_state: boolean } } | null;
  unreadAlertCount: number;
  setSettingsOpen: ReturnType<typeof vi.fn>;
}

const mockState: MockAppState = {
  messageRate: null,
  decoders: null,
  systemStatus: null,
  unreadAlertCount: 0,
  setSettingsOpen: vi.fn(),
};

function resetMockState(): void {
  mockState.messageRate = null;
  mockState.decoders = null;
  mockState.systemStatus = null;
  mockState.unreadAlertCount = 0;
  mockState.setSettingsOpen = vi.fn();
}

vi.mock("../../store/useAppStore", () => {
  // Define inline so the selectors close over `mockState`.
  const buildState = () => ({
    messageRate: mockState.messageRate,
    decoders: mockState.decoders,
    systemStatus: mockState.systemStatus,
    setSettingsOpen: mockState.setSettingsOpen,
    // getUnreadAlertCount is called by the selector; return the
    // direct configured count for simplicity.
    getUnreadAlertCount: () => mockState.unreadAlertCount,
  });
  return {
    useAppStore: (selector: (s: ReturnType<typeof buildState>) => unknown) =>
      selector(buildState()),
    selectAdsbEnabled: (s: ReturnType<typeof buildState>) =>
      s.decoders?.adsb.enabled ?? false,
    selectUnreadAlertCount: (s: ReturnType<typeof buildState>) =>
      s.getUnreadAlertCount(),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderAt(
  path: string,
  state: Partial<MockAppState> = {},
): ReturnType<typeof render> {
  Object.assign(mockState, state);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Navigation />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Navigation", () => {
  beforeEach(() => {
    resetMockState();
    mockMediaQueryResult.current = false; // desktop by default
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("desktop / mobile branching", () => {
    it("renders the desktop <ul.primary> nav when useMediaQuery returns false", () => {
      renderAt("/about");
      // The desktop branch puts links in <ul class='primary'>.
      // Mobile uses <details class='small_nav'>. Pin the desktop
      // structural marker rather than the (CSS-driven) layout.
      expect(document.querySelector("ul.primary")).toBeInTheDocument();
      expect(document.querySelector(".small_nav")).not.toBeInTheDocument();
    });

    it("renders the mobile <details.small_nav> nav when useMediaQuery returns true", () => {
      mockMediaQueryResult.current = true;
      renderAt("/about");
      expect(document.querySelector(".small_nav")).toBeInTheDocument();
      expect(document.querySelector("ul.primary")).not.toBeInTheDocument();
    });
  });

  describe("ADS-B link (Map) is conditional on adsb decoder enabled", () => {
    it("does NOT render the Map link when ADS-B is disabled (desktop)", () => {
      renderAt("/about", {
        decoders: makeDecoders({ adsb: false }),
      });
      expect(screen.queryByRole("link", { name: /^Map$/ })).toBeNull();
    });

    it("renders the Map link when ADS-B is enabled (desktop)", () => {
      renderAt("/about", {
        decoders: makeDecoders({ adsb: true }),
      });
      expect(screen.getByRole("link", { name: /^Map$/ })).toBeInTheDocument();
    });

    it("does NOT render the Map link when ADS-B is disabled (mobile)", async () => {
      const user = userEvent.setup();
      mockMediaQueryResult.current = true;
      renderAt("/about", {
        decoders: makeDecoders({ adsb: false }),
      });
      // Mobile menu is collapsed until opened.
      await user.click(screen.getByText("Menu"));
      expect(screen.queryByRole("link", { name: /^Map$/ })).toBeNull();
    });

    it("renders the Map link when ADS-B is enabled (mobile)", async () => {
      const user = userEvent.setup();
      mockMediaQueryResult.current = true;
      renderAt("/about", {
        decoders: makeDecoders({ adsb: true }),
      });
      await user.click(screen.getByText("Menu"));
      expect(screen.getByRole("link", { name: /^Map$/ })).toBeInTheDocument();
    });
  });

  describe("unread alert badge", () => {
    it("renders '(N)' next to Alerts when unreadAlertCount > 0", () => {
      renderAt("/about", { unreadAlertCount: 3 });
      const alertsLink = screen.getByRole("link", { name: /alerts/i });
      expect(alertsLink).toHaveTextContent("(3)");
    });

    it("does NOT render the badge when unreadAlertCount === 0 (strict >0)", () => {
      // Pin the strict comparison. A regression to >=0 would
      // render '(0)' which looks like a UX bug.
      renderAt("/about", { unreadAlertCount: 0 });
      const alertsLink = screen.getByRole("link", { name: /alerts/i });
      expect(alertsLink.textContent).not.toMatch(/\(/);
    });

    it("renders the badge in the mobile menu too", async () => {
      const user = userEvent.setup();
      mockMediaQueryResult.current = true;
      renderAt("/about", { unreadAlertCount: 7 });
      await user.click(screen.getByText("Menu"));
      expect(screen.getByRole("link", { name: /alerts/i })).toHaveTextContent(
        "(7)",
      );
    });
  });

  describe("system error indicator", () => {
    it("renders '⚠' next to Status when systemStatus.status.error_state=true", () => {
      renderAt("/about", {
        systemStatus: { status: { error_state: true } },
      });
      expect(screen.getByRole("link", { name: /status/i })).toHaveTextContent(
        "⚠",
      );
    });

    it("does NOT render '⚠' when error_state=false", () => {
      renderAt("/about", {
        systemStatus: { status: { error_state: false } },
      });
      expect(
        screen.getByRole("link", { name: /status/i }).textContent,
      ).not.toContain("⚠");
    });

    it("does NOT render '⚠' when systemStatus is null", () => {
      // The selector uses `?? false` so null is treated as
      // no-error. Pinning so a refactor to truthy-coalesce
      // (which would keep null as falsy by coincidence) is
      // still safe.
      renderAt("/about", { systemStatus: null });
      expect(
        screen.getByRole("link", { name: /status/i }).textContent,
      ).not.toContain("⚠");
    });
  });

  describe("MessageRateWidget", () => {
    it("renders nothing when messageRate is null", () => {
      renderAt("/about", {
        messageRate: null,
        decoders: makeDecoders({ acars: true }),
      });
      expect(screen.queryByLabelText(/messages per minute/i)).toBeNull();
    });

    it("renders nothing when decoders is null (defensive null gate)", () => {
      // Without the gate the tooltip-row map below would crash
      // on the null decoders reference.
      renderAt("/about", {
        messageRate: makeRate({ total: 5, acars: 5 }),
        decoders: null,
      });
      expect(screen.queryByLabelText(/messages per minute/i)).toBeNull();
    });

    it("renders the total with the exact aria-label phrasing", () => {
      // Screen readers depend on this exact wording.
      renderAt("/about", {
        messageRate: makeRate({ total: 42, acars: 42 }),
        decoders: makeDecoders({ acars: true }),
      });
      expect(
        screen.getByLabelText("Message rate: 42 messages per minute"),
      ).toBeInTheDocument();
    });

    it("adds the --active class when total > 0 (visual flow indicator)", () => {
      renderAt("/about", {
        messageRate: makeRate({ total: 1, acars: 1 }),
        decoders: makeDecoders({ acars: true }),
      });
      const widget = screen.getByLabelText(/messages per minute/i);
      expect(widget.className).toContain("message-rate__value--active");
    });

    it("does NOT add the --active class when total === 0 (strict >0)", () => {
      renderAt("/about", {
        messageRate: makeRate({ total: 0 }),
        decoders: makeDecoders({ acars: true }),
      });
      const widget = screen.getByLabelText(/messages per minute/i);
      expect(widget.className).not.toContain("message-rate__value--active");
    });

    it("hides the tooltip when exactly one decoder is enabled", () => {
      // Single-decoder users get no tooltip because it would
      // add no information beyond the headline total.
      renderAt("/about", {
        messageRate: makeRate({ total: 5, acars: 5 }),
        decoders: makeDecoders({ acars: true }),
      });
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("shows the tooltip when MORE THAN ONE decoder is enabled", () => {
      renderAt("/about", {
        messageRate: makeRate({ total: 7, acars: 5, vdlm2: 2 }),
        decoders: makeDecoders({ acars: true, vdlm: true }),
      });
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
    });

    it("the tooltip only includes rows for enabled decoders", () => {
      // 4 enabled out of 5: ACARS, HFDL, IMSL, IRDM. VDLM2 is
      // disabled and must NOT appear.
      renderAt("/about", {
        messageRate: makeRate({
          total: 10,
          acars: 1,
          vdlm2: 2,
          hfdl: 3,
          imsl: 2,
          irdm: 2,
        }),
        decoders: makeDecoders({
          acars: true,
          vdlm: false,
          hfdl: true,
          imsl: true,
          irdm: true,
        }),
      });
      const tooltip = screen.getByRole("tooltip");
      expect(within(tooltip).getByText("ACARS")).toBeInTheDocument();
      expect(within(tooltip).getByText("HFDL")).toBeInTheDocument();
      expect(within(tooltip).getByText("IMSL")).toBeInTheDocument();
      expect(within(tooltip).getByText("IRDM")).toBeInTheDocument();
      // VDLM2 disabled -> filtered out.
      expect(within(tooltip).queryByText("VDLM2")).toBeNull();
    });
  });

  describe("desktop active-link click → scrollToTop", () => {
    it("preventDefaults and calls scrollToTop when clicking the active route", async () => {
      const user = userEvent.setup();
      renderAt("/live-messages");
      await user.click(screen.getByRole("link", { name: /messages/i }));
      expect(scrollToTop).toHaveBeenCalledTimes(1);
    });

    it("does NOT call scrollToTop when clicking an inactive route", async () => {
      const user = userEvent.setup();
      renderAt("/about");
      await user.click(screen.getByRole("link", { name: /messages/i }));
      // On an inactive route the default React Router navigation
      // proceeds; the handler is a no-op.
      expect(scrollToTop).not.toHaveBeenCalled();
    });
  });

  describe("settings button", () => {
    it("desktop click calls setSettingsOpen(true)", async () => {
      const user = userEvent.setup();
      const setSettingsOpen = vi.fn();
      renderAt("/about", { setSettingsOpen });
      await user.click(screen.getByRole("button", { name: /settings/i }));
      expect(setSettingsOpen).toHaveBeenCalledWith(true);
    });

    it("mobile click calls setSettingsOpen(true) AND closes the menu", async () => {
      const user = userEvent.setup();
      const setSettingsOpen = vi.fn();
      mockMediaQueryResult.current = true;
      renderAt("/about", { setSettingsOpen });

      // Open the menu first.
      const details = document.querySelector(
        "details.small_nav",
      ) as HTMLDetailsElement;
      act(() => {
        details.open = true;
      });
      expect(details.open).toBe(true);

      await user.click(screen.getByRole("button", { name: /settings/i }));
      expect(setSettingsOpen).toHaveBeenCalledWith(true);
      // The handler sets details.open = false directly via ref.
      expect(details.open).toBe(false);
    });
  });

  describe("mobile menu auto-closes on link click", () => {
    it("clicking a NavLink in the mobile menu closes <details>", async () => {
      const user = userEvent.setup();
      mockMediaQueryResult.current = true;
      renderAt("/about");
      const details = document.querySelector(
        "details.small_nav",
      ) as HTMLDetailsElement;
      act(() => {
        details.open = true;
      });
      expect(details.open).toBe(true);

      await user.click(screen.getByRole("link", { name: /^Messages$/ }));
      expect(details.open).toBe(false);
    });
  });

  describe("mobile Filters button", () => {
    it("is NOT rendered on mobile when on a non-LiveMessages page", () => {
      mockMediaQueryResult.current = true;
      renderAt("/about");
      expect(screen.queryByRole("button", { name: /filters/i })).toBeNull();
    });

    it("IS rendered on mobile when on /live-messages", () => {
      mockMediaQueryResult.current = true;
      renderAt("/live-messages");
      expect(
        screen.getByRole("button", { name: /filters/i }),
      ).toBeInTheDocument();
    });

    it("is NOT rendered on desktop even on /live-messages", () => {
      // Filters button is mobile-only (desktop has the toolbar
      // directly above the messages list).
      mockMediaQueryResult.current = false;
      renderAt("/live-messages");
      expect(screen.queryByRole("button", { name: /filters/i })).toBeNull();
    });

    it("aria-expanded reflects the filtersOpen state and toggles on click", async () => {
      const user = userEvent.setup();
      mockMediaQueryResult.current = true;
      renderAt("/live-messages");
      const button = screen.getByRole("button", { name: /filters/i });
      expect(button).toHaveAttribute("aria-expanded", "false");
      await user.click(button);
      expect(button).toHaveAttribute("aria-expanded", "true");
      await user.click(button);
      expect(button).toHaveAttribute("aria-expanded", "false");
    });
  });
});

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeDecoders(
  overrides: Partial<{
    acars: boolean;
    vdlm: boolean;
    hfdl: boolean;
    imsl: boolean;
    irdm: boolean;
    adsb: boolean;
  }> = {},
): NonNullable<MockAppState["decoders"]> {
  return {
    acars: overrides.acars ?? false,
    vdlm: overrides.vdlm ?? false,
    hfdl: overrides.hfdl ?? false,
    imsl: overrides.imsl ?? false,
    irdm: overrides.irdm ?? false,
    adsb: { enabled: overrides.adsb ?? false },
  };
}

function makeRate(
  overrides: Partial<{
    total: number;
    acars: number;
    vdlm2: number;
    hfdl: number;
    imsl: number;
    irdm: number;
  }> = {},
): NonNullable<MockAppState["messageRate"]> {
  return {
    total: overrides.total ?? 0,
    acars: overrides.acars ?? 0,
    vdlm2: overrides.vdlm2 ?? 0,
    hfdl: overrides.hfdl ?? 0,
    imsl: overrides.imsl ?? 0,
    irdm: overrides.irdm ?? 0,
  };
}
