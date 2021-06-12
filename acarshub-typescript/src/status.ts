import {
  status_decoder,
  status_global,
  status_server,
  system_status,
} from "./interfaces";

export let status = {
  status_acars_path: "" as string,
  status_acars_url: "" as string,

  status_page_active: false as boolean,
  current_status: {} as system_status,

  status: function () {
    // Document on ready new syntax....or something. Passing a function directly to jquery
  },

  status_received: function (msg: system_status) {
    this.current_status = msg;

    if (this.status_page_active) this.show_status();
  },

  show_status: function () {
    if (
      typeof this.current_status !== "undefined" &&
      typeof this.current_status.status !== "undefined"
    ) {
      if (this.current_status.status.error_state == true) {
        $("#system_status").html(
          `<a href="javascript:new_page('Status')">System Status: <span class="red_body">Error</a></span>`
        );
      } else {
        $("#system_status").html(
          `<a href="javascript:new_page('Status')">System Status: <span class="green">Okay</a></span>`
        );
      }

      $("#log").html(
        this.decode_status(
          this.current_status.status.error_state,
          this.current_status.status.decoders,
          this.current_status.status.servers,
          this.current_status.status.feeders,
          this.current_status.status.global,
          this.current_status.status.stats
        )
      );
    }
  },
  decode_status: function (
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
      else
        class_string = receivers[key].Status == "Bad" ? "red_body" : "orange";

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
  },

  status_active: function (state = false) {
    this.status_page_active = state;
    if (this.status_page_active) {
      // page is active
      this.set_html();
      this.show_status(); // show the messages we've received
    }
  },

  set_status_page_urls: function (documentPath: string, documentUrl: string) {
    this.status_acars_path = documentPath;
    this.status_acars_url = documentUrl;
  },

  set_html: function () {
    $("#right").html(
      `<div class="fixed_results">
  </div>`
    );

    $("#modal_text").html("");
    $("#page_name").html("");
    $("#log").html("");
  },
};
