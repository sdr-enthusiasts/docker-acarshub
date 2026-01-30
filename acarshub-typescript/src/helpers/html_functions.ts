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

import { acars_msg } from "../interfaces";

export let html_functions = {
  start_message(uid: string) {
    return `<div class="acarshub-message-container" id="${uid}">`;
  },
  end_message() {
    return "</div></div>";
  },

  start_message_tabs: function (): string {
    return '<div class="tabinator">';
  },

  end_message_tabs: function (): string {
    return "</div>";
  },

  create_message_nav_arrows: function (
    tab_to_nav: string,
    unique_id: string,
    direction_back: boolean = true,
  ): string {
    return (
      `<a href="javascript:handle_radio('` +
      tab_to_nav +
      `', '` +
      unique_id +
      `')" id = "tab${unique_id}_${
        direction_back ? "previous" : "next"
      }" class="boxed${direction_back ? "" : " boxed_right_arrow"}">${
        direction_back ? "&lt;&lt;" : "&gt;&gt;"
      }</a>`
    );
  },

  create_message_tab: function (
    tab_uid: string,
    unique_id: string,
    checked: boolean = true,
  ): string {
    return (
      `<input type = "radio" id = "tab${tab_uid}_${unique_id}" class = "tabs_${unique_id}" ${
        checked ? "checked" : ""
      } onclick="handle_radio('` +
      tab_uid +
      `', '` +
      unique_id +
      `')">`
    );
  },

  message_tab_label: function (
    message_number: number,
    matched: boolean,
    tab_uid: string,
    unique_id: string,
  ): string {
    return `<label for = "tab${tab_uid}_${unique_id}" class="msg${message_number}">${
      matched ? '<span class="red_body">' : ""
    }<span class="show_when_big">Message</span><span class="show_when_small">M#</span> ${
      message_number + 1
    }${matched ? "</span>" : ""}</label>`;
  },

  // FIXME: tab uid and checked should be factored out
  message_div: function (
    unique_id: string,
    tab_uid: string,
    checked: boolean = true,
  ): string {
    return `<div id = "message_${unique_id}" class="sub_msg${unique_id}${
      checked ? " checked" : ""
    }">`;
  },

  end_message_div: function (): string {
    return "</div></div></div>";
  },

  message_station_and_type: function (
    message_type: string,
    station_id: string,
    matched: boolean = false,
  ): string {
    return `<div class="msg_line"><span${
      matched ? ' class="red_body left_item"' : ' class="left_item"'
    }><strong>${message_type}</strong> from <strong>${station_id}</strong></span>`;
  },

  prefers24HourClock: function (): boolean {
    const date = new Date(Date.UTC(2020, 0, 1, 20, 0)); // 8:00 PM UTC
    const formatted = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      hourCycle: "h23", // Try to force 24h to detect if it works
      timeZone: "UTC",
    }).format(date);

    return !formatted.match(/AM|PM/i);
  },

  message_timestamp: function (timestamp: Date): string {
    const prefers_24HourClock = this.prefers24HourClock();

    const formatted = timestamp.toLocaleString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: !prefers_24HourClock, // Use 24-hour clock if prefers_24HourClock is true
    });

    return `<span><strong>${formatted}</strong></span></div>`;
  },

  start_message_body: function (): string {
    return '<div class="msg_line"><details><summary>Message Details</summary>';
  },

  end_message_body: function (): string {
    return "</details></div>";
  },

  add_message_field: function (
    field_name: string,
    field_value: string,
    use_br: boolean = true,
  ): string {
    return `${field_name}:&nbsp;<strong>${field_value}</strong>${
      use_br ? "<br>" : ""
    }`;
  },

  add_message_field_with_tooltip: function (
    field_name: string,
    field_value: string,
    tooltip_text: string,
    data_jbox_content: string = "",
  ): string {
    let extra_content = data_jbox_content
      ? ` data-jbox-content="${data_jbox_content}"`
      : "";
    return `<span class="${tooltip_text}"${extra_content}>${field_name}: <strong>${field_value}</strong></span><br>`;
  },

  message_text: function (message: acars_msg): string {
    let html_output: string = '<div class="msg_line">';
    if (message.hasOwnProperty("text") && typeof message.text !== "undefined") {
      let text = message["text"];
      text = text.replace("\\r\\n", "<br>");
      //html_output += "<p>";
      html_output += '<div class="message-container">';

      //html_output += "</p>";
      if (message.hasOwnProperty("decodedText")) {
        //html_output += "<p>";
        let decodedStatus = "Full";
        if (message["decodedText"].decoder.decodeLevel != "full")
          decodedStatus = "Partial";
        html_output += '<div class="text_top">';
        html_output += `<strong>Decoded Text (${decodedStatus}):</strong></p>`;
        html_output += '<pre class="shadow show_strong">';
        html_output +=
          typeof message.matched_text === "object"
            ? this.replace_text(
                message.matched_text,
                this.loop_array(message["decodedText"].formatted),
              )
            : this.loop_array(message["decodedText"].formatted); // get the formatted html of the decoded text
        //html_output += `${message['decodedText'].raw}`;
        html_output += "</pre>";
        html_output += "</div>";
        //html_output += "</p>";
      }

      html_output += message.hasOwnProperty("decodedText")
        ? '<div class="text_top dont_show">'
        : '<div class="text_top">'; // If screen size is too small, and we have decoded text, hide this element
      html_output += "<strong>Non-Decoded Text:</strong><p>";
      html_output += `<pre class="shadow show_strong">${
        typeof message.matched_text === "object"
          ? this.replace_text(message.matched_text, text)
          : text
      }</pre>`;
      html_output += "</div>";
      html_output += "</div>";
    } else if (
      message.hasOwnProperty("data") &&
      typeof message.data !== "undefined"
    ) {
      let data = message["data"];
      data = data.replace("\\r\\n", "<br>");
      html_output += "<p>";
      html_output += `<pre class="shadow show_strong">${data}</pre>`;
      html_output += "</p>";
    } else {
      html_output +=
        '<p><pre class="shadow show_strong"><i>No text</i></pre></p>';
    }

    html_output += "</div>";

    if (message.hasOwnProperty("libacars")) {
      console.log("Libacars message detected:", message["libacars"]);
      let data = message["libacars"];

      // remove all characters before the first {
      data = data.substring(data.indexOf("{"));
      // replace all \\ with nothing
      data = data.replace(/\\/g, "");
      // replace ' with nothing
      data = data.replace(/"'/g, "");
      // replace '\n\s' with nothing
      data = data.replace(/'\n\s'/g, "");
      // make sure the last character is a }, if not, remove everything after the last }
      data = data.substring(0, data.lastIndexOf("}") + 1);

      console.log("Libacars data after processing:", data);
      try {
        // Try to parse the data as JSON
        data = JSON.parse(data);
        html_output += `<div class="msg_line">`;

        // loop through the data object
        html_output += `<pre>${JSON.stringify(data, null, 2)}</pre>`;
      } catch (e) {
        html_output += `<div class="msg_line red">`;
        html_output += `<pre>Error parsing Libacars data: Please see browser console for more details and submit a bug report.</pre>`;
        console.error("Error parsing Libacars data:", e);
      }

      html_output += `</div>`;
    }

    return html_output;
  },

  replace_text: function (input: string[], text: string): string {
    for (let i = 0; i < input.length; i++) {
      text = text
        .split(`${input[i].toUpperCase()}`)
        .join(`<span class="red_body">${input[i].toUpperCase()}</span>`);
    }
    return text;
  },

  loop_array: function (input: any): string {
    let html_output: string = "";

    for (let m in input) {
      if (typeof input[m] === "object") {
        html_output += this.loop_array(input[m]);
      } else {
        if (m === "label") html_output += input[m] + ": ";
        else if (m === "value") {
          html_output += input[m] + "<br>";
        } else if (m === "description") {
          html_output += "Description: " + input[m] + "<br>";
        }
      }
    }

    return html_output;
  },

  show_msg_details: function (message: acars_msg): string {
    let html_output: string = "";

    // field_name: string,
    // field_value: string,
    // use_br: boolean = true

    // Table footer row, metadata
    if (typeof message.ack !== "undefined") {
      html_output += this.add_message_field_with_tooltip(
        "Acknowledgement",
        `${String(message.ack).toUpperCase()}`,
        "ack-tooltip",
      );
    }

    if (typeof message.mode !== "undefined") {
      html_output += this.add_message_field_with_tooltip(
        "Mode",
        `${message.mode}`,
        "mode-tooltip",
      );
    }

    if (typeof message.block_id !== "undefined") {
      html_output += this.add_message_field_with_tooltip(
        "Block ID",
        `${message.block_id}`,
        "blockid-tooltip",
      );
    }

    if (typeof message.msgno !== "undefined") {
      html_output += this.add_message_field_with_tooltip(
        "Message Number",
        `${message.msgno}`,
        "msgno-tooltip",
      );
    }

    if (typeof message.is_response !== "undefined") {
      html_output += this.add_message_field_with_tooltip(
        "Response",
        `${message.is_response}`,
        "response-tooltip",
      );
    }

    if (typeof message.is_onground !== "undefined") {
      // We need to watch this to make sure I have this right. After spelunking through vdlm2dec source code
      // Input always appears to be a 0 or 2...for reasons I don't get. I could have this backwards
      // 0 indicates the plane is airborne
      // 2 indicates the plane is on the ground
      // https://github.com/TLeconte/vdlm2dec/blob/1ea300d40d66ecb969f1f463506859e36f62ef5c/out.c#L457
      // variable naming in vdlm2dec is inconsistent, but "ground" and "gnd" seem to be used
      let is_onground = message["is_onground"] === 0 ? "False" : "True";

      html_output += this.add_message_field_with_tooltip(
        "On Ground",
        `<strong>${is_onground}</strong>`,
        "ground-tooltip",
      );
    }

    if (typeof message.error !== "undefined") {
      if (Number(message.error) !== 0) {
        // html_output += '<span class="error-tooltip"><span style="color:red;">';
        // html_output += `<strong>E: ${
        //   message["error"]
        // }</strong> `;
        // html_output += "</span></span>";

        html_output += this.add_message_field_with_tooltip(
          "Error",
          `<span class="text-red">${message.error}</span>`,
          "error-tooltip",
        );
      }
    }

    return html_output;
  },

  show_footer_and_sidebar_text: function (
    message: acars_msg,
    flight_tracking_url: string,
  ): string {
    let html_output = "";
    html_output += '<div class="msg_line flex-space-between">';
    html_output += "<div>";

    if (typeof message.tail !== "undefined") {
      html_output += `<span class="tail-tooltip">Tail: <strong><a href=\"${flight_tracking_url}${
        message.tail
      }\" target=\"_blank\">${
        typeof message.matched_tail !== "undefined" &&
        typeof message.tail !== "undefined"
          ? this.replace_text(message.matched_tail, message.tail)
          : message.tail
      }</a></strong>${"</span> "}`;
    }

    if (
      typeof message.flight !== "undefined" &&
      typeof message.flight !== "undefined"
    ) {
      html_output +=
        typeof message.matched_flight === "object"
          ? this.replace_text(message.matched_flight, message.flight) + " "
          : message.flight + " ";
    }

    if (typeof message.icao !== "undefined") {
      html_output += '<span class="icao-tooltip">ICAO: <strong>';
      html_output +=
        typeof message.icao_url !== "undefined"
          ? `<a href="${message.icao_url}" target="_blank">`
          : "";
      html_output +=
        typeof message.matched_icao === "object"
          ? this.replace_text(
              message.matched_icao,
              this.ensure_hex_is_uppercase_and_six_chars(
                message.icao.toString(),
              ),
            ) + " "
          : `${message.icao}`;
      html_output +=
        typeof message.icao_hex !== "undefined" &&
        typeof message.matched_icao === "undefined"
          ? `/${this.ensure_hex_is_uppercase_and_six_chars(message.icao_hex)}`
          : "";
      html_output +=
        typeof message.icao_hex !== "undefined" &&
        typeof message.matched_icao !== "undefined" &&
        typeof message.icao_hex !== "undefined"
          ? "/" +
            this.replace_text(
              message.matched_icao,
              this.ensure_hex_is_uppercase_and_six_chars(
                message.icao_hex.toString(),
              ),
            )
          : "";
      html_output +=
        typeof message.icao_url !== "undefined"
          ? `</a></strong></span>${" "}`
          : `</strong></span>${" "}`;
    }

    html_output += "</div>";

    // Right-aligned frequency and level fields
    html_output += '<div class="flex-gap-2">';

    if (typeof message.freq !== "undefined") {
      html_output += this.add_message_field_with_tooltip(
        "Frequency",
        `${message.freq}`,
        "freq-tooltip",
      );
    }

    if (typeof message.level !== "undefined") {
      let level = message.level;
      let circle = "";
      if (level >= -10.0) {
        circle = "circle_green";
      } else if (level >= -20.0) {
        circle = "circle_yellow";
      } else if (level >= -30.0) {
        circle = "circle_orange";
      } else {
        circle = "circle_red";
      }
      html_output += this.add_message_field_with_tooltip(
        "Level",
        `<strong>${level}</strong> <div class="${circle}"></div>`,
        "level-tooltip",
        `The signal level (${level}) of the received message.`,
      );
    }

    html_output += "</div>";
    html_output += "</div>";

    return html_output;
  },

  ensure_hex_is_uppercase_and_six_chars: function (hex: string): string {
    return hex.toUpperCase().padStart(6, "0");
  },
};
