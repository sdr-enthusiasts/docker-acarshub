import * as L from "leaflet";
import {
  acars_msg,
  adsb_plane,
  window_size,
  adsb,
  aircraft_icon,
  adsb_target,
} from "./interfaces";
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
import { tooltip } from "./tooltips.js";
import { images } from "./images.js";

export let live_map_page = {
  livemap_acars_path: "" as string,
  livemap_acars_url: "" as string,
  adsb_enabled: false as boolean,
  live_map_page_active: false as boolean,
  adsb_planes: {} as { [key: string]: adsb_target },
  last_updated: 0 as number,
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
  current_sort: "callsign" as string,
  ascending: true as boolean,
  window_size: (<unknown>null) as window_size,
  show_only_acars: false as boolean,

  toggle_acars_only: function () {
    this.show_only_acars = !this.show_only_acars;

    if (this.live_map_page_active) {
      $("#toggle_acars").html(
        `${
          !this.show_only_acars
            ? images.toggle_acars_only_show_acars
            : images.toggle_acars_only_show_all
        }`
      );
      this.update_targets();
      this.airplaneList();
    }
  },

  set_targets: function (adsb_targets: adsb) {
    if (this.adsb_planes == null || this.last_updated < adsb_targets.now) {
      this.last_updated = adsb_targets.now;
      // Loop through all of the planes in the new data and save them to the target object
      adsb_targets.aircraft.forEach((aircraft) => {
        if (this.adsb_planes[aircraft.hex] == undefined) {
          this.adsb_planes[aircraft.hex] = {
            position: aircraft,
            last_updated: this.last_updated,
            id: aircraft.hex,
          };
        } else {
          this.adsb_planes[aircraft.hex].position = aircraft;
          this.adsb_planes[aircraft.hex].last_updated = this.last_updated;
        }
      });
      // Now loop through the target object and expire any that are no longer there
      for (let plane in this.adsb_planes) {
        if (this.adsb_planes[plane].last_updated < this.last_updated) {
          delete this.adsb_planes[plane];
        }
      }
      if (this.live_map_page_active) {
        this.update_targets();
        this.airplaneList();
      }
    }
  },

  live_map: function (lat_in: number, lon_in: number) {
    this.lat = lat_in;
    this.lon = lon_in;
    if (this.live_map_page_active && this.adsb_enabled)
      this.map.setView([this.lat, this.lon], 8);
  },

  setSort: function (sort: string = "") {
    if (sort === "") return;
    if (sort === this.current_sort) this.ascending = !this.ascending;
    else if (sort === "msgs" || sort === "code") this.ascending = false;
    // two special cases where we want the default sort to be reversed
    else this.ascending = true;
    this.current_sort = sort;
    this.airplaneList();
  },

  airplaneList: function () {
    let html: string = `<div class="plane_list"><div class="plane_element" id="num_planes" style="width: 50%"></div><div class="plane_element" id="num_planes_targets" style="width: 50%"></div></div>
                        <div class="plane_list" style="font-weight: bold;border-bottom: 1px solid black;">
                        <div class="plane_element plane_header"><a href="javascript:setSort('callsign')">Callsign</a></div>
                        <div class="plane_element plane_header" style="width: 18%; border-left: 2px solid var(--grey-highlight)"><a href="javascript:setSort('alt')">Alt</a></div>
                        <div class="plane_element plane_header" style="width: 15%; border-left: 2px solid var(--grey-highlight)"><a href="javascript:setSort('code')">Code</a></div>
                        <div class="plane_element plane_header" style="width: 18%; border-left: 2px solid var(--grey-highlight)"><a href="javascript:setSort('speed')">Speed</a></div>
                        <div class="plane_element plane_header" style="width: 10%; border-left: 2px solid var(--grey-highlight)"><a href="javascript:setSort('msgs')">Msgs</a></div></div>`;
    const plane_data = find_matches();
    let num_planes = 0;
    let num_planes_targets = 0;
    let sorted = Object.values(this.adsb_planes).sort((a, b) => {
      let pos_a: number | string = a.position.flight
        ? a.position.flight.trim()
        : a.position.r || a.position.hex.toUpperCase();
      let pos_b: number | string = b.position.flight
        ? b.position.flight.trim()
        : b.position.r || b.position.hex.toUpperCase();
      if (this.current_sort === "alt") {
        pos_a = a.position.alt_baro || 0;
        pos_b = b.position.alt_baro || 0;

        if (this.ascending) {
          return pos_a - pos_b;
        } else {
          return pos_b - pos_a;
        }
      } else if (this.current_sort === "code") {
        pos_a = a.position.squawk || 0;
        pos_b = b.position.squawk || 0;

        if (this.ascending) {
          return pos_a - pos_b;
        } else {
          return pos_b - pos_a;
        }
      } else if (this.current_sort === "speed") {
        pos_a = a.position.gs || 0;
        pos_b = b.position.gs || 0;
        if (this.ascending) {
          return pos_a - pos_b;
        } else {
          return pos_b - pos_a;
        }
      } else if (this.current_sort === "msgs") {
        pos_a = 0;
        pos_b = 0;

        const callsign_a = a.position.flight
          ? a.position.flight.trim()
          : a.position.r || a.position.hex.toUpperCase();
        const tail_a: string = a.position.r || <any>undefined;

        const callsign_b = b.position.flight
          ? b.position.flight.trim()
          : b.position.r || b.position.hex.toUpperCase();
        const tail_b: string = b.position.r || <any>undefined;

        if (plane_data[a.position.hex]) {
          pos_a = plane_data[a.position.hex].id;
        }
        if (pos_a == undefined && plane_data[callsign_a]) {
          pos_a = plane_data[callsign_a].id;
        }
        if (pos_a == 0 && tail_a != undefined && plane_data[tail_a]) {
          pos_a = plane_data[tail_a].id;
        }

        if (plane_data[b.position.hex]) {
          pos_b = plane_data[b.position.hex].id;
        }
        if (pos_b == 0 && plane_data[callsign_b]) {
          pos_b = plane_data[callsign_b].id;
        }
        if (pos_b == 0 && tail_b != undefined && plane_data[tail_b]) {
          pos_b = plane_data[tail_b].id;
        }

        if (this.ascending) {
          return pos_a - pos_b;
        } else {
          return pos_b - pos_a;
        }
      } else {
        if (this.ascending) {
          if (pos_a < pos_b) {
            return -1;
          } else {
            return 1;
          }
        } else {
          if (pos_b < pos_a) {
            return -1;
          } else {
            return 1;
          }
        }
      }
    });

    // add data to the table
    for (const plane in sorted) {
      const current_plane = sorted[plane].position;
      num_planes++;
      if (current_plane.lat) num_planes_targets++;
      const alt = current_plane.alt_baro || 0;
      const speed = current_plane.gs || 0;
      const squawk = current_plane.squawk || 0;
      const callsign = current_plane.flight
        ? current_plane.flight.trim()
        : current_plane.r || current_plane.hex.toUpperCase();
      const hex = current_plane.hex;
      const tail: string = current_plane.r || <any>undefined;
      let num_messages = undefined;
      if (num_messages == undefined && plane_data[hex]) {
        num_messages = plane_data[hex].id;
      }
      if (num_messages == undefined && plane_data[callsign]) {
        num_messages = plane_data[callsign].id;
      }
      if (num_messages == undefined && tail != undefined && plane_data[tail]) {
        num_messages = plane_data[tail].id;
      }
      if (num_messages == undefined) {
        num_messages = 0;
      }

      if (!this.show_only_acars || num_messages) {
        html += `<div id="${callsign}" class="plane_list">
        <div class="plane_element">${
          callsign && num_messages
            ? `<a href="javascript:showPlaneMessages('${callsign}', '${hex}', '${tail}');">${callsign}</a>`
            : callsign || "&nbsp;"
        }</div>
        <div class="plane_element" style="width: 18%; border-left: 2px solid var(--grey-highlight)">${
          alt || "&nbsp;"
        }</div>
        <div class="plane_element" style="width: 15%; border-left: 2px solid var(--grey-highlight)">${
          squawk || "&nbsp;"
        }</div>
        <div class="plane_element" style="width: 18%; border-left: 2px solid var(--grey-highlight)">${
          Math.round(speed) || "&nbsp;"
        }</div>
        <div class="plane_element" style="width: 10%; border-left: 2px solid var(--grey-highlight)">${
          num_messages || "&nbsp;"
        }</div>
        </div>`;
      }
    }
    $("#planes").html(html);
    $("#num_planes").html(`Planes: ${num_planes}`);
    $("#num_planes_targets").html(`Planes w/ Targets: ${num_planes_targets}`);
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

      for (const plane in this.adsb_planes) {
        if (
          this.adsb_planes[plane].position.lat != null &&
          this.adsb_planes[plane].position.lon != null
        ) {
          const current_plane = this.adsb_planes[plane].position;
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
          let icon: aircraft_icon | null =
            this.adsb_planes[plane].icon || <any>undefined;
          let num_messages: number = <any>null; // need to cast this to any for TS to compile.
          let matched_term = <any>undefined;

          if (num_messages == undefined && plane_data[hex]) {
            num_messages = plane_data[hex].id;
            matched_term = hex;
          }
          if (num_messages == undefined && plane_data[callsign]) {
            num_messages = plane_data[callsign].id;
            matched_term = callsign;
          }
          if (
            num_messages == undefined &&
            tail != undefined &&
            plane_data[tail]
          ) {
            num_messages = plane_data[tail].id;
            matched_term = tail;
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
          let color: string = num_messages ? "green" : "var(--blue-highlight)";
          let icon_old = false;

          if (icon != null) {
            if (!icon.svg.includes(color)) {
              icon_old = true;
              console.log("found");
            }
          }

          if (icon == null || icon_old) {
            icon = svgShapeToURI(
              type_shape[0],
              color,
              "black",
              2,
              type_shape[1] * 1.1
            ) as aircraft_icon;
            this.adsb_planes[current_plane.hex].icon = icon;
          }

          if (!this.show_only_acars || num_messages) {
            let plane_icon = L.divIcon({
              className: "airplane",
              html: `<div><div style="-webkit-transform:rotate(${rotate}deg); -moz-transform: rotate(${rotate}deg); -ms-transform: rotate(${rotate}deg); -o-transform: rotate(${rotate}deg); transform: rotate(${rotate}deg);">${icon.svg}</div></div>`,
              iconSize: [icon.width, icon.height],
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
    this.window_size = new_window_size;
    if (new_window_size.width < 700) {
      $("#mapid").css("width", "100%");
      $("#planes").css("display", "none");
    } else {
      $("#mapid").css("width", `${this.window_size.width - 370}px`);
    }
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

  live_map_active: function (state = false, window_size: window_size) {
    this.live_map_page_active = state;
    this.window_size = window_size;
    if (window_size.width < 700) {
      $("#mapid").css("width", "100%");
      $("#planes").css("display", "none");
    } else {
      $("#mapid").css("width", `${this.window_size.width - 370}px`);
    }
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

      L.control
        // @ts-expect-error
        .custom({
          position: "topright",
          content:
            '<button type="button" id="toggle_acars" class="btn btn-default toggle-acars" onclick="toggle_acars_only()">' +
            `    ${
              !this.show_only_acars
                ? images.toggle_acars_only_show_acars
                : images.toggle_acars_only_show_all
            }` +
            "</button>", //+
          // '<button type="button" class="btn btn-info">'+
          // '    <i class="fa fa-compass"></i>'+
          // '</button>'+
          // '<button type="button" class="btn btn-primary">'+
          // '    <i class="fa fa-spinner fa-pulse fa-fw"></i>'+
          // '</button>'+
          // '<button type="button" class="btn btn-danger">'+
          // '    <i class="fa fa-times"></i>'+
          // '</button>'+
          // '<button type="button" class="btn btn-success">'+
          // '    <i class="fa fa-check"></i>'+
          // '</button>'+
          // '<button type="button" class="btn btn-warning">'+
          // '    <i class="fa fa-exclamation-triangle"></i>'+
          // '</button>',
          classes: "btn-group-vertical btn-group-sm",
          style: {
            margin: "10px",
            padding: "0px 0 0 0",
            cursor: "pointer",
          },
          events: {},
        })
        .addTo(this.map);

      this.layerGroup = L.layerGroup().addTo(this.map);

      this.update_targets();
      this.airplaneList();
    }
    tooltip.close_all_tooltips();
    tooltip.attach_all_tooltips();
  },

  set_live_map_page_urls: function (documentPath: string, documentUrl: string) {
    this.livemap_acars_path = documentPath;
    this.livemap_acars_url = documentUrl;
  },

  set_html: function () {
    $("#modal_text").html("");
    $("#page_name").html("");
    if (this.adsb_enabled)
      $("#log").html(
        '<div style="width: 100%; display: inline-block" ><div id="mapid" style="float: left"></div><div id="planes" style="float: right"></div>'
      );
    else $("#log").html("ADSB Disabled");
  },

  destroy_maps: function () {
    this.map = (<unknown>null) as L.Map;
    this.layerGroup = (<unknown>null) as L.LayerGroup;
    this.adsb_planes = {};

    if (this.live_map_page_active) this.set_html();
  },

  is_adsb_enabled: function (
    is_enabled: boolean = false,
    window_size: window_size
  ) {
    this.adsb_enabled = is_enabled;
    if (this.live_map_page_active) {
      this.set_html();

      if (this.live_map_page_active) {
        this.live_map_active(true, window_size);
      }
    }
  },
};
