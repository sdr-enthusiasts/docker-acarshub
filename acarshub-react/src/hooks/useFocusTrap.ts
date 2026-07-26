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

// ----------------------------------------------------------------------------
// FE-MODAL-A11Y: extracted from components/Modal.tsx.
//
// WCAG 2.1 AA requires that a modal dialog trap keyboard focus while open —
// Tab/Shift+Tab must cycle only through the dialog's own focusable content,
// never escape into the underlying page (SC 2.4.3 Focus Order / the WAI-ARIA
// APG "Dialog (Modal)" pattern). Modal.tsx previously had no such trap: a
// keyboard user pressing Tab enough times would walk right past the last
// focusable element in the dialog and into whatever followed it in the DOM.
// ----------------------------------------------------------------------------

import { type RefObject, useEffect, useRef } from "react";

/**
 * CSS selector for elements that are potentially part of the natural Tab
 * order. This is intentionally broader than the final answer — an explicit
 * `tabindex="-1"` still matches `button`, `input`, etc. here (CSS attribute
 * selectors can't express "AND NOT" across two different attributes in one
 * simple clause), so `getFocusableElements` applies the `disabled` /
 * `tabindex` / `aria-hidden` exclusions itself after querying.
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "textarea",
  "input",
  "select",
  "[tabindex]",
].join(", ");

/**
 * Returns every element inside `container` that is part of the natural Tab
 * order, in DOM (i.e. Tab) order. Excludes disabled form controls, elements
 * explicitly removed from the tab order via `tabindex="-1"` or a negative
 * tabindex (including the dialog container itself, which the trap gives
 * `tabIndex={-1}` so it can still receive *programmatic* focus as a
 * fallback), and elements hidden from assistive technology via
 * `aria-hidden="true"`.
 *
 * Exported as a standalone pure function so the element-selection logic can
 * be unit-tested directly against plain DOM fixtures, without needing to
 * mount the hook.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => {
    if (element.hasAttribute("disabled")) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;

    const tabIndexAttr = element.getAttribute("tabindex");
    if (tabIndexAttr !== null && Number(tabIndexAttr) < 0) return false;

    return true;
  });
}

/**
 * useFocusTrap
 *
 * Traps keyboard focus within `containerRef` while `isActive` is true:
 *
 * 1. On activation, remembers whatever element currently has focus (the
 *    "trigger"), then moves focus to the first focusable element inside the
 *    container — or to the container itself (which must carry
 *    `tabIndex={-1}`) if it has no focusable descendants.
 * 2. While active, intercepts Tab/Shift+Tab: pressing Tab on the last
 *    focusable element wraps to the first; pressing Shift+Tab on the first
 *    wraps to the last. Focus can never land outside the container via
 *    keyboard while the trap is active.
 * 3. On deactivation (or unmount), restores focus to the trigger element —
 *    provided it is still attached to the document.
 *
 * @param containerRef - Ref to the element that bounds the trap. Must be
 *   rendered with `tabIndex={-1}` so it is a valid focus target even when it
 *   has no focusable children.
 * @param isActive - Whether the trap is currently engaged (typically the
 *   modal's own `isOpen`).
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  isActive: boolean,
): void {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Effect 1: on activate, remember the trigger element and move focus into
  // the container. On deactivate/unmount, restore focus to the trigger.
  useEffect(() => {
    if (!isActive) return;

    const container = containerRef.current;
    if (!container) return;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const [firstFocusable] = getFocusableElements(container);
    (firstFocusable ?? container).focus();

    return () => {
      const toRestore = previouslyFocusedRef.current;
      if (toRestore && document.body.contains(toRestore)) {
        toRestore.focus();
      }
      previouslyFocusedRef.current = null;
    };
  }, [isActive, containerRef]);

  // Effect 2: contain Tab/Shift+Tab within the container while active.
  useEffect(() => {
    if (!isActive) return;

    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        // No focusable descendants: keep focus pinned to the container.
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !container.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [isActive, containerRef]);
}
