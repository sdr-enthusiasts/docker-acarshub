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

// FIXME: Maybe? https://developer.mozilla.org/en-US/docs/Web/API/EventSource can we
// use this + API end points for client requests, as opposed to websockets?

import { io, type Socket } from "socket.io-client";
import type {
  AcarshubVersion,
  AcarsMsg,
  ADSBData,
  Adsb,
  AdsbStatus,
  AlertTerm,
  DatabaseSize,
  Decoders,
  HtmlMsg,
  Labels,
  SearchHtmlMsg,
  SignalCountData,
  SignalFreqData,
  SignalLevelData,
  SystemStatus,
  Terms,
} from "../types";
import { socketLogger } from "../utils/logger";

/**
 * Socket.IO Event Definitions
 * Defines all events that can be received from or emitted to the backend
 */

// Events received from backend
export interface ServerToClientEvents {
  // Core message events
  acars_msg: (data: HtmlMsg) => void;
  acars_msg_batch: (data: {
    messages: AcarsMsg[];
    loading?: boolean;
    done_loading?: boolean;
  }) => void;

  // Configuration and metadata
  labels: (data: { labels: Labels }) => void;
  terms: (data: Terms) => void;
  features_enabled: (data: Decoders) => void;

  // Search and database
  database_search_results: (data: SearchHtmlMsg) => void;
  database: (data: DatabaseSize) => void;

  // Historical alerts by term
  alerts_by_term_results: (data: {
    total_count: number;
    messages: AcarsMsg[];
    term: string;
    page: number;
    query_time: number;
  }) => void;

  // System status and monitoring
  system_status: (data: SystemStatus) => void;
  version: (data: AcarshubVersion) => void;

  // Signal information
  signal: (data: { levels: SignalLevelData }) => void;
  signal_freqs: (data: SignalFreqData) => void;
  signal_count: (data: SignalCountData) => void;

  // RRD time-series data
  rrd_timeseries_data: (data: {
    data: Array<{
      timestamp: number;
      acars: number;
      vdlm: number;
      hfdl: number;
      imsl: number;
      irdm: number;
      total: number;
      error: number;
    }>;
    time_period?: string;
    resolution?: string;
    data_sources?: string[];
    error?: string;
  }) => void;

  // ADS-B data
  adsb: (data: Adsb) => void;
  adsb_status: (data: AdsbStatus) => void;
  adsb_aircraft: (data: ADSBData) => void;

  // Alert data
  alert_terms: (data: { data: AlertTerm }) => void;
  recent_alerts: (data: { alerts: AcarsMsg[] }) => void;
  alert_matches: (data: HtmlMsg) => void;
  alert_matches_batch: (data: {
    messages: AcarsMsg[];
    loading?: boolean;
    done_loading?: boolean;
  }) => void;

  // Alert match regeneration
  regenerate_alert_matches_started: (data: { message: string }) => void;
  regenerate_alert_matches_complete: (data: {
    success: boolean;
    stats: {
      total_messages: number;
      matched_messages: number;
      total_matches: number;
    };
  }) => void;
  regenerate_alert_matches_error: (data: { error: string }) => void;

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

  // Historical alert queries
  query_alerts_by_term: (data: { term: string; page?: number }) => void;

  // Alert management
  update_alerts: (data: { terms: string[]; ignore: string[] }) => void;
  regenerate_alert_matches: (data: Record<string, unknown>) => void;

  // Signal queries
  signal_freqs: (data: { freqs: boolean }) => void;
  signal_count: (data: { count: boolean }) => void;
  signal_graphs: (data: Record<string, unknown>) => void;

  // System status queries
  request_status: (data: Record<string, unknown>) => void;

  // RRD time-series queries
  rrd_timeseries: (data: { time_period: string }) => void;

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
    // Calculate base path from current location (strips React Router route names)
    const index_acars_path = document.location.pathname.replace(
      /\/(live-messages|search|alerts|status|adsb|about)(\/.*)?$/i,
      "",
    );

