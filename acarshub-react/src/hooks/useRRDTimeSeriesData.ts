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

import { useCallback, useEffect, useState } from "react";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";

/**
 * Time period options for RRD time-series data
 */
export type TimePeriod =
  | "1hr"
  | "6hr"
  | "12hr"
  | "24hr"
  | "1wk"
  | "30day"
  | "6mon"
  | "1yr";

/**
 * Single data point in the time-series
 */
export interface RRDDataPoint {
  timestamp: number; // Unix timestamp in milliseconds
  acars: number;
  vdlm: number;
  hfdl: number;
  imsl: number;
  irdm: number;
  total: number;
  error: number;
}

/**
 * Response from the backend RRD time-series Socket.IO event
 */
interface RRDTimeSeriesResponse {
  data: RRDDataPoint[];
  time_period?: string;
  resolution?: string;
  data_sources?: string[];
  error?: string;
}

/**
 * Custom hook for fetching and managing RRD time-series data
 *
 * @param timePeriod - The time period to fetch (1hr, 6hr, 12hr, 24hr, 1wk, 30day, 6mon, 1yr)
 * @param autoRefresh - Whether to automatically refresh data periodically (default: false)
 * @param refreshInterval - Refresh interval in milliseconds (default: 60000 = 1 minute)
 * @returns Object containing data, loading state, error, and refresh function
 */
export const useRRDTimeSeriesData = (
  timePeriod: TimePeriod,
  autoRefresh = false,
  refreshInterval = 60000,
) => {
  const [data, setData] = useState<RRDDataPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Get connection state from store
  const isConnected = useAppStore((state) => state.isConnected);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    // Request RRD time-series data from backend
    // Check if socket is connected, if not the error will be handled by the effect
    try {
      const socket = socketService.getSocket();
      // @ts-expect-error - Flask-SocketIO requires namespace as third argument
      socket.emit("rrd_timeseries", { time_period: timePeriod }, "/main");
    } catch (_err) {
      setError(
        "Socket not connected. Please wait for connection to establish.",
      );
      setLoading(false);
    }
  }, [timePeriod]);

  useEffect(() => {
    // Set up Socket.IO listener for RRD time-series data
    const handleRRDData = (response: RRDTimeSeriesResponse) => {
      // Only process if this response is for our requested time period
      if (response.time_period !== timePeriod) {
        return;
      }

      setLoading(false);

      if (response.error) {
        setError(response.error);
        setData([]);
      } else {
        setError(null);
        setData(response.data);
      }
    };

    // Wait for socket to be connected before setting up listeners
    if (!isConnected) {
      setError("Waiting for connection...");
      setLoading(true);
      return;
    }

    // Register listener
    try {
      const socket = socketService.getSocket();
      socket.on("rrd_timeseries_data", handleRRDData);

      // Fetch initial data
      fetchData();

      // Set up auto-refresh if enabled
      let refreshTimer: ReturnType<typeof setInterval> | null = null;
      if (autoRefresh) {
        refreshTimer = setInterval(fetchData, refreshInterval);
      }

      // Cleanup
      return () => {
        try {
          const socket = socketService.getSocket();
          socket.off("rrd_timeseries_data", handleRRDData);
        } catch {
          // Socket may have been disconnected during cleanup
        }
        if (refreshTimer) {
          clearInterval(refreshTimer);
        }
      };
    } catch (_err) {
      setError("Socket connection error. Please refresh the page.");
      setLoading(false);
    }
  }, [timePeriod, autoRefresh, refreshInterval, fetchData, isConnected]);

  return {
    data,
    loading,
    error,
    refresh: fetchData,
  };
};
