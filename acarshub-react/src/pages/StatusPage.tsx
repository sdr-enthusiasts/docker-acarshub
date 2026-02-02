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

import { useEffect, useState } from "react";
import { Card } from "../components/Card";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";

/**
 * StatusPage Component
 * Displays real-time system status, decoder health, and message statistics
 */
export const StatusPage = () => {
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const systemStatus = useAppStore((state) => state.systemStatus);
  const decoders = useAppStore((state) => state.decoders);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    setCurrentPage("Status");
    socketService.notifyPageChange("Status");

    // Request initial status
    socketService.requestStatus();

    // Request status every 10 seconds for real-time updates
    const interval = setInterval(() => {
      socketService.requestStatus();
      setLastUpdate(new Date());
    }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, [setCurrentPage]);

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

  if (!systemStatus) {
    return (
      <div className="page status-page">
        <div className="page__header">
          <h1 className="page__title">System Status</h1>
        </div>

        <div className="page__content">
          <Card>
            <p>Loading system status...</p>
          </Card>
        </div>
      </div>
    );
  }

  const { status } = systemStatus;
  const hasError = status.error_state;

  return (
    <div className="page status-page">
      <div className="page__header">
        <h1 className="page__title">System Status</h1>
        <div className="page__header-meta">
          <span className="status-overall">
            {hasError ? (
              <span className="status-badge status-badge--error">
                System Error
              </span>
            ) : (
              <span className="status-badge status-badge--success">
                All Systems Operational
              </span>
            )}
          </span>
          <span className="status-last-update">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </span>
        </div>
      </div>

      <div className="page__content">
        {/* Decoder Status */}
        <Card>
          <h2 className="card__title">Decoder Status</h2>
          <div className="status-grid">
            {Object.entries(status.decoders).map(([name, decoder]) => (
              <div key={name} className="status-item">
                <div className="status-item__header">
                  <span className="status-item__name">{name}</span>
                  {renderStatusBadge(decoder.Status)}
                </div>
                <div className="status-item__details">
                  <div className="status-detail">
                    <span className="status-detail__label">Connected:</span>
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
          {Object.keys(status.decoders).length === 0 && (
            <p className="text-muted">No decoders configured</p>
          )}
        </Card>

        {/* Message Statistics */}
        <Card>
          <h2 className="card__title">Message Statistics</h2>
          <div className="status-grid">
            {Object.entries(status.global).map(([name, stats]) => (
              <div key={name} className="status-item">
                <div className="status-item__header">
                  <span className="status-item__name">{name} Messages</span>
                  {renderStatusBadge(stats.Status)}
                </div>
                <div className="status-item__details">
                  <div className="status-detail">
                    <span className="status-detail__label">Total:</span>
                    <span className="status-detail__value">
                      {stats.Count.toLocaleString()}
                    </span>
                  </div>
                  <div className="status-detail">
                    <span className="status-detail__label">Last Minute:</span>
                    <span className="status-detail__value">
                      {stats.LastMinute}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {Object.keys(status.global).length === 0 && (
            <p className="text-muted">No message statistics available</p>
          )}
        </Card>

        {/* Server Status */}
        <Card>
          <h2 className="card__title">Server Status</h2>
          <div className="status-grid">
            {Object.entries(status.servers).map(([name, server]) => (
              <div key={name} className="status-item">
                <div className="status-item__header">
                  <span className="status-item__name">{name}</span>
                  {renderStatusBadge(server.Status)}
                </div>
                <div className="status-item__details">
                  <div className="status-detail">
                    <span className="status-detail__label">Messages:</span>
                    <span className="status-detail__value">
                      {server.Messages.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {Object.keys(status.servers).length === 0 && (
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
                  {renderStatusBadge(status.threads.database ? "Ok" : "Dead")}
                </div>
              </div>
              <div className="status-item">
                <div className="status-item__header">
                  <span className="status-item__name">Scheduler Thread</span>
                  {renderStatusBadge(status.threads.scheduler ? "Ok" : "Dead")}
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
                    <span className="status-detail__label">All Time:</span>
                    <span className="status-detail__value">
                      {status.errors.Total.toLocaleString()}
                    </span>
                  </div>
                  <div className="status-detail">
                    <span className="status-detail__label">Last Minute:</span>
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
      </div>
    </div>
  );
};
