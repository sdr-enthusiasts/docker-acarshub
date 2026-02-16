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

import { faTimes } from "@fortawesome/free-solid-svg-icons/faTimes";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useState } from "react";

export interface ToastProps {
  /** Unique ID for this toast */
  id: string;
  /** Alert terms that were matched */
  terms: string[];
  /** Duration in milliseconds before auto-dismiss (default: 5000) */
  duration?: number;
  /** Callback when toast is dismissed */
  onDismiss: (id: string) => void;
}

/**
 * Toast Component
 * Displays a temporary notification in the bottom-right corner
 * Auto-dismisses after specified duration
 *
 * Features:
 * - Slide-in animation
 * - Auto-dismiss after duration
 * - Manual dismiss button
 * - Shows matched alert terms
 * - Stacks multiple toasts vertically
 */
export const Toast = ({
  id,
  terms,
  duration = 5000,
  onDismiss,
}: ToastProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    // Wait for exit animation to complete before removing from DOM
    setTimeout(() => {
      onDismiss(id);
    }, 300);
  }, [id, onDismiss]);

  useEffect(() => {
    // Trigger slide-in animation
    const showTimer = setTimeout(() => setIsVisible(true), 10);

    // Auto-dismiss after duration
    const dismissTimer = setTimeout(() => {
      setIsExiting(true);
      // Wait for exit animation to complete before removing from DOM
      setTimeout(() => {
        onDismiss(id);
      }, 300);
    }, duration);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(dismissTimer);
    };
  }, [duration, id, onDismiss]);

  return (
    <div
      className={`toast ${isVisible && !isExiting ? "toast--visible" : ""} ${isExiting ? "toast--exiting" : ""}`}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="toast__content">
        <div className="toast__header">
          <span className="toast__title">Alert Matched</span>
          <button
            type="button"
            className="toast__close"
            onClick={handleDismiss}
            aria-label="Dismiss notification"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div className="toast__body">
          <span className="toast__terms">{terms.join(", ")}</span>
        </div>
      </div>
      <div className="toast__progress">
        <div
          className="toast__progress-bar"
          style={{ animationDuration: `${duration}ms` }}
        />
      </div>
    </div>
  );
};
