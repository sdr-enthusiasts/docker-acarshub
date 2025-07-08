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

// Function to generate the HTML for an array of messages
// Input: msgs_to_process - the array of messages. Format is array of message groups, with each group being an array of message(s) that create a group of submessages
// Input: selected_tabs - if present, we'll process. Format is uid1;elementid1,uid2;elementid2 etc
// Input: live_page - default is false. This toggles on the checks for selected tabs
import { html_functions } from "./html_functions";
import { acars_msg } from "../interfaces";
import { get_flight_tracking_url } from "../index";

export function display_messages(
  msgs_to_process: acars_msg[][],
  selected_tabs: string = "",
  live_page: boolean = false
): string {
  let html_string = "";

  msgs_to_process.forEach((plane) => {
    html_string += display_message_group(plane, selected_tabs, live_page);
  });

  return html_string;
}

export function display_message_group(
  msg_to_process: acars_msg[],
  selected_tabs: string = "",
  live_page: boolean = false
): string {
  let msgs_string = ""; // output string that gets returned
  let message_tab_splits: string[] = []; // variable to save the split output of selected_tabs
  if (selected_tabs !== "") message_tab_splits = selected_tabs.split(","); // the individual tabs with selections
  // Loop through the message array
  let unique_id: string = ""; // UID for the message group
  let active_tab: string = "0"; // Active tab. Default is the first one if none selected
  let previous_tab: string = "0";
  let next_tab: string = "0";
  let array_index_tab: string = "0";
  const message_uid =
    "acarsmsg_" + msg_to_process[msg_to_process.length - 1].uid;
  msgs_string += `<div id="${message_uid}_container" class="acars_message_container">`;
  msgs_string += "<br>";
  msgs_string += `<div class="acarshub-message-group" id="${message_uid}">`;
  if (live_page) {
    // unique_id is used to track the UID for a group of messages
    // tab_id below is the UID for a selected message

    unique_id = msg_to_process[msg_to_process.length - 1].uid; // Set the UID to the oldest message

    if (message_tab_splits.length > 0) {
      // Loop through the selected tabs on the page. If we find a match for the current UID we'll set the active tab to what has been selected
      for (let q = 0; q < message_tab_splits.length; q++) {
        if (message_tab_splits[q].startsWith(unique_id.toString())) {
          let split = message_tab_splits[q].split(";");
          active_tab = split[1];
          array_index_tab = String(
            msg_to_process.findIndex((sub_element: acars_msg) => {
              if (
                sub_element.uid === active_tab ||
                sub_element.uid === active_tab
              ) {
                return true;
              }
            })
          );
        }
      }
    }

    if (msg_to_process.length > 1) {
      // Do we have more than one message in this group? If so, add in the HTML to set up the tabs
      if (array_index_tab === "0") {
        next_tab = msg_to_process[1].uid;
        previous_tab = msg_to_process[msg_to_process.length - 1].uid;
      } else if (array_index_tab === String(msg_to_process.length - 1)) {
        next_tab = msg_to_process[0].uid;
        previous_tab = msg_to_process[msg_to_process.length - 2].uid;
      } else {
        next_tab = msg_to_process[Number(array_index_tab) + 1].uid;
        previous_tab = msg_to_process[Number(array_index_tab) - 1].uid;
      }

      msgs_string += html_functions.start_message_tabs();
      for (let j = 0; j < msg_to_process.length; j++) {
        // Loop through all messages in the group to show all of the tabs
        let tab_uid = unique_id;

        tab_uid = msg_to_process[j].uid;

        // If there is no active tab set by the user we'll set the newest message to be active/checked

        msgs_string +=
          j === 0
            ? html_functions.create_message_nav_arrows(
                previous_tab,
                unique_id
              ) +
              html_functions.create_message_nav_arrows(
                next_tab,
                unique_id,
                false
              )
            : "";

        if (active_tab === "0" && j === 0)
          msgs_string += html_functions.create_message_tab(tab_uid, unique_id);
        else if (tab_uid === String(active_tab))
          msgs_string += html_functions.create_message_tab(tab_uid, unique_id);
        else
          msgs_string += html_functions.create_message_tab(
            tab_uid,
            unique_id,
            false
          );
        msgs_string += html_functions.message_tab_label(
          j,
          typeof msg_to_process[j].matched !== "undefined",
          tab_uid,
          unique_id
        );
      }
    }
  }

  msgs_string += inner_message_html(msg_to_process, unique_id, active_tab);

  if (msg_to_process.length > 1) {
    msgs_string += html_functions.end_message_tabs();
  }

  msgs_string += html_functions.end_message();

  return msgs_string;
}

