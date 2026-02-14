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

import { faCircleDot } from "@fortawesome/free-solid-svg-icons/faCircleDot";
import { faCloudRain } from "@fortawesome/free-solid-svg-icons/faCloudRain";
import { faCloudSunRain } from "@fortawesome/free-solid-svg-icons/faCloudSunRain";
import { faEnvelope } from "@fortawesome/free-solid-svg-icons/faEnvelope";
import { faEyeSlash } from "@fortawesome/free-solid-svg-icons/faEyeSlash";
import { faFighterJet } from "@fortawesome/free-solid-svg-icons/faFighterJet";
import { faImage } from "@fortawesome/free-solid-svg-icons/faImage";
import { faLock } from "@fortawesome/free-solid-svg-icons/faLock";
import { faPalette } from "@fortawesome/free-solid-svg-icons/faPalette";
import { faPlane } from "@fortawesome/free-solid-svg-icons/faPlane";
import { faPlaneUp } from "@fortawesome/free-solid-svg-icons/faPlaneUp";
import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
import { useAppStore } from "../../store/useAppStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { GeoJSONOverlayButton } from "./GeoJSONOverlayButton";
import { MapControlButton } from "./MapControlButton";
import { MapFiltersMenu } from "./MapFiltersMenu";
import { MapProviderSelector } from "./MapProviderSelector";

/**
 * Handle ACARS filter toggle with mutual exclusivity
 * When enabling ACARS filter, disable Unread filter
 */
const useAcarsFilterToggle = () => {
  const mapSettings = useSettingsStore((state) => state.settings.map);
  const setShowOnlyAcars = useSettingsStore((state) => state.setShowOnlyAcars);
  const setShowOnlyUnread = useSettingsStore(
    (state) => state.setShowOnlyUnread,
  );

  return () => {
    const newValue = !mapSettings.showOnlyAcars;
    setShowOnlyAcars(newValue);
    // If enabling ACARS filter, disable Unread filter (mutually exclusive)
    if (newValue && mapSettings.showOnlyUnread) {
      setShowOnlyUnread(false);
    }
  };
};

/**
 * Handle Unread filter toggle with mutual exclusivity
 * When enabling Unread filter, disable ACARS filter
 */
const useUnreadFilterToggle = () => {
  const mapSettings = useSettingsStore((state) => state.settings.map);
  const setShowOnlyAcars = useSettingsStore((state) => state.setShowOnlyAcars);
  const setShowOnlyUnread = useSettingsStore(
    (state) => state.setShowOnlyUnread,
  );

  return () => {
    const newValue = !mapSettings.showOnlyUnread;
    setShowOnlyUnread(newValue);
    // If enabling Unread filter, disable ACARS filter (mutually exclusive)
    if (newValue && mapSettings.showOnlyAcars) {
      setShowOnlyAcars(false);
    }
  };
};

/**
 * MapControls Component
 *
 * Floating control panel for map display options.
 * Positioned below the zoom controls in the top-right corner.
 */
