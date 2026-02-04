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

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { uiLogger } from "../utils/logger";
import { Toast } from "./Toast";

interface ToastData {
  id: string;
  terms: string[];
  timestamp: number;
}

/**
 * ToastContainer Component
 * Manages on-page toast notifications for alert matches
 *
 * Features:
 * - Shows toast when new alerts arrive
 * - Displays matched alert terms
 * - Auto-dismisses after 5 seconds
 * - Stacks multiple toasts vertically
 * - Only shows toasts when "On Page Alerts" is enabled in settings
 */
export const ToastContainer = () => {
  const onPageAlerts = useSettingsStore(
    (state) => state.settings.notifications.onPageAlerts,
  );
  const alertCount = useAppStore((state) => state.alertCount);
  const messageGroups = useAppStore((state) => state.messageGroups);

  const previousAlertCount = useRef<number>(0);
  const toasts = useRef<ToastData[]>([]);
  const [, forceUpdate] = useState({});

  useEffect(() => {
    // Skip if on-page alerts are disabled
    if (!onPageAlerts) {
      previousAlertCount.current = alertCount;
      return;
    }

    // Only show toast if alert count INCREASED (new alerts arrived)
    const alertCountIncreased = alertCount > previousAlertCount.current;

    if (!alertCountIncreased) {
      previousAlertCount.current = alertCount;
      return;
    }

    // Find the most recent alert message and its matched terms
    let latestAlertTerms: string[] = [];
    let latestTimestamp = 0;

    for (const [, group] of messageGroups) {
      for (const message of group.messages) {
        if (
          message.matched &&
          message.matched_text &&
          message.matched_text.length > 0
        ) {
          const messageTimestamp = message.timestamp * 1000; // Convert to milliseconds
          if (messageTimestamp > latestTimestamp) {
            latestTimestamp = messageTimestamp;
            latestAlertTerms = message.matched_text;
          }
        }
      }
    }

    // If we found alert terms, create a new toast
    if (latestAlertTerms.length > 0) {
      const newToast: ToastData = {
        id: `toast-${Date.now()}-${Math.random()}`,
        terms: latestAlertTerms,
        timestamp: Date.now(),
      };

      toasts.current = [...toasts.current, newToast];
      forceUpdate((prev) => ({ ...prev }));

      uiLogger.info("Showing toast notification for alert", {
        terms: latestAlertTerms,
        toastId: newToast.id,
      });
    }

    previousAlertCount.current = alertCount;
  }, [alertCount, messageGroups, onPageAlerts]);

  const handleDismiss = (id: string) => {
    toasts.current = toasts.current.filter((toast) => toast.id !== id);
    forceUpdate((prev) => ({ ...prev }));
    uiLogger.debug("Toast dismissed", { toastId: id });
  };

  // Don't render container if on-page alerts are disabled or no toasts
  if (!onPageAlerts || toasts.current.length === 0) {
    return null;
  }

  return (
    <div className="toast-container">
      {toasts.current.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          terms={toast.terms}
          duration={5000}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  );
};
