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

import { useEffect, useRef, useMemo } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AlertSoundManager } from "./components/AlertSoundManager.tsx";
import { ConnectionStatus } from "./components/ConnectionStatus.tsx";
import { Navigation } from "./components/Navigation.tsx";
import { SettingsModal } from "./components/SettingsModal.tsx";
import { useSocketIO } from "./hooks/useSocketIO.ts";
import { useThemeAwareMapProvider } from "./hooks/useThemeAwareMapProvider.ts";
import { AboutPage } from "./pages/AboutPage.tsx";
import { AlertsPage } from "./pages/AlertsPage.tsx";
import { LiveMapPage } from "./pages/LiveMapPage.tsx";
import { LiveMessagesPage } from "./pages/LiveMessagesPage.tsx";
import { SearchPage } from "./pages/SearchPage.tsx";
import { StatsPage } from "./pages/StatsPage.tsx";
import { useAppStore } from "./store/useAppStore.ts";
import { useSettingsStore } from "./store/useSettingsStore.ts";
import { uiLogger } from "./utils/logger";

/**
 * Main Application Component
 * Manages routing, Socket.IO connection, and application layout
 * Applies user settings (animations, theme) to document root
 */
function App() {
  // Calculate base path for reverse proxy support
  // Strips React Router route names to get the base path
  const basename = useMemo(() => {
    const path = window.location.pathname.replace(
      /\/(live-messages|search|alerts|status|adsb|about)(\/.*)?$/i,
      "",
    );
    return path || "/";
  }, []);

  // Initialize Socket.IO connection and wire up event handlers
  useSocketIO();

  // Enable theme-aware map provider switching (only if user hasn't selected a provider)
  useThemeAwareMapProvider();

  // Subscribe to connection state directly (not from hook to avoid stale closures)
  const isConnected = useAppStore((state) => state.isConnected);

  // Get settings from store
  const settings = useSettingsStore((state) => state.settings);

  // Log application initialization (only once on mount)
  const hasInitialized = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally runs only once on mount
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      uiLogger.info("ACARS Hub React application initialized", {
        theme: settings.appearance.theme,
        animations: settings.appearance.animations,
      });
    }
  }, []);

  // Apply settings to document root
  useEffect(() => {
    const root = document.documentElement;

    uiLogger.debug("Applying settings to document root", {
      animations: settings.appearance.animations,
      theme: settings.appearance.theme,
    });

    // Apply animations setting
    root.setAttribute(
      "data-animations",
      settings.appearance.animations.toString(),
    );

    // Apply theme (handled by ThemeSwitcher, but we ensure consistency)
    if (settings.appearance.theme === "latte") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
  }, [settings.appearance.theme, settings.appearance.animations]);

  return (
    <BrowserRouter basename={basename}>
      <div className="app">
        {/* Navigation header */}
        <Navigation />

        {/* Connection status indicator */}
        <ConnectionStatus isConnected={isConnected} />

        {/* Settings modal */}
        <SettingsModal />

        {/* Global alert sound manager (works on all pages) */}
        <AlertSoundManager />

        {/* Main content area with routing */}
        <main className="app-content">
          <Routes>
            {/* Default route redirects to Live Messages */}
            <Route
              path="/"
              element={<Navigate to="/live-messages" replace />}
            />

            {/* Main pages */}
            <Route path="/live-messages" element={<LiveMessagesPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/status" element={<StatsPage />} />
            <Route path="/adsb" element={<LiveMapPage />} />
            <Route path="/about" element={<AboutPage />} />

            {/* Catch-all redirect to Live Messages */}
            <Route
              path="*"
              element={<Navigate to="/live-messages" replace />}
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
