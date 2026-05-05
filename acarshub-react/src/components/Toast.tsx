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

import { useCallback, useEffect, useState } from "react";
import type { ToastVariant } from "../store/useToastStore";
import { IconXmark } from "./icons";

export interface ToastProps {
  /** Unique ID for this toast */
  id: string;
  /** Visual + semantic variant */
  variant?: ToastVariant;
  /** Optional explicit title; falls back to variant default */
  title?: string;
  /** Body text (ignored when `terms` is set) */
  message?: string;
  /**
   * Alert-only: matched alert terms shown in monospace.  Implies
   * variant="alert" when present.
   */
  terms?: string[];
  /** Duration in milliseconds before auto-dismiss (default: 5000; 0 = persist) */
  duration?: number;
  /** Callback when toast is dismissed */
  onDismiss: (id: string) => void;
}

const DEFAULT_TITLES: Record<ToastVariant, string> = {
  alert: "Alert Matched",
  success: "Success",
  error: "Error",
  info: "Info",
};

/**
 * Variant → ARIA role mapping. `alert` and `error` are assertive (interrupt
 * the screen reader); `success` and `info` are polite.
 */
const VARIANT_ROLES: Record<ToastVariant, "alert" | "status"> = {
  alert: "alert",
  error: "alert",
  success: "status",
  info: "status",
};

const VARIANT_ARIA_LIVE: Record<ToastVariant, "assertive" | "polite"> = {
  alert: "assertive",
  error: "assertive",
  success: "polite",
  info: "polite",
};

/**
 * Toast Component
 * Displays a temporary notification in the bottom-right corner.
 * Auto-dismisses after the specified duration (unless duration=0).
 *
 * Features:
 * - Slide-in animation
 * - Auto-dismiss after duration (skipped when duration=0)
 * - Manual dismiss button
 * - Variant styling (alert | success | error | info)
 * - Stacks multiple toasts vertically (handled by ToastContainer)
 */
export const Toast = ({
  id,
  variant = "alert",
  title,
  message,
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

    // Auto-dismiss after duration (duration=0 disables auto-dismiss)
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;
    if (duration > 0) {
      dismissTimer = setTimeout(() => {
        setIsExiting(true);
        // Wait for exit animation to complete before removing from DOM
        setTimeout(() => {
          onDismiss(id);
        }, 300);
      }, duration);
    }

    return () => {
      clearTimeout(showTimer);
      if (dismissTimer !== undefined) {
        clearTimeout(dismissTimer);
      }
    };
  }, [duration, id, onDismiss]);

  const resolvedTitle = title ?? DEFAULT_TITLES[variant];
  const role = VARIANT_ROLES[variant];
  const ariaLive = VARIANT_ARIA_LIVE[variant];

  return (
    <div
      className={`toast toast--${variant} ${
        isVisible && !isExiting ? "toast--visible" : ""
      } ${isExiting ? "toast--exiting" : ""}`}
      role={role}
      aria-live={ariaLive}
      aria-atomic="true"
    >
      <div className="toast__content">
        <div className="toast__header">
          <span className="toast__title">{resolvedTitle}</span>
          <button
            type="button"
            className="toast__close"
            onClick={handleDismiss}
            aria-label="Dismiss notification"
          >
            <IconXmark />
          </button>
        </div>
        <div className="toast__body">
          {terms && terms.length > 0 ? (
            <span className="toast__terms">{terms.join(", ")}</span>
          ) : (
            <span className="toast__message">{message}</span>
          )}
        </div>
      </div>
      {duration > 0 && (
        <div className="toast__progress">
          <div
            className="toast__progress-bar"
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>
      )}
    </div>
  );
};
