// Function to generate the HTML for an array of messages
// Input: msgs_to_process - the array of messages. Format is array of message groups, with each group being an array of message(s) that create a group of submessages
// Input: selected_tabs - if present, we'll process. Format is uid1;elementid1,uid2;elementid2 etc
// Input: live_page - default is false. This toggles on the checks for selected tabs
import {
  add_message_field,
  create_message_nav_arrows,
  create_message_tab,
  message_div,
  message_station_and_type,
  message_tab_label,
  message_timestamp,
  start_message_body,
  start_message_box,
  start_message_tabs,
} from "./html_functions.js";
import { acars_msg } from "./interfaces.js";

export function display_messages(
  msgs_to_process: acars_msg[][],
  selected_tabs: string = "",
  live_page: boolean = false
) {
  let msgs_string = ""; // output string that gets returned
  let message_tab_splits: string[] = []; // variable to save the split output of selected_tabs
  if (selected_tabs !== "") message_tab_splits = selected_tabs.split(","); // the individual tabs with selections

  for (let i = 0; i < msgs_to_process.length; i++) {
    // Loop through the message array
    const sub_messages: acars_msg[] = msgs_to_process[i]; // Array of messages belonging to one tab-group
    let unique_id: string = ""; // UID for the message group
    let active_tab: string = "0"; // Active tab. Default is the first one if none selected
    let previous_tab: string = "0";
    let next_tab: string = "0";
    let array_index_tab: string = "0";
    msgs_string += "<br>";

    if (live_page) {
      // unique_id is used to track the UID for a group of messages
      // tab_id below is the UID for a selected message

      unique_id = sub_messages[sub_messages.length - 1]["uid"]; // Set the UID to the oldest message

      if (message_tab_splits.length > 0) {
        // Loop through the selected tabs on the page. If we find a match for the current UID we'll set the active tab to what has been selected
        for (let q = 0; q < message_tab_splits.length; q++) {
          if (message_tab_splits[q].startsWith(unique_id.toString())) {
            let split = message_tab_splits[q].split(";");
            active_tab = split[1];
            array_index_tab = String(
              sub_messages.findIndex((sub_element: acars_msg) => {
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

      if (sub_messages.length > 1) {
        // Do we have more than one message in this group? If so, add in the HTML to set up the tabs
        if (array_index_tab === "0") {
          next_tab = sub_messages[1].uid;
          previous_tab = sub_messages[sub_messages.length - 1].uid;
        } else if (array_index_tab === String(sub_messages.length - 1)) {
          next_tab = sub_messages[0].uid;
          previous_tab = sub_messages[sub_messages.length - 2].uid;
        } else {
          next_tab = sub_messages[Number(array_index_tab) + 1].uid;
          previous_tab = sub_messages[Number(array_index_tab) - 1].uid;
        }

        msgs_string += start_message_tabs();
        for (let j = 0; j < sub_messages.length; j++) {
          // Loop through all messages in the group to show all of the tabs
          let tab_uid = unique_id;

          tab_uid = sub_messages[j]["uid"];

          // If there is no active tab set by the user we'll set the newest message to be active/checked

          msgs_string +=
            j === 0
              ? create_message_nav_arrows(previous_tab, unique_id) +
                create_message_nav_arrows(next_tab, unique_id, false)
              : "";

          if (active_tab === "0" && j === 0)
            msgs_string += create_message_tab(tab_uid, unique_id);
          else if (tab_uid === String(active_tab))
            msgs_string += create_message_tab(tab_uid, unique_id);
          else msgs_string += create_message_tab(tab_uid, unique_id, false);
          msgs_string += message_tab_label(
            j,
            sub_messages[j].hasOwnProperty("matched"),
            tab_uid,
            unique_id
          );
        }
      }
    }

    for (let u = 0; u < sub_messages.length; u++) {
      // Now we'll generate the HTML for each message in the group
      let html_output = "";
      if (sub_messages.length > 1) {
        // If we have multiple messages in this group we need to set the non-selected tabs to invisible
        let tab_uid = unique_id;

        tab_uid = sub_messages[u]["uid"]; // UID for the current message
        tab_uid = sub_messages[u]["uid"]; // UID for the current message

        if (active_tab === "0" && u === 0)
          html_output += message_div(unique_id, tab_uid);
        // Case for no tab selected by user. Newest message is active
        else if (tab_uid === String(active_tab))
          html_output += message_div(unique_id, tab_uid);
        // User has selected a tab for the group and it is this message. Set to be vis
        // Hide the selected tab if the previous cases don't match
        else html_output += message_div(unique_id, tab_uid, false);
      }
      //msgs_string = '<p>' + msgs_received[i].toString() + '</p>' + msgs_string;
      let message: acars_msg = sub_messages[u]; // variable to hold the current message
      html_output += start_message_box();

      // if (sub_messages.length === 1 && message.hasOwnProperty("matched"))
      //   html_output += '<tr class="red_body">';
      // else html_output += "<tr>";
      // html_output += `<td><strong>${message["message_type"]}</strong> from <strong>${message["station_id"]}</strong></td>`;
      html_output += message_station_and_type(
        message["message_type"],
        message["station_id"],
        sub_messages.length === 1 && message.hasOwnProperty("matched")
      );
      let timestamp: Date; // variable to save the timestamp We need this because the database saves the time as 'time' and live messages have it as 'timestamp' (blame Fred for this silly mis-naming of db columns)

      // grab the time (unix EPOCH) from the correct key and convert in to a Date object for display
      if (message.hasOwnProperty("timestamp"))
        timestamp = new Date(message["timestamp"] * 1000);
      else
        timestamp = new Date(
          (typeof message["msg_time"] !== "undefined"
            ? message["msg_time"]
            : 0) * 1000
        );

      html_output += message_timestamp(timestamp);
      // Table content
      html_output += start_message_body();

      // Special keys used by the JS files calling this function
      // Duplicates is used to indicate the number of copies received for this message
      // msgno_parts is the list of MSGID fields used to construct the multi-part message

      html_output +=
        typeof message.duplicates !== "undefined"
          ? add_message_field("Duplicate(s) Received", message.duplicates)
          : "";
      html_output +=
        typeof message.msgno_parts !== "undefined"
          ? add_message_field("Message Parts", message.msgno_parts)
          : "";
      html_output +=
        typeof message.label !== "undefined"
          ? add_message_field(
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
          ? add_message_field(
              "To Address",
              message.toaddr +
                (typeof message.toaddr_hex !== "undefined"
                  ? "/" + message.toaddr_hex
                  : "/?")
            )
          : "";
      html_output +=
        typeof message.toaddr_decoded !== "undefined"
          ? add_message_field("To Address Station ID", message.toaddr_decoded)
          : "";

      //
      html_output +=
        typeof message.fromaddr !== "undefined"
          ? add_message_field(
              "From Address",
              message.fromaddr +
                (typeof message.fromaddr_hex !== "undefined"
                  ? "/" + message.fromaddr_hex
                  : "/?")
            )
          : "";
      html_output +=
        typeof message.fromaddr_decoded !== "undefined"
          ? add_message_field(
              "From Address Station ID",
              message.fromaddr_decoded
            )
          : "";
      html_output +=
        typeof message.depa !== "undefined"
          ? add_message_field("Departing", message.depa)
          : "";
      html_output +=
        typeof message.dsta !== "undefined"
          ? add_message_field("Destination", message.dsta)
          : "";
      html_output +=
        typeof message.eta !== "undefined"
          ? add_message_field("Estimated time of arrival", message.eta)
          : "";
      html_output +=
        typeof message.gtout !== "undefined"
          ? add_message_field("Pushback from gate", message.gtout)
          : "";
      html_output +=
        typeof message.gtin !== "undefined"
          ? add_message_field("Arrived at gate", message.gtin)
          : "";
      html_output +=
        typeof message.wloff !== "undefined"
          ? add_message_field("Wheels off", message.wloff)
          : "";
      html_output +=
        typeof message.wlin !== "undefined"
          ? add_message_field("Departing", message.wlin)
          : "";
      html_output +=
        typeof message.lat !== "undefined"
          ? add_message_field(
              "Latitude",
              message.lat.toLocaleString(undefined, {
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
              })
            )
          : "";
      html_output +=
        typeof message.lon !== "undefined"
          ? add_message_field(
              "Longitude",
              message.lon.toLocaleString(undefined, {
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
              })
            )
          : "";

      html_output +=
        typeof message.alt !== "undefined"
          ? add_message_field("Altitude", String(message.alt))
          : "";

      // Table footer row, tail & flight info, displayed in main body if screen is too small
      html_output += '<td class="text_top show_when_small">';
      if (message.hasOwnProperty("tail")) {
        html_output += `Tail: <strong><a href=\"https://flightaware.com/live/flight/${
          message["tail"]
        }\" target=\"_blank\">${
          typeof message.matched_tail !== "undefined" &&
          typeof message.tail !== "undefined"
            ? replace_text(message.matched_tail, message.tail)
            : message.tail
        }</a></strong><br>`;
      }

      if (
        message.hasOwnProperty("flight") &&
        typeof message.flight !== "undefined"
      ) {
        html_output +=
          typeof message.matched_flight === "object"
            ? replace_text(message.matched_flight, message.flight) + "<br>"
            : message.flight + "<br>";
      }

      if (
        message.hasOwnProperty("icao") &&
        typeof message.icao !== "undefined"
      ) {
        html_output += "ICAO: <strong>";
        html_output += message.hasOwnProperty("icao_url")
          ? `<a href="${message["icao_url"]}" target="_blank">`
          : "";
        html_output +=
          typeof message.matched_icao === "object"
            ? replace_text(message.matched_icao, message.icao.toString())
            : `${message["icao"]}`;
        html_output +=
          message.hasOwnProperty("icao_hex") &&
          typeof message.matched_icao === "undefined"
            ? `/${message["icao_hex"]}`
            : "";
        html_output +=
          message.hasOwnProperty("icao_hex") &&
          typeof message.matched_icao !== "undefined" &&
          typeof message.icao_hex !== "undefined"
            ? "/" +
              replace_text(message.matched_icao, message["icao_hex"].toString())
            : "";
        html_output += message.hasOwnProperty("icao_url")
          ? "</a></strong><br>"
          : "</strong><br>";
      }

      // Table footer row, metadata
      if (message.hasOwnProperty("freq")) {
        html_output += `<span class=\"wrapper\">F: <strong>${message["freq"]}</strong><span class=\"tooltip\">The frequency this message was received on</span></span><br>`;
      }

      if (
        message.hasOwnProperty("level") &&
        typeof message.level !== "undefined"
      ) {
        let level = message["level"];
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
        html_output += `L: <strong>${level}</strong> <div class="${circle}"></div><br>`;
      }

      if (message.hasOwnProperty("ack")) {
        if (!message["ack"])
          html_output += `<span class=\"wrapper\">A: <strong>${message["ack"]}</strong><span class=\"tooltip\">Acknowledgement</span></span><br>`;
      }

      if (message.hasOwnProperty("mode")) {
        html_output += `<span class=\"wrapper\">M: <strong>${message["mode"]}</strong><span class=\"tooltip\">Mode</span></span><br>`;
      }

      if (message.hasOwnProperty("block_id")) {
        html_output += `<span class=\"wrapper\">B: <strong>${message["block_id"]}</strong><span class=\"tooltip\">Block ID</span></span><br>`;
      }

      if (message.hasOwnProperty("msgno")) {
        html_output += `<span class=\"wrapper\">M#: <strong>${message["msgno"]}</strong><span class=\"tooltip\">Message number. Used for multi-part messages.</span></span><br>`;
      }

      if (message.hasOwnProperty("is_response")) {
        html_output += `<span class=\"wrapper\">R: <strong>${message["is_response"]}</strong><span class=\"tooltip\">Response</span></span><br>`;
      }

      if (message.hasOwnProperty("is_onground")) {
        // We need to watch this to make sure I have this right. After spelunking through vdlm2dec source code
        // Input always appears to be a 0 or 2...for reasons I don't get. I could have this backwards
        // 0 indicates the plane is airborne
        // 2 indicates the plane is on the ground
        // https://github.com/TLeconte/vdlm2dec/blob/1ea300d40d66ecb969f1f463506859e36f62ef5c/out.c#L457
        // variable naming in vdlm2dec is inconsistent, but "ground" and "gnd" seem to be used
        let is_onground = message["is_onground"] === 0 ? "False" : "True";

        html_output += `<span class=\"wrapper\">G: <strong>${is_onground}</strong><span class=\"tooltip\">Is on ground?</span></span><br>`;
      }

      if (message.hasOwnProperty("error")) {
        if (message["error"] != 0) {
          html_output += '<span style="color:red;">';
          html_output += `<strong>E: ${message["error"]}</strong>`;
          html_output += "</span><br>";
        }
      }

      html_output += "</td>";
      html_output += "</tr>";

      html_output += '<tr><td colspan="2">';
      // Text field is pre-processed
      // we have a sub-table for the raw text field and if it was decoded, the decoded text as well
      if (
        message.hasOwnProperty("text") &&
        typeof message.text !== "undefined"
      ) {
        let text = message["text"];
        text = text.replace("\\r\\n", "<br>");
        //html_output += "<p>";
        html_output += '<table class="message">';

        //html_output += "</p>";
        if (message.hasOwnProperty("decodedText")) {
          //html_output += "<p>";
          let decodedStatus = "Full";
          if (message["decodedText"].decoder.decodeLevel != "full")
            decodedStatus = "Partial";
          html_output += '<td class="text_top">';
          html_output += `<strong>Decoded Text (${decodedStatus}):</strong></p>`;
          html_output += '<pre class="shadow show_strong">';
          html_output +=
            typeof message.matched_text === "object"
              ? replace_text(
                  message.matched_text,
                  loop_array(message["decodedText"].formatted)
                )
              : loop_array(message["decodedText"].formatted); // get the formatted html of the decoded text
          //html_output += `${message['decodedText'].raw}`;
          html_output += "</pre>";
          html_output += "</td>";
          //html_output += "</p>";
        } else {
          html_output += "<tr>";
        }

        html_output += message.hasOwnProperty("decodedText")
          ? '<td class="text_top dont_show">'
          : '<td class="text_top">'; // If screen size is too small, and we have decoded text, hide this element
        html_output += "<strong>Non-Decoded Text:</strong><p>";
        html_output += `<pre class="shadow show_strong">${
          typeof message.matched_text === "object"
            ? replace_text(message.matched_text, text)
            : text
        }</pre>`;
        html_output += "</td>";
        html_output += "</tr></table>";
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

      if (message.hasOwnProperty("libacars")) {
        html_output += message["libacars"];
      }

      html_output += "</td></tr>";

      // Table footer row, tail & flight info
      html_output += '<tr class="show_when_big">';
      html_output += "<td>";
      if (message.hasOwnProperty("tail")) {
        html_output += `Tail: <strong><a href=\"https://flightaware.com/live/flight/${
          message["tail"]
        }\" target=\"_blank\">${
          typeof message.matched_tail !== "undefined" &&
          typeof message.tail !== "undefined"
            ? replace_text(message.matched_tail, message.tail)
            : message.tail
        }</a></strong> `;
      }

      if (
        message.hasOwnProperty("flight") &&
        typeof message.flight !== "undefined"
      ) {
        html_output +=
          typeof message.matched_flight === "object"
            ? replace_text(message.matched_flight, message.flight)
            : message.flight;
      }

      if (
        message.hasOwnProperty("icao") &&
        typeof message.icao !== "undefined"
      ) {
        html_output += "ICAO: <strong>";
        html_output += message.hasOwnProperty("icao_url")
          ? `<a href="${message["icao_url"]}" target="_blank">`
          : "";
        html_output +=
          typeof message.matched_icao === "object"
            ? replace_text(message.matched_icao, message.icao.toString())
            : `${message["icao"]}`;
        html_output +=
          message.hasOwnProperty("icao_hex") &&
          typeof message.matched_icao === "undefined"
            ? `/${message["icao_hex"]}`
            : "";
        html_output +=
          message.hasOwnProperty("icao_hex") &&
          typeof message.matched_icao !== "undefined" &&
          typeof message.icao_hex !== "undefined"
            ? "/" +
              replace_text(message.matched_icao, message["icao_hex"].toString())
            : "";
        html_output += message.hasOwnProperty("icao_url")
          ? "</a></strong>"
          : "</strong>";
      }

      html_output += "</td>";

      // Table footer row, metadata
      html_output += '<td style="text-align: right">';
      if (message.hasOwnProperty("freq")) {
        html_output += `<span class=\"wrapper\">F: <strong>${message["freq"]}</strong><span class=\"tooltip\">The frequency this message was received on</span></span> `;
      }

      if (
        message.hasOwnProperty("level") &&
        typeof message.level !== "undefined"
      ) {
        let level = message["level"];
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
        html_output += `L: <strong>${level}</strong> <div class="${circle}"></div> `;
      }

      if (message.hasOwnProperty("ack")) {
        if (!message["ack"])
          html_output += `<span class=\"wrapper\">A: <strong>${message["ack"]}</strong><span class=\"tooltip\">Acknowledgement</span></span> `;
      }

      if (message.hasOwnProperty("mode")) {
        html_output += `<span class=\"wrapper\">M: <strong>${message["mode"]}</strong><span class=\"tooltip\">Mode</span></span> `;
      }

      if (message.hasOwnProperty("block_id")) {
        html_output += `<span class=\"wrapper\">B: <strong>${message["block_id"]}</strong><span class=\"tooltip\">Block ID</span></span> `;
      }

      if (message.hasOwnProperty("msgno")) {
        html_output += `<span class=\"wrapper\">M#: <strong>${message["msgno"]}</strong><span class=\"tooltip\">Message number. Used for multi-part messages.</span></span> `;
      }

      if (message.hasOwnProperty("is_response")) {
        html_output += `<span class=\"wrapper\">R: <strong>${message["is_response"]}</strong><span class=\"tooltip\">Response</span></span> `;
      }

      if (message.hasOwnProperty("is_onground")) {
        // We need to watch this to make sure I have this right. After spelunking through vdlm2dec source code
        // Input always appears to be a 0 or 2...for reasons I don't get. I could have this backwards
        // 0 indicates the plane is airborne
        // 2 indicates the plane is on the ground
        // https://github.com/TLeconte/vdlm2dec/blob/1ea300d40d66ecb969f1f463506859e36f62ef5c/out.c#L457
        // variable naming in vdlm2dec is inconsistent, but "ground" and "gnd" seem to be used
        let is_onground = message["is_onground"] === 0 ? "False" : "True";

        html_output += `<span class=\"wrapper\">G: <strong>${is_onground}</strong><span class=\"tooltip\">Is on ground?</span></span> `;
      }

      if (message.hasOwnProperty("error")) {
        if (message["error"] != 0) {
          html_output += '<span style="color:red;">';
          html_output += `<strong>E: ${message["error"]}</strong> `;
          html_output += "</span>";
        }
      }

      html_output += "</td>";
      html_output += "</tr>";

      // Finish table html
      html_output += "</table></div><!-- table -->";

      if (sub_messages.length > 1) {
        html_output += "</div><!-- message -->";
      }

      msgs_string = msgs_string + html_output;
    }

    if (sub_messages.length > 1) {
      msgs_string += "</div><!-- tabs -->";
    }
  }

  return msgs_string;
}

function replace_text(input: string[], text: string) {
  for (let i = 0; i < input.length; i++) {
    text = text
      .split(`${input[i].toUpperCase()}`)
      .join(`<span class="red_body">${input[i].toUpperCase()}</span>`);
  }
  return text;
}

function loop_array(input: any) {
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
