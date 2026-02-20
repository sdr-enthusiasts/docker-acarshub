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

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { type LogEntry, type LogLevel, logBuffer } from "../utils/logger";
import { Button } from "./Button";

type LogLevelFilter = LogLevel | "all";

interface LogsViewerProps {
  /** Maximum height of the log viewer in pixels */
  maxHeight?: number;
  /** Show statistics bar */
  showStats?: boolean;
}

/**
 * LogsViewer Component
 * Displays application logs with filtering, search, and export capabilities
 */
export const LogsViewer: React.FC<LogsViewerProps> = ({
  maxHeight = 400,
  showStats = true,
}) => {
  const [logs, setLogs] = useState<LogEntry[]>(logBuffer.getLogs());
  const [filter, setFilter] = useState<LogLevelFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  // Subscribe to log updates
  useEffect(() => {
    const unsubscribe = logBuffer.subscribe(setLogs);
    return unsubscribe;
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [autoScroll]);

  // Filter logs by level and search term
  const filteredLogs = logs.filter((log) => {
    const matchesLevel = filter === "all" || log.level === filter;
    const matchesSearch =
      searchTerm === "" ||
      log.message.join(" ").toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.module?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const handleExportText = () => {
    const content = logBuffer.exportLogs();
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `acarshub-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const content = logBuffer.exportLogsJSON();
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `acarshub-logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (
      window.confirm(
        "Clear all logs? This cannot be undone (unless persistence is enabled).",
      )
    ) {
      logBuffer.clear();
    }
  };

  const handleCopyAll = async () => {
    const content = logBuffer.exportLogs();
    try {
      await navigator.clipboard.writeText(content);
      // Could add a toast notification here
      alert("Logs copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy logs:", err);
      alert("Failed to copy logs to clipboard");
    }
  };

  const stats = logBuffer.getStats();

  return (
    <div className="logs-viewer-container">
      {/* Controls */}
      <div className="logs-viewer-controls">
        <div className="logs-viewer-filters">
          <label>
            <span className="logs-viewer-label">Level:</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as LogLevelFilter)}
              className="logs-viewer-select"
            >
              <option value="all">All Levels</option>
              <option value="error">Errors</option>
              <option value="warn">Warnings</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
              <option value="trace">Trace</option>
            </select>
          </label>

          <label>
            <span className="logs-viewer-label">Search:</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter logs..."
              className="logs-viewer-input"
            />
          </label>

          <label className="logs-viewer-checkbox">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            <span>Auto-scroll</span>
          </label>
        </div>

        <div className="logs-viewer-actions">
          <Button onClick={handleCopyAll} variant="secondary" size="sm">
            Copy
          </Button>
          <Button onClick={handleExportText} variant="secondary" size="sm">
            Export TXT
          </Button>
          <Button onClick={handleExportJSON} variant="secondary" size="sm">
            Export JSON
          </Button>
          <Button onClick={handleClear} variant="danger" size="sm">
            Clear
          </Button>
        </div>
      </div>

      {/* Statistics */}
      {showStats && (
        <div className="logs-viewer-stats">
          <span>
            <strong>Total:</strong> {stats.total}
          </span>
          <span>
            <strong>Filtered:</strong> {filteredLogs.length}
          </span>
          <span className="logs-viewer-stat--error">
            <strong>Errors:</strong> {stats.error}
          </span>
          <span className="logs-viewer-stat--warn">
            <strong>Warnings:</strong> {stats.warn}
          </span>
          <span className="logs-viewer-stat--info">
            <strong>Info:</strong> {stats.info}
          </span>
          <span className="logs-viewer-stat--debug">
            <strong>Debug:</strong> {stats.debug}
          </span>
        </div>
      )}

      {/* Log Display
          tabIndex={0} satisfies WCAG 2.1 SC 2.1.1 / axe scrollable-region-focusable:
          the display area can overflow and must be reachable via keyboard so users
          can scroll through log entries without a pointer device.
          role="log" + aria-live="polite" lets screen readers announce new entries. */}
      <div
        ref={viewerRef}
        className="logs-viewer-display"
        style={{ maxHeight: `${maxHeight}px` }}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable log region requires tabIndex for WCAG 2.1 SC 2.1.1 — keyboard users must be able to scroll without a pointer device
        tabIndex={0}
        role="log"
        aria-label="Application log output"
        aria-live="polite"
      >
        {filteredLogs.length === 0 ? (
          <div className="logs-viewer-empty">
            {logs.length === 0
              ? "No logs yet"
              : "No logs match current filters"}
          </div>
        ) : (
          filteredLogs.map((log, index) => (
            <div
              key={`${log.timestamp}-${index}`}
              className={`log-entry log-entry--${log.level}`}
            >
              <span className="log-entry__timestamp">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className="log-entry__level">
                {log.level.toUpperCase()}
              </span>
              {log.module && (
                <span className="log-entry__module">[{log.module}]</span>
              )}
              <span className="log-entry__message">
                {log.message.join(" ")}
              </span>
              {log.stack && <pre className="log-entry__stack">{log.stack}</pre>}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
};
