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
// GOD-07: extracted from store/useAppStore.ts. Connection/backend-identity
// state: Socket.IO connection flag, DB-migration-in-progress flag, decoder
// configuration, system status, and version info — everything the app
// learns about the backend it's talking to.
// ----------------------------------------------------------------------------

import type { StateCreator } from "zustand";
import type { AcarshubVersion, Decoders, SystemStatus } from "../../types";
import { storeLogger } from "../../utils/logger";

export interface ConnectionSlice {
  // Connection state
  isConnected: boolean;
  setConnected: (connected: boolean) => void;

  // Migration state — true while the backend is running DB migrations on startup.
  // Set to false when migration_status { running: false } is received OR when
  // features_enabled arrives (handles reconnect after a ping-timeout during migration).
  migrationInProgress: boolean;
  setMigrationInProgress: (inProgress: boolean) => void;

  // Decoder configuration
  decoders: Decoders | null;
  setDecoders: (decoders: Decoders) => void;

  // System status
  systemStatus: SystemStatus | null;
  setSystemStatus: (status: SystemStatus) => void;

  // Version info
  version: AcarshubVersion | null;
  setVersion: (version: AcarshubVersion) => void;
}

export const createConnectionSlice: StateCreator<
  ConnectionSlice,
  [],
  [],
  ConnectionSlice
> = (set) => ({
  // Connection state
  isConnected: false,
  setConnected: (connected) => set({ isConnected: connected }),

  // Migration state
  migrationInProgress: false,
  setMigrationInProgress: (inProgress) =>
    set({ migrationInProgress: inProgress }),

  // Decoder configuration
  decoders: null,
  setDecoders: (decoders) => {
    storeLogger.info("Decoder configuration updated", {
      acars: decoders.acars,
      vdlm: decoders.vdlm,
      hfdl: decoders.hfdl,
      imsl: decoders.imsl,
      irdm: decoders.irdm,
      adsbEnabled: decoders.adsb?.enabled,
    });
    set({ decoders });
  },

  // System status
  systemStatus: null,
  setSystemStatus: (status) => {
    storeLogger.trace("System status updated", {
      hasErrors: status.status?.error_state,
    });
    set({ systemStatus: status });
  },

  // Version info
  version: null,
  setVersion: (version) => {
    storeLogger.info("Version information set", { version });
    set({ version });
  },
});
