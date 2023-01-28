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

declare const window: any;

// CSS loading

import "jquery";

// import 'bootstrap'
import "bootstrap/dist/css/bootstrap.min.css";
import "./css/leaftlet.legend.css";
import "leaflet/dist/leaflet.css";
import "./css/leaftlet.radar.css";
import "jbox/dist/jBox.all.css";
import "./css/site.css";

import { menu } from "./helpers/menu";
import { live_messages_page } from "./pages/live_messages";
import { search_page } from "./pages/search";
import { stats_page } from "./pages/stats";
import { about } from "./pages/about";
import { status } from "./pages/status";
import { alerts_page } from "./pages/alerts";
import { tooltip } from "./helpers/tooltips";
import { io, Socket } from "socket.io-client";

import {
  labels,
  system_status,
  html_msg,
  terms,
  database_size,
  current_search,
  search_html_msg,
  decoders,
  signal,
  alert_term,
  signal_freq_data,
  signal_count_data,
  adsb,
  window_size,
  alert_matched,
  plane_data,
  acars_msg,
  plane_match,
  acarshub_version,
} from "./interfaces";

import { live_map_page } from "./pages/live_map";
import Cookies from "js-cookie";

let socket: Socket = <any>null;
let socket_status: boolean = false;

let index_acars_url: string = "";
let index_acars_path: string = "";
let index_acars_page: string = "";

let old_window_width: number = 0;
let old_window_height: number = 0;

let adsb_url: string = "";
let adsb_getting_data: boolean = false;
let adsb_interval: any;
let connection_good: boolean = true;
let adsb_enabled = false;
let adsb_request_options = {
  method: "GET",
} as RequestInit;
let allow_remote_updates = false;

