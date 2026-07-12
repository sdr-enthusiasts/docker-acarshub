/* Copyright (C) 2022-2026 Frederick Clausen II
 * This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
 *
 * acarshub is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * acarshub is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with acarshub.  If not, see <http://www.gnu.org/licenses/>.
 */

import { type ReactNode, useEffect, useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { IconXmark } from "./icons";

/**
 * Modal Component Props
 */
export interface ModalProps {
  /** Whether modal is open */
  isOpen: boolean;

  /** Callback when modal should close */
  onClose: () => void;

  /** Modal title */
  title: string;

  /** Modal size */
  size?: "sm" | "md" | "lg" | "xl" | "full";

  /** Modal content */
  children: ReactNode;

  /** Optional footer content */
  footer?: ReactNode;

  /** Whether to show close button in header */
  showCloseButton?: boolean;

  /** Whether clicking backdrop closes modal */
  closeOnBackdropClick?: boolean;

  /** Additional class names */
  className?: string;
}

/**
 * Modal Component
 *
 * Accessible modal dialog with backdrop
 * Handles keyboard events (Escape to close) and focus management,
 * including a full keyboard focus trap (see FE-MODAL-A11Y): Tab/Shift+Tab
 * cycle only through the dialog's own focusable content while it is open,
 * and focus returns to whatever triggered the modal once it closes.
 *
 * @example
 * ```tsx
 * <Modal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="Settings"
 *   footer={
 *     <>
 *       <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
 *       <Button variant="primary" onClick={handleSave}>Save</Button>
 *     </>
 *   }
 * >
 *   <p>Modal content goes here</p>
 * </Modal>
 * ```
 */
export function Modal({
  isOpen,
  onClose,
  title,
  size = "md",
  children,
  footer,
  showCloseButton = true,
  closeOnBackdropClick = true,
  className = "",
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // WCAG 2.1 AA focus trap: contain Tab/Shift+Tab within the dialog while
  // open, and restore focus to the triggering element on close.
  useFocusTrap(dialogRef, isOpen);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }

    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdropClick && event.target === event.currentTarget) {
      onClose();
    }
  };

  const modalClasses = ["modal", size !== "md" && `modal--${size}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    // FE-MODAL-A11Y: click-outside-to-dismiss is a mouse-only convenience —
    // Escape (handled above) is the documented keyboard equivalent, and the
    // dialog role/focus trap live on the inner .modal element below (the
    // WAI-ARIA APG "Dialog (Modal)" pattern treats the backdrop as a
    // decorative overlay, not part of the dialog's accessible tree).
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close is a standard modal UX pattern; Escape is the keyboard equivalent
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={modalClasses}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
      >
        <div className="modal__header">
          <h2 id="modal-title" className="modal__title">
            {title}
          </h2>
          {showCloseButton && (
            <button
              type="button"
              className="modal__close"
              onClick={onClose}
              aria-label="Close modal"
            >
              <IconXmark />
            </button>
          )}
        </div>

        <div className="modal__body">{children}</div>

        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
