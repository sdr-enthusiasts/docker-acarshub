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
import type { AltitudeUnit, DateFormat, TimeFormat } from "../../types";
import { Card } from "../Card";
import { RadioGroup } from "../RadioGroup";
import { Select } from "../Select";

export function RegionalTab() {
  const settings = useSettingsStore((state) => state.settings);
  const setTimeFormat = useSettingsStore((state) => state.setTimeFormat);
  const setDateFormat = useSettingsStore((state) => state.setDateFormat);
  const setTimezone = useSettingsStore((state) => state.setTimezone);
  const setAltitudeUnit = useSettingsStore((state) => state.setAltitudeUnit);

  return (
    <div
      id="regional-panel"
      role="tabpanel"
      aria-labelledby="regional-tab"
      className="settings-panel"
    >
      <Card
        title="Regional & Time"
        subtitle="Configure time, date, and regional preferences"
        variant="info"
      >
        <Select
          id="time-format"
          label="Time Format"
          value={settings.regional.timeFormat}
          options={[
            {
              value: "auto",
              label: "Auto-detect from locale",
            },
            {
              value: "12h",
              label: "12-hour (3:45 PM)",
            },
            {
              value: "24h",
              label: "24-hour (15:45)",
            },
          ]}
          onChange={(value) => setTimeFormat(value as TimeFormat)}
          helpText="Choose how times are displayed throughout the application"
          fullWidth
        />

        <Select
          id="date-format"
          label="Date Format"
          value={settings.regional.dateFormat}
          options={[
            {
              value: "auto",
              label: "Auto-detect from locale",
            },
            {
              value: "mdy",
              label: "MM/DD/YYYY (US)",
            },
            {
              value: "dmy",
              label: "DD/MM/YYYY (Europe)",
            },
            {
              value: "ymd",
              label: "YYYY-MM-DD (ISO)",
            },
            {
              value: "long",
              label: "Long format (January 1, 2024)",
            },
            {
              value: "short",
              label: "Short format (Jan 1, 2024)",
            },
          ]}
          onChange={(value) => setDateFormat(value as DateFormat)}
          helpText="Choose how dates are displayed throughout the application"
          fullWidth
        />

        <RadioGroup
          name="timezone"
          label="Timezone Display"
          value={settings.regional.timezone}
          options={[
            {
              value: "local",
              label: "Local Time",
              description: "Display times in your local timezone",
            },
            {
              value: "utc",
              label: "UTC",
              description: "Display times in UTC (Coordinated Universal Time)",
            },
          ]}
          onChange={(value) => setTimezone(value as "local" | "utc")}
          helpText="Choose which timezone to use for displaying message timestamps"
        />

        <RadioGroup
          name="altitude-unit"
          label="Altitude Units"
          value={settings.regional.altitudeUnit}
          options={[
            {
              value: "feet",
              label: "Feet",
              description: "Imperial units (ft) - default",
            },
            {
              value: "meters",
              label: "Metres",
              description: "Metric units (m)",
            },
          ]}
          onChange={(value) => setAltitudeUnit(value as AltitudeUnit)}
          helpText="Choose units for displaying aircraft altitude (most of the world uses feet)"
        />
      </Card>
    </div>
  );
}
