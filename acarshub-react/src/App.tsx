// Copyright (C) 2022-2024 Frederick Clausen II
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

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ConnectionStatus } from "./components/ConnectionStatus.tsx";
import { Navigation } from "./components/Navigation.tsx";
import { useSocketIO } from "./hooks/useSocketIO.ts";
import { AboutPage } from "./pages/AboutPage.tsx";
import { AlertsPage } from "./pages/AlertsPage.tsx";
import { LiveMapPage } from "./pages/LiveMapPage.tsx";
import { LiveMessagesPage } from "./pages/LiveMessagesPage.tsx";
import { SearchPage } from "./pages/SearchPage.tsx";
import { StatsPage } from "./pages/StatsPage.tsx";
import { StatusPage } from "./pages/StatusPage.tsx";

/**
 * Main Application Component
 * Manages routing, Socket.IO connection, and application layout
 */
function App() {
  // Initialize Socket.IO connection and wire up event handlers
  const { isConnected } = useSocketIO();

  return (
    <BrowserRouter>
      <div className="app">
        {/* Navigation header */}
        <Navigation />

        {/* Connection status indicator */}
        <ConnectionStatus isConnected={isConnected} />

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
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/adsb" element={<LiveMapPage />} />
            <Route path="/status" element={<StatusPage />} />
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
