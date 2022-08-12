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

import { acars_msg, plane } from "src/interfaces";
import { get_setting } from "../acarshub";
import { feet_to_meters } from "./math_conversions";
import { images } from "../assets/assets";

export function generate_messages_html_from_planes(
  planes: plane[] | undefined = undefined
): string {
  let output: string = "";
  if (typeof planes === "undefined" || planes.length === 0) {
    console.error("No planes. Nothing to display.");
    return "";
  }

  planes.forEach((plane) => {
    if (typeof plane !== "undefined") {
      output += generate_message_group_html_from_plane(plane);
    }
  });

  return output;
}

export function generate_message_group_html_from_plane(
  planes: plane | undefined = undefined,
  create_container = true
): string {
  if (!planes || planes.messages.length === 0) {
    console.error("No messages. Nothing to display.");
    return "";
  }
  let output = "";
  if (create_container)
    output = `<div id="${planes.uid}_container" class="acars_message_container">`;

  planes.messages.every((message, index) => {
    if (message.uid == planes.selected_tab) {
      if (planes.messages.length > 1) {
        output += `<div class="acars_message_row no_bottom_margin"><div class="message_buttons">`;
        output += `<button id="${planes.uid}_button_left" class="nav-button" onclick="nav_left('${planes.uid}')" role="button">${images.arrow_left}</button>`;
        output += `<button id="${planes.uid}_button_right" class="nav-button" onclick="nav_right('${planes.uid}')" role="button">${images.arrow_right}</button>`;
        output += `<strong>&nbspMessage ${index + 1} of ${
          planes.messages.length
        }</strong>`;
        output += `</div></div>`;
      }

      output += generate_message_html(
        message,
        planes,
        planes.messages.length > 1 ? false : true
      );
      return false;
    }
    return true;
  });

  if (create_container) output += "</div>";

  return output;
}

function generate_message_html(
  acars_message: acars_msg,
  planes: plane,
  round_corners: boolean
): string {
  let output = "";
  // TODO: from_addr may be the ICAO Hex of the plane....investigate

  output += `<div class="acars_message${
    round_corners ? " rounded_corners" : ""
  }">`;
  output += generate_message_body(acars_message, planes);
  output += `</div></div>`;

  return output;
}

