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
import { useAppStore } from "../store/useAppStore";
import { useSettingsStore } from "../store/useSettingsStore";
import type { DateFormat, DisplayDensity, Theme, TimeFormat } from "../types";
import { Button } from "./Button";
import { Card } from "./Card";
import { Modal } from "./Modal";
import { RadioGroup } from "./RadioGroup";
import { Select } from "./Select";
import { Toggle } from "./Toggle";

/**
 * Settings Modal Component
 * Provides user interface for configuring application settings
 * Uses custom form components with Catppuccin theming
 */
export const SettingsModal = () => {
  const isOpen = useAppStore((state) => state.settingsOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);

  const settings = useSettingsStore((state) => state.settings);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setDensity = useSettingsStore((state) => state.setDensity);
  const setTimeFormat = useSettingsStore((state) => state.setTimeFormat);
  const setDateFormat = useSettingsStore((state) => state.setDateFormat);
  const setTimezone = useSettingsStore((state) => state.setTimezone);
  const setAnimations = useSettingsStore((state) => state.setAnimations);
  const setShowConnectionStatus = useSettingsStore(
    (state) => state.setShowConnectionStatus,
  );
  const setDesktopNotifications = useSettingsStore(
    (state) => state.setDesktopNotifications,
  );
  const setSoundAlerts = useSettingsStore((state) => state.setSoundAlerts);
  const setVolume = useSettingsStore((state) => state.setVolume);
  const setAlertsOnly = useSettingsStore((state) => state.setAlertsOnly);
  const setMaxMessagesPerAircraft = useSettingsStore(
    (state) => state.setMaxMessagesPerAircraft,
  );
  const setEnableCaching = useSettingsStore((state) => state.setEnableCaching);
  const setAutoClearMinutes = useSettingsStore(
    (state) => state.setAutoClearMinutes,
  );
  const resetToDefaults = useSettingsStore((state) => state.resetToDefaults);
  const exportSettings = useSettingsStore((state) => state.exportSettings);
  const importSettings = useSettingsStore((state) => state.importSettings);

  const [activeTab, setActiveTab] = useState<string>("appearance");

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
        {/* Settings Tabs */}
        <div className="settings-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "appearance"}
            aria-controls="appearance-panel"
            className={`settings-tab ${activeTab === "appearance" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("appearance")}
          >
            Appearance
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "regional"}
            aria-controls="regional-panel"
            className={`settings-tab ${activeTab === "regional" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("regional")}
          >
            Regional & Time
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "notifications"}
            aria-controls="notifications-panel"
            className={`settings-tab ${activeTab === "notifications" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("notifications")}
          >
            Notifications
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "data"}
            aria-controls="data-panel"
            className={`settings-tab ${activeTab === "data" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("data")}
          >
            Data & Privacy
          </button>
        </div>

        {/* Appearance Panel */}
        {activeTab === "appearance" && (
          <div
            id="appearance-panel"
            role="tabpanel"
            aria-labelledby="appearance-tab"
            className="settings-panel"
          >
            <Card
              title="Appearance"
              subtitle="Customize the look and feel of the application"
              variant="success"
            >
              <div className="settings-info settings-info--success">
                ✓ All appearance settings are fully functional
              </div>

              <RadioGroup
                name="theme"
                label="Theme"
                value={settings.appearance.theme}
                options={[
                  {
                    value: "mocha",
                    label: "Catppuccin Mocha (Dark)",
                    description: "Dark theme with warm colors",
                  },
                  {
                    value: "latte",
                    label: "Catppuccin Latte (Light)",
                    description: "Light theme with soft colors",
                  },
                ]}
                onChange={(value) => setTheme(value as Theme)}
                helpText="Choose your preferred color scheme"
              />

              <Select
                id="density"
                label="Display Density"
                value={settings.appearance.density}
                options={[
                  { value: "compact", label: "Compact - More content" },
                  { value: "comfortable", label: "Comfortable - Balanced" },
                  { value: "spacious", label: "Spacious - More spacing" },
                ]}
                onChange={(value) => setDensity(value as DisplayDensity)}
                helpText="Adjust spacing and sizing of UI elements"
                fullWidth
              />

              <Toggle
                id="animations"
                label="Enable Animations"
                checked={settings.appearance.animations}
                onChange={setAnimations}
                helpText="Show smooth transitions and effects throughout the UI"
              />

              <Toggle
                id="connection-status"
                label="Show Connection Status"
                checked={settings.appearance.showConnectionStatus}
                onChange={setShowConnectionStatus}
                helpText="Display connection indicator in the navigation bar"
              />
            </Card>
          </div>
        )}

        {/* Regional & Time Panel */}
        {activeTab === "regional" && (
          <div
            id="regional-panel"
            role="tabpanel"
            aria-labelledby="regional-tab"
            className="settings-panel"
          >
            <Card
              title="Regional & Time"
              subtitle="Configure time, date, and regional preferences"
              variant="info"
            >
              <div className="settings-info">
                ℹ️ These settings are saved but not yet used by message
                displays. They will be applied in future updates.
              </div>

              <Select
                id="time-format"
                label="Time Format"
                value={settings.regional.timeFormat}
                options={[
                  {
                    value: "auto",
                    label: "Auto-detect from locale",
                  },
                  {
                    value: "12h",
                    label: "12-hour (3:45 PM)",
                  },
                  {
                    value: "24h",
                    label: "24-hour (15:45)",
                  },
                ]}
                onChange={(value) => setTimeFormat(value as TimeFormat)}
                helpText="Choose how times are displayed throughout the application"
                fullWidth
              />

              <Select
                id="date-format"
                label="Date Format"
                value={settings.regional.dateFormat}
                options={[
                  {
                    value: "auto",
                    label: "Auto-detect from locale",
                  },
                  {
                    value: "mdy",
                    label: "MM/DD/YYYY (US)",
                  },
                  {
                    value: "dmy",
                    label: "DD/MM/YYYY (Europe)",
                  },
                  {
                    value: "ymd",
                    label: "YYYY-MM-DD (ISO)",
                  },
                  {
                    value: "long",
                    label: "Long format (January 1, 2024)",
                  },
                  {
                    value: "short",
                    label: "Short format (Jan 1, 2024)",
                  },
                ]}
                onChange={(value) => setDateFormat(value as DateFormat)}
                helpText="Choose how dates are displayed throughout the application"
                fullWidth
              />

              <RadioGroup
                name="timezone"
                label="Timezone Display"
                value={settings.regional.timezone}
                options={[
                  {
                    value: "local",
                    label: "Local Time",
                    description: "Display times in your local timezone",
                  },
                  {
                    value: "utc",
                    label: "UTC",
                    description:
                      "Display times in UTC (Coordinated Universal Time)",
                  },
                ]}
                onChange={(value) => setTimezone(value as "local" | "utc")}
                helpText="Choose which timezone to use for displaying message timestamps"
              />
            </Card>
          </div>
        )}

        {/* Notifications Panel */}
        {activeTab === "notifications" && (
          <div
            id="notifications-panel"
            role="tabpanel"
            aria-labelledby="notifications-tab"
            className="settings-panel"
          >
            <Card
              title="Notifications"
              subtitle="Configure how you receive alerts and notifications"
              variant="warning"
            >
              <div className="settings-info settings-info--warning">
                ℹ️ Notification features are not yet implemented. Settings will
                be saved for future use.
              </div>

              <Toggle
                id="desktop-notifications"
                label="Desktop Notifications (Coming Soon)"
                checked={settings.notifications.desktop}
                onChange={setDesktopNotifications}
                helpText="Show browser notifications for new messages (requires permission)"
                disabled
              />

              <Toggle
                id="sound-alerts"
                label="Sound Alerts (Coming Soon)"
                checked={settings.notifications.sound}
                onChange={setSoundAlerts}
                helpText="Play sound when new messages arrive"
                disabled
              />

              {settings.notifications.sound && (
                <div className="settings-field-group">
                  <label htmlFor="volume-slider" className="settings-label">
                    Volume: {settings.notifications.volume}%
                  </label>
                  <input
                    id="volume-slider"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={settings.notifications.volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="settings-slider"
                    disabled
                  />
                  <p className="settings-help-text">
                    Adjust the volume of notification sounds
                  </p>
                </div>
              )}

              <Toggle
                id="alerts-only"
                label="Alerts Only (Coming Soon)"
                checked={settings.notifications.alertsOnly}
                onChange={setAlertsOnly}
                helpText="Only notify for messages that match alert terms"
                disabled
              />
            </Card>
          </div>
        )}

        {/* Data & Privacy Panel */}
        {activeTab === "data" && (
          <div
            id="data-panel"
            role="tabpanel"
            aria-labelledby="data-tab"
            className="settings-panel"
          >
            <Card
              title="Data & Privacy"
              subtitle="Manage data storage and privacy preferences"
              variant="default"
            >
              <div className="settings-info settings-info--success">
                ✓ Max messages setting is active and working
              </div>

              <div className="settings-field-group">
                <label htmlFor="max-messages" className="settings-label">
                  Max Messages per Aircraft:{" "}
                  {settings.data.maxMessagesPerAircraft}
                </label>
                <input
                  id="max-messages"
                  type="range"
                  min="10"
                  max="200"
                  step="10"
                  value={settings.data.maxMessagesPerAircraft}
                  onChange={(e) =>
                    setMaxMessagesPerAircraft(Number(e.target.value))
                  }
                  className="settings-slider"
                />
                <p className="settings-help-text">
                  Maximum number of messages to keep in memory for each aircraft
                </p>
              </div>

              <div className="settings-info settings-info--warning">
                ℹ️ Caching and auto-clear features not yet implemented
              </div>

              <Toggle
                id="enable-caching"
                label="Enable Local Caching (Coming Soon)"
                checked={settings.data.enableCaching}
                onChange={setEnableCaching}
                helpText="Cache data locally for faster loading (stored in browser)"
                disabled
              />

              <div className="settings-field-group">
                <label htmlFor="auto-clear" className="settings-label">
                  Auto-clear after (Coming Soon):{" "}
                  {settings.data.autoClearMinutes} minutes
                </label>
                <input
                  id="auto-clear"
                  type="range"
                  min="0"
                  max="240"
                  step="15"
                  value={settings.data.autoClearMinutes}
                  onChange={(e) => setAutoClearMinutes(Number(e.target.value))}
                  className="settings-slider"
                  disabled
                />
                <p className="settings-help-text">
                  Automatically clear old messages after this many minutes (0 =
                  disabled)
                </p>
              </div>
            </Card>
          </div>
        )}

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
    </Modal>
  );
};
