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

/**
 * Socket.IO Server Initialization
 *
 * Week 2 Implementation: Socket.IO server with Fastify integration
 * Matches Flask-SocketIO namespace architecture (/main)
 */

import type { Server as HTTPServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { createLogger } from "../utils/logger.js";
import { registerHandlers } from "./handlers.js";
import type { TypedSocketServer } from "./types.js";

const logger = createLogger("socket:server");

/**
 * Socket.IO server configuration
 */
interface SocketServerConfig {
  cors?: {
    origin: string | string[];
    credentials: boolean;
  };
  pingTimeout?: number;
  pingInterval?: number;
}

/**
 * Initialize Socket.IO server
 *
 * @param httpServer - HTTP server instance from Fastify
 * @param config - Socket.IO configuration
 * @returns Typed Socket.IO server instance
 */
export function initializeSocketServer(
  httpServer: HTTPServer,
  config?: SocketServerConfig,
): TypedSocketServer {
  logger.info("Initializing Socket.IO server...");

  const io = new SocketIOServer(httpServer, {
    cors: config?.cors ?? {
      origin: "*",
      credentials: true,
    },
    pingTimeout: config?.pingTimeout ?? 60000,
    pingInterval: config?.pingInterval ?? 25000,
    // Match Python Flask-SocketIO settings
    transports: ["websocket", "polling"],
    allowEIO3: true,
  }) as TypedSocketServer;

  // Register all event handlers
  registerHandlers(io);

  logger.info("Socket.IO server initialized successfully", {
    namespace: "/main",
    transports: ["websocket", "polling"],
  });

  return io;
}

/**
 * Shutdown Socket.IO server gracefully
 *
 * @param io - Socket.IO server instance
 */
export async function shutdownSocketServer(
  io: TypedSocketServer,
): Promise<void> {
  logger.info("Shutting down Socket.IO server...");

  return new Promise((resolve) => {
    io.close(() => {
      logger.info("Socket.IO server closed");
      resolve();
    });
  });
}

// Re-export types
export type { TypedSocket, TypedSocketServer } from "./types.js";
