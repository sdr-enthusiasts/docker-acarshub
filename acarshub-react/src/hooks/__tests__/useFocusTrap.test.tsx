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

/**
 * Tests for useFocusTrap (FE-MODAL-A11Y).
 *
 * Modal.tsx previously had no focus trap at all: Tab/Shift+Tab could walk
 * focus straight out of an open dialog into the underlying page, a WCAG 2.1
 * AA violation (SC 2.4.3). This suite pins the trap's contract directly
 * (rather than only indirectly through Modal.test.tsx) so the containment
 * logic can be verified in isolation from Modal's other responsibilities.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { getFocusableElements, useFocusTrap } from "../useFocusTrap";

interface HarnessProps {
  isActive: boolean;
  focusableCount?: number;
}

/** Minimal harness: a trigger button before the trap, the trapped container
 * with N focusable buttons inside, and a decoy button after — mirrors the
 * "modal rendered inline, not portalled" structure of the real App tree. */
function Harness({ isActive, focusableCount = 3 }: HarnessProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, isActive);

  // Built outside the JSX so each label is a stable, content-derived key
  // (rather than a positional array index) — the buttons never reorder
  // within a single test, but this keeps the harness itself lint-clean.
  const labels = Array.from(
    { length: focusableCount },
    (_, index) => `Inside ${index}`,
  );

  return (
    <div>
      <button type="button">Trigger</button>
      <div ref={containerRef} tabIndex={-1} data-testid="container">
        {labels.map((label) => (
          <button key={label} type="button">
            {label}
          </button>
        ))}
      </div>
      <button type="button">After</button>
    </div>
  );
}

describe("getFocusableElements", () => {
  function makeContainer(html: string): HTMLElement {
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    return container;
  }

  it("returns focusable elements in DOM order", () => {
    const container = makeContainer(
      '<a href="#a">Link</a><button>Button</button><input />',
    );
    const elements = getFocusableElements(container);
    expect(elements.map((el) => el.tagName)).toEqual(["A", "BUTTON", "INPUT"]);
  });

  it("excludes disabled form elements", () => {
    const container = makeContainer(
      "<button disabled>Nope</button><button>Yes</button>",
    );
    const elements = getFocusableElements(container);
    expect(elements).toHaveLength(1);
    expect(elements[0].textContent).toBe("Yes");
  });

  it('excludes elements with tabindex="-1"', () => {
    const container = makeContainer(
      '<button tabindex="-1">Removed from tab order</button><button>Reachable</button>',
    );
    const elements = getFocusableElements(container);
    expect(elements).toHaveLength(1);
    expect(elements[0].textContent).toBe("Reachable");
  });

  it("includes elements with a non-negative explicit tabindex", () => {
    const container = makeContainer(
      '<div tabindex="0" data-testid="custom">Custom</div>',
    );
    const elements = getFocusableElements(container);
    expect(elements).toHaveLength(1);
  });

  it('excludes elements hidden from assistive technology via aria-hidden="true"', () => {
    const container = makeContainer(
      '<button aria-hidden="true">Hidden</button><button>Visible</button>',
    );
    const elements = getFocusableElements(container);
    expect(elements).toHaveLength(1);
    expect(elements[0].textContent).toBe("Visible");
  });

  it("returns an empty array when there are no focusable descendants", () => {
    const container = makeContainer("<p>Just text</p>");
    expect(getFocusableElements(container)).toEqual([]);
  });
});

describe("useFocusTrap", () => {
  it("moves focus to the first focusable descendant when activated", () => {
    render(<Harness isActive={true} />);
    expect(screen.getByText("Inside 0")).toHaveFocus();
  });

  it("focuses the container itself when it has no focusable descendants", () => {
    render(<Harness isActive={true} focusableCount={0} />);
    expect(screen.getByTestId("container")).toHaveFocus();
  });

  it("does not move focus when inactive", () => {
    render(<Harness isActive={false} />);
    // Nothing to assert "is" focused other than that it is NOT the inside
    // button — jsdom defaults document.activeElement to <body> pre-focus.
    expect(screen.getByText("Inside 0")).not.toHaveFocus();
  });

  it("wraps Tab on the last focusable element to the first", () => {
    render(<Harness isActive={true} focusableCount={3} />);
    const last = screen.getByText("Inside 2");
    last.focus();
    expect(last).toHaveFocus();

    fireEvent.keyDown(last, { key: "Tab" });

    expect(screen.getByText("Inside 0")).toHaveFocus();
  });

  it("wraps Shift+Tab on the first focusable element to the last", () => {
    render(<Harness isActive={true} focusableCount={3} />);
    const first = screen.getByText("Inside 0");
    // Activation already focused "Inside 0"; re-focus explicitly for clarity.
    first.focus();

    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });

    expect(screen.getByText("Inside 2")).toHaveFocus();
  });

  it("does not wrap when Tab is pressed on a middle element", () => {
    render(<Harness isActive={true} focusableCount={3} />);
    const middle = screen.getByText("Inside 1");
    middle.focus();

    // Regression guard: the trap must only intervene at the boundaries.
    // Firing Tab here and asserting focus is unchanged proves the handler
    // returned early instead of always forcing focus to "first"/"last".
    fireEvent.keyDown(middle, { key: "Tab" });

    expect(middle).toHaveFocus();
  });

  it("re-pins focus to the container when Tab is pressed with no focusable descendants", () => {
    render(<Harness isActive={true} focusableCount={0} />);
    const container = screen.getByTestId("container");
    expect(container).toHaveFocus();

    fireEvent.keyDown(container, { key: "Tab" });

    expect(container).toHaveFocus();
  });

  it("restores focus to the trigger element when deactivated", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "External Trigger";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(trigger).toHaveFocus();

    const { rerender } = render(<Harness isActive={false} />);
    // Activating the trap should steal focus from the external trigger.
    rerender(<Harness isActive={true} />);
    expect(screen.getByText("Inside 0")).toHaveFocus();

    // Deactivating should give it back — this is the "Focus should return
    // to trigger after closing modal" contract from e2e/accessibility.spec.ts,
    // pinned here deterministically at the unit level.
    rerender(<Harness isActive={false} />);
    expect(trigger).toHaveFocus();

    document.body.removeChild(trigger);
  });

  it("restores focus to the trigger element on unmount", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "External Trigger";
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(<Harness isActive={true} />);
    expect(screen.getByText("Inside 0")).toHaveFocus();

    unmount();

    expect(trigger).toHaveFocus();
    document.body.removeChild(trigger);
  });

  it("does not throw when restoring focus to an element removed from the document", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(<Harness isActive={true} />);
    // Simulate the trigger having been removed from the DOM while the
    // modal was open (e.g. the page navigated).
    document.body.removeChild(trigger);

    expect(() => rerender(<Harness isActive={false} />)).not.toThrow();
  });
});