    // Ensure path ends with / for socket.io (unless it's empty root)
    const socketPath = index_acars_path
      ? `${index_acars_path}/socket.io`
      : "/socket.io";

    socketLogger.info("Initializing Socket.IO connection", {
      origin: document.location.origin,
      pathname: document.location.pathname,
      basePath: index_acars_path,
      socketPath: socketPath,
      namespace: "/main",
    });

    this.socket = io(`${document.location.origin}/main`, {
      path: socketPath,
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
      autoConnect: true,
      upgrade: true,
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
      socketLogger.info("✅ Connected to ACARS Hub backend", {
        socketId: this.socket?.id,
        transport: this.socket?.io.engine.transport.name,
        connected: this.socket?.connected,
        disconnected: this.socket?.disconnected,
        // biome-ignore lint/suspicious/noExplicitAny: Socket.IO internal property not typed
        engineUrl: (this.socket?.io as any)?.uri,
      });
    });

    this.socket.on("disconnect", (reason) => {
      socketLogger.warn("Disconnected from backend", {
        reason,
        connected: this.socket?.connected,
        disconnected: this.socket?.disconnected,
        socketId: this.socket?.id,
      });
    });

    this.socket.on("reconnect", (attemptNumber) => {
      socketLogger.info("Reconnected to backend", {
        attemptNumber,
        socketId: this.socket?.id,
        connected: this.socket?.connected,
        disconnected: this.socket?.disconnected,
      });
    });

    this.socket.on("connect_error", (error: Error) => {
      socketLogger.error("❌ Connection error", {
        message: error.message,
        stack: error.stack,
        connected: this.socket?.connected,
        disconnected: this.socket?.disconnected,
        // biome-ignore lint/suspicious/noExplicitAny: Socket.IO internal property not typed
        engineUrl: (this.socket?.io as any)?.uri,
        namespace: "/main",
      });
    });

    this.socket.on("error", (error) => {
      socketLogger.error("Socket error", error);
    });

    this.socket.io.on("reconnect_attempt", () => {
      socketLogger.debug("Attempting to reconnect to backend");
    });

