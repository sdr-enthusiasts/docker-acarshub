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

import type { acars_msg } from "../interfaces";

export const html_functions = {
  start_message(uid: string) {
    return `<div class="acarshub-message-container" id="${uid}">`;
  },
  end_message() {
    return "</div></div>";
  },

  start_message_tabs: (): string => '<div class="tabinator">',

  end_message_tabs: (): string => "</div>",

  create_message_nav_arrows: (
    tab_to_nav: string,
    unique_id: string,
    direction_back: boolean = true,
  ): string =>
    `<a href="javascript:handle_radio('` +
    tab_to_nav +
    `', '` +
    unique_id +
    `')" id = "tab${unique_id}_${
      direction_back ? "previous" : "next"
    }" class="boxed${direction_back ? "" : " boxed_right_arrow"}">${
      direction_back ? "&lt;&lt;" : "&gt;&gt;"
    }</a>`,

  create_message_tab: (
    tab_uid: string,
    unique_id: string,
    checked: boolean = true,
  ): string =>
    `<input type = "radio" id = "tab${tab_uid}_${unique_id}" class = "tabs_${unique_id}" ${
      checked ? "checked" : ""
    } onclick="handle_radio('` +
    tab_uid +
    `', '` +
    unique_id +
    `')">`,

  message_tab_label: (
    message_number: number,
    matched: boolean,
    tab_uid: string,
    unique_id: string,
  ): string =>
    `<label for = "tab${tab_uid}_${unique_id}" class="msg${message_number}">${
      matched ? '<span class="red_body">' : ""
    }<span class="show_when_big">Message</span><span class="show_when_small">M#</span> ${
      message_number + 1
    }${matched ? "</span>" : ""}</label>`,

  // FIXME: tab uid and checked should be factored out
  message_div: (
    unique_id: string,
    _tab_uid: string,
    checked: boolean = true,
  ): string =>
    `<div id = "message_${unique_id}" class="sub_msg${unique_id}${
      checked ? " checked" : ""
    }">`,

  end_message_div: (): string => "</div></div></div>",

  message_station_and_type: (
    message_type: string,
    station_id: string,
    matched: boolean = false,
  ): string =>
    `<div class="msg_line"><span${
      matched ? ' class="red_body left_item"' : ' class="left_item"'
    }><strong>${message_type}</strong> from <strong>${station_id}</strong></span>`,

  prefers24HourClock: (): boolean => {
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

  start_message_body: (): string =>
    '<div class="msg_line"><details><summary>Message Details</summary>',

  end_message_body: (): string => "</details></div>",

  add_message_field: (
    field_name: string,
    field_value: string,
    use_br: boolean = true,
  ): string =>
    `${field_name}:&nbsp;<strong>${field_value}</strong>${
      use_br ? "<br>" : ""
    }`,

  add_message_field_with_tooltip: (
    field_name: string,
    field_value: string,
    tooltip_text: string,
    data_jbox_content: string = "",
  ): string => {
    const extra_content = data_jbox_content
      ? ` data-jbox-content="${data_jbox_content}"`
      : "";
    return `<span class="${tooltip_text}"${extra_content}>${field_name}: <strong>${field_value}</strong></span><br>`;
  },

  format_libacars_frequency_data: (data: any): string => {
    let html = '<div class="libacars-freq-data">';
    html += "<strong>Ground Station Frequency Information:</strong><br>";

    if (data.freq_data && Array.isArray(data.freq_data)) {
      for (const station of data.freq_data) {
        if (station.gs?.name) {
          html += `<div style="margin-left: 20px; margin-top: 10px;">`;
          html += `<strong>${station.gs.name}</strong>`;

          if (
            station.listening_on_freqs &&
            station.listening_on_freqs.length > 0
          ) {
            html += `<br><span style="margin-left: 20px;">Listening on: `;
            const freqs = station.listening_on_freqs
              .map((f: any) => `${f.freq} kHz`)
              .join(", ");
            html += `${freqs}</span>`;
          }

          if (station.heard_on_freqs && station.heard_on_freqs.length > 0) {
            html += `<br><span style="margin-left: 20px;">Heard on: `;
            const heard = station.heard_on_freqs
              .map((f: any) => `${f.freq} kHz`)
              .join(", ");
            html += `${heard}</span>`;
          }

          html += `</div>`;
        }
      }
    }

    html += "</div>";
    return html;
  },

  format_libacars_value: function (
    key: string,
    value: any,
    indent: number = 0,
  ): string {
    let html = "";
    const indentStyle = `margin-left: ${indent * 20}px;`;

    // Format the key nicely (convert snake_case to Title Case)
    const formattedKey = key
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    if (value === null || value === undefined) {
      html += `<div style="${indentStyle}"><strong>${formattedKey}:</strong> <em>null</em></div>`;
    } else if (typeof value === "boolean") {
      html += `<div style="${indentStyle}"><strong>${formattedKey}:</strong> ${value ? "Yes" : "No"}</div>`;
    } else if (typeof value === "number" || typeof value === "string") {
      // Special formatting for specific fields
      if (key === "timestamp" && typeof value === "object") {
        // This is handled in the object case below
      } else {
        html += `<div style="${indentStyle}"><strong>${formattedKey}:</strong> ${value}</div>`;
      }
    } else if (Array.isArray(value)) {
      html += `<div style="${indentStyle}"><strong>${formattedKey}:</strong></div>`;
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === "object" && value[i] !== null) {
          html += `<div style="margin-left: ${(indent + 1) * 20}px;"><em>Item ${i + 1}:</em></div>`;
          for (const [subKey, subValue] of Object.entries(value[i])) {
            html += this.format_libacars_value(subKey, subValue, indent + 2);
          }
        } else {
          html += `<div style="margin-left: ${(indent + 1) * 20}px;">• ${value[i]}</div>`;
        }
      }
    } else if (typeof value === "object") {
      // Special handling for timestamp objects
      if (
        value.hour !== undefined &&
        value.min !== undefined &&
        value.sec !== undefined
      ) {
        html += `<div style="${indentStyle}"><strong>${formattedKey}:</strong> ${String(value.hour).padStart(2, "0")}:${String(value.min).padStart(2, "0")}:${String(value.sec).padStart(2, "0")} UTC</div>`;
      } else {
        html += `<div style="${indentStyle}"><strong>${formattedKey}:</strong></div>`;
        for (const [subKey, subValue] of Object.entries(value)) {
          html += this.format_libacars_value(subKey, subValue, indent + 1);
        }
      }
    }

    return html;
  },

  format_libacars_cpdlc: function (data: any): string {
    let html = '<div class="libacars-cpdlc">';
    html += "<strong>CPDLC Message:</strong><br>";

    // Loop through all fields in the data
    for (const [key, value] of Object.entries(data)) {
      html += this.format_libacars_value(key, value, 1);
    }

    html += "</div>";
    return html;
  },

  format_libacars_generic: function (data: any): string {
    console.log("Processing Generic: ", data);
    let html = '<div class="libacars-generic">';
    html += "<strong>Decoded Libacars Data:</strong><br>";

    // Use format_libacars_value to handle all fields including nested objects
    for (const [key, value] of Object.entries(data)) {
      html += this.format_libacars_value(key, value, 1);
    }

    html += `</div>`;
    return html;
  },

  format_decoded_text: function (message: acars_msg): string {
    let html = '<div class="text_top">';
    let decodedStatus = "Full";
    if (message.decodedText.decoder.decodeLevel !== "full")
      decodedStatus = "Partial";
    html += `<strong>Decoded Text (${decodedStatus}):</strong></p>`;
    html += '<pre class="shadow show_strong">';
    html +=
      typeof message.matched_text === "object"
        ? this.replace_text(
            message.matched_text,
            this.loop_array(message.decodedText.formatted),
          )
        : this.loop_array(message.decodedText.formatted);
    html += "</pre>";
    html += "</div>";
    return html;
  },

  format_non_decoded_text: function (
    text: string,
    matched_text?: string[] | object,
    hideOnSmallScreen: boolean = false,
  ): string {
    let html = hideOnSmallScreen
      ? '<div class="text_top dont_show">'
      : '<div class="text_top">';
    html += "<strong>Non-Decoded Text:</strong><p>";
    html += `<pre class="shadow show_strong">${
      typeof matched_text === "object"
        ? this.replace_text(matched_text as string[], text)
        : text
    }</pre>`;
    html += "</div>";
    return html;
  },

  format_data: function (
    data: string,
    matched_text?: string[] | object,
  ): string {
    // Format newlines properly for display
    const formatted_data = data.replace(/\\r\\n/g, "<br>");

    let html = '<div class="message-container">';
    html += '<div class="text_top">';
    html += "<strong>Data:</strong><p>";
    html += `<pre class="shadow show_strong">${
      typeof matched_text === "object"
        ? this.replace_text(matched_text as string[], formatted_data)
        : formatted_data
    }</pre>`;
    html += "</div>";
    html += "</div>";
    return html;
  },

  message_text: function (message: acars_msg): string {
    let html_output: string = '<div class="msg_line">';
    if (Object.hasOwn(message, "text") && typeof message.text !== "undefined") {
      let text = message.text;
      text = text.replace("\\r\\n", "<br>");
      html_output += '<div class="message-container">';

      if (Object.hasOwn(message, "decodedText")) {
        html_output += this.format_decoded_text(message);
      }

      html_output += this.format_non_decoded_text(
        text,
        message.matched_text,
        Object.hasOwn(message, "decodedText"),
      );
      html_output += "</div>";
    } else if (
      Object.hasOwn(message, "data") &&
      typeof message.data !== "undefined"
    ) {
      html_output += this.format_data(message.data, message.matched_text);
    } else {
      html_output +=
        '<p><pre class="shadow show_strong"><i>No text</i></pre></p>';
    }

    html_output += "</div>";

    if (Object.hasOwn(message, "libacars")) {
      console.log("Libacars message detected:", message.libacars);
      let data = message.libacars as string;

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

      try {
        // Try to parse the data as JSON
        const parsed_data = JSON.parse(data);
        html_output += `<div class="msg_line">`;
        html_output += `<div class="message-container">`;
        html_output += `<div class="text_top">`;
        html_output += `<pre class="shadow show_strong">`;

        // Determine the type of libacars message and format accordingly
        if (parsed_data.freq_data) {
          html_output += this.format_libacars_frequency_data(parsed_data);
        } else if (parsed_data.msg_type?.includes("cpdlc")) {
          html_output += this.format_libacars_cpdlc(parsed_data);
        } else {
          // Generic formatter for unknown types
          html_output += this.format_libacars_generic(parsed_data);
        }

        html_output += `</pre>`;
        html_output += `</div>`;
        html_output += `</div>`;
        html_output += `</div>`;
      } catch (e) {
        html_output += `<div class="msg_line red">`;
        html_output += `<pre class="shadow show_strong">Error parsing Libacars data: Please see browser console for more details and submit a bug report.</pre>`;
        console.error("Error parsing Libacars data:", e);
        html_output += `</div>`;
      }
    }

    return html_output;
  },

  replace_text: (input: string[], text: string): string => {
    for (let i = 0; i < input.length; i++) {
      text = text
        .split(`${input[i].toUpperCase()}`)
        .join(`<span class="red_body">${input[i].toUpperCase()}</span>`);
    }
    return text;
  },

  // biome-ignore lint/suspicious/noExplicitAny: handles recursive dynamic structures
  loop_array: function (input: any): string {
    let html_output: string = "";

    for (const m in input) {
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
      const is_onground = message.is_onground === 0 ? "False" : "True";

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
      html_output += `<span class="tail-tooltip">Tail: <strong><a href="${flight_tracking_url}${
        message.tail
      }" target="_blank">${
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
      const level = message.level;
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

  ensure_hex_is_uppercase_and_six_chars: (hex: string): string =>
    hex.toUpperCase().padStart(6, "0"),
};
