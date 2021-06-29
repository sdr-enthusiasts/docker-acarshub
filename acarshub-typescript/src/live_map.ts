import * as L from "leaflet";
import { acars_msg, adsb_plane, window_size, adsb } from "./interfaces";
import jBox from "jbox";
import { display_messages } from "./html_generator.js";
import { getBaseMarker, svgShapeToURI } from "aircraft_icons";

import {
  resize_tabs,
  showPlaneMessages,
  find_matches,
  get_match,
  get_window_size,
} from "./index.js";
import { images } from "./images.js";
import { tooltip } from "./tooltips.js";

export let live_map_page = {
  livemap_acars_path: "" as string,
  livemap_acars_url: "" as string,
  adsb_enabled: false as boolean,
  live_map_page_active: false as boolean,
  adsb_planes: (<unknown>null) as adsb,
  map: (<unknown>null) as L.Map,
  layerGroup: (<unknown>null) as L.LayerGroup,
  lat: 0 as number,
  lon: 0 as number,
  ignored_keys: ["trk", "alt", "call"] as string[],
  plane_message_modal: new jBox("Modal", {
    id: "set_modal",
    width: 350,
    height: 400,
    blockScroll: false,
    isolateScroll: true,
    animation: "zoomIn",
    draggable: "title",
    closeButton: "title",
    overlay: false,
    reposition: true,
    repositionOnOpen: false,
    title: "Messages",
    content: "",
  }),

  set_targets: function (adsb_targets: adsb) {
    if (this.adsb_planes == null || this.adsb_planes.now < adsb_targets.now) {
      this.adsb_planes = adsb_targets;
      if (this.live_map_page_active) this.update_targets();
    }
  },

  live_map: function (lat_in: number, lon_in: number) {
    this.lat = lat_in;
    this.lon = lon_in;
    if (this.live_map_page_active && this.adsb_enabled)
      this.map.setView([this.lat, this.lon], 8);
  },

  update_targets: function () {
    if (
      typeof this.map !== null &&
      this.layerGroup !== null &&
      this.adsb_planes !== null
    ) {
      // clear old planes
      this.layerGroup.clearLayers();
      const plane_data = find_matches();

      for (const plane in this.adsb_planes.aircraft) {
        if (
          this.adsb_planes.aircraft[plane].lat != null &&
          this.adsb_planes.aircraft[plane].lon != null
        ) {
          const current_plane = this.adsb_planes.aircraft[plane];
          const callsign = current_plane.flight
            ? current_plane.flight.trim()
            : current_plane.r || current_plane.hex.toUpperCase();
          const rotate: number = current_plane.track || 0;
          const alt: number = current_plane.alt_baro || 0;
          const hex: string = current_plane.hex
            ? current_plane.hex.toUpperCase()
            : "";
          const speed: number = current_plane.gs || 0;
          const squawk: number = current_plane.squawk || 0;
          const baro_rate: number = current_plane.baro_rate || 0;
          const tail: string = current_plane.r || <any>undefined;
          const ac_type: string = current_plane.t || <any>undefined;
          let num_messages: number = <any>undefined; // need to cast this to any for TS to compile.

          if (num_messages == undefined) {
            num_messages = plane_data.hex[hex];
          }
          if (num_messages == undefined) {
            num_messages = plane_data.callsigns[callsign];
          }
          if (num_messages == undefined && tail != undefined) {
            num_messages = plane_data.tail[tail];
          }
          if (num_messages == undefined) {
            num_messages = 0;
          }

          // saving this for later
          // ${
          //   matched_with_acars
          //     ? `<div class="svg-overlay" style="color: white;">(` + num_messages + ")</div>" : ""
          // }
          let type_shape = getBaseMarker(
            current_plane.category,
            current_plane.t,
            null,
            null,
            current_plane.type,
            alt,
            null
          );
          let color: string = num_messages ? "blue" : "green";
          let icon_image = svgShapeToURI(
            type_shape[0],
            color,
            "black",
            2,
            type_shape[1]
          );

          let plane_icon = L.divIcon({
            className: "airplane",
            html: `<div><div style="-webkit-transform:rotate(${rotate}deg); -moz-transform: rotate(${rotate}deg); -ms-transform: rotate(${rotate}deg); -o-transform: rotate(${rotate}deg); transform: rotate(${rotate}deg);">${
              num_messages ? icon_image : icon_image
            }</div></div>`,
            iconSize: [30, 30],
          });

          let plane_marker = L.marker(
            [current_plane.lat || 0, current_plane.lon || 0],
            {
              icon: plane_icon,
              riseOnHover: true,
            }
          );

          plane_marker.bindTooltip(
            `<div style='background:white; padding:1px 3px 1px 3px'>${
              callsign !== hex ? callsign + "/" : ""
            }${hex}<hr>Altitude: ${alt}ft${
              baro_rate ? "<br>Altitude Rate: " + baro_rate + "fpm" : ""
            }<br>Heading: ${Math.round(rotate)}&deg;${
              speed ? "<br>Speed: " + Math.round(speed) + " knots" : ""
            }${speed ? "<br>Squawk: " + squawk : ""}${
              tail ? "<br>Tail Number: " + tail : ""
            }${ac_type ? "<br>Aircraft Type: " + ac_type : ""}${
              num_messages
                ? "<br><br>Number of ACARS messages: " + num_messages
                : ""
            }</div>`,
            {
              className: "popup",
              sticky: true,
            }
          );
          plane_marker.addTo(this.layerGroup);

          if (num_messages) {
            plane_marker.on("click", () => {
              showPlaneMessages(callsign, hex, tail);
            });
          }
        }
      }
    }
  },

  showPlaneMessages: function (
    plane_callsign: string = "",
    plane_hex: string = "",
    plane_tail = ""
  ) {
    if (plane_callsign === "" && plane_hex === "") return;
    const matches: acars_msg[] = get_match(
      plane_callsign,
      plane_hex,
      plane_tail
    );
    if (matches.length === 0) return;
    const html =
      '<div style="background:white">' +
      display_messages([matches], "", true) +
      "</div>";
    this.plane_message_modal.setContent(html);
    this.plane_message_modal.setTitle(`Messages for ${plane_callsign}`);
    const window_size: window_size = get_window_size();
    this.plane_message_modal.setHeight(window_size.height > 500 ? 500 : 400);
    this.plane_message_modal.setWidth(window_size.width > 500 ? 500 : 350);
    this.plane_message_modal.open();
    resize_tabs(window_size.width > 500 ? 465 : 310, false);
    $(".show_when_small").css("display", `inline-block`);
    $(".show_when_big").css("display", "none");
    $(".dont_show").css("display", "none");
    tooltip.close_all_tooltips();
    tooltip.attach_all_tooltips();
  },

  updateModalSize: function (new_window_size: window_size) {
    this.plane_message_modal.setHeight(
      new_window_size.height > 500 ? 500 : 400
    );
    this.plane_message_modal.setWidth(new_window_size.width > 500 ? 500 : 350);
    resize_tabs(new_window_size.width > 500 ? 465 : 310, false);
    $(".show_when_small").css("display", `inline-block`);
    $(".show_when_big").css("display", "none");
    tooltip.close_all_tooltips();
    tooltip.attach_all_tooltips();
  },

  live_map_active: function (state = false) {
    this.live_map_page_active = state;
    if (this.live_map_page_active && this.adsb_enabled) {
      this.set_html();
      this.map = L.map("mapid", {
        zoomDelta: 0.2,
        center: [this.lat, this.lon],
        zoom: 8,
        scrollWheelZoom: false,
        // @ts-expect-error
        smoothWheelZoom: true,
        smoothSensitivity: 1,
      });

      L.tileLayer("http://{s}.tile.osm.org/{z}/{x}/{y}.png", {
        detectRetina: false,
        opacity: 0.6,
        attribution:
          '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(this.map);

      this.layerGroup = L.layerGroup().addTo(this.map);

      this.update_targets();
    }
  },

  set_live_map_page_urls: function (documentPath: string, documentUrl: string) {
    this.livemap_acars_path = documentPath;
    this.livemap_acars_url = documentUrl;
  },

  set_html: function () {
    $("#modal_text").html("");
    $("#page_name").html("");
    if (this.adsb_enabled) $("#log").html('<div id="mapid"></div>');
    else $("#log").html("ADSB Disabled");
  },

  destroy_maps: function () {
    this.map = (<unknown>null) as L.Map;
    this.layerGroup = (<unknown>null) as L.LayerGroup;
    this.adsb_planes = (<unknown>null) as adsb;

    if (this.live_map_page_active) this.set_html();
  },

  is_adsb_enabled: function (is_enabled: boolean = false) {
    this.adsb_enabled = is_enabled;
    if (this.live_map_page_active) {
      this.set_html();

      if (this.live_map_page_active) {
        this.live_map_active(true);
      }
    }
  },
};
