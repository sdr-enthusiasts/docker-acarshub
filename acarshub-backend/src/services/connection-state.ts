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

/**
 * Latest decoder connection state, published by ListenerManager.
 *
 * Socket handlers answer `request_status` from here so on-demand status
 * responses report the same real connection state as the scheduled
 * BackgroundServices broadcast, without reaching into the services graph.
 */

import type { ConnectionStatus } from "./listener-types.js";

let current: ConnectionStatus | null = null;

/**
 * Store the current connection state.  A copy is kept so later mutation of
 * the caller's object does not leak into published state.
 */
export function publishConnectionStatus(status: ConnectionStatus): void {
  current = { ...status };
}

/**
 * Latest published connection state.  Sockets can connect (e.g. during
 * migration) before any listener exists, so nothing published yet means
 * nothing is connected.
 */
export function getConnectionStatus(): ConnectionStatus {
  if (current === null) {
    return {
      ACARS: false,
      VDLM2: false,
      HFDL: false,
      IMSL: false,
      IRDM: false,
      XNG: false,
    };
  }
  return { ...current };
}

/**
 * Forget any published state.  Test-only.
 */
export function resetConnectionStatus(): void {
  current = null;
}
