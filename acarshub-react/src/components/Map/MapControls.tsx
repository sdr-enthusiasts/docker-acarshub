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
  faCloudRain,
  faCloudSunRain,
  faEnvelope,
  faFighterJet,
  faPlane,
  faPlaneUp,
  faStar,
} from "@fortawesome/free-solid-svg-icons";
import { useAppStore } from "../../store/useAppStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { GeoJSONOverlayButton } from "./GeoJSONOverlayButton";
import { MapControlButton } from "./MapControlButton";
import { MapProviderSelector } from "./MapProviderSelector";
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
  const setShowOpenAIP = useSettingsStore((state) => state.setShowOpenAIP);
  const setShowRainViewer = useSettingsStore(
    (state) => state.setShowRainViewer,
  );
  const setShowOnlyUnread = useSettingsStore(
    (state) => state.setShowOnlyUnread,
  );
  const setShowOnlyMilitary = useSettingsStore(
    (state) => state.setShowOnlyMilitary,
  );
  const setShowOnlyInteresting = useSettingsStore(
    (state) => state.setShowOnlyInteresting,
  );

  // Check if range rings are allowed by backend (privacy protection)
  const backendAllowsRangeRings = decoders?.adsb?.range_rings ?? true;

  return (
    <div className="map-controls">
      {/* Map Layers: Map Provider + GeoJSON */}
      <div className="map-controls__group">
        <MapProviderSelector />
        <GeoJSONOverlayButton />
      </div>

      {/* Map Overlays: Range Rings + Weather + Aviation Charts */}
      <div className="map-controls__group">
        {backendAllowsRangeRings && (
          <MapControlButton
            icon={faCircleDot}
            active={mapSettings.showRangeRings}
            onClick={() => setShowRangeRings(!mapSettings.showRangeRings)}
            tooltip="Show Range Rings"
          />
        )}
        <MapControlButton
          icon={faCloudSunRain}
          active={mapSettings.showNexrad}
          onClick={() => setShowNexrad(!mapSettings.showNexrad)}
          tooltip="Show NEXRAD Weather Radar"
        />
        <MapControlButton
          icon={faCloudRain}
          active={mapSettings.showRainViewer}
          onClick={() => setShowRainViewer(!mapSettings.showRainViewer)}
          tooltip="Show RainViewer Radar"
        />
        <MapControlButton
          icon={faPlaneUp}
          active={mapSettings.showOpenAIP}
          onClick={() => setShowOpenAIP(!mapSettings.showOpenAIP)}
          tooltip="Show OpenAIP Aviation Charts"
        />
      </div>

      {/* Aircraft Filters: ACARS + Unread + Military + Interesting */}
      <div className="map-controls__group">
        <MapControlButton
          icon={faPlane}
          active={mapSettings.showOnlyAcars}
          onClick={() => setShowOnlyAcars(!mapSettings.showOnlyAcars)}
          tooltip="Show Only Aircraft with ACARS"
        />
        <MapControlButton
          icon={faEnvelope}
          active={mapSettings.showOnlyUnread}
          onClick={() => setShowOnlyUnread(!mapSettings.showOnlyUnread)}
          tooltip="Show Only Aircraft with Unread Messages"
        />
        <MapControlButton
          icon={faFighterJet}
          active={mapSettings.showOnlyMilitary}
          onClick={() => setShowOnlyMilitary(!mapSettings.showOnlyMilitary)}
          tooltip="Show Only Military Aircraft"
        />
        <MapControlButton
          icon={faStar}
          active={mapSettings.showOnlyInteresting}
          onClick={() =>
            setShowOnlyInteresting(!mapSettings.showOnlyInteresting)
          }
          tooltip="Show Only Interesting Aircraft"
        />
      </div>
    </div>
  );
}
