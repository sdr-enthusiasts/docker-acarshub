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
// GOD-07: extracted from store/useAppStore.ts. Miscellaneous chrome/UI
// state: which page is active, whether the Settings modal is open, and the
// label metadata table (grouped here for lack of a better home — it's a
// small, rarely-updated lookup table pushed once by the backend).
// ----------------------------------------------------------------------------

import type { StateCreator } from "zustand";
import type { Labels } from "../../types";

export interface UiSlice {
  // Labels and metadata
  labels: Labels;
  setLabels: (labels: Labels) => void;

  // UI state
  currentPage: string;
  setCurrentPage: (page: string) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

export const createUiSlice: StateCreator<UiSlice, [], [], UiSlice> = (set) => ({
  labels: { labels: {} },
  setLabels: (labels) => set({ labels }),

  currentPage: "Live Messages",
  setCurrentPage: (page) => set({ currentPage: page }),
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
});
