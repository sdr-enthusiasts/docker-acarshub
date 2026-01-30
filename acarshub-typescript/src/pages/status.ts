// Copyright (C) 2022-2024 Frederick Clausen II
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

import type {
  acarshub_version,
  adsb_status,
  status_decoder,
  status_external_formats,
  status_global,
  status_server,
  system_status,
} from "../interfaces";
import { ACARSHubPage } from "./master";

export class StatusPage extends ACARSHubPage {
  #adsb_status: adsb_status = {
    adsb_enabled: false,
    adsb_getting_data: false,
  };
  #current_status: system_status = {} as system_status;
  #current_version: acarshub_version = {} as acarshub_version;

  status_received(msg: system_status): void {
    this.#current_status = msg;
    this.update_status_bar();
    if (this.page_active) this.show_status();
  }

  update_adsb_status(
    adsb_status = {
      adsb_enabled: false,
      adsb_getting_data: false,
    } as adsb_status,
  ): void {
    this.#adsb_status = adsb_status;
  }

  set_version(version: acarshub_version): void {
    this.#current_version = version;
    if (this.page_active) this.show_status();
  }

  update_status_bar(): void {
    if (
      this.#current_status.status.error_state === true ||
      (this.#adsb_status.adsb_enabled === true &&
        this.#adsb_status.adsb_getting_data === false)
    ) {
      $("#system_status").html(
        `<a href="javascript:new_page('Status')">System Status: <span class="red_body">Error</a></span>`,
      );
    } else {
      $("#system_status").html(
        `<a href="javascript:new_page('Status')">System Status: <span class="green">Okay</a></span>`,
      );
    }
  }

  show_status(): void {
    if (
      typeof this.#current_status !== "undefined" &&
      typeof this.#current_status.status !== "undefined"
    ) {
      $("#log").html(
        this.decode_status(
          this.#current_status.status.error_state,
          this.#current_status.status.decoders,
          this.#current_status.status.servers,
          this.#current_status.status.global,
          this.#current_status.status.stats,
          this.#current_status.status.external_formats,
        ),
      );
    }
  }

  decode_status(
    status: boolean,
    decoders: status_decoder,
    servers: status_server,
    receivers: status_global,
    stats: status_decoder,
    external_formats: status_external_formats,
  ): string {
    let html_output = "<h2>ACARS Hub System Status</h2>";
    const keys_decoder = Object.keys(decoders);
    const keys_servers = Object.keys(servers);
    const keys_receivers = Object.keys(receivers);
    const keys_stats = Object.keys(stats);
    const keys_external_formats = Object.keys(external_formats);

    html_output += '<span class="monofont">';
    if (this.#current_version.container_version) {
      html_output +=
        "Installed ACARS Hub Version:".padEnd(55, ".") +
        `<span class='${
          this.#current_version.is_outdated ? "red_body" : "green"
        }'><strong>${
          this.#current_version.container_version
        }</span></strong><br>`;
      html_output += this.#current_version.is_outdated
        ? "Most Recent ACARS Hub Version:".padEnd(55, ".") +
          `<span class='red_body'><strong>${
            this.#current_version.github_version
          }</span></strong><br>`
        : "";
    }
    html_output += "System:".padEnd(55, ".");
    if (
      status ||
      (this.#adsb_status.adsb_enabled &&
        this.#adsb_status.adsb_getting_data === false)
    ) {
      html_output += '<strong><span class="red_body">DEGRADED</span></strong>';
    } else {
      html_output += '<strong><span class="green">Ok</span></strong>';
    }
    html_output += "<br>";

    keys_decoder.forEach((key) => {
      const sub_string = `SDR ${key}:`;
      html_output += `${sub_string.padEnd(55, ".")}<strong><span class=${
        decoders[key].Status === "Ok" ? "green" : "red_body"
      }>${decoders[key].Status}</span></strong>`;
      html_output += "<br>";
    });

    keys_servers.forEach((key) => {
      let sub_string = `Internal Server ${key}:`;
      html_output += `${sub_string.padEnd(55, ".")}<strong><span class=${
        servers[key].Status === "Ok" ? "green" : "red_body"
      }>${servers[key].Status}</span></strong>`;
      html_output += "<br>";
      sub_string = `Internal Server ${key} to Python Connection:`;
      html_output += `${sub_string.padEnd(55, ".")}<strong><span class=${
        servers[key].Web === "Ok" ? "green" : "red_body"
      }>${servers[key].Web}</span></strong>`;
      html_output += "<br>";
    });

    keys_stats.forEach((key) => {
      const sub_string = `Internal Stat Server ${key}:`;
      html_output += `${sub_string.padEnd(55, ".")}<strong><span class=${
        stats[key].Status === "Ok" ? "green" : "red_body"
      }>${stats[key].Status}</span></strong>`;
      html_output += "<br>";
    });

    keys_external_formats.forEach((key) => {
      const decoder_types = external_formats[key];
      decoder_types.forEach((sub_key) => {
        const sub_string = `External Decoder ${key}/${sub_key.type}:`;
        html_output += `${sub_string.padEnd(55, ".")}<strong><span class=${
          sub_key.Status === "Ok" ? "green" : "red_body"
        }>${sub_key.Status}</span></strong>`;
        html_output += "<br>";
      });
    });

    keys_receivers.forEach((key) => {
      const sub_string = `${key} Received ${receivers[key].Count} Messages In the Last Hour:`;
      let class_string = "";
      if (receivers[key].Status === "Ok") class_string = '"green"';
      else
        class_string = receivers[key].Status === "Bad" ? "red_body" : "orange";

      html_output += `${sub_string.padEnd(
        55,
        ".",
      )}<strong><span class=${class_string}>${
        receivers[key].Status
      }</span></strong>`;
      html_output += "<br>";
    });

    let adsb_string = "ADSB Enabled".padEnd(55, ".");
    adsb_string += `<strong><span class="green">${
      this.#adsb_status.adsb_enabled ? "OK" : "Disabled"
    }</span></strong><br>`;

    if (this.#adsb_status.adsb_enabled) {
      let class_string = "";
      if (this.#adsb_status.adsb_getting_data === true)
        class_string = '"green"';
      else class_string = "red_body";
      let adsb_status_string = "ADSB Receiving Data".padEnd(55, ".");
      adsb_status_string += `<strong><span class=${class_string}>${
        this.#adsb_status.adsb_getting_data ? "OK" : "Bad"
      }</span></strong>`;
      adsb_string += adsb_status_string;
    }

    html_output += adsb_string + "</span>";

    return html_output;
  }

  active(state = false): void {
    super.active(state);

    if (this.page_active) {
      // page is active
      this.set_html();
      this.show_status(); // show the messages we've received
    }
  }

  set_html(): void {
    $("#right").html(
      `<div class="fixed_results">
  </div>`,
    );

    $("#modal_text").html(
      '<a href="javascript:show_page_modal()">Settings</a>',
    );
    $("#log").html("");
  }
}
