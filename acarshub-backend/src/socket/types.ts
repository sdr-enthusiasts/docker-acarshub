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

import type { SocketEmitEvents, SocketEvents } from "@acarshub/types";
import type { Socket, Server as SocketIOServer } from "socket.io";

/**
 * Socket.IO Server with typed events
 *
 * Matches Flask-SocketIO namespace: /main
 * All event handlers mirror Python implementation in acarshub.py
 */
export type TypedSocketServer = SocketIOServer<
  SocketEmitEvents,
  SocketEvents,
  Record<string, never>,
  Record<string, never>
>;

/**
 * Socket instance with typed events
 */
export type TypedSocket = Socket<
  SocketEmitEvents,
  SocketEvents,
  Record<string, never>,
  Record<string, never>
>;
