import { menu } from "./menu.js";

import { live_messages_page } from "./live_messages.js";
import { search_page } from "./search.js";
import { stats_page } from "./stats.js";
import { about } from "./about.js";
import { status } from "./status.js";
import { alerts_page } from "./alerts.js";
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
} from "./interfaces.js";

import { live_map_page } from "./live_map.js";

declare const window: any;
let socket: SocketIOClient.Socket;
let socket_status: boolean = false;

let index_acars_url: string = "";
let index_acars_path: string = "";
let index_acars_page: string = "";

let old_window_width: number = 0;
let old_window_height: number = 0;

let adsb_url: string = "";
let adsb_enabled: boolean = false;
let adsb_getting_data: boolean = false;

const pages: string[] = [
  "/", // index/live messages
  "/search", // search page
  "/stats", // stats page
  "/about", // about page
  "/status", // status page
  "/alerts", // alerts page
  "/adsb", // live_map page
];

var ro = new ResizeObserver((entries) => {
  for (let entry of entries) {
    const cr = entry.contentRect;
    if (cr.width !== old_window_width) {
      old_window_width = cr.width - 38;
      if (index_acars_page === "/") resize_tabs(cr.width - 38);
      else if (index_acars_page === "/adsb")
        live_map_page.updateModalSize({
          width: cr.width,
          height: cr.height,
        } as window_size);
    }

    if (cr.height !== old_window_height) {
      old_window_height = cr.height - 200;
    }
  }
});

export function resize_tabs(
  window_width: number = 0,
  set_new_width: boolean = true
) {
  if (set_new_width && (!window_width || window_width <= 0))
    window_width = old_window_width;

  // set tab width. 39 is the width of the two arrow elements to the left
  const num_tabs = window_width > 1050 ? 10 : window_width > 400 ? 5 : 3;
  $(".tabinator label").css("width", `${window_width / num_tabs}`);
  $(".boxed").css("width", `${window_width / num_tabs / 2}`);
}

$(() => {
  // Document on ready new syntax....or something. Passing a function directly to jquery
  console.log("new page");
  $("#log").html("Page loading.....please wait");
  // Observe one or multiple elements
  // @ts-expect-error
  ro.observe(document.querySelector("body"));
  update_url(); // update the urls for everyone
  adsb_url = index_acars_url + "data/aircraft.json";
  //connect to the socket server.

  socket = io.connect(`${document.location.origin}/main`, {
    path: index_acars_path + "socket.io",
  });

  socket.on("labels", function (msg: labels) {
    // Msg labels
    live_messages_page.new_labels(msg); // send to live messages
  });

  socket.on("acars_msg", function (msg: html_msg) {
    // New acars message.
    live_messages_page.new_acars_message(msg); // send the message to live messages
    if (typeof msg.loading == "undefined" || !msg.loading === false)
      alerts_page.alerts_acars_message(msg); // send the message to alerts for processing
  });

  socket.on("terms", function (msg: terms) {
    alerts_page.alerts_terms(msg); // send the terms over to the alert page
  });

  socket.on("alert_matches", function (msg: html_msg) {
    alerts_page.alerts_acars_message(msg);
  });

  socket.on("database", function (msg: database_size) {
    search_page.database_size_details(msg);
  });

  socket.on("database_search_results", function (msg: search_html_msg) {
    search_page.database_search_results(msg);
  });

  // stats

  socket.on("features_enabled", function (msg: decoders) {
    stats_page.decoders_enabled(msg);
    if (msg.adsb.enabled === true) {
      menu.set_adsb(true);
      toggle_pages();
      alerts_page.updateAlertCounter();
      live_map_page.live_map(msg.adsb.lat, msg.adsb.lon);
      adsb_enabled = true;

      status.update_adsb_status({
        adsb_enabled: true,
        adsb_getting_data: true,
      });

      if (msg.adsb.bypass) adsb_url = msg.adsb.url;
      setInterval(() => {
        fetch(adsb_url, {
          method: "GET",
          mode: "cors",
        })
          .then((response) => {
            adsb_getting_data = true;
            return response.json();
          })
          .then((planes) => live_map_page.set_targets(planes.aircraft))
          .catch((err) => {
            adsb_getting_data = false;
            status.update_adsb_status({
              adsb_enabled: true,
              adsb_getting_data: false,
            });
            status.update_status_bar();
            console.error(err);
          });
      }, 5000);
    }
  });

  // signal level graph
  socket.on("signal", function (msg: signal) {
    stats_page.signals(msg);
  });

  // alert term graph
  socket.on("alert_terms", function (msg: alert_term) {
    stats_page.alert_terms(msg);
  });

  // sidebar frequency count
  socket.on("signal_freqs", function (msg: signal_freq_data) {
    stats_page.signal_freqs(msg);
  });

  socket.on("system_status", function (msg: system_status) {
    status.status_received(msg);
  });

  socket.on("signal_count", function (msg: signal_count_data) {
    stats_page.signal_count(msg);
  });

  // socket errors

  socket.on("disconnect", function () {
    connection_status();
  });

  socket.on("connect_error", function () {
    connection_status();
  });

  socket.on("connect_timeout", function () {
    connection_status();
  });

  socket.on("connect", function () {
    connection_status(true);
  });

  socket.on("reconnect", function () {
    connection_status(true);
  });

  // time to set everything on the page up

  menu.generate_menu(); // generate the top menu
  menu.generate_footer(); // generate the footer

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

  document.addEventListener("keyup", function () {
    search_page.key_event();
  });
});

