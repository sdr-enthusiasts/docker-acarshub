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

export declare const window: Window;
declare const document: DocumentEventListeners;

// CSS loading

import "jquery";

// import 'bootstrap'
import "bootstrap/dist/css/bootstrap.min.css";
import "./css/leaftlet.legend.css";
import "leaflet/dist/leaflet.css";
import "jbox/dist/jBox.all.css";
import "./css/site.css";

import { menu } from "./helpers/menu";
import { LiveMessagesPage } from "./pages/live_messages";
// import { search_page } from "./pages/search";
import { stats_page } from "./pages/stats";
import { about } from "./pages/about";
// import { live_map_page } from "./pages/live_map";
import { status } from "./pages/status";
// import { alerts_page } from "./pages/alerts";
import { tooltip } from "./helpers/tooltips";
import { io, Socket } from "socket.io-client";
import { MessageHandler } from "./data-handling/message_handler";
import { Settings } from "./data-handling/settings";
import { SettingsPage } from "./pages/settings";

import {
  labels,
  system_status,
  html_msg,
  database_size,
  current_search,
  search_html_msg,
  decoders,
  signal,
  signal_freq_data,
  signal_count_data,
  adsb,
  window_size,
  alert_matched,
  plane_data,
  acars_msg,
  plane_match,
  acarshub_version,
  alert_terms,
  terms,
  LocalStorageSettings,
  message_properties,
  DocumentEventListeners,
  alert_counts,
} from "./interfaces";

let socket: Socket = <any>null;
let socket_status: boolean = false;

let index_acars_url: string = "";
let index_acars_path: string = "";

let adsb_url: string = "";
let adsb_getting_data: boolean = false;
let adsb_interval: any;
let connection_good: boolean = true;
let adsb_enabled = false;

const adsb_request_options = {
  method: "GET",
} as RequestInit;

let msg_handler = new MessageHandler(index_acars_url);
const settings = new Settings();
let settings_page = new SettingsPage();
let live_messages_page = new LiveMessagesPage();
let hidden: string = "";
let visibilityChange: string = "";
let is_page_backgrounded = false;

if (typeof document.webkitHidden !== "undefined") {
  hidden = "webkitHidden";
  visibilityChange = "webkitvisibilitychange";
} else if (typeof document.hidden !== "undefined") {
  // Opera 12.10 and Firefox 18 and later support
  hidden = "hidden";
  visibilityChange = "visibilitychange";
} else if (typeof document.msHidden !== "undefined") {
  hidden = "msHidden";
  visibilityChange = "msvisibilitychange";
}

const pages: string[] = [
  "/", // index/live messages
  "/search", // search page
  "/stats", // stats page
  "/about", // about page
  "/status", // status page
  "/alerts", // alerts page
  "/adsb", // live_map page
];

