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

import type { GeoJSONCategory, GeoJSONOverlay } from "../types";

/**
 * GeoJSON Overlay Configuration
 *
 * Defines all available GeoJSON overlays for the Live Map.
 * Organized by geographic region for easy user discovery.
 *
 * Color scheme:
 * - Green (#00ff00): Air-to-air refueling tracks
 * - Magenta (#ff00ff): Boundaries and airspace
 * - Yellow (#ffff00): Navigation routes
 * - Orange (#ff8800): Training areas
 * - Red (#ff4444): Military zones
 * - Blue (#00aaff): AWACS orbits
 * - White (#ffffff): Airports
 * - Gray (#aaaaaa): Runways
 */
export const GEOJSON_OVERLAYS: GeoJSONCategory[] = [
  {
    name: "United States",
    overlays: [
      {
        id: "us_a2a_refueling",
        name: "Air-to-Air Refueling Tracks",
        path: "/geojson/US_A2A_refueling.geojson",
        category: "United States",
        enabled: false,
        color: "#00ff00",
        opacity: 0.7,
      },
      {
        id: "us_artcc_boundaries",
        name: "ARTCC Boundaries",
        path: "/geojson/US_ARTCC_boundaries.geojson",
        category: "United States",
        enabled: false,
        color: "#ff00ff",
        opacity: 0.6,
      },
      {
        id: "ift_nav_routes",
        name: "IFT Navigation Routes",
        path: "/geojson/IFT/IFT_NAV_Routes.geojson",
        category: "United States",
        enabled: false,
        color: "#ffff00",
        opacity: 0.7,
      },
      {
        id: "ift_training_areas",
        name: "IFT Training Areas",
        path: "/geojson/IFT/IFT_Training_Areas.geojson",
        category: "United States",
        enabled: false,
        color: "#ff8800",
        opacity: 0.5,
      },
      {
        id: "usafa_training_areas",
        name: "USAFA Training Areas",
        path: "/geojson/IFT/USAFA_Training_Areas.geojson",
        category: "United States",
        enabled: false,
        color: "#ff4444",
        opacity: 0.5,
      },
    ],
  },
  {
    name: "United Kingdom",
    overlays: [
      {
        id: "uk_mil_aar_zones",
        name: "Military AAR Zones",
        path: "/geojson/UK_Mil_AAR_Zones.geojson",
        category: "United Kingdom",
        enabled: false,
        color: "#00ff00",
        opacity: 0.7,
      },
      {
        id: "uk_mil_awacs_orbits",
        name: "Military AWACS Orbits",
        path: "/geojson/UK_Mil_AWACS_Orbits.geojson",
        category: "United Kingdom",
        enabled: false,
        color: "#00aaff",
        opacity: 0.7,
      },
      {
        id: "uk_mil_rc",
        name: "Military RC",
        path: "/geojson/UK_Mil_RC.geojson",
        category: "United Kingdom",
        enabled: false,
        color: "#ff00ff",
        opacity: 0.7,
      },
      {
        id: "uk_airports",
        name: "Airports",
        path: "/geojson/uk_advisory/airports.geojson",
        category: "United Kingdom",
        enabled: false,
        color: "#ffffff",
        opacity: 0.8,
      },
      {
        id: "uk_runways",
        name: "Runways",
        path: "/geojson/uk_advisory/runways.geojson",
        category: "United Kingdom",
        enabled: false,
        color: "#aaaaaa",
        opacity: 0.8,
      },
      {
        id: "uk_shoreham",
        name: "Shoreham",
        path: "/geojson/uk_advisory/shoreham.geojson",
        category: "United Kingdom",
        enabled: false,
        color: "#ffaa00",
        opacity: 0.7,
      },
    ],
  },
  {
    name: "Europe",
    overlays: [
      {
        id: "de_mil_awacs_orbits",
        name: "Germany AWACS Orbits",
        path: "/geojson/DE_Mil_AWACS_Orbits.geojson",
        category: "Europe",
        enabled: false,
        color: "#ffcc00",
        opacity: 0.7,
      },
      {
        id: "nl_mil_awacs_orbits",
        name: "Netherlands AWACS Orbits",
        path: "/geojson/NL_Mil_AWACS_Orbits.geojson",
        category: "Europe",
        enabled: false,
        color: "#ff6600",
        opacity: 0.7,
      },
      {
        id: "pl_mil_awacs_orbits",
        name: "Poland AWACS Orbits",
        path: "/geojson/PL_Mil_AWACS_Orbits.geojson",
        category: "Europe",
        enabled: false,
        color: "#ff0066",
        opacity: 0.7,
      },
    ],
  },
];

/**
 * Get overlay by ID
 */
export function getOverlayById(id: string): GeoJSONOverlay | undefined {
  for (const category of GEOJSON_OVERLAYS) {
    const overlay = category.overlays.find((o) => o.id === id);
    if (overlay) return overlay;
  }
  return undefined;
}

/**
 * Get all overlays in a category
 */
export function getOverlaysByCategory(categoryName: string): GeoJSONOverlay[] {
  const category = GEOJSON_OVERLAYS.find((c) => c.name === categoryName);
  return category?.overlays ?? [];
}

/**
 * Get all overlay IDs
 */
export function getAllOverlayIds(): string[] {
  return GEOJSON_OVERLAYS.flatMap((category) =>
    category.overlays.map((overlay) => overlay.id),
  );
}
