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
// GOD-05: extracted from components/SettingsModal.tsx. Self-contained via
// useSettingsStore — no props needed from the parent.
// ----------------------------------------------------------------------------

import { useMemo } from "react";
import { audioService } from "../../services/audioService";
import { useSettingsStore } from "../../store/useSettingsStore";
import { Button } from "../Button";
import { Card } from "../Card";
import { Toggle } from "../Toggle";

export function NotificationsTab() {
  const settings = useSettingsStore((state) => state.settings);
  const setDesktopNotifications = useSettingsStore(
    (state) => state.setDesktopNotifications,
  );
  const setSoundAlerts = useSettingsStore((state) => state.setSoundAlerts);
  const setVolume = useSettingsStore((state) => state.setVolume);
  const setOnPageAlerts = useSettingsStore((state) => state.setOnPageAlerts);

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

  return (
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
            ⚠️ Your browser (Chrome, Brave, or Edge) requires clicking "Test
            Sound" after each page reload due to browser security policies.
            Consider using Firefox for a better experience.
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
              alert("Your browser does not support desktop notifications.");
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
    </div>
  );
}
