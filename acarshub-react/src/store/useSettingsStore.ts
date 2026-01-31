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

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AppearanceSettings,
  DataSettings,
  DateFormat,
  DisplayDensity,
  NotificationSettings,
  RegionalSettings,
  Theme,
  TimeFormat,
  UserSettings,
} from "../types";

/**
 * Settings Store State
 */
interface SettingsState {
  // Current settings
  settings: UserSettings;

  // Appearance actions
  setTheme: (theme: Theme) => void;
  setDensity: (density: DisplayDensity) => void;
  setShowConnectionStatus: (show: boolean) => void;
  setAnimations: (enabled: boolean) => void;

  // Regional actions
  setTimeFormat: (format: TimeFormat) => void;
  setDateFormat: (format: DateFormat) => void;
  setTimezone: (timezone: "local" | "utc") => void;
  setLocale: (locale: string | undefined) => void;

  // Notification actions
  setDesktopNotifications: (enabled: boolean) => void;
  setSoundAlerts: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  setAlertsOnly: (enabled: boolean) => void;

  // Data actions
  setMaxMessagesPerAircraft: (max: number) => void;
  setEnableCaching: (enabled: boolean) => void;
  setAutoClearMinutes: (minutes: number) => void;

  // Batch update actions
  updateAppearanceSettings: (settings: Partial<AppearanceSettings>) => void;
  updateRegionalSettings: (settings: Partial<RegionalSettings>) => void;
  updateNotificationSettings: (settings: Partial<NotificationSettings>) => void;
  updateDataSettings: (settings: Partial<DataSettings>) => void;

  // Utility actions
  resetToDefaults: () => void;
  exportSettings: () => string;
  importSettings: (json: string) => boolean;
}

/**
 * Get default settings with current timestamp
 */
const getDefaultSettings = (): UserSettings => {
  // Import DEFAULT_SETTINGS at runtime to avoid circular dependency
  const defaults: UserSettings = {
    appearance: {
      theme: "mocha",
      density: "comfortable",
      showConnectionStatus: true,
      animations: true,
    },
    regional: {
      timeFormat: "auto",
      dateFormat: "auto",
      timezone: "local",
    },
    notifications: {
      desktop: false,
      sound: false,
      volume: 50,
      alertsOnly: true,
    },
    data: {
      maxMessagesPerAircraft: 50,
      enableCaching: true,
      autoClearMinutes: 60,
    },
    updatedAt: Date.now(),
    version: 1,
  };
  return defaults;
};