$((): void => {
  live_messages_page.set_page_active();
  //inject the base HTML in to the body tag
  // Document on ready new syntax....or something. Passing a function directly to jquery
  $("#log").html("Page loading.....please wait");
  // setScrollers();
  // Observe one or multiple elements
  // time to set everything on the page up

  menu.generate_menu(); // generate the top menu
  menu.generate_footer(); // generate the footer

  update_url(); // update the urls for everyone
  adsb_url = index_acars_url + "data/aircraft.json";
  //connect to the socket server.
  socket = io(`${document.location.origin}/main`, {
    path: index_acars_path + "socket.io",
  });

  socket.on("labels", function (msg: labels) {
    // Msg labels
    //live_messages_page.new_labels(msg); // send to live messages
  });

  socket.on("acars_msg", function (msg: html_msg) {
    // New acars message.
    const processed_msg: message_properties = msg_handler.acars_message(
      msg.msghtml,
      typeof msg.loading === "undefined"
    );

    if (!is_page_backgrounded) {
      // If the message is a new message, then we need to update the page.
      if (
        msg.done_loading === true &&
        live_messages_page &&
        live_messages_page.is_active()
      ) {
        live_messages_page.update_page(msg_handler.get_all_messages());
      } else if (
        typeof msg.done_loading === "undefined" &&
        live_messages_page &&
        live_messages_page.is_active() &&
        processed_msg.should_display
      ) {
        live_messages_page.update_page(
          msg_handler.get_message_by_id(processed_msg.uid)
        );
      }

      menu.increment_message_counter(msg_handler.get_received_messages_count());

      if (typeof msg.done_loading === "undefined" && processed_msg.has_alerts) {
        msg_handler.sound_alert();
      }
    } else {
      console.log("Skipping update: page back grounded");
    }
  });

  socket.on("alert_term_counts", function (msg: alert_counts): void {
    console.log(msg);
  });

  socket.on("terms", function (msg: terms): void {
    settings.set_all_alert_terms(msg);
    //alerts_page.alerts_terms(msg); // send the terms over to the alert page
  });

  socket.on("alert_matches", function (msg: html_msg): void {
    //alerts_page.alerts_acars_message(msg);
  });

  socket.on("database", function (msg: database_size): void {
    //search_page.database_size_details(msg);
  });

  socket.on("database_search_results", function (msg: search_html_msg): void {
    //search_page.database_search_results(msg);
  });

  socket.on("acarshub-version", function (version: acarshub_version): void {
    menu.set_version(version);
    status.set_version(version);
    tooltip.cycle_tooltip();
  });

  // stats

  socket.on("features_enabled", function (msg: decoders): void {
    stats_page.decoders_enabled(msg);

    if (msg.adsb.enabled === true) {
      adsb_enabled = true;
      menu.set_adsb(true);

      //alerts_page.updateAlertCounter();
      // live_map_page.is_adsb_enabled(true, {
      //   width: old_window_width,
      //   height: old_window_height,
      // } as window_size);
      // live_map_page.live_map(msg.adsb.lat, msg.adsb.lon, msg.adsb.range_rings);

      status.update_adsb_status({
        adsb_enabled: true,
        adsb_getting_data: true,
      });

      if (msg.adsb.bypass) {
        adsb_url = msg.adsb.url;
        adsb_request_options["mode"] = "cors";
      }

      // Check to see if the adsb interval already exists.
      // We want to do this because if the client disconnects it will
      // receive all of the 'on connect' data again, and another adsb interval
      // would be spawned.

      if (!adsb_interval) {
        update_adsb();
        adsb_interval = setInterval(() => {
          update_adsb();
        }, 5000);
      }
    } else {
      adsb_enabled = false;
    }

    // If for some reason ADSB was ever turned off on the back end and was enabled for the client, turn off the updater
    // And update the web app to remove menu and destroy costly background assets
    if (!msg.adsb.enabled && adsb_interval != null) {
      adsb_enabled = false;
      clearInterval(adsb_interval);
      adsb_interval = null;
      menu.set_adsb(false);

      //alerts_page.updateAlertCounter();
      // live_map_page.is_adsb_enabled(false, {
      //   width: old_window_width,
      //   height: old_window_height,
      // } as window_size);
      // live_map_page.destroy_maps();
    }
  });

  // signal level graph
  socket.on("signal", function (msg: signal): void {
    stats_page.signals(msg);
  });

  // sidebar frequency count
  socket.on("signal_freqs", function (msg: signal_freq_data): void {
    stats_page.signal_freqs(msg);
  });

  socket.on("system_status", function (msg: system_status): void {
    status.status_received(msg);
  });

  socket.on("signal_count", function (msg: signal_count_data): void {
    stats_page.signal_count(msg);
  });

  // socket errors

  socket.on("disconnect", (): void => {
    connection_good = false;
    connection_status();
  });

  socket.on("connect_error", (): void => {
    connection_good = false;
    connection_status();
  });

  socket.on("connect_timeout", (): void => {
    connection_good = false;
    connection_status();
  });

  socket.on("connect", (): void => {
    connection_status(true);
  });

  socket.on("reconnect", (): void => {
    connection_status(true);
  });

  socket.on("reconnecting", (): void => {
    console.error("reconnecting");
  });

  socket.on("error", function (e): void {
    console.error(e);
  });

  // init all page backgrounding functions
  //live_messages_page.live_messages();
  //search_page.search();
  stats_page.stats();
  about.about();
  status.status();
  //alerts_page.alert();

  setInterval(function () {
    stats_page.updatePage();
  }, 60000);

  if (
    typeof document.addEventListener === "undefined" ||
    hidden === undefined
  ) {
    console.error(
      "This webapp requires a browser, such as Safari, Google Chrome or Firefox, that supports the Page Visibility API."
    );
  } else {
    document.addEventListener(
      visibilityChange,
      () => {
        console.log(
          "visibilityChange",
          document[hidden],
          document.visibilityState
        );
        is_page_backgrounded = document[hidden];
      },
      false
    );
  }
});

const update_adsb = async (): Promise<void> => {
  fetch(adsb_url, adsb_request_options)
    .then((response) => {
      adsb_getting_data = true;
      return response.json();
    })
    .then((planes) => msg_handler.adsb_message(planes))
    .catch((err) => {
      adsb_getting_data = false;
      status.update_adsb_status({
        adsb_enabled: true,
        adsb_getting_data: false,
      });
      status.update_status_bar();
      console.error(err);
    });
};

