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

import { useCallback, useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { useSettingsStore } from "../store/useSettingsStore";
import type { DateFormat, DisplayDensity, Theme, TimeFormat } from "../types";
import { Modal } from "./Modal";

/**
 * Settings Modal Component
 * Provides user interface for configuring application settings
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
  const resetToDefaults = useSettingsStore((state) => state.resetToDefaults);
  const exportSettings = useSettingsStore((state) => state.exportSettings);

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
        {/* Appearance Section */}
        <section className="settings-section">
          <h3 className="settings-section-title">Appearance</h3>

          <div className="settings-field">
            <label htmlFor="theme-select">Theme</label>
            <select
              id="theme-select"
              value={settings.appearance.theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
            >
              <option value="mocha">Catppuccin Mocha (Dark)</option>
              <option value="latte">Catppuccin Latte (Light)</option>
            </select>
          </div>

          <div className="settings-field">
            <label htmlFor="density-select">Display Density</label>
            <select
              id="density-select"
              value={settings.appearance.density}
              onChange={(e) => setDensity(e.target.value as DisplayDensity)}
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="spacious">Spacious</option>
            </select>
          </div>

          <div className="settings-field">
            <label htmlFor="animations-toggle">
              <input
                id="animations-toggle"
                type="checkbox"
                checked={settings.appearance.animations}
                onChange={(e) => setAnimations(e.target.checked)}
              />
              Enable animations
            </label>
          </div>

          <div className="settings-field">
            <label htmlFor="connection-status-toggle">
              <input
                id="connection-status-toggle"
                type="checkbox"
                checked={settings.appearance.showConnectionStatus}
                onChange={(e) => setShowConnectionStatus(e.target.checked)}
              />
              Show connection status indicator
            </label>
          </div>
        </section>

        {/* Regional & Time Section */}
        <section className="settings-section">
          <h3 className="settings-section-title">Regional & Time</h3>

          <div className="settings-field">
            <label htmlFor="time-format-select">Time Format</label>
            <select
              id="time-format-select"
              value={settings.regional.timeFormat}
              onChange={(e) => setTimeFormat(e.target.value as TimeFormat)}
            >
              <option value="auto">Auto-detect from locale</option>
              <option value="12h">12-hour (3:45 PM)</option>
              <option value="24h">24-hour (15:45)</option>
            </select>
          </div>

          <div className="settings-field">
            <label htmlFor="date-format-select">Date Format</label>
            <select
              id="date-format-select"
              value={settings.regional.dateFormat}
              onChange={(e) => setDateFormat(e.target.value as DateFormat)}
            >
              <option value="auto">Auto-detect from locale</option>
              <option value="mdy">MM/DD/YYYY (US)</option>
              <option value="dmy">DD/MM/YYYY (Europe)</option>
              <option value="ymd">YYYY-MM-DD (ISO)</option>
              <option value="long">Long format (January 1, 2024)</option>
              <option value="short">Short format (Jan 1, 2024)</option>
            </select>
          </div>

          <div className="settings-field">
            <label htmlFor="timezone-select">Timezone Display</label>
            <select
              id="timezone-select"
              value={settings.regional.timezone}
              onChange={(e) => setTimezone(e.target.value as "local" | "utc")}
            >
              <option value="local">Local time</option>
              <option value="utc">UTC</option>
            </select>
          </div>
        </section>

        {/* Actions */}
        <section className="settings-actions">
          <button
            type="button"
            onClick={handleExport}
            className="btn btn-secondary"
          >
            Export Settings
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="btn btn-danger"
          >
            Reset to Defaults
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="btn btn-primary"
          >
            Done
          </button>
        </section>
      </div>
    </Modal>
  );
};
