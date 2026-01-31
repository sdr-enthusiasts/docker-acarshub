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
} from "../components/charts";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";
import { useSettingsStore } from "../store/useSettingsStore";
import type { SignalData } from "../types";

/**
 * StatsPage Component
 * Displays statistics and graphs for ACARS message reception
 *
 * Features:
 * - Static image graphs (1hr, 6hr, 12hr, 24hr, 1wk, 30day, 6mon, 1yr)
 * - Signal level distribution chart
 * - Alert terms frequency chart
 * - Frequency distribution charts per decoder
 * - Message count statistics (data and empty messages)
 * - Automatic chart updates via Socket.IO
 * - Theme-aware image loading (dark/light variants)
 * - Mobile-first responsive design
 */
export const StatsPage = () => {
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const decoders = useAppStore((state) => state.decoders);
  const signalLevels = useAppStore((state) => state.signalLevels);
  const alertTermData = useAppStore((state) => state.alertTermData);
  const signalFreqData = useAppStore((state) => state.signalFreqData);
  const signalCountData = useAppStore((state) => state.signalCountData);

  // Get theme setting for image variants
  const theme = useSettingsStore((state) => state.settings.appearance.theme);

  // Track image refresh timestamps to force reload
  const [imageTimestamp, setImageTimestamp] = useState(Date.now());

  // Determine image suffix based on theme
  const imageSuffix = theme === "latte" ? "" : "-dark";

  // Request frequency data when decoders are available
  useEffect(() => {
    setCurrentPage("Statistics");
    socketService.notifyPageChange("Statistics");

    // Request initial frequency and count data
    const requestData = () => {
      if (decoders) {
        // Request frequency and count data (backend returns all decoders)
        socketService.requestSignalFreqs();
        socketService.requestSignalCount();
      }
    };

    // Request data immediately
    requestData();

    // Set up periodic refresh (every 30 seconds)
    const refreshInterval = setInterval(() => {
      requestData();
      setImageTimestamp(Date.now()); // Force image reload
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

    // Group frequencies by decoder type
    for (const freq of signalFreqData.freqs) {
      const type = freq.freq_type.toLowerCase();
      if (grouped[type]) {
        grouped[type].push(freq);
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
        {/* Static Graph Images Section */}
        <div className="chart-section">
          <div className="chart-section__header">
            <h2 className="chart-section__title">
              Message Reception Over Time
            </h2>
            <p className="chart-section__description">
              Historical message counts across different time periods
            </p>
          </div>

          <div className="chart-grid chart-grid--two-col">
            {/* 1 Hour Graph */}
            <Card padded={false}>
              <img
                src={`/1hour${imageSuffix}.png?t=${imageTimestamp}`}
                alt="1 Hour Message Graph"
                className="stats-image"
              />
            </Card>

            {/* 6 Hour Graph */}
            <Card padded={false}>
              <img
                src={`/6hour${imageSuffix}.png?t=${imageTimestamp}`}
                alt="6 Hour Message Graph"
                className="stats-image"
              />
            </Card>

            {/* 12 Hour Graph */}
            <Card padded={false}>
              <img
                src={`/12hour${imageSuffix}.png?t=${imageTimestamp}`}
                alt="12 Hour Message Graph"
                className="stats-image"
              />
            </Card>

            {/* 24 Hour Graph */}
            <Card padded={false}>
              <img
                src={`/24hours${imageSuffix}.png?t=${imageTimestamp}`}
                alt="24 Hour Message Graph"
                className="stats-image"
              />
            </Card>

            {/* 1 Week Graph */}
            <Card padded={false}>
              <img
                src={`/1week${imageSuffix}.png?t=${imageTimestamp}`}
                alt="1 Week Message Graph"
                className="stats-image"
              />
            </Card>

            {/* 30 Day Graph */}
            <Card padded={false}>
              <img
                src={`/30days${imageSuffix}.png?t=${imageTimestamp}`}
                alt="30 Day Message Graph"
                className="stats-image"
              />
            </Card>

            {/* 6 Month Graph */}
            <Card padded={false}>
              <img
                src={`/6months${imageSuffix}.png?t=${imageTimestamp}`}
                alt="6 Month Message Graph"
                className="stats-image"
              />
            </Card>

            {/* 1 Year Graph */}
            <Card padded={false}>
              <img
                src={`/1year${imageSuffix}.png?t=${imageTimestamp}`}
                alt="1 Year Message Graph"
                className="stats-image"
              />
            </Card>
          </div>
        </div>

        {/* Real-time Charts Section */}
        <div className="chart-section">
          <div className="chart-section__header">
            <h2 className="chart-section__title">Real-time Statistics</h2>
            <p className="chart-section__description">
              Live signal levels and alert term frequency
            </p>
          </div>

          {/* Signal Levels Chart */}
          <SignalLevelChart signalData={signalLevels} />

          {/* Alert Terms Chart */}
          <AlertTermsChart alertTermData={alertTermData} />
        </div>

        {/* Frequency Distribution Section */}
        {(enabledDecoders.acars ||
          enabledDecoders.vdlm ||
          enabledDecoders.hfdl ||
          enabledDecoders.imsl ||
          enabledDecoders.irdm) && (
          <div className="chart-section">
            <div className="chart-section__header">
              <h2 className="chart-section__title">Frequency Distribution</h2>
              <p className="chart-section__description">
                Message distribution across monitored frequencies by decoder
                type
              </p>
            </div>

            {/* ACARS Frequency Chart */}
            {enabledDecoders.acars &&
              frequencyDataByDecoder.acars.length > 0 && (
                <FrequencyChart
                  frequencyData={frequencyDataByDecoder.acars}
                  decoderType="ACARS"
                />
              )}

            {/* VDLM Frequency Chart */}
            {enabledDecoders.vdlm && frequencyDataByDecoder.vdlm.length > 0 && (
              <FrequencyChart
                frequencyData={frequencyDataByDecoder.vdlm}
                decoderType="VDLM"
              />
            )}

            {/* HFDL Frequency Chart */}
            {enabledDecoders.hfdl && frequencyDataByDecoder.hfdl.length > 0 && (
              <FrequencyChart
                frequencyData={frequencyDataByDecoder.hfdl}
                decoderType="HFDL"
              />
            )}

            {/* IMSL Frequency Chart */}
            {enabledDecoders.imsl && frequencyDataByDecoder.imsl.length > 0 && (
              <FrequencyChart
                frequencyData={frequencyDataByDecoder.imsl}
                decoderType="IMSL"
              />
            )}

            {/* IRDM Frequency Chart */}
            {enabledDecoders.irdm && frequencyDataByDecoder.irdm.length > 0 && (
              <FrequencyChart
                frequencyData={frequencyDataByDecoder.irdm}
                decoderType="IRDM"
              />
            )}
          </div>
        )}

        {/* Message Count Statistics Section */}
        <div className="chart-section">
          <div className="chart-section__header">
            <h2 className="chart-section__title">Message Statistics</h2>
            <p className="chart-section__description">
              Breakdown of received messages (good vs errors)
            </p>
          </div>

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
      </div>
    </div>
  );
};
