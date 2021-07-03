import { MessageDecoder } from "@airframes/acars-decoder/dist/MessageDecoder";
import Cookies from "js-cookie";
import { display_messages } from "./html_generator.js";
import { html_msg, acars_msg, labels, matches, plane } from "./interfaces.js";
import jBox from "jbox";
import "jbox/dist/jBox.all.css";
import { tooltip } from "./tooltips.js";
import { resize_tabs, match_alert, sound_alert } from "./index.js";

export let live_messages_page = {
  pause: false as boolean,
  text_filter: false as boolean,
  lm_msgs_received: {
    planes: [] as plane[],
    unshift: function (a: plane) {
      if (this.planes.length >= 50) {
        this.planes.pop();
      }
      return Array.prototype.unshift.apply(this.planes, [a]);
    },
    get_all_messages: function () {
      let output = [] as acars_msg[][];
      for (const msgList of this.planes) {
        output.push(msgList.messages);
      }

      return output;
    },
  },
  exclude: [] as string[],
  selected_tabs: "" as string,
  filter_labels: (<unknown>null) as labels,
  lm_page_active: false as boolean,
  lm_md: new MessageDecoder(),
  lm_acars_path: "" as string,
  lm_acars_url: "" as string,

  filtered_messages: 0 as number,
  received_messages: 0 as number,
  live_message_modal: new jBox("Modal", {
    id: "set_modal",
    width: 350,
    height: 200,
    blockScroll: false,
    isolateScroll: true,
    animation: "zoomIn",
    closeButton: "title",
    overlay: true,
    reposition: false,
    repositionOnOpen: true,
    title: "Live Message Settings",
    content: `<p><a href="javascript:pause_updates()" id="pause_updates" class="spread_text">Pause updates</a></p>
      <a href="javascript:filter_notext()" id="filter_notext" class="spread_text">Filter out "No Text" messages</a>
      <!--<div class="fixed_menu" id="fixed_menu"> --!>
    <div class="wrap-collabsible">
          <input id="collapsible" class="toggle" type="checkbox">
          <label for="collapsible" class="lbl-toggle">Filter Message Labels</label>
          <div class="collapsible-content" id="collapsible-content">
          <div class="content-inner" id="label_links">
          <!-- <p>&nbsp;</p> --!>
          </div>
          </div>
          </div>
          <!--</div> --!>`,
  }),

  setting_modal_on: function () {
    this.show_labels();
    this.pause_updates(false);
    this.filter_notext(false);
  },

  // Function to increment the counter of filtered messages

  increment_filtered: function (page_refresh = false) {
    if (!page_refresh) this.filtered_messages++;
    $("#filteredmessages").html(String(this.filtered_messages));
  },

  // Function to increment the counter of received messages

  increment_received: function (page_refresh = false) {
    if (!page_refresh) this.received_messages++;
    $("#receivedmessages").html(String(this.received_messages));
  },

  show_labels: function () {
    let label_html = "";
    if (this.filter_labels !== null && this.lm_page_active) {
      for (let key in this.filter_labels.labels) {
        let link_class: string =
          this.exclude.indexOf(key.toString()) !== -1 ? "red" : "sidebar_link";
        label_html += `<a href="javascript:toggle_label('${key.toString()}');" id="${key}" class="${link_class}">${key} ${
          this.filter_labels.labels[key].name
        }</a><br>`;
      }
      $("#label_links").html(label_html);
    }
  },

  // Function to return a random integer
  // Input: integter that represents the maximum number that can be returned

  getRandomInt: function (max: number) {
    return Math.floor(Math.random() * Math.floor(max));
  },

  // Function to handle click events on the message tab
  // Input is the element ID (aka message label ID) that has been selected
  // Input is the UID of the message group, which is also the element ID of the oldest element in that group

  handle_radio: function (element_id: string, uid: string) {
    $(`div.sub_msg${uid}`).removeClass("checked"); // Turn off the display of all messages in the UID group
    $(`input.tabs_${uid}`).prop("checked", false); // Turn off the checked indicator for all messages in the UID group
    $(`#message_${uid}_${element_id}`).addClass("checked"); // Turn on the display of the message that is now active
    $(`#tab${element_id}_${uid}`).prop("checked", true); // Turn on the checked indicator for the message that is now active

    // Now we need to update the nav arrow links

    let next_tab: string = "0";
    let previous_tab: string = "0";

    // Find the next / previous tabs
    // This is UGLY
    // TODO....deuglify it
    for (let i = 0; i < this.lm_msgs_received.planes.length; i++) {
      if (
        this.lm_msgs_received.planes[i].messages.length > 1 &&
        this.lm_msgs_received.planes[i].messages[
          this.lm_msgs_received.planes[i].messages.length - 1
        ].uid == uid
      ) {
        let active_tab = String(
          this.lm_msgs_received.planes[i].messages.findIndex(
            (sub_msg: acars_msg) => {
              if (sub_msg.uid === element_id) {
                return true;
              }
            }
          )
        );

        active_tab = active_tab === "-1" ? "0" : active_tab;

        if (active_tab === "0") {
          next_tab = this.lm_msgs_received.planes[i].messages[1].uid;
          previous_tab = this.lm_msgs_received.planes[i].messages[
            this.lm_msgs_received.planes[i].messages.length - 1
          ].uid;
        } else if (
          active_tab ===
          String(this.lm_msgs_received.planes[i].messages.length - 1)
        ) {
          next_tab = this.lm_msgs_received.planes[i].messages[0].uid;
          previous_tab = this.lm_msgs_received.planes[i].messages[
            this.lm_msgs_received.planes[i].messages.length - 2
          ].uid;
        } else {
          next_tab = this.lm_msgs_received.planes[i].messages[
            Number(active_tab) + 1
          ].uid;
          previous_tab = this.lm_msgs_received.planes[i].messages[
            Number(active_tab) - 1
          ].uid;
        }

        i = this.lm_msgs_received.planes.length;
      }
    }

    // Update the buttons for the previous / next message
    $(`#tab${uid}_previous`).attr(
      "href",
      `javascript:handle_radio("${previous_tab}", "${uid}")`
    );
    $(`#tab${uid}_next`).attr(
      "href",
      `javascript:handle_radio("${next_tab}", "${uid}")`
    );

    let added = false;
    if (this.selected_tabs != "") {
      let split = this.selected_tabs.split(",");
      for (let i = 0; i < split.length; i++) {
        let sub_split = split[i].split(";");

        if (sub_split[0] == uid && i == 0) {
          this.selected_tabs = uid + ";" + element_id;
          added = true;
        } else if (sub_split[0] == uid) {
          this.selected_tabs += "," + uid + ";" + element_id;
          added = true;
        } else if (i == 0)
          this.selected_tabs = sub_split[0] + ";" + sub_split[1];
        else this.selected_tabs += "," + sub_split[0] + ";" + sub_split[1];
      }
    }

    if (this.selected_tabs.length == 0) {
      this.selected_tabs = uid + ";" + element_id;
    } else if (!added) {
      this.selected_tabs += "," + uid + ";" + element_id;
    }
  },

  // Function to toggle pausing visual update of the page

  pause_updates: function (toggle_pause: boolean = true) {
    if (!toggle_pause) this.pause = !this.pause;

    if (this.pause) {
      this.pause = false;
      $("#pause_updates").html("Pause Updates");
      $("#received").html("Received messages: ");
      $("#log").html(
        display_messages(
          this.lm_msgs_received.get_all_messages(),
          this.selected_tabs,
          true
        )
      );
    } else {
      this.pause = true;
      $("#pause_updates").html('<span class="red">Unpause Updates</span>');
      $("#received").html("Received messages (paused): ");
    }
  },

  // function to toggle the filtering of empty/no text messages

  filter_notext: function (toggle_filter: boolean = true) {
    if (!toggle_filter) this.text_filter = !this.text_filter;

    if (this.text_filter) {
      this.text_filter = false;
      $("#filter_notext").html("Hide Empty Messages");
      Cookies.set("filter", "false", { expires: 365 });
      this.filtered_messages = 0;

      $("#filtered").html("");
    } else {
      this.text_filter = true;

      $("#filtered").html(
        '<div><span class="menu_non_link">Filtered Messages:&nbsp;</span><span class="green" id="filteredmessages"></span></div>'
      );

      $("#filteredmessages").html(String(this.filtered_messages));
      $("#filter_notext").html('<span class="red">Show All Messages</span>');
      Cookies.set("filter", "true", { expires: 365 });
    }
  },

  // Function to toggle/save the selected filtered message labels
  // Input is the message label ID that should be filtered

  toggle_label: function (key: string) {
    if (this.exclude.indexOf(key.toString()) == -1) {
      this.exclude.push(key.toString());
      $(`#${key.toString()}`).removeClass("sidebar_link").addClass("red");
      let exclude_string = "";
      for (let i = 0; i < this.exclude.length; i++) {
        exclude_string += this.exclude[i] + " ";
      }

      Cookies.set("exclude", exclude_string.trim(), { expires: 365 });
    } else {
      let exclude_string = "";
      $(`#${key.toString()}`).removeClass("red").addClass("sidebar_link");
      for (let i = 0; i < this.exclude.length; i++) {
        if (this.exclude[i] != key.toString())
          exclude_string += this.exclude[i] + " ";
      }
      this.exclude = exclude_string.trim().split(" ");
      Cookies.set("exclude", exclude_string.trim(), { expires: 365 });
    }
  },

  // Code that is ran when the page has loaded

  live_messages: function () {
    // Document on ready new syntax....or something. Passing a function directly to jquery

    // Grab the current cookie value for message filtering
    // If the cookie is found with a value we run filter_notext to set the proper visual elements/variables for the rest of the functions
    // We'll also re-write the cookie (or start a new one) with the current value
    // This is necessary because Safari doesn't respect the expiration date of more than 7 days. It will set it to 7 days even though we've set 365 days
    // This also just keeps moving the expiration date moving forward every time the page is loaded

    let filter = Cookies.get("filter");
    if (filter == "true") {
      console.log("filtering");
      Cookies.set("filter", "true", { expires: 365 });
      this.filter_notext();
    } else {
      this.text_filter = true; // temporarily flip the value so we can run the filter_notext() function and set the proper CSS
      Cookies.set("filter", "false", { expires: 365 });
      this.filter_notext();
    }

    // Grab the current cookie value for the message labels being filtered
    // Same restrictions as the 'filter'
    let exclude_cookie = Cookies.get("exclude");
    if (exclude_cookie == null) {
      Cookies.set("exclude", "", { expires: 365 });
    } else {
      Cookies.set("exclude", exclude_cookie, { expires: 365 });
      this.exclude = exclude_cookie.split(" ");
    }
  },

  // if the live message page is active we'll toggle the display of everything here

  live_message_active: function (state = false) {
    this.lm_page_active = state;

    if (this.lm_page_active) {
      // page is active
      this.set_html();
      this.increment_received(true); // show the received msgs
      this.increment_filtered(true); // show the filtered msgs
      this.show_labels();
      $("#log").html(
        display_messages(
          this.lm_msgs_received.get_all_messages(),
          this.selected_tabs,
          true
        )
      ); // show the messages we've received
    }
  },

  show_live_message_modal: function () {
    this.live_message_modal.open();
    this.setting_modal_on();
  },

  set_live_page_urls: function (documentPath: string, documentUrl: string) {
    this.lm_acars_path = documentPath;
    this.lm_acars_url = documentUrl;
  },

  set_html: function () {
    $("#modal_text").html(
      '<a href="javascript:show_page_modal()">Page Settings</a>'
    );
    $("#page_name").html("Messages will appear here, newest first:");
  },

  new_labels: function (msg: labels) {
    this.filter_labels = msg;
    this.show_labels();
  },

  new_acars_message: function (msg: html_msg) {
    let new_msg = msg.msghtml;
    if (
      new_msg.hasOwnProperty("label") == false ||
      this.exclude.indexOf(new_msg.label!) == -1
    ) {
      if (
        !this.text_filter ||
        new_msg.hasOwnProperty("text") ||
        new_msg.hasOwnProperty("data") ||
        new_msg.hasOwnProperty("libacars") ||
        new_msg.hasOwnProperty("dsta") ||
        new_msg.hasOwnProperty("depa") ||
        new_msg.hasOwnProperty("eta") ||
        new_msg.hasOwnProperty("gtout") ||
        new_msg.hasOwnProperty("gtin") ||
        new_msg.hasOwnProperty("wloff") ||
        new_msg.hasOwnProperty("wlin") ||
        new_msg.hasOwnProperty("lat") ||
        new_msg.hasOwnProperty("lon") ||
        new_msg.hasOwnProperty("alt")
      ) {
        if (new_msg.hasOwnProperty("text")) {
          let decoded_msg = this.lm_md.decode(new_msg);
          if (decoded_msg.decoded == true) {
            new_msg.decodedText = decoded_msg;
          }
        }

        let matched = match_alert(msg);
        if (matched.was_found) {
          new_msg.matched = true;
          new_msg.matched_text = matched.text !== null ? matched.text : [];
          new_msg.matched_icao = matched.icao !== null ? matched.icao : [];
          new_msg.matched_flight =
            matched.flight !== null ? matched.flight : [];
          new_msg.matched_tail = matched.tail !== null ? matched.tail : [];
        }

        let new_tail = new_msg.tail;
        let new_icao = new_msg.icao;
        let new_flight = new_msg.flight;
        let found = false; // variable to track if the new message was found in previous messages
        let rejected = false; // variable to track if the new message was rejected for being a duplicate
        let index_new = 0; // the index of the found previous message

        new_msg.uid = this.getRandomInt(1000000).toString(); // Each message gets a unique ID. Used to track tab selection
        // Loop through the received messages. If a message is found we'll break out of the for loop
        for (const planes of this.lm_msgs_received.planes) {
          // Now we loop through all of the messages in the message group to find a match in case the first doesn't
          // Have the field we need
          // There is a possibility that (for reasons I cannot fathom) aircraft will broadcast the same flight information
          // With one field being different. We'll reject that message as being not in the same message group if that's the case
          // We'll also test for squitter messages which don't have tail/icao/flight
          for (const message of planes.messages) {
            if (
              message.hasOwnProperty("tail") &&
              new_tail == message.tail &&
              ((message.hasOwnProperty("icao") && message.icao == new_icao) ||
                message.hasOwnProperty("icao")) &&
              ((message.hasOwnProperty("flight") &&
                message.flight == new_flight) ||
                !message.hasOwnProperty("flight"))
            ) {
              found = true;
              index_new = this.lm_msgs_received.planes.indexOf(planes);
            } else if (
              message.hasOwnProperty("icao") &&
              new_icao == message.icao &&
              ((message.hasOwnProperty("tail") && message.tail == new_tail) ||
                !message.hasOwnProperty("tail")) &&
              ((message.hasOwnProperty("flight") &&
                message.flight == new_flight) ||
                !message.hasOwnProperty("flight"))
            ) {
              found = true;
              index_new = this.lm_msgs_received.planes.indexOf(planes);
            } else if (
              message.hasOwnProperty("flight") &&
              new_flight == message.flight &&
              ((message.hasOwnProperty("icao") && message.icao == new_icao) ||
                !message.hasOwnProperty("icao")) &&
              ((message.hasOwnProperty("tail") && message.tail == new_tail) ||
                !message.hasOwnProperty("tail"))
            ) {
              found = true;
              index_new = this.lm_msgs_received.planes.indexOf(planes);
            } else if (
              new_msg.hasOwnProperty("label") &&
              message.hasOwnProperty("label") &&
              new_msg.hasOwnProperty("text") &&
              message.hasOwnProperty("text") &&
              new_msg.label == "SQ" &&
              message.label == "SQ" &&
              new_msg.text == message.text
            ) {
              found = true;
              index_new = this.lm_msgs_received.planes.indexOf(planes);
            }
            if (found) {
              break;
            }
          }
          // if we found a message group that matches the new message
          // run through the messages in that group to see if it is a dup.
          // if it is, we'll reject the new message and append a counter to the old/saved message
          if (found) {
            for (let message of this.lm_msgs_received.planes[index_new]
              .messages) {
              // First check is to see if the message is the same by checking all fields and seeing if they match
              // Second check is to see if the text field itself is a match
              // Last check is to see if we've received a multi-part message
              // If we do find a match we'll update the timestamp of the parent message
              // And add/update a duplicate counter to the parent message
              if (
                (message.text == new_msg.text ||
                  (!message.hasOwnProperty("text") &&
                    !new_msg.hasOwnProperty("text"))) &&
                (message.data == new_msg.data ||
                  (!message.hasOwnProperty("data") &&
                    !new_msg.hasOwnProperty("data"))) &&
                (message.libacars == new_msg.libacars ||
                  (!message.hasOwnProperty("libacars") &&
                    !new_msg.hasOwnProperty("libacars"))) &&
                (message.dsta == new_msg.dsta ||
                  (!message.hasOwnProperty("dsta") &&
                    !new_msg.hasOwnProperty("dsta"))) &&
                (message.depa == new_msg.depa ||
                  (!message.hasOwnProperty("depa") &&
                    !new_msg.hasOwnProperty("depa"))) &&
                (message.eta == new_msg.eta ||
                  (!message.hasOwnProperty("eta") &&
                    !new_msg.hasOwnProperty("eta"))) &&
                (message.gtout == new_msg.gtout ||
                  (!message.hasOwnProperty("gtout") &&
                    !new_msg.hasOwnProperty("gtout"))) &&
                (message.gtin == new_msg.gtin ||
                  (!message.hasOwnProperty("gtin") &&
                    !new_msg.hasOwnProperty("gtin"))) &&
                (message.wloff == new_msg.wloff ||
                  (!message.hasOwnProperty("wloff") &&
                    !new_msg.hasOwnProperty("wloff"))) &&
                (message.wlin == new_msg.wlin ||
                  (!message.hasOwnProperty("wlin") &&
                    !new_msg.hasOwnProperty("wlin"))) &&
                (message.lat == new_msg.lat ||
                  (!message.hasOwnProperty("lat") &&
                    !new_msg.hasOwnProperty("lat"))) &&
                (message.lon == new_msg.lon ||
                  (!message.hasOwnProperty("lon") &&
                    !new_msg.hasOwnProperty("lon"))) &&
                (message.alt == new_msg.alt ||
                  (!message.hasOwnProperty("alt") &&
                    !new_msg.hasOwnProperty("alt")))
              ) {
                message.timestamp = new_msg.timestamp;
                message.duplicates = String(
                  Number(message.duplicates || 0) + 1
                );
                rejected = true;
              } else if (
                message.hasOwnProperty("text") &&
                new_msg.hasOwnProperty("text") &&
                message.text == new_msg.text
              ) {
                // it's the same message
                message.timestamp = new_msg.timestamp;
                message.duplicates = String(
                  Number(message.duplicates || 0) + 1
                );
                rejected = true;
              } else if (
                new_msg.station_id == message.station_id && // Is the message from the same station id? Keep ACARS/VDLM separate
                new_msg.hasOwnProperty("msgno") &&
                message.hasOwnProperty("msgno") &&
                new_msg.timestamp - message.timestamp < 8.0 && // We'll assume the message is not a multi-part message if the time from the new message is too great from the rest of the group
                typeof new_msg.msgno !== "undefined" &&
                typeof message.msgno !== "undefined" &&
                ((new_msg.msgno.charAt(0) == message.msgno.charAt(0) && // Next two lines match on AzzA pattern
                  new_msg.msgno.charAt(3) == message.msgno.charAt(3)) ||
                  new_msg.msgno.substring(0, 3) ==
                    message.msgno.substring(0, 3))
              ) {
                // This check matches if the group is a AAAz counter
                // We have a multi part message. Now we need to see if it is a dup
                rejected = true;
                let add_multi = true;

                if (message.hasOwnProperty("msgno_parts")) {
                  // Now we'll see if the multi-part message is a dup
                  let split = message.msgno_parts!.toString().split(" "); // format of stored parts is "MSGID MSGID2" etc

                  for (let a = 0; a < split.length; a++) {
                    // Loop through the msg IDs present
                    if (split[a].substring(0, 4) == new_msg.msgno) {
                      // Found a match in the message IDs already present
                      add_multi = false; // Ensure later checks know we've found a duplicate and to not add the message

                      if (a == 0 && split[a].length == 4) {
                        // Match, first element of the array with no previous matches so we don't want a leading space
                        message.msgno_parts = split[a] + "x2";
                      } else if (split[a].length == 4) {
                        // Match, not first element, and doesn't have previous matches
                        message.msgno_parts += " " + split[a] + "x2";
                      } else if (a == 0) {
                        // Match, first element of the array so no leading space, has previous other matches so we increment the counter
                        let count = parseInt(split[a].substring(5)) + 1;
                        message.msgno_parts =
                          split[a].substring(0, 4) + "x" + count;
                      } else {
                        // Match, has previous other matches so we increment the counter
                        let count = parseInt(split[a].substring(5)) + 1;
                        message.msgno_parts +=
                          " " + split[a].substring(0, 4) + "x" + count;
                      }
                    } else {
                      // No match, re-add the MSG ID to the parent message
                      if (a == 0) {
                        message.msgno_parts = split[a];
                      } else {
                        message.msgno_parts += " " + split[a];
                      }
                    }
                  }
                }

                message.timestamp = new_msg.timestamp;

                if (add_multi) {
                  // Multi-part message has been found
                  if (message.text && new_msg.hasOwnProperty("text"))
                    // If the multi-part parent has a text field and the found match has a text field, append
                    message.text += new_msg.text;
                  else if (new_msg.hasOwnProperty("text"))
                    // If the new message has a text field but the parent does not, add the new text to the parent
                    message.text = new_msg.text;

                  if (message.hasOwnProperty("msgno_parts")) {
                    // If the new message is multi, with no dupes found we need to append the msg ID to the found IDs
                    message.msgno_parts += " " + new_msg.msgno;
                  } else {
                    message.msgno_parts = message.msgno + " " + new_msg.msgno;
                  }

                  // Re-run the text decoder against the text field we've updated
                  let decoded_msg = this.lm_md.decode(message);
                  if (decoded_msg.decoded == true) {
                    message["decoded_msg"] = decoded_msg;
                  }

                  if (matched.was_found && !msg.loading) sound_alert();
                }
                break;
              }

              if (rejected) {
                // Promote the message back to the front
                this.lm_msgs_received.planes[index_new].messages.forEach(
                  (item: any, i: number) => {
                    if (
                      i ==
                      this.lm_msgs_received.planes[index_new].messages.indexOf(
                        message
                      )
                    ) {
                      this.lm_msgs_received.planes[index_new].messages.splice(
                        i,
                        1
                      );
                      this.lm_msgs_received.planes[index_new].messages.unshift(
                        item
                      );
                    }
                  }
                );
                break;
              }
            }
          }
          // If the message was found we'll move the message group back to the top
          if (found) {
            // If the message was found, and not rejected, we'll append it to the message group
            if (!rejected) {
              this.lm_msgs_received.planes[index_new].messages.unshift(new_msg);
            }

            this.lm_msgs_received.planes.forEach((item, i) => {
              if (i == index_new) {
                this.lm_msgs_received.planes.splice(i, 1);
                this.lm_msgs_received.planes.unshift(item);
              }
            });
          }
          if (found) {
            break;
          }
        }
        if (!found && !rejected) {
          if (matched.was_found && !msg.loading) sound_alert();
          this.lm_msgs_received.unshift({
            messages: [new_msg],
            identifiers: [],
          } as plane);
        }
      } else if (!msg.loading) {
        this.increment_filtered();
      }
    } else {
      if (this.text_filter && !msg.loading) this.increment_filtered();
    }
    if (!msg.loading) this.increment_received();
    if (
      this.lm_page_active &&
      !this.pause &&
      (typeof msg.done_loading === "undefined" || msg.done_loading === true)
    ) {
      $("#log").html(
        display_messages(
          this.lm_msgs_received.get_all_messages(),
          this.selected_tabs,
          true
        )
      );
      resize_tabs();
      tooltip.close_all_tooltips();
      tooltip.attach_all_tooltips();
    }
  },

  get_match: function (
    callsign: string = "",
    hex: string = "",
    tail: string = ""
  ) {
    if (callsign === "" && hex === "" && tail === "") return [];
    for (const msgList of this.lm_msgs_received.planes) {
      for (const msg of msgList.messages) {
        // check to see if any of the inputs match the message. msg.tail needs to be checked
        // against both callsign and tail because sometimes the tail is the flight/callsign
        if (
          msg.icao_hex === hex.toUpperCase() ||
          msg.flight === callsign ||
          msg.tail === callsign ||
          (tail != undefined && msg.tail === tail)
        ) {
          return msgList.messages;
        }
      }
    }
    return [];
  },

  find_matches: function () {
    let output_hex: { [hex: string]: number } = {};
    let output_icao_callsigns: { [callsign: string]: number } = {};
    let output_tail: { [tail: string]: number } = {};
    for (const msgList of this.lm_msgs_received.planes) {
      let matched_hex,
        matched_tail,
        matched_flight = false;
      for (const msg of msgList.messages) {
        if (!matched_hex && msg.icao_hex != null)
          output_hex[msg.icao_hex.toUpperCase()] = msgList.messages.length;
        if (!matched_flight && msg.icao_flight != null)
          output_icao_callsigns[msg.icao_flight] = msgList.messages.length;
        if (!matched_tail && msg.tail != null)
          output_tail[msg.tail] = msgList.messages.length;

        if (matched_hex && matched_flight && matched_tail) continue;
      }
    }

    return {
      hex: output_hex,
      callsigns: output_icao_callsigns,
      tail: output_tail,
    };
  },
};
