// Copyright (C) 2022 Frederick Clausen II
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
  LocalStorageSettings,
  LocalStorageSettingsDisplayProperties,
  SettingDisplayProperties,
} from "src/interfaces";

export const default_settings = {
  general_use_metric_altitude: false,
  general_use_metric_distance: false,
  general_convert_to_flight_levels: true,
  general_transition_altitude: 18000,

  alerts_play_sound: false,
  alerts_list_of_blacklist_terms: [],
  alerts_list_of_whitelist_terms: [],

  adsb_update_rate: 5,

  live_map_show_range_rings: true,
  live_map_range_ring_color: "#00000",
  live_map_range_ring_miles: [25, 50, 100, 200],
  live_map_show_adsb_trails: false, // TODO: save adsb position history
  live_map_show_datablocks: false,
  live_map_show_full_datablocks: false,
  live_map_show_only_planes_with_messages: false,

  live_messages_page_num_items: 20,
  live_messages_page_exclude_labels: [] as Array<string>,
  live_messages_page_exclude_empty: false,
} as LocalStorageSettings;

export const default_settings_display_properties = [
  {
    LocalStorageSettingPropertyName: "general_use_metric_altitude",
    LocalStorageSettingPropertyType: "boolean",
    LocalStorageSettingPropertyDefault: false,
    LocalStorageSettingPropertyDisplayCategory: "General",
    LocalStorageSettingPropertyDisplayName: "Use metric altitude",
    LocalStorageSettingPropertyToolTip:
      "Use metric altitude, instead of feet, in the app",
  },
  {
    LocalStorageSettingPropertyName: "general_use_metric_distance",
    LocalStorageSettingPropertyType: "boolean",
    LocalStorageSettingPropertyDefault: false,
    LocalStorageSettingPropertyDisplayCategory: "General",
    LocalStorageSettingPropertyDisplayName: "Use metric distance",
    LocalStorageSettingPropertyToolTip:
      "Use metric distance, instead of miles, in the app",
  },
  {
    LocalStorageSettingPropertyName: "general_convert_to_flight_levels",
    LocalStorageSettingPropertyType: "boolean",
    LocalStorageSettingPropertyDefault: true,
    LocalStorageSettingPropertyDisplayCategory: "General",
    LocalStorageSettingPropertyDisplayName:
      "Convert altitudes from feet to flight levels",
    LocalStorageSettingPropertyToolTip:
      "Convert altitudes from feet to flight levels, instead of feet, in the app.",
  },
  {
    LocalStorageSettingPropertyName: "general_transition_altitude",
    LocalStorageSettingPropertyType: "number",
    LocalStorageSettingPropertyDefault: 18000,
    LocalStorageSettingPropertyNumberMin: 1000,
    LocalStorageSettingPropertyNumberMax: 18000,
    LocalStorageSettingPropertyNumberStep: 1000,
    LocalStorageSettingPropertyDisplayCategory: "General",
    LocalStorageSettingPropertyDisplayName: "Transition altitude",
    LocalStorageSettingPropertyToolTip:
      "Altitude above which aircraft altitudes are converted from feet in to Flight Levels.",
  },
  {
    LocalStorageSettingPropertyName: "alerts_play_sound",
    LocalStorageSettingPropertyType: "boolean",
    LocalStorageSettingPropertyDefault: false,
    LocalStorageSettingPropertyDisplayCategory: "Alerts",
    LocalStorageSettingPropertyDisplayName: "Play sound",
    LocalStorageSettingPropertyToolTip:
      "Play sound when a message comes in matching the alert terms.",
  },
  {
    LocalStorageSettingPropertyName: "alerts_list_of_blacklist_terms",
    LocalStorageSettingPropertyType: "array",
    LocalStorageSettingPropertyDefault: [],
    LocalStorageSettingPropertyDisplayCategory: "Alerts",
    LocalStorageSettingPropertyDisplayName: "Blacklist terms",
    LocalStorageSettingPropertyToolTip:
      "Terms to blacklist. Messages matching these terms will not trigger an alert.",
  },
  {
    LocalStorageSettingPropertyName: "alerts_list_of_whitelist_terms",
    LocalStorageSettingPropertyType: "array",
    LocalStorageSettingPropertyDefault: [],
    LocalStorageSettingPropertyDisplayCategory: "Alerts",
    LocalStorageSettingPropertyDisplayName: "Whitelist terms",
    LocalStorageSettingPropertyToolTip:
      "Terms to whitelist. Messages matching these terms will trigger an alert.",
  },
  {
    LocalStorageSettingPropertyName: "adsb_update_rate",
    LocalStorageSettingPropertyType: "number",
    LocalStorageSettingPropertyDefault: 5,
    LocalStorageSettingPropertyNumberMin: 0.5,
    LocalStorageSettingPropertyNumberMax: 60,
    LocalStorageSettingPropertyNumberStep: 0.5,
    LocalStorageSettingPropertyDisplayCategory: "ADSB",
    LocalStorageSettingPropertyDisplayName: "Update rate",
    LocalStorageSettingPropertyToolTip: "Update rate in seconds for ADSB data.",
  },
  {
    LocalStorageSettingPropertyName: "live_map_show_range_rings",
    LocalStorageSettingPropertyType: "boolean",
    LocalStorageSettingPropertyDefault: true,
    LocalStorageSettingPropertyDisplayCategory: "Live Map",
    LocalStorageSettingPropertyDisplayName: "Show range rings",
    LocalStorageSettingPropertyToolTip: "Show range rings on the live map.",
  },
  {
    LocalStorageSettingPropertyName: "live_map_range_ring_color",
    LocalStorageSettingPropertyType: "string",
    LocalStorageSettingPropertyDefault: "#00000",
    LocalStorageSettingPropertyDisplayCategory: "Live Map",
    LocalStorageSettingPropertyDisplayName: "Range ring color",
    LocalStorageSettingPropertyToolTip:
      "Color of the range rings on the live map. Hex color code.",
  },
  {
    LocalStorageSettingPropertyName: "live_map_range_ring_miles",
    LocalStorageSettingPropertyType: "array",
    LocalStorageSettingPropertyDefault: [0, 25, 50, 100, 200],
    LocalStorageSettingPropertyDisplayCategory: "Live Map",
    LocalStorageSettingPropertyDisplayName: "Range ring miles",
    LocalStorageSettingPropertyToolTip: "Miles of range rings on the live map.",
  },
  {
    LocalStorageSettingPropertyName: "live_map_show_adsb_trails",
    LocalStorageSettingPropertyType: "boolean",
    LocalStorageSettingPropertyDefault: false,
    LocalStorageSettingPropertyDisplayCategory: "Live Map",
    LocalStorageSettingPropertyDisplayName: "Show ADSB trails",
    LocalStorageSettingPropertyToolTip: "Show ADSB trails on the live map.",
  },
  {
    LocalStorageSettingPropertyName: "live_map_show_datablocks",
    LocalStorageSettingPropertyType: "boolean",
    LocalStorageSettingPropertyDefault: false,
    LocalStorageSettingPropertyDisplayCategory: "Live Map",
    LocalStorageSettingPropertyDisplayName: "Show datablocks",
    LocalStorageSettingPropertyToolTip: "Show datablocks on the live map.",
  },
  {
    LocalStorageSettingPropertyName: "live_map_show_full_datablocks",
    LocalStorageSettingPropertyType: "boolean",
    LocalStorageSettingPropertyDefault: false,
    LocalStorageSettingPropertyDisplayCategory: "Live Map",
    LocalStorageSettingPropertyDisplayName: "Show full datablocks",
    LocalStorageSettingPropertyToolTip: "Show full datablocks on the live map.",
  },
  {
    LocalStorageSettingPropertyName: "live_map_show_only_planes_with_messages",
    LocalStorageSettingPropertyType: "boolean",
    LocalStorageSettingPropertyDefault: false,
    LocalStorageSettingPropertyDisplayCategory: "Live Map",
    LocalStorageSettingPropertyDisplayName: "Show only planes with messages",
    LocalStorageSettingPropertyToolTip:
      "Show only planes with messages on the live map.",
  },
  {
    LocalStorageSettingPropertyName: "live_messages_page_num_items",
    LocalStorageSettingPropertyType: "number",
    LocalStorageSettingPropertyDefault: 10,
    LocalStorageSettingPropertyNumberMin: 1,
    LocalStorageSettingPropertyNumberMax: 50,
    LocalStorageSettingPropertyNumberStep: 1,
    LocalStorageSettingPropertyDisplayCategory: "Live Messages",
    LocalStorageSettingPropertyDisplayName: "Number of items per page",
    LocalStorageSettingPropertyToolTip:
      "Number of aircraft message groups displayed on the live message page",
  },
  {
    LocalStorageSettingPropertyName: "live_messages_page_exclude_labels",
    LocalStorageSettingPropertyType: "array",
    LocalStorageSettingPropertyDefault: [],
    LocalStorageSettingPropertyDisplayCategory: "Live Messages",
    LocalStorageSettingPropertyDisplayName: "Exclude labels",
    LocalStorageSettingPropertyToolTip:
      "Exclude aircraft messages with these labels from the live message page",
  },
  {
    LocalStorageSettingPropertyName: "live_messages_page_exclude_empty",
    LocalStorageSettingPropertyType: "boolean",
    LocalStorageSettingPropertyDefault: false,
    LocalStorageSettingPropertyDisplayCategory: "Live Messages",
    LocalStorageSettingPropertyDisplayName: "Exclude empty",
    LocalStorageSettingPropertyToolTip:
      "Exclude aircraft messages with no data from the live message page",
  },
] as Array<SettingDisplayProperties>;
