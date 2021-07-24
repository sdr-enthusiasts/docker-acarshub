import { version } from "leaflet";
import {
  status_decoder,
  status_global,
  status_server,
  system_status,
  adsb_status,
  acarshub_version,
} from "./interfaces";

export let status = {
  status_acars_path: "" as string,
  status_acars_url: "" as string,

  status_page_active: false as boolean,
  current_status: {} as system_status,
  adsb_status: { adsb_enabled: false, adsb_getting_data: false } as adsb_status,
  current_version: {} as acarshub_version,

  status: function (): void {},

  status_received: function (msg: system_status): void {
    this.current_status = msg;
    this.update_status_bar();
    if (this.status_page_active) this.show_status();
  },

  update_adsb_status(
    adsb_status = {
      adsb_enabled: false,
      adsb_getting_data: false,
    } as adsb_status
  ): void {
    this.adsb_status = adsb_status;
  },

  set_version(version: acarshub_version): void {
    this.current_version = version;
    if (this.status_page_active) this.show_status();
  },

  update_status_bar: function (): void {
    if (
      this.current_status.status.error_state == true ||
      (this.adsb_status.adsb_enabled === true &&
        this.adsb_status.adsb_getting_data === false)
    ) {
      $("#system_status").html(
        `<a href="javascript:new_page('Status')">System Status: <span class="red_body">Error</a></span>`
      );
    } else {
      $("#system_status").html(
        `<a href="javascript:new_page('Status')">System Status: <span class="green">Okay</a></span>`
      );
    }
  },

  show_status: function (): void {
    if (
      typeof this.current_status !== "undefined" &&
      typeof this.current_status.status !== "undefined"
    ) {
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
  ): string {
    let html_output = "<h2>ACARS Hub System Status</h2>";
    const keys_decoder = Object.keys(decoders);
    const keys_servers = Object.keys(servers);
    const keys_receivers = Object.keys(receivers);
    const keys_feeders = Object.keys(feeders);
    const keys_stats = Object.keys(stats);

    html_output += '<span class="monofont">';
    if (this.current_version.container_version) {
      html_output +=
        "Installed ACARS Hub Version:".padEnd(55, ".") +
        `<span class='${
          this.current_version.is_outdated ? "red_body" : "green"
        }'><strong>${
          this.current_version.container_version
        }</span></strong><br>`;
      html_output += this.current_version.is_outdated
        ? "Most Recent ACARS Hub Version:".padEnd(55, ".") +
          `<span class='red_body'><strong>${this.current_version.container_version}</span></strong><br>`
        : "";
    }
    html_output += "System:".padEnd(55, ".");
    if (
      status ||
      (this.adsb_status.adsb_enabled &&
        this.adsb_status.adsb_getting_data === false)
    ) {
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

    let adsb_string = "ADSB Enabled".padEnd(55, ".");
    adsb_string += `<strong><span class="green">${
      this.adsb_status.adsb_enabled ? "OK" : "Disabled"
    }</span></strong><br>`;

    if (this.adsb_status.adsb_enabled) {
      let class_string = "";
      if (this.adsb_status.adsb_getting_data == true) class_string = '"green"';
      else class_string = "red_body";
      let adsb_status_string = "ADSB Receiving Data".padEnd(55, ".");
      adsb_status_string += `<strong><span class=${class_string}>${
        this.adsb_status.adsb_getting_data ? "OK" : "Bad"
      }</span></strong>`;
      adsb_string += adsb_status_string;
    }

    html_output += adsb_string + "</span>";

    return html_output;
  },

  status_active: function (state = false): void {
    this.status_page_active = state;
    if (this.status_page_active) {
      // page is active
      this.set_html();
      this.show_status(); // show the messages we've received
    }
  },

  set_status_page_urls: function (
    documentPath: string,
    documentUrl: string
  ): void {
    this.status_acars_path = documentPath;
    this.status_acars_url = documentUrl;
  },

  set_html: function (): void {
    $("#right").html(
      `<div class="fixed_results">
  </div>`
    );

    $("#modal_text").html("");
    $("#page_name").html("");
    $("#log").html("");
  },
};
