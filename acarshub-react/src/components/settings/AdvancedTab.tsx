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

// ----------------------------------------------------------------------------
// GOD-05: extracted from components/SettingsModal.tsx. Self-contained via
// useSettingsStore — no props needed from the parent.
// ----------------------------------------------------------------------------

import { useSettingsStore } from "../../store/useSettingsStore";
import type { LogLevel } from "../../types";
import { getVersionInfo } from "../../utils/version";
import { Card } from "../Card";
import { LogsViewer } from "../LogsViewer";
import { Select } from "../Select";
import { Toggle } from "../Toggle";

export function AdvancedTab() {
  const settings = useSettingsStore((state) => state.settings);
  const setLogLevel = useSettingsStore((state) => state.setLogLevel);
  const setPersistLogs = useSettingsStore((state) => state.setPersistLogs);

  return (
    <div
      id="advanced-panel"
      role="tabpanel"
      aria-labelledby="advanced-tab"
      className="settings-panel"
    >
      <Card
        title="Version Information"
        variant="default"
        className="settings-card"
      >
        <div className="settings-card__content">
          <p className="settings-help-text">
            <strong>ACARS Hub Version:</strong> {getVersionInfo().fullVersion}
          </p>
          <p className="settings-help-text">
            <strong>Container:</strong> {getVersionInfo().containerVersion}
          </p>
          <p className="settings-help-text">
            <strong>Frontend:</strong> {getVersionInfo().frontendVersion}
          </p>
          <p className="settings-help-text">
            <strong>Backend:</strong> {getVersionInfo().backendVersion}
          </p>
          {getVersionInfo().isDockerBuild ? (
            <p className="settings-help-text">
              <strong>Build:</strong> Docker Build{" "}
              {getVersionInfo().buildNumber}
            </p>
          ) : (
            <p className="settings-help-text">
              <strong>Environment:</strong> Development
            </p>
          )}
        </div>
      </Card>

      <Card
        title="Logging & Debugging"
        subtitle="Configure application logging and view system logs"
        variant="info"
      >
        <Select
          id="log-level"
          label="Log Level"
          value={settings.advanced.logLevel}
          options={[
            {
              value: "silent",
              label: "Silent - No logging",
            },
            {
              value: "error",
              label: "Error - Critical issues only",
            },
            {
              value: "warn",
              label: "Warning - Errors and warnings",
            },
            {
              value: "info",
              label: "Info - General information (default)",
            },
            {
              value: "debug",
              label: "Debug - Detailed debugging info",
            },
            {
              value: "trace",
              label: "Trace - Very verbose (performance impact)",
            },
          ]}
          onChange={(value) => setLogLevel(value as LogLevel)}
          helpText="Control how much information is logged to the console and buffer"
          fullWidth
        />

        <Toggle
          id="persist-logs"
          label="Persist Logs Across Page Refreshes"
          checked={settings.advanced.persistLogs}
          onChange={setPersistLogs}
          helpText="Save logs to localStorage so they survive page reloads (uses browser storage)"
        />

        <div className="settings-divider" />

        <h3 className="settings-subsection-title">Application Logs</h3>
        <p className="settings-help-text">
          View recent application logs. Use the controls to filter, search, and
          export logs for troubleshooting.
        </p>

        <LogsViewer maxHeight={400} showStats={true} />
      </Card>
    </div>
  );
}
