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
import { audioService } from "../services/audioService";
import { useAppStore } from "../store/useAppStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { uiLogger } from "../utils/logger";

/**
 * AlertSoundManager Component
 * Global component that plays alert sounds regardless of which page is active
 *
 * This component:
 * - Monitors the total alert count from AppStore
 * - Plays sound when new alerts arrive (count increases)
 * - Respects sound settings from Settings store
 * - Works on all pages (Live Messages, Map, Stats, etc.)
 * - Debounces rapid alerts to prevent sound spam
 *
 * This component renders nothing (returns null) - it only manages side effects.
 */
export const AlertSoundManager = () => {
  const soundEnabled = useSettingsStore(
    (state) => state.settings.notifications.sound,
  );
  const volume = useSettingsStore(
    (state) => state.settings.notifications.volume,
  );
  const alertCount = useAppStore((state) => state.alertCount);

  const lastAlertTime = useRef<number>(0);
  const previousAlertCount = useRef<number>(0);

  const playAlertSound = useCallback(async () => {
    try {
      await audioService.playAlertSound(volume);
      uiLogger.info("Global alert sound played", {
        alertCount,
        volume,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage === "AUTOPLAY_BLOCKED") {
        uiLogger.warn(
          "Alert sound blocked by browser. User needs to click Test Sound in Settings.",
        );
      } else {
        uiLogger.error("Failed to play global alert sound", {
          error: errorMessage,
        });
      }
    }
  }, [volume, alertCount]);

  // Monitor alert count and play sound for new alerts
  useEffect(() => {
    uiLogger.debug("Alert sound manager: checking for new alerts", {
      soundEnabled,
      alertCount,
      previousCount: previousAlertCount.current,
    });

    // Skip if sound is disabled
    if (!soundEnabled) {
      uiLogger.debug("Sound is disabled, skipping");
      previousAlertCount.current = alertCount;
      return;
    }

    // Only play sound if alert count INCREASED (new alerts arrived)
    const alertCountIncreased = alertCount > previousAlertCount.current;

    if (!alertCountIncreased) {
      uiLogger.debug("Alert count did not increase, skipping", {
        current: alertCount,
        previous: previousAlertCount.current,
      });
      previousAlertCount.current = alertCount;
      return;
    }

    const now = Date.now();
    const timeSinceLastAlert = now - lastAlertTime.current;

    uiLogger.debug("Alert count increased, checking debounce", {
      timeSinceLastAlert,
      debounceThreshold: 2000,
      willPlay: timeSinceLastAlert > 2000,
    });

    // Debounce: only play if at least 2 seconds have passed since last alert
    if (timeSinceLastAlert > 2000) {
      uiLogger.info("Playing alert sound for new alerts", {
        newAlertCount: alertCount,
        previousCount: previousAlertCount.current,
      });
      playAlertSound();
      lastAlertTime.current = now;
    } else {
      uiLogger.debug("Debounce threshold not met, skipping sound");
    }

    // Update previous count for next comparison
    previousAlertCount.current = alertCount;
  }, [alertCount, soundEnabled, playAlertSound]);

  // This component renders nothing
  return null;
};
