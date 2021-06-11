import { generate_menu, generate_footer, set_adsb } from "./menu.js";

import {
  set_live_page_urls,
  live_messages,
  live_message_active,
  new_labels,
  new_acars_message,
} from "./live_messages.js";
import {
  set_search_page_urls,
  search,
  search_active,
  database_size_details,
  database_search_results,
} from "./search.js";
import {
  alert_terms,
  decoders_enabled,
  set_stats_page_urls,
  signals,
  signal_count,
  signal_freqs,
  stats,
  stats_active,
} from "./stats.js";
import { set_about_page_urls, about, about_active } from "./about.js";
import {
  set_status_page_urls,
  status,
  status_active,
  status_received,
} from "./status.js";
import {
  set_alert_page_urls,
  alert,
  alert_active,
  alerts_acars_message,
  alerts_terms,
} from "./alerts.js";
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
  adsb_plane,
} from "./interfaces.js";

import {
  live_map,
  live_map_active,
  set_live_map_page_urls,
  set_targets,
} from "./live_map.js";

declare const window: any;
let socket: SocketIOClient.Socket;
let socket_status: boolean = false;

let index_acars_url: string = "";
let index_acars_path: string = "";
let index_acars_page: string = "";

let old_window_width: number = 0;

let ADSB: boolean = false;

const pages: string[] = [
  "/", // index/live messages
  "/search", // search page
  "/stats", // stats page
  "/about", // about page
  "/status", // status page
  "/alerts", // alerts page
  "/adsb",
];

var ro = new ResizeObserver((entries) => {
  for (let entry of entries) {
    const cr = entry.contentRect;
    if (cr.width !== old_window_width) {
      old_window_width = cr.width - 38;
      resize_tabs(cr.width - 38);
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
  //connect to the socket server.

  socket = io.connect(`${document.location.origin}/main`, {
    path: index_acars_path + "socket.io",
  });

  socket.on("labels", function (msg: labels) {
    // Msg labels
    new_labels(msg); // send to live messages
  });

  socket.on("acars_msg", function (msg: html_msg) {
    // New acars message.
    new_acars_message(msg); // send the message to live messages
    if (typeof msg.loading == "undefined" || !msg.loading === false)
      alerts_acars_message(msg); // send the message to alerts for processing
  });

  socket.on("adsb", function (msg: adsb) {
    set_targets(msg.planes);
  });

  socket.on("terms", function (msg: terms) {
    alerts_terms(msg); // send the terms over to the alert page
  });

  socket.on("alert_matches", function (msg: html_msg) {
    alerts_acars_message(msg);
  });

  socket.on("database", function (msg: database_size) {
    database_size_details(msg);
  });

  socket.on("database_search_results", function (msg: search_html_msg) {
    database_search_results(msg);
  });

  // stats

  socket.on("features_enabled", function (msg: decoders) {
    decoders_enabled(msg);
    if (msg.adsb.enabled === true) {
      set_adsb(true);
      live_map();
      ADSB = true;
    }
  });

  // signal level graph
  socket.on("signal", function (msg: signal) {
    signals(msg);
  });

  // alert term graph
  socket.on("alert_terms", function (msg: alert_term) {
    alert_terms(msg);
  });

  // sidebar frequency count
  socket.on("signal_freqs", function (msg: signal_freq_data) {
    signal_freqs(msg);
  });

  socket.on("system_status", function (msg: system_status) {
    status_received(msg);
    if (msg.status.error_state == true) {
      $("#system_status").html(
        `<a href="javascript:new_page('Status')">System Status: <span class="red_body">Error</a></span>`
      );
    } else {
      $("#system_status").html(
        `<a href="javascript:new_page('Status')">System Status: <span class="green">Okay</a></span>`
      );
    }
  });

  socket.on("signal_count", function (msg: signal_count_data) {
    signal_count(msg);
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

  generate_menu(); // generate the top menu
  generate_footer(); // generate the footer

  // init all page backgrounding functions
  live_messages();
  search();
  stats();
  about();
  status();
  alert();
  toggle_pages();
});

function update_url() {
  index_acars_path = document.location.pathname.replace(
    /about|search|stats|status|alerts/gi,
    ""
  );
  index_acars_path += index_acars_path.endsWith("/") ? "" : "/";
  index_acars_url = document.location.origin + index_acars_path;

  set_live_page_urls(index_acars_path, index_acars_url);
  set_search_page_urls(index_acars_path, index_acars_url);
  set_stats_page_urls(index_acars_path, index_acars_url);
  set_about_page_urls(index_acars_path, index_acars_url);
  set_status_page_urls(index_acars_path, index_acars_url);
  set_alert_page_urls(index_acars_path, index_acars_url);
  set_live_map_page_urls(index_acars_path, index_acars_url);
}

function toggle_pages() {
  index_acars_page =
    "/" + document.location.pathname.replace(index_acars_path, "");
  for (let page in pages) {
    if (pages[page] === "/" && index_acars_page === pages[page]) {
      $("#live_messages_link").addClass("invert_a");
      live_message_active(true);
    } else if (pages[page] === "/") {
      $("#live_messages_link").removeClass("invert_a");
      live_message_active();
    } else if (pages[page] === "/search" && index_acars_page === pages[page]) {
      $("#search_link").addClass("invert_a");
      search_active(true);
    } else if (pages[page] === "/search") {
      $("#search_link").removeClass("invert_a");
      search_active();
    } else if (pages[page] === "/stats" && index_acars_page === pages[page]) {
      $("#stats_link").addClass("invert_a");
      stats_active(true);
    } else if (pages[page] === "/stats") {
      $("#stats_link").removeClass("invert_a");
      stats_active();
    } else if (pages[page] === "/about" && index_acars_page === pages[page]) {
      about_active(true);
    } else if (pages[page] === "/about") {
      about_active();
    } else if (pages[page] === "/status" && index_acars_page === pages[page]) {
      status_active(true);
    } else if (pages[page] === "/status") {
      status_active();
    } else if (pages[page] === "/alerts" && index_acars_page === pages[page]) {
      $("#alerts_link").addClass("invert_a");
      alert_active(true);
    } else if (pages[page] === "/alerts") {
      $("#alerts_link").removeClass("invert_a");
      alert_active();
    } else if (pages[page] === "/adsb" && index_acars_page === pages[page]) {
      $("#live_map_link").addClass("invert_a");
      live_map_active(true);
    } else if (pages[page] === "/adsb") {
      $("#live_map_link").removeClass("invert_a");
      live_map_active();
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
