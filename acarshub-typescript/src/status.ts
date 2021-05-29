import {
  status_decoder,
  status_global,
  status_server,
  system_status,
} from "./interfaces";

let acars_path = "";
let acars_url = "";

let page_active = false;
let current_status: system_status;

export function status() {
  // Document on ready new syntax....or something. Passing a function directly to jquery
}

export function status_received(msg: system_status) {
  current_status = msg;

  if (page_active) show_status();
}

function show_status() {
  if (typeof current_status !== "undefined") {
    if (current_status.status.error_state == true) {
      $("#system_status").html(
        `<a href="javascript:new_page('Status')">System Status: <span class="red_body">Error</a></span>`
      );
    } else {
      $("#system_status").html(
        `<a href="javascript:new_page('Status')">System Status: <span class="green">Okay</a></span>`
      );
    }

    $("#log").html(
      decode_status(
        current_status.status.error_state,
        current_status.status.decoders,
        current_status.status.servers,
        current_status.status.feeders,
        current_status.status.global,
        current_status.status.stats
      )
    );
  }
}
function decode_status(
  status: boolean,
  decoders: status_decoder,
  servers: status_server,
  feeders: status_decoder,
  receivers: status_global,
  stats: status_decoder
) {
  let html_output = "<h2>ACARS Hub System Status</h2>";
  const keys_decoder = Object.keys(decoders);
  const keys_servers = Object.keys(servers);
  const keys_receivers = Object.keys(receivers);
  const keys_feeders = Object.keys(feeders);
  const keys_stats = Object.keys(stats);

  html_output += '<span class="monofont">';
  html_output += "System:".padEnd(55, ".");
  if (status) {
    html_output += '<strong><span class="red_body">DEGRADED</span></strong>';
  } else {
    html_output += '<strong><span class="green">Ok</span></strong>';
  }
  html_output += "<br>";

  keys_decoder.forEach((key) => {
    let sub_string = `SDR ${key}:`;
    html_output += `${sub_string.padEnd(55, ".")}<strong><span class=${
      decoders[key].Status == "Ok" ? "green" : "red_body"
    }>${decoders[key].Status}</span></strong>`;
    html_output += "<br>";
  });

  keys_servers.forEach((key) => {
    let sub_string = `Internal Server ${key}:`;
    html_output += `${sub_string.padEnd(55, ".")}<strong><span class=${
      servers[key].Status == "Ok" ? "green" : "red_body"
    }>${servers[key].Status}</span></strong>`;
    html_output += "<br>";
    sub_string = `Internal Server ${key} to Python Connection:`;
    html_output += `${sub_string.padEnd(55, ".")}<strong><span class=${
      servers[key].Web == "Ok" ? "green" : "red_body"
    }>${servers[key].Web}</span></strong>`;
    html_output += "<br>";
  });

  keys_stats.forEach((key) => {
    let sub_string = `Internal Stat Server ${key}:`;
    html_output += `${sub_string.padEnd(55, ".")}<strong><span class=${
      stats[key].Status == "Ok" ? "green" : "red_body"
    }>${stats[key].Status}</span></strong>`;
    html_output += "<br>";
  });

  keys_feeders.forEach((key) => {
    let sub_string = `Airframes.io Feeders ${key}:`;
    html_output += `${sub_string.padEnd(55, ".")}<strong><span class=${
      feeders[key].Status == "Ok" ? "green" : "red_body"
    }>${feeders[key].Status}</span></strong>`;
    html_output += "<br>";
  });

  keys_receivers.forEach((key) => {
    let sub_string = `${key} Received ${receivers[key].Count} Messages In the Last Hour:`;
    let class_string = "";
    if (receivers[key].Status == "Ok") class_string = '"green"';
    else class_string = receivers[key].Status == "Bad" ? "red_body" : "orange";

    html_output += `${sub_string.padEnd(
      55,
      "."
    )}<strong><span class=${class_string}>${
      receivers[key].Status
    }</span></strong>`;
    html_output += "<br>";
  });

  html_output += "</span>";

  return html_output;
}

export function status_active(state = false) {
  page_active = state;
  if (page_active) {
    // page is active
    set_html();
    show_status(); // show the messages we've received
  }
}

export function set_status_page_urls(
  documentPath: string,
  documentUrl: string
) {
  acars_path = documentPath;
  acars_url = documentUrl;
}

function set_html() {
  $("#right").html(
    `<div class="fixed_results">
</div>`
  );

  $("#modal_text").html("");
  $("#page_name").html("");
  $("#log").html("");
}
