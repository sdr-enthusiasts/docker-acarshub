import * as L from "leaflet";
import { acars_msg, adsb_plane, window_size, adsb } from "./interfaces";
import jBox from "jbox";
import { display_messages } from "./html_generator.js";

import {
  resize_tabs,
  showPlaneMessages,
  find_matches,
  get_match,
  get_window_size,
} from "./index.js";
import { images } from "./images";

export let live_map_page = {
  livemap_acars_path: "" as string,
  livemap_acars_url: "" as string,

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

  darkerColors: false as boolean,

  // thanks to wiedehopf/tar1090 for the color to altitude code
  ColorByAlt: {
    // HSL for planes with unknown altitude:
    unknown: { h: 0, s: 0, l: 20 },

    // HSL for planes that are on the ground:
    ground: { h: 220, s: 0, l: 30 },

    air: {
      // These define altitude-to-hue mappings
      // at particular altitudes; the hue
      // for intermediate altitudes that lie
      // between the provided altitudes is linearly
      // interpolated.
      //
      // Mappings must be provided in increasing
      // order of altitude.
      //
      // Altitudes below the first entry use the
      // hue of the first entry; altitudes above
      // the last entry use the hue of the last
      // entry.
      h: [
        { alt: 0, val: 20 }, // orange
        { alt: 2000, val: 32.5 }, // yellow
        { alt: 4000, val: 43 }, // yellow
        { alt: 6000, val: 54 }, // yellow
        { alt: 8000, val: 72 }, // yellow
        { alt: 9000, val: 85 }, // green yellow
        { alt: 11000, val: 140 }, // light green
        { alt: 40000, val: 300 }, // magenta
        { alt: 51000, val: 360 }, // red
      ],
      s: 88,
      l: [
        { h: 0, val: 53 },
        { h: 20, val: 50 },
        { h: 32, val: 54 },
        { h: 40, val: 52 },
        { h: 46, val: 51 },
        { h: 50, val: 46 },
        { h: 60, val: 43 },
        { h: 80, val: 41 },
        { h: 100, val: 41 },
        { h: 120, val: 41 },
        { h: 140, val: 41 },
        { h: 160, val: 40 },
        { h: 180, val: 40 },
        { h: 190, val: 44 },
        { h: 198, val: 50 },
        { h: 200, val: 58 },
        { h: 220, val: 58 },
        { h: 240, val: 58 },
        { h: 255, val: 55 },
        { h: 266, val: 55 },
        { h: 270, val: 58 },
        { h: 280, val: 58 },
        { h: 290, val: 47 },
        { h: 300, val: 43 },
        { h: 310, val: 48 },
        { h: 320, val: 48 },
        { h: 340, val: 52 },
        { h: 360, val: 53 },
      ],
    },

    // Changes added to the color of the currently selected plane
    selected: { h: 0, s: 10, l: 5 },

    // Changes added to the color of planes that have stale position info
    stale: { h: 0, s: -35, l: 9 },

    // Changes added to the color of planes that have positions from mlat
    mlat: { h: 0, s: 0, l: 0 },
  },

  altitudeColor: function (altitude: any) {
    let h, s, l;

    if (altitude == null) {
      h = this.ColorByAlt.unknown.h;
      s = this.ColorByAlt.unknown.s;
      l = this.ColorByAlt.unknown.l;
    } else if (altitude === "ground") {
      h = this.ColorByAlt.ground.h;
      s = this.ColorByAlt.ground.s;
      l = this.ColorByAlt.ground.l;
    } else {
      s = this.ColorByAlt.air.s;

      // find the pair of points the current altitude lies between,
      // and interpolate the hue between those points
      let hpoints = this.ColorByAlt.air.h;
      h = hpoints[0].val;
      for (let i = hpoints.length - 1; i >= 0; --i) {
        if (altitude > hpoints[i].alt) {
          if (i == hpoints.length - 1) {
            h = hpoints[i].val;
          } else {
            h =
              hpoints[i].val +
              ((hpoints[i + 1].val - hpoints[i].val) *
                (altitude - hpoints[i].alt)) /
                (hpoints[i + 1].alt - hpoints[i].alt);
          }
          break;
        }
      }
      let lpoints = this.ColorByAlt.air.l;
      // @ts-expect-error
      lpoints = lpoints.length ? lpoints : [{ h: 0, val: lpoints }];
      l = lpoints[0].val;
      for (let i = lpoints.length - 1; i >= 0; --i) {
        if (h > lpoints[i].h) {
          if (i == lpoints.length - 1) {
            l = lpoints[i].val;
          } else {
            l =
              lpoints[i].val +
              ((lpoints[i + 1].val - lpoints[i].val) * (h - lpoints[i].h)) /
                (lpoints[i + 1].h - lpoints[i].h);
          }
          break;
        }
      }
    }
    if (this.darkerColors) {
      l *= 0.8;
      s *= 0.7;
    }

    if (h < 0) {
      h = (h % 360) + 360;
    } else if (h >= 360) {
      h = h % 360;
    }

    if (s < 0) s = 0;
    else if (s > 95) s = 95;

    if (l < 0) l = 0;
    else if (l > 95) l = 95;

    return { h: h, s: s, l: l };
  },

  set_targets: function (adsb_targets: adsb) {
    if (this.adsb_planes == null || this.adsb_planes.now < adsb_targets.now) {
      this.adsb_planes = adsb_targets;
      if (this.live_map_page_active) this.update_targets();
    }
  },

  live_map: function (lat_in: number, lon_in: number) {
    this.lat = lat_in;
    this.lon = lon_in;
    if (this.live_map_page_active) this.map.setView([this.lat, this.lon], 8);
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
          const hsl = this.altitudeColor(alt);
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
          let plane_icon = L.divIcon({
            className: "airplane",
            html: `<div><div style="fill: hsl(${hsl.h}, ${hsl.s}%, ${
              hsl.l
            }%); width: 30px; height: 30px; -webkit-transform:rotate(${rotate}deg); -moz-transform: rotate(${rotate}deg); -ms-transform: rotate(${rotate}deg); -o-transform: rotate(${rotate}deg); transform: rotate(${rotate}deg);">${
              num_messages ? images.airplane_matched_icon : images.airplane_icon
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
  },

  updateModalSize: function (new_window_size: window_size) {
    this.plane_message_modal.setHeight(
      new_window_size.height > 500 ? 500 : 400
    );
    this.plane_message_modal.setWidth(new_window_size.width > 500 ? 500 : 350);
    resize_tabs(new_window_size.width > 500 ? 465 : 310, false);
    $(".show_when_small").css("display", `inline-block`);
    $(".show_when_big").css("display", "none");
  },

  live_map_active: function (state = false) {
    this.live_map_page_active = state;
    if (this.live_map_page_active) {
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
    }

    this.update_targets();
  },

  set_live_map_page_urls: function (documentPath: string, documentUrl: string) {
    this.livemap_acars_path = documentPath;
    this.livemap_acars_url = documentUrl;
  },

  set_html: function () {
    $("#modal_text").html("");
    $("#page_name").html("");
    $("#log").html('<div id="mapid"></div>');
  },

  destroy_maps: function () {
    this.map = (<unknown>null) as L.Map;
    this.layerGroup = (<unknown>null) as L.LayerGroup;
    this.adsb_planes = (<unknown>null) as adsb;
  },
};
