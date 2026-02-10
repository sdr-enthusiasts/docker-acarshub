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

import type { MapProviderConfig } from "../types";

/**
 * Map Provider Configurations
 * Based on tar1090's base_layers.js
 * All providers are free and do not require API keys
 */

/**
 * Worldwide map providers
 */
export const WORLDWIDE_PROVIDERS: MapProviderConfig[] = [
  {
    id: "osm",
    name: "OpenStreetMap",
    category: "worldwide",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://www.openstreetmap.org/copyright">ODbL</a>',
    maxZoom: 19,
  },
  {
    id: "carto_english",
    name: "CARTO.com English",
    category: "worldwide",
    url: "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    attribution:
      'Powered by <a href="https://carto.com">CARTO.com</a> using data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://www.openstreetmap.org/copyright">ODbL</a>',
    maxZoom: 19,
  },
  {
    id: "osm_de",
    name: "OpenStreetMap DE",
    category: "worldwide",
    url: "https://a.tile.openstreetmap.de/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: 18,
  },
  {
    id: "openfreemap_bright",
    name: "OpenFreeMap Bright",
    category: "worldwide",
    url: "https://tiles.openfreemap.org/styles/bright",
    attribution: '&copy; <a href="https://openfreemap.org">OpenFreeMap</a>',
    isVector: true,
  },
  {
    id: "openfreemap_liberty",
    name: "OpenFreeMap Liberty",
    category: "worldwide",
    url: "https://tiles.openfreemap.org/styles/liberty",
    attribution: '&copy; <a href="https://openfreemap.org">OpenFreeMap</a>',
    isVector: true,
  },
  {
    id: "openfreemap_positron",
    name: "OpenFreeMap Positron",
    category: "worldwide",
    url: "https://tiles.openfreemap.org/styles/positron",
    attribution: '&copy; <a href="https://openfreemap.org">OpenFreeMap</a>',
    isVector: true,
  },
  {
    id: "openfreemap_dark",
    name: "OpenFreeMap Dark",
    category: "worldwide",
    url: "https://tiles.openfreemap.org/styles/dark",
    attribution: '&copy; <a href="https://openfreemap.org">OpenFreeMap</a>',
    isVector: true,
  },
  {
    id: "openfreemap_fiord",
    name: "OpenFreeMap Fiord",
    category: "worldwide",
    url: "https://tiles.openfreemap.org/styles/fiord",
    attribution: '&copy; <a href="https://openfreemap.org">OpenFreeMap</a>',
    isVector: true,
  },
  {
    id: "esri_satellite",
    name: "ESRI.com Sat.",
    category: "worldwide",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      'Powered by <a href="https://www.esri.com">Esri.com</a> — Sources: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19,
  },
  {
    id: "esri_gray",
    name: "ESRI.com Gray",
    category: "worldwide",
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution:
      'Powered by <a href="https://www.esri.com">Esri.com</a> — Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), Esri Korea, Esri (Thailand), NGCC, (c) OpenStreetMap contributors, and the GIS User Community',
    maxZoom: 16,
  },
  {
    id: "esri_streets",
    name: "ESRI.com Streets",
    category: "worldwide",
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution:
      'Powered by <a href="https://www.esri.com">Esri.com</a> — Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), Esri Korea, Esri (Thailand), NGCC, (c) OpenStreetMap contributors, and the GIS User Community',
    maxZoom: 20,
  },
  {
    id: "gibs_clouds",
    name: "GIBS Clouds (Yesterday)",
    category: "worldwide",
    url: "", // Will be generated dynamically with yesterday's date
    attribution:
      '<a href="https://terra.nasa.gov/about/terra-instruments/modis">MODIS Terra</a> Provided by NASA\'s Global Imagery Browse Services (GIBS)',
    maxZoom: 9,
  },
  {
    id: "carto_dark_all",
    name: "CARTO.com Dark All",
    category: "worldwide",
    url: "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    attribution:
      'Powered by <a href="https://carto.com">CARTO.com</a> using data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://www.openstreetmap.org/copyright">ODbL</a>',
    maxZoom: 20,
  },
  {
    id: "carto_dark_nolabels",
    name: "CARTO.com Dark No Labels",
    category: "worldwide",
    url: "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
    attribution:
      'Powered by <a href="https://carto.com">CARTO.com</a> using data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://www.openstreetmap.org/copyright">ODbL</a>',
    maxZoom: 20,
  },
  {
    id: "carto_light_all",
    name: "CARTO.com Light All",
    category: "worldwide",
    url: "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    attribution:
      'Powered by <a href="https://carto.com">CARTO.com</a> using data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://www.openstreetmap.org/copyright">ODbL</a>',
    maxZoom: 20,
  },
  {
    id: "carto_light_nolabels",
    name: "CARTO.com Light No Labels",
    category: "worldwide",
    url: "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
    attribution:
      'Powered by <a href="https://carto.com">CARTO.com</a> using data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://www.openstreetmap.org/copyright">ODbL</a>',
    maxZoom: 20,
  },
];

