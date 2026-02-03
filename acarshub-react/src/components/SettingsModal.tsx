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

import { useCallback, useEffect, useMemo, useState } from "react";
import { audioService } from "../services/audioService";
import { useAppStore } from "../store/useAppStore";
import { useSettingsStore } from "../store/useSettingsStore";
import type {
  AltitudeUnit,
  DateFormat,
  LogLevel,
  Theme,
  TimeFormat,
} from "../types";
import { Button } from "./Button";
import { Card } from "./Card";
import { LogsViewer } from "./LogsViewer";
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

  // Alert terms from AppStore
  const alertTerms = useAppStore((state) => state.alertTerms);
  const setAlertTerms = useAppStore((state) => state.setAlertTerms);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setTimeFormat = useSettingsStore((state) => state.setTimeFormat);
  const setDateFormat = useSettingsStore((state) => state.setDateFormat);
  const setTimezone = useSettingsStore((state) => state.setTimezone);
  const setAltitudeUnit = useSettingsStore((state) => state.setAltitudeUnit);
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
  const setMaxMessageGroups = useSettingsStore(
    (state) => state.setMaxMessageGroups,
  );
  const setEnableCaching = useSettingsStore((state) => state.setEnableCaching);
  const setAutoClearMinutes = useSettingsStore(
    (state) => state.setAutoClearMinutes,
  );
  const resetToDefaults = useSettingsStore((state) => state.resetToDefaults);
  const exportSettings = useSettingsStore((state) => state.exportSettings);
  const importSettings = useSettingsStore((state) => state.importSettings);
  const setLogLevel = useSettingsStore((state) => state.setLogLevel);
  const setPersistLogs = useSettingsStore((state) => state.setPersistLogs);

  const [activeTab, setActiveTab] = useState<string>("appearance");

  // Alert terms management state
  const [newAlertTerm, setNewAlertTerm] = useState("");
  const [newIgnoreTerm, setNewIgnoreTerm] = useState("");

  // Detect if browser is Chromium-based (Chrome, Brave, Edge, etc.)
  const isChromium = useMemo(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isChrome = userAgent.includes("chrome");
    const isEdge = userAgent.includes("edg");
    const isBrave = "brave" in navigator && navigator.brave !== undefined;
    const isFirefox = userAgent.includes("firefox");

    // Chromium-based if Chrome/Edge/Brave but NOT Firefox
    return (isChrome || isEdge || isBrave) && !isFirefox;
  }, []);

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

  const handleTestSound = async () => {
    try {
      await audioService.playAlertSound(settings.notifications.volume);
      alert("Test sound played successfully! Alert sounds are now enabled.");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage === "AUTOPLAY_BLOCKED") {
        alert(
          "Sound blocked by browser. Please check your browser settings:\n\n" +
            "• Chrome/Brave: Check site permissions (lock icon in address bar)\n" +
            "• Firefox: Check autoplay settings in Preferences\n" +
            "• Safari: Check Settings → Websites → Auto-Play",
        );
      } else {
        alert(
          "Failed to play sound: " +
            errorMessage +
            "\n\nPlease check your audio settings.",
        );
      }
    }
  };

  // Default alert terms (common interesting messages)
  const defaultAlertTerms = [
    "COP",
    "POLICE",
    "AUTHORITIES",
    "FIRE",
    "CHOP",
    "TURBULENCE",
    "TURB",
    "FAULT",
    "DIVERT",
    "MASK",
    "CSR",
    "AGENT",
    "MEDICAL",
    "SECURITY",
    "MAYDAY",
    "EMERGENCY",
    "PAN",
    "RED COAT",
    "RED",
    "OXYGEN",
    "DOCTOR",
    "LEAK",
    "COAT",
    "SIGMET",
    "ASH",
    "DIPS",
    "PAX",
    "DOG",
  ];

  // Alert terms handlers
  const handleLoadDefaultTerms = useCallback(() => {
    // Only add terms that aren't already present
    const newTermsToAdd = defaultAlertTerms.filter(
      (term) => !alertTerms.terms.includes(term),
    );

    if (newTermsToAdd.length === 0) {
      alert("All default alert terms are already loaded.");
      return;
    }

    const newTerms = {
      terms: [...alertTerms.terms, ...newTermsToAdd],
      ignore: alertTerms.ignore,
    };
    setAlertTerms(newTerms);

    // Emit to backend via Socket.IO
    import("../services/socket").then((socketModule) => {
      const socket = socketModule.socketService.getSocket();
      // biome-ignore lint/suspicious/noExplicitAny: Flask-SocketIO requires namespace as third argument
      (socket as any).emit("update_alerts", newTerms, "/main");
    });

    alert(
      `Added ${newTermsToAdd.length} default alert term${newTermsToAdd.length !== 1 ? "s" : ""}.`,
    );
  }, [alertTerms, setAlertTerms]);

  const handleAddAlertTerm = useCallback(() => {
    const term = newAlertTerm.trim().toUpperCase();
    if (term && !alertTerms.terms.includes(term)) {
      const newTerms = {
        terms: [...alertTerms.terms, term],
        ignore: alertTerms.ignore,
      };
      setAlertTerms(newTerms);
      setNewAlertTerm("");

      // Emit to backend via Socket.IO
      import("../services/socket").then((socketModule) => {
        const socket = socketModule.socketService.getSocket();
        // biome-ignore lint/suspicious/noExplicitAny: Flask-SocketIO requires namespace as third argument
        (socket as any).emit("update_alerts", newTerms, "/main");
      });
    }
  }, [newAlertTerm, alertTerms, setAlertTerms]);

  const handleRemoveAlertTerm = useCallback(
    (term: string) => {
      const newTerms = {
        terms: alertTerms.terms.filter((t) => t !== term),
        ignore: alertTerms.ignore,
      };
      setAlertTerms(newTerms);

      // Emit to backend via Socket.IO
      import("../services/socket").then((socketModule) => {
        const socket = socketModule.socketService.getSocket();
        // biome-ignore lint/suspicious/noExplicitAny: Flask-SocketIO requires namespace as third argument
        (socket as any).emit("update_alerts", newTerms, "/main");
      });
    },
    [alertTerms, setAlertTerms],
  );

  const handleAlertTermKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddAlertTerm();
      }
    },
    [handleAddAlertTerm],
  );

  const handleAddIgnoreTerm = useCallback(() => {
    const term = newIgnoreTerm.trim().toUpperCase();
    if (term && !alertTerms.ignore.includes(term)) {
      const newTerms = {
        terms: alertTerms.terms,
        ignore: [...alertTerms.ignore, term],
      };
      setAlertTerms(newTerms);
      setNewIgnoreTerm("");

      // Emit to backend via Socket.IO
      import("../services/socket").then((socketModule) => {
        const socket = socketModule.socketService.getSocket();
        // biome-ignore lint/suspicious/noExplicitAny: Flask-SocketIO requires namespace as third argument
        (socket as any).emit("update_alerts", newTerms, "/main");
      });
    }
  }, [newIgnoreTerm, alertTerms, setAlertTerms]);

  const handleRemoveIgnoreTerm = useCallback(
    (term: string) => {
      const newTerms = {
        terms: alertTerms.terms,
        ignore: alertTerms.ignore.filter((t) => t !== term),
      };
      setAlertTerms(newTerms);

      // Emit to backend via Socket.IO
      import("../services/socket").then((socketModule) => {
        const socket = socketModule.socketService.getSocket();
        // biome-ignore lint/suspicious/noExplicitAny: Flask-SocketIO requires namespace as third argument
        (socket as any).emit("update_alerts", newTerms, "/main");
      });
    },
    [alertTerms, setAlertTerms],
  );

  const handleIgnoreTermKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddIgnoreTerm();
      }
    },
    [handleAddIgnoreTerm],
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
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "advanced"}
            aria-controls="advanced-panel"
            className={`settings-tab ${activeTab === "advanced" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("advanced")}
          >
            Advanced
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
              title="Theme"
              subtitle="Choose your preferred color scheme"
              variant="success"
            >
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
            </Card>

            <Card
              title="Miscellaneous"
              subtitle="Additional appearance options"
              variant="info"
            >
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

              <RadioGroup
                name="altitude-unit"
                label="Altitude Units"
                value={settings.regional.altitudeUnit}
                options={[
                  {
                    value: "feet",
                    label: "Feet",
                    description: "Imperial units (ft) - default",
                  },
                  {
                    value: "meters",
                    label: "Metres",
                    description: "Metric units (m)",
                  },
                ]}
                onChange={(value) => setAltitudeUnit(value as AltitudeUnit)}
                helpText="Choose units for displaying aircraft altitude (most of the world uses feet)"
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
              variant="success"
            >
              {isChromium && (
                <div className="settings-info settings-info--warning">
                  ⚠️ Your browser (Chrome, Brave, or Edge) requires clicking
                  "Test Sound" after each page reload due to browser security
                  policies. Consider using Firefox for a better experience.
                </div>
              )}

              <Toggle
                id="desktop-notifications"
                label="Desktop Notifications"
                checked={settings.notifications.desktop}
                onChange={(checked) => {
                  if ("Notification" in window) {
                    if (Notification.permission === "default") {
                      Notification.requestPermission().then((permission) => {
                        if (permission === "granted") {
                          setDesktopNotifications(checked);
                        } else {
                          alert(
                            "Desktop notifications permission was denied. Please enable it in your browser settings.",
                          );
                        }
                      });
                    } else if (Notification.permission === "granted") {
                      setDesktopNotifications(checked);
                    } else {
                      alert(
                        "Desktop notifications are blocked. Please enable them in your browser settings.",
                      );
                    }
                  } else {
                    alert(
                      "Your browser does not support desktop notifications.",
                    );
                  }
                }}
                helpText="Show browser notifications for new alert messages (requires permission)"
              />

              <Toggle
                id="sound-alerts"
                label="Sound Alerts"
                checked={settings.notifications.sound}
                onChange={setSoundAlerts}
                helpText="Play sound when new alert messages arrive"
              />

              {settings.notifications.sound && (
                <>
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
                    />
                    <p className="settings-help-text">
                      Adjust the volume of alert notification sounds
                    </p>
                  </div>

                  <div className="settings-field-group">
                    <Button
                      variant="secondary"
                      onClick={handleTestSound}
                      aria-label="Test alert sound"
                    >
                      Test Sound
                    </Button>
                    <p className="settings-help-text">
                      {isChromium
                        ? "Play a test sound to unlock audio for this browser session. You'll need to click this after each page reload due to browser security policies."
                        : "Play a test sound to verify alert sounds are working."}
                    </p>
                  </div>
                </>
              )}

              <Toggle
                id="alerts-only"
                label="Alerts Only (Coming Soon)"
                checked={settings.notifications.alertsOnly}
                onChange={setAlertsOnly}
                helpText="Only notify for messages that match alert terms (when enabled, ignores non-alert messages)"
                disabled
              />
            </Card>

            <Card
              title="Alert Terms"
              subtitle="Manage alert terms for message filtering"
              variant="warning"
            >
              {/* Alert Terms */}
              <div className="settings-field-group">
                <div className="settings-label-row">
                  <label htmlFor="alert-terms-input" className="settings-label">
                    Alert Terms
                  </label>
                  <Button
                    variant="info"
                    size="sm"
                    onClick={handleLoadDefaultTerms}
                    aria-label="Load default alert terms"
                  >
                    Load Defaults
                  </Button>
                </div>
                <div className="alert-terms-input-group">
                  <input
                    id="alert-terms-input"
                    type="text"
                    value={newAlertTerm}
                    onChange={(e) => setNewAlertTerm(e.target.value)}
                    onKeyPress={handleAlertTermKeyPress}
                    placeholder="Enter term and press Enter"
                    className="alert-terms-input"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAddAlertTerm}
                    disabled={!newAlertTerm.trim()}
                    aria-label="Add alert term"
                  >
                    Add
                  </Button>
                </div>
                <p className="settings-help-text">
                  Examples: EMERGENCY, UAL123, N12345, A1B2C3 (hex code)
                </p>

                {alertTerms.terms.length > 0 && (
                  <div className="alert-terms-chips">
                    {alertTerms.terms.map((term) => (
                      <span key={term} className="alert-term-chip">
                        {term}
                        <button
                          type="button"
                          onClick={() => handleRemoveAlertTerm(term)}
                          aria-label={`Remove alert term ${term}`}
                          className="alert-term-chip__remove"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Ignore Terms */}
              <div className="settings-field-group">
                <label htmlFor="ignore-terms-input" className="settings-label">
                  Ignore Terms
                </label>
                <div className="alert-terms-input-group">
                  <input
                    id="ignore-terms-input"
                    type="text"
                    value={newIgnoreTerm}
                    onChange={(e) => setNewIgnoreTerm(e.target.value)}
                    onKeyPress={handleIgnoreTermKeyPress}
                    placeholder="Enter term and press Enter"
                    className="alert-terms-input"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAddIgnoreTerm}
                    disabled={!newIgnoreTerm.trim()}
                    aria-label="Add ignore term"
                  >
                    Add
                  </Button>
                </div>
                <p className="settings-help-text">
                  Messages matching these terms will NOT trigger alerts, even if
                  they match alert terms above
                </p>

                {alertTerms.ignore.length > 0 && (
                  <div className="alert-terms-chips">
                    {alertTerms.ignore.map((term) => (
                      <span
                        key={term}
                        className="alert-term-chip alert-term-chip--ignore"
                      >
                        {term}
                        <button
                          type="button"
                          onClick={() => handleRemoveIgnoreTerm(term)}
                          aria-label={`Remove ignore term ${term}`}
                          className="alert-term-chip__remove"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
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
              <div className="settings-field-group">
                <label htmlFor="max-messages" className="settings-label">
                  Max Messages per Source:{" "}
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
                  Maximum messages to keep per source (aircraft, station, etc.)
                </p>
              </div>

              <div className="settings-field-group">
                <label htmlFor="max-groups" className="settings-label">
                  Max Message Groups: {settings.data.maxMessageGroups}
                </label>
                <input
                  id="max-groups"
                  type="range"
                  min="10"
                  max="200"
                  step="10"
                  value={settings.data.maxMessageGroups}
                  onChange={(e) => setMaxMessageGroups(Number(e.target.value))}
                  className="settings-slider"
                />
                <p className="settings-help-text">
                  Maximum number of message sources to track (oldest groups are
                  culled)
                </p>
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
                  Automatically clear old data after specified time (0 = never)
                </p>
              </div>
            </Card>
          </div>
        )}

        {/* Advanced Panel */}
        {activeTab === "advanced" && (
          <div
            id="advanced-panel"
            role="tabpanel"
            aria-labelledby="advanced-tab"
            className="settings-panel"
          >
            <Card
              title="Logging & Debugging"
              subtitle="Configure application logging and view system logs"
              variant="info"
            >
              <Select
                id="log-level"
                label="Log Level"
                value={settings.advanced.logLevel}
                options={[
                  {
                    value: "silent",
                    label: "Silent - No logging",
                  },
                  {
                    value: "error",
                    label: "Error - Critical issues only",
                  },
                  {
                    value: "warn",
                    label: "Warning - Errors and warnings",
                  },
                  {
                    value: "info",
                    label: "Info - General information (default)",
                  },
                  {
                    value: "debug",
                    label: "Debug - Detailed debugging info",
                  },
                  {
                    value: "trace",
                    label: "Trace - Very verbose (performance impact)",
                  },
                ]}
                onChange={(value) => setLogLevel(value as LogLevel)}
                helpText="Control how much information is logged to the console and buffer"
                fullWidth
              />

              <Toggle
                id="persist-logs"
                label="Persist Logs Across Page Refreshes"
                checked={settings.advanced.persistLogs}
                onChange={setPersistLogs}
                helpText="Save logs to localStorage so they survive page reloads (uses browser storage)"
              />

              <div className="settings-divider" />

              <h3 className="settings-subsection-title">Application Logs</h3>
              <p className="settings-help-text">
                View recent application logs. Use the controls to filter,
                search, and export logs for troubleshooting.
              </p>

              <LogsViewer maxHeight={400} showStats={true} />
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
