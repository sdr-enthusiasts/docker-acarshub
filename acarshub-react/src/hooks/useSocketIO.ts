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

import { useEffect } from "react";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";
import type { HtmlMsg, Labels } from "../types";
import { socketLogger } from "../utils/logger";

/**
 * Custom hook to integrate Socket.IO with Zustand store
 * Manages connection lifecycle and event handlers
 *
 * This hook should be called once at the application root level
 * It connects to the backend and wires up all event handlers to update the store
 *
 * Note: Handles React StrictMode double-invocation gracefully
 */
export const useSocketIO = () => {
  const setConnected = useAppStore((state) => state.setConnected);
  const addMessage = useAppStore((state) => state.addMessage);
  const setLabels = useAppStore((state) => state.setLabels);
  const setAlertTerms = useAppStore((state) => state.setAlertTerms);
  const setDecoders = useAppStore((state) => state.setDecoders);
  const setSystemStatus = useAppStore((state) => state.setSystemStatus);
  const setDatabaseSize = useAppStore((state) => state.setDatabaseSize);
  const setVersion = useAppStore((state) => state.setVersion);
  const setAdsbStatus = useAppStore((state) => state.setAdsbStatus);
  const setSignalLevels = useAppStore((state) => state.setSignalLevels);
  const setAlertCount = useAppStore((state) => state.setAlertCount);
  const setAlertTermData = useAppStore((state) => state.setAlertTermData);
  const setSignalFreqData = useAppStore((state) => state.setSignalFreqData);
  const setSignalCountData = useAppStore((state) => state.setSignalCountData);
  const setAdsbAircraft = useAppStore((state) => state.setAdsbAircraft);

  useEffect(() => {
    socketLogger.info("Setting up Socket.IO connection");

    // Connect to Socket.IO backend
    const socket = socketService.connect();

    socketLogger.debug("Socket instance created", {
      connected: socket.connected,
      id: socket.id,
      namespace: "/main",
    });

    // Connection event handlers
    socket.on("connect", () => {
      socketLogger.info("Socket.IO connected", { socketId: socket.id });
      setConnected(true);
    });

    socket.on("disconnect", () => {
      socketLogger.warn("Socket.IO disconnected");
      setConnected(false);
    });

    socket.on("reconnect", () => {
      socketLogger.info("Socket.IO reconnected");
      setConnected(true);
    });

    // Core message event - most frequent event
    socket.on("acars_msg", (data: HtmlMsg) => {
      socketLogger.trace("Received acars_msg event", {
        uid: data.msghtml?.uid,
        station: data.msghtml?.station_id,
      });
      // Unwrap msghtml wrapper from Socket.IO message
      const message = data.msghtml;
      addMessage(message);
    });

    // Configuration and metadata events
    socket.on("labels", (data) => {
      socketLogger.debug("Received labels configuration", {
        labelCount: Object.keys(data).length,
      });
      setLabels(data as unknown as Labels);
    });

    socket.on("terms", (terms) => {
      socketLogger.debug("Received alert terms", {
        termCount: terms.terms?.length || 0,
        ignoreCount: terms.ignore?.length || 0,
      });
      setAlertTerms(terms);
    });

    socket.on("features_enabled", (decoders) => {
      socketLogger.info("Received decoder configuration", {
        acars: decoders.acars,
        vdlm: decoders.vdlm,
        hfdl: decoders.hfdl,
        imsl: decoders.imsl,
        irdm: decoders.irdm,
        adsbEnabled: decoders.adsb?.enabled,
      });
      setDecoders(decoders);
    });

    // System status and monitoring
    socket.on("system_status", (data) => {
      socketLogger.debug("Received system status update", {
        hasErrors: data.status?.error_state,
      });
      setSystemStatus(data);
    });

    socket.on("version", (version) => {
      socketLogger.info("Received version information", { version });
      setVersion(version);
    });

    socket.on("database", (data) => {
      socketLogger.debug("Received database size", {
        size: data.size,
        count: data.count,
      });
      setDatabaseSize(data);
    });

    // ADS-B events
    socket.on("adsb_status", (status) => {
      socketLogger.debug("Received ADS-B status", status);
      setAdsbStatus(status);
    });

    socket.on("adsb_aircraft", (data) => {
      socketLogger.trace("Received ADS-B aircraft data", {
        aircraftCount: data.aircraft?.length || 0,
        now: data.now,
      });
      setAdsbAircraft(data);
    });

    // Signal information
    socket.on("signal", (data) => {
      socketLogger.trace("Received signal level data", {
        levelCount: data.levels ? Object.keys(data.levels).length : 0,
      });
      setSignalLevels(data.levels);
    });

    // Alert terms update
    socket.on("alert_terms", (data) => {
      // Store the full alert term data for the Stats page
      // Backend sends { data: { 0: {term, count, id}, 1: {...}, ... } }
      setAlertTermData(data.data);

      // Calculate total alert count from alert_terms data
      let count = 0;
      if (data.data) {
        for (const key in data.data) {
          count += data.data[key].count;
        }
      }
      socketLogger.debug("Received alert terms update", {
        termCount: Object.keys(data.data || {}).length,
        totalAlerts: count,
      });
      setAlertCount(count);
    });

    // Statistics events for Stats page
    socket.on("signal_freqs", (freqData) => {
      socketLogger.trace("Received signal frequency data");
      setSignalFreqData(freqData);
    });

    socket.on("signal_count", (countData) => {
      socketLogger.trace("Received signal count data");
      setSignalCountData(countData);
    });

    // Cleanup on unmount
    return () => {
      socketLogger.debug("Cleaning up Socket.IO event listeners");

      // Remove all event listeners
      socket.off("connect");
      socket.off("disconnect");
      socket.off("reconnect");
      socket.off("acars_msg");
      socket.off("labels");
      socket.off("terms");
      socket.off("features_enabled");
      socket.off("system_status");
      socket.off("version");
      socket.off("database");
      socket.off("adsb_status");
      socket.off("adsb_aircraft");
      socket.off("signal");
      socket.off("alert_terms");
      socket.off("signal_freqs");
      socket.off("signal_count");

      // Only disconnect on actual unmount, not StrictMode cleanup
      // StrictMode will call this cleanup in dev, but we keep the socket alive
      if (!import.meta.env.DEV) {
        socketLogger.info("Disconnecting Socket.IO (production unmount)");
        socketService.disconnect();
      } else {
        socketLogger.debug(
          "Skipping disconnect in development (React StrictMode)",
        );
      }
    };
    // Empty dependency array - this effect should only run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    setConnected,
    addMessage,
    setLabels,
    setAlertTerms,
    setDecoders,
    setSystemStatus,
    setDatabaseSize,
    setVersion,
    setAdsbStatus,
    setSignalLevels,
    setAlertCount,
    setAlertTermData,
    setSignalFreqData,
    setSignalCountData,
    setAdsbAircraft,
  ]);

  return {
    isConnected: useAppStore((state) => state.isConnected),
  };
};
