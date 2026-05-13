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
 *  - closeOnBackdropClick=false disables both backdrop click + Enter.
 *  - aria-modal, role="dialog", aria-labelledby wiring for screen
 *    readers.
 *
 * NOTE: Modal does not currently implement a focus trap (Tab/Shift+Tab
 * containment). If that is added later, additional tests should pin
 * the trap behavior. The current contract is documented here as-is.
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

    it("closes on Enter pressed on the backdrop (keyboard equivalent)", () => {
      const onClose = vi.fn();
      const { container } = render(
        <Modal isOpen={true} onClose={onClose} title="X">
          <p>x</p>
        </Modal>,
      );
      // The backdrop has onKeyDown for Enter so keyboard-only users
      // can dismiss the modal. The div is not natively focusable
      // (no tabindex), so we fire the React synthetic event directly
      // rather than going through user.keyboard which requires focus.
      //
      // FINDING (Phase-4 audit): the backdrop wires onKeyDown but
      // does not set tabIndex, so in a real browser the user cannot
      // actually focus the backdrop to trigger this handler. The
      // Escape-key path on document.keydown is the working keyboard
      // close affordance. Flagged for the Phase-4 remediation report;
      // not fixed here to keep the test purely descriptive of the
      // current behavior. Fix would be either:
      //   - Remove the onKeyDown (dead code), OR
      //   - Add tabIndex={-1} + visible focus indicator on backdrop
      //     so AT users can tab to it.
      const backdrop = container.querySelector(
        ".modal-backdrop",
      ) as HTMLElement;
      fireEvent.keyDown(backdrop, { key: "Enter" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not respond to Enter on backdrop when closeOnBackdropClick=false", () => {
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
    it("sets role='dialog' and aria-modal='true' on the backdrop", () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="X">
          <p>x</p>
        </Modal>,
      );
      const dialog = screen.getByRole("dialog");
      // aria-modal=true tells AT that content outside the dialog is
      // inert (even without a focus trap implementation).
      expect(dialog.getAttribute("aria-modal")).toBe("true");
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
  });
});