// @ts-expect-error
var hidden, visibilityChange;
if (typeof document.hidden !== "undefined") {
  // Opera 12.10 and Firefox 18 and later support
  hidden = "hidden";
  visibilityChange = "visibilitychange";
} //@ts-ignore
else if (typeof document.msHidden !== "undefined") {
  hidden = "msHidden";
  visibilityChange = "msvisibilitychange";
} //@ts-ignore
else if (typeof document.webkitHidden !== "undefined") {
  hidden = "webkitHidden";
  visibilityChange = "webkitvisibilitychange";
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

let robserver: ResizeObserver = new ResizeObserver((entries) => {
  for (let entry of entries) {
    const cr = entry.contentRect;
    if (cr.width !== old_window_width) {
      old_window_width = cr.width - 50;
      if (index_acars_page === "/") resize_tabs(cr.width - 50);
      else if (index_acars_page === "/adsb")
        live_map_page.updateModalSize({
          width: cr.width,
          height: cr.height,
        } as window_size);
      else if (index_acars_page === "/stats") {
        stats_page.resize(cr.width);
      }
    }

    if (cr.height !== old_window_height) {
      old_window_height = cr.height - 200;
    }
  }
});

export function resize_tabs(
  window_width: number = 0,
  set_new_width: boolean = true
): void {
  if (set_new_width && (!window_width || window_width <= 0))
    window_width = old_window_width;
  let num_tabs = 0;

  if (window_width > 1700) num_tabs = 15;
  else if (window_width > 1050) num_tabs = 10;
  else if (window_width > 400) num_tabs = 5;
  else num_tabs = 3;

  // FIXME: THIS WHOLE THING
  // Lets get REALLY fucking stupid with tab widths
  // The problem: browsers can't obviously display widths with decimals. It rounds it off. Somehow. And that somehow is out of our control.
  // We need to do the following so that rows align with each other
  // 1) determine how many tabs we can fit in the row (done above)
  // 2) determine how many pixels each tab takes up and normalize it to an integer so we remove any decimals.
  // 3) make it even so that it can be divisible by two (the two nav arrow widths) so that the width of two nav arrows == the width of a tab
  // 4) set the width for the tabs
  // 5) set the width for the sub tabs
  // 6) set the message container width to the total width of all of the tabs because it's default size may be off a 1-2 pixels because of the rounding of tab widths.
  // 7) Oh and, not related to the above, remove the margin left on all tabs that start a row.
  // There has to be reason why all of these things weren't just working prior where we were dividing width / number of tabs per row
  // and then dividing the pixels / tab in half for the nav buttons. The first row was always fine but the second row got out of alignment by 1-3 pixels.
  // Absolutely nothing I did could make it work. And now with this method I'm having to do random stuff like adding and removing random pixels.
  // Because fucking reasons.
  // Plz CSS gurus tell me what I'm missing here.
  let tab_width = Math.floor(window_width / num_tabs); // #2 above
  tab_width % 2 === 0 ? (tab_width -= 0) : (tab_width += 1); // #3 above
  const sub_tab_width = Math.floor(tab_width / 2); // #4 above
  tab_width -= 1; // Why?! Everything gets off by at least a pixel if we don't do this!?
  $(".tabinator label").css("width", `${tab_width}px`); // CSS to set the widths everywhere
  $(".boxed").css("width", `${sub_tab_width}px`);
  $(".acarshub-message-group").css(
    "width",
    `${tab_width * num_tabs - (num_tabs - 1)}px`
  );
  // Fix 10 rows of tabs
  for (let i = 1; i <= 10; i++) {
    // #7
    $(`.msg${num_tabs * i - 1}`).css("margin-left", "0");
  }
}

// export function setScrollers() {
//   let timer: null | NodeJS.Timeout = null;
//   $("div").on("scroll", function (e) {
//     if (e.target.classList.contains("on-scrollbar") === false) {
//       e.target.classList.add("on-scrollbar");
//     }

//     if (timer !== null) {
//       clearTimeout(timer);
//     }

//     timer = setTimeout(function () {
//       $("div").removeClass("on-scrollbar");
//     }, 500);
//   });
// }

$((): void => {
  //inject the base HTML in to the body tag
  // Document on ready new syntax....or something. Passing a function directly to jquery
  $("#log").html("Page loading.....please wait");
  // setScrollers();
  // Observe one or multiple elements
  // time to set everything on the page up

  menu.generate_menu(); // generate the top menu
  menu.generate_footer(); // generate the footer

  robserver.observe(<Element>document.querySelector("body"));
  update_url(); // update the urls for everyone
  adsb_url = index_acars_url + "data/aircraft.json";
  //connect to the socket server.
  socket = io(`${document.location.origin}/main`, {
    path: index_acars_path + "socket.io",
  });

  socket.on("labels", function (msg: labels) {
    // Msg labels
    live_messages_page.new_labels(msg); // send to live messages
  });

  socket.on("acars_msg", function (msg: html_msg) {
    // New acars message.
    if (connection_good || typeof msg.loading == "undefined") {
      live_messages_page.new_acars_message(msg); // send the message to live messages
      // if (adsb_enabled && typeof msg.loading == "undefined")
      //   live_map_page.redraw_map();
      if (typeof msg.loading == "undefined" || msg.loading === false)
        alerts_page.alerts_acars_message(msg); // send the message to alerts for processing
    }
  });

  socket.on("terms", function (msg: terms): void {
    alerts_page.alerts_terms(msg); // send the terms over to the alert page
  });

  socket.on("alert_matches", function (msg: html_msg): void {
    alerts_page.alerts_acars_message(msg);
  });

  socket.on("database", function (msg: database_size): void {
    search_page.database_size_details(msg);
  });

  socket.on("database_search_results", function (msg: search_html_msg): void {
    search_page.database_search_results(msg);
  });

  socket.on("acarshub-version", function (version: acarshub_version): void {
    menu.set_version(version);
    status.set_version(version);
    tooltip.cycle_tooltip();
  });

  // stats

  socket.on("features_enabled", function (msg: decoders): void {
    stats_page.decoders_enabled(msg);
    menu.set_arch(msg.arch);
    allow_remote_updates = msg.allow_remote_updates;
    if (msg.adsb.enabled === true) {
      adsb_enabled = true;
      menu.set_adsb(true);
      toggle_pages();
      alerts_page.updateAlertCounter();
      live_map_page.is_adsb_enabled(true, {
        width: old_window_width,
        height: old_window_height,
      } as window_size);
      live_map_page.live_map(msg.adsb.lat, msg.adsb.lon, msg.adsb.range_rings);

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
      toggle_pages();
      alerts_page.updateAlertCounter();
      live_map_page.is_adsb_enabled(false, {
        width: old_window_width,
        height: old_window_height,
      } as window_size);
      live_map_page.destroy_maps();
    }
  });

  // signal level graph
  socket.on("signal", function (msg: signal): void {
    stats_page.signals(msg);
  });

  // alert term graph
  socket.on("alert_terms", function (msg: alert_term): void {
    stats_page.alert_terms(msg);
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

  socket.on("disconnect", function (): void {
    connection_good = false;
    connection_status();
  });

  socket.on("connect_error", function (): void {
    connection_good = false;
    connection_status();
  });

  socket.on("connect_timeout", function (): void {
    connection_good = false;
    connection_status();
  });

  socket.on("connect", function (): void {
    set_connection_good();
    connection_status(true);
  });

  socket.on("reconnect", function (): void {
    set_connection_good();
    connection_status(true);
  });

  socket.on("reconnecting", function (): void {
    console.error("reconnecting");
  });

  socket.on("error", function (e): void {
    console.error(e);
  });

  // init all page backgrounding functions
  live_messages_page.live_messages();
  search_page.search();
  stats_page.stats();
  about.about();
  status.status();
  alerts_page.alert();
  toggle_pages();

  setInterval(function () {
    stats_page.updatePage();
  }, 60000);

  if (
    typeof document.addEventListener === "undefined" ||
    // @ts-expect-error
    hidden === undefined
  ) {
    console.error(
      "This webapp requires a browser, such as Safari, Google Chrome or Firefox, that supports the Page Visibility API."
    );
  } else {
    document.addEventListener(
      // @ts-expect-error
      visibilityChange,
      () => {
        // @ts-expect-error
        toggle_pages(document[hidden]);
      },
      false
    );
  }
});

export function get_window_size(): window_size {
  return { width: old_window_width, height: old_window_height } as window_size;
}

function set_connection_good(): void {
  setTimeout(() => (connection_good = socket.connected), 5000);
}

async function update_adsb(): Promise<void> {
  fetch(adsb_url, adsb_request_options)
    .then((response) => {
      adsb_getting_data = true;
      return response.json();
    })
    .then((planes) => live_map_page.set_targets(planes as adsb))
    .catch((err) => {
      adsb_getting_data = false;
      status.update_adsb_status({
        adsb_enabled: true,
        adsb_getting_data: false,
      });
      status.update_status_bar();
      console.error(err);
    });
}

function update_url(): void {
  index_acars_path = document.location.pathname.replace(
    /about|search|stats|status|alerts|adsb/gi,
    ""
  );
  index_acars_path += index_acars_path.endsWith("/") ? "" : "/";
  index_acars_url = document.location.origin + index_acars_path;

  live_messages_page.set_live_page_urls(index_acars_path, index_acars_url);
  search_page.set_search_page_urls(index_acars_path, index_acars_url);
  stats_page.set_stats_page_urls(index_acars_path, index_acars_url);
  about.set_about_page_urls(index_acars_path, index_acars_url);
  status.set_status_page_urls(index_acars_path, index_acars_url);
  alerts_page.set_alert_page_urls(index_acars_path, index_acars_url);
  live_map_page.set_live_map_page_urls(index_acars_path, index_acars_url);
  menu.set_about_page_urls(index_acars_path, index_acars_url);
}

function toggle_pages(is_backgrounded = false): void {
  index_acars_page =
    "/" + document.location.pathname.replace(index_acars_path, "");
  live_map_page.plane_message_modal.close();
  for (let page in pages) {
    if (pages[page] === "/" && index_acars_page === pages[page]) {
      $("#live_messages_link").addClass("invert_a");
      live_messages_page.live_message_active(!is_backgrounded);
    } else if (pages[page] === "/") {
      $("#live_messages_link").removeClass("invert_a");
      live_messages_page.live_message_active();
    } else if (pages[page] === "/search" && index_acars_page === pages[page]) {
      $("#search_link").addClass("invert_a");
      search_page.search_active(!is_backgrounded);
    } else if (pages[page] === "/search") {
      $("#search_link").removeClass("invert_a");
      search_page.search_active();
    } else if (pages[page] === "/stats" && index_acars_page === pages[page]) {
      $("#stats_link").addClass("invert_a");
      stats_page.stats_active(!is_backgrounded);
    } else if (pages[page] === "/stats") {
      $("#stats_link").removeClass("invert_a");
      stats_page.stats_active();
    } else if (pages[page] === "/about" && index_acars_page === pages[page]) {
      about.about_active(!is_backgrounded);
    } else if (pages[page] === "/about") {
      about.about_active();
    } else if (pages[page] === "/status" && index_acars_page === pages[page]) {
      status.status_active(!is_backgrounded);
    } else if (pages[page] === "/status") {
      status.status_active();
    } else if (pages[page] === "/alerts" && index_acars_page === pages[page]) {
      $("#alerts_link").addClass("invert_a");
      alerts_page.alert_active(!is_backgrounded, allow_remote_updates);
    } else if (pages[page] === "/alerts") {
      $("#alerts_link").removeClass("invert_a");
      alerts_page.alert_active(true, allow_remote_updates);
    } else if (pages[page] === "/adsb" && index_acars_page === pages[page]) {
      $("#live_map_link").addClass("invert_a");
      live_map_page.live_map_active(!is_backgrounded, {
        width: old_window_width,
        height: old_window_height,
      } as window_size);
    } else if (pages[page] === "/adsb") {
      $("#live_map_link").removeClass("invert_a");
      live_map_page.live_map_active(false, {
        width: old_window_width,
        height: old_window_height,
      } as window_size);
    }
  }
}

window.new_page = function (page: string): void {
  document.title = page;
  let sub_url = "";
  if (page === "Live Messages") sub_url = "";
  else if (page === "Search") sub_url = "search";
  else if (page === "Stats") sub_url = "stats";
  else if (page === "About") sub_url = "about";
  else if (page === "Status") sub_url = "status";
  else if (page === "Alerts") sub_url = "alerts";
  else if (page === "Live Map") sub_url = "adsb";
  window.history.pushState(
    { path: index_acars_path + sub_url },
    page,
    index_acars_path + sub_url
  );
  toggle_pages();
};

function connection_status(connected = false): void {
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
}

// Functions for opening up the socket to the child pages

export function alert_term_query(
  alert_icao: string[],
  alert_callsigns: string[],
  alert_tail: string[]
): void {
  socket.emit(
    "query_terms",
    {
      icao: alert_icao.length > 0 ? alert_icao : null,
      flight: alert_callsigns.length > 0 ? alert_callsigns : null,
      tail: alert_tail.length > 0 ? alert_tail : null,
    },
    "/main"
  );
}

export function alert_text_update(
  alert_text: string[],
  ignore_text: string[]
): void {
  socket.emit(
    "update_alerts",
    {
      terms: alert_text,
      ignore: ignore_text,
    },
    "/main"
  );
}

export function search_database(
  current_search: current_search,
  show_all = false,
  page = 0
): void {
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
}

export function signal_grab_freqs(): void {
  socket.emit("signal_freqs", { freqs: true }, "/main");
}

export function signal_grab_message_count(): void {
  socket.emit("signal_count", { count: true }, "/main");
}

export function signal_grab_updated_graphs(): void {
  socket.emit("signal_graphs", { graphs: true }, "/main");
}

export function is_connected(): boolean {
  return socket_status;
}

// functions to pass values between objects

export function match_alert(msg: html_msg): alert_matched {
  return alerts_page.match_alert(msg);
}

export function sound_alert(): void {
  alerts_page.sound_alert();
}

export function generate_stat_submenu(
  acars: boolean = false,
  vdlm: boolean = false
): void {
  menu.generate_stat_submenu(acars, vdlm);
}

export function find_matches(): plane_data {
  return live_messages_page.find_matches();
}

export function get_match(
  callsign: string = "",
  hex: string = "",
  tail: string = ""
): plane_match {
  return live_messages_page.get_match(callsign, hex, tail);
}

export function is_adsb_enabled() {
  return adsb_enabled;
}

export function get_current_planes() {
  return live_map_page.get_current_planes();
}

// functions that need to be registered to window object

window.show_page_modal = function (): void {
  if (index_acars_page === "/alerts") {
    alerts_page.show_alert_message_modal();
  } else if (index_acars_page === "/") {
    live_messages_page.show_live_message_modal();
  }
};

window.show_menu_modal = function (): void {
  menu.show_menu_modal();
};

window.updateAlerts = function (): void {
  alerts_page.updateAlerts();
};
window.default_alert_values = function (): void {
  alerts_page.default_alert_values();
};
window.toggle_playsound = function (status: boolean): void {
  alerts_page.toggle_playsound(status);
};
window.update_prefix = function (prefix: string): void {
  stats_page.update_prefix(prefix);
};

window.showall = function (): void {
  search_page.showall();
};

window.jumppage = function (): void {
  search_page.jumppage();
};

window.runclick = function (page: number): void {
  search_page.runclick(page);
};

window.handle_radio = function (element_id: string, uid: string): void {
  if (index_acars_page === "/")
    live_messages_page.handle_radio(element_id, uid);
  else if (index_acars_page === "/adsb")
    live_map_page.handle_radio(element_id, uid);
};

window.pause_updates = function (toggle_pause: boolean = true): void {
  live_messages_page.pause_updates(toggle_pause);
};

window.filter_notext = function (toggle_filter: boolean = true): void {
  live_messages_page.filter_notext(toggle_filter);
};

window.toggle_label = function (key: string): void {
  live_messages_page.toggle_label(key);
};

window.setSort = function (sort: string = ""): void {
  live_map_page.setSort(sort);
};

window.toggle_acars_only = function (): void {
  live_map_page.toggle_acars_only();
};

window.toggle_datablocks = function (): void {
  live_map_page.toggle_datablocks();
};

window.toggle_extended_datablocks = function (): void {
  live_map_page.toggle_extended_datablocks();
};

$(window).on("popstate", (): void => {
  toggle_pages();
});

window.close_modal = function (): void {
  if (index_acars_page === "/search") {
    $("input").off(); // Turn off the event listener for keys in the search modal
  }
};

window.close_live_map_modal = function (): void {
  live_map_page.close_live_map_modal();
};

window.zoom_in = function (): void {
  live_map_page.zoom_in();
};

window.zoom_out = function (): void {
  live_map_page.zoom_out();
};

window.toggle_unread_messages = function (): void {
  live_map_page.toggle_unread_messages();
};

window.mark_all_messages_read = function (): void {
  live_map_page.mark_all_messages_read();
};

window.query = function (): void {
  search_page.query();
};

window.hide_libseccomp2_warning = function (): void {
  Cookies.set("hide_libseccomp2_warning", "true", { expires: 365 });
  menu.generate_footer();
};

window.reset_alert_counts = function (): void {
  const reset_alerts = confirm(
    "This will reset the alert term counts in your database. This action cannot be undone. Are you sure you want to continue?"
  );
  if (reset_alerts) {
    socket.emit("reset_alert_counts", { reset_alerts: true }, "/main");
  }
};

window.showPlaneMessages = function (
  callsign: string,
  hex: string,
  tail: string
): void {
  if (hex === undefined) {
    console.error("ERROR", callsign, tail);
    return;
  }
  live_map_page.showPlaneMessages(callsign, hex, tail);
};

window.toggleNexrad = function (): void {
  live_map_page.toggle_nexrad();
};

export function showPlaneMessages(
  plane_callsign: string = "",
  plane_hex: string = "",
  plane_tail: string = ""
): void {
  live_map_page.showPlaneMessages(plane_callsign, plane_hex, plane_tail);
}
