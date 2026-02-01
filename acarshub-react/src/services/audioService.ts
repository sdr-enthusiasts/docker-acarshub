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

import { uiLogger } from "../utils/logger";

/**
 * AudioService
 * Shared audio service for playing alert sounds
 *
 * This service creates a single Audio element shared across the application
 * to avoid browser autoplay blocking issues. Once audio is "unlocked" via
 * a user gesture (like clicking Test Sound), all components can use this
 * service to play sounds.
 *
 * Browser Autoplay Policy:
 * Modern browsers block audio from playing automatically until the user
 * interacts with the page. The first call to playAlertSound() that's
 * triggered by a user gesture (click, tap) will unlock audio playback
 * for this Audio element, allowing subsequent automatic playback.
 */
class AudioService {
  private audio: HTMLAudioElement | null = null;
  private audioUnlocked = false;
  private readonly audioPath = "/static/sounds/alert.mp3";
  private readonly STORAGE_KEY = "acarshub.audioUnlocked";

  constructor() {
    // Check if user has previously unlocked audio
    const wasUnlocked = localStorage.getItem(this.STORAGE_KEY) === "true";
    if (wasUnlocked) {
      this.audioUnlocked = true;
      uiLogger.debug("Audio was previously unlocked by user");
    }
  }

  /**
   * Get or create the shared Audio element
   */
  private getAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio(this.audioPath);
      uiLogger.debug("Created shared Audio element", { path: this.audioPath });
    }
    return this.audio;
  }

  /**
   * Play the alert sound
   * @param volume - Volume level (0-100)
   * @returns Promise that resolves if sound plays, rejects if blocked/failed
   */
  async playAlertSound(volume: number): Promise<void> {
    const audio = this.getAudio();
    audio.volume = Math.max(0, Math.min(100, volume)) / 100;

    uiLogger.debug("Attempting to play alert sound", {
      volume,
      audioUnlocked: this.audioUnlocked,
    });

    try {
      await audio.play();

      // Mark as unlocked and persist to localStorage
      if (!this.audioUnlocked) {
        this.audioUnlocked = true;
        localStorage.setItem(this.STORAGE_KEY, "true");
        uiLogger.info("Audio unlocked and saved to localStorage");
      }

      uiLogger.debug("Alert sound played successfully");
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "";
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isAutoplayError =
        errorName === "NotAllowedError" || errorName === "NotSupportedError";

      if (isAutoplayError) {
        uiLogger.warn("Alert sound blocked by browser autoplay policy", {
          error: errorMessage,
          name: errorName,
          suggestion:
            "User needs to click Test Sound in Settings to unlock audio",
        });
        throw new Error("AUTOPLAY_BLOCKED");
      }

      uiLogger.error("Failed to play alert sound", {
        error: errorMessage,
        name: errorName,
      });
      throw error;
    }
  }

  /**
   * Test if audio playback is unlocked
   * Useful for showing warnings to users
   */
  isAudioUnlocked(): boolean {
    return this.audioUnlocked;
  }

  /**
   * Reset the unlocked state (mainly for testing)
   */
  reset(): void {
    this.audioUnlocked = false;
    localStorage.removeItem(this.STORAGE_KEY);
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    uiLogger.debug("Audio service reset");
  }
}

/**
 * Singleton instance
 * Export a single shared instance for the entire application
 */
export const audioService = new AudioService();
