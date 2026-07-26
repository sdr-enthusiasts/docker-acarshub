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
// GOD-05: this file used to be a single 1553-line component containing every
// settings tab's JSX and handlers inline. It is now the orchestrator only:
// - Modal wrapper, tab navigation (tablist + roving-tabindex keyboard nav),
//   footer actions (import/export/reset/close), and the Escape-to-close
//   shortcut.
// - The regenerate-confirmation dialog and processing overlay, which must
//   stay visible even if the user switches tabs mid-run (they render as
//   Modal-level siblings, not inside any tabpanel).
//
// Each tab's own settings/handlers now live in components/settings/*.tsx,
// each reading and writing its own store slice directly via
// useSettingsStore/useAppStore — no prop-drilling needed except the two
// values AlertsTab needs from the shared regenerate-overlay state
// (isRegenerating, onRegenerateClick).
// ----------------------------------------------------------------------------

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { uiLogger } from "../utils/logger";
import { Button } from "./Button";
import { Modal } from "./Modal";

// ---------------------------------------------------------------------------
// PERF-BUNDLE Phase B (see agent-docs/REMEDIATION_PLAN.md §15): the Settings
// modal is mounted unconditionally in App.tsx (so it can open instantly from
// any page), which previously meant every user downloaded all 7 tabs' code
// — including AdvancedTab's LogsViewer — on every page load, whether or not
// they ever open Settings. Each tab is now its own lazily-loaded chunk,
// fetched only the first time its tab is actually selected. `TabLoader`
// reuses the same `.loading`/`.loading__spinner` markup as `App.tsx`'s
// `PageLoader` (DESIGN_LANGUAGE.md — no bespoke spinner), just without the
// full-page `min-height` since this renders inside a modal tabpanel.
// ---------------------------------------------------------------------------
const AppearanceTab = lazy(() =>
  import("./settings/AppearanceTab").then((m) => ({
    default: m.AppearanceTab,
  })),
);
const RegionalTab = lazy(() =>
  import("./settings/RegionalTab").then((m) => ({ default: m.RegionalTab })),
);
const AlertsTab = lazy(() =>
  import("./settings/AlertsTab").then((m) => ({ default: m.AlertsTab })),
);
const NotificationsTab = lazy(() =>
  import("./settings/NotificationsTab").then((m) => ({
    default: m.NotificationsTab,
  })),
);
const DataTab = lazy(() =>
  import("./settings/DataTab").then((m) => ({ default: m.DataTab })),
);
const MapTab = lazy(() =>
  import("./settings/MapTab").then((m) => ({ default: m.MapTab })),
);
const AdvancedTab = lazy(() =>
  import("./settings/AdvancedTab").then((m) => ({ default: m.AdvancedTab })),
);

function TabLoader() {
  return (
    <output
      className="loading settings-tab-loading"
      aria-label="Loading settings tab"
    >
      <div className="loading__spinner" />
    </output>
  );
}

/**
 * Ordered list of settings tab identifiers.
 * Defines the ArrowLeft/ArrowRight navigation order for the tablist.
 */
const SETTINGS_TABS = [
  "appearance",
  "regional",
  "alerts",
  "notifications",
  "data",
  "map",
  "advanced",
] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number];

/**
 * Settings Modal Component
 * Provides user interface for configuring application settings
 * Uses custom form components with Catppuccin theming
 */
