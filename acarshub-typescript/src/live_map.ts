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
import { window } from "./index.js";

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
  layerGroupPlanes: (<unknown>null) as L.LayerGroup,
  layerGroupPlaneDatablocks: (<unknown>null) as L.LayerGroup,
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
    onClose: () => window.close_live_map_modal(),
  }),
  current_sort: "callsign" as string,
  ascending: true as boolean,
  window_size: (<unknown>null) as window_size,
  show_only_acars: false as boolean,
  show_datablocks: false as boolean,
  show_extended_datablocks: false as boolean,
  current_modal_terms: (<unknown>null) as {
    callsign: string;
    hex: string;
    tail: string;
  },
  current_hovered: "" as string,
  modal_content: "",
  current_scale: 8 as number,

  toggle_acars_only: function () {
    this.show_only_acars = !this.show_only_acars;

    if (this.live_map_page_active) {
      $("#toggle-acars").html(
        `${
          !this.show_only_acars
            ? images.toggle_acars_only_show_acars
            : images.toggle_acars_only_show_all
        }`
      );
      this.redraw_map();
    }
  },

  toggle_datablocks: function () {
    this.show_datablocks = !this.show_datablocks;

    if (this.live_map_page_active) {
      $("#toggle-datablocks").html(
        `${
          this.show_datablocks
            ? images.toggle_datablocks_on
            : images.toggle_datablocks_off
        }`
      );
      this.redraw_map();
    }
  },

  toggle_extended_datablocks: function () {
    this.show_extended_datablocks = !this.show_extended_datablocks;

    if (this.live_map_page_active) {
      $("#toggle-extended-datablocks").html(
        `${
          this.show_extended_datablocks
            ? images.toggle_extended_datablocks_on
            : images.toggle_extended_datablocks_off
        }`
      );
      this.redraw_map();
    }
  },

  redraw_map: function () {
    if (this.live_map_page_active) {
      this.update_targets();
      this.airplaneList();
      tooltip.attach_all_tooltips();

      if (this.current_modal_terms != null) {
        this.showPlaneMessages(
          this.current_modal_terms.callsign,
          this.current_modal_terms.hex,
          this.current_modal_terms.tail
        );
      }
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
        this.redraw_map();
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
    let html: string = `<div class="plane_list_no_hover"><div class="plane_element" id="num_planes" style="width: 50%"></div><div class="plane_element" id="num_planes_targets" style="width: 50%"></div></div>
                        <div class="plane_list_no_hover" style="font-weight: bold;border-bottom: 1px solid black;">
                        <div class="plane_element plane_header"><a href="javascript:setSort('callsign')">Callsign</a></div>
                        <div class="plane_element plane_header" style="width: 21%; border-left: 2px solid black"><a href="javascript:setSort('alt')">Alt</a></div>
                        <div class="plane_element plane_header" style="width: 15%; border-left: 2px solid black"><a href="javascript:setSort('code')">Code</a></div>
                        <div class="plane_element plane_header" style="width: 18%; border-left: 2px solid black"><a href="javascript:setSort('speed')">Speed</a></div>
                        <div class="plane_element plane_header" style="width: 10%; border-left: 2px solid black"><a href="javascript:setSort('msgs')">Msgs</a></div></div>`;
    const plane_data = find_matches();
    let num_planes = 0;
    let num_planes_targets = 0;
    let sorted = Object.values(this.adsb_planes).sort((a, b) => {
      const callsign_a: number | string = a.position.flight
        ? a.position.flight.trim()
        : a.position.r || a.position.hex.toUpperCase();
      const callsign_b: number | string = b.position.flight
        ? b.position.flight.trim()
        : b.position.r || b.position.hex.toUpperCase();
      const alt_a = a.position.alt_baro || 0;
      const alt_b = b.position.alt_baro || 0;
      const squawk_a = a.position.squawk || 0;
      const squawk_b = b.position.squawk || 0;
      const speed_a = a.position.gs || 0;
      const speed_b = b.position.gs || 0;
      const tail_a: string = a.position.r || <any>undefined;
      const tail_b: string = b.position.r || <any>undefined;
      let num_msgs_a = 0;
      let num_msgs_b = 0;

      if (plane_data[a.position.hex]) {
        num_msgs_a = plane_data[a.position.hex].id;
      }
      if (num_msgs_a == undefined && plane_data[callsign_a]) {
        num_msgs_a = plane_data[callsign_a].id;
      }
      if (num_msgs_a == 0 && tail_a != undefined && plane_data[tail_a]) {
        num_msgs_a = plane_data[tail_a].id;
      }

      if (plane_data[b.position.hex]) {
        num_msgs_b = plane_data[b.position.hex].id;
      }
      if (num_msgs_b == 0 && plane_data[callsign_b]) {
        num_msgs_b = plane_data[callsign_b].id;
      }
      if (num_msgs_b == 0 && tail_b != undefined && plane_data[tail_b]) {
        num_msgs_b = plane_data[tail_b].id;
      }
      if (this.current_sort === "alt") {
        if (alt_a == alt_b) {
          if (callsign_a != callsign_b) {
            if (callsign_a < callsign_b) {
              return -1;
            } else {
              return 1;
            }
          }
        }
        if (this.ascending) {
          if (String(alt_a) == "ground" && String(alt_b) != "ground") return -1;
          else if (String(alt_b) == "ground" && String(alt_a) != "ground")
            return 1;
          return alt_a - alt_b;
        } else {
          if (String(alt_a) == "ground" && String(alt_b) != "ground") return 1;
          else if (String(alt_b) == "ground" && String(alt_a) != "ground")
            return -1;
          else if (alt_a == alt_b) {
            if (callsign_a < callsign_b) {
              return -1;
            } else {
              return 1;
            }
          }
          return alt_b - alt_a;
        }
      } else if (this.current_sort === "code") {
        if (squawk_a == squawk_b) {
          if (callsign_a != callsign_b) {
            if (callsign_a < callsign_b) {
              return -1;
            } else {
              return 1;
            }
          }
        }
        if (this.ascending) {
          return squawk_a - squawk_b;
        } else {
          return squawk_b - squawk_a;
        }
      } else if (this.current_sort === "speed") {
        if (speed_a == speed_b) {
          if (callsign_a != callsign_b) {
            if (callsign_a < callsign_b) {
              return -1;
            } else {
              return 1;
            }
          }
        }
        if (this.ascending) {
          return speed_a - speed_b;
        } else {
          return speed_b - speed_a;
        }
      } else if (this.current_sort === "msgs") {
        if (num_msgs_a == num_msgs_b) {
          if (callsign_a != callsign_b) {
            if (callsign_a < callsign_b) {
              return -1;
            } else {
              return 1;
            }
          }
        }
        if (this.ascending) {
          return num_msgs_a - num_msgs_b;
        } else {
          return num_msgs_b - num_msgs_a;
        }
      } else {
        if (this.ascending) {
          if (callsign_a < callsign_b) {
            return -1;
          } else {
            return 1;
          }
        } else {
          if (callsign_b < callsign_a) {
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
      let alt = current_plane.alt_baro
        ? String(current_plane.alt_baro).toUpperCase()
        : 0;
      const speed = current_plane.gs || 0;
      const squawk = current_plane.squawk || 0;
      const callsign = current_plane.flight
        ? current_plane.flight.trim()
        : current_plane.r || current_plane.hex.toUpperCase();
      const hex = current_plane.hex.toUpperCase();
      const tail: string = current_plane.r || <any>undefined;
      const baro_rate = current_plane.baro_rate || 0;
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
        let styles = "";
        if (this.current_hovered == callsign.replace("~", "")) {
          styles = ` style="background-color: black !important; font-weight: bold !important; color: ${
            callsign && num_messages ? "green" : "var(--grey-highlight)"
          } !important"`;
        }
        if (callsign && num_messages && !styles) {
          styles =
            ' style="color: green !important; font-weight: bold !important"';
        }
        html += `<div id="${callsign.replace(
          "~",
          ""
        )}" class="plane_list"${styles}>
        <div class="plane_element">${
          callsign && num_messages
            ? `<a href="javascript:showPlaneMessages('${callsign}', '${hex}', '${tail}');">${callsign}</a>`
            : callsign || "&nbsp;"
        }</div>
        <div class="plane_element" style="height: 100%;width: 21%; border-left: 2px solid black">${
          alt || "&nbsp;"
        }${
          alt && baro_rate > 100 ? '&nbsp;<i class="fas fa-arrow-up"></i>' : ""
        }${
          alt && baro_rate < -100
            ? '&nbsp;<i class="fas fa-arrow-down"></i>'
            : ""
        }</div>
        <div class="plane_element" style="width: 15%; border-left: 2px solid black">${
          squawk || "&nbsp;"
        }</div>
        <div class="plane_element" style="width: 18%; border-left: 2px solid black">${
          Math.round(speed) || "&nbsp;"
        }</div>
        <div class="plane_element" style="width: 10%; border-left: 2px solid black">${
          num_messages || "&nbsp;"
        }</div>
        </div>`;
      }
    }
    $("#planes").html(html);
    // for (const id in plane_callsigns) {
    //   const plane = plane_callsigns[id];
    //   $(`#${plane.replace("~", "")}`).on({
    //     mouseenter: () => {
    //       if (this.current_hovered !== plane.replace("~", "")) {
    //         this.current_hovered = plane.replace("~", "");
    //         this.redraw_map();
    //       }
    //     },
    //     mouseleave: () => {
    //       this.current_hovered = "";
    //       this.redraw_map();
    //     },
    //   });
    // }
    $("#num_planes").html(`Planes: ${num_planes}`);
    $("#num_planes_targets").html(`Planes w/ Targets: ${num_planes_targets}`);
  },

  metersperpixel: function () {
    return (
      (40075016.686 *
        Math.abs(Math.cos((this.map.getCenter().lat * Math.PI) / 180))) /
      Math.pow(2, this.map.getZoom() + 8)
    );
  },

  offset_datablock: function (centerpoint: [number, number]) {
    const mtp = this.metersperpixel();
    const offset_y = 0;
    const offset_x = mtp * 30;

    //Earth’s radius, sphere
    const R = 6378137;

    //Coordinate offsets in radians
    const dLat = offset_y / R;
    const dLon = offset_x / (R * Math.cos((Math.PI * centerpoint[0]) / 180));

    return [
      centerpoint[0] + (dLat * 180) / Math.PI,
      centerpoint[1] + (dLon * 180) / Math.PI,
    ];
  },

  update_targets: function () {
    if (
      typeof this.map !== null &&
      this.layerGroupPlanes !== null &&
      this.adsb_planes !== null
    ) {
      // clear old planes
      this.layerGroupPlanes.clearLayers();
      this.layerGroupPlaneDatablocks.clearLayers();
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

          // TODO: Color is now set in CSS. Remove function calls / values for it
          let color: string = num_messages ? "green" : "var(--blue-highlight)";
          let icon_old = false;

          if (icon != null) {
            if (!icon.svg.includes(color)) {
              icon_old = true;
            }
          }

          if (icon == null || icon_old) {
            const type_shape = getBaseMarker(
              current_plane.category,
              current_plane.t,
              null,
              null,
              current_plane.type,
              alt,
              null
            );

            icon = svgShapeToURI(
              type_shape[0],
              color,
              "black",
              2,
              type_shape[1] * 1.1
            ) as aircraft_icon;
            this.adsb_planes[current_plane.hex].icon = icon;
          }

          const popup_text = `<div style='background:white; padding:1px 3px 1px 3px'>${
            callsign !== hex ? callsign + "/" : ""
          }${hex}<hr>Altitude: ${String(alt).toUpperCase()}${
            String(alt) !== "ground" ? " ft" : ""
          }
          ${
            baro_rate ? "<br>Altitude Rate: " + baro_rate + "fpm" : ""
          }<br>Heading: ${Math.round(rotate)}&deg;${
            speed ? "<br>Speed: " + Math.round(speed) + " knots" : ""
          }${speed ? "<br>Squawk: " + squawk : ""}${
            tail ? "<br>Tail Number: " + tail : ""
          }${ac_type ? "<br>Aircraft Type: " + ac_type : ""}${
            num_messages
              ? "<br><br>Number of ACARS messages: " + num_messages
              : ""
          }</div>`;

          if (!this.show_only_acars || num_messages) {
            let plane_icon = L.divIcon({
              className: "airplane",
              html: `<div><div id="${callsign.replace(
                "~",
                ""
              )}_marker" class="datablock ${
                num_messages ? "airplane_green" : "airplane_blue"
              }" data-jbox-content="${popup_text}" style="-webkit-transform:rotate(${rotate}deg); -moz-transform: rotate(${rotate}deg); -ms-transform: rotate(${rotate}deg); -o-transform: rotate(${rotate}deg); transform: rotate(${rotate}deg);">${
                icon.svg
              }</div></div>`,
              iconSize: [icon.width, icon.height],
            });

            let plane_marker = L.marker(
              [current_plane.lat || 0, current_plane.lon || 0],
              {
                icon: plane_icon,
                riseOnHover: true,
              }
            );

            plane_marker.addTo(this.layerGroupPlanes);
            $(`#${callsign.replace("~", "")}_marker`).on({
              mouseenter: () => {
                if (this.current_hovered !== callsign.replace("~", "")) {
                  this.current_hovered = callsign.replace("~", "");
                  this.airplaneList();
                }
              },
              mouseleave: () => {
                this.current_hovered = "";
                this.airplaneList();
              },
            });

            if (this.show_datablocks) {
              let datablock = `<div class="airplane_datablock">${callsign}`;
              if (this.show_extended_datablocks) {
                datablock += `<br>${alt}`;
                if (ac_type || speed) {
                  datablock += `<br>${ac_type + " " || ""}${Math.round(speed)}`;
                }

                if (num_messages) {
                  datablock += `<br>Msgs: ${num_messages}`;
                }
              }
              datablock += "</div>";
              let datablock_icon = new L.DivIcon({
                className: "airplane",
                html: datablock,
                //iconSize: [80, 80],
              });
              let datablock_marker = new L.Marker(
                this.offset_datablock([
                  current_plane.lat || 0,
                  current_plane.lon || 0,
                ]) as L.LatLngTuple,
                { icon: datablock_icon }
              );
              datablock_marker.addTo(this.layerGroupPlaneDatablocks);
            }

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
    this.current_modal_terms = {
      callsign: plane_callsign,
      hex: plane_hex,
      tail: plane_tail,
    };
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
    if (this.modal_content !== html) {
      this.modal_content = html;
      this.plane_message_modal.setContent(html);
    }
    this.plane_message_modal.setTitle(`Messages for ${plane_callsign}`);
    const window_size: window_size = get_window_size();
    this.plane_message_modal.setHeight(window_size.height > 500 ? 500 : 400);
    this.plane_message_modal.setWidth(window_size.width > 500 ? 500 : 350);
    this.plane_message_modal.open();
    resize_tabs(window_size.width > 500 ? 465 : 310, false);
    $(".show_when_small").css("display", `inline-block`);
    $(".show_when_big").css("display", "none");
    $(".dont_show").css("display", "none");
    tooltip.attach_all_tooltips();
  },

  close_live_map_modal: function () {
    this.current_modal_terms = (<unknown>null) as {
      callsign: string;
      hex: string;
      tail: string;
    };
    this.modal_content = "";
  },

  updateModalSize: function (new_window_size: window_size) {
    this.window_size = new_window_size;
    if (this.map) {
      this.map.invalidateSize();
    }
    if (new_window_size.width < 700) {
      $("#mapid").css("width", "100%");
      $("#planes").css("display", "none");
    } else {
      $("#mapid").css("width", `${this.window_size.width - 370}px`);
      $("#planes").css("display", "inline-block");
    }
    this.plane_message_modal.setHeight(
      new_window_size.height > 500 ? 500 : 400
    );
    this.plane_message_modal.setWidth(new_window_size.width > 500 ? 500 : 350);
    resize_tabs(new_window_size.width > 500 ? 465 : 310, false);
    $(".show_when_small").css("display", `inline-block`);
    $(".show_when_big").css("display", "none");
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
      $("#planes").css("display", "none");
    }
    if (this.live_map_page_active && this.adsb_enabled) {
      this.set_html();
      this.map = L.map("mapid", {
        zoomDelta: 0.2,
        center: [this.lat, this.lon],
        zoom: this.current_scale,
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
            '<button type="button" id="toggle-acars" class="btn btn-default toggle-acars" onclick="toggle_acars_only()">' +
            `    ${
              !this.show_only_acars
                ? images.toggle_acars_only_show_acars
                : images.toggle_acars_only_show_all
            }` +
            "</button>" +
            '<button type="button" id="toggle-datablocks" class="btn btn-info toggle-datablocks" onclick="toggle_datablocks()">' +
            `    ${
              this.show_datablocks
                ? images.toggle_datablocks_on
                : images.toggle_datablocks_off
            }` +
            "</button>" +
            '<button type="button" id="toggle-extended-datablocks" class="btn btn-primary toggle-extended-datablocks" onclick="toggle_extended_datablocks()">' +
            `    ${
              this.show_extended_datablocks
                ? images.toggle_extended_datablocks_on
                : images.toggle_extended_datablocks_off
            }` +
            "</button>", //+
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

      L.control
        // @ts-expect-error
        .Legend({
          position: "bottomleft",
          symbolWidth: 45,
          symbolHeight: 45,
          opacity: 0.6,
          legends: [
            {
              label: "Planes With ACARS Messages",
              type: "image",
              url: "static/images/legend-has-acars.svg",
            },
            {
              label: "Planes Without ACARS Messages",
              type: "image",
              url: "static/images/legend-without-acars.svg",
            },
          ],
        })
        .addTo(this.map);

      this.layerGroupPlanes = L.layerGroup().addTo(this.map);
      this.layerGroupPlaneDatablocks = L.layerGroup().addTo(this.map);

      this.map.on({
        zoom: () => {
          console.log("yo");
          this.current_scale = this.map.getZoom();
          this.redraw_map();
        },
        move: () => {
          const center = this.map.getCenter();
          this.lat = center.lat;
          this.lon = center.lng;
        },
      });

      this.redraw_map();
    }
    tooltip.cycle_tooltip();
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
    this.layerGroupPlanes = (<unknown>null) as L.LayerGroup;
    this.layerGroupPlaneDatablocks = (<unknown>null) as L.LayerGroup;
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