function generate_message_body(
  acars_message: acars_msg,
  planes: plane
): string {
  let output = "";

  output += `<div class="acars_message_row">`;
  output += `<div class="message_body">`;

  let timestamp = undefined;
  if (has_field(acars_message, "timestamp"))
    timestamp = new Date(acars_message.timestamp * 1000);
  else
    timestamp = new Date(
      (typeof acars_message.msg_time !== "undefined"
        ? acars_message.msg_time
        : 0) * 1000
    );

  output += `<strong>${acars_message.message_type}</strong> from <strong>${acars_message.station_id}</strong><br>`;
  output += `<strong>Message Time:</strong> ${timestamp.toLocaleString()}<br>`;

  if (has_field(acars_message, "duplicates")) {
    output += `<strong>Duplicates received:</strong> ${acars_message.duplicates}<br>`;
  }

  if (has_field(acars_message, "msgno_parts")) {
    output += `<strong>Message Parts:</strong> ${acars_message.msgno_parts}<br>`;
  }

  if (has_field(acars_message, "label")) {
    output += `<strong>Message Label:</strong> ${acars_message.label}${
      has_field(acars_message, "label_type")
        ? " (" + acars_message.label_type + ")"
        : ""
    }<br>`;
  }

  if (has_field(acars_message, "toaddr")) {
    output += `<strong>To Address:</strong> ${acars_message.toaddr}/${
      has_field(acars_message, "toaddr_hex") ? acars_message.toaddr_hex : "?"
    }<br>`;
  }

  if (has_field(acars_message, "toaddr_decoded")) {
    output += `<strong>To Address Station ID:</strong> ${acars_message.toaddr_decoded}<br>`;
  }

  if (has_field(acars_message, "fromaddr")) {
    output += `<strong>From Address:</strong> ${acars_message.fromaddr}/${
      has_field(acars_message, "fromaddr_hex")
        ? acars_message.fromaddr_hex
        : "?"
    }<br>`;
  }

  if (has_field(acars_message, "fromaddr_decoded")) {
    output += `<strong>From Address Station ID:</strong> ${acars_message.fromaddr_decoded}<br>`;
  }

  if (has_field(acars_message, "depa")) {
    output += `<strong>Departure Airport:</strong> ${acars_message.depa}<br>`;
  }

  if (has_field(acars_message, "dsta")) {
    output += `<strong>Destination Airport:</strong> ${acars_message.dsta}<br>`;
  }

  if (has_field(acars_message, "eta")) {
    output += `<strong>Estimated Arrival Time:</strong> ${acars_message.eta}<br>`;
  }

  if (has_field(acars_message, "gtout")) {
    output += `<strong>Pushback from gate:</strong> ${acars_message.gtout}<br>`;
  }

  if (has_field(acars_message, "gtin")) {
    output += `<strong>Arrived at gate:</strong> ${acars_message.gtin}<br>`;
  }

  if (has_field(acars_message, "wloff")) {
    output += `<strong>Takeoff from runway:</strong> ${acars_message.wloff}<br>`;
  }

  if (has_field(acars_message, "wlin")) {
    output += `<strong>Landed at runway:</strong> ${acars_message.wlin}<br>`;
  }

  if (has_field(acars_message, "lat")) {
    output += `<strong>Latitude:</strong> ${acars_message.lat?.toLocaleString(
      undefined,
      { maximumFractionDigits: 2, minimumFractionDigits: 2 }
    )}<br>`;
  }

  if (has_field(acars_message, "lon")) {
    output += `<strong>Longitude:</strong> ${acars_message.lon?.toLocaleString(
      undefined,
      { maximumFractionDigits: 2, minimumFractionDigits: 2 }
    )}<br>`;
  }

  if (has_field(acars_message, "alt")) {
    const altitude = acars_message.alt || 0;
    let output_alt = "";
    if (!get_setting("general_use_metric_altitude")) {
      if (
        !get_setting("general_convert_to_flight_levels") ||
        altitude < 18000
      ) {
        output_alt = altitude + " feet";
      } else {
        output_alt = "FL" + altitude / 100;
      }
    } else {
      output_alt =
        feet_to_meters(altitude).toLocaleString(undefined, {
          maximumFractionDigits: 0,
          minimumFractionDigits: 0,
        }) + " meters";
    }
    output += `<strong>Altitude:</strong> ${output_alt}<br>`;
  }

  output += "</div>";

  output += generate_right_side_text(planes, acars_message);
  output += display_message_text(acars_message);
  output += `</div></div>`;

  output += `</div>`; // div for message body

  return output;
}

function display_message_text(acars_message: acars_msg): string {
  let output = `<div class="message_body">`;

  if (
    has_field(acars_message, "decodedText") ||
    has_field(acars_message, "text") ||
    has_field(acars_message, "data") ||
    has_field(acars_message, "libacars")
  ) {
    if (has_field(acars_message, "text")) {
      // TODO: fix TS !
      // FIXME: Decoded probably needs it's own flex box

      let text = acars_message.text!.replace("\\r\\n", "<br>");
      if (acars_message.matched && acars_message.matched_text) {
        acars_message.matched_text.forEach((term) => {
          text = text.replace(term, `<span class="alert_term">${term}</span>`);
        });
      }
      output += `<div class="text_body"><p><strong>Message Text:</strong></p><pre>${text}</pre></div>`;
    }

    if (has_field(acars_message, "decodedText")) {
      let text = loop_array(acars_message.decodedText.formatted);
      if (acars_message.matched && acars_message.matched_text) {
        acars_message.matched_text.forEach((term) => {
          text = text.replace(term, `<span class="alert_term">${term}</span>`);
        });
      }

      output += `<div class="text_body"><p><strong>${
        acars_message.decodedText.decoder.decodeLevel == "full"
          ? ""
          : "Partially "
      }Decoded Text:</strong></p><div class="code">${text}</div></div>`;
    }

    if (has_field(acars_message, "data")) {
      // TODO: fix TS !
      let text = acars_message.data!.replace("\\r\\n", "<br>");
      if (acars_message.matched && acars_message.matched_text) {
        acars_message.matched_text.forEach((term) => {
          text = text.replace(term, `<span class="alert_term">${term}</span>`);
        });
      }
      output += `<div class="text_body"><p><strong>Data:</strong></p><div class="code">${text}</div></div>`;
    }

    if (has_field(acars_message, "libacars")) {
      let text = acars_message.libacars!.replace("<pre>").replace("</pre>");
      if (acars_message.matched && acars_message.matched_text) {
        acars_message.matched_text.forEach((term) => {
          text = text.replace(term, `<span class="alert_term">${term}</span>`);
        });
      }
      output += `<div class="text_body"><p><strong>LibACARS Decoded Text:</strong></p><div class="code">${text}</div></div>`;
    }
  }
  output += "</div>";
  return output;
}