export function get_window_size() {
  return { width: old_window_width, height: old_window_height } as window_size;
}

function update_url() {
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

function toggle_pages() {
  index_acars_page =
    "/" + document.location.pathname.replace(index_acars_path, "");
  live_map_page.plane_message_modal.close();
  for (let page in pages) {
    if (pages[page] === "/" && index_acars_page === pages[page]) {
      $("#live_messages_link").addClass("invert_a");
      live_messages_page.live_message_active(true);
    } else if (pages[page] === "/") {
      $("#live_messages_link").removeClass("invert_a");
      live_messages_page.live_message_active();
    } else if (pages[page] === "/search" && index_acars_page === pages[page]) {
      $("#search_link").addClass("invert_a");
      search_page.search_active(true);
    } else if (pages[page] === "/search") {
      $("#search_link").removeClass("invert_a");
      search_page.search_active();
    } else if (pages[page] === "/stats" && index_acars_page === pages[page]) {
      $("#stats_link").addClass("invert_a");
      stats_page.stats_active(true);
    } else if (pages[page] === "/stats") {
      $("#stats_link").removeClass("invert_a");
      stats_page.stats_active();
    } else if (pages[page] === "/about" && index_acars_page === pages[page]) {
      about.about_active(true);
    } else if (pages[page] === "/about") {
      about.about_active();
    } else if (pages[page] === "/status" && index_acars_page === pages[page]) {
      status.status_active(true);
    } else if (pages[page] === "/status") {
      status.status_active();
    } else if (pages[page] === "/alerts" && index_acars_page === pages[page]) {
      $("#alerts_link").addClass("invert_a");
      alerts_page.alert_active(true);
    } else if (pages[page] === "/alerts") {
      $("#alerts_link").removeClass("invert_a");
      alerts_page.alert_active();
    } else if (pages[page] === "/adsb" && index_acars_page === pages[page]) {
      $("#live_map_link").addClass("invert_a");
      live_map_page.live_map_active(true);
    } else if (pages[page] === "/adsb") {
      $("#live_map_link").removeClass("invert_a");
      live_map_page.live_map_active();
    }
  }
}

window.new_page = function (page: string) {
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

function connection_status(connected = false) {
  socket_status = connected;
  $("#disconnect").html(
    !connected
      ? ' | <strong><span class="red_body">DISCONNECTED FROM WEB SERVER'
      : ""
  );
}

// Functions for opening up the socket to the child pages

export function alert_term_query(
  alert_icao: string[],
  alert_callsigns: string[],
  alert_tail: string[]
) {
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

export function alert_text_update(alert_text: string[]) {
  socket.emit(
    "update_alerts",
    {
      terms: alert_text,
    },
    "/alerts"
  );
}

export function search_database(
  current_search: current_search,
  show_all = false,
  page = 0
) {
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

export function signal_grab_freqs() {
  socket.emit("signal_freqs", { freqs: true }, "/main");
}

export function signal_grab_message_count() {
  socket.emit("signal_count", { count: true }, "/main");
}

export function signal_grab_updated_graphs() {
  socket.emit("signal_graphs", { graphs: true }, "/main");
}

export function is_connected() {
  return socket_status;
}

// functions to pass values between objects

export function match_alert(msg: html_msg) {
  return alerts_page.match_alert(msg);
}

export function sound_alert() {
  alerts_page.sound_alert();
}

export function generate_stat_submenu(
  acars: boolean = false,
  vdlm: boolean = false
) {
  menu.generate_stat_submenu(acars, vdlm);
}

export function find_matches() {
  return live_messages_page.find_matches();
}

export function get_match(
  callsign: string = "",
  hex: string = "",
  tail: string = ""
) {
  return live_messages_page.get_match(callsign, hex, tail);
}

// functions that need to be registered to window object

window.show_page_modal = function () {
  if (index_acars_page === "/alerts") {
    alerts_page.show_alert_message_modal();
  } else if (index_acars_page === "/search") {
    search_page.show_search_message_modal();
  } else if (index_acars_page === "/") {
    live_messages_page.show_live_message_modal();
  }
};
window.updateAlerts = function () {
  alerts_page.updateAlerts();
};
window.default_alert_values = function () {
  alerts_page.default_alert_values();
};
window.toggle_playsound = function (status: boolean) {
  alerts_page.toggle_playsound(status);
};
window.update_prefix = function (prefix: string) {
  stats_page.update_prefix(prefix);
};

window.showall = function () {
  search_page.showall();
};

window.jumppage = function () {
  search_page.jumppage();
};

window.runclick = function (page: number) {
  search_page.runclick(page);
};

window.handle_radio = function (element_id: string, uid: string) {
  live_messages_page.handle_radio(element_id, uid);
};

window.pause_updates = function (toggle_pause: boolean = true) {
  live_messages_page.pause_updates(toggle_pause);
};

window.filter_notext = function (toggle_filter: boolean = true) {
  live_messages_page.filter_notext(toggle_filter);
};

window.toggle_label = function (key: string) {
  live_messages_page.toggle_label(key);
};

$(window).on("popstate", () => {
  toggle_pages();
});

export function showPlaneMessages(
  plane_callsign: string = "",
  plane_hex: string = "",
  plane_tail: string = ""
) {
  live_map_page.showPlaneMessages(plane_callsign, plane_hex, plane_tail);
}
