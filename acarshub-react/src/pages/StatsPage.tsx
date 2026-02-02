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
import type { SignalData } from "../types";

/**
 * Main stats section types
 */
type StatsSection =
  | "reception"
  | "signal"
  | "alerts"
  | "frequency"
  | "messages";

/**
 * StatsPage Component
 * Displays statistics and graphs for ACARS message reception
 *
 * Redesigned to show one graph section at a time to avoid scroll issues
 * and provide better focus on each visualization.
 *
 * Features:
 * - Top-level section navigation (5 main sections)
 * - Sub-navigation within sections (time periods, decoders)
 * - No scrolling - single focused view
 * - Catppuccin theming throughout
 * - Mobile-first responsive design
 */
export const StatsPage = () => {
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const decoders = useAppStore((state) => state.decoders);
  const signalLevels = useAppStore((state) => state.signalLevels);
  const alertTermData = useAppStore((state) => state.alertTermData);
  const signalFreqData = useAppStore((state) => state.signalFreqData);
  const signalCountData = useAppStore((state) => state.signalCountData);

  // Main section selection
  const [activeSection, setActiveSection] = useState<StatsSection>("reception");

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
  } = useRRDTimeSeriesData(selectedTimePeriod, activeSection !== "reception");

  // Request frequency and count data when decoders are available
  useEffect(() => {
    setCurrentPage("Statistics");
    socketService.notifyPageChange("Statistics");

    // Request initial frequency and count data
    const requestData = () => {
      if (decoders) {
        socketService.requestSignalGraphs(); // Requests signal levels and alert terms
        socketService.requestSignalFreqs();
        socketService.requestSignalCount();
      }
    };

    // Request data immediately
    requestData();

    // Set up periodic refresh (every 30 seconds)
    const refreshInterval = setInterval(() => {
      requestData();
    }, 30000);

    return () => {
      clearInterval(refreshInterval);
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

  // Build main section tabs
  const sectionTabs = [
    { id: "reception", label: "Reception Over Time" },
    { id: "signal", label: "Signal Levels" },
    { id: "alerts", label: "Alert Terms" },
    { id: "frequency", label: "Frequency Distribution" },
    { id: "messages", label: "Message Statistics" },
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
        <h1 className="page__title">Statistics</h1>
        <p className="page__description">
          View reception statistics, signal levels, and frequency distribution
          charts
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