/**
 * US-specific map providers (aviation charts)
 */
export const US_PROVIDERS: MapProviderConfig[] = [
  {
    id: "vfr_sectional",
    name: "US VFR Sectional Chart",
    category: "us",
    url: "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/tile/{z}/{y}/{x}",
    attribution:
      'Tiles courtesy of <a href="http://tiles.arcgis.com/">arcgis.com</a>',
    minZoom: 8,
    maxZoom: 12,
  },
  {
    id: "vfr_terminal",
    name: "US VFR Terminal Chart",
    category: "us",
    url: "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Terminal/MapServer/tile/{z}/{y}/{x}",
    attribution:
      'Tiles courtesy of <a href="http://tiles.arcgis.com/">arcgis.com</a>',
    minZoom: 10,
    maxZoom: 12,
  },
  {
    id: "ifr_low",
    name: "US IFR Enroute Chart Low",
    category: "us",
    url: "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/IFR_AreaLow/MapServer/tile/{z}/{y}/{x}",
    attribution:
      'Tiles courtesy of <a href="http://tiles.arcgis.com/">arcgis.com</a>',
    minZoom: 8,
    maxZoom: 11,
  },
  {
    id: "ifr_high",
    name: "US IFR Enroute Chart High",
    category: "us",
    url: "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/IFR_High/MapServer/tile/{z}/{y}/{x}",
    attribution:
      'Tiles courtesy of <a href="http://tiles.arcgis.com/">arcgis.com</a>',
    minZoom: 7,
    maxZoom: 11,
  },
];

/**
 * All providers combined
 */
export const ALL_PROVIDERS: MapProviderConfig[] = [
  ...WORLDWIDE_PROVIDERS,
  ...US_PROVIDERS,
];

/**
 * Get provider configuration by ID
 */
export function getProviderConfig(
  providerId: string,
): MapProviderConfig | undefined {
  return ALL_PROVIDERS.find((p) => p.id === providerId);
}

/**
 * Get providers by category
 */
export function getProvidersByCategory(
  category: "worldwide" | "us" | "europe",
): MapProviderConfig[] {
  return ALL_PROVIDERS.filter((p) => p.category === category);
}

/**
 * Generate GIBS clouds URL with yesterday's date
 */
export function getGibsCloudsUrl(): string {
  const date = new Date(Date.now() - 86400 * 1000);
  const yesterday = `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`;
  return `https://gibs-a.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${yesterday}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
}

/**
 * Get tile URL for a provider
 * Handles special cases like GIBS clouds and custom URLs
 */
export function getProviderTileUrl(
  providerId: string,
  customUrl?: string,
): string {
  if (providerId === "custom" && customUrl) {
    return customUrl;
  }

  if (providerId === "gibs_clouds") {
    return getGibsCloudsUrl();
  }

  const provider = getProviderConfig(providerId);
  return provider?.url || "";
}
