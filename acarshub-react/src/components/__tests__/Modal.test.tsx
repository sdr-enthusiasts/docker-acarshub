// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Modal Component Tests
 *
 * Why this exists: Modal is the dialog container for SettingsModal and
 * other overlay surfaces. Behaviors pinned here:
 *  - Conditional render: returns null when isOpen=false (no DOM at all,
 *    not a hidden node). Important because mount-time effects on
 *    children should not fire while the modal is closed.
 *  - Body scroll lock: 'modal-open' class added on open, removed on
 *    close AND on unmount (the cleanup runs even if isOpen never
 *    flipped to false before unmount).
 *  - Escape closes the modal via a global keydown listener that is
 *    attached only while open and removed on close/unmount.
 *  - Backdrop click closes only when the click target IS the backdrop
 *    (event.target === event.currentTarget). Clicks bubbling up from
 *    children must NOT close — this is a common modal-bug source.
 *  - closeOnBackdropClick=false disables backdrop click.
 *  - aria-modal, role="dialog", aria-labelledby wiring for screen
 *    readers — carried by the inner .modal element (the dialog box),
 *    not the .modal-backdrop overlay (FE-MODAL-A11Y).
 *  - Focus trap (FE-MODAL-A11Y, via useFocusTrap): Tab/Shift+Tab cycle
 *    only within the dialog while open, and focus returns to whatever
 *    triggered the modal once it closes. The trap's containment logic
 *    itself (wrap-around math, no-focusable-descendants fallback) is
 *    unit-tested in hooks/__tests__/useFocusTrap.test.tsx; the tests
 *    here only pin that Modal wires the hook correctly end-to-end.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "../Modal";

afterEach(() => {
  // Defensive: clear any leftover body class between tests in case a
  // test renders an unclosed modal without unmounting.
  document.body.classList.remove("modal-open");
});

