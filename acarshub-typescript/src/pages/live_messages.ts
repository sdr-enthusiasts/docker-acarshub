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

//import { MessageDecoder } from "@airframes/acars-decoder";
const { MessageDecoder } = require("@airframes/acars-decoder");

import Cookies from "js-cookie";
import {
  display_message_group,
  display_messages,
} from "../helpers/html_generator";
import {
  type SettingsSection,
  settingsManager,
} from "../helpers/settings_manager";
import { tooltip } from "../helpers/tooltips";
import {
  get_current_planes,
  is_adsb_enabled,
  match_alert,
  resize_tabs,
  sound_alert,
} from "../index";
import type {
  acars_msg,
  alert_matched,
  html_msg,
  labels,
  plane,
  plane_data,
  plane_match,
} from "../interfaces";
import { ACARSHubPage } from "./master";

export class LiveMessagePage extends ACARSHubPage {
  #pause: boolean = false;
  #text_filter: boolean = false;
  #current_message_string: string = "";
  #lm_msgs_received = {
    planes: [] as plane[],
    unshift: function (a: plane) {
      // console.log(
      //   `Initial number of planes w/ messages saved:  ${this.planes.length}`
      // );
      if (this.planes.length >= 50) {
        // ADSB is off so we don't need to be all clever like removing the last element
        if (!is_adsb_enabled()) {
          this.planes.pop();
        } else {
          const indexes_to_delete: Array<number> = [];
          const current_planes_adsb = get_current_planes();
          for (let i = 49; i < this.planes.length; i++) {
            let delete_index = true;
            this.planes[i].identifiers.every((identifier) => {
              if (
                current_planes_adsb.hex.includes(identifier) ||
                current_planes_adsb.callsigns.includes(identifier) ||
                current_planes_adsb.tail.includes(identifier)
              ) {
                delete_index = false;
                // console.log(`saving plane with ${identifier}`);
                return false;
              }
              return true;
            });
            if (delete_index) {
              // console.log(
              //   `deleting a plane (${this.planes[i].identifiers}).....`
              // );
              indexes_to_delete.push(i);
            }
          }
          // delete the selected indexes from this.planes
          // sorting the list descending because we want to keep
          // the indexes true to the original indexes and deleting from the front
          // of the list would cause invalid indexes as we walked the array
          indexes_to_delete
            .sort((a, b) => b - a)
            .forEach((index) => {
              this.planes.splice(index, 1);
            });
        }
      }
      // console.log(
      //   `Final number of planes w/ messages saved: ${this.planes.length + 1}`
      // );
      return Array.prototype.unshift.apply(this.planes, [a]);
    },
    get_all_messages: function (): acars_msg[][] {
      const output = [] as acars_msg[][];
      for (const msgList of this.planes) {
        if (output.length < 20) {
          // 20 is the maximum number of message groups we ever want to display on the page
          output.push(msgList.messages);
        } else {
          return output;
        }
      }
      return output;
    },
    get_first_message: function (): acars_msg[] {
      return this.planes[0].messages;
    },
  };

  #exclude: string[] = [];
  #selected_tabs: string = "";
  #filter_labels: labels | null = null;
  #lm_md = new MessageDecoder();
  #msg_tags: Array<keyof acars_msg> = [
    "text",
    "data",
    "libacars",
    "dsta",
    "depa",
    "eta",
    "gtout",
    "gtin",
    "wloff",
    "wlin",
    "lat",
    "lon",
    "alt",
  ];
  #filtered_messages: number = 0;
  #received_messages: number = 0;

  constructor() {
    super();
    // Grab the current cookie value for message filtering
    // If the cookie is found with a value we run filter_notext to set the proper visual elements/variables for the rest of the functions
    // We'll also re-write the cookie (or start a new one) with the current value
    // This is necessary because Safari doesn't respect the expiration date of more than 7 days. It will set it to 7 days even though we've set 365 days
    // This also just keeps moving the expiration date moving forward every time the page is loaded

    const filter = Cookies.get("filter");
    if (filter === "true") {
      Cookies.set("filter", "true", {
        expires: 365,
        sameSite: "Strict",
      });
      this.filter_notext();
    } else {
      this.#text_filter = true; // temporarily flip the value so we can run the filter_notext() function and set the proper CSS
      Cookies.set("filter", "false", {
        expires: 365,
        sameSite: "Strict",
      });
      this.filter_notext();
    }

    // Grab the current cookie value for the message labels being filtered
    // Same restrictions as the 'filter'
    const exclude_cookie = Cookies.get("exclude");
    if (exclude_cookie == null) {
      Cookies.set("exclude", "", {
        expires: 365,
        sameSite: "Strict",
      });
    } else {
      Cookies.set("exclude", exclude_cookie, {
        expires: 365,
        sameSite: "Strict",
      });
      if (this.#exclude.length > 0) this.#exclude = exclude_cookie.split(" ");
      else this.#exclude = [];
    }

    // Register settings immediately
    this.registerSettings();
  }

  setting_modal_on(): void {
    this.show_labels();
    this.pause_updates(false);
    this.filter_notext(false);
    resize_tabs();
  }

  // Function to increment the counter of filtered messages

  increment_filtered(page_refresh = false): void {
    if (!page_refresh) this.#filtered_messages++;
    $("#filteredmessages").html(String(this.#filtered_messages));
  }

  // Function to increment the counter of received messages

  increment_received(page_refresh = false): void {
    if (!page_refresh) this.#received_messages++;
    $("#receivedmessages").html(String(this.#received_messages));
  }

  show_labels(): void {
    let label_html = "";
    if (this.#filter_labels !== null) {
      for (const key in this.#filter_labels.labels) {
        const isExcluded = this.#exclude.indexOf(key.toString()) !== -1;
        label_html += `
          <div class="settings-option label-option">
            <label class="settings-label" for="label_${key}">${key} - ${this.#filter_labels.labels[key].name}</label>
            <input type="checkbox" id="label_${key}" ${isExcluded ? "checked" : ""} onchange="toggle_label('${key.toString()}')" />
          </div>`;
      }
      $("#label_checkboxes").html(label_html);
    }
  }

  // Function to return a random integer
  // Input: integter that represents the maximum number that can be returned

  getRandomInt(max: number): number {
    return Math.floor(Math.random() * Math.floor(max));
  }

  // Function to handle click events on the message tab
  // Input is the element ID (aka message label ID) that has been selected
  // Input is the UID of the message group, which is also the element ID of the oldest element in that group

  handle_radio(element_id: string, uid: string): void {
    $(`div.sub_msg${uid}`).removeClass("checked"); // Turn off the display of all messages in the UID group
    $(`input.tabs_${uid}`).prop("checked", false); // Turn off the checked indicator for all messages in the UID group
    $(`#message_${uid}_${element_id}`).addClass("checked"); // Turn on the display of the message that is now active
    $(`#tab${element_id}_${uid}`).prop("checked", true); // Turn on the checked indicator for the message that is now active

    // Now we need to update the nav arrow links

    let next_tab: string = "0";
    let previous_tab: string = "0";

    // Find the next / previous tabs
    // This is UGLY
    // FIXME....deuglify it
    let matched_index: number | undefined;

    for (let i = 0; i < this.#lm_msgs_received.planes.length; i++) {
      if (
        this.#lm_msgs_received.planes[i].messages.length > 1 &&
        this.#lm_msgs_received.planes[i].messages[
          this.#lm_msgs_received.planes[i].messages.length - 1
        ].uid === uid
      ) {
        matched_index = i;

        let active_tab = String(
          this.#lm_msgs_received.planes[i].messages.findIndex(
            (sub_msg: acars_msg) => {
              if (sub_msg.uid === element_id) {
                return true;
              }
              return false;
            },
          ),
        );

        active_tab = active_tab === "-1" ? "0" : active_tab;

        if (active_tab === "0") {
          next_tab = this.#lm_msgs_received.planes[i].messages[1].uid;
          previous_tab =
            this.#lm_msgs_received.planes[i].messages[
              this.#lm_msgs_received.planes[i].messages.length - 1
            ].uid;
        } else if (
          active_tab ===
          String(this.#lm_msgs_received.planes[i].messages.length - 1)
        ) {
          next_tab = this.#lm_msgs_received.planes[i].messages[0].uid;
          previous_tab =
            this.#lm_msgs_received.planes[i].messages[
              this.#lm_msgs_received.planes[i].messages.length - 2
            ].uid;
        } else {
          next_tab =
            this.#lm_msgs_received.planes[i].messages[Number(active_tab) + 1]
              .uid;
          previous_tab =
            this.#lm_msgs_received.planes[i].messages[Number(active_tab) - 1]
              .uid;
        }

        i = this.#lm_msgs_received.planes.length;
      }
    }

    // Update the buttons for the previous / next message
    $(`#tab${uid}_previous`).attr(
      "href",
      `javascript:handle_radio("${previous_tab}", "${uid}")`,
    );
    $(`#tab${uid}_next`).attr(
      "href",
      `javascript:handle_radio("${next_tab}", "${uid}")`,
    );

    let added = false;
    if (this.#selected_tabs !== "") {
      const split = this.#selected_tabs.split(",");
      for (let i = 0; i < split.length; i++) {
        const sub_split = split[i].split(";");

        if (sub_split[0] === uid && i === 0) {
          this.#selected_tabs = uid + ";" + element_id;
          added = true;
        } else if (sub_split[0] === uid) {
          this.#selected_tabs += "," + uid + ";" + element_id;
          added = true;
        } else if (i === 0)
          this.#selected_tabs = sub_split[0] + ";" + sub_split[1];
        else this.#selected_tabs += "," + sub_split[0] + ";" + sub_split[1];
      }
    }

    if (this.#selected_tabs.length === 0) {
      this.#selected_tabs = uid + ";" + element_id;
    } else if (!added) {
      this.#selected_tabs += "," + uid + ";" + element_id;
    }

    // get the messages for the plane and generate new html
    if (matched_index !== undefined) {
      const messages = this.#lm_msgs_received.planes[matched_index].messages;
      // Generate new HTML for the messages

      console.log(
        `Updating message group ${uid} with ${messages.length} messages`,
      );
      const replacement_message = display_message_group(
        messages,
        this.#selected_tabs,
        true,
      );
      console.log(`Replacement message HTML: ${replacement_message}`);

      $(`#acarsmsg_${uid}_container`).replaceWith(replacement_message);
      resize_tabs();
    }
  }

  // Function to toggle pausing visual update of the page

  pause_updates(toggle_pause: boolean = true): void {
    if (toggle_pause) this.#pause = !this.#pause;

    this.updateSettingsUI();

    if (this.#pause) {
      $("#received").html(
        'Received messages <span class="red">(paused)</span>: ',
      );
    } else {
      $("#received").html("Received messages: ");
      $("#log").html(
        display_messages(
          this.#lm_msgs_received.get_all_messages(),
          this.#selected_tabs,
          true,
        ),
      );
      resize_tabs();
    }
  }

  // function to toggle the filtering of empty/no text messages

  filter_notext(toggle_filter: boolean = true): void {
    if (toggle_filter) this.#text_filter = !this.#text_filter;

    this.updateSettingsUI();

    if (this.#text_filter) {
      $("#filtered").html(
        '<div><span class="menu_non_link">Filtered Messages:&nbsp;</span><span class="green" id="filteredmessages"></span></div>',
      );

      $("#filteredmessages").html(String(this.#filtered_messages));
      Cookies.set("filter", "true", {
        expires: 365,
        sameSite: "Strict",
      });
    } else {
      Cookies.set("filter", "false", {
        expires: 365,
        sameSite: "Strict",
      });
      // Only reset the counter if no filters are active
      if (this.#exclude.length === 0) {
        this.#filtered_messages = 0;

        $("#filtered").html("");
      }
    }
  }

  // Function to toggle/save the selected filtered message labels
  // Input is the message label ID that should be filtered

  toggle_label(key: string): void {
    if (this.#exclude.indexOf(key.toString()) === -1) {
      this.#exclude.push(key.toString());
      $(`#${key.toString()}`).removeClass("sidebar_link").addClass("red");
      let exclude_string = "";
      for (let i = 0; i < this.#exclude.length; i++) {
        exclude_string += this.#exclude[i] + " ";
      }

      Cookies.set("exclude", exclude_string.trim(), {
        expires: 365,
        sameSite: "Strict",
      });
    } else {
      let exclude_string = "";
      $(`#${key.toString()}`).removeClass("red").addClass("sidebar_link");
      for (let i = 0; i < this.#exclude.length; i++) {
        if (this.#exclude[i] !== key.toString() && key !== " " && key !== "")
          exclude_string += this.#exclude[i] + " ";
      }
      if (
        exclude_string.trim().split(" ").length === 1 &&
        exclude_string.trim().split(" ")[0] === ""
      )
        this.#exclude = [];
      else this.#exclude = exclude_string.trim().split(" ");

      Cookies.set("exclude", exclude_string.trim(), {
        expires: 365,
        sameSite: "Strict",
      });
    }

    if (this.#exclude.length > 0 || this.#text_filter) {
      $("#filtered").html(
        '<div><span class="menu_non_link">Filtered Messages:&nbsp;</span><span class="green" id="filteredmessages"></span></div>',
      );

      $("#filteredmessages").html(String(this.#filtered_messages));
    } else {
      this.#filtered_messages = 0;
      $("#filtered").html("");
    }
  }

  // Code that is ran when the page has loaded

  // if the live message page is active we'll toggle the display of everything here

  active(state = false): void {
    super.active(state);

    $(document).off("keyup");
    if (this.page_active) {
      // page is active
      this.set_html();
      this.increment_received(true); // show the received msgs
      this.increment_filtered(true); // show the filtered msgs
      this.show_labels();
      $("#log").html(
        !this.#pause
          ? display_messages(
              this.#lm_msgs_received.get_all_messages(),
              this.#selected_tabs,
              true,
            )
          : this.#current_message_string,
      ); // show the messages we've received
      resize_tabs();
      // biome-ignore lint/suspicious/noExplicitAny: jQuery event type is complex
      $(document).on("keyup", (event: any) => {
        if (this.page_active) {
          // key code for escape is 27
          if (event.keyCode === 80) {
            this.pause_updates();
          }
        }
      });
    }
  }

  show_live_message_modal(): void {
    settingsManager.openSettings("live_messages");
  }

  set_html(): void {
    $("#modal_text").html(
      '<a href="javascript:show_page_modal()">Settings</a>',
    );
  }

  private registerSettings(): void {
    const sections: SettingsSection[] = [
      {
        id: "general",
        title: "Live Messages",
        content: `
          <div class="settings-option">
            <label class="settings-label" for="pause_checkbox">Pause updates</label>
            <input type="checkbox" id="pause_checkbox" onclick="pause_updates()" />
          </div>
          <div class="settings-option">
            <label class="settings-label" for="filter_checkbox">Filter out "No Text" messages</label>
            <input type="checkbox" id="filter_checkbox" onclick="filter_notext()" />
          </div>
          <h4 class="settings-section-header">Message Labels</h4>
          <div id="label_checkboxes" class="label-checkboxes">
          </div>
        `,
        onShow: () => {
          this.updateSettingsUI();
          resize_tabs();
        },
      },
    ];

    settingsManager.registerPageSettings("live_messages", sections);
  }

  private updateSettingsUI(): void {
    $("#pause_checkbox").prop("checked", this.#pause);
    $("#filter_checkbox").prop("checked", this.#text_filter);
    this.show_labels();
  }

  new_labels(msg: labels): void {
    this.#filter_labels = msg;
    this.show_labels();
  }

  skip_message(msg: acars_msg): boolean {
    // The message has a label and it's in the group to exclude
    let skip_message = true;
    if ("label" in msg && msg.label && this.#exclude.indexOf(msg.label) !== -1)
      return true;

    // The user is not filtering empty messages, return
    if (!this.#text_filter) return false;

    // The user is filtering empty messages, return if not empty
    Object.values(this.#msg_tags).forEach((tag) => {
      if (tag in msg) skip_message = false;
    });

    return skip_message;
  }

  // See if the new message matches an old message

  check_for_message_match(message: acars_msg, new_msg: acars_msg): boolean {
    if (
      this.property_checker(message, new_msg, "tail") &&
      new_msg.tail === message.tail &&
      ((this.property_checker(message, new_msg, "icao") &&
        message.icao === new_msg.icao) ||
        !this.property_checker(message, new_msg, "icao")) &&
      ((this.property_checker(message, new_msg, "flight") &&
        message.flight === new_msg.flight) ||
        !this.property_checker(message, new_msg, "flight"))
    ) {
      return true;
    } else if (
      this.property_checker(message, new_msg, "icao") &&
      new_msg.icao === message.icao &&
      ((this.property_checker(message, new_msg, "tail") &&
        message.tail === new_msg.tail) ||
        !this.property_checker(message, new_msg, "tail")) &&
      ((this.property_checker(message, new_msg, "flight") &&
        message.flight === new_msg.flight) ||
        !this.property_checker(message, new_msg, "flight"))
    ) {
      return true;
    } else if (
      this.property_checker(message, new_msg, "flight") &&
      new_msg.flight === message.flight &&
      ((this.property_checker(message, new_msg, "icao") &&
        message.icao === new_msg.icao) ||
        !this.property_checker(message, new_msg, "icao")) &&
      ((this.property_checker(message, new_msg, "tail") &&
        message.tail === new_msg.tail) ||
        !this.property_checker(message, new_msg, "tail"))
    ) {
      return true;
    } else if (
      this.property_checker(message, new_msg, "text") &&
      new_msg.label === "SQ" &&
      message.label === "SQ" &&
      new_msg.text === message.text
    ) {
      return true;
    }

    return false;
  }

  property_checker(
    message: acars_msg,
    new_msg: acars_msg,
    property: string,
  ): boolean {
    return property in message && property in new_msg;
  }

  check_for_dup(message: acars_msg, new_msg: acars_msg): boolean {
    return Object.values(this.#msg_tags).every((tag) => {
      if (tag in message && tag in new_msg) {
        if (message[tag] === new_msg[tag]) return true;
      } else if (!(tag in message) && !(tag in new_msg)) {
        return true;
      }
      return false;
    });
  }

  new_acars_message(msg: html_msg): void {
    const new_msg = msg.msghtml;
    let move_or_delete_id: undefined | string;
    let dont_update_page = false;
    if (!this.skip_message(new_msg)) {
      // if the message filter is not set or the message is not in the exclude list, continue
      if ("text" in new_msg) {
        // see if we can run it through the text decoder
        try {
          const decoded_msg = this.#lm_md.decode(new_msg);
          if (decoded_msg.decoded === true) {
            new_msg.decodedText = decoded_msg;
          }
        } catch (e) {
          console.error(`Decoder Error: ${e}`);
        }
      }

      // See if the message matches any alerts
      const matched: alert_matched = match_alert(msg);
      if (matched.was_found) {
        new_msg.matched = true;
        new_msg.matched_text = matched.text !== null ? matched.text : [];
        new_msg.matched_icao = matched.icao !== null ? matched.icao : [];
        new_msg.matched_flight = matched.flight !== null ? matched.flight : [];
        new_msg.matched_tail = matched.tail !== null ? matched.tail : [];
      }

      const new_tail = new_msg.tail;
      const _new_icao = new_msg.icao;
      const new_icao_hex = new_msg.icao_hex;
      const _new_flight = new_msg.flight;
      const new_icao_flight = new_msg.icao_flight;
      let found = false; // variable to track if the new message was found in previous messages
      let rejected = false; // variable to track if the new message was rejected for being a duplicate
      let index_of_found_plane = 0;
      new_msg.uid = this.getRandomInt(1000000).toString(); // Each message gets a unique ID. Used to track tab selection
      // Loop through the received messages. If a message is found we'll break out of the for loop

      for (const planes of this.#lm_msgs_received.planes) {
        // Now we loop through all of the messages in the message group to find a match in case the first doesn't
        // Have the field we need
        // There is a possibility that (for reasons I cannot fathom) aircraft will broadcast the same flight information
        // With one field being different. We'll reject that message as being not in the same message group if that's the case
        // We'll also test for squitter messages which don't have tail/icao/flight
        for (const message of planes.messages) {
          if (this.check_for_message_match(message, new_msg)) {
            // We've found a matching message
            // See if the UIDs for the plane are present, and if not, push them
            found = true;
            if (
              new_icao_flight &&
              !planes.identifiers.includes(new_icao_flight)
            )
              planes.identifiers.push(new_icao_flight);
            if (new_tail && !planes.identifiers.includes(new_tail))
              planes.identifiers.push(new_tail);
            if (new_icao_hex && !planes.identifiers.includes(new_icao_hex))
              planes.identifiers.push(new_icao_hex);
            break;
          }
        }
        // if we found a message group that matches the new message
        // run through the messages in that group to see if it is a dup.
        // if it is, we'll reject the new message and append a counter to the old/saved message
        if (found) {
          index_of_found_plane = this.#lm_msgs_received.planes.indexOf(planes);
          for (const message of this.#lm_msgs_received.planes[
            index_of_found_plane
          ].messages) {
            // First check is to see if the message is the same by checking all fields and seeing if they match
            // Second check is to see if the text field itself is a match
            // Last check is to see if we've received a multi-part message
            // If we do find a match we'll update the timestamp of the parent message
            // And add/update a duplicate counter to the parent message
            if (this.check_for_dup(message, new_msg)) {
              // Check if the message is a dup based on all fields
              message.timestamp = new_msg.timestamp;
              message.duplicates = String(Number(message.duplicates || 0) + 1);
              rejected = true;
              move_or_delete_id =
                this.#lm_msgs_received.planes[index_of_found_plane].messages[
                  this.#lm_msgs_received.planes[index_of_found_plane].messages
                    .length - 1
                ].uid;
            } else if (
              // check if text fields are the same
              "text" in message &&
              "text" in new_msg &&
              message.text === new_msg.text
            ) {
              // it's the same message
              message.timestamp = new_msg.timestamp;
              message.duplicates = String(Number(message.duplicates || 0) + 1);
              rejected = true;
              move_or_delete_id =
                this.#lm_msgs_received.planes[index_of_found_plane].messages[
                  this.#lm_msgs_received.planes[index_of_found_plane].messages
                    .length - 1
                ].uid;
            } else if (
              new_msg.station_id === message.station_id && // Is the message from the same station id? Keep ACARS/VDLM separate
              new_msg.timestamp - message.timestamp < 8.0 && // We'll assume the message is not a multi-part message if the time from the new message is too great from the rest of the group
              typeof new_msg.msgno !== "undefined" && // For reasons unknown to me TS is throwing an error if we don't check for undefined
              typeof message.msgno !== "undefined" && // Even though we can't reach this point if the message doesn't have a msgno
              ((new_msg.msgno.charAt(0) === message.msgno.charAt(0) && // Next two lines match on AzzA pattern
                new_msg.msgno.charAt(3) === message.msgno.charAt(3)) ||
                new_msg.msgno.substring(0, 3) === message.msgno.substring(0, 3))
            ) {
              // This check matches if the group is a AAAz counter
              // We have a multi part message. Now we need to see if it is a dup
              rejected = true;
              move_or_delete_id =
                this.#lm_msgs_received.planes[index_of_found_plane].messages[
                  this.#lm_msgs_received.planes[index_of_found_plane].messages
                    .length - 1
                ].uid;
              let add_multi = true;

              if ("msgno_parts" in message) {
                // Now we'll see if the multi-part message is a dup
                const split = message.msgno_parts?.toString().split(" "); // format of stored parts is "MSGID MSGID2" etc

                if (split !== undefined) {
                  for (let a = 0; a < split.length; a++) {
                    // Loop through the msg IDs present
                    if (split[a].substring(0, 4) === new_msg.msgno) {
                      // Found a match in the message IDs already present
                      add_multi = false; // Ensure later checks know we've found a duplicate and to not add the message

                      if (a === 0 && split[a].length === 4) {
                        // Match, first element of the array with no previous matches so we don't want a leading space
                        message.msgno_parts = split[a] + "x2";
                      } else if (split[a].length === 4) {
                        // Match, not first element, and doesn't have previous matches
                        message.msgno_parts += " " + split[a] + "x2";
                      } else if (a === 0) {
                        // Match, first element of the array so no leading space, has previous other matches so we increment the counter
                        const count = parseInt(split[a].substring(5), 10) + 1;
                        message.msgno_parts =
                          split[a].substring(0, 4) + "x" + count;
                      } else {
                        // Match, has previous other matches so we increment the counter
                        const count = parseInt(split[a].substring(5), 10) + 1;
                        message.msgno_parts +=
                          " " + split[a].substring(0, 4) + "x" + count;
                      }
                    } else {
                      // No match, re-add the MSG ID to the parent message
                      if (a === 0) {
                        message.msgno_parts = split[a];
                      } else {
                        message.msgno_parts += " " + split[a];
                      }
                    }
                  }
                }
              }

              message.timestamp = new_msg.timestamp;

              if (add_multi) {
                // Multi-part message has been found
                if (message.text && "text" in new_msg)
                  // If the multi-part parent has a text field and the found match has a text field, append
                  message.text += new_msg.text;
                else if ("text" in new_msg)
                  // If the new message has a text field but the parent does not, add the new text to the parent
                  message.text = new_msg.text;

                if ("msgno_parts" in message) {
                  // If the new message is multi, with no dupes found we need to append the msg ID to the found IDs
                  message.msgno_parts += " " + new_msg.msgno;
                } else {
                  message.msgno_parts = message.msgno + " " + new_msg.msgno;
                }

                // Re-run the text decoder against the text field we've updated
                try {
                  const decoded_msg = this.#lm_md.decode(message);
                  if (decoded_msg.decoded === true) {
                    message.decoded_msg = decoded_msg;
                  }
                } catch (e) {
                  console.error(`Decoder Error${e}`);
                }

                if (matched.was_found && !msg.loading) sound_alert();
              }
              break;
            }

            if (rejected) {
              // Promote the message back to the front
              this.#lm_msgs_received.planes[
                index_of_found_plane
                // biome-ignore lint/suspicious/noExplicitAny: array contains acars_msg which is complex type
              ].messages.forEach((item: any, i: number) => {
                if (
                  i ===
                  this.#lm_msgs_received.planes[
                    index_of_found_plane
                  ].messages.indexOf(message)
                ) {
                  this.#lm_msgs_received.planes[
                    index_of_found_plane
                  ].messages.splice(i, 1);
                  this.#lm_msgs_received.planes[
                    index_of_found_plane
                  ].messages.unshift(item);
                }
              });
              break;
            }
          }
        }
        // If the message was found we'll move the message group back to the top
        if (found) {
          // If the message was found, and not rejected, we'll append it to the message group
          if (!rejected) {
            this.#lm_msgs_received.planes[
              index_of_found_plane
            ].messages.unshift(new_msg);
            if (
              !this.#lm_msgs_received.planes[index_of_found_plane].has_alerts &&
              matched.was_found
            )
              this.#lm_msgs_received.planes[index_of_found_plane].has_alerts =
                true;
            if (matched.was_found)
              this.#lm_msgs_received.planes[index_of_found_plane].num_alerts +=
                1;
          }

          this.#lm_msgs_received.planes.forEach((item, i) => {
            if (i === index_of_found_plane) {
              this.#lm_msgs_received.planes.splice(i, 1);
              this.#lm_msgs_received.planes.unshift(item);
            }
          });
        }
        if (found) {
          break;
        }
      }
      if (!found && !rejected) {
        if (matched.was_found && !msg.loading) sound_alert();
        const ids = [];
        if (new_icao_hex) ids.push(new_icao_hex);
        if (new_icao_flight) ids.push(new_icao_flight);
        if (new_tail) {
          ids.push(new_tail);
          if (new_tail.includes("-")) {
            ids.push(new_tail.replace("-", ""));
          }
        }
        this.#lm_msgs_received.unshift({
          has_alerts: matched.was_found,
          num_alerts: matched.was_found ? 1 : 0,
          messages: [new_msg],
          identifiers: ids,
        } as plane);
      }
    } else {
      if (this.#text_filter && !msg.loading) this.increment_filtered();
      dont_update_page = true;
    }
    if (!msg.loading) this.increment_received();
    if (
      this.page_active &&
      !this.#pause &&
      !dont_update_page &&
      (typeof msg.done_loading === "undefined" || msg.done_loading === true)
    ) {
      if (typeof msg.done_loading === "undefined") {
        // this is not loading and we should already have a valid DOM tree to play with
        // If this was a matched message delete the element from the tree so it can be moved to the front
        if (move_or_delete_id) {
          let _counter = 1;
          while ($(`#acarsmsg_${move_or_delete_id}_container`).length > 0) {
            $(`#acarsmsg_${move_or_delete_id}_container`).remove();
            _counter++;
          }
        }
        // Display the new message at the front of the DOM tree
        $("#log").prepend(
          display_message_group(
            this.#lm_msgs_received.get_first_message(),
            this.#selected_tabs,
            true,
          ),
        );
        // After updating the tree we may exceed the length. If so, remove the last element
        if ($("#log .acars_message_container").length > 20) {
          $("#log div.acars_message_container:last").remove();
        }
        // Save the DOM tree HTML because this is a hacky hack to get the page refreshed on page in
        this.#current_message_string = $("#log").html();
      } else {
        // This is a new load and we need to populate the DOM tree
        this.#current_message_string = display_messages(
          this.#lm_msgs_received.get_all_messages(),
          this.#selected_tabs,
          true,
        );
        $("#log").html(this.#current_message_string);
      }
      resize_tabs();
      tooltip.close_all_tooltips();
      tooltip.attach_all_tooltips();
    }
  }

  get_match(
    callsign: string = "",
    hex: string = "",
    tail: string = "",
  ): plane_match {
    if (callsign === "" && hex === "" && tail === "")
      return { messages: [] as acars_msg[], has_alerts: false } as plane_match;
    for (const planes of this.#lm_msgs_received.planes) {
      // check to see if any of the inputs match the message. msg.tail needs to be checked
      // against both callsign and tail because sometimes the tail is the flight/callsign
      if (
        planes.identifiers.includes(hex.toUpperCase()) ||
        planes.identifiers.includes(callsign) ||
        planes.identifiers.includes(tail)
      ) {
        return {
          messages: planes.messages,
          has_alerts: planes.has_alerts,
          num_alerts: planes.num_alerts,
          matches: planes.has_alerts,
        } as plane_match;
      }
    }
    return {
      messages: [] as acars_msg[],
      has_alerts: false,
      num_alerts: 0,
    } as plane_match;
  }

  find_matches(): plane_data {
    const output: plane_data = {};
    for (const planes of this.#lm_msgs_received.planes) {
      const length_of_messages = planes.messages.length;
      const alert = planes.has_alerts;
      const num_alerts = planes.num_alerts;
      planes.identifiers.forEach((identifier) => {
        output[identifier] = {
          count: length_of_messages,
          has_alerts: alert,
          num_alerts: num_alerts,
        };
        if (identifier.includes("-")) {
          output[identifier.replace("-", "")] = {
            count: length_of_messages,
            has_alerts: alert,
            num_alerts: num_alerts,
          };
        }
      });
    }
    return output;
  }
}
