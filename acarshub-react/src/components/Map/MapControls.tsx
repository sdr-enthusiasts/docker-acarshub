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

import { useAppStore } from "../../store/useAppStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { createLogger } from "../../utils/logger";
import {
  IconCircleDot,
  IconCloudRain,
  IconCloudSunRain,
  IconEnvelope,
  IconEyeSlash,
  IconFighterJet,
  IconImage,
  IconLocationCrosshairs,
  IconLock,
  IconPalette,
  IconPause,
  IconPlane,
  IconPlaneUp,
  IconPlay,
  IconStar,
  IconTowerBroadcast,
} from "../icons";
import { GeoJSONOverlayButton } from "./GeoJSONOverlayButton";
import { MapControlButton } from "./MapControlButton";
import { MapFiltersMenu } from "./MapFiltersMenu";
import { MapOverlaysMenu } from "./MapOverlaysMenu";
import { MapProviderSelector } from "./MapProviderSelector";

const logger = createLogger("MapControls");

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

interface MapControlsProps {
  /** Whether updates are paused */
  isPaused?: boolean;
  /** Callback when pause button is clicked */
  onTogglePause?: () => void;
  /** Whether an aircraft is being followed */
  isFollowingAircraft?: boolean;
  /** Callback when unfollow button is clicked */
  onUnfollowAircraft?: () => void;
}

/**
 * MapControls Component
 *
 * Floating control panel for map display options.
 * Positioned below the zoom controls in the top-right corner.
 */
