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

import { useEffect, useMemo, useState } from "react";
import { Card } from "../components/Card";
import {
  AlertTermsChart,
  FrequencyChart,
  MessageCountChart,
  SignalLevelChart,
  TimeSeriesChart,
} from "../components/charts";
import type { DecoderType } from "../components/charts/TimeSeriesChart";
import { TabSwitcher } from "../components/TabSwitcher";
import {
  type TimePeriod,
  useRRDTimeSeriesData,
} from "../hooks/useRRDTimeSeriesData";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";
import { useSettingsStore } from "../store/useSettingsStore";
import type { SignalData } from "../types";
import { formatTimestamp } from "../utils/dateUtils";

/**
 * Main stats section types
 */
type StatsSection =
  | "reception"
  | "signal"
  | "alerts"
  | "frequency"
  | "messages"
  | "status";

/**
 * StatsPage Component
 * Displays statistics, graphs, and system status for ACARS Hub
 *
 * Redesigned to show one section at a time to avoid scroll issues
 * and provide better focus on each visualization.
 *
 * Features:
 * - Top-level section navigation (6 main sections including System Status)
 * - Sub-navigation within sections (time periods, decoders)
 * - No scrolling - single focused view
 * - Catppuccin theming throughout
 * - Mobile-first responsive design
 */
