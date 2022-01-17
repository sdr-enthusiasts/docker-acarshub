import * as LeafLet from "leaflet";
import "./js-other/SmoothWheelZoom";
import "./js-other/leaftlet.legend";
import "./js-other/Leaflet.Control.Custom";
import Cookies from "js-cookie";
import {
  acars_msg,
  window_size,
  adsb,
  aircraft_icon,
  adsb_target,
  plane_data,
  svg_icon,
  adsb_plane,
  plane_match,
  plane_num_msgs_and_alert,
  MapOptionsWithNewConfig,
} from "./interfaces";
import jBox from "jbox";
import { display_messages } from "./html_generator";
import { getBaseMarker, svgShapeToURI } from "./js-other/aircraft_icons";
import {
  resize_tabs,
  showPlaneMessages,
  find_matches,
  get_match,
  get_window_size,
  //setScrollers,
} from "./index";
import { tooltip } from "./tooltips";
import { images } from "./assets";
declare const window: any;
export let live_map_page = {
  livemap_acars_path: "" as string,
  livemap_acars_url: "" as string,
  adsb_enabled: false as boolean,
  live_map_page_active: false as boolean,
  adsb_planes: {} as { [key: string]: adsb_target },
  adsb_plane_tails: [] as Array<string>,
  adsb_plane_hex: [] as Array<string>,
  adsb_plane_callsign: [] as Array<string>,
  had_targets: false as boolean,
  last_updated: 0 as number,
  map: (<unknown>null) as LeafLet.Map,
  map_controls: (<unknown>null) as LeafLet.Control,
  legend: (<unknown>null) as LeafLet.Control,
  layerGroupPlanes: (<unknown>null) as LeafLet.LayerGroup,
  layerGroupPlaneDatablocks: (<unknown>null) as LeafLet.LayerGroup,
  layerGroupRangeRings: (<unknown>null) as LeafLet.LayerGroup,
  lat: 0 as number,
  lon: 0 as number,
  station_lat: 0 as number,
  station_lon: 0 as number,
  ignored_keys: ["trk", "alt", "call"] as string[],
  plane_message_modal: new jBox("Modal", {
    id: "set_modal",
    width: 350,
    height: 400,
    blockScroll: false,
    isolateScroll: true,
    animation: "zoomIn",
    draggable: "title",
    closeButton: "box",
    overlay: false,
    reposition: true,
    repositionOnOpen: false,
    title: "Messages",
    content: "",
    onClose: () => window.close_live_map_modal(),
  }),
  current_sort: Cookies.get("current_sort") || ("callsign" as string),
  ascending: true as boolean,
  window_size: (<unknown>null) as window_size,
  show_only_acars: false as boolean,
  show_datablocks: false as boolean,
  show_extended_datablocks: false as boolean,
  show_unread_messages: true as boolean,
  current_modal_terms: (<unknown>null) as {
    callsign: string;
    hex: string;
    tail: string;
  },
  current_hovered_from_map: "" as string,
  current_hovered_from_sidebar: "" as string,
  modal_content: "" as string,
  modal_current_tab: "" as string,
  current_scale: Number(Cookies.get("live_map_zoom")) || (8 as number),

  get_cookie_value: function (): void {
    this.show_only_acars = Cookies.get("only_acars") == "true" ? true : false;
    this.show_datablocks =
      Cookies.get("show_datablocks") == "true" ? true : false;
    this.show_extended_datablocks =
      Cookies.get("show_extended_datablocks") == "true" ? true : false;
    this.current_sort = Cookies.get("current_sort") || "callsign";
    this.ascending =
      !Cookies.get("sort_direction") || Cookies.get("sort_direction") == "true"
        ? true
        : false;
    this.show_unread_messages =
      !Cookies.get("show_unread_messages") ||
      Cookies.get("show_unread_messages") == "true"
        ? true
        : false;
  },

  toggle_unread_messages: function (): void {
    this.show_unread_messages = !this.show_unread_messages;
    Cookies.set("show_unread_messages", String(this.show_unread_messages), {
      expires: 365,
      sameSite: "Strict",
    });
    this.redraw_map();
    this.set_controls();
  },

  toggle_acars_only: function (): void {
    this.show_only_acars = !this.show_only_acars;
    Cookies.set("only_acars", String(this.show_only_acars), {
      expires: 365,
      sameSite: "Strict",
    });

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

  toggle_datablocks: function (): void {
    this.show_datablocks = !this.show_datablocks;

    Cookies.set("show_datablocks", String(this.show_datablocks), {
      expires: 365,
      sameSite: "Strict",
    });

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

  toggle_extended_datablocks: function (): void {
    this.show_extended_datablocks = !this.show_extended_datablocks;

    Cookies.set(
      "show_extended_datablocks",
      String(this.show_extended_datablocks),
      {
        expires: 365,
        sameSite: "Strict",
      }
    );

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

  redraw_map: function (): void {
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

  set_targets: function (adsb_targets: adsb): void {
    if (this.last_updated < adsb_targets.now) {
      this.last_updated = adsb_targets.now;
      this.adsb_plane_hex = [];
      this.adsb_plane_callsign = [];
      this.adsb_plane_tails = [];
      // Loop through all of the planes in the new data and save them to the target object
      adsb_targets.aircraft.forEach((aircraft) => {
        this.adsb_plane_hex.push(this.get_hex(aircraft));
        this.adsb_plane_callsign.push(this.get_callsign(aircraft));
        this.adsb_plane_tails.push(this.get_tail(aircraft));
        if (this.adsb_planes[aircraft.hex] == undefined) {
          this.adsb_planes[aircraft.hex] = {
            position: aircraft,
            last_updated: this.last_updated,
            id: aircraft.hex,
            num_messages: 0,
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
      if (!this.had_targets) this.mark_all_messages_read();
      if (this.live_map_page_active) {
        this.redraw_map();
      }
      this.had_targets = true;
    }
  },

  live_map: function (lat_in: number, lon_in: number): void {
    this.lat = lat_in;
    this.lon = lon_in;
    this.station_lat = this.lat;
    this.station_lon = this.lon;
    if (this.live_map_page_active && this.adsb_enabled) {
      this.map.setView([this.lat, this.lon]);
      this.set_range_markers();
    }
  },

  set_range_markers: function (): void {
    if (this.layerGroupRangeRings == null)
      this.layerGroupRangeRings = L.layerGroup();
    this.layerGroupRangeRings.clearLayers();
    const nautical_miles_to_meters = 1852;
    const ring_radius = [
      10 * nautical_miles_to_meters,
      50 * nautical_miles_to_meters,
      100 * nautical_miles_to_meters,
      150 * nautical_miles_to_meters,
      200 * nautical_miles_to_meters,
    ];

    ring_radius.forEach((radius) => {
      LeafLet.circle([this.station_lat, this.station_lon], {
        radius: radius,
        fill: false,
        interactive: false,
        weight: 2,
        color: "hsl(0, 0%, 0%)",
      }).addTo(this.layerGroupRangeRings);
    });

    this.map.addLayer(this.layerGroupRangeRings);
  },

  setSort: function (sort: string = ""): void {
    if (sort === "") return;
    if (sort === this.current_sort) this.ascending = !this.ascending;
    else if (sort === "msgs" || sort === "alerts") this.ascending = false;
    // two special cases where we want the default sort to be reversed
    else this.ascending = true;
    this.current_sort = sort;

    Cookies.set("current_sort", String(this.current_sort), {
      expires: 365,
      sameSite: "Strict",
    });

    Cookies.set("sort_direction", String(this.ascending), {
      expires: 365,
      sameSite: "Strict",
    });

    this.airplaneList();
  },

  match_plane: function (
    plane_data: plane_data,
    callsign: string,
    tail: string,
    hex: string
  ): plane_num_msgs_and_alert {
    let num_messages: number = <any>undefined;
    let alert: boolean = false;
    let num_alerts: number = <any>undefined;

    if (num_messages == undefined && plane_data[hex.toUpperCase()]) {
      num_messages = plane_data[hex.toUpperCase()].count;
      alert = plane_data[hex.toUpperCase()].has_alerts;
      num_alerts = plane_data[hex.toUpperCase()].num_alerts;
    }
    if (num_messages == undefined && plane_data[callsign]) {
      num_messages = plane_data[callsign].count;
      alert = plane_data[callsign].has_alerts;
      num_alerts = plane_data[callsign].num_alerts;
    }
    if (num_messages == undefined && plane_data[callsign.replace("-", "")]) {
      num_messages = plane_data[callsign.replace("-", "")].count;
      alert = plane_data[callsign.replace("-", "")].has_alerts;
      num_alerts = plane_data[callsign.replace("-", "")].num_alerts;
    }
    if (num_messages == undefined && tail != undefined && plane_data[tail]) {
      num_messages = plane_data[tail].count;
      alert = plane_data[tail].has_alerts;
      num_alerts = plane_data[tail].num_alerts;
    }
    if (
      num_messages == undefined &&
      tail != undefined &&
      plane_data[tail.replace("-", "")]
    ) {
      num_messages = plane_data[tail.replace("-", "")].count;
      alert = plane_data[tail.replace("-", "")].has_alerts;
      num_alerts = plane_data[tail.replace("-", "")].num_alerts;
    }

    return {
      num_messages: num_messages || 0,
      has_alerts: alert,
      num_alerts: num_alerts || 0,
    };
  },

  sort_list: function (plane_data: plane_data): adsb_target[] {
    return Object.values(this.adsb_planes).sort((a, b) => {
      const callsign_a: string = this.get_callsign(a.position);
      const callsign_b: string = this.get_callsign(b.position);
      const alt_a: number | string = this.get_alt(a.position);
      const alt_b: number | string = this.get_alt(b.position);
      const speed_a: number = this.get_speed(a.position);
      const speed_b: number = this.get_speed(b.position);
      const tail_a: string = this.get_tail(a.position);
      const tail_b: string = this.get_tail(b.position);
      const hex_a = this.get_hex(a.position);
      const hex_b = this.get_hex(b.position);
      const details_a = this.match_plane(plane_data, callsign_a, tail_a, hex_a);
      const details_b = this.match_plane(plane_data, callsign_b, tail_b, hex_b);
      const num_msgs_a = details_a.num_messages;
      const num_msgs_b = details_b.num_messages;
      const has_alerts_a = details_a.num_alerts;
      const has_alerts_b = details_b.num_alerts;

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
          if (String(alt_a) == "GROUND" && String(alt_b) != "GROUND") return -1;
          else if (String(alt_b) == "ground" && String(alt_a) != "GROUND")
            return 1;
          return Number(alt_a) - Number(alt_b);
        } else {
          if (String(alt_a) == "GROUND" && String(alt_b) != "GROUND") return 1;
          else if (String(alt_b) == "GROUND" && String(alt_a) != "GROUND")
            return -1;
          else if (alt_a == alt_b) {
            if (callsign_a < callsign_b) {
              return -1;
            } else {
              return 1;
            }
          }
          return Number(alt_b) - Number(alt_a);
        }
      } else if (this.current_sort === "alerts") {
        if (has_alerts_a == has_alerts_b) {
          if (callsign_a != callsign_b) {
            if (callsign_a < callsign_b) {
              return -1;
            } else {
              return 1;
            }
          }
        }
        if (this.ascending) {
          return has_alerts_a - has_alerts_b;
        } else {
          return has_alerts_b - has_alerts_a;
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
  },

  get_callsign: function (plane: adsb_plane): string {
    return plane.flight && plane.flight.trim() !== ""
      ? plane.flight.trim()
      : plane.r && plane.r !== ""
      ? plane.r
      : plane.hex.toUpperCase();
  },

  get_sqwk: function (plane: adsb_plane): number {
    return plane.squawk || 0;
  },

  get_alt: function (plane: adsb_plane): string | number {
    return plane.alt_baro ? String(plane.alt_baro).toUpperCase() : 0;
  },

  get_speed: function (plane: adsb_plane): number {
    return plane.gs ? plane.gs : 0;
  },

  get_tail: function (plane: adsb_plane): string {
    return plane.r ? plane.r : <any>undefined;
  },

  get_hex: function (plane: adsb_plane): string {
    return plane.hex ? plane.hex.toUpperCase() : <any>undefined;
  },

  get_baro_rate: function (plane: adsb_plane): number {
    return plane.baro_rate ? plane.baro_rate : 0;
  },

  get_heading: function (plane: adsb_plane): number {
    return plane.track || 0;
  },

  get_ac_type: function (plane: adsb_plane): string {
    return plane.t || <any>undefined;
  },

  get_icon: function (plane: string): aircraft_icon | null {
    return this.adsb_planes[plane].icon || <any>undefined;
  },

  get_lat: function (plane: adsb_plane): number {
    return plane.lat || 0;
  },

  get_lon: function (plane: adsb_plane): number {
    return plane.lon || 0;
  },

  set_old_messages: function (plane: string, new_messages: number) {
    this.adsb_planes[plane].num_messages = new_messages;
  },

  get_old_messages: function (plane: string): number {
    return this.adsb_planes[plane].num_messages;
  },

  get_current_planes: function (): {
    callsigns: Array<string>;
    hex: Array<string>;
    tail: Array<string>;
  } {
    return {
      callsigns: this.adsb_plane_callsign,
      hex: this.adsb_plane_hex,
      tail: this.adsb_plane_tails,
    };
  },

  airplaneList: function (): void {
    const plane_data = find_matches();
    let num_planes = 0;
    let num_planes_targets = 0;
    let sorted = this.sort_list(plane_data);
    let plane_callsigns = [];
    let acars_planes = 0;
    let acars_message_count = 0;
    const alt_width = 20;
    const alert_width = 15;
    const speed_width = 16;
    const msgs_width = 21;
    const callsign_width = 23;
    //const callsign_width = 100 - alt_width - code_width - speed_width - msgs_width;
    let html: string = "";
    // add data to the table
    for (const plane in sorted) {
      const current_plane = sorted[plane].position;
      num_planes++;
      if (current_plane.lat) num_planes_targets++;
      const alt = this.get_alt(current_plane);
      const speed = this.get_speed(current_plane);
      const squawk = this.get_sqwk(current_plane);
      const callsign = this.get_callsign(current_plane);
      const hex = this.get_hex(current_plane);
      plane_callsigns.push({ callsign: callsign, hex: hex });
      const tail: string = this.get_tail(current_plane);
      const baro_rate = this.get_baro_rate(current_plane);
      const details = this.match_plane(plane_data, callsign, tail, hex);
      const num_messages = details.num_messages;
      const num_alerts = details.num_alerts;
      const old_messages = this.get_old_messages(hex.toLowerCase());
      let has_new_messages: boolean = false;

      if (num_messages) {
        acars_planes++;
        acars_message_count += num_messages;

        if (old_messages > num_messages) {
          console.error(
            "OLD MESSAGES WAS LARGER THAN TOTAL MESSAGE COUNT: " + callsign,
            hex,
            tail,
            num_messages,
            old_messages
          );
          this.set_old_messages(hex.toLowerCase(), num_messages);
        } else if (num_messages !== old_messages) {
          has_new_messages = true;
        }
      }

      if (!this.show_only_acars || num_messages) {
        let styles = "";
        if (
          this.current_hovered_from_map !== "" &&
          this.current_hovered_from_map ==
            callsign.replace("~", "").replace(".", "") &&
          callsign &&
          num_messages
        ) {
          if (!num_alerts) styles = " sidebar_hovered_from_map_acars";
          else styles = " sidebar_hovered_from_map_with_unread";
        } else if (
          this.current_hovered_from_map ==
            callsign.replace("~", "").replace(".", "") &&
          !num_alerts
        ) {
          styles = " sidebar_hovered_from_map_no_acars";
        } else if (
          num_alerts &&
          this.current_hovered_from_map ==
            callsign.replace("~", "").replace(".", "")
        ) {
          styles = has_new_messages
            ? " sidebar_alert_unread_hovered_from_map"
            : " sidebar_alert_unread_hovered_from_map";
        } else if (num_alerts) {
          styles = has_new_messages
            ? " sidebar_alert_unread"
            : " sidebar_alert_read";
        } else if (callsign && num_messages && styles == "") {
          if (!has_new_messages) styles = " sidebar_no_hover_with_acars";
          else styles = " sidebar_no_hover_with_unread";
        }
        html += `<div id="${callsign
          .replace("~", "")
          .replace(".", "")}" class="plane_list${styles}">
        <div class="plane_element noleft" style="width:${callsign_width}%">${
          callsign && num_messages
            ? `<a href="javascript:showPlaneMessages('${callsign}', '${hex}', '${tail}');">${callsign}</a>`
            : callsign || "&nbsp;"
        }</div>
        <div class="plane_element" style="width: ${alt_width}%;">${
          alt || "&nbsp;"
        }${
          alt && alt !== "GROUND" && baro_rate > 100
            ? '&nbsp;<i class="fas fa-arrow-up"></i>'
            : ""
        }${
          alt && alt !== "GROUND" && baro_rate < -100
            ? '&nbsp;<i class="fas fa-arrow-down"></i>'
            : ""
        }</div>
        <div class="plane_element" style="width: ${speed_width}%;">${
          Math.round(speed) || "&nbsp;"
        }</div>
        <div class="plane_element" style="width: ${alert_width}%;">${
          num_alerts || "&nbsp;"
        }</div>
        <div class="plane_element" style="width: ${msgs_width}%;">${
          this.show_unread_messages && num_messages
            ? num_messages - old_messages + " / "
            : ""
        }${num_messages || "&nbsp;"}</div></div>`;
      }
    }
    html =
      `<div class="plane_list_no_hover" style="color: var(--blue-highlight) !important;background-color: var(--grey-bg)"><div class="plane_element noleft" id="num_planes" style="width: 50%"></div><div class="plane_element noleft" id="num_planes_targets" style="width: 50%"></div></div>
    <div class="plane_list_no_hover" style="color: var(--blue-highlight) !important;background-color: var(--grey-bg)"><div class="plane_element noleft" id="num_acars_planes" style="vertical-align: text-top;width: 100%">Planes with ACARS Msgs: ${acars_planes}<br>Total ACARS Messages: ${acars_message_count}</div></div>
    <div class="plane_list_no_hover" style="font-weight: bold;border-bottom: 1px solid black;color: var(--blue-highlight) !important;background-color: var(--grey-bg)">
    <div class="plane_element plane_header noleft" style="width: ${callsign_width}%"><a href="javascript:setSort('callsign')">Callsign</a></div>
    <div class="plane_element plane_header" style="width: ${alt_width}%;"><a href="javascript:setSort('alt')">Alt</a></div>
    <div class="plane_element plane_header" style="width: ${speed_width}%;"><a href="javascript:setSort('speed')">Speed</a></div>
    <div class="plane_element plane_header" style="width: ${alert_width}%;"><a href="javascript:setSort('alerts')">Alert</a></div>
    <div class="plane_element plane_header" style="width: ${msgs_width}%;"><a href="javascript:setSort('msgs')">Msgs</a></div></div>` +
      html;
    $("#planes").html(html);
    for (const id in plane_callsigns) {
      const plane_list = plane_callsigns[id].callsign;
      const hex_list = plane_callsigns[id].hex;
      if (plane_list && hex_list) {
        const current_plane =
          this.adsb_planes[hex_list.toLowerCase()] !== undefined &&
          this.adsb_planes[hex_list.toLowerCase()].position !== undefined
            ? this.adsb_planes[hex_list.toLowerCase()].position
            : null;
        if (
          current_plane !== null &&
          current_plane.lat != null &&
          current_plane.lon != null
        ) {
          const callsign = this.get_callsign(current_plane);
          const hex = this.get_hex(current_plane);
          const tail = this.get_tail(current_plane);
          const details = this.match_plane(plane_data, callsign, tail, hex);
          const num_messages = details.num_messages;
          const old_messages = this.get_old_messages(hex.toLowerCase());
          const alert = details.has_alerts;
          const squawk = this.get_sqwk(current_plane);

          $(`#${callsign.replace("~", "").replace(".", "")}`).on({
            mouseenter: () => {
              if (
                this.current_hovered_from_sidebar !==
                hex.replace("~", "").replace(".", "")
              ) {
                this.current_hovered_from_sidebar = hex
                  .replace("~", "")
                  .replace(".", "");
                $(
                  `#${callsign.replace("~", "").replace(".", "")}_marker`
                ).removeClass(
                  this.find_plane_color(
                    callsign,
                    alert,
                    num_messages,
                    squawk,
                    old_messages,
                    hex,
                    tail
                  )
                );
                $(
                  `#${callsign.replace("~", "").replace(".", "")}_marker`
                ).addClass("airplane_orange");
              }
            },
            mouseleave: () => {
              this.current_hovered_from_sidebar = "";
              $(
                `#${callsign.replace("~", "").replace(".", "")}_marker`
              ).removeClass("airplane_orange");
              $(
                `#${callsign.replace("~", "").replace(".", "")}_marker`
              ).addClass(
                this.find_plane_color(
                  callsign,
                  alert,
                  num_messages,
                  squawk,
                  old_messages,
                  hex,
                  tail
                )
              );
              tooltip.attach_all_tooltips();
            },
          });
        }
      }
    }
    $("#num_planes").html(`Planes: ${num_planes}`);
    // FIXME: IF THE SIDEBAR IS UPDATED AND A PLANE IS HOVERED THE STATE IS NOT RETAINED
    // ONLY MOVING THE MOUSE WILL RESET THE HOVERED PLANE
    $("#num_planes_targets").html(`Planes w/ Targets: ${num_planes_targets}`);
  },

  metersperpixel: function (): number {
    return (
      (40075016.686 *
        Math.abs(Math.cos((this.map.getCenter().lat * Math.PI) / 180))) /
      Math.pow(2, this.map.getZoom() + 8)
    );
  },

  offset_datablock: function (centerpoint: [number, number]): [number, number] {
    const mtp: number = this.metersperpixel();
    const offset_y: number = 0;
    const offset_x: number = mtp * 30;

    //Earth’s radius, sphere
    const R: number = 6378137;

    //Coordinate offsets in radians
    const dLat: number = offset_y / R;
    const dLon: number =
      offset_x / (R * Math.cos((Math.PI * centerpoint[0]) / 180));

    return [
      centerpoint[0] + (dLat * 180) / Math.PI,
      centerpoint[1] + (dLon * 180) / Math.PI,
    ] as [number, number];
  },

  find_plane_color: function (
    callsign: string,
    alert: boolean,
    num_messages: number,
    squawk: number,
    old_messages: number,
    hex: string,
    tail: string
  ): string {
    let color: string = "airplane_blue";
    if (
      this.current_hovered_from_sidebar ==
      callsign.replace("~", "").replace(".", "")
    )
      color = "airplane_orange";
    else if (
      (alert && this.show_unread_messages && num_messages !== old_messages) ||
      squawk == 7500 ||
      squawk == 7600 ||
      squawk == 7700
    )
      color = "airplane_red";
    else if (alert) {
      color = "airplane_brown";
    } else if (num_messages) {
      if (old_messages > num_messages) {
        console.error(
          "OLD MESSAGES WAS LARGER THAN TOTAL MESSAGE COUNT: " + callsign,
          hex,
          tail,
          num_messages,
          old_messages
        );
        //this.set_old_messages(plane, num_messages);
        num_messages = old_messages;
      }

      if (this.show_unread_messages && num_messages !== old_messages)
        color = "airplane_darkgreen";
      else color = "airplane_green";
    }
    return color;
  },

  update_targets: function (): void {
    if (
      typeof this.map !== null &&
      this.layerGroupPlanes !== null &&
      this.adsb_planes !== null
    ) {
      // clear old planes
      this.layerGroupPlanes.clearLayers();
      this.layerGroupPlaneDatablocks.clearLayers();
      const plane_data: plane_data = find_matches();

      for (const plane in this.adsb_planes) {
        if (
          this.adsb_planes[plane].position.lat != null &&
          this.adsb_planes[plane].position.lon != null
        ) {
          const current_plane = this.adsb_planes[plane].position;
          const callsign = this.get_callsign(current_plane);
          const rotate: number = this.get_heading(current_plane);
          const alt: string | number = this.get_alt(current_plane);
          const hex: string = this.get_hex(current_plane);
          const speed: number = this.get_speed(current_plane);
          const squawk: number = this.get_sqwk(current_plane);
          const baro_rate: number = this.get_baro_rate(current_plane);
          const tail: string = this.get_tail(current_plane);
          const ac_type: string = this.get_ac_type(current_plane);
          const lon: number = this.get_lon(current_plane);
          const lat: number = this.get_lat(current_plane);
          let icon: aircraft_icon | null = this.get_icon(plane);
          let num_messages: number = <any>null; // need to cast this to any for TS to compile.
          const old_messages = this.get_old_messages(plane);
          const details = this.match_plane(plane_data, callsign, tail, hex);
          num_messages = details.num_messages;
          const alert: boolean = details.has_alerts;
          let color = this.find_plane_color(
            callsign,
            alert,
            num_messages,
            squawk,
            old_messages,
            hex,
            tail
          );
          if (icon == null) {
            const type_shape: svg_icon = getBaseMarker(
              String(current_plane.category),
              current_plane.t,
              null,
              null,
              current_plane.type,
              alt
            );

            icon = svgShapeToURI(
              type_shape.name,
              0.5,
              type_shape.scale * 1.5
            ) as aircraft_icon;
            this.adsb_planes[current_plane.hex].icon = icon;
          }

          const popup_text = `<div>${
            callsign !== hex ? callsign + "/" : ""
          }${hex}<hr>Altitude: ${String(alt).toUpperCase()}${
            String(alt) !== "GROUND" ? " ft" : ""
          }
          ${
            baro_rate ? "<br>Altitude Rate: " + baro_rate + "fpm" : ""
          }<br>Heading: ${Math.round(rotate)}&deg;${
            speed ? "<br>Speed: " + Math.round(speed) + " knots" : ""
          }${squawk ? "<br>Squawk: " + squawk : ""}${
            tail ? "<br>Tail Number: " + tail : ""
          }${ac_type ? "<br>Aircraft Type: " + ac_type : ""}${
            num_messages ? "<br><br>ACARS messages: " + num_messages : ""
          }</div>`;

          if (!this.show_only_acars || num_messages) {
            let plane_icon = LeafLet.divIcon({
              className: "airplane",
              html: `<div><div id="${callsign
                .replace("~", "")
                .replace(
                  ".",
                  ""
                )}_marker" class="datablock ${color}" data-jbox-content="${popup_text}" style="-webkit-transform:rotate(${rotate}deg); -moz-transform: rotate(${rotate}deg); -ms-transform: rotate(${rotate}deg); -o-transform: rotate(${rotate}deg); transform: rotate(${rotate}deg);">${
                icon.svg
              }</div></div>`,
              iconSize: [icon.width, icon.height],
            });

            let plane_marker = LeafLet.marker([lat, lon], {
              icon: plane_icon,
              riseOnHover: true,
            });

            plane_marker.addTo(this.layerGroupPlanes);
            $(`#${callsign.replace("~", "").replace(".", "")}_marker`).on({
              mouseenter: () => {
                if (
                  this.current_hovered_from_map !==
                  callsign.replace("~", "").replace(".", "")
                ) {
                  this.current_hovered_from_map = callsign
                    .replace("~", "")
                    .replace(".", "");
                  this.airplaneList();
                }
              },
              mouseleave: () => {
                this.current_hovered_from_map = "";
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
              let datablock_icon = new LeafLet.DivIcon({
                className: "airplane",
                html: datablock,
              });
              let datablock_marker = new LeafLet.Marker(
                this.offset_datablock([lat, lon]) as LeafLet.LatLngTuple,
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

  mark_all_messages_read: function (): void {
    const plane_data: plane_data = find_matches();
    for (const plane in this.adsb_planes) {
      const current_plane = this.adsb_planes[plane].position;
      const callsign = this.get_callsign(current_plane);
      const hex: string = this.get_hex(current_plane);
      const tail: string = this.get_tail(current_plane);
      const details = this.match_plane(plane_data, callsign, tail, hex);
      const num_messages = details.num_messages;

      this.adsb_planes[plane].num_messages = num_messages;
    }
    this.redraw_map();
  },

  showPlaneMessages: function (
    plane_callsign: string = "",
    plane_hex: string = "",
    plane_tail = ""
  ): void {
    if (plane_callsign === "" && plane_hex === "") return;
    this.current_modal_terms = {
      callsign: plane_callsign,
      hex: plane_hex,
      tail: plane_tail,
    };
    const plane_details: plane_match = get_match(
      plane_callsign,
      plane_hex,
      plane_tail
    );
    const matches = plane_details.messages;
    if (matches.length === 0) return;
    if (this.modal_content == "") {
      this.modal_current_tab ==
        matches[matches.length - 1].uid + ";" + matches[0];
    }

    const html =
      '<div style="background:white">' +
      display_messages([matches], this.modal_current_tab, true) +
      "</div>";
    if (this.modal_content !== html) {
      this.modal_content = html;
      this.plane_message_modal.setContent(html);
    }
    this.plane_message_modal.setTitle(`Messages for ${plane_callsign}`);
    const window_size: window_size = get_window_size();
    const window_width = this.get_modal_width();
    const window_height = this.get_modal_height();
    this.plane_message_modal.setHeight(window_height);
    this.plane_message_modal.setWidth(window_width);
    this.plane_message_modal.open();
    this.adsb_planes[plane_hex.toLowerCase()].num_messages = matches.length;
    this.airplaneList();
    resize_tabs(window_width - 40, false);
    $(".show_when_small").css("display", `inline-block`);
    $(".show_when_big").css("display", "none");
    $(".dont_show").css("display", "none");
    tooltip.attach_all_tooltips();
  },

  close_live_map_modal: function (): void {
    this.current_modal_terms = (<unknown>null) as {
      callsign: string;
      hex: string;
      tail: string;
    };
    this.modal_content = "";
  },

  handle_radio: function (element_id: string, uid: string): void {
    this.modal_current_tab = uid + ";" + element_id;
    if (this.current_modal_terms != null) {
      this.showPlaneMessages(
        this.current_modal_terms.callsign,
        this.current_modal_terms.hex,
        this.current_modal_terms.tail
      );
    }
    tooltip.cycle_tooltip();
  },

  updateModalSize: function (new_window_size: window_size): void {
    this.window_size = new_window_size;
    if (this.map) {
      this.map.invalidateSize();
    }
    const window_width = this.get_modal_width();
    const window_height = this.get_modal_height();
    this.plane_message_modal.setHeight(window_height);
    this.plane_message_modal.setWidth(window_width);
    resize_tabs(window_width - 40, false);
    $(".show_when_small").css("display", `inline-block`);
    $(".show_when_big").css("display", "none");
    tooltip.attach_all_tooltips();
  },

  get_modal_height: function () {
    return this.window_size.height * (this.window_size.height < 500 ? 1 : 0.8);
  },

  get_modal_width: function () {
    return this.window_size.width * (this.window_size.width < 500 ? 1 : 0.5);
  },

  zoom_in: function (): void {
    this.map.setZoom(this.map.getZoom() + 1);
  },

  zoom_out: function (): void {
    this.map.setZoom(this.map.getZoom() - 1);
  },

  live_map_active: function (state = false, window_size: window_size): void {
    this.live_map_page_active = state;
    this.window_size = window_size;
    this.get_cookie_value();
    if (this.live_map_page_active && this.adsb_enabled) {
      this.set_html();
      this.map = LeafLet.map("mapid", {
        zoomDelta: 0.2,
        center: [this.lat, this.lon],
        zoom: this.current_scale,
        scrollWheelZoom: false,
        smoothWheelZoom: true,
        smoothSensitivity: 1,
        zoomControl: false,
      } as MapOptionsWithNewConfig);

      LeafLet.tileLayer("https://{s}.tile.osm.org/{z}/{x}/{y}.png", {
        detectRetina: false,
        opacity: 0.6,
        attribution:
          '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(this.map);
      this.set_range_markers();

      LeafLet.control
        .custom({
          position: "topleft",
          content:
            '<button type="button" id="zoomin" class="btn btn-default" onclick="zoom_in()"><i class="fas fa-plus"></i></button>' +
            '<button type="button" id="zoomout" class="btn btn-default" onclick="zoom_out()"><i class="fas fa-minus"></i></button>',
          classes: "btn-group-vertical btn-group-sm",
          style: {
            margin: "10px",
            padding: "0px 0 0 0",
            cursor: "pointer",
          },
          events: {},
        })
        .addTo(this.map);

      this.layerGroupPlanes = LeafLet.layerGroup().addTo(this.map);
      this.layerGroupPlaneDatablocks = LeafLet.layerGroup().addTo(this.map);
      this.set_controls();
      this.map.on({
        zoom: () => {
          this.current_scale = this.map.getZoom();
          Cookies.set("live_map_zoom", String(this.current_scale), {
            expires: 365,
            sameSite: "Strict",
          });
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

  set_controls: function (): void {
    if (this.legend) this.legend.remove();
    this.legend = LeafLet.control.Legend({
      position: "bottomleft",
      symbolWidth: 45,
      symbolHeight: 45,
      opacity: 0.6,
      collapsed: true,
      legends: [
        {
          label: "Planes With ACARS Messages",
          type: "image",
          url: images.legend_has_acars,
        },
        {
          label: "Planes With Unread ACARS Messages",
          type: "image",
          url: images.legend_with_acars_unread,
        },
        {
          label: "Planes With Unread ACARS Alerts",
          type: "image",
          url: images.legend_has_acars_alert_unread,
        },
        {
          label: "Planes With Read ACARS Alerts",
          type: "image",
          url: images.legend_has_acars_alert_read,
        },
        {
          label: "Planes Without ACARS Messages",
          type: "image",
          url: images.legend_without_acars_url,
        },
      ],
    });
    this.legend.addTo(this.map);

    if (this.map_controls) this.map_controls.remove();

    this.map_controls = LeafLet.control.custom({
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
        "</button>" +
        '<button type="button" class="btn btn-success toggle-unread-messages" onclick="toggle_unread_messages()">' +
        `    ${images.toggle_unread_messages_on}` +
        "</button>" +
        (this.show_unread_messages
          ? `<button type="button" class="btn btn-danger mark-all-messages-read" onclick="mark_all_messages_read()">    ${images.mark_all_messages_read}</button>`
          : ""),
      //+
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
    });
    this.map_controls.addTo(this.map);
  },

  set_live_map_page_urls: function (
    documentPath: string,
    documentUrl: string
  ): void {
    this.livemap_acars_path = documentPath;
    this.livemap_acars_url = documentUrl;
  },

  set_html: function (): void {
    $("#modal_text").html("");
    $("#page_name").html("");
    if (this.adsb_enabled)
      $("#log").html(
        '<div style="display: flex;height: 100%;" ><div id="mapid"></div><div id="planes"></div>'
      );
    else $("#log").html("ADSB Disabled");
    //setScrollers();
  },

  destroy_maps: function (): void {
    this.map = (<unknown>null) as LeafLet.Map;
    this.layerGroupPlanes = (<unknown>null) as LeafLet.LayerGroup;
    this.layerGroupPlaneDatablocks = (<unknown>null) as LeafLet.LayerGroup;
    this.layerGroupRangeRings = (<unknown>null) as LeafLet.LayerGroup;
    this.adsb_planes = {};
    this.map_controls = (<unknown>null) as LeafLet.Control;
    this.legend = (<unknown>null) as LeafLet.Control;

    if (this.live_map_page_active) this.set_html();
  },

  is_adsb_enabled: function (
    is_enabled: boolean = false,
    window_size: window_size
  ): void {
    this.adsb_enabled = is_enabled;
    if (this.live_map_page_active) {
      this.set_html();

      if (this.live_map_page_active) {
        this.live_map_active(true, window_size);
      }
    }
  },
};