const update_url = (): void => {
  index_acars_path = document.location.pathname.replace(
    /about|search|stats|status|alerts|adsb/gi,
    ""
  );
  index_acars_path += index_acars_path.endsWith("/") ? "" : "/";
  index_acars_url = document.location.origin + index_acars_path;
};

const connection_status = (connected = false): void => {
  socket_status = connected;
  if (connected) {
    $("#update_notice").removeClass("hidden");
  } else {
    $("#update_notice").addClass("hidden");
  }
  $("#disconnect").html(
    !connected
      ? '<strong><span class="red_body">DISCONNECTED FROM WEB SERVER</strong>'
      : ""
  );

  if (connected) {
    $("#received").css("display", "inline-block");
    $("#system_status").css("display", "inline-block");
    $("#receivedmessages").css("display", "inline-block");
  } else {
    $("#received").css("display", "none");
    $("#system_status").css("display", "none");
    $("#receivedmessages").css("display", "none");
  }
};

// Functions for opening up the socket to the child pages

export const alert_term_query = (
  alert_icao: string[],
  alert_callsigns: string[],
  alert_tail: string[]
): void => {
  socket.emit(
    "query_terms",
    {
      icao: alert_icao.length > 0 ? alert_icao : null,
      flight: alert_callsigns.length > 0 ? alert_callsigns : null,
      tail: alert_tail.length > 0 ? alert_tail : null,
    },
    "/main"
  );
};

export const alert_text_update = (
  alert_text: string[],
  ignore_text: string[]
): void => {
  socket.emit(
    "update_alerts",
    {
      terms: alert_text,
      ignore: ignore_text,
    },
    "/main"
  );
};

export const search_database = (
  current_search: current_search,
  show_all = false,
  page = 0
): void => {
  if (!show_all)
    socket.emit(
      "query_search",
      { search_term: current_search, results_after: page },
      "/main"
    );
  else {
    socket.emit(
      "query_search",
      { show_all: true, results_after: page },
      "/main"
    );
  }
};

export const signal_grab_freqs = (): void => {
  socket.emit("signal_freqs", { freqs: true }, "/main");
};

export const signal_grab_message_count = (): void => {
  socket.emit("signal_count", { count: true }, "/main");
};

export const signal_grab_updated_graphs = (): void => {
  socket.emit("signal_graphs", { graphs: true }, "/main");
};

export const is_connected = (): boolean => {
  return socket_status;
};

// functions to pass values between objects

// export function match_alert(msg: html_msg): alert_matched {
//   return alerts_page.match_alert(msg);
// }

// export function sound_alert(): void {
//   alerts_page.sound_alert();
// }

export const generate_stat_submenu = (
  acars: boolean = false,
  vdlm: boolean = false
): void => {
  menu.generate_stat_submenu(acars, vdlm);
};

// export function find_matches(): plane_data {
//   return live_messages_page.find_matches();
// }

// export function get_match(
//   callsign: string = "",
//   hex: string = "",
//   tail: string = ""
// ): plane_match {
//   return live_messages_page.get_match(callsign, hex, tail);
// }

export const is_adsb_enabled = () => {
  return adsb_enabled;
};

// export function get_current_planes() {
//   return live_map_page.get_current_planes();
// }

// functions that need to be registered to window object

// window.reset_alert_counts = (): void => {
//   const reset_alerts = confirm(
//     "This will reset the alert term counts in your database. This action cannot be undone. Are you sure you want to continue?"
//   );
//   if (reset_alerts) {
//     socket.emit("reset_alert_counts", { reset_alerts: true }, "/main");
//   }
// };

export const get_setting = (key: string): string => {
  return settings.get_setting(key);
};

export const is_label_excluded = (label: string): boolean => {
  return settings.is_label_excluded(label);
};

export const get_all_settings = (): LocalStorageSettings => {
  return settings.get_all_settings();
};

export const get_display_settings = () => {
  return settings.get_display_settings();
};

export const get_all_planes = () => {
  return msg_handler.get_all_messages();
};

export const get_alerts = () => {
  return {
    ignore: settings.get_alerts_list_of_blacklist_terms(),
    text_terms: settings.get_alerts_list_of_whitelist_terms(),
  } as alert_terms;
};

export const set_live_messages_paused = (state: boolean): void => {
  menu.set_paused(state);
};

window.save_settings = async (): Promise<void> => {
  settings.save_settings()
    ? settings_page.close_modal()
    : alert("Error saving settings");

  msg_handler.scan_for_new_alerts();
  live_messages_page.update_page(msg_handler.get_all_messages(), false);
  socket.emit("update_alerts", settings.get_all_alert_terms(), "/main");
};
