// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * ContextMenu Component Tests
 *
 * Why this exists: ContextMenu is a generic right-click menu used
 * across the app (map markers, message rows). It bundles four pieces
 * of behaviour that are individually easy to regress and collectively
 * define the UX contract:
 *
 *  1. Item dispatch — clicking or pressing Enter/Space on an enabled
 *     item must fire `item.onClick()` AND `onClose()`. Forgetting
 *     onClose leaves the menu stuck open ("ghost menu"); forgetting
 *     onClick is the obvious dead-button regression.
 *
 *  2. Disabled handling — disabled items must NOT fire onClick or
 *     onClose, regardless of how they're triggered (click or keyboard
 *     when focused). A regression here silently runs the action even
 *     though the UI says "no".
 *
 *  3. Keyboard navigation — ArrowDown/Up wrap; the index counts only
 *     enabled, non-divider items (the filter is non-obvious). Escape
 *     closes. Enter/Space activate. A regression in the filter would
 *     "focus" a divider and the next Enter would do nothing.
 *
 *  4. Click-outside dismissal — after a 100ms grace period (to avoid
 *     the right-click that opened the menu immediately closing it),
 *     a mousedown outside the menu calls onClose; inside does not.
 *     Inverting this is the single most common regression surface
 *     for context menus.
 *
 * Viewport-clamping (setposX/setposY) and the focus-on-mount effect
 * are also pinned, more lightly: they only set CSS custom properties
 * and call .focus(), so we assert against the inline style and the
 * active element rather than re-deriving the math.
 */

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextMenu, type ContextMenuItem } from "../ContextMenu";

/**
 * Build a typed item with sensible defaults. Tests override only the
 * fields they care about so the surface under test is obvious.
 */
function makeItem(
  partial: Partial<ContextMenuItem> & Pick<ContextMenuItem, "id">,
): ContextMenuItem {
  return {
    label: partial.id,
    onClick: vi.fn(),
    ...partial,
  };
}

/**
 * 100ms grace period before the click-outside listener registers.
 * Tests that exercise click-outside MUST advance fake timers past
 * this. Anything less and the listener isn't attached yet.
 */