function inner_message_html(
  msg_to_process: acars_msg[],
  unique_id: string,
  active_tab: string
): string {
  let html_output = "";

  msg_to_process.forEach((message) => {
    // Now we'll generate the HTML for each message in the group
    let skip = false;
    if (msg_to_process.length > 1) {
      // If we have multiple messages in this group we need to set the non-selected tabs to invisible
      let tab_uid = unique_id;

      tab_uid = message.uid; // UID for the current message
      tab_uid = message.uid; // UID for the current message

      if (active_tab === "0" && msg_to_process.indexOf(message) === 0)
        html_output += html_functions.message_div(unique_id, tab_uid);
      // Case for no tab selected by user. Newest message is active
      else if (tab_uid === String(active_tab))
        html_output += html_functions.message_div(unique_id, tab_uid);
      // User has selected a tab for the group and it is this message. Set to be vis
      // Hide the selected tab if the previous cases don't match
      else skip = true;
    }

    if (skip) return;

    // variable to hold the current message
    html_output += html_functions.start_message_box();
    html_output += html_functions.message_station_and_type(
      message.message_type,
      message.station_id,
      msg_to_process.length === 1 && typeof message.matched !== "undefined"
    );
    let timestamp: Date; // variable to save the timestamp We need this because the database saves the time as 'time' and live messages have it as 'timestamp' (blame Fred for this silly mis-naming of db columns)

    // grab the time (unix EPOCH) from the correct key and convert in to a Date object for display
    if (typeof message.timestamp !== "undefined")
      timestamp = new Date(message.timestamp * 1000);
    else
      timestamp = new Date(
        (typeof message.msg_time !== "undefined" ? message.msg_time : 0) * 1000
      );

    html_output += html_functions.message_timestamp(timestamp);
    // Table content
    html_output += html_functions.start_message_body();

    // Special keys used by the JS files calling this function
    // Duplicates is used to indicate the number of copies received for this message
    // msgno_parts is the list of MSGID fields used to construct the multi-part message

    html_output +=
      typeof message.duplicates !== "undefined"
        ? html_functions.add_message_field(
            "Duplicate(s) Received",
            message.duplicates
          )
        : "";
    html_output +=
      typeof message.msgno_parts !== "undefined"
        ? html_functions.add_message_field("Message Parts", message.msgno_parts)
        : "";
    html_output +=
      typeof message.label !== "undefined"
        ? html_functions.add_message_field(
            "Message Label",
            message.label +
              " " +
              (typeof message.label_type !== "undefined"
                ? message.label_type.trim()
                : "")
          )
        : "";

    // to/fromaddr is a pre-processed field
    // if possible, we'll have an appended hex representation of the decimal address

    html_output +=
      typeof message.toaddr !== "undefined"
        ? html_functions.add_message_field(
            "To Address",
            message.toaddr +
              (typeof message.toaddr_hex !== "undefined"
                ? "/" +
                  html_functions.ensure_hex_is_uppercase_and_six_chars(
                    message.toaddr_hex
                  )
                : "/?")
          )
        : "";
    html_output +=
      typeof message.toaddr_decoded !== "undefined"
        ? html_functions.add_message_field(
            "To Address Station ID",
            message.toaddr_decoded
          )
        : "";

    //
    html_output +=
      typeof message.fromaddr !== "undefined"
        ? html_functions.add_message_field(
            "From Address",
            message.fromaddr +
              (typeof message.fromaddr_hex !== "undefined"
                ? "/" +
                  html_functions.ensure_hex_is_uppercase_and_six_chars(
                    message.fromaddr_hex
                  )
                : "/?")
          )
        : "";
    html_output +=
      typeof message.fromaddr_decoded !== "undefined"
        ? html_functions.add_message_field(
            "From Address Station ID",
            message.fromaddr_decoded
          )
        : "";
    html_output +=
      typeof message.depa !== "undefined"
        ? html_functions.add_message_field("Departing", message.depa)
        : "";
    html_output +=
      typeof message.dsta !== "undefined"
        ? html_functions.add_message_field("Destination", message.dsta)
        : "";
    html_output +=
      typeof message.eta !== "undefined"
        ? html_functions.add_message_field(
            "Estimated time of arrival",
            message.eta
          )
        : "";
    html_output +=
      typeof message.gtout !== "undefined"
        ? html_functions.add_message_field("Pushback from gate", message.gtout)
        : "";
    html_output +=
      typeof message.gtin !== "undefined"
        ? html_functions.add_message_field("Arrived at gate", message.gtin)
        : "";
    html_output +=
      typeof message.wloff !== "undefined"
        ? html_functions.add_message_field("Wheels off", message.wloff)
        : "";
    html_output +=
      typeof message.wlin !== "undefined"
        ? html_functions.add_message_field("Departing", message.wlin)
        : "";
    html_output +=
      typeof message.lat !== "undefined"
        ? html_functions.add_message_field(
            "Latitude",
            message.lat.toLocaleString(undefined, {
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            })
          )
        : "";
    html_output +=
      typeof message.lon !== "undefined"
        ? html_functions.add_message_field(
            "Longitude",
            message.lon.toLocaleString(undefined, {
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            })
          )
        : "";

    html_output +=
      typeof message.alt !== "undefined"
        ? html_functions.add_message_field("Altitude", String(message.alt))
        : "";

    // Table footer row, tail & flight info, displayed in main body if screen is too small
    html_output += html_functions.show_footer_and_sidebar_text(
      message,
      get_flight_tracking_url(),
      false
    );
    //html_output += "</td></tr>";
    html_output += html_functions.message_text(message);

    // Text field is pre-processed
    // we have a sub-table for the raw text field and if it was decoded, the decoded text as well

    // Table footer row, tail & flight info
    html_output += html_functions.show_footer_and_sidebar_text(
      message,
      get_flight_tracking_url()
    );

    // Finish table html
    html_output += html_functions.end_message_box();

    if (msg_to_process.length > 1) {
      html_output += html_functions.end_message_div();
    }

    //msgs_string = msgs_string + html_output;
  });

  return html_output;
}
