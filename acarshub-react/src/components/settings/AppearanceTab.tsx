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
// GOD-05: extracted from components/SettingsModal.tsx. Self-contained — reads
// and writes its own settings slice directly via useSettingsStore, so the
// parent SettingsModal doesn't need to prop-drill any appearance state.
// ----------------------------------------------------------------------------

import { useSettingsStore } from "../../store/useSettingsStore";
import type { Theme } from "../../types";
import { Card } from "../Card";
import { RadioGroup } from "../RadioGroup";
import { Toggle } from "../Toggle";

export function AppearanceTab() {
  const settings = useSettingsStore((state) => state.settings);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setAnimations = useSettingsStore((state) => state.setAnimations);
  const setShowConnectionStatus = useSettingsStore(
    (state) => state.setShowConnectionStatus,
  );

  return (
    <div
      id="appearance-panel"
      role="tabpanel"
      aria-labelledby="appearance-tab"
      className="settings-panel"
    >
      <Card
        title="Theme"
        subtitle="Choose your preferred color scheme"
        variant="success"
      >
        <RadioGroup
          name="theme"
          label="Theme"
          value={settings.appearance.theme}
          options={[
            {
              value: "mocha",
              label: "Catppuccin Mocha (Dark)",
              description: "Dark theme with warm colors",
            },
            {
              value: "latte",
              label: "Catppuccin Latte (Light)",
              description: "Light theme with soft colors",
            },
          ]}
          onChange={(value) => setTheme(value as Theme)}
          helpText="Choose your preferred color scheme"
        />
      </Card>

      <Card
        title="Miscellaneous"
        subtitle="Additional appearance options"
        variant="info"
      >
        <Toggle
          id="animations"
          label="Enable Animations"
          checked={settings.appearance.animations}
          onChange={setAnimations}
          helpText="Show smooth transitions and effects throughout the UI"
        />

        <Toggle
          id="connection-status"
          label="Show Connection Status"
          checked={settings.appearance.showConnectionStatus}
          onChange={setShowConnectionStatus}
          helpText="Display connection indicator in the navigation bar"
        />
      </Card>
    </div>
  );
}
