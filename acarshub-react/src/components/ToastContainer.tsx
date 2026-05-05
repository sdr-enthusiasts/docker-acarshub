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

import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useToastStore } from "../store/useToastStore";
import { uiLogger } from "../utils/logger";
import { Toast } from "./Toast";

/**
 * ToastContainer Component
 * Renders the global toast queue maintained by `useToastStore`.
 *
 * Two toast sources flow through the same queue:
 *
 * 1. Alert-term matches detected in `useAppStore.alertCount` — auto-injected
 *    here as `variant: "alert"` toasts when "On Page Alerts" is enabled in
 *    settings.  Suppressed when the setting is off.
 * 2. Imperative `showToast(...)` calls from anywhere in the app (e.g.
 *    LogsViewer success/error feedback for clipboard copy).  These are
 *    not affected by the on-page-alerts setting because they represent
 *    direct user actions, not background notifications.
 */
export const ToastContainer = () => {
  const onPageAlerts = useSettingsStore(
    (state) => state.settings.notifications.onPageAlerts,
  );
  const alertCount = useAppStore((state) => state.alertCount);
  const messageGroups = useAppStore((state) => state.messageGroups);
  const toasts = useToastStore((state) => state.toasts);
  const showToast = useToastStore((state) => state.showToast);
  const dismissToast = useToastStore((state) => state.dismissToast);

  const previousAlertCount = useRef<number>(0);

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
          const messageTimestamp = message.timestamp * 1000; // Convert to ms
          if (messageTimestamp > latestTimestamp) {
            latestTimestamp = messageTimestamp;
            latestAlertTerms = message.matched_text;
          }
        }
      }
    }

    // If we found alert terms, push a toast onto the global queue
    if (latestAlertTerms.length > 0) {
      const id = showToast({
        variant: "alert",
        terms: latestAlertTerms,
      });

      uiLogger.info("Showing toast notification for alert", {
        terms: latestAlertTerms,
        toastId: id,
      });
    }

    previousAlertCount.current = alertCount;
  }, [alertCount, messageGroups, onPageAlerts, showToast]);

  const handleDismiss = useCallback(
    (id: string) => {
      dismissToast(id);
      uiLogger.debug("Toast dismissed", { toastId: id });
    },
    [dismissToast],
  );

  // Filter out alert-variant toasts when on-page-alerts is disabled.  Other
  // variants (success/error/info) always render — they are direct responses
  // to user actions and should not be silently swallowed by a notification
  // preference scoped to alert matches.
  const visibleToasts = onPageAlerts
    ? toasts
    : toasts.filter((t) => t.variant !== "alert");

  if (visibleToasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-container">
      {visibleToasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          variant={toast.variant}
          title={toast.title}
          message={toast.message}
          terms={toast.terms}
          duration={toast.duration}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  );
};
