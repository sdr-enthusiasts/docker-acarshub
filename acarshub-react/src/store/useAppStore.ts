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
// GOD-07: this file used to contain the entire 1219-line application state
// tree (message ingestion, alert config, read tracking, connection status,
// stats, ADS-B data, and UI chrome) in a single `create<AppState>()` call.
//
// It is now the composition root for Zustand's "slices pattern"
// (https://zustand.docs.pmnd.rs/guides/slices-pattern): each domain's state
// and actions live in store/slices/*.ts, and this file combines them into
// one store. The public API is UNCHANGED — every existing
// `useAppStore((state) => state.X)` call site across the app (28
// non-test consumers) continues to work exactly as before; this is a pure
// internal file-organisation refactor, not a behavioural or API change.
//
// Slice -> domain mapping:
//   connectionSlice — Socket.IO connection flag, migration-in-progress,
//                      decoder config, system status, version info
//   messagesSlice   — message groups, alert message groups, ingestion
//   alertsSlice      — alert term configuration + aggregate alert stats
//   readStateSlice   — read/unread message-UID tracking (localStorage)
//   statsSlice       — Stats-page telemetry (db size, signal/freq/count
//                      data, station IDs, message rate, time-series cache)
//   adsbSlice        — ADS-B feed status + live aircraft data
//   uiSlice          — current page, settings-modal-open, labels metadata
//
// The curried `create<AppState>()((...a) => ({...}))` form (rather than
// `create<AppState>((set, get) => ({...}))`) is required by Zustand's own
// TypeScript guidance when combining multiple slice creators — it lets each
// slice's `set`/`get` type-check against the FULL combined AppState so
// cross-slice reads (e.g. messagesSlice reading `state.decoders` from
// connectionSlice for ADS-B-aware culling) work without an `any` escape
// hatch.
// ----------------------------------------------------------------------------

import { create } from "zustand";
import { createAdsbSlice } from "./slices/adsbSlice";
import { createAlertsSlice } from "./slices/alertsSlice";
import { createConnectionSlice } from "./slices/connectionSlice";
import { createMessagesSlice } from "./slices/messagesSlice";
import { createReadStateSlice } from "./slices/readStateSlice";
import { createStatsSlice } from "./slices/statsSlice";
import type { AppState } from "./slices/types";
import { createUiSlice } from "./slices/uiSlice";

export type { AppState } from "./slices/types";

/**
 * Main Application Store
 * Uses Zustand for reactive state management
 */
export const useAppStore = create<AppState>()((...a) => {
  const [set, get] = a;

  // Expose store to window in development for debugging
  if (import.meta.env.DEV) {
    // @ts-expect-error - Exposing store for dev debugging
    window.__ACARS_STORE__ = { getState: get, setState: set };
  }

  return {
    ...createConnectionSlice(...a),
    ...createMessagesSlice(...a),
    ...createAlertsSlice(...a),
    ...createReadStateSlice(...a),
    ...createStatsSlice(...a),
    ...createAdsbSlice(...a),
    ...createUiSlice(...a),
  };
});

/**
 * Selectors for common state queries
 * Helps prevent unnecessary re-renders by selecting only needed state
 */
export const selectIsConnected = (state: AppState) => state.isConnected;
export const selectMessageGroups = (state: AppState) => state.messageGroups;
export const selectLabels = (state: AppState) => state.labels;
export const selectSystemStatus = (state: AppState) => state.systemStatus;
export const selectAlertCount = (state: AppState) => state.alertCount;
export const selectUnreadAlertCount = (state: AppState) =>
  state.getUnreadAlertCount();
export const selectAdsbEnabled = (state: AppState) =>
  state.decoders?.adsb.enabled ?? false;

/**
 * Expose store to window in development/test mode for E2E testing, and also
 * when the build was created with VITE_E2E=true (used by `just test-e2e-docker`).
 * This allows Playwright tests to inject state (e.g., decoder configuration).
 * Production builds without VITE_E2E set will tree-shake this away.
 */
if (
  import.meta.env.MODE === "development" ||
  import.meta.env.MODE === "test" ||
  import.meta.env.VITE_E2E === "true"
) {
  // @ts-expect-error - Required for E2E testing window exposure
  window.__ACARS_STORE__ = useAppStore;
}
