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
  AdvancedSettings,
  AltitudeUnit,
  AppearanceSettings,
  DataSettings,
  DateFormat,
  LogLevel,
  MapProvider,
  MapSettings,
  NotificationSettings,
  RegionalSettings,
  Theme,
  TimeFormat,
  UserSettings,
} from "../types";
import { syncLoggerWithSettings } from "../utils/logger";

/**
 * Settings Store State
 */
interface SettingsState {
  // Current settings
  settings: UserSettings;

  // Appearance actions
  setTheme: (theme: Theme) => void;
  setShowConnectionStatus: (show: boolean) => void;
  setAnimations: (enabled: boolean) => void;

  // Regional actions
  setTimeFormat: (format: TimeFormat) => void;
  setDateFormat: (format: DateFormat) => void;
  setTimezone: (timezone: "local" | "utc") => void;
  setLocale: (locale: string | undefined) => void;
  setAltitudeUnit: (unit: AltitudeUnit) => void;

  // Notification actions
  setDesktopNotifications: (enabled: boolean) => void;
  setSoundAlerts: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  setAlertsOnly: (enabled: boolean) => void;

  // Data actions
  setMaxMessagesPerAircraft: (max: number) => void;
  setMaxMessageGroups: (max: number) => void;
  setEnableCaching: (enabled: boolean) => void;
  setAutoClearMinutes: (minutes: number) => void;

  // Map actions
  setMapProvider: (provider: MapProvider) => void;
  setMaptilerApiKey: (key: string | undefined) => void;
  setStationLocation: (lat: number, lon: number) => void;
  setRangeRings: (rings: number[]) => void;
  setDefaultMapView: (lat: number, lon: number, zoom: number) => void;
  setShowOnlyAcars: (enabled: boolean) => void;
  setShowDatablocks: (enabled: boolean) => void;
  setShowExtendedDatablocks: (enabled: boolean) => void;
  setShowNexrad: (enabled: boolean) => void;
  setShowOnlyUnread: (enabled: boolean) => void;
  setShowRangeRings: (enabled: boolean) => void;

  // Advanced actions
  setLogLevel: (level: LogLevel) => void;
  setPersistLogs: (enabled: boolean) => void;