export function MapControls({
  isPaused = false,
  onTogglePause,
  isFollowingAircraft = false,
  onUnfollowAircraft,
}: MapControlsProps = {}) {
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
  const setShowHeyWhatsThat = useSettingsStore(
    (state) => state.setShowHeyWhatsThat,
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

  // Hey What's That is only available when the backend has a token configured
  const heyWhatsThatUrl = decoders?.adsb?.heywhatsthat_url;

  return (
    <div className="map-controls">
      {/* Action Controls: Pause + Unfollow */}
      {(onTogglePause || (isFollowingAircraft && onUnfollowAircraft)) && (
        <div className="map-controls__group">
          {onTogglePause && (
            <MapControlButton
              icon={isPaused ? IconPlay : IconPause}
              active={isPaused}
              onClick={onTogglePause}
              tooltip={isPaused ? "Resume Updates" : "Pause Updates"}
            />
          )}
          {isFollowingAircraft && onUnfollowAircraft && (
            <MapControlButton
              icon={IconLocationCrosshairs}
              active={true}
              onClick={onUnfollowAircraft}
              tooltip="Unfollow Aircraft"
            />
          )}
        </div>
      )}

      {/* Map Layers: Map Provider + GeoJSON */}
      <div className="map-controls__group">
        <MapProviderSelector />
        <GeoJSONOverlayButton />
        <MapControlButton
          icon={IconImage}
          active={mapSettings.useSprites}
          onClick={() => {
            const newValue = !mapSettings.useSprites;
            logger.debug("Toggling sprites", {
              from: mapSettings.useSprites,
              to: newValue,
            });
            setUseSprites(newValue);
          }}
          tooltip={`Aircraft Markers: ${mapSettings.useSprites ? "Sprites" : "SVG"}`}
        />
        <MapControlButton
          icon={IconPalette}
          active={mapSettings.colorByDecoder}
          onClick={() => setColorByDecoder(!mapSettings.colorByDecoder)}
          tooltip={`Color By: ${mapSettings.colorByDecoder ? "Decoder Type" : "Message State"}`}
        />
      </div>

      {/* Map Overlays: Range Rings + Weather + Aviation Charts */}
      <div className="map-controls__group map-controls__group--overlays">
        {/* Tall screens (>790px height): individual buttons */}
        {backendAllowsRangeRings && (
          <MapControlButton
            icon={IconCircleDot}
            active={mapSettings.showRangeRings}
            onClick={() => setShowRangeRings(!mapSettings.showRangeRings)}
            tooltip="Show Range Rings"
            className="map-controls__overlay--tall"
          />
        )}
        {heyWhatsThatUrl && (
          <MapControlButton
            icon={IconTowerBroadcast}
            active={mapSettings.showHeyWhatsThat}
            onClick={() => setShowHeyWhatsThat(!mapSettings.showHeyWhatsThat)}
            tooltip="Show Hey What's That Coverage Outline"
            className="map-controls__overlay--tall"
          />
        )}
        <MapControlButton
          icon={IconCloudSunRain}
          active={mapSettings.showNexrad}
          onClick={() => setShowNexrad(!mapSettings.showNexrad)}
          tooltip="Show NEXRAD Weather Radar"
          className="map-controls__overlay--tall"
        />
        <MapControlButton
          icon={IconCloudRain}
          active={mapSettings.showRainViewer}
          onClick={() => setShowRainViewer(!mapSettings.showRainViewer)}
          tooltip="Show RainViewer Radar"
          className="map-controls__overlay--tall"
        />
        <MapControlButton
          icon={IconPlaneUp}
          active={mapSettings.showOpenAIP}
          onClick={() => setShowOpenAIP(!mapSettings.showOpenAIP)}
          tooltip="Show OpenAIP Aviation Charts"
          className="map-controls__overlay--tall"
        />

        {/* Short screens (≤790px height): collapse into flyout */}
        <MapOverlaysMenu
          overlays={[
            ...(backendAllowsRangeRings
              ? [
                  {
                    id: "range-rings",
                    label: "Range Rings",
                    icon: IconCircleDot,
                    active: mapSettings.showRangeRings,
                    onClick: () =>
                      setShowRangeRings(!mapSettings.showRangeRings),
                  },
                ]
              : []),
            ...(heyWhatsThatUrl
              ? [
                  {
                    id: "heywhatsthat",
                    label: "Hey What's That",
                    icon: IconTowerBroadcast,
                    active: mapSettings.showHeyWhatsThat,
                    onClick: () =>
                      setShowHeyWhatsThat(!mapSettings.showHeyWhatsThat),
                  },
                ]
              : []),
            {
              id: "nexrad",
              label: "NEXRAD Radar",
              icon: IconCloudSunRain,
              active: mapSettings.showNexrad,
              onClick: () => setShowNexrad(!mapSettings.showNexrad),
            },
            {
              id: "rainviewer",
              label: "RainViewer Radar",
              icon: IconCloudRain,
              active: mapSettings.showRainViewer,
              onClick: () => setShowRainViewer(!mapSettings.showRainViewer),
            },
            {
              id: "openaip",
              label: "OpenAIP Charts",
              icon: IconPlaneUp,
              active: mapSettings.showOpenAIP,
              onClick: () => setShowOpenAIP(!mapSettings.showOpenAIP),
            },
          ]}
        />
      </div>

      {/* Aircraft Filters: ACARS + Unread + Military + Interesting + PIA + LADD */}
      <div className="map-controls__group map-controls__group--filters">
        <MapControlButton
          icon={IconPlane}
          active={mapSettings.showOnlyAcars}
          onClick={handleAcarsToggle}
          tooltip="Show Only Aircraft with ACARS"
        />
        <MapControlButton
          icon={IconEnvelope}
          active={mapSettings.showOnlyUnread}
          onClick={handleUnreadToggle}
          tooltip="Show Only Aircraft with Unread Messages"
        />
        {/* Desktop: Show all filters as individual buttons */}
        <MapControlButton
          icon={IconFighterJet}
          active={mapSettings.showOnlyMilitary}
          onClick={() => setShowOnlyMilitary(!mapSettings.showOnlyMilitary)}
          tooltip="Show Only Military Aircraft"
          className="map-controls__filter--desktop"
        />
        <MapControlButton
          icon={IconStar}
          active={mapSettings.showOnlyInteresting}
          onClick={() =>
            setShowOnlyInteresting(!mapSettings.showOnlyInteresting)
          }
          tooltip="Show Only Interesting Aircraft"
          className="map-controls__filter--desktop"
        />
        <MapControlButton
          icon={IconEyeSlash}
          active={mapSettings.showOnlyPIA}
          onClick={() => setShowOnlyPIA(!mapSettings.showOnlyPIA)}
          tooltip="Show Only PIA Aircraft"
          className="map-controls__filter--desktop"
        />
        <MapControlButton
          icon={IconLock}
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
              icon: IconFighterJet,
              active: mapSettings.showOnlyMilitary,
              onClick: () => setShowOnlyMilitary(!mapSettings.showOnlyMilitary),
            },
            {
              id: "interesting",
              label: "Interesting",
              icon: IconStar,
              active: mapSettings.showOnlyInteresting,
              onClick: () =>
                setShowOnlyInteresting(!mapSettings.showOnlyInteresting),
            },
            {
              id: "pia",
              label: "PIA",
              icon: IconEyeSlash,
              active: mapSettings.showOnlyPIA,
              onClick: () => setShowOnlyPIA(!mapSettings.showOnlyPIA),
            },
            {
              id: "ladd",
              label: "LADD",
              icon: IconLock,
              active: mapSettings.showOnlyLADD,
              onClick: () => setShowOnlyLADD(!mapSettings.showOnlyLADD),
            },
          ]}
        />
      </div>
    </div>
  );
}
