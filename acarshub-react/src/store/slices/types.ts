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
// GOD-07: the combined AppState type, assembled purely for
// store/useAppStore.ts's `create<AppState>()(...)` composition root. This is
// the ONLY file that imports every slice's interface, and useAppStore.ts is
// the ONLY consumer of this file — no slice module imports AppState (or
// anything) from here.
//
// This is deliberate: an earlier version of this refactor had every slice
// import AppState from a shared hub (this file), which created a type-only
// import cycle between this file and every slice (`import type` is erased
// at build time so TypeScript itself resolves it fine, but `just madge`'s
// cycle detector treats `import type` the same as a value import and does
// not tolerate it). Slices that need to read cross-slice fields (messages
// reading connection/adsb/readState fields, readState reading messages
// fields) instead declare a small local "Dependencies" interface with the
// literal field types they need (see each file's own header comment) —
// zero slice-to-slice imports, zero cycles, same type safety.
// ----------------------------------------------------------------------------

import type { AdsbSlice } from "./adsbSlice";
import type { AlertsSlice } from "./alertsSlice";
import type { ConnectionSlice } from "./connectionSlice";
import type { MessagesSlice } from "./messagesSlice";
import type { ReadStateSlice } from "./readStateSlice";
import type { StatsSlice } from "./statsSlice";
import type { UiSlice } from "./uiSlice";

/**
 * Application State Interface
 * Defines the complete state tree for ACARS Hub, assembled from per-domain
 * slices (see store/slices/*.ts). The public shape is identical to the
 * pre-GOD-07 monolithic AppState — this is purely an internal
 * file-organisation refactor; every existing `useAppStore((state) =>
 * state.X)` consumer is unaffected.
 */
export type AppState = ConnectionSlice &
  MessagesSlice &
  AlertsSlice &
  ReadStateSlice &
  StatsSlice &
  AdsbSlice &
  UiSlice;
