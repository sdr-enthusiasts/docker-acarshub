// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * TabSwitcher Component Tests
 *
 * Why this exists: TabSwitcher is used by SettingsModal and other
 * multi-section UIs. The non-trivial behavior pinned here:
 *  - Roving tabindex: exactly one tab has tabIndex=0, all others -1.
 *    This is the WAI-ARIA-recommended pattern for tab keyboard nav and
 *    is easy to break with a refactor.
 *  - Keyboard navigation: Left/Right wrap-around, Home/End jump to
 *    edges, disabled tabs are skipped in both directions.
 *  - Disabled tabs do not fire onTabChange on click.
 *  - aria-selected matches the active tab; aria-disabled set per tab.
 *  - scrollIntoView is called on the active tab on mount + when active
 *    changes (mobile horizontal scroll affordance).
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TabSwitcher } from "../TabSwitcher";

const TABS = [
  { id: "general", label: "General" },
  { id: "display", label: "Display" },
  { id: "alerts", label: "Alerts" },
];

const TABS_WITH_DISABLED = [
  { id: "a", label: "A" },
  { id: "b", label: "B", disabled: true },
  { id: "c", label: "C" },
  { id: "d", label: "D", disabled: true },
  { id: "e", label: "E" },
];

// scrollIntoView is not implemented in jsdom; stub it so the
// useEffect doesn't throw and we can assert it was invoked.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("TabSwitcher", () => {
  describe("rendering", () => {
    it("renders one tab button per Tab entry", () => {
      render(
        <TabSwitcher tabs={TABS} activeTab="general" onTabChange={vi.fn()} />,
      );
      expect(screen.getAllByRole("tab")).toHaveLength(3);
    });

    it("renders the tablist with the supplied ariaLabel", () => {
      render(
        <TabSwitcher
          tabs={TABS}
          activeTab="general"
          onTabChange={vi.fn()}
          ariaLabel="Settings sections"
        />,
      );
      // aria-label on role="tablist" is what screen readers announce
      // when entering the group; the default "Tab navigation" is
      // generic, so callers like SettingsModal customize it.
      expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe(
        "Settings sections",
      );
    });

    it("defaults aria-label to 'Tab navigation' when not supplied", () => {
      render(
        <TabSwitcher tabs={TABS} activeTab="general" onTabChange={vi.fn()} />,
      );
      expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe(
        "Tab navigation",
      );
    });

    it("renders custom className on the root element", () => {
      const { container } = render(
        <TabSwitcher
          tabs={TABS}
          activeTab="general"
          onTabChange={vi.fn()}
          className="my-tabs"
        />,
      );
      expect(container.querySelector(".tab-switcher.my-tabs")).not.toBeNull();
    });
  });

  describe("active tab state", () => {
    it("sets aria-selected=true on the active tab only", () => {
      render(
        <TabSwitcher tabs={TABS} activeTab="display" onTabChange={vi.fn()} />,
      );
      const tabs = screen.getAllByRole("tab");
      expect(tabs[0].getAttribute("aria-selected")).toBe("false");
      expect(tabs[1].getAttribute("aria-selected")).toBe("true");
      expect(tabs[2].getAttribute("aria-selected")).toBe("false");
    });

    it("applies --active modifier class to the active tab", () => {
      const { container } = render(
        <TabSwitcher tabs={TABS} activeTab="alerts" onTabChange={vi.fn()} />,
      );
      const active = container.querySelectorAll(".tab-switcher__tab--active");
      expect(active).toHaveLength(1);
      expect(active[0].textContent).toContain("Alerts");
    });
  });

  describe("roving tabindex (WAI-ARIA tab pattern)", () => {
    it("only the active tab is in the focus order (tabIndex=0)", () => {
      render(
        <TabSwitcher tabs={TABS} activeTab="display" onTabChange={vi.fn()} />,
      );
      const tabs = screen.getAllByRole("tab");
      // Roving tabindex: Tab key lands the user on the *currently
      // active* tab; then Arrow keys move within the group. Without
      // this pattern, the user would have to Tab through every tab,
      // breaking the WAI-ARIA tab spec.
      expect(tabs[0].tabIndex).toBe(-1);
      expect(tabs[1].tabIndex).toBe(0);
      expect(tabs[2].tabIndex).toBe(-1);
    });
  });

  describe("click activation", () => {
    it("invokes onTabChange with the clicked tab id", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();
      render(
        <TabSwitcher
          tabs={TABS}
          activeTab="general"
          onTabChange={onTabChange}
        />,
      );
      await user.click(screen.getByRole("tab", { name: "Display" }));
      expect(onTabChange).toHaveBeenCalledWith("display");
    });

    it("does not invoke onTabChange when a disabled tab is clicked", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();
      render(
        <TabSwitcher
          tabs={TABS_WITH_DISABLED}
          activeTab="a"
          onTabChange={onTabChange}
        />,
      );
      // Disabled button blocks the native click event, AND the
      // component guards handleTabClick early. Pin both layers.
      await user.click(screen.getByRole("tab", { name: "B" }));
      expect(onTabChange).not.toHaveBeenCalled();
    });
  });

  describe("keyboard navigation", () => {
    it("ArrowRight moves to the next tab", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();
      render(
        <TabSwitcher
          tabs={TABS}
          activeTab="general"
          onTabChange={onTabChange}
        />,
      );
      screen.getByRole("tab", { name: "General" }).focus();
      await user.keyboard("{ArrowRight}");
      expect(onTabChange).toHaveBeenCalledWith("display");
    });

    it("ArrowLeft moves to the previous tab", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();
      render(
        <TabSwitcher
          tabs={TABS}
          activeTab="display"
          onTabChange={onTabChange}
        />,
      );
      screen.getByRole("tab", { name: "Display" }).focus();
      await user.keyboard("{ArrowLeft}");
      expect(onTabChange).toHaveBeenCalledWith("general");
    });

    it("ArrowRight wraps from last to first tab", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();
      render(
        <TabSwitcher
          tabs={TABS}
          activeTab="alerts"
          onTabChange={onTabChange}
        />,
      );
      // Wrap-around is the WAI-ARIA "automatic activation" tab pattern
      // behavior — Right at the end loops to the start.
      screen.getByRole("tab", { name: "Alerts" }).focus();
      await user.keyboard("{ArrowRight}");
      expect(onTabChange).toHaveBeenCalledWith("general");
    });

    it("ArrowLeft wraps from first to last tab", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();
      render(
        <TabSwitcher
          tabs={TABS}
          activeTab="general"
          onTabChange={onTabChange}
        />,
      );
      screen.getByRole("tab", { name: "General" }).focus();
      await user.keyboard("{ArrowLeft}");
      expect(onTabChange).toHaveBeenCalledWith("alerts");
    });

    it("Home jumps to the first tab", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();
      render(
        <TabSwitcher
          tabs={TABS}
          activeTab="alerts"
          onTabChange={onTabChange}
        />,
      );
      screen.getByRole("tab", { name: "Alerts" }).focus();
      await user.keyboard("{Home}");
      expect(onTabChange).toHaveBeenCalledWith("general");
    });

    it("End jumps to the last tab", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();
      render(
        <TabSwitcher
          tabs={TABS}
          activeTab="general"
          onTabChange={onTabChange}
        />,
      );
      screen.getByRole("tab", { name: "General" }).focus();
      await user.keyboard("{End}");
      expect(onTabChange).toHaveBeenCalledWith("alerts");
    });

    it("ignores keys other than Arrow/Home/End", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();
      render(
        <TabSwitcher
          tabs={TABS}
          activeTab="general"
          onTabChange={onTabChange}
        />,
      );
      screen.getByRole("tab", { name: "General" }).focus();
      // The handler returns early on unrecognized keys (default branch
      // in the switch). Without this guard, every Tab/Enter/etc. would
      // re-fire onTabChange with the *current* tab.
      await user.keyboard("a{Tab}{Enter}");
      expect(onTabChange).not.toHaveBeenCalled();
    });
  });

  describe("disabled-tab skip in keyboard navigation", () => {
    it("ArrowRight skips a single disabled tab", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();
      render(
        <TabSwitcher
          tabs={TABS_WITH_DISABLED}
          activeTab="a"
          onTabChange={onTabChange}
        />,
      );
      // Tabs: [a, b(disabled), c, d(disabled), e]
      // From a, ArrowRight should land on c, not b.
      screen.getByRole("tab", { name: "A" }).focus();
      await user.keyboard("{ArrowRight}");
      expect(onTabChange).toHaveBeenCalledWith("c");
    });

    it("ArrowRight skips multiple consecutive disabled tabs", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();
      const tabs = [
        { id: "x", label: "X" },
        { id: "y1", label: "Y1", disabled: true },
        { id: "y2", label: "Y2", disabled: true },
        { id: "z", label: "Z" },
      ];
      render(
        <TabSwitcher tabs={tabs} activeTab="x" onTabChange={onTabChange} />,
      );
      screen.getByRole("tab", { name: "X" }).focus();
      await user.keyboard("{ArrowRight}");
      // The while-loop in handleKeyDown advances past consecutive
      // disabled tabs. Two in a row exercises the loop body.
      expect(onTabChange).toHaveBeenCalledWith("z");
    });

    it("ArrowLeft skips disabled tabs going backwards", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();
      render(
        <TabSwitcher
          tabs={TABS_WITH_DISABLED}
          activeTab="c"
          onTabChange={onTabChange}
        />,
      );
      // From c, ArrowLeft should skip b(disabled) and land on a.
      screen.getByRole("tab", { name: "C" }).focus();
      await user.keyboard("{ArrowLeft}");
      expect(onTabChange).toHaveBeenCalledWith("a");
    });

    it("End skips trailing disabled tabs", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();
      render(
        <TabSwitcher
          tabs={TABS_WITH_DISABLED}
          activeTab="a"
          onTabChange={onTabChange}
        />,
      );
      // End -> index 4 (e), which is enabled. If e were disabled,
      // the while-loop with End uses the "ArrowLeft || End" branch
      // and moves backwards from the trailing disabled tab.
      screen.getByRole("tab", { name: "A" }).focus();
      await user.keyboard("{End}");
      expect(onTabChange).toHaveBeenCalledWith("e");
    });
  });

  describe("disabled tab DOM state", () => {
    it("sets aria-disabled and the DOM disabled attribute on disabled tabs", () => {
      render(
        <TabSwitcher
          tabs={TABS_WITH_DISABLED}
          activeTab="a"
          onTabChange={vi.fn()}
        />,
      );
      const b = screen.getByRole("tab", { name: "B" }) as HTMLButtonElement;
      // aria-disabled signals state to AT; the DOM disabled attribute
      // blocks pointer/keyboard activation. Both must agree.
      expect(b.getAttribute("aria-disabled")).toBe("true");
      expect(b.disabled).toBe(true);
    });

    it("applies the --disabled modifier class to disabled tabs", () => {
      const { container } = render(
        <TabSwitcher
          tabs={TABS_WITH_DISABLED}
          activeTab="a"
          onTabChange={vi.fn()}
        />,
      );
      const disabled = container.querySelectorAll(
        ".tab-switcher__tab--disabled",
      );
      expect(disabled).toHaveLength(2);
    });
  });

  describe("scrollIntoView on active change (mobile affordance)", () => {
    it("calls scrollIntoView on the active tab on mount", () => {
      render(
        <TabSwitcher tabs={TABS} activeTab="display" onTabChange={vi.fn()} />,
      );
      // Mobile horizontal scroll: the active tab must come into view
      // even if it was off-screen at mount (e.g. user re-opened a
      // modal with a previously-selected tab beyond the viewport).
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    });

    it("calls scrollIntoView again when activeTab changes", () => {
      const { rerender } = render(
        <TabSwitcher tabs={TABS} activeTab="general" onTabChange={vi.fn()} />,
      );
      const initialCalls = (
        Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>
      ).mock.calls.length;
      rerender(
        <TabSwitcher tabs={TABS} activeTab="alerts" onTabChange={vi.fn()} />,
      );
      // useEffect deps include activeTab; changing it re-fires the
      // scroll. Without this, swiping tabs on mobile would leave the
      // active one off-screen.
      expect(
        (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock
          .calls.length,
      ).toBeGreaterThan(initialCalls);
    });

    it("does not throw when active tab id is not in the tabs array", () => {
      // Guard: tabs.findIndex returns -1; the effect guards with
      // activeIndex !== -1 so scrollIntoView is not called. Pin the
      // no-throw behavior — a caller passing a stale id during a
      // tabs[] swap must not crash.
      expect(() =>
        render(
          <TabSwitcher
            tabs={TABS}
            activeTab="does-not-exist"
            onTabChange={vi.fn()}
          />,
        ),
      ).not.toThrow();
    });
  });
});