export const SettingsModal = () => {
  const isOpen = useAppStore((state) => state.settingsOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);

  const resetToDefaults = useSettingsStore((state) => state.resetToDefaults);
  const exportSettings = useSettingsStore((state) => state.exportSettings);
  const importSettings = useSettingsStore((state) => state.importSettings);

  const [activeTab, setActiveTab] = useState<SettingsTabId>("appearance");

  // Refs for each tab button — used to programmatically move focus when the
  // active tab changes via ArrowLeft / ArrowRight keyboard navigation.
  const tabRefs = useRef<Map<SettingsTabId, HTMLButtonElement | null>>(
    new Map(),
  );

  // Regenerate alert matches state — lives here (not in AlertsTab) because
  // the confirmation dialog and processing overlay below must remain
  // visible even if the user switches away from the Alerts tab mid-run.
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  const handleClose = useCallback(() => {
    setSettingsOpen(false);
  }, [setSettingsOpen]);

  const handleReset = () => {
    if (
      window.confirm(
        "Are you sure you want to reset all settings to defaults? This cannot be undone.",
      )
    ) {
      resetToDefaults();
    }
  };

  const handleExport = () => {
    const json = exportSettings();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `acarshub-settings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const json = event.target?.result as string;
          const success = importSettings(json);
          if (success) {
            alert("Settings imported successfully!");
          } else {
            alert("Failed to import settings. Please check the file format.");
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  // Regenerate alert matches handler
  const handleRegenerateAlertMatches = useCallback(() => {
    setShowRegenerateConfirm(true);
  }, []);

  const handleConfirmRegenerate = useCallback(() => {
    setShowRegenerateConfirm(false);
    setIsRegenerating(true);

    const socket = socketService.getSocket();

    // Set up event listeners for started/completion/error
    const handleStarted = (data: { message: string }) => {
      // Regeneration has started in background thread
      uiLogger.info("Alert regeneration started", { message: data.message });
    };

    const handleComplete = (data: {
      success: boolean;
      stats: {
        total_messages: number;
        matched_messages: number;
        total_matches: number;
      };
    }) => {
      setIsRegenerating(false);
      alert(
        `Alert match regeneration complete!\n\n` +
          `• Messages processed: ${data.stats.total_messages.toLocaleString()}\n` +
          `• Matched messages: ${data.stats.matched_messages.toLocaleString()}\n` +
          `• Total matches created: ${data.stats.total_matches.toLocaleString()}\n\n` +
          `The page will now reload to show updated results.`,
      );
      // Reload page to fetch fresh data from backend
      window.location.reload();
    };

    const handleError = (data: { error: string }) => {
      setIsRegenerating(false);
      alert(
        `Error regenerating alert matches:\n\n${data.error}\n\n` +
          `Please check the server logs and try again.`,
      );
    };

    // Register one-time listeners for all events
    socket.once("regenerate_alert_matches_started", handleStarted);
    socket.once("regenerate_alert_matches_complete", handleComplete);
    socket.once("regenerate_alert_matches_error", handleError);

    // Trigger regeneration (runs in background thread)
    socketService.regenerateAlertMatches();
  }, []);

  const handleCancelRegenerate = useCallback(() => {
    setShowRegenerateConfirm(false);
  }, []);

  /**
   * Handle keyboard navigation within the tablist.
   *
   * Implements the ARIA APG "Tabs" keyboard interaction pattern:
   *   ArrowRight — move to next tab (wraps around)
   *   ArrowLeft  — move to previous tab (wraps around)
   *   Home       — move to first tab
   *   End        — move to last tab
   *
   * After changing the active tab the corresponding button is focused
   * immediately (not deferred) using the tabRefs map so that screen
   * readers announce the newly selected tab without delay.
   */
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = SETTINGS_TABS.indexOf(activeTab);
      let nextIndex = -1;

      if (e.key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % SETTINGS_TABS.length;
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        nextIndex =
          (currentIndex - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
        e.preventDefault();
      } else if (e.key === "Home") {
        nextIndex = 0;
        e.preventDefault();
      } else if (e.key === "End") {
        nextIndex = SETTINGS_TABS.length - 1;
        e.preventDefault();
      }

      if (nextIndex !== -1) {
        const nextTab = SETTINGS_TABS[nextIndex];
        setActiveTab(nextTab);
        // Focus happens after setActiveTab triggers a re-render; defer with
        // setTimeout(0) to let React flush the new tabIndex values first.
        setTimeout(() => {
          tabRefs.current.get(nextTab)?.focus();
        }, 0);
      }
    },
    [activeTab],
  );

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Settings"
      className="settings-modal"
    >
      <div className="settings-content">
        {/* Settings Tabs
            Implements the ARIA APG tablist keyboard interaction:
            - Only the active tab is in the tab order (tabIndex 0); inactive
              tabs use tabIndex -1 (roving tabindex pattern).
            - ArrowRight / ArrowLeft navigate between tabs and move focus.
            - Home / End jump to first / last tab.
            - id attributes match the aria-labelledby values on each tabpanel. */}
        <div className="settings-tabs" role="tablist" aria-label="Settings">
          <button
            ref={(el) => {
              tabRefs.current.set("appearance", el);
            }}
            type="button"
            id="appearance-tab"
            role="tab"
            aria-selected={activeTab === "appearance"}
            aria-controls={
              activeTab === "appearance" ? "appearance-panel" : undefined
            }
            tabIndex={activeTab === "appearance" ? 0 : -1}
            className={`settings-tab ${activeTab === "appearance" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("appearance")}
            onKeyDown={handleTabKeyDown}
          >
            Appearance
          </button>
          <button
            ref={(el) => {
              tabRefs.current.set("regional", el);
            }}
            type="button"
            id="regional-tab"
            role="tab"
            aria-selected={activeTab === "regional"}
            aria-controls={
              activeTab === "regional" ? "regional-panel" : undefined
            }
            tabIndex={activeTab === "regional" ? 0 : -1}
            className={`settings-tab ${activeTab === "regional" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("regional")}
            onKeyDown={handleTabKeyDown}
          >
            Regional & Time
          </button>
          <button
            ref={(el) => {
              tabRefs.current.set("alerts", el);
            }}
            type="button"
            id="alerts-tab"
            role="tab"
            aria-selected={activeTab === "alerts"}
            aria-controls={activeTab === "alerts" ? "alerts-panel" : undefined}
            tabIndex={activeTab === "alerts" ? 0 : -1}
            className={`settings-tab ${activeTab === "alerts" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("alerts")}
            onKeyDown={handleTabKeyDown}
          >
            Alerts
          </button>
          <button
            ref={(el) => {
              tabRefs.current.set("notifications", el);
            }}
            type="button"
            id="notifications-tab"
            role="tab"
            aria-selected={activeTab === "notifications"}
            aria-controls={
              activeTab === "notifications" ? "notifications-panel" : undefined
            }
            tabIndex={activeTab === "notifications" ? 0 : -1}
            className={`settings-tab ${activeTab === "notifications" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("notifications")}
            onKeyDown={handleTabKeyDown}
          >
            Notifications
          </button>
          <button
            ref={(el) => {
              tabRefs.current.set("data", el);
            }}
            type="button"
            id="data-tab"
            role="tab"
            aria-selected={activeTab === "data"}
            aria-controls={activeTab === "data" ? "data-panel" : undefined}
            tabIndex={activeTab === "data" ? 0 : -1}
            className={`settings-tab ${activeTab === "data" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("data")}
            onKeyDown={handleTabKeyDown}
          >
            Data & Privacy
          </button>
          <button
            ref={(el) => {
              tabRefs.current.set("map", el);
            }}
            type="button"
            id="map-tab"
            role="tab"
            aria-selected={activeTab === "map"}
            aria-controls={activeTab === "map" ? "map-panel" : undefined}
            tabIndex={activeTab === "map" ? 0 : -1}
            className={`settings-tab ${activeTab === "map" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("map")}
            onKeyDown={handleTabKeyDown}
          >
            Map
          </button>
          <button
            ref={(el) => {
              tabRefs.current.set("advanced", el);
            }}
            type="button"
            id="advanced-tab"
            role="tab"
            aria-selected={activeTab === "advanced"}
            aria-controls={
              activeTab === "advanced" ? "advanced-panel" : undefined
            }
            tabIndex={activeTab === "advanced" ? 0 : -1}
            className={`settings-tab ${activeTab === "advanced" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("advanced")}
            onKeyDown={handleTabKeyDown}
          >
            Advanced
          </button>
        </div>

        <Suspense fallback={<TabLoader />}>
          {activeTab === "appearance" && <AppearanceTab />}
          {activeTab === "regional" && <RegionalTab />}
          {activeTab === "alerts" && (
            <AlertsTab
              isRegenerating={isRegenerating}
              onRegenerateClick={handleRegenerateAlertMatches}
            />
          )}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "data" && <DataTab />}
          {activeTab === "map" && <MapTab />}
          {activeTab === "advanced" && <AdvancedTab />}
        </Suspense>

        {/* Actions Footer */}
        <footer className="settings-footer">
          <div className="settings-footer-left">
            <Button variant="secondary" onClick={handleImport} size="sm">
              Import
            </Button>
            <Button variant="secondary" onClick={handleExport} size="sm">
              Export
            </Button>
          </div>
          <div className="settings-footer-right">
            <Button variant="danger" onClick={handleReset} size="sm">
              Reset to Defaults
            </Button>
            <Button variant="primary" onClick={handleClose} size="sm">
              Done
            </Button>
          </div>
        </footer>
      </div>

      {/* Regenerate Confirmation Modal */}
      {showRegenerateConfirm && (
        <div className="regenerate-confirm-overlay">
          <div className="regenerate-confirm-content">
            <h3 className="regenerate-confirm__title">
              Confirm Regenerate Alert Matches
            </h3>
            <p className="regenerate-confirm__text">
              This will delete all existing alert matches and re-process every
              message in the database.
            </p>
            <p className="regenerate-confirm__warning">
              This cannot be undone and may take several seconds to complete.
            </p>
            <p className="regenerate-confirm__text">Do you want to continue?</p>
            <div className="regenerate-confirm__actions">
              <Button
                variant="secondary"
                onClick={handleCancelRegenerate}
                aria-label="Cancel regenerate"
              >
                Cancel
              </Button>
              <Button
                variant="warning"
                onClick={handleConfirmRegenerate}
                aria-label="Confirm regenerate"
              >
                Yes, Regenerate
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Processing Overlay */}
      {isRegenerating && (
        <div className="regenerate-processing-overlay">
          <div className="regenerate-processing-content">
            <h3 className="regenerate-processing__title">
              Regenerating Alert Matches
            </h3>
            <p className="regenerate-processing__dots">●●●</p>
            <p className="regenerate-processing__text">
              Processing in background... You can continue using the app.
            </p>
            <p className="regenerate-processing__subtext">
              You'll be notified when the operation completes.
            </p>
            <Button
              variant="secondary"
              onClick={() => setIsRegenerating(false)}
              className="regenerate-processing__dismiss"
              aria-label="Continue using app"
            >
              Continue Using App
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