describe("Modal", () => {
  describe("conditional render", () => {
    it("renders nothing when isOpen=false", () => {
      const { container } = render(
        <Modal isOpen={false} onClose={vi.fn()} title="X">
          <p>content</p>
        </Modal>,
      );
      // Returning null (not display:none) means children never mount,
      // so any expensive init in child components is skipped while
      // the modal is closed.
      expect(container.firstChild).toBeNull();
    });

    it("renders the dialog when isOpen=true", () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="X">
          <p>content</p>
        </Modal>,
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("renders the title in the header", () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="My Settings">
          <p>x</p>
        </Modal>,
      );
      expect(
        screen.getByRole("heading", { name: "My Settings" }),
      ).toBeInTheDocument();
    });

    it("renders children in the modal body", () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="X">
          <p data-testid="my-content">hello body</p>
        </Modal>,
      );
      expect(screen.getByTestId("my-content")).toBeInTheDocument();
    });

    it("renders footer slot when provided", () => {
      render(
        <Modal
          isOpen={true}
          onClose={vi.fn()}
          title="X"
          footer={<button type="button">Save</button>}
        >
          <p>x</p>
        </Modal>,
      );
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    it("omits the footer element when no footer prop is provided", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={vi.fn()} title="X">
          <p>x</p>
        </Modal>,
      );
      expect(container.querySelector(".modal__footer")).toBeNull();
    });
  });

  describe("close button", () => {
    it("renders the close button by default", () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="X">
          <p>x</p>
        </Modal>,
      );
      expect(
        screen.getByRole("button", { name: "Close modal" }),
      ).toBeInTheDocument();
    });

    it("hides the close button when showCloseButton=false", () => {
      render(
        <Modal
          isOpen={true}
          onClose={vi.fn()}
          title="X"
          showCloseButton={false}
        >
          <p>x</p>
        </Modal>,
      );
      // Some confirmation dialogs deliberately omit the X to force a
      // user choice via the footer buttons. Pin this opt-out.
      expect(screen.queryByRole("button", { name: "Close modal" })).toBeNull();
    });

    it("invokes onClose when the close button is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="X">
          <p>x</p>
        </Modal>,
      );
      await user.click(screen.getByRole("button", { name: "Close modal" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Escape key", () => {
    it("invokes onClose when Escape is pressed while open", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="X">
          <p>x</p>
        </Modal>,
      );
      await user.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does NOT respond to Escape when modal is closed", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <Modal isOpen={false} onClose={onClose} title="X">
          <p>x</p>
        </Modal>,
      );
      // Regression: the keydown listener is gated by isOpen inside
      // useEffect (early return + cleanup removes it). Without this
      // gate, Escape would fire onClose for a not-rendered modal,
      // potentially triggering setState on an unrelated parent.
      await user.keyboard("{Escape}");
      expect(onClose).not.toHaveBeenCalled();
    });

    it("removes the Escape listener when modal closes (no double-fire)", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const { rerender } = render(
        <Modal isOpen={true} onClose={onClose} title="X">
          <p>x</p>
        </Modal>,
      );
      rerender(
        <Modal isOpen={false} onClose={onClose} title="X">
          <p>x</p>
        </Modal>,
      );
      await user.keyboard("{Escape}");
      // The useEffect cleanup must remove the document listener when
      // isOpen flips to false. Without that, repeatedly opening and
      // closing the modal would stack listeners and fire onClose N
      // times per Escape press.
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("backdrop click", () => {
    it("invokes onClose when the backdrop itself is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const { container } = render(
        <Modal isOpen={true} onClose={onClose} title="X">
          <p>x</p>
        </Modal>,
      );
      const backdrop = container.querySelector(
        ".modal-backdrop",
      ) as HTMLElement;
      await user.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does NOT close when a child of the backdrop is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="X">
          <button type="button" data-testid="inside-btn">
            Inside
          </button>
        </Modal>,
      );
      // Critical: target===currentTarget guard. Without it, clicking
      // any child (including inputs being typed into) would bubble up
      // and dismiss the modal — a common modal-bug regression.
      await user.click(screen.getByTestId("inside-btn"));
      expect(onClose).not.toHaveBeenCalled();
    });

    it("respects closeOnBackdropClick=false", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const { container } = render(
        <Modal
          isOpen={true}
          onClose={onClose}
          title="X"
          closeOnBackdropClick={false}
        >
          <p>x</p>
        </Modal>,
      );
      const backdrop = container.querySelector(
        ".modal-backdrop",
      ) as HTMLElement;
      await user.click(backdrop);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("does not carry a keydown handler on the backdrop (FE-MODAL-A11Y regression)", () => {
      const onClose = vi.fn();
      const { container } = render(
        <Modal isOpen={true} onClose={onClose} title="X">
          <p>x</p>
        </Modal>,
      );
      // FE-MODAL-A11Y: the backdrop previously wired an onKeyDown for
      // "Enter" but never set tabIndex, so a real browser user could
      // never actually focus the backdrop to trigger it — dead,
      // misleading code. It was removed outright: Escape (see the
      // "Escape key" describe block above) is the documented, working
      // keyboard equivalent to backdrop-click dismissal. Firing Enter
      // on the backdrop must now be a no-op.
      const backdrop = container.querySelector(
        ".modal-backdrop",
      ) as HTMLElement;
      fireEvent.keyDown(backdrop, { key: "Enter" });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("body scroll lock", () => {
    it("adds 'modal-open' class to body when opened", () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="X">
          <p>x</p>
        </Modal>,
      );
      // Prevents background scroll on mobile (and double-scrollbar on
      // desktop) while the modal is open. The class is the SCSS hook
      // applied via global selector.
      expect(document.body.classList.contains("modal-open")).toBe(true);
    });

    it("removes 'modal-open' class when modal closes (rerender)", () => {
      const { rerender } = render(
        <Modal isOpen={true} onClose={vi.fn()} title="X">
          <p>x</p>
        </Modal>,
      );
      expect(document.body.classList.contains("modal-open")).toBe(true);
      rerender(
        <Modal isOpen={false} onClose={vi.fn()} title="X">
          <p>x</p>
        </Modal>,
      );
      expect(document.body.classList.contains("modal-open")).toBe(false);
    });

    it("removes 'modal-open' class on unmount even if still open", () => {
      const { unmount } = render(
        <Modal isOpen={true} onClose={vi.fn()} title="X">
          <p>x</p>
        </Modal>,
      );
      expect(document.body.classList.contains("modal-open")).toBe(true);
      unmount();
      // Regression: useEffect cleanup must always remove the class,
      // not just when isOpen flips false. Without this, a parent that
      // unmounts a modal mid-route-transition would leave the body
      // permanently scroll-locked.
      expect(document.body.classList.contains("modal-open")).toBe(false);
    });
  });

  describe("size variants", () => {
    it("applies no size modifier for the default 'md' size", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={vi.fn()} title="X">
          <p>x</p>
        </Modal>,
      );
      // 'md' is the base size — the component intentionally omits the
      // modifier class. Asserting absence guards against a refactor
      // that always emits `modal--${size}`.
      const modal = container.querySelector(".modal") as HTMLElement;
      expect(modal.classList.contains("modal--md")).toBe(false);
    });

    it.each(["sm", "lg", "xl", "full"] as const)(
      "applies modal--%s for size=%s",
      (size) => {
        const { container } = render(
          <Modal isOpen={true} onClose={vi.fn()} title="X" size={size}>
            <p>x</p>
          </Modal>,
        );
        expect(container.querySelector(`.modal--${size}`)).not.toBeNull();
      },
    );
  });

  describe("accessibility wiring", () => {
    it("sets role='dialog' and aria-modal='true' on the .modal element, not the backdrop", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={vi.fn()} title="X">
          <p>x</p>
        </Modal>,
      );
      const dialog = screen.getByRole("dialog");
      // aria-modal=true tells AT that content outside the dialog is inert;
      // the focus trap (see "focus trap" describe block below) makes that
      // true in practice, not just declaratively.
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      // FE-MODAL-A11Y: the dialog role lives on the visible .modal box,
      // matching the WAI-ARIA APG "Dialog (Modal)" pattern — the backdrop
      // overlay is decorative (role="presentation") and does not carry
      // the dialog semantics itself.
      expect(dialog.className).toContain("modal");
      expect(
        container.querySelector(".modal-backdrop")?.getAttribute("role"),
      ).toBe("presentation");
    });

    it("links aria-labelledby to the title element via #modal-title", () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Settings">
          <p>x</p>
        </Modal>,
      );
      const dialog = screen.getByRole("dialog");
      expect(dialog.getAttribute("aria-labelledby")).toBe("modal-title");
      // The heading must carry id="modal-title" so AT can resolve the
      // label reference. Pin both ends of the link.
      const heading = screen.getByRole("heading", { name: "Settings" });
      expect(heading.getAttribute("id")).toBe("modal-title");
    });

    it("gives the dialog tabIndex=-1 so it is a valid focus target with no focusable descendants", () => {
      render(
        <Modal
          isOpen={true}
          onClose={vi.fn()}
          title="X"
          showCloseButton={false}
        >
          <p>plain text, no interactive content</p>
        </Modal>,
      );
      const dialog = screen.getByRole("dialog");
      expect(dialog.getAttribute("tabindex")).toBe("-1");
    });
  });

  describe("focus trap (FE-MODAL-A11Y)", () => {
    // The trap's own containment math (wrap-around, no-focusable-descendants
    // fallback) is exhaustively unit-tested in
    // hooks/__tests__/useFocusTrap.test.tsx. These tests only pin that Modal
    // wires useFocusTrap correctly against its real header/body/footer DOM.

    it("moves focus to the close button (first focusable element) on open", () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="X">
          <p>x</p>
        </Modal>,
      );
      expect(screen.getByRole("button", { name: "Close modal" })).toHaveFocus();
    });

    it("wraps Tab from the last footer button back to the close button", () => {
      render(
        <Modal
          isOpen={true}
          onClose={vi.fn()}
          title="X"
          footer={<button type="button">Save</button>}
        >
          <p>x</p>
        </Modal>,
      );
      const saveButton = screen.getByRole("button", { name: "Save" });
      saveButton.focus();

      fireEvent.keyDown(saveButton, { key: "Tab" });

      expect(screen.getByRole("button", { name: "Close modal" })).toHaveFocus();
    });

    it("wraps Shift+Tab from the close button to the last footer button", () => {
      render(
        <Modal
          isOpen={true}
          onClose={vi.fn()}
          title="X"
          footer={<button type="button">Save</button>}
        >
          <p>x</p>
        </Modal>,
      );
      const closeButton = screen.getByRole("button", { name: "Close modal" });
      closeButton.focus();

      fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });

      expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    });

    it("restores focus to the triggering element after the modal closes", () => {
      const trigger = document.createElement("button");
      trigger.textContent = "Open Settings";
      document.body.appendChild(trigger);
      trigger.focus();
      expect(trigger).toHaveFocus();

      const { rerender } = render(
        <Modal isOpen={true} onClose={vi.fn()} title="X">
          <p>x</p>
        </Modal>,
      );
      expect(screen.getByRole("button", { name: "Close modal" })).toHaveFocus();

      // This is the exact regression e2e/accessibility.spec.ts's "Focus
      // should return to trigger after closing modal" test checks in a real
      // browser; pinned here deterministically at the unit level.
      rerender(
        <Modal isOpen={false} onClose={vi.fn()} title="X">
          <p>x</p>
        </Modal>,
      );
      expect(trigger).toHaveFocus();

      document.body.removeChild(trigger);
    });
  });
});
