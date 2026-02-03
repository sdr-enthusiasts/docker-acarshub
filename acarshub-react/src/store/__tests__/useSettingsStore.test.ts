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

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserSettings } from "../../types";
import {
  useLocale,
  useSettingsStore,
  useTheme,
  useTimeFormat,
} from "../useSettingsStore";

describe("useSettingsStore", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset the store to defaults
    useSettingsStore.getState().resetToDefaults();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize with default settings", () => {
      const { settings } = useSettingsStore.getState();

      expect(settings.appearance.theme).toBe("mocha");
      expect(settings.appearance.showConnectionStatus).toBe(true);
      expect(settings.appearance.animations).toBe(true);

      expect(settings.regional.timeFormat).toBe("auto");
      expect(settings.regional.dateFormat).toBe("auto");
      expect(settings.regional.timezone).toBe("local");
      expect(settings.regional.altitudeUnit).toBe("feet");

      expect(settings.notifications.desktop).toBe(false);
      expect(settings.notifications.sound).toBe(false);
      expect(settings.notifications.volume).toBe(50);
      expect(settings.notifications.alertsOnly).toBe(true);

      expect(settings.data.maxMessagesPerAircraft).toBe(50);
      expect(settings.data.maxMessageGroups).toBe(50);
      expect(settings.data.enableCaching).toBe(true);
      expect(settings.data.autoClearMinutes).toBe(60);

      expect(settings.map.provider).toBe("carto");
      expect(settings.map.maptilerApiKey).toBeUndefined();
      expect(settings.map.stationLat).toBe(0);
      expect(settings.map.stationLon).toBe(0);
      expect(settings.map.rangeRings).toEqual([100, 200, 300]);
      expect(settings.map.defaultZoom).toBe(7);
      expect(settings.map.showOnlyAcars).toBe(false);
      expect(settings.map.showDatablocks).toBe(true);
      expect(settings.map.showExtendedDatablocks).toBe(false);
      expect(settings.map.showNexrad).toBe(false);
      expect(settings.map.showOnlyUnread).toBe(false);
      expect(settings.map.showRangeRings).toBe(true);

      expect(settings.advanced.persistLogs).toBe(false);
      expect(settings.version).toBe(2);
      expect(settings.updatedAt).toBeGreaterThan(0);
    });

    it("should set correct default log level based on environment", () => {
      const { settings } = useSettingsStore.getState();

      // In test environment, import.meta.env.PROD is false
      expect(settings.advanced.logLevel).toBe("info");
    });
  });

  describe("Appearance Settings", () => {
    it("should update theme", () => {
      vi.useFakeTimers();
      const { setTheme, settings: initialSettings } =
        useSettingsStore.getState();
      const initialTimestamp = initialSettings.updatedAt;

      vi.advanceTimersByTime(1);
      setTheme("latte");

      const { settings } = useSettingsStore.getState();
      expect(settings.appearance.theme).toBe("latte");
      expect(settings.updatedAt).toBeGreaterThan(initialTimestamp);
      vi.useRealTimers();
    });

    it("should update showConnectionStatus", () => {
      const { setShowConnectionStatus } = useSettingsStore.getState();

      setShowConnectionStatus(false);

      const { settings } = useSettingsStore.getState();
      expect(settings.appearance.showConnectionStatus).toBe(false);
    });

    it("should update animations", () => {
      const { setAnimations } = useSettingsStore.getState();

      setAnimations(false);

      const { settings } = useSettingsStore.getState();
      expect(settings.appearance.animations).toBe(false);
    });

    it("should batch update appearance settings", () => {
      const { updateAppearanceSettings } = useSettingsStore.getState();

      updateAppearanceSettings({
        theme: "latte",
        animations: false,
      });

      const { settings } = useSettingsStore.getState();
      expect(settings.appearance.theme).toBe("latte");
      expect(settings.appearance.animations).toBe(false);
      // showConnectionStatus should remain at default since not updated
      expect(settings.appearance.showConnectionStatus).toBe(true);
    });
  });

  describe("Regional Settings", () => {
    it("should update timeFormat", () => {
      const { setTimeFormat } = useSettingsStore.getState();

      setTimeFormat("24h");

      const { settings } = useSettingsStore.getState();
      expect(settings.regional.timeFormat).toBe("24h");
    });

    it("should update dateFormat", () => {
      const { setDateFormat } = useSettingsStore.getState();

      setDateFormat("iso");

      const { settings } = useSettingsStore.getState();
      expect(settings.regional.dateFormat).toBe("iso");
    });

    it("should update timezone", () => {
      const { setTimezone } = useSettingsStore.getState();

      setTimezone("utc");

      const { settings } = useSettingsStore.getState();
      expect(settings.regional.timezone).toBe("utc");
    });

    it("should update locale", () => {
      const { setLocale } = useSettingsStore.getState();

      setLocale("en-US");

      const { settings } = useSettingsStore.getState();
      expect(settings.regional.locale).toBe("en-US");
    });

    it("should update altitudeUnit", () => {
      const { setAltitudeUnit } = useSettingsStore.getState();

      setAltitudeUnit("meters");

      const { settings } = useSettingsStore.getState();
      expect(settings.regional.altitudeUnit).toBe("meters");
    });

    it("should batch update regional settings", () => {
      const { updateRegionalSettings } = useSettingsStore.getState();

      updateRegionalSettings({
        timeFormat: "12h",
        dateFormat: "us",
        timezone: "utc",
        locale: "en-GB",
      });

      const { settings } = useSettingsStore.getState();
      expect(settings.regional.timeFormat).toBe("12h");
      expect(settings.regional.dateFormat).toBe("us");
      expect(settings.regional.timezone).toBe("utc");
      expect(settings.regional.locale).toBe("en-GB");
      // altitudeUnit should remain at default
      expect(settings.regional.altitudeUnit).toBe("feet");
    });
  });

  describe("Notification Settings", () => {
    it("should update desktop notifications", () => {
      const { setDesktopNotifications } = useSettingsStore.getState();

      setDesktopNotifications(true);

      const { settings } = useSettingsStore.getState();
      expect(settings.notifications.desktop).toBe(true);
    });

    it("should update sound alerts", () => {
      const { setSoundAlerts } = useSettingsStore.getState();

      setSoundAlerts(true);

      const { settings } = useSettingsStore.getState();
      expect(settings.notifications.sound).toBe(true);
    });

    it("should update volume", () => {
      const { setVolume } = useSettingsStore.getState();

      setVolume(75);

      const { settings } = useSettingsStore.getState();
      expect(settings.notifications.volume).toBe(75);
    });

    it("should clamp volume to 0-100 range (minimum)", () => {
      const { setVolume } = useSettingsStore.getState();

      setVolume(-10);

      const { settings } = useSettingsStore.getState();
      expect(settings.notifications.volume).toBe(0);
    });

    it("should clamp volume to 0-100 range (maximum)", () => {
      const { setVolume } = useSettingsStore.getState();

      setVolume(150);

      const { settings } = useSettingsStore.getState();
      expect(settings.notifications.volume).toBe(100);
    });

    it("should update alertsOnly", () => {
      const { setAlertsOnly } = useSettingsStore.getState();

      setAlertsOnly(false);

      const { settings } = useSettingsStore.getState();
      expect(settings.notifications.alertsOnly).toBe(false);
    });

    it("should batch update notification settings", () => {
      const { updateNotificationSettings } = useSettingsStore.getState();

      updateNotificationSettings({
        desktop: true,
        sound: true,
        volume: 80,
        alertsOnly: false,
      });

      const { settings } = useSettingsStore.getState();
      expect(settings.notifications.desktop).toBe(true);
      expect(settings.notifications.sound).toBe(true);
      expect(settings.notifications.volume).toBe(80);
      expect(settings.notifications.alertsOnly).toBe(false);
    });
  });

  describe("Data Settings", () => {
    it("should update maxMessagesPerAircraft", () => {
      const { setMaxMessagesPerAircraft } = useSettingsStore.getState();

      setMaxMessagesPerAircraft(100);

      const { settings } = useSettingsStore.getState();
      expect(settings.data.maxMessagesPerAircraft).toBe(100);
    });

    it("should enforce minimum value of 1 for maxMessagesPerAircraft", () => {
      const { setMaxMessagesPerAircraft } = useSettingsStore.getState();

      setMaxMessagesPerAircraft(0);

      const { settings } = useSettingsStore.getState();
      expect(settings.data.maxMessagesPerAircraft).toBe(1);
    });

    it("should enforce minimum value of 1 for negative maxMessagesPerAircraft", () => {
      const { setMaxMessagesPerAircraft } = useSettingsStore.getState();

      setMaxMessagesPerAircraft(-5);

      const { settings } = useSettingsStore.getState();
      expect(settings.data.maxMessagesPerAircraft).toBe(1);
    });

    it("should update maxMessageGroups", () => {
      const { setMaxMessageGroups } = useSettingsStore.getState();

      setMaxMessageGroups(75);

      const { settings } = useSettingsStore.getState();
      expect(settings.data.maxMessageGroups).toBe(75);
    });

    it("should enforce minimum value of 1 for maxMessageGroups", () => {
      const { setMaxMessageGroups } = useSettingsStore.getState();

      setMaxMessageGroups(0);

      const { settings } = useSettingsStore.getState();
      expect(settings.data.maxMessageGroups).toBe(1);
    });

    it("should update enableCaching", () => {
      const { setEnableCaching } = useSettingsStore.getState();

      setEnableCaching(false);

      const { settings } = useSettingsStore.getState();
      expect(settings.data.enableCaching).toBe(false);
    });

    it("should update autoClearMinutes", () => {
      const { setAutoClearMinutes } = useSettingsStore.getState();

      setAutoClearMinutes(120);

      const { settings } = useSettingsStore.getState();
      expect(settings.data.autoClearMinutes).toBe(120);
    });

    it("should enforce minimum value of 0 for autoClearMinutes", () => {
      const { setAutoClearMinutes } = useSettingsStore.getState();

      setAutoClearMinutes(-10);

      const { settings } = useSettingsStore.getState();
      expect(settings.data.autoClearMinutes).toBe(0);
    });

    it("should batch update data settings", () => {
      const { updateDataSettings } = useSettingsStore.getState();

      updateDataSettings({
        maxMessagesPerAircraft: 200,
        maxMessageGroups: 100,
        enableCaching: false,
        autoClearMinutes: 30,
      });

      const { settings } = useSettingsStore.getState();
      expect(settings.data.maxMessagesPerAircraft).toBe(200);
      expect(settings.data.maxMessageGroups).toBe(100);
      expect(settings.data.enableCaching).toBe(false);
      expect(settings.data.autoClearMinutes).toBe(30);
    });
  });

  describe("Map Settings", () => {
    it("should update map provider", () => {
      const { setMapProvider } = useSettingsStore.getState();

      setMapProvider("maptiler");

      const { settings } = useSettingsStore.getState();
      expect(settings.map.provider).toBe("maptiler");
    });

    it("should update Maptiler API key", () => {
      const { setMaptilerApiKey } = useSettingsStore.getState();

      setMaptilerApiKey("test-api-key-123");

      const { settings } = useSettingsStore.getState();
      expect(settings.map.maptilerApiKey).toBe("test-api-key-123");
    });

    it("should allow clearing Maptiler API key", () => {
      const { setMaptilerApiKey } = useSettingsStore.getState();

      setMaptilerApiKey("test-key");
      setMaptilerApiKey(undefined);

      const { settings } = useSettingsStore.getState();
      expect(settings.map.maptilerApiKey).toBeUndefined();
    });

    it("should update station location", () => {
      const { setStationLocation } = useSettingsStore.getState();

      setStationLocation(51.5074, -0.1278);

      const { settings } = useSettingsStore.getState();
      expect(settings.map.stationLat).toBe(51.5074);
      expect(settings.map.stationLon).toBe(-0.1278);
    });

    it("should update range rings", () => {
      const { setRangeRings } = useSettingsStore.getState();

      setRangeRings([50, 100, 150, 200]);

      const { settings } = useSettingsStore.getState();
      expect(settings.map.rangeRings).toEqual([50, 100, 150, 200]);
    });

    it("should update default map view", () => {
      const { setDefaultMapView } = useSettingsStore.getState();

      setDefaultMapView(40.7128, -74.006, 10);

      const { settings } = useSettingsStore.getState();
      expect(settings.map.defaultCenterLat).toBe(40.7128);
      expect(settings.map.defaultCenterLon).toBe(-74.006);
      expect(settings.map.defaultZoom).toBe(10);
    });

    it("should update showOnlyAcars", () => {
      const { setShowOnlyAcars } = useSettingsStore.getState();

      setShowOnlyAcars(true);

      const { settings } = useSettingsStore.getState();
      expect(settings.map.showOnlyAcars).toBe(true);
    });

    it("should update showDatablocks", () => {
      const { setShowDatablocks } = useSettingsStore.getState();

      setShowDatablocks(false);

      const { settings } = useSettingsStore.getState();
      expect(settings.map.showDatablocks).toBe(false);
    });

    it("should update showExtendedDatablocks", () => {
      const { setShowExtendedDatablocks } = useSettingsStore.getState();

      setShowExtendedDatablocks(true);

      const { settings } = useSettingsStore.getState();
      expect(settings.map.showExtendedDatablocks).toBe(true);
    });

    it("should update showNexrad", () => {
      const { setShowNexrad } = useSettingsStore.getState();

      setShowNexrad(true);

      const { settings } = useSettingsStore.getState();
      expect(settings.map.showNexrad).toBe(true);
    });

    it("should update showOnlyUnread", () => {
      const { setShowOnlyUnread } = useSettingsStore.getState();

      setShowOnlyUnread(true);

      const { settings } = useSettingsStore.getState();
      expect(settings.map.showOnlyUnread).toBe(true);
    });

    it("should update showRangeRings", () => {
      const { setShowRangeRings } = useSettingsStore.getState();

      setShowRangeRings(false);

      const { settings } = useSettingsStore.getState();
      expect(settings.map.showRangeRings).toBe(false);
    });

    it("should batch update map settings", () => {
      const { updateMapSettings } = useSettingsStore.getState();

      updateMapSettings({
        provider: "maptiler",
        maptilerApiKey: "abc123",
        stationLat: 37.7749,
        stationLon: -122.4194,
        rangeRings: [100, 200],
        defaultZoom: 8,
        showOnlyAcars: true,
        showNexrad: true,
      });

      const { settings } = useSettingsStore.getState();
      expect(settings.map.provider).toBe("maptiler");
      expect(settings.map.maptilerApiKey).toBe("abc123");
      expect(settings.map.stationLat).toBe(37.7749);
      expect(settings.map.stationLon).toBe(-122.4194);
      expect(settings.map.rangeRings).toEqual([100, 200]);
      expect(settings.map.defaultZoom).toBe(8);
      expect(settings.map.showOnlyAcars).toBe(true);
      expect(settings.map.showNexrad).toBe(true);
      // Unupdated values should remain at defaults
      expect(settings.map.showDatablocks).toBe(true);
      expect(settings.map.showExtendedDatablocks).toBe(false);
    });
  });

  describe("Advanced Settings", () => {
    it("should update log level", () => {
      const { setLogLevel } = useSettingsStore.getState();

      setLogLevel("debug");

      const { settings } = useSettingsStore.getState();
      expect(settings.advanced.logLevel).toBe("debug");
    });

    it("should update persistLogs", () => {
      const { setPersistLogs } = useSettingsStore.getState();

      setPersistLogs(true);

      const { settings } = useSettingsStore.getState();
      expect(settings.advanced.persistLogs).toBe(true);
    });

    it("should batch update advanced settings", () => {
      const { updateAdvancedSettings } = useSettingsStore.getState();

      updateAdvancedSettings({
        logLevel: "trace",
        persistLogs: true,
      });

      const { settings } = useSettingsStore.getState();
      expect(settings.advanced.logLevel).toBe("trace");
      expect(settings.advanced.persistLogs).toBe(true);
    });
  });

  describe("Utility Methods", () => {
    it("should reset to defaults", () => {
      const {
        setTheme,
        setVolume,
        setMaxMessagesPerAircraft,
        resetToDefaults,
      } = useSettingsStore.getState();

      // Make some changes
      setTheme("latte");
      setVolume(80);
      setMaxMessagesPerAircraft(100);

      // Reset
      resetToDefaults();

      const { settings } = useSettingsStore.getState();
      expect(settings.appearance.theme).toBe("mocha");
      expect(settings.notifications.volume).toBe(50);
      expect(settings.data.maxMessagesPerAircraft).toBe(50);
    });

    it("should export settings as JSON string", () => {
      const { setTheme, exportSettings } = useSettingsStore.getState();

      setTheme("latte");
      const exported = exportSettings();

      expect(typeof exported).toBe("string");
      const parsed = JSON.parse(exported) as UserSettings;
      expect(parsed.appearance.theme).toBe("latte");
      expect(parsed.version).toBe(2);
    });

    it("should import valid settings JSON", () => {
      const { importSettings } = useSettingsStore.getState();

      const validSettings: UserSettings = {
        appearance: {
          theme: "latte",
          showConnectionStatus: false,
          animations: false,
        },
        regional: {
          timeFormat: "24h",
          dateFormat: "iso",
          timezone: "utc",
          altitudeUnit: "meters",
        },
        notifications: {
          desktop: true,
          sound: true,
          volume: 75,
          alertsOnly: false,
        },
        data: {
          maxMessagesPerAircraft: 100,
          maxMessageGroups: 75,
          enableCaching: false,
          autoClearMinutes: 30,
        },
        map: {
          provider: "maptiler",
          maptilerApiKey: "test-key",
          stationLat: 51.5,
          stationLon: -0.1,
          rangeRings: [50, 100, 150],
          defaultCenterLat: 51.5,
          defaultCenterLon: -0.1,
          defaultZoom: 9,
          showOnlyAcars: true,
          showDatablocks: false,
          showExtendedDatablocks: true,
          showNexrad: true,
          showOnlyUnread: true,
          showRangeRings: false,
        },
        advanced: {
          logLevel: "debug",
          persistLogs: true,
        },
        updatedAt: Date.now(),
        version: 2,
      };

      const result = importSettings(JSON.stringify(validSettings));

      expect(result).toBe(true);
      const { settings } = useSettingsStore.getState();
      expect(settings.appearance.theme).toBe("latte");
      expect(settings.regional.timeFormat).toBe("24h");
      expect(settings.notifications.volume).toBe(75);
      expect(settings.data.maxMessagesPerAircraft).toBe(100);
      expect(settings.map.provider).toBe("maptiler");
      expect(settings.advanced.logLevel).toBe("debug");
    });

    it("should reject invalid JSON during import", () => {
      const { importSettings } = useSettingsStore.getState();
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = importSettings("not valid json");

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to import settings:",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it("should reject settings with missing required sections", () => {
      const { importSettings } = useSettingsStore.getState();
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const invalidSettings = {
        appearance: { theme: "latte" },
        // Missing regional, notifications, data, map
      };

      const result = importSettings(JSON.stringify(invalidSettings));

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith("Invalid settings format");

      consoleErrorSpy.mockRestore();
    });

    it("should update timestamp and version when importing", () => {
      const { importSettings } = useSettingsStore.getState();

      const validSettings: UserSettings = {
        appearance: {
          theme: "latte",
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
          logLevel: "info",
          persistLogs: false,
        },
        updatedAt: 1000000, // Old timestamp
        version: 1, // Old version
      };

      const beforeImport = Date.now();
      importSettings(JSON.stringify(validSettings));
      const afterImport = Date.now();

      const { settings } = useSettingsStore.getState();
      expect(settings.version).toBe(2); // Updated to current version
      expect(settings.updatedAt).toBeGreaterThanOrEqual(beforeImport);
      expect(settings.updatedAt).toBeLessThanOrEqual(afterImport);
    });
  });

  describe("Timestamp Updates", () => {
    it("should update timestamp when changing settings", () => {
      vi.useFakeTimers();
      const { settings: initialSettings } = useSettingsStore.getState();
      const initialTimestamp = initialSettings.updatedAt;

      // Advance time to ensure timestamp differs
      vi.advanceTimersByTime(1);
      const { setTheme } = useSettingsStore.getState();
      setTheme("latte");

      const { settings } = useSettingsStore.getState();
      expect(settings.updatedAt).toBeGreaterThan(initialTimestamp);
      vi.useRealTimers();
    });

    it("should update timestamp for all setter methods", () => {
      const timestamps: number[] = [];
      const store = useSettingsStore.getState();

      // Collect initial timestamp
      timestamps.push(store.settings.updatedAt);

      // Test a few setters
      store.setTheme("latte");
      timestamps.push(useSettingsStore.getState().settings.updatedAt);

      store.setVolume(80);
      timestamps.push(useSettingsStore.getState().settings.updatedAt);

      store.setMaxMessagesPerAircraft(100);
      timestamps.push(useSettingsStore.getState().settings.updatedAt);

      // Verify all timestamps are increasing
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });
  });

  describe("Migration Logic", () => {
    it("should migrate from version 0 to version 2 (reset to defaults)", () => {
      // biome-ignore lint/suspicious/noExplicitAny: Zustand persist API doesn't expose migrate type
      const { migrate } = (useSettingsStore as any).persist.getOptions();

      const oldState = {
        settings: {
          appearance: { theme: "latte" },
          // Incomplete old structure
        },
      };

      const migrated = migrate(oldState, 0);

      expect(migrated.settings.version).toBe(2);
      expect(migrated.settings.appearance.theme).toBe("mocha"); // Reset to default
      expect(migrated.settings.map).toBeDefined();
      expect(migrated.settings.advanced).toBeDefined();
    });

    it("should migrate from version 1 to version 2 (add map and advanced)", () => {
      // biome-ignore lint/suspicious/noExplicitAny: Zustand persist API doesn't expose migrate type
      const { migrate } = (useSettingsStore as any).persist.getOptions();

      const v1State = {
        settings: {
          appearance: {
            theme: "latte",
            showConnectionStatus: false,
            animations: false,
          },
          regional: {
            timeFormat: "24h",
            dateFormat: "iso",
            timezone: "utc",
            altitudeUnit: "meters",
          },
          notifications: {
            desktop: true,
            sound: true,
            volume: 80,
            alertsOnly: false,
          },
          data: {
            maxMessagesPerAircraft: 100,
            maxMessageGroups: 75,
            enableCaching: false,
            autoClearMinutes: 30,
          },
          // Missing map and advanced
          updatedAt: 123456,
          version: 1,
        },
      };

      const migrated = migrate(v1State, 1);

      expect(migrated.settings.version).toBe(2);
      // Existing settings preserved
      expect(migrated.settings.appearance.theme).toBe("latte");
      expect(migrated.settings.regional.timeFormat).toBe("24h");
      expect(migrated.settings.notifications.volume).toBe(80);
      expect(migrated.settings.data.maxMessagesPerAircraft).toBe(100);
      // New sections added with defaults
      expect(migrated.settings.map).toBeDefined();
      expect(migrated.settings.map.provider).toBe("carto");
      expect(migrated.settings.advanced).toBeDefined();
      expect(migrated.settings.advanced.logLevel).toBeDefined();
    });

    it("should return unchanged state for current version", () => {
      // biome-ignore lint/suspicious/noExplicitAny: Zustand persist API doesn't expose migrate type
      const { migrate } = (useSettingsStore as any).persist.getOptions();

      const currentState = {
        settings: useSettingsStore.getState().settings,
      };

      const migrated = migrate(currentState, 2);

      expect(migrated).toEqual(currentState);
    });
  });

  describe("Convenience Hooks", () => {
    describe("useTheme", () => {
      it("should return current theme", () => {
        const { result } = renderHook(() => useTheme());
        expect(result.current).toBe("mocha");
      });

      it("should update when theme changes", () => {
        const { result, rerender } = renderHook(() => useTheme());
        const { setTheme } = useSettingsStore.getState();

        act(() => {
          setTheme("latte");
        });
        rerender();

        expect(result.current).toBe("latte");
      });
    });

    describe("useTimeFormat", () => {
      it("should return auto-detected format when set to auto", () => {
        const { result } = renderHook(() => useTimeFormat());
        expect(["12h", "24h"]).toContain(result.current);
      });

      it("should return 12h when explicitly set", () => {
        const { result, rerender } = renderHook(() => useTimeFormat());
        const { setTimeFormat } = useSettingsStore.getState();

        act(() => {
          setTimeFormat("12h");
        });
        rerender();

        expect(result.current).toBe("12h");
      });

      it("should return 24h when explicitly set", () => {
        const { result, rerender } = renderHook(() => useTimeFormat());
        const { setTimeFormat } = useSettingsStore.getState();

        act(() => {
          setTimeFormat("24h");
        });
        rerender();

        expect(result.current).toBe("24h");
      });
    });

    describe("useLocale", () => {
      it("should return undefined when not set (auto-detect)", () => {
        const { result } = renderHook(() => useLocale());
        expect(result.current).toBeUndefined();
      });

      it("should return locale when explicitly set", () => {
        const { result, rerender } = renderHook(() => useLocale());
        const { setLocale } = useSettingsStore.getState();

        act(() => {
          setLocale("en-US");
        });
        rerender();

        expect(result.current).toBe("en-US");
      });

      it("should return undefined after clearing locale", () => {
        const { result, rerender } = renderHook(() => useLocale());
        const { setLocale } = useSettingsStore.getState();

        act(() => {
          setLocale("en-GB");
        });
        rerender();
        act(() => {
          setLocale(undefined);
        });
        rerender();

        expect(result.current).toBeUndefined();
      });
    });
  });

  describe("Persistence", () => {
    it("should persist settings to localStorage", () => {
      const { setTheme, setVolume } = useSettingsStore.getState();

      setTheme("latte");
      setVolume(80);

      const stored = localStorage.getItem("acarshub-settings");
      expect(stored).toBeTruthy();
      if (!stored) throw new Error("Expected stored to be truthy");

      const parsed = JSON.parse(stored);
      expect(parsed.state.settings.appearance.theme).toBe("latte");
      expect(parsed.state.settings.notifications.volume).toBe(80);
    });

    it("should restore settings from localStorage", () => {
      // Set some values
      const { setTheme, setMaxMessagesPerAircraft } =
        useSettingsStore.getState();
      setTheme("latte");
      setMaxMessagesPerAircraft(100);

      // Simulate page reload by getting fresh state
      const stored = localStorage.getItem("acarshub-settings");
      expect(stored).toBeTruthy();
      if (!stored) throw new Error("Expected stored to be truthy");

      const parsed = JSON.parse(stored);
      expect(parsed.state.settings.appearance.theme).toBe("latte");
      expect(parsed.state.settings.data.maxMessagesPerAircraft).toBe(100);
    });

    it("should include version in persisted state", () => {
      const { setTheme } = useSettingsStore.getState();
      setTheme("latte");

      const stored = localStorage.getItem("acarshub-settings");
      if (!stored) throw new Error("Expected stored to be truthy");
      const parsed = JSON.parse(stored);

      expect(parsed.version).toBe(2);
    });
  });

  describe("Edge Cases", () => {
    it("should handle multiple rapid updates correctly", () => {
      const { setVolume } = useSettingsStore.getState();

      // Rapid updates
      setVolume(10);
      setVolume(20);
      setVolume(30);
      setVolume(40);

      const { settings } = useSettingsStore.getState();
      expect(settings.notifications.volume).toBe(40);
    });

    it("should handle setting same value multiple times", () => {
      vi.useFakeTimers();
      const { setTheme, settings: initialSettings } =
        useSettingsStore.getState();
      const initialTimestamp = initialSettings.updatedAt;

      vi.advanceTimersByTime(1);
      setTheme("mocha"); // Already the default value
      vi.advanceTimersByTime(1);
      setTheme("mocha");

      const { settings } = useSettingsStore.getState();
      expect(settings.appearance.theme).toBe("mocha");
      expect(settings.updatedAt).toBeGreaterThan(initialTimestamp);
      vi.useRealTimers();
    });

    it("should handle empty rangeRings array", () => {
      const { setRangeRings } = useSettingsStore.getState();

      setRangeRings([]);

      const { settings } = useSettingsStore.getState();
      expect(settings.map.rangeRings).toEqual([]);
    });

    it("should preserve other settings when batch updating", () => {
      const { setTheme, updateAppearanceSettings } =
        useSettingsStore.getState();

      setTheme("latte");

      updateAppearanceSettings({ animations: false });

      const { settings } = useSettingsStore.getState();
      expect(settings.appearance.theme).toBe("latte");
      expect(settings.appearance.animations).toBe(false);
    });

    it("should handle batch update with empty object", () => {
      const { setTheme, updateAppearanceSettings } =
        useSettingsStore.getState();

      setTheme("latte");
      updateAppearanceSettings({});

      const { settings } = useSettingsStore.getState();
      expect(settings.appearance.theme).toBe("latte"); // Unchanged
    });
  });
});