export function MapControls() {
  const decoders = useAppStore((state) => state.decoders);
  const mapSettings = useSettingsStore((state) => state.settings.map);
  const setShowRangeRings = useSettingsStore(
    (state) => state.setShowRangeRings,
  );
  const setShowNexrad = useSettingsStore((state) => state.setShowNexrad);
  const setShowOpenAIP = useSettingsStore((state) => state.setShowOpenAIP);
  const setShowRainViewer = useSettingsStore(
    (state) => state.setShowRainViewer,
  );
  const setShowOnlyMilitary = useSettingsStore(
    (state) => state.setShowOnlyMilitary,
  );
  const setShowOnlyInteresting = useSettingsStore(
    (state) => state.setShowOnlyInteresting,
  );
  const setShowOnlyPIA = useSettingsStore((state) => state.setShowOnlyPIA);
  const setShowOnlyLADD = useSettingsStore((state) => state.setShowOnlyLADD);
  const setUseSprites = useSettingsStore((state) => state.setUseSprites);
  const setColorByDecoder = useSettingsStore(
    (state) => state.setColorByDecoder,
  );

  // Mutually exclusive filter toggles
  const handleAcarsToggle = useAcarsFilterToggle();
  const handleUnreadToggle = useUnreadFilterToggle();

  // Check if range rings are allowed by backend (privacy protection)
  const backendAllowsRangeRings = decoders?.adsb?.range_rings ?? true;

  return (
    <div className="map-controls">
      {/* Map Layers: Map Provider + GeoJSON */}
      <div className="map-controls__group">
        <MapProviderSelector />
        <GeoJSONOverlayButton />
        <MapControlButton
          icon={faImage}
          active={mapSettings.useSprites}
          onClick={() => setUseSprites(!mapSettings.useSprites)}
          tooltip={`Aircraft Markers: ${mapSettings.useSprites ? "Sprites" : "SVG"}`}
        />
        <MapControlButton
          icon={faPalette}
          active={mapSettings.colorByDecoder}
          onClick={() => setColorByDecoder(!mapSettings.colorByDecoder)}
          tooltip={`Color By: ${mapSettings.colorByDecoder ? "Decoder Type" : "Message State"}`}
        />
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

      {/* Aircraft Filters: ACARS + Unread + Military + Interesting + PIA + LADD */}
      <div className="map-controls__group map-controls__group--filters">
        <MapControlButton
          icon={faPlane}
          active={mapSettings.showOnlyAcars}
          onClick={handleAcarsToggle}
          tooltip="Show Only Aircraft with ACARS"
        />
        <MapControlButton
          icon={faEnvelope}
          active={mapSettings.showOnlyUnread}
          onClick={handleUnreadToggle}
          tooltip="Show Only Aircraft with Unread Messages"
        />
        {/* Desktop: Show all filters as individual buttons */}
        <MapControlButton
          icon={faFighterJet}
          active={mapSettings.showOnlyMilitary}
          onClick={() => setShowOnlyMilitary(!mapSettings.showOnlyMilitary)}
          tooltip="Show Only Military Aircraft"
          className="map-controls__filter--desktop"
        />
        <MapControlButton
          icon={faStar}
          active={mapSettings.showOnlyInteresting}
          onClick={() =>
            setShowOnlyInteresting(!mapSettings.showOnlyInteresting)
          }
          tooltip="Show Only Interesting Aircraft"
          className="map-controls__filter--desktop"
        />
        <MapControlButton
          icon={faEyeSlash}
          active={mapSettings.showOnlyPIA}
          onClick={() => setShowOnlyPIA(!mapSettings.showOnlyPIA)}
          tooltip="Show Only PIA Aircraft"
          className="map-controls__filter--desktop"
        />
        <MapControlButton
          icon={faLock}
          active={mapSettings.showOnlyLADD}
          onClick={() => setShowOnlyLADD(!mapSettings.showOnlyLADD)}
          tooltip="Show Only LADD Aircraft"
          className="map-controls__filter--desktop"
        />

        {/* Mobile: Collapse into flyout menu */}
        <MapFiltersMenu
          filters={[
            {
              id: "military",
              label: "Military",
              icon: faFighterJet,
              active: mapSettings.showOnlyMilitary,
              onClick: () => setShowOnlyMilitary(!mapSettings.showOnlyMilitary),
            },
            {
              id: "interesting",
              label: "Interesting",
              icon: faStar,
              active: mapSettings.showOnlyInteresting,
              onClick: () =>
                setShowOnlyInteresting(!mapSettings.showOnlyInteresting),
            },
            {
              id: "pia",
              label: "PIA",
              icon: faEyeSlash,
              active: mapSettings.showOnlyPIA,
              onClick: () => setShowOnlyPIA(!mapSettings.showOnlyPIA),
            },
            {
              id: "ladd",
              label: "LADD",
              icon: faLock,
              active: mapSettings.showOnlyLADD,
              onClick: () => setShowOnlyLADD(!mapSettings.showOnlyLADD),
            },
          ]}
        />
      </div>
    </div>
  );
}
