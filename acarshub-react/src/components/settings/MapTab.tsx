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
// useSettingsStore/useTheme — no props needed from the parent.
// ----------------------------------------------------------------------------

import { ALL_PROVIDERS } from "../../config/mapProviders";
import { useSettingsStore, useTheme } from "../../store/useSettingsStore";
import type { MapProvider } from "../../types";
import { Button } from "../Button";
import { Card } from "../Card";
import { Select } from "../Select";

export function MapTab() {
  const settings = useSettingsStore((state) => state.settings);
  const theme = useTheme();
  const mapProvider = useSettingsStore((state) => state.settings.map.provider);
  const customTileUrl = useSettingsStore(
    (state) => state.settings.map.customTileUrl,
  );
  const userSelectedProvider = useSettingsStore(
    (state) => state.settings.map.userSelectedProvider,
  );
  const setMapProvider = useSettingsStore((state) => state.setMapProvider);
  const setCustomTileUrl = useSettingsStore((state) => state.setCustomTileUrl);
  const setGroundAltitudeThreshold = useSettingsStore(
    (state) => state.setGroundAltitudeThreshold,
  );

  return (
    <div
      id="map-panel"
      role="tabpanel"
      aria-labelledby="map-tab"
      className="settings-panel"
    >
      <Card title="Map Provider" variant="default" className="settings-card">
        <div className="settings-card__content">
          <p className="settings-card__help">
            Choose your preferred map tile provider. All providers are free and
            do not require API keys.
          </p>

          {!userSelectedProvider && (
            <div className="settings-card__info">
              <p>
                <strong>🎨 Theme-Aware Mode Active:</strong> Map automatically
                switches between light/dark variants when you change themes.
                Select a provider below to override.
              </p>
            </div>
          )}

          <div className="settings-form-field">
            <Select
              id="map-provider"
              label="Map Provider"
              value={!userSelectedProvider ? "" : mapProvider}
              onChange={(value) => {
                if (value === "") {
                  // Reset to theme-aware mode - trigger immediate theme switch
                  const themeProvider =
                    theme === "mocha" ? "carto_dark_all" : "carto_light_all";
                  setMapProvider(themeProvider as MapProvider, false);
                } else {
                  setMapProvider(value as MapProvider);
                }
              }}
              options={[
                { value: "", label: "Default (Theme Aware)" },
                ...ALL_PROVIDERS.map((p) => ({
                  value: p.id,
                  label: p.name,
                })),
              ]}
            />
          </div>

          <div className="settings-form-field">
            <label htmlFor="custom-tile-url">Custom Tile URL</label>
          </div>
          <div className="settings-form-field">
            <input
              id="custom-tile-url"
              type="text"
              className="settings-input settings-input--full"
              placeholder="https://example.com/{z}/{x}/{y}.png"
              value={customTileUrl || ""}
              onChange={(e) => {
                setCustomTileUrl(e.target.value || undefined);
                if (e.target.value) {
                  setMapProvider("custom");
                }
              }}
            />
            <p className="settings-card__help">
              Enter a custom tile URL template. Use {"{z}"}, {"{x}"}, and{" "}
              {"{y}"} placeholders. Selecting this will automatically set the
              provider to "Custom".
            </p>
          </div>

          <div className="settings-card__info">
            <p>
              <strong>Current Provider:</strong>{" "}
              {ALL_PROVIDERS.find((p) => p.id === mapProvider)?.name ||
                (mapProvider === "custom" ? "Custom" : "Theme-Aware")}
            </p>
            {mapProvider === "custom" && customTileUrl && (
              <p className="settings-card__help">Custom URL: {customTileUrl}</p>
            )}
            {!userSelectedProvider && (
              <p className="settings-card__help">
                Automatically switching between light/dark maps based on theme
              </p>
            )}
            {userSelectedProvider && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMapProvider(mapProvider, false)}
              >
                Reset to Theme-Aware Mode
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card
        title="Map Provider Reference"
        variant="info"
        className="settings-card"
      >
        <div className="settings-card__content">
          <p className="settings-card__help">
            <strong>Default (Theme Aware):</strong> Automatically switches
            between dark/light map variants when you change themes.
          </p>

          <p className="settings-card__help">
            <strong>Available Providers:</strong>
          </p>
          <ul className="settings-list">
            <li>
              <strong>OpenStreetMap:</strong> Community-driven open map
            </li>
            <li>
              <strong>CARTO.com:</strong> Clean, professional maps with
              light/dark variants
            </li>
            <li>
              <strong>OpenFreeMap:</strong> Vector tile maps with multiple
              styles
            </li>
            <li>
              <strong>ESRI.com:</strong> Satellite imagery and street maps
            </li>
            <li>
              <strong>GIBS Clouds:</strong> NASA satellite imagery from
              yesterday
            </li>
            <li>
              <strong>VFR Sectional:</strong> Visual flight rules charts (zoom
              8-12)
            </li>
            <li>
              <strong>VFR Terminal:</strong> Terminal area charts (zoom 10-12)
            </li>
            <li>
              <strong>IFR Low/High:</strong> Instrument flight rules enroute
              charts
            </li>
          </ul>

          <p className="settings-card__help">
            All providers are free to use and do not require API keys. Based on
            tar1090's map provider selection.
          </p>
        </div>
      </Card>

      <Card title="Map Display" variant="default" className="settings-card">
        <div className="settings-card__content">
          <p className="settings-card__help">
            Configure how aircraft markers are displayed on the map.
          </p>

          <div className="settings-form-field">
            <label htmlFor="ground-altitude-threshold">
              Ground Altitude Threshold
            </label>
            <div className="settings-form-field__inline-row">
              <input
                id="ground-altitude-threshold"
                type="number"
                className="settings-input settings-input--fixed-narrow"
                min="0"
                max="10000"
                step="100"
                value={settings.map.groundAltitudeThreshold ?? 500}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (!Number.isNaN(value)) {
                    setGroundAltitudeThreshold(value);
                  }
                }}
              />
              <span>ft MSL</span>
            </div>
            <p className="settings-card__help">
              Aircraft at or below this altitude (or with ADS-B status "ground")
              will be displayed in gray. Adjust this based on your local terrain
              elevation. Default: 500 ft MSL.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
