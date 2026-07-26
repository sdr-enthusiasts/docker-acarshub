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
// EFFECT-02: extracted from pages/LiveMessagesPage.tsx.
//
// Every top-level page repeats the same two-line "register myself as the
// active page" effect: set the app-store's currentPage and notify the
// socket service so the backend knows what the client is looking at. This
// hook makes that a one-liner. Currently wired into LiveMessagesPage.tsx
// only — AboutPage/AlertsPage/StatsPage/StatusPage (and LiveMapPage's own
// useMapLifecycle, EFFECT-01) have the same inline pattern and are natural
// candidates to adopt this hook in a future pass, but retrofitting them is
// out of scope for the page this hook was extracted from.
// ----------------------------------------------------------------------------

import { useEffect } from "react";
import { socketService } from "../services/socket";

export function usePageRegistration(
  pageName: string,
  setCurrentPage: (page: string) => void,
): void {
  useEffect(() => {
    setCurrentPage(pageName);
    socketService.notifyPageChange(pageName);
  }, [pageName, setCurrentPage]);
}
