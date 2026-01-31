// Copyright (C) 2022-2024 Frederick Clausen II
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

/**
 * Custom hook to integrate Socket.IO with Zustand store
 * Manages connection lifecycle and event handlers
 *
 * This hook should be called once at the application root level
 * It connects to the backend and wires up all event handlers to update the store
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

  useEffect(() => {
    // Connect to Socket.IO backend
    const socket = socketService.connect();

    // Connection event handlers
    socket.on("connect", () => {
      setConnected(true);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("reconnect", () => {
      setConnected(true);
    });

    // Core message event - most frequent event
    socket.on("acars_msg", (message) => {
      addMessage(message);
    });

    // Configuration and metadata events
    socket.on("labels", (labels) => {
      setLabels(labels);
    });

    socket.on("terms", (terms) => {
      setAlertTerms(terms);
    });

    socket.on("decoders", (decoders) => {
      setDecoders(decoders);
    });

    // System status and monitoring
    socket.on("system_status", (status) => {
      setSystemStatus(status);
    });

    socket.on("version", (version) => {
      setVersion(version);
    });

    socket.on("database_size", (size) => {
      setDatabaseSize(size);
    });

    // ADS-B events
    socket.on("adsb_status", (status) => {
      setAdsbStatus(status);
    });

    // Signal information
    socket.on("signal", (signal) => {
      setSignalLevels(signal);
    });

    // Alert terms update
    socket.on("alert_terms", (alertTerms) => {
      // Calculate total alert count from alert_terms data
      let count = 0;
      for (const key in alertTerms.data) {
        count += alertTerms.data[key].count;
      }
      setAlertCount(count);
    });

    // Cleanup on unmount
    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("reconnect");
      socket.off("acars_msg");
      socket.off("labels");
      socket.off("terms");
      socket.off("decoders");
      socket.off("system_status");
      socket.off("version");
      socket.off("database_size");
      socket.off("adsb_status");
      socket.off("signal");
      socket.off("alert_terms");

      // Disconnect socket when app unmounts
      socketService.disconnect();
    };
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
  ]);

  return {
    isConnected: useAppStore((state) => state.isConnected),
    socket: socketService.getSocket(),
  };
};
