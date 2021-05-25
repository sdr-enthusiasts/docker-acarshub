import { generate_menu, generate_footer } from "./menu.js";

import { set_live_page_urls, live_messages, live_message_active, new_labels, new_acars_message } from "./live_messages.js"
import { set_search_page_urls, search, search_active, database_size_details, database_search_results } from "./search.js"
import { alert_terms, decoders_enabled, set_stats_page_urls, signals, signal_count, signal_freqs, stats, stats_active } from "./stats.js"
import { set_about_page_urls, about, about_active } from "./about.js"
import { set_status_page_urls, status, status_active, status_received } from "./status.js"
import { set_alert_page_urls, alert, alert_active, alerts_acars_message, alerts_terms } from "./alerts.js"
import { labels, system_status, html_msg, terms, database_size, current_search, search_html_msg, decoders, signal, alert_term, signal_freq_data, signal_count_data } from "./interfaces.js"

declare const window: any;
let socket: SocketIOClient.Socket;

let acars_url: string = "";
let acars_path: string = "";
let acars_page: string = "";

const pages: string[] = [
    "/",        // index/live messages
    "/search",  // search page
    "/stats",   // stats page
    "/about",   // about page
    "/status",  // status page
    "/alerts"   // alerts page
]

$(() => { // Document on ready new syntax....or something. Passing a function directly to jquery
    console.log("new page")
    update_url(); // update the urls for everyone
      //connect to the socket server.

    socket = io.connect(`${document.location.origin}/main`, {
        path: acars_path + "socket.io",
    });

    socket.on("labels", function (msg: labels) {  // Msg labels
        new_labels(msg);  // send to live messages
    });

    socket.on("acars_msg", function (msg: html_msg) {  // New acars message.
        new_acars_message(msg); // send the message to live messages
        if(typeof msg.loading == "undefined" || !msg.loading === false)
            alerts_acars_message(msg); // send the message to alerts for processing
    });

    socket.on("terms", function (msg: terms) {
        alerts_terms(msg);  // send the terms over to the alert page
    });

    socket.on("alert_matches", function(msg: html_msg) {
        alerts_acars_message(msg);
    });

    socket.on("database", function (msg: database_size) {
      database_size_details(msg);
    });

    socket.on("database_search_results", function(msg: search_html_msg) {
      database_search_results(msg);
    });

    // stats

    socket.on("decoders_enabled", function(msg: decoders) {
      decoders_enabled(msg);
    });

    // signal level graph
    socket.on("signal", function(msg: signal) {
      signals(msg);
    });

    // alert term graph
    socket.on("alert_terms", function(msg: alert_term) {
      alert_terms(msg);
    });

    // sidebar frequency count
    socket.on("signal_freqs", function(msg: signal_freq_data) {
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

    socket.on("signal_count", function(msg: signal_count_data) {
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
    acars_path = document.location.pathname.replace(
        /about|search|stats|status|alerts/gi,
        ""
      );
    acars_path += acars_path.endsWith("/") ? "" : "/";
    acars_url = document.location.origin + acars_path;

    set_live_page_urls(acars_path, acars_url);
    set_search_page_urls(acars_path, acars_url);
    set_stats_page_urls(acars_path, acars_url);
    set_about_page_urls(acars_path, acars_url);
    set_status_page_urls(acars_path, acars_url);
    set_alert_page_urls(acars_path, acars_url);
}

function toggle_pages() {
    acars_page = "/" + document.location.pathname.replace(acars_path, "");
    for(let page in pages) {
        if(pages[page] === "/" && acars_page === pages[page]) {
            live_message_active(true);
        } else if(pages[page] === "/") {
            live_message_active();
        }
        else if(pages[page] === "/search" && acars_page === pages[page]) {
            search_active(true);
        } else if (pages[page] === "/search") {
            search_active();
        } else if(pages[page] === "/stats" && acars_page === pages[page]) {
            stats_active(true);
        } else if (pages[page] === "/stats") {
            stats_active();
        } else if(pages[page] === "/about" && acars_page === pages[page]) {
            about_active(true);
        } else if (pages[page] === "/about") {
            about_active();
        } else if(pages[page] === "/status" && acars_page === pages[page]) {
            status_active(true);
        } else if (pages[page] === "/status") {
            status_active();
        } else if(pages[page] === "/alerts" && acars_page === pages[page]) {
            alert_active(true);
        } else if (pages[page] === "/alerts") {
            alert_active();
        }
    }
}

window.new_page = function(page: string) {
    document.title = page;
    let sub_url = "";
    if(page === "Live Messages") sub_url = "";
    else if (page === "Search") sub_url = "search";
    else if (page === "Stats") sub_url = "stats";
    else if (page === "About") sub_url = "about";
    else if (page === "Status") sub_url = "status";
    else if (page === "Alerts") sub_url = "alerts";
    window.history.pushState({path:acars_path + sub_url}, page, acars_path + sub_url);
    toggle_pages();
}

function connection_status(connected = false) {
    $("#disconnect").html(
      !connected
        ? ' | <strong><span class="red_body">DISCONNECTED FROM WEB SERVER'
        : ""
    );
  }

// Functions for opening up the socket to the child pages

export function alert_term_query(alert_icao: string[], alert_callsigns: string[], alert_tail: string[]) {
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

export function search_database(current_search: current_search, show_all=false, page=0) {
  if(!show_all)
    socket.emit("query_search", { search_term: current_search, results_after: page }, "/main");
  else {
    socket.emit("query_search", { show_all: true, results_after: page }, "/main");
  }
}

export function signal_grab_freqs() {
  socket.emit("signal_freqs", { freqs: true }, ("/main"));
}

export function signal_grab_message_count() {
  socket.emit("signal_count", { count: true }, ("/main"));
}

export function signal_grab_updated_graphs() {
  socket.emit("signal_graphs", { graphs: true }, ("/main"));
}
