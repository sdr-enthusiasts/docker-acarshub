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

import { io, type Socket } from "socket.io-client";
import type {
  AcarshubVersion,
  AcarsMsg,
  Adsb,
  AdsbStatus,
  AlertTerm,
  DatabaseSize,
  Decoders,
  Labels,
  SearchHtmlMsg,
  Signal,
  SignalCountData,
  SignalFreqData,
  SystemStatus,
  Terms,
} from "../types";

/**
 * Socket.IO Event Definitions
 * Defines all events that can be received from or emitted to the backend
 */

// Events received from backend
export interface ServerToClientEvents {
  // Core message events
  acars_msg: (data: AcarsMsg) => void;

  // Configuration and metadata
  labels: (data: { labels: Labels }) => void;
  terms: (data: Terms) => void;
  features_enabled: (data: Decoders) => void;

  // Search and database
  database_search_results: (data: SearchHtmlMsg) => void;
  database: (data: DatabaseSize) => void;

  // System status and monitoring
  system_status: (data: SystemStatus) => void;
  version: (data: AcarshubVersion) => void;

  // Signal information
  signal: (data: { levels: Signal }) => void;
  signal_freqs: (data: SignalFreqData) => void;
  signal_count: (data: SignalCountData) => void;

  // ADS-B data
  adsb: (data: Adsb) => void;
  adsb_status: (data: AdsbStatus) => void;

  // Alert data
  alert_terms: (data: { data: AlertTerm }) => void;

  // Connection events
  connect: () => void;
  disconnect: () => void;
  reconnect: (attemptNumber: number) => void;
  error: (error: Error) => void;
}

// Events emitted to backend
export interface ClientToServerEvents {
  // Search queries
  query_search: (query: Record<string, string>) => void;

  // Alert management
  update_alerts: (data: { terms: string[]; ignore: string[] }) => void;

  // Signal queries
  signal_freqs: (data: { freqs: boolean }) => void;
  signal_count: (data: { count: boolean }) => void;

  // Page change notification
  page_change: (data: { page: string }) => void;
}

/**
 * Typed Socket.IO client instance
 */
export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Socket.IO Service
 * Manages WebSocket connection to ACARS Hub backend
 */
class SocketService {
  private socket: TypedSocket | null = null;
  private maxReconnectAttempts = 10;
  private isInitializing = false;

  /**
   * Initialize Socket.IO connection
   * Should be called once when the application starts
   * Handles React StrictMode double-invocation gracefully
   */
  connect(): TypedSocket {
    // Return existing socket if already connected or initializing
    if (this.socket?.connected || this.isInitializing) {
      if (!this.socket) {
        throw new Error("Socket is initializing but instance is null");
      }
      return this.socket;
    }

    // Prevent multiple simultaneous initializations (StrictMode double-invocation)
    this.isInitializing = true;

    // Initialize socket connection
    // The path will be proxied by nginx to the backend
    // Backend uses /main namespace
    this.socket = io("/main", {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
      // Suppress console warnings in development
      autoConnect: true,
    });

    this.setupConnectionHandlers();

    // Reset initialization flag after connection attempt
    this.socket.on("connect", () => {
      this.isInitializing = false;
    });

    this.socket.on("connect_error", () => {
      this.isInitializing = false;
    });

    return this.socket;
  }

  /**
   * Set up connection event handlers
   * Logs connection state changes for debugging (only in development)
   */
  private setupConnectionHandlers(): void {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      if (import.meta.env.DEV) {
        console.log("[Socket.IO] Connected to ACARS Hub backend");
      }
    });

    this.socket.on("disconnect", (reason) => {
      if (import.meta.env.DEV) {
        console.warn("[Socket.IO] Disconnected:", reason);
      }
    });

    this.socket.on("reconnect", (attemptNumber) => {
      if (import.meta.env.DEV) {
        console.log(`[Socket.IO] Reconnected after ${attemptNumber} attempts`);
      }
    });

    this.socket.on("error", (error) => {
      if (import.meta.env.DEV) {
        console.error("[Socket.IO] Connection error:", error);
      }
    });
  }

  /**
   * Get the current socket instance
   * Throws error if socket is not initialized
   */
  getSocket(): TypedSocket {
    if (!this.socket) {
      throw new Error("Socket not initialized. Call connect() first.");
    }
    return this.socket;
  }

  /**
   * Check if socket is currently connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Manually disconnect the socket
   * Should be called when the application unmounts
   * Note: In StrictMode, this may be called during development cleanup
   */
  disconnect(): void {
    if (this.socket) {
      if (import.meta.env.DEV) {
        console.log("[Socket.IO] Disconnecting socket");
      }
      this.socket.disconnect();
      this.socket = null;
      this.isInitializing = false;
    }
  }

  /**
   * Emit a database search query
   */
  searchDatabase(query: Record<string, string>): void {
    this.socket?.emit("query_search", query);
  }

  /**
   * Update alert terms and ignore list
   */
  updateAlerts(terms: string[], ignore: string[]): void {
    this.socket?.emit("update_alerts", { terms, ignore });
  }

  /**
   * Request signal frequency data from backend
   * Backend doesn't care about the message content, it returns all frequencies
   */
  requestSignalFreqs(): void {
    // Legacy style: pass namespace as third argument
    // @ts-expect-error - Legacy Socket.IO syntax requires namespace as third arg
    this.socket?.emit("signal_freqs", { freqs: true }, "/main");
  }

  /**
   * Request signal count data from backend
   */
  requestSignalCount(): void {
    // Legacy style: pass namespace as third argument
    // @ts-expect-error - Legacy Socket.IO syntax requires namespace as third arg
    this.socket?.emit("signal_count", { count: true }, "/main");
  }

  /**
   * Notify backend of page change
   * Used for analytics and connection management
   */
  notifyPageChange(page: string): void {
    this.socket?.emit("page_change", { page });
  }
}

// Export singleton instance
export const socketService = new SocketService();