function generate_right_side_text(
  planes: plane,
  acars_message: acars_msg
): string {
  let output = `<div class="message_body">`;

  if (has_field(acars_message, "tail")) {
    // TODO: show tail as matched if matched
    output += `<strong>Tail:</strong> <a href="https://flightaware.com/live/flight/${acars_message.tail}" target="_blank">${acars_message.tail}</a><br>`;
  } else if (planes.tail) {
    output += `<strong>Tail:</strong> <a href="https://flightaware.com/live/flight/${planes.tail}" target="_blank">${planes.tail}</a><br>`;
  }

  if (has_field(acars_message, "flight")) {
    output += `${acars_message.flight}<br>`;
  } else if (planes.callsign) {
    output += `<strong>Flight:</strong> ${planes.callsign}<br>`;
  }

  if (has_field(acars_message, "icao")) {
    output += `<strong>ICAO:</strong>`;
    if (has_field(acars_message, "icao_url")) {
      output += ` <a href="${acars_message.icao_url}" target="_blank">${acars_message.icao}`;
    } else {
      output += ` ${acars_message.icao}`;
    }

    if (has_field(acars_message, "icao_hex")) {
      output += `/${acars_message.icao_hex}${
        has_field(acars_message, "icao_url") ? "</a>" : ""
      }`;
    } else {
      output += `/?`;
    }

    output += `<br>`;
  }

  if (has_field(acars_message, "freq")) {
    output += `<strong>Frequency:</strong> ${Number(acars_message.freq)
      ?.toPrecision(6)
      .toLocaleString()}<br>`;
  }

  if (has_field(acars_message, "level")) {
    let level = Number(acars_message.level ? acars_message.level : 0);
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

    output += `<strong>Level:</strong> ${level
      .toPrecision(3)
      .toLocaleString()}&nbsp<div class="${circle}"></div><br>`;
  }

  if (has_field(acars_message, "ack")) {
    output += `<strong>Acknolwedge:</strong> ${acars_message.ack}<br>`;
  }

  if (has_field(acars_message, "mode")) {
    output += `<strong>Mode</strong>: ${acars_message.mode}<br>`;
  }

  if (has_field(acars_message, "block_id")) {
    output += `<strong>Block ID:</strong> ${acars_message.block_id}<br>`;
  }

  if (has_field(acars_message, "msgno")) {
    output += `<strong>Message Number:</strong> ${acars_message.msgno}<br>`;
  }

  if (has_field(acars_message, "is_response")) {
    output += `<strong>Response:</strong> ${
      acars_message.is_response === 0 ? "False" : "True"
    }<br>`;
  }

  if (has_field(acars_message, "is_onground")) {
    output += `<strong>On Ground:</strong> ${
      acars_message.is_onground === 0 ? "False" : "True"
    }<br>`;
  }

  if (has_field(acars_message, "error") && Number(acars_message.error) !== 0) {
    output += `<strong>Error${
      acars_message.error! > 1 ? "s" : ""
    }:</strong> <span class="error">${acars_message.error}</span><br>`;
  }

  output += `</div>`; // div for row
  return output;
}

function has_field(acars_message: acars_msg, field: string): boolean {
  return (
    typeof acars_message[field] !== "undefined" && acars_message[field] !== ""
  );
}

function loop_array(input: any): string {
  let html_output: string = "";

  for (let m in input) {
    if (typeof input[m] === "object") {
      html_output += loop_array(input[m]);
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
}