    this.socket.io.on("reconnect_failed", () => {
      socketLogger.error("Reconnection failed after maximum attempts", {
        maxAttempts: this.maxReconnectAttempts,
      });
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
   * Check if socket has been initialized
   * Returns true if socket exists (even if not connected yet)
   */
  isInitialized(): boolean {
    return this.socket !== null;
  }

  /**
   * Check if socket is currently connected
   * Returns actual socket.connected state with diagnostic logging
   */
  isConnected(): boolean {
    const connected = this.socket?.connected ?? false;
    const disconnected = this.socket?.disconnected ?? true;

    // Log mismatch between connected state and expectations
    if (this.socket && !connected && !disconnected) {
      socketLogger.warn("Socket state inconsistency detected", {
        connected,
        disconnected,
        socketId: this.socket.id,
        hasSocket: !!this.socket,
      });
    }

    return connected;
  }

  /**
   * Manually disconnect the socket
   * Should be called when the application unmounts
   * Note: In StrictMode, this may be called during development cleanup
   */
  disconnect(): void {
    if (this.socket) {
      socketLogger.info("Disconnecting socket");
      this.socket.disconnect();
      this.socket = null;
      this.isInitializing = false;
    }
  }

  /**
   * Emit a database search query
   */
  searchDatabase(query: Record<string, string>): void {
    socketLogger.debug("Emitting database search query", { query });
    this.socket?.emit("query_search", query);
  }

  /**
   * Update alert terms and ignore list
   */
  updateAlerts(terms: string[], ignore: string[]): void {
    socketLogger.debug("Updating alert terms", {
      termCount: terms.length,
      ignoreCount: ignore.length,
    });
    this.socket?.emit("update_alerts", { terms, ignore });
  }

  /**
   * Query historical alerts by specific term with pagination
   */
  queryAlertsByTerm(term: string, page = 0): void {
    socketLogger.debug("Querying historical alerts by term", { term, page });
    // Legacy style: pass namespace as third argument
    // @ts-expect-error - Legacy Socket.IO syntax requires namespace as third arg
    this.socket?.emit("query_alerts_by_term", { term, page }, "/main");
  }

  /**
   * Request signal frequency data from backend
   * Backend doesn't care about the message content, it returns all frequencies
   */
  requestSignalFreqs(): void {
    socketLogger.trace("Requesting signal frequency data");
    // Legacy style: pass namespace as third argument
    // @ts-expect-error - Legacy Socket.IO syntax requires namespace as third arg
    this.socket?.emit("signal_freqs", { freqs: true }, "/main");
  }

  /**
   * Request signal count data from backend
   */
  requestSignalCount(): void {
    socketLogger.trace("Requesting signal count data");
    // Legacy style: pass namespace as third argument
    // @ts-expect-error - Legacy Socket.IO syntax requires namespace as third arg
    this.socket?.emit("signal_count", { count: true }, "/main");
  }

  /**
   * Request signal graphs data from backend
   * This triggers the backend to send signal levels, alert terms, and other graph data
   */
  requestSignalGraphs(): void {
    socketLogger.trace("Requesting signal graphs data");
    // Legacy style: pass namespace as third argument
    // @ts-expect-error - Legacy Socket.IO syntax requires namespace as third arg
    this.socket?.emit("signal_graphs", {}, "/main");
  }

  /**
   * Request real-time system status from backend
   * Returns decoder health, connection states, and message statistics
   */
  requestStatus(): void {
    socketLogger.debug("Requesting real-time system status");
    // Legacy style: pass namespace as third argument
    // @ts-expect-error - Legacy Socket.IO syntax requires namespace as third arg
    this.socket?.emit("request_status", {}, "/main");
  }

  /**
   * Request recent alert messages from backend
   * Called when React app loads to populate initial alert state
   */
  requestRecentAlerts(): void {
    if (!this.socket?.connected) {
      socketLogger.warn("Cannot request recent alerts - socket not connected");
      return;
    }

    socketLogger.debug("Requesting recent alerts from backend");
    // Legacy style: pass namespace as third argument
    // @ts-expect-error - Legacy Socket.IO syntax requires namespace as third arg
    this.socket.emit("request_recent_alerts", {}, "/main");
  }

  /**
   * Regenerate all alert matches from scratch
   * This is a destructive operation that:
   * 1. Deletes all existing alert matches
   * 2. Resets alert statistics
   * 3. Re-processes all messages against current alert terms
   *
   * Runs in a background thread on the backend to avoid blocking the gunicorn worker.
   * Caller should listen for these events:
   * - 'regenerate_alert_matches_started' - Operation has started in background
   * - 'regenerate_alert_matches_complete' - Operation completed successfully
   * - 'regenerate_alert_matches_error' - Operation failed with error
   */
  regenerateAlertMatches(): void {
    if (!this.socket?.connected) {
      socketLogger.warn(
        "Cannot regenerate alert matches - socket not connected",
      );
      return;
    }

    socketLogger.info("Requesting alert match regeneration from backend");
    // Legacy style: pass namespace as third argument
    // @ts-expect-error - Legacy Socket.IO syntax requires namespace as third arg
    this.socket.emit("regenerate_alert_matches", {}, "/main");
  }

  /**
   * Notify backend of page change
   * Used for analytics and connection management
   */
  notifyPageChange(page: string): void {
    socketLogger.debug("Notifying backend of page change", { page });
    this.socket?.emit("page_change", { page });
  }
}

// Export singleton instance
export const socketService = new SocketService();

socketLogger.info("Socket service module loaded");
