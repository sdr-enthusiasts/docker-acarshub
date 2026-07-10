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
import { Card } from "../Card";

export function DataTab() {
  const settings = useSettingsStore((state) => state.settings);
  const setMaxMessagesPerAircraft = useSettingsStore(
    (state) => state.setMaxMessagesPerAircraft,
  );
  const setMaxMessageGroups = useSettingsStore(
    (state) => state.setMaxMessageGroups,
  );

  return (
    <div
      id="data-panel"
      role="tabpanel"
      aria-labelledby="data-tab"
      className="settings-panel"
    >
      <Card
        title="Data & Privacy"
        subtitle="Manage data storage and privacy preferences"
        variant="default"
      >
        <div className="settings-field-group">
          <label htmlFor="max-messages" className="settings-label">
            Max Messages per Source: {settings.data.maxMessagesPerAircraft}
          </label>
          <input
            id="max-messages"
            type="range"
            min="10"
            max="200"
            step="10"
            value={settings.data.maxMessagesPerAircraft}
            onChange={(e) => setMaxMessagesPerAircraft(Number(e.target.value))}
            className="settings-slider"
          />
          <p className="settings-help-text">
            Maximum messages to keep per source (aircraft, station, etc.)
          </p>
        </div>

        <div className="settings-field-group">
          <label htmlFor="max-groups" className="settings-label">
            Max Message Groups: {settings.data.maxMessageGroups}
          </label>
          <input
            id="max-groups"
            type="range"
            min="10"
            max="200"
            step="10"
            value={settings.data.maxMessageGroups}
            onChange={(e) => setMaxMessageGroups(Number(e.target.value))}
            className="settings-slider"
          />
          <p className="settings-help-text">
            Maximum number of message sources to track (oldest groups are
            culled)
          </p>
        </div>
      </Card>
    </div>
  );
}
