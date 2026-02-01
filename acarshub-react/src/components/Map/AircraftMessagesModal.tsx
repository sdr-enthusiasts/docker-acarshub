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

import { useEffect, useRef } from "react";
import type { MessageGroup as MessageGroupType } from "../../types";
import { MessageGroup } from "../MessageGroup";
import "../../styles/components/_aircraft-messages-modal.scss";

interface AircraftMessagesModalProps {
  messageGroup: MessageGroupType | null;
  onClose: () => void;
}

/**
 * AircraftMessagesModal Component
 *
 * Modal dialog for displaying ACARS messages for a selected aircraft from the map.
 * - Reuses MessageGroup component for consistent display
 * - Keyboard navigation (Escape to close)
 * - Click outside to close
 * - Focus trap for accessibility
 * - Mobile-friendly full-screen layout
 *
 * Design Notes:
 * - Uses portal-like rendering over map
 * - Shares message display logic with LiveMessagesPage
 * - Theme-aware with Catppuccin colors
 */
export function AircraftMessagesModal({
  messageGroup,
  onClose,
}: AircraftMessagesModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Handle Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (messageGroup) {
      document.addEventListener("keydown", handleEscape);
      // Focus close button when modal opens
      closeButtonRef.current?.focus();
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [messageGroup, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (messageGroup) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [messageGroup]);

  // Handle backdrop click
  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!messageGroup) {
    return null;
  }

  // Get aircraft identifier for modal title
  const aircraftId =
    messageGroup.identifiers.find((id) => id.length > 0) || "Unknown";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Backdrop click-to-close is a standard modal UX pattern
    <div
      className="aircraft-messages-modal__backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="aircraft-messages-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="aircraft-messages-modal-title"
      >
        <div className="aircraft-messages-modal__header">
          <h2
            id="aircraft-messages-modal-title"
            className="aircraft-messages-modal__title"
          >
            Messages for {aircraftId}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="aircraft-messages-modal__close"
            onClick={onClose}
            aria-label="Close messages"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <title>Close</title>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="aircraft-messages-modal__content">
          <MessageGroup plane={messageGroup} />
        </div>
      </div>
    </div>
  );
}
