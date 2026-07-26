// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
//
// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

// ----------------------------------------------------------------------------
// GOD-04: this file used to be the 848-line background-services orchestrator.
// It is now a thin barrel — the implementation lives in:
//   - background-services.ts — top-level lifecycle (initialize/start/stop),
//     the message-processing pipeline, and scheduled-task wiring.
//   - listener-manager.ts    — TCP/UDP/ZMQ decoder listener fan-in wiring and
//     per-type connection-status tracking.
//   - system-status.ts       — pure SystemStatus / message-rate payload
//     builders consumed by background-services.ts.
// ----------------------------------------------------------------------------

export {
  BackgroundServices,
  createBackgroundServices,
  type ServicesConfig,
} from "./background-services.js";
export type { ConnectionStatus } from "./listener-manager.js";