  // Batch update actions
  updateAppearanceSettings: (settings: Partial<AppearanceSettings>) => void;
  updateRegionalSettings: (settings: Partial<RegionalSettings>) => void;
  updateNotificationSettings: (settings: Partial<NotificationSettings>) => void;
  updateDataSettings: (settings: Partial<DataSettings>) => void;
  updateMapSettings: (settings: Partial<MapSettings>) => void;
  updateAdvancedSettings: (settings: Partial<AdvancedSettings>) => void;

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
      showConnectionStatus: true,
      animations: true,
    },
    regional: {
      timeFormat: "auto",
      dateFormat: "auto",
      timezone: "local",
      altitudeUnit: "feet",
    },
    notifications: {
      desktop: false,
      sound: false,
      volume: 50,
      alertsOnly: true,
    },
    data: {
      maxMessagesPerAircraft: 50,
      maxMessageGroups: 50,
      enableCaching: true,
      autoClearMinutes: 60,
    },
    map: {
      provider: "carto",
      maptilerApiKey: undefined,
      stationLat: 0,
      stationLon: 0,
      rangeRings: [100, 200, 300],
      defaultCenterLat: 0,
      defaultCenterLon: 0,
      defaultZoom: 7,
      showOnlyAcars: false,
      showDatablocks: true,
      showExtendedDatablocks: false,
      showNexrad: false,
      showOnlyUnread: false,
      showRangeRings: true,
    },
    advanced: {
      logLevel: import.meta.env.PROD ? "warn" : "info",
      persistLogs: true,
    },
    updatedAt: Date.now(),
    version: 2,
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

      setAltitudeUnit: (unit) =>
        set((state) => ({
          settings: {
            ...state.settings,
            regional: { ...state.settings.regional, altitudeUnit: unit },
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

      setMaxMessageGroups: (max) =>
        set((state) => ({
          settings: {
            ...state.settings,
            data: {
              ...state.settings.data,
              maxMessageGroups: Math.max(1, max),
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

      // Map actions
      setMapProvider: (provider) =>
        set((state) => ({
          settings: {
            ...state.settings,
            map: { ...state.settings.map, provider },
            updatedAt: Date.now(),
          },
        })),

      setMaptilerApiKey: (key) =>
        set((state) => ({
          settings: {
            ...state.settings,
            map: { ...state.settings.map, maptilerApiKey: key },
            updatedAt: Date.now(),
          },
        })),

      setStationLocation: (lat, lon) =>
        set((state) => ({
          settings: {
            ...state.settings,
            map: { ...state.settings.map, stationLat: lat, stationLon: lon },
            updatedAt: Date.now(),
          },
        })),

      setRangeRings: (rings) =>
        set((state) => ({
          settings: {
            ...state.settings,
            map: { ...state.settings.map, rangeRings: rings },
            updatedAt: Date.now(),
          },
        })),

      setDefaultMapView: (lat, lon, zoom) =>
        set((state) => ({
          settings: {
            ...state.settings,
            map: {
              ...state.settings.map,
              defaultCenterLat: lat,
              defaultCenterLon: lon,
              defaultZoom: zoom,
            },
            updatedAt: Date.now(),
          },
        })),

      setShowOnlyAcars: (enabled) =>
        set((state) => ({
          settings: {
            ...state.settings,
            map: { ...state.settings.map, showOnlyAcars: enabled },
            updatedAt: Date.now(),
          },
        })),

      setShowDatablocks: (enabled) =>
        set((state) => ({
          settings: {
            ...state.settings,
            map: { ...state.settings.map, showDatablocks: enabled },
            updatedAt: Date.now(),
          },
        })),

      setShowExtendedDatablocks: (enabled) =>
        set((state) => ({
          settings: {
            ...state.settings,
            map: { ...state.settings.map, showExtendedDatablocks: enabled },
            updatedAt: Date.now(),
          },
        })),

      setShowNexrad: (enabled) =>
        set((state) => ({
          settings: {
            ...state.settings,
            map: { ...state.settings.map, showNexrad: enabled },
            updatedAt: Date.now(),
          },
        })),

      setShowOnlyUnread: (enabled) =>
        set((state) => ({
          settings: {
            ...state.settings,
            map: { ...state.settings.map, showOnlyUnread: enabled },
            updatedAt: Date.now(),
          },
        })),

      setShowRangeRings: (enabled) =>
        set((state) => ({
          settings: {
            ...state.settings,
            map: { ...state.settings.map, showRangeRings: enabled },
            updatedAt: Date.now(),
          },
        })),

      // Advanced actions
      setLogLevel: (level) =>
        set((state) => ({
          settings: {
            ...state.settings,
            advanced: { ...state.settings.advanced, logLevel: level },
            updatedAt: Date.now(),
          },
        })),

      setPersistLogs: (enabled) =>
        set((state) => ({
          settings: {
            ...state.settings,
            advanced: { ...state.settings.advanced, persistLogs: enabled },
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

      updateMapSettings: (updates) =>
        set((state) => ({
          settings: {
            ...state.settings,
            map: { ...state.settings.map, ...updates },
            updatedAt: Date.now(),
          },
        })),

      updateAdvancedSettings: (updates) =>
        set((state) => ({
          settings: {
            ...state.settings,
            advanced: { ...state.settings.advanced, ...updates },
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
            !imported.data ||
            !imported.map
          ) {
            console.error("Invalid settings format");
            return false;
          }

          // Update settings with imported values
          set({
            settings: {
              ...imported,
              updatedAt: Date.now(),
              version: 2, // Current version
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
      version: 2,
      // Migrate old settings if needed
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as SettingsState;

        // Version 0 -> 2: Reset to defaults
        if (version === 0) {
          return { settings: getDefaultSettings() };
        }

        // Version 1 -> 2: Add map settings and advanced settings
        if (version === 1) {
          const defaults = getDefaultSettings();
          return {
            ...state,
            settings: {
              ...state.settings,
              map: defaults.map,
              advanced: defaults.advanced,
              version: 2,
            },
          };
        }

        return persistedState as SettingsState;
      },
    },
  ),
);

// Subscribe to settings changes to sync logger
useSettingsStore.subscribe((state) => {
  syncLoggerWithSettings(
    state.settings.advanced.logLevel,
    state.settings.advanced.persistLogs,
  );
});

// Initialize logger with current settings
const initialSettings = useSettingsStore.getState().settings;
syncLoggerWithSettings(
  initialSettings.advanced.logLevel,
  initialSettings.advanced.persistLogs,
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