const CLICK_OUTSIDE_GRACE_MS = 150;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ContextMenu", () => {
  describe("render structure (a11y + DOM contract)", () => {
    it("renders a menu with role=menu and aria-label", () => {
      const { container } = render(
        <ContextMenu
          x={10}
          y={10}
          items={[makeItem({ id: "a" })]}
          onClose={vi.fn()}
        />,
      );
      const menu = container.querySelector('[role="menu"]');
      expect(menu).not.toBeNull();
      expect(menu?.getAttribute("aria-label")).toBe("Context menu");
    });

    it("renders each enabled item as a button with role=menuitem", () => {
      const items: ContextMenuItem[] = [
        makeItem({ id: "a", label: "Alpha" }),
        makeItem({ id: "b", label: "Beta" }),
      ];
      const { container } = render(
        <ContextMenu x={10} y={10} items={items} onClose={vi.fn()} />,
      );
      const buttons = container.querySelectorAll('[role="menuitem"]');
      expect(buttons.length).toBe(2);
      expect(buttons[0]?.textContent).toContain("Alpha");
      expect(buttons[1]?.textContent).toContain("Beta");
    });

    it("renders dividers as <hr>, not as buttons", () => {
      // Critical: a divider rendered as a button would be focusable
      // and keyboard-navigable, breaking the "skip dividers" UX.
      const items: ContextMenuItem[] = [
        makeItem({ id: "a", label: "Alpha" }),
        makeItem({ id: "divider-1", divider: true }),
        makeItem({ id: "b", label: "Beta" }),
      ];
      const { container } = render(
        <ContextMenu x={10} y={10} items={items} onClose={vi.fn()} />,
      );
      expect(
        container.querySelectorAll("hr.context-menu__divider").length,
      ).toBe(1);
      // Dividers must NOT be present in the menuitem set.
      expect(container.querySelectorAll('[role="menuitem"]').length).toBe(2);
    });

    it("applies the variant class to each item", () => {
      // Catppuccin theming hooks off these classes. Losing them
      // silently un-styles primary/danger affordances.
      const items: ContextMenuItem[] = [
        makeItem({ id: "a", variant: "primary" }),
        makeItem({ id: "b", variant: "danger" }),
        makeItem({ id: "c" }), // default
      ];
      const { container } = render(
        <ContextMenu x={10} y={10} items={items} onClose={vi.fn()} />,
      );
      const buttons =
        container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      expect(buttons[0]?.className).toContain("context-menu__item--primary");
      expect(buttons[1]?.className).toContain("context-menu__item--danger");
      expect(buttons[2]?.className).toContain("context-menu__item--default");
    });

    it("renders the icon when provided and omits it when absent", () => {
      const items: ContextMenuItem[] = [
        makeItem({ id: "with", icon: "🚀" }),
        makeItem({ id: "without" }),
      ];
      const { container } = render(
        <ContextMenu x={10} y={10} items={items} onClose={vi.fn()} />,
      );
      const icons = container.querySelectorAll(".context-menu__icon");
      expect(icons.length).toBe(1);
      expect(icons[0]?.textContent).toBe("🚀");
    });

    it("marks disabled items via disabled attribute and aria-disabled", () => {
      const items: ContextMenuItem[] = [makeItem({ id: "a", disabled: true })];
      const { container } = render(
        <ContextMenu x={10} y={10} items={items} onClose={vi.fn()} />,
      );
      const button =
        container.querySelector<HTMLButtonElement>('[role="menuitem"]');
      expect(button?.disabled).toBe(true);
      expect(button?.getAttribute("aria-disabled")).toBe("true");
    });

    it("exposes posX/posY via CSS custom properties for SCSS positioning", () => {
      // SCSS reads --ctx-menu-x / --ctx-menu-y to position the menu.
      // Losing this contract silently breaks placement.
      const { container } = render(
        <ContextMenu
          x={42}
          y={73}
          items={[makeItem({ id: "a" })]}
          onClose={vi.fn()}
        />,
      );
      const menu = container.querySelector<HTMLElement>('[role="menu"]');
      // jsdom gives the menu zero size, so the clamp branches don't
      // fire and the initial (x, y) survive after the layout effect.
      expect(menu?.style.getPropertyValue("--ctx-menu-x")).toBe("42px");
      expect(menu?.style.getPropertyValue("--ctx-menu-y")).toBe("73px");
    });
  });

  describe("item dispatch", () => {
    it("calls item.onClick AND onClose when an enabled item is clicked", () => {
      // Both must fire. Forgetting onClose leaves a ghost menu;
      // forgetting onClick is dead-button regression.
      const onClick = vi.fn();
      const onClose = vi.fn();
      const items: ContextMenuItem[] = [makeItem({ id: "a", onClick })];

      const { container } = render(
        <ContextMenu x={10} y={10} items={items} onClose={onClose} />,
      );
      const button =
        container.querySelector<HTMLButtonElement>('[role="menuitem"]');
      fireEvent.click(button!);

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does NOT call onClick or onClose when a disabled item is clicked", () => {
      // Disabled buttons in HTML drop click events themselves, but
      // we also have an explicit `if (item.disabled) return;` guard
      // in handleItemClick. Pinning both layers.
      const onClick = vi.fn();
      const onClose = vi.fn();
      const items: ContextMenuItem[] = [
        makeItem({ id: "a", onClick, disabled: true }),
      ];

      const { container } = render(
        <ContextMenu x={10} y={10} items={items} onClose={onClose} />,
      );
      const button =
        container.querySelector<HTMLButtonElement>('[role="menuitem"]');
      fireEvent.click(button!);

      expect(onClick).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("keyboard navigation", () => {
    it("activates the focused item on Enter", () => {
      const onClickA = vi.fn();
      const onClickB = vi.fn();
      const onClose = vi.fn();
      const items: ContextMenuItem[] = [
        makeItem({ id: "a", onClick: onClickA }),
        makeItem({ id: "b", onClick: onClickB }),
      ];

      render(<ContextMenu x={10} y={10} items={items} onClose={onClose} />);

      // focusedIndex starts at 0; Enter fires the first enabled item.
      fireEvent.keyDown(document, { key: "Enter" });

      expect(onClickA).toHaveBeenCalledTimes(1);
      expect(onClickB).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("activates the focused item on Space", () => {
      // The space key is the second activator per ARIA menuitem
      // convention. A regression that drops it silently breaks
      // keyboard parity with native menus.
      const onClick = vi.fn();
      const onClose = vi.fn();
      const items: ContextMenuItem[] = [makeItem({ id: "a", onClick })];

      render(<ContextMenu x={10} y={10} items={items} onClose={onClose} />);
      fireEvent.keyDown(document, { key: " " });

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("ArrowDown moves focus to the next enabled item", () => {
      const onClickA = vi.fn();
      const onClickB = vi.fn();
      const items: ContextMenuItem[] = [
        makeItem({ id: "a", onClick: onClickA }),
        makeItem({ id: "b", onClick: onClickB }),
      ];

      render(<ContextMenu x={10} y={10} items={items} onClose={vi.fn()} />);
      fireEvent.keyDown(document, { key: "ArrowDown" });
      fireEvent.keyDown(document, { key: "Enter" });

      expect(onClickA).not.toHaveBeenCalled();
      expect(onClickB).toHaveBeenCalledTimes(1);
    });

    it("ArrowDown wraps from the last item back to the first", () => {
      const onClickA = vi.fn();
      const items: ContextMenuItem[] = [
        makeItem({ id: "a", onClick: onClickA }),
        makeItem({ id: "b" }),
      ];

      render(<ContextMenu x={10} y={10} items={items} onClose={vi.fn()} />);
      fireEvent.keyDown(document, { key: "ArrowDown" }); // → 1
      fireEvent.keyDown(document, { key: "ArrowDown" }); // → 0 (wrap)
      fireEvent.keyDown(document, { key: "Enter" });

      expect(onClickA).toHaveBeenCalledTimes(1);
    });

    it("ArrowUp wraps from the first item to the last", () => {
      const onClickB = vi.fn();
      const items: ContextMenuItem[] = [
        makeItem({ id: "a" }),
        makeItem({ id: "b", onClick: onClickB }),
      ];

      render(<ContextMenu x={10} y={10} items={items} onClose={vi.fn()} />);
      // focusedIndex starts at 0; ArrowUp wraps to the last enabled.
      fireEvent.keyDown(document, { key: "ArrowUp" });
      fireEvent.keyDown(document, { key: "Enter" });

      expect(onClickB).toHaveBeenCalledTimes(1);
    });

    it("keyboard navigation skips disabled items and dividers", () => {
      // This is the non-obvious bit: focusedIndex counts ONLY
      // enabled, non-divider items. A regression in the
      // enabledItems filter would let a divider or disabled item
      // be "focused" and Enter would do nothing.
      const onClickA = vi.fn();
      const onClickC = vi.fn();
      const items: ContextMenuItem[] = [
        makeItem({ id: "a", onClick: onClickA }),
        makeItem({ id: "div", divider: true }),
        makeItem({ id: "b", disabled: true }),
        makeItem({ id: "c", onClick: onClickC }),
      ];

      render(<ContextMenu x={10} y={10} items={items} onClose={vi.fn()} />);
      // From index 0 (a), one ArrowDown should land on c (skipping
      // divider and disabled b).
      fireEvent.keyDown(document, { key: "ArrowDown" });
      fireEvent.keyDown(document, { key: "Enter" });

      expect(onClickA).not.toHaveBeenCalled();
      expect(onClickC).toHaveBeenCalledTimes(1);
    });

    it("Escape calls onClose", () => {
      const onClose = vi.fn();
      render(
        <ContextMenu
          x={10}
          y={10}
          items={[makeItem({ id: "a" })]}
          onClose={onClose}
        />,
      );
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("Escape does NOT fire any item.onClick", () => {
      // Regression guard for an accidental switch fall-through.
      const onClick = vi.fn();
      render(
        <ContextMenu
          x={10}
          y={10}
          items={[makeItem({ id: "a", onClick })]}
          onClose={vi.fn()}
        />,
      );
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("click-outside dismissal", () => {
    it("calls onClose when mousedown occurs outside the menu (after the grace period)", () => {
      const onClose = vi.fn();
      render(
        <ContextMenu
          x={10}
          y={10}
          items={[makeItem({ id: "a" })]}
          onClose={onClose}
        />,
      );

      // Before the grace period elapses, no listener is attached.
      fireEvent.mouseDown(document.body);
      expect(onClose).not.toHaveBeenCalled();

      // Advance past the 100ms grace period.
      act(() => {
        vi.advanceTimersByTime(CLICK_OUTSIDE_GRACE_MS);
      });

      fireEvent.mouseDown(document.body);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does NOT call onClose when mousedown occurs inside the menu", () => {
      // The single most common context-menu regression: a menu that
      // closes itself the moment you try to click an item.
      const onClose = vi.fn();
      const { container } = render(
        <ContextMenu
          x={10}
          y={10}
          items={[makeItem({ id: "a" })]}
          onClose={onClose}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(CLICK_OUTSIDE_GRACE_MS);
      });

      const menu = container.querySelector('[role="menu"]') as HTMLElement;
      fireEvent.mouseDown(menu);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("removes the click-outside listener on unmount", () => {
      // Regression guard: a leaked listener would call onClose on
      // an unmounted component, which React would warn about
      // ("Can't perform state update on unmounted component") AND
      // the stale closure would invoke a stale onClose. We assert
      // the cleanup ran by counting addEventListener / removeEventListener
      // pairs.
      const addSpy = vi.spyOn(document, "addEventListener");
      const removeSpy = vi.spyOn(document, "removeEventListener");

      const { unmount } = render(
        <ContextMenu
          x={10}
          y={10}
          items={[makeItem({ id: "a" })]}
          onClose={vi.fn()}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(CLICK_OUTSIDE_GRACE_MS);
      });

      const addedMousedown = addSpy.mock.calls.filter(
        ([type]) => type === "mousedown",
      ).length;
      expect(addedMousedown).toBeGreaterThan(0);

      unmount();

      const removedMousedown = removeSpy.mock.calls.filter(
        ([type]) => type === "mousedown",
      ).length;
      expect(removedMousedown).toBeGreaterThanOrEqual(addedMousedown);

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe("focus management", () => {
    it("focuses the menu root on mount", () => {
      // Required so keyboard navigation works without an extra
      // click. A regression here leaves keyboard users dead in
      // the water.
      const { container } = render(
        <ContextMenu
          x={10}
          y={10}
          items={[makeItem({ id: "a" })]}
          onClose={vi.fn()}
        />,
      );
      const menu = container.querySelector('[role="menu"]');
      expect(document.activeElement).toBe(menu);
    });
  });

  describe("focused-item visual marker", () => {
    it("applies the --focused class to the currently focused enabled item", () => {
      // SCSS uses this class to draw the focus ring. Losing it
      // silently breaks keyboard a11y visibility.
      const items: ContextMenuItem[] = [
        makeItem({ id: "a" }),
        makeItem({ id: "b" }),
      ];
      const { container } = render(
        <ContextMenu x={10} y={10} items={items} onClose={vi.fn()} />,
      );

      const buttons =
        container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      expect(buttons[0]?.className).toContain("context-menu__item--focused");
      expect(buttons[1]?.className).not.toContain(
        "context-menu__item--focused",
      );

      fireEvent.keyDown(document, { key: "ArrowDown" });

      const updated =
        container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      expect(updated[0]?.className).not.toContain(
        "context-menu__item--focused",
      );
      expect(updated[1]?.className).toContain("context-menu__item--focused");
    });
  });
});