export const StatsPage = () => {
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const decoders = useAppStore((state) => state.decoders);
  const systemStatus = useAppStore((state) => state.systemStatus);
  const signalLevels = useAppStore((state) => state.signalLevels);
  const alertTermData = useAppStore((state) => state.alertTermData);
  const signalFreqData = useAppStore((state) => state.signalFreqData);
  const signalCountData = useAppStore((state) => state.signalCountData);

  // Get user's locale preferences from settings
  const timeFormat = useSettingsStore(
    (state) => state.settings.regional.timeFormat,
  );
  const dateFormat = useSettingsStore(
    (state) => state.settings.regional.dateFormat,
  );
  const timezone = useSettingsStore(
    (state) => state.settings.regional.timezone,
  );

  // Main section selection
  const [activeSection, setActiveSection] = useState<StatsSection>("reception");

  // Last update timestamp for system status
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Sub-navigation state for Reception Over Time
  const [selectedTimePeriod, setSelectedTimePeriod] =
    useState<TimePeriod>("24hr");
  const [selectedDecoder, setSelectedDecoder] =
    useState<DecoderType>("combined");

  // Sub-navigation state for Frequency Distribution
  const [selectedFreqDecoder, setSelectedFreqDecoder] = useState<
    "acars" | "vdlm" | "hfdl" | "imsl" | "irdm"
  >("acars");

  // Fetch RRD time-series data for Reception Over Time
  const {
    data: rrdData,
    loading: rrdLoading,
    error: rrdError,
    timeRange: rrdTimeRange,
  } = useRRDTimeSeriesData(selectedTimePeriod, activeSection !== "reception");

  // Request frequency and count data when decoders are available
  useEffect(() => {
    setCurrentPage("Status");
    socketService.notifyPageChange("Status");

    // Request initial frequency and count data
    const requestData = () => {
      if (decoders) {
        socketService.requestSignalGraphs(); // Requests signal levels and alert terms
        socketService.requestSignalFreqs();
        socketService.requestSignalCount();
      }
    };

    // Request initial system status
    socketService.requestStatus();

    // Request data immediately
    requestData();

    // Set up periodic refresh (every 30 seconds for stats, 10 seconds for status)
    const statsRefreshInterval = setInterval(() => {
      requestData();
    }, 30000);

    const statusRefreshInterval = setInterval(() => {
      socketService.requestStatus();
      setLastUpdate(new Date());
    }, 10000);

    return () => {
      clearInterval(statsRefreshInterval);
      clearInterval(statusRefreshInterval);
    };
  }, [setCurrentPage, decoders]);

  // Process frequency data by decoder type
  const frequencyDataByDecoder = useMemo(() => {
    if (!signalFreqData || !signalFreqData.freqs) {
      return {
        acars: [],
        vdlm: [],
        hfdl: [],
        imsl: [],
        irdm: [],
      };
    }

    const grouped: Record<string, SignalData[]> = {
      acars: [],
      vdlm: [],
      hfdl: [],
      imsl: [],
      irdm: [],
    };

    // Map backend freq_type values to our keys
    const typeMap: Record<string, string> = {
      ACARS: "acars",
      "VDL-M2": "vdlm",
      HFDL: "hfdl",
      "IMS-L": "imsl",
      IRDM: "irdm",
    };

    // Group frequencies by decoder type
    for (const freq of signalFreqData.freqs) {
      const mappedType = typeMap[freq.freq_type];
      if (mappedType && grouped[mappedType]) {
        grouped[mappedType].push(freq);
      }
    }

    return grouped;
  }, [signalFreqData]);

  // Check which decoders are enabled
  const enabledDecoders = useMemo(() => {
    if (!decoders) {
      return {
        acars: false,
        vdlm: false,
        hfdl: false,
        imsl: false,
        irdm: false,
      };
    }

    return {
      acars: decoders.acars,
      vdlm: decoders.vdlm,
      hfdl: decoders.hfdl,
      imsl: decoders.imsl ?? false,
      irdm: decoders.irdm ?? false,
    };
  }, [decoders]);

  // Helper function to get status badge variant
  const getStatusVariant = (
    status: string,
  ): "success" | "warning" | "error" | "default" => {
    if (status === "Ok") return "success";
    if (status === "Disconnected" || status === "Waiting for first message")
      return "warning";
    if (status === "Dead" || status === "Bad") return "error";
    return "default";
  };

  // Helper function to render status badge
  const renderStatusBadge = (status: string) => {
    const variant = getStatusVariant(status);
    const className = `status-badge status-badge--${variant}`;
    return <span className={className}>{status}</span>;
  };

  // Build main section tabs
  const sectionTabs = [
    { id: "reception", label: "Reception Over Time" },
    { id: "signal", label: "Signal Levels" },
    { id: "alerts", label: "Alert Terms" },
    { id: "frequency", label: "Frequency Distribution" },
    { id: "messages", label: "Message Statistics" },
    { id: "status", label: "System Status" },
  ];

  // Build tabs for time periods (Reception Over Time)
  const timePeriodTabs = [
    { id: "1hr", label: "1 Hour" },
    { id: "6hr", label: "6 Hours" },
    { id: "12hr", label: "12 Hours" },
    { id: "24hr", label: "24 Hours" },
    { id: "1wk", label: "1 Week" },
    { id: "30day", label: "30 Days" },
    { id: "6mon", label: "6 Months" },
    { id: "1yr", label: "1 Year" },
  ];

  // Build tabs for decoders (Reception Over Time)
  const decoderTabs = useMemo(() => {
    const tabs = [{ id: "combined", label: "Combined" }];

    if (enabledDecoders.acars) {
      tabs.push({ id: "acars", label: "ACARS" });
    }
    if (enabledDecoders.vdlm) {
      tabs.push({ id: "vdlm", label: "VDLM" });
    }
    if (enabledDecoders.hfdl) {
      tabs.push({ id: "hfdl", label: "HFDL" });
    }
    if (enabledDecoders.imsl) {
      tabs.push({ id: "imsl", label: "IMSL" });
    }
    if (enabledDecoders.irdm) {
      tabs.push({ id: "irdm", label: "IRDM" });
    }

    // Always show error tab
    tabs.push({ id: "error", label: "Errors" });

    return tabs;
  }, [enabledDecoders]);

  // Build tabs for frequency distribution decoder selection
  const frequencyDecoderTabs = useMemo(() => {
    const tabs = [];

    if (enabledDecoders.acars) {
      tabs.push({ id: "acars", label: "ACARS" });
    }
    if (enabledDecoders.vdlm) {
      tabs.push({ id: "vdlm", label: "VDLM" });
    }
    if (enabledDecoders.hfdl) {
      tabs.push({ id: "hfdl", label: "HFDL" });
    }
    if (enabledDecoders.imsl) {
      tabs.push({ id: "imsl", label: "IMSL" });
    }
    if (enabledDecoders.irdm) {
      tabs.push({ id: "irdm", label: "IRDM" });
    }

    return tabs;
  }, [enabledDecoders]);

  // Ensure selected frequency decoder is valid when decoders change
  useEffect(() => {
    if (frequencyDecoderTabs.length > 0) {
      const selectedExists = frequencyDecoderTabs.some(
        (tab) => tab.id === selectedFreqDecoder,
      );
      if (!selectedExists) {
        setSelectedFreqDecoder(
          frequencyDecoderTabs[0].id as
            | "acars"
            | "vdlm"
            | "hfdl"
            | "imsl"
            | "irdm",
        );
      }
    }
  }, [frequencyDecoderTabs, selectedFreqDecoder]);

  // Render content based on active section
  const renderSectionContent = () => {
    switch (activeSection) {
      case "status": {
        if (!systemStatus) {
          return (
            <Card>
              <p>Loading system status...</p>
            </Card>
          );
        }

        const { status } = systemStatus;
        const hasError = status.error_state;

        return (
          <>
            {/* Status Overview Header */}
            <Card variant={hasError ? "error" : "success"}>
              <div className="status-overview">
                <div className="status-overview__main">
                  <h2 className="status-overview__title">
                    {hasError
                      ? "System Error Detected"
                      : "All Systems Operational"}
                  </h2>
                </div>
                <p className="status-overview__subtitle">
                  Last updated:{" "}
                  {formatTimestamp(
                    lastUpdate.getTime(),
                    timeFormat,
                    dateFormat,
                    timezone,
                  )}
                </p>
              </div>
            </Card>

            {/* Decoder Status */}
            <Card>
              <h2 className="card__title">Decoder Status</h2>
              <div className="status-grid">
                {status.decoders &&
                  Object.entries(status.decoders).map(([name, decoder]) => (
                    <div key={name} className="status-item">
                      <div className="status-item__header">
                        <span className="status-item__name">{name}</span>
                        {renderStatusBadge(decoder.Status)}
                      </div>
                      <div className="status-item__details">
                        <div className="status-detail">
                          <span className="status-detail__label">
                            Connected:
                          </span>
                          <span
                            className={`status-detail__value ${
                              decoder.Connected ? "text-success" : "text-error"
                            }`}
                          >
                            {decoder.Connected ? "Yes" : "No"}
                          </span>
                        </div>
                        <div className="status-detail">
                          <span className="status-detail__label">Thread:</span>
                          <span
                            className={`status-detail__value ${
                              decoder.Alive ? "text-success" : "text-error"
                            }`}
                          >
                            {decoder.Alive ? "Running" : "Stopped"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
              {(!status.decoders ||
                Object.keys(status.decoders).length === 0) && (
                <p className="text-muted">No decoders configured</p>
              )}
            </Card>

            {/* Message Statistics */}
            {/* Global Status */}
            <Card>
              <h2 className="card__title">Global Message Statistics</h2>
              <div className="status-grid">
                {status.global &&
                  Object.entries(status.global).map(([name, stats]) => (
                    <div key={name} className="status-item">
                      <div className="status-item__header">
                        <span className="status-item__name">
                          {name} Messages
                        </span>
                        {renderStatusBadge(stats.Status)}
                      </div>
                      <div className="status-item__details">
                        <div className="status-detail">
                          <span className="status-detail__label">Total:</span>
                          <span className="status-detail__value">
                            {stats.Count?.toLocaleString() ?? 0}
                          </span>
                        </div>
                        <div className="status-detail">
                          <span className="status-detail__label">
                            Last Minute:
                          </span>
                          <span className="status-detail__value">
                            {stats.LastMinute}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
              {(!status.global || Object.keys(status.global).length === 0) && (
                <p className="text-muted">No message statistics available</p>
              )}
            </Card>

            {/* Server Status */}
            <Card>
              <h2 className="card__title">Server Status</h2>
              <div className="status-grid">
                {status.servers &&
                  Object.entries(status.servers).map(([name, server]) => (
                    <div key={name} className="status-item">
                      <div className="status-item__header">
                        <span className="status-item__name">{name}</span>
                        {renderStatusBadge(server.Status)}
                      </div>
                      <div className="status-item__details">
                        <div className="status-detail">
                          <span className="status-detail__label">
                            Messages:
                          </span>
                          <span className="status-detail__value">
                            {server.Messages?.toLocaleString() ?? 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
              {(!status.servers ||
                Object.keys(status.servers).length === 0) && (
                <p className="text-muted">No servers configured</p>
              )}
            </Card>

            {/* System Threads */}
            {status.threads && (
              <Card>
                <h2 className="card__title">System Threads</h2>
                <div className="status-grid">
                  <div className="status-item">
                    <div className="status-item__header">
                      <span className="status-item__name">Database Thread</span>
                      {renderStatusBadge(
                        status.threads.database ? "Ok" : "Dead",
                      )}
                    </div>
                  </div>
                  <div className="status-item">
                    <div className="status-item__header">
                      <span className="status-item__name">
                        Scheduler Thread
                      </span>
                      {renderStatusBadge(
                        status.threads.scheduler ? "Ok" : "Dead",
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Decoding Errors */}
            {status.errors && (
              <Card variant={status.errors.Total > 0 ? "warning" : "default"}>
                <h2 className="card__title">Decoding Errors</h2>
                <p className="text-muted" style={{ marginBottom: "1rem" }}>
                  Signal quality errors from radio decoders (bit errors, CRC
                  failures, RF interference)
                </p>
                <div className="status-grid">
                  <div className="status-item">
                    <div className="status-item__header">
                      <span className="status-item__name">
                        Signal Decoding Errors
                      </span>
                    </div>
                    <div className="status-item__details">
                      <div className="status-detail">
                        <span className="status-detail__label">
                          Total Errors:
                        </span>
                        <span className="status-detail__value">
                          {status.errors.Total?.toLocaleString() ?? 0}
                        </span>
                      </div>
                      <div className="status-detail">
                        <span className="status-detail__label">
                          Last Minute:
                        </span>
                        <span className="status-detail__value">
                          {status.errors.LastMinute}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Configuration Summary */}
            {decoders && (
              <Card>
                <h2 className="card__title">Configuration</h2>
                <div className="config-grid">
                  <div className="config-item">
                    <span className="config-item__label">ACARS Enabled:</span>
                    <span className="config-item__value">
                      {decoders.acars ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="config-item">
                    <span className="config-item__label">VDLM Enabled:</span>
                    <span className="config-item__value">
                      {decoders.vdlm ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="config-item">
                    <span className="config-item__label">HFDL Enabled:</span>
                    <span className="config-item__value">
                      {decoders.hfdl ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="config-item">
                    <span className="config-item__label">IMSL Enabled:</span>
                    <span className="config-item__value">
                      {decoders.imsl ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="config-item">
                    <span className="config-item__label">IRDM Enabled:</span>
                    <span className="config-item__value">
                      {decoders.irdm ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="config-item">
                    <span className="config-item__label">ADS-B Enabled:</span>
                    <span className="config-item__value">
                      {decoders.adsb.enabled ? "Yes" : "No"}
                    </span>
                  </div>
                </div>
              </Card>
            )}
          </>
        );
      }

      case "reception":
        return (
          <Card>
            <div className="chart-section__header">
              <h2 className="chart-section__title">
                Message Reception Over Time
              </h2>
              <p className="chart-section__description">
                Historical message counts from RRD database
              </p>
            </div>

            {/* Time Period Selector */}
            <TabSwitcher
              tabs={timePeriodTabs}
              activeTab={selectedTimePeriod}
              onTabChange={(tabId) =>
                setSelectedTimePeriod(tabId as TimePeriod)
              }
              ariaLabel="Select time period"
            />

            {/* Decoder Type Selector */}
            <TabSwitcher
              tabs={decoderTabs}
              activeTab={selectedDecoder}
              onTabChange={(tabId) => setSelectedDecoder(tabId as DecoderType)}
              ariaLabel="Select decoder type"
              className="tab-switcher--pills"
            />

            {/* Time-Series Chart */}
            <div className="chart-wrapper">
              <TimeSeriesChart
                data={rrdData}
                timePeriod={selectedTimePeriod}
                decoderType={selectedDecoder}
                loading={rrdLoading}
                error={rrdError}
                timeRange={rrdTimeRange}
              />
            </div>
          </Card>
        );

      case "signal":
        return (
          <Card>
            <div className="chart-section__header">
              <h2 className="chart-section__title">Signal Levels</h2>
              <p className="chart-section__description">
                Distribution of received signal strengths
              </p>
            </div>
            <div className="chart-wrapper">
              <SignalLevelChart signalData={signalLevels} />
            </div>
          </Card>
        );

      case "alerts":
        return (
          <Card>
            <div className="chart-section__header">
              <h2 className="chart-section__title">Alert Terms</h2>
              <p className="chart-section__description">
                Frequency of matched alert terms
              </p>
            </div>
            <div className="chart-wrapper">
              <AlertTermsChart alertTermData={alertTermData} />
            </div>
          </Card>
        );

      case "frequency":
        if (frequencyDecoderTabs.length === 0) {
          return (
            <Card>
              <div className="chart-section__header">
                <h2 className="chart-section__title">Frequency Distribution</h2>
                <p className="chart-section__description">
                  No decoders enabled
                </p>
              </div>
              <div className="chart-wrapper">
                <div className="chart-no-data">
                  <p className="chart-no-data__message">
                    No frequency data available
                  </p>
                  <p className="chart-no-data__hint">
                    Enable decoders to see frequency distribution
                  </p>
                </div>
              </div>
            </Card>
          );
        }

        return (
          <Card>
            <div className="chart-section__header">
              <h2 className="chart-section__title">Frequency Distribution</h2>
              <p className="chart-section__description">
                Message distribution across frequencies
              </p>
            </div>

            {/* Decoder Selector */}
            <TabSwitcher
              tabs={frequencyDecoderTabs}
              activeTab={selectedFreqDecoder}
              onTabChange={(tabId) =>
                setSelectedFreqDecoder(
                  tabId as "acars" | "vdlm" | "hfdl" | "imsl" | "irdm",
                )
              }
              ariaLabel="Select decoder for frequency distribution"
              className="tab-switcher--pills"
            />

            <div className="chart-wrapper">
              <FrequencyChart
                frequencyData={frequencyDataByDecoder[selectedFreqDecoder]}
                decoderType={selectedFreqDecoder.toUpperCase()}
              />
            </div>
          </Card>
        );

      case "messages":
        return (
          <Card>
            <div className="chart-section__header">
              <h2 className="chart-section__title">Message Statistics</h2>
              <p className="chart-section__description">
                Breakdown of received messages (good vs errors)
              </p>
            </div>

            <div className="chart-wrapper">
              <div className="chart-grid chart-grid--two-col">
                {/* Data Messages Chart */}
                <MessageCountChart
                  countData={signalCountData}
                  showEmptyMessages={false}
                />

                {/* Empty Messages Chart */}
                <MessageCountChart
                  countData={signalCountData}
                  showEmptyMessages={true}
                />
              </div>
            </div>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div className="page stats-page">
      <div className="page__header">
        <h1 className="page__title">System Status & Statistics</h1>
        <p className="page__description">
          Monitor system health and view reception statistics
        </p>
      </div>

      <div className="page__content">
        {/* Main Section Navigation */}
        <div className="stats-page__section-nav">
          <TabSwitcher
            tabs={sectionTabs}
            activeTab={activeSection}
            onTabChange={(tabId) => setActiveSection(tabId as StatsSection)}
            ariaLabel="Select statistics section"
            className="tab-switcher--primary"
          />
        </div>

        {/* Section Content */}
        <div className="stats-page__section-content">
          {renderSectionContent()}
        </div>
      </div>
    </div>
  );
};
