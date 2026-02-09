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
import { ALL_PROVIDERS } from "../config/mapProviders";
import { audioService } from "../services/audioService";
import { useAppStore } from "../store/useAppStore";
import { useSettingsStore, useTheme } from "../store/useSettingsStore";
import type {
  AltitudeUnit,
  DateFormat,
  LogLevel,
  MapProvider,
  Theme,
  TimeFormat,
} from "../types";
import { getVersionInfo } from "../utils/version";
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

  // Check if remote updates are allowed (from backend configuration)
  const decoders = useAppStore((state) => state.decoders);
  const allowRemoteUpdates = decoders?.allow_remote_updates ?? true;
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
  const setOnPageAlerts = useSettingsStore((state) => state.setOnPageAlerts);
  const setMaxMessagesPerAircraft = useSettingsStore(
    (state) => state.setMaxMessagesPerAircraft,
  );
  const setMaxMessageGroups = useSettingsStore(
    (state) => state.setMaxMessageGroups,
  );
  const resetToDefaults = useSettingsStore((state) => state.resetToDefaults);
  const exportSettings = useSettingsStore((state) => state.exportSettings);
  const importSettings = useSettingsStore((state) => state.importSettings);
  const setLogLevel = useSettingsStore((state) => state.setLogLevel);
  const setPersistLogs = useSettingsStore((state) => state.setPersistLogs);

  const [activeTab, setActiveTab] = useState<string>("appearance");

  // Map settings
  const theme = useTheme();
  const mapProvider = useSettingsStore((state) => state.settings.map.provider);
  const customTileUrl = useSettingsStore(
    (state) => state.settings.map.customTileUrl,
  );
  const userSelectedProvider = useSettingsStore(
    (state) => state.settings.map.userSelectedProvider,
  );
  const setMapProvider = useSettingsStore((state) => state.setMapProvider);
  const setCustomTileUrl = useSettingsStore((state) => state.setCustomTileUrl);

  // Alert terms management state
  const [newAlertTerm, setNewAlertTerm] = useState("");
  const [newIgnoreTerm, setNewIgnoreTerm] = useState("");

  // Regenerate alert matches state
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

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
    const input = newAlertTerm.trim();
    if (!input) return;

    // Split on commas and process each term
    const termsToAdd = input
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t && !alertTerms.terms.includes(t));

    if (termsToAdd.length > 0) {
      const newTerms = {
        terms: [...alertTerms.terms, ...termsToAdd],
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
    const input = newIgnoreTerm.trim();
    if (!input) return;

    // Split on commas and process each term
    const termsToAdd = input
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t && !alertTerms.ignore.includes(t));

    if (termsToAdd.length > 0) {
      const newTerms = {
        terms: alertTerms.terms,
        ignore: [...alertTerms.ignore, ...termsToAdd],
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

  // Regenerate alert matches handler
  const handleRegenerateAlertMatches = useCallback(() => {
    setShowRegenerateConfirm(true);
  }, []);

  const handleConfirmRegenerate = useCallback(() => {
    setShowRegenerateConfirm(false);
    setIsRegenerating(true);

    // Import socket service and trigger regeneration
    import("../services/socket").then((socketModule) => {
      const socket = socketModule.socketService.getSocket();

      // Set up event listeners for started/completion/error
      const handleStarted = (data: { message: string }) => {
        // Regeneration has started in background thread
        console.log("Alert regeneration started:", data.message);
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
      socketModule.socketService.regenerateAlertMatches();
    });
  }, []);

  const handleCancelRegenerate = useCallback(() => {
    setShowRegenerateConfirm(false);
  }, []);

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
            aria-selected={activeTab === "map"}
            aria-controls="map-panel"
            className={`settings-tab ${activeTab === "map" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("map")}
          >
            Map
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
                id="on-page-alerts"
                label="On Page Alerts"
                checked={settings.notifications.onPageAlerts}
                onChange={setOnPageAlerts}
                helpText="Show toast notifications in the bottom-right corner when alert terms are matched (auto-dismisses after 5 seconds)"
              />
            </Card>

            <Card
              title="Alert Terms"
              subtitle="Manage alert terms for message filtering"
              variant="warning"
            >
              {!allowRemoteUpdates && (
                <p
                  className="settings-help-text"
                  style={{ marginBottom: "1rem", color: "var(--color-peach)" }}
                >
                  ⚠️ Alert term editing is disabled by the server administrator.
                  Contact your system administrator to modify alert terms.
                </p>
              )}
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
                    disabled={!allowRemoteUpdates}
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
                    disabled={!allowRemoteUpdates}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAddAlertTerm}
                    disabled={!newAlertTerm.trim() || !allowRemoteUpdates}
                    aria-label="Add alert term"
                  >
                    Add
                  </Button>
                </div>
                <p className="settings-help-text">
                  Examples: EMERGENCY, UAL123, N12345, A1B2C3 (hex code). Use
                  commas to add multiple terms at once.
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
                          disabled={!allowRemoteUpdates}
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
                    disabled={!allowRemoteUpdates}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAddIgnoreTerm}
                    disabled={!newIgnoreTerm.trim() || !allowRemoteUpdates}
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
                          disabled={!allowRemoteUpdates}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Regenerate Alert Matches */}
              <div
                className="settings-field-group"
                style={{
                  marginTop: "2rem",
                  paddingTop: "1.5rem",
                  borderTop: "1px solid var(--color-surface0)",
                }}
              >
                <div style={{ marginBottom: "1rem" }}>
                  <h4
                    style={{
                      margin: "0 0 0.5rem 0",
                      color: "var(--color-text)",
                    }}
                  >
                    Regenerate Alert Matches
                  </h4>
                  <p
                    className="settings-help-text"
                    style={{ marginBottom: "1rem" }}
                  >
                    Re-process all messages in the database against current
                    alert terms. This will delete all existing matches and
                    rebuild them from scratch.
                  </p>
                  <p
                    className="settings-help-text"
                    style={{
                      marginBottom: "1rem",
                      color: "var(--color-peach)",
                    }}
                  >
                    ⚠️ <strong>Warning:</strong> This operation can take a long
                    time on large databases (minutes for millions of messages).
                    Processing runs in the background - you can continue using
                    the app while it completes.
                  </p>
                </div>
                <Button
                  variant="warning"
                  onClick={handleRegenerateAlertMatches}
                  disabled={!allowRemoteUpdates || isRegenerating}
                  aria-label="Regenerate all alert matches"
                >
                  {isRegenerating
                    ? "Regenerating in background..."
                    : "Regenerate All Matches"}
                </Button>
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
            </Card>
          </div>
        )}

        {/* Map Panel */}
        {activeTab === "map" && (
          <div
            id="map-panel"
            role="tabpanel"
            aria-labelledby="map-tab"
            className="settings-panel"
          >
            <Card
              title="Map Provider"
              variant="default"
              className="settings-card"
            >
              <div className="settings-card__content">
                <p className="settings-card__help">
                  Choose your preferred map tile provider. All providers are
                  free and do not require API keys.
                </p>

                {!userSelectedProvider && (
                  <div className="settings-card__info">
                    <p>
                      <strong>🎨 Theme-Aware Mode Active:</strong> Map
                      automatically switches between light/dark variants when
                      you change themes. Select a provider below to override.
                    </p>
                  </div>
                )}

                <div className="settings-form-field">
                  <Select
                    id="map-provider"
                    label="Map Provider"
                    value={!userSelectedProvider ? "" : mapProvider}
                    onChange={(value) => {
                      if (value === "") {
                        // Reset to theme-aware mode - trigger immediate theme switch
                        const themeProvider =
                          theme === "mocha"
                            ? "carto_dark_all"
                            : "carto_light_all";
                        setMapProvider(themeProvider as MapProvider, false);
                      } else {
                        setMapProvider(value as MapProvider);
                      }
                    }}
                    options={[
                      { value: "", label: "Default (Theme Aware)" },
                      ...ALL_PROVIDERS.map((p) => ({
                        value: p.id,
                        label: p.name,
                      })),
                    ]}
                  />
                </div>

                <div className="settings-form-field">
                  <label htmlFor="custom-tile-url">Custom Tile URL</label>
                </div>
                <div className="settings-form-field">
                  <input
                    id="custom-tile-url"
                    type="text"
                    className="settings-input"
                    style={{ width: "100%" }}
                    placeholder="https://example.com/{z}/{x}/{y}.png"
                    value={customTileUrl || ""}
                    onChange={(e) => {
                      setCustomTileUrl(e.target.value || undefined);
                      if (e.target.value) {
                        setMapProvider("custom");
                      }
                    }}
                  />
                  <p className="settings-card__help">
                    Enter a custom tile URL template. Use {"{z}"}, {"{x}"}, and{" "}
                    {"{y}"} placeholders. Selecting this will automatically set
                    the provider to "Custom".
                  </p>
                </div>

                <div className="settings-card__info">
                  <p>
                    <strong>Current Provider:</strong>{" "}
                    {ALL_PROVIDERS.find((p) => p.id === mapProvider)?.name ||
                      (mapProvider === "custom" ? "Custom" : "Theme-Aware")}
                  </p>
                  {mapProvider === "custom" && customTileUrl && (
                    <p className="settings-card__help">
                      Custom URL: {customTileUrl}
                    </p>
                  )}
                  {!userSelectedProvider && (
                    <p className="settings-card__help">
                      Automatically switching between light/dark maps based on
                      theme
                    </p>
                  )}
                  {userSelectedProvider && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMapProvider(mapProvider, false)}
                    >
                      Reset to Theme-Aware Mode
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            <Card
              title="Map Provider Reference"
              variant="info"
              className="settings-card"
            >
              <div className="settings-card__content">
                <p className="settings-card__help">
                  <strong>Default (Theme Aware):</strong> Automatically switches
                  between dark/light map variants when you change themes.
                </p>

                <p className="settings-card__help">
                  <strong>Available Providers:</strong>
                </p>
                <ul className="settings-list">
                  <li>
                    <strong>OpenStreetMap:</strong> Community-driven open map
                  </li>
                  <li>
                    <strong>CARTO.com:</strong> Clean, professional maps with
                    light/dark variants
                  </li>
                  <li>
                    <strong>OpenFreeMap:</strong> Vector tile maps with multiple
                    styles
                  </li>
                  <li>
                    <strong>ESRI.com:</strong> Satellite imagery and street maps
                  </li>
                  <li>
                    <strong>GIBS Clouds:</strong> NASA satellite imagery from
                    yesterday
                  </li>
                  <li>
                    <strong>VFR Sectional:</strong> Visual flight rules charts
                    (zoom 8-12)
                  </li>
                  <li>
                    <strong>VFR Terminal:</strong> Terminal area charts (zoom
                    10-12)
                  </li>
                  <li>
                    <strong>IFR Low/High:</strong> Instrument flight rules
                    enroute charts
                  </li>
                </ul>

                <p className="settings-card__help">
                  All providers are free to use and do not require API keys.
                  Based on tar1090's map provider selection.
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
              title="Version Information"
              variant="default"
              className="settings-card"
            >
              <div className="settings-card__content">
                <p className="settings-help-text">
                  <strong>ACARS Hub Version:</strong>{" "}
                  {getVersionInfo().fullVersion}
                </p>
                <p className="settings-help-text">
                  <strong>Frontend:</strong> React {getVersionInfo().version}
                </p>
                {getVersionInfo().isDockerBuild && (
                  <p className="settings-help-text">
                    <strong>Build:</strong> Docker Build{" "}
                    {getVersionInfo().buildNumber}
                  </p>
                )}
                {!getVersionInfo().isDockerBuild && (
                  <p className="settings-help-text">
                    <strong>Environment:</strong> Development
                  </p>
                )}
              </div>
            </Card>

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

      {/* Regenerate Confirmation Modal */}
      {showRegenerateConfirm && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
        >
          <div
            className="confirm-content"
            style={{
              backgroundColor: "var(--color-base)",
              padding: "2rem",
              borderRadius: "0.5rem",
              maxWidth: "500px",
              margin: "1rem",
              border: "2px solid var(--color-peach)",
            }}
          >
            <h3 style={{ marginTop: 0, color: "var(--color-text)" }}>
              Confirm Regenerate Alert Matches
            </h3>
            <p style={{ color: "var(--color-subtext1)" }}>
              This will delete all existing alert matches and re-process every
              message in the database.
            </p>
            <p style={{ color: "var(--color-peach)", fontWeight: "bold" }}>
              This cannot be undone and may take several seconds to complete.
            </p>
            <p style={{ color: "var(--color-subtext1)" }}>
              Do you want to continue?
            </p>
            <div
              style={{
                display: "flex",
                gap: "1rem",
                marginTop: "1.5rem",
                justifyContent: "flex-end",
              }}
            >
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
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10001,
          }}
        >
          <div
            className="processing-content"
            style={{
              backgroundColor: "var(--color-base)",
              padding: "3rem",
              borderRadius: "0.5rem",
              textAlign: "center",
              border: "2px solid var(--color-blue)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--color-text)" }}>
              Regenerating Alert Matches
            </h3>
            <p
              style={{
                margin: 0,
                color: "var(--color-blue)",
                fontSize: "2rem",
                fontWeight: "bold",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            >
              ●●●
            </p>
            <p style={{ margin: "1rem 0 0 0", color: "var(--color-subtext1)" }}>
              Processing in background... You can continue using the app.
            </p>
            <p
              style={{
                margin: "0.5rem 0 0 0",
                color: "var(--color-subtext0)",
                fontSize: "0.875rem",
              }}
            >
              You'll be notified when the operation completes.
            </p>
            <Button
              variant="secondary"
              onClick={() => setIsRegenerating(false)}
              style={{ marginTop: "1.5rem" }}
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