/**
 * Settings Store with localStorage persistence
 *
 * Persists all user settings to localStorage and provides
 * granular actions for updating individual settings.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Initialize with defaults
      settings: getDefaultSettings(),

      // Appearance actions
      setTheme: (theme) =>
        set((state) => ({
          settings: {
            ...state.settings,
            appearance: { ...state.settings.appearance, theme },
            updatedAt: Date.now(),
          },
        })),

      setDensity: (density) =>
        set((state) => ({
          settings: {
            ...state.settings,
            appearance: { ...state.settings.appearance, density },
            updatedAt: Date.now(),
          },
        })),

      setShowConnectionStatus: (show) =>
        set((state) => ({
          settings: {
            ...state.settings,
            appearance: {
              ...state.settings.appearance,
              showConnectionStatus: show,
            },
            updatedAt: Date.now(),
          },
        })),

      setAnimations: (enabled) =>
        set((state) => ({
          settings: {
            ...state.settings,
            appearance: { ...state.settings.appearance, animations: enabled },
            updatedAt: Date.now(),
          },
        })),

      // Regional actions
      setTimeFormat: (format) =>
        set((state) => ({
          settings: {
            ...state.settings,
            regional: { ...state.settings.regional, timeFormat: format },
            updatedAt: Date.now(),
          },
        })),

      setDateFormat: (format) =>
        set((state) => ({
          settings: {
            ...state.settings,
            regional: { ...state.settings.regional, dateFormat: format },
            updatedAt: Date.now(),
          },
        })),

      setTimezone: (timezone) =>
        set((state) => ({
          settings: {
            ...state.settings,
            regional: { ...state.settings.regional, timezone },
            updatedAt: Date.now(),
          },
        })),

      setLocale: (locale) =>
        set((state) => ({
          settings: {
            ...state.settings,
            regional: { ...state.settings.regional, locale },
            updatedAt: Date.now(),
          },
        })),

      // Notification actions
      setDesktopNotifications: (enabled) =>
        set((state) => ({
          settings: {
            ...state.settings,
            notifications: {
              ...state.settings.notifications,
              desktop: enabled,
            },
            updatedAt: Date.now(),
          },
        })),

      setSoundAlerts: (enabled) =>
        set((state) => ({
          settings: {
            ...state.settings,
            notifications: { ...state.settings.notifications, sound: enabled },
            updatedAt: Date.now(),
          },
        })),

      setVolume: (volume) =>
        set((state) => ({
          settings: {
            ...state.settings,
            notifications: {
              ...state.settings.notifications,
              volume: Math.max(0, Math.min(100, volume)),
            },
            updatedAt: Date.now(),
          },
        })),

      setAlertsOnly: (enabled) =>
        set((state) => ({
          settings: {
            ...state.settings,
            notifications: {
              ...state.settings.notifications,
              alertsOnly: enabled,
            },
            updatedAt: Date.now(),
          },
        })),

      // Data actions
      setMaxMessagesPerAircraft: (max) =>
        set((state) => ({
          settings: {
            ...state.settings,
            data: {
              ...state.settings.data,
              maxMessagesPerAircraft: Math.max(1, max),
            },
            updatedAt: Date.now(),
          },
        })),

      setEnableCaching: (enabled) =>
        set((state) => ({
          settings: {
            ...state.settings,
            data: { ...state.settings.data, enableCaching: enabled },
            updatedAt: Date.now(),
          },
        })),

      setAutoClearMinutes: (minutes) =>
        set((state) => ({
          settings: {
            ...state.settings,
            data: {
              ...state.settings.data,
              autoClearMinutes: Math.max(0, minutes),
            },
            updatedAt: Date.now(),
          },
        })),

      // Batch update actions
      updateAppearanceSettings: (updates) =>
        set((state) => ({
          settings: {
            ...state.settings,
            appearance: { ...state.settings.appearance, ...updates },
            updatedAt: Date.now(),
          },
        })),

      updateRegionalSettings: (updates) =>
        set((state) => ({
          settings: {
            ...state.settings,
            regional: { ...state.settings.regional, ...updates },
            updatedAt: Date.now(),
          },
        })),

      updateNotificationSettings: (updates) =>
        set((state) => ({
          settings: {
            ...state.settings,
            notifications: { ...state.settings.notifications, ...updates },
            updatedAt: Date.now(),
          },
        })),

      updateDataSettings: (updates) =>
        set((state) => ({
          settings: {
            ...state.settings,
            data: { ...state.settings.data, ...updates },
            updatedAt: Date.now(),
          },
        })),

      // Utility actions
      resetToDefaults: () =>
        set({
          settings: getDefaultSettings(),
        }),

      exportSettings: () => {
        const { settings } = get();
        return JSON.stringify(settings, null, 2);
      },

      importSettings: (json: string) => {
        try {
          const imported = JSON.parse(json) as UserSettings;

          // Validate structure (basic validation)
          if (
            !imported.appearance ||
            !imported.regional ||
            !imported.notifications ||
            !imported.data
          ) {
            console.error("Invalid settings format");
            return false;
          }

          // Update settings with imported values
          set({
            settings: {
              ...imported,
              updatedAt: Date.now(),
              version: 1, // Current version
            },
          });

          return true;
        } catch (error) {
          console.error("Failed to import settings:", error);
          return false;
        }
      },
    }),
    {
      name: "acarshub-settings",
      version: 1,
      // Migrate old settings if needed
      migrate: (persistedState: unknown, version: number) => {
        if (version === 0) {
          // Migration from version 0 to 1
          // For now, just return defaults
          return { settings: getDefaultSettings() };
        }
        return persistedState as SettingsState;
      },
    },
  ),
);

/**
 * Hook to get current theme from settings
 * Convenience hook that other components can use
 */
export const useTheme = (): Theme => {
  return useSettingsStore((state) => state.settings.appearance.theme);
};

/**
 * Hook to get current time format preference
 * Returns the actual preference (12h/24h) based on auto-detect or user choice
 */
export const useTimeFormat = (): "12h" | "24h" => {
  const format = useSettingsStore(
    (state) => state.settings.regional.timeFormat,
  );

  if (format === "auto") {
    // Auto-detect user preference
    const date = new Date(Date.UTC(2020, 0, 1, 20, 0));
    const formatted = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "UTC",
    }).format(date);
    return formatted.match(/AM|PM/i) ? "12h" : "24h";
  }

  return format;
};

/**
 * Hook to get locale preference
 * Returns user's locale override or undefined for auto-detect
 */
export const useLocale = (): string | undefined => {
  return useSettingsStore((state) => state.settings.regional.locale);
};
