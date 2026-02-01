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

import {
  faCircleDot,
  faCloudSunRain,
  faEnvelope,
  faPlane,
} from "@fortawesome/free-solid-svg-icons";
import { useAppStore } from "../../store/useAppStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { MapControlButton } from "./MapControlButton";
import "./MapControls.scss";

/**
 * MapControls Component
 *
 * Floating control panel for map display options.
 * Positioned below the zoom controls in the top-right corner.
 */
export function MapControls() {
  const decoders = useAppStore((state) => state.decoders);
  const mapSettings = useSettingsStore((state) => state.settings.map);
  const setShowOnlyAcars = useSettingsStore((state) => state.setShowOnlyAcars);
  const setShowRangeRings = useSettingsStore(
    (state) => state.setShowRangeRings,
  );
  const setShowNexrad = useSettingsStore((state) => state.setShowNexrad);
  const setShowOnlyUnread = useSettingsStore(
    (state) => state.setShowOnlyUnread,
  );

  // Check if range rings are allowed by backend (privacy protection)
  const backendAllowsRangeRings = decoders?.adsb?.range_rings ?? true;

  return (
    <div className="map-controls">
      <div className="map-controls__group">
        <MapControlButton
          icon={faPlane}
          active={mapSettings.showOnlyAcars}
          onClick={() => setShowOnlyAcars(!mapSettings.showOnlyAcars)}
          tooltip="Show Only Aircraft with ACARS"
        />
      </div>

      {backendAllowsRangeRings && (
        <div className="map-controls__group">
          <MapControlButton
            icon={faCircleDot}
            active={mapSettings.showRangeRings}
            onClick={() => setShowRangeRings(!mapSettings.showRangeRings)}
            tooltip="Show Range Rings"
          />
        </div>
      )}

      <div className="map-controls__group">
        <MapControlButton
          icon={faCloudSunRain}
          active={mapSettings.showNexrad}
          onClick={() => setShowNexrad(!mapSettings.showNexrad)}
          tooltip="Show NEXRAD Weather Radar"
        />
      </div>

      <div className="map-controls__group">
        <MapControlButton
          icon={faEnvelope}
          active={mapSettings.showOnlyUnread}
          onClick={() => setShowOnlyUnread(!mapSettings.showOnlyUnread)}
          tooltip="Show Only Aircraft with Unread Messages"
        />
      </div>
    </div>
  );
}
