import { MessageDecoder } from "@airframes/acars-decoder/dist/MessageDecoder";
import Cookies from "js-cookie";
import { display_messages } from "./html_generator.js";
import { html_msg, acars_msg, labels, matches } from "./interfaces.js";
import jBox from "jbox";
import "jbox/dist/jBox.all.css";
import { tooltip } from "./tooltips.js";
import { resize_tabs, match_alert, sound_alert } from "./index.js";

export let live_messages_page = {
  pause: false as boolean,
  text_filter: false as boolean,
  lm_msgs_received: {
    value: [] as acars_msg[][],
    unshift: function (a: any) {
      if (this.value.length >= 50) {
        this.value.pop();
      }
      return Array.prototype.unshift.apply(this.value, [a] as any);
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
    for (let i = 0; i < this.lm_msgs_received.value.length; i++) {
      if (
        this.lm_msgs_received.value[i].length > 1 &&
        this.lm_msgs_received.value[i][
          this.lm_msgs_received.value[i].length - 1
        ].uid == uid
      ) {
        let active_tab = String(
          this.lm_msgs_received.value[i].findIndex((sub_msg: acars_msg) => {
            if (sub_msg.uid === element_id) {
              return true;
            }
          })
        );

        active_tab = active_tab === "-1" ? "0" : active_tab;

        if (active_tab === "0") {
          next_tab = this.lm_msgs_received.value[i][1].uid;
          previous_tab = this.lm_msgs_received.value[i][
            this.lm_msgs_received.value[i].length - 1
          ].uid;
        } else if (
          active_tab === String(this.lm_msgs_received.value[i].length - 1)
        ) {
          next_tab = this.lm_msgs_received.value[i][0].uid;
          previous_tab = this.lm_msgs_received.value[i][
            this.lm_msgs_received.value[i].length - 2
          ].uid;
        } else {
          next_tab = this.lm_msgs_received.value[i][Number(active_tab) + 1].uid;
          previous_tab = this.lm_msgs_received.value[i][Number(active_tab) - 1]
            .uid;
        }

        i = this.lm_msgs_received.value.length;
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
        display_messages(this.lm_msgs_received.value, this.selected_tabs, true)
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
        display_messages(this.lm_msgs_received.value, this.selected_tabs, true)
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
    if (
      msg.msghtml.hasOwnProperty("label") == false ||
      this.exclude.indexOf(msg.msghtml.label!) == -1
    ) {
      if (
        !this.text_filter ||
        msg.msghtml.hasOwnProperty("text") ||
        msg.msghtml.hasOwnProperty("data") ||
        msg.msghtml.hasOwnProperty("libacars") ||
        msg.msghtml.hasOwnProperty("dsta") ||
        msg.msghtml.hasOwnProperty("depa") ||
        msg.msghtml.hasOwnProperty("eta") ||
        msg.msghtml.hasOwnProperty("gtout") ||
        msg.msghtml.hasOwnProperty("gtin") ||
        msg.msghtml.hasOwnProperty("wloff") ||
        msg.msghtml.hasOwnProperty("wlin") ||
        msg.msghtml.hasOwnProperty("lat") ||
        msg.msghtml.hasOwnProperty("lon") ||
        msg.msghtml.hasOwnProperty("alt")
      ) {
        if (msg.msghtml.hasOwnProperty("text")) {
          let decoded_msg = this.lm_md.decode(msg.msghtml);
          if (decoded_msg.decoded == true) {
            msg.msghtml.decodedText = decoded_msg;
          }
        }

        let matched = match_alert(msg);
        if (matched.was_found) {
          msg.msghtml.matched = true;
          msg.msghtml.matched_text = matched.text !== null ? matched.text : [];
          msg.msghtml.matched_icao = matched.icao !== null ? matched.icao : [];
          msg.msghtml.matched_flight =
            matched.flight !== null ? matched.flight : [];
          msg.msghtml.matched_tail = matched.tail !== null ? matched.tail : [];
        }

        let new_tail = msg.msghtml.tail;
        let new_icao = msg.msghtml.icao;
        let new_flight = msg.msghtml.flight;
        let found = false; // variable to track if the new message was found in previous messages
        let rejected = false; // variable to track if the new message was rejected for being a duplicate
        let index_new = 0; // the index of the found previous message

        msg.msghtml.uid = this.getRandomInt(1000000).toString(); // Each message gets a unique ID. Used to track tab selection

        // Loop through the received messages. If a message is found we'll break out of the for loop
        for (let u = 0; u < this.lm_msgs_received.value.length; u++) {
          // Now we loop through all of the messages in the message group to find a match in case the first doesn't
          // Have the field we need
          // There is a possibility that (for reasons I cannot fathom) aircraft will broadcast the same flight information
          // With one field being different. We'll reject that message as being not in the same message group if that's the case
          // We'll also test for squitter messages which don't have tail/icao/flight
          for (let z = 0; z < this.lm_msgs_received.value[u].length; z++) {
            if (
              this.lm_msgs_received.value[u][z].hasOwnProperty("tail") &&
              new_tail == this.lm_msgs_received.value[u][z].tail &&
              ((this.lm_msgs_received.value[u][z].hasOwnProperty("icao") &&
                this.lm_msgs_received.value[u][z]["icao"] == new_icao) ||
                !this.lm_msgs_received.value[u][z].hasOwnProperty("icao")) &&
              ((this.lm_msgs_received.value[u][z].hasOwnProperty("flight") &&
                this.lm_msgs_received.value[u][z]["flight"] == new_flight) ||
                !this.lm_msgs_received.value[u][z].hasOwnProperty("flight"))
            ) {
              found = true;
              index_new = u;
              z = this.lm_msgs_received.value[u].length;
            } else if (
              this.lm_msgs_received.value[u][z].hasOwnProperty("icao") &&
              new_icao == this.lm_msgs_received.value[u][z].icao &&
              ((this.lm_msgs_received.value[u][z].hasOwnProperty("tail") &&
                this.lm_msgs_received.value[u][z]["tail"] == new_tail) ||
                !this.lm_msgs_received.value[u][z].hasOwnProperty("tail")) &&
              ((this.lm_msgs_received.value[u][z].hasOwnProperty("flight") &&
                this.lm_msgs_received.value[u][z]["flight"] == new_flight) ||
                !this.lm_msgs_received.value[u][z].hasOwnProperty("flight"))
            ) {
              found = true;
              index_new = u;
              z = this.lm_msgs_received.value[u].length;
            } else if (
              this.lm_msgs_received.value[u][z].hasOwnProperty("flight") &&
              new_flight == this.lm_msgs_received.value[u][z].flight &&
              ((this.lm_msgs_received.value[u][z].hasOwnProperty("icao") &&
                this.lm_msgs_received.value[u][z]["icao"] == new_icao) ||
                !this.lm_msgs_received.value[u][z].hasOwnProperty("icao")) &&
              ((this.lm_msgs_received.value[u][z].hasOwnProperty("tail") &&
                this.lm_msgs_received.value[u][z]["tail"] == new_tail) ||
                !this.lm_msgs_received.value[u][z].hasOwnProperty("tail"))
            ) {
              found = true;
              index_new = u;
              z = this.lm_msgs_received.value[u].length;
            } else if (
              msg.msghtml.hasOwnProperty("label") &&
              this.lm_msgs_received.value[u][z].hasOwnProperty("label") &&
              msg.msghtml.hasOwnProperty("text") &&
              this.lm_msgs_received.value[u][z].hasOwnProperty("text") &&
              msg.msghtml.label == "SQ" &&
              this.lm_msgs_received.value[u][z]["label"] == "SQ" &&
              msg.msghtml.text == this.lm_msgs_received.value[u][z]["text"]
            ) {
              found = true;
              index_new = u;
              z = this.lm_msgs_received.value[u].length;
            }
          }

          // if we found a message group that matches the new message
          // run through the messages in that group to see if it is a dup.
          // if it is, we'll reject the new message and append a counter to the old/saved message
          if (found) {
            u = this.lm_msgs_received.value.length;

            for (
              let j = 0;
              j < this.lm_msgs_received.value[index_new].length;
              j++
            ) {
              // First check is to see if the message is the same by checking all fields and seeing if they match
              // Second check is to see if the text field itself is a match
              // Last check is to see if we've received a multi-part message
              // If we do find a match we'll update the timestamp of the parent message
              // And add/update a duplicate counter to the parent message
              if (
                (this.lm_msgs_received.value[index_new][j]["text"] ==
                  msg.msghtml.text ||
                  (!this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                    "text"
                  ) &&
                    !msg.msghtml.hasOwnProperty("text"))) &&
                (this.lm_msgs_received.value[index_new][j]["data"] ==
                  msg.msghtml.data ||
                  (!this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                    "data"
                  ) &&
                    !msg.msghtml.hasOwnProperty("data"))) &&
                (this.lm_msgs_received.value[index_new][j]["libacars"] ==
                  msg.msghtml.libacars ||
                  (!this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                    "libacars"
                  ) &&
                    !msg.msghtml.hasOwnProperty("libacars"))) &&
                (this.lm_msgs_received.value[index_new][j]["dsta"] ==
                  msg.msghtml.dsta ||
                  (!this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                    "dsta"
                  ) &&
                    !msg.msghtml.hasOwnProperty("dsta"))) &&
                (this.lm_msgs_received.value[index_new][j]["depa"] ==
                  msg.msghtml.depa ||
                  (!this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                    "depa"
                  ) &&
                    !msg.msghtml.hasOwnProperty("depa"))) &&
                (this.lm_msgs_received.value[index_new][j]["eta"] ==
                  msg.msghtml.eta ||
                  (!this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                    "eta"
                  ) &&
                    !msg.msghtml.hasOwnProperty("eta"))) &&
                (this.lm_msgs_received.value[index_new][j]["gtout"] ==
                  msg.msghtml.gtout ||
                  (!this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                    "gtout"
                  ) &&
                    !msg.msghtml.hasOwnProperty("gtout"))) &&
                (this.lm_msgs_received.value[index_new][j]["gtin"] ==
                  msg.msghtml.gtin ||
                  (!this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                    "gtin"
                  ) &&
                    !msg.msghtml.hasOwnProperty("gtin"))) &&
                (this.lm_msgs_received.value[index_new][j]["wloff"] ==
                  msg.msghtml.wloff ||
                  (!this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                    "wloff"
                  ) &&
                    !msg.msghtml.hasOwnProperty("wloff"))) &&
                (this.lm_msgs_received.value[index_new][j]["wlin"] ==
                  msg.msghtml.wlin ||
                  (!this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                    "wlin"
                  ) &&
                    !msg.msghtml.hasOwnProperty("wlin"))) &&
                (this.lm_msgs_received.value[index_new][j]["lat"] ==
                  msg.msghtml.lat ||
                  (!this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                    "lat"
                  ) &&
                    !msg.msghtml.hasOwnProperty("lat"))) &&
                (this.lm_msgs_received.value[index_new][j]["lon"] ==
                  msg.msghtml.lon ||
                  (!this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                    "lon"
                  ) &&
                    !msg.msghtml.hasOwnProperty("lon"))) &&
                (this.lm_msgs_received.value[index_new][j]["alt"] ==
                  msg.msghtml.alt ||
                  (!this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                    "alt"
                  ) &&
                    !msg.msghtml.hasOwnProperty("alt")))
              ) {
                this.lm_msgs_received.value[index_new][j]["timestamp"] =
                  msg.msghtml.timestamp;
                if (
                  this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                    "duplicates"
                  )
                ) {
                  this.lm_msgs_received.value[index_new][j][
                    "duplicates"
                  ] = String(
                    Number(
                      this.lm_msgs_received.value[index_new][j]["duplicates"]
                    ) + 1
                  );
                } else {
                  this.lm_msgs_received.value[index_new][j]["duplicates"] = "1";
                }
                rejected = true;
              } else if (
                this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                  "text"
                ) &&
                msg.msghtml.hasOwnProperty("text") &&
                this.lm_msgs_received.value[index_new][j]["text"] ==
                  msg.msghtml["text"]
              ) {
                // it's the same message
                this.lm_msgs_received.value[index_new][j]["timestamp"] =
                  msg.msghtml.timestamp;
                if (
                  this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                    "duplicates"
                  )
                ) {
                  this.lm_msgs_received.value[index_new][j][
                    "duplicates"
                  ] = String(
                    Number(
                      this.lm_msgs_received.value[index_new][j]["duplicates"]
                    ) + 1
                  );
                } else {
                  this.lm_msgs_received.value[index_new][j]["duplicates"] = "1";
                }
                rejected = true;
              } else if (
                msg.msghtml.station_id ==
                  this.lm_msgs_received.value[index_new][j].station_id && // Is the message from the same station id? Keep ACARS/VDLM separate
                msg.msghtml.hasOwnProperty("msgno") &&
                this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                  "msgno"
                ) &&
                msg.msghtml.timestamp -
                  this.lm_msgs_received.value[index_new][j].timestamp <
                  8.0 && // We'll assume the message is not a multi-part message if the time from the new message is too great from the rest of the group
                typeof msg.msghtml.msgno !== "undefined" &&
                ((msg.msghtml.msgno.charAt(0) ==
                  this.lm_msgs_received.value[index_new][j].msgno!.charAt(0) && // Next two lines match on AzzA pattern
                  msg.msghtml.msgno.charAt(3) ==
                    this.lm_msgs_received.value[index_new][j].msgno!.charAt(
                      3
                    )) ||
                  msg.msghtml.msgno.substring(0, 3) ==
                    this.lm_msgs_received.value[index_new][j].msgno!.substring(
                      0,
                      3
                    ))
              ) {
                // This check matches if the group is a AAAz counter
                // We have a multi part message. Now we need to see if it is a dup
                rejected = true;
                let add_multi = true;

                if (
                  this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                    "msgno_parts"
                  )
                ) {
                  // Now we'll see if the multi-part message is a dup
                  let split = this.lm_msgs_received.value[index_new][j]
                    .msgno_parts!.toString()
                    .split(" "); // format of stored parts is "MSGID MSGID2" etc

                  for (let a = 0; a < split.length; a++) {
                    // Loop through the msg IDs present
                    if (split[a].substring(0, 4) == msg.msghtml["msgno"]) {
                      // Found a match in the message IDs already present
                      add_multi = false; // Ensure later checks know we've found a duplicate and to not add the message

                      if (a == 0 && split[a].length == 4) {
                        // Match, first element of the array with no previous matches so we don't want a leading space
                        this.lm_msgs_received.value[index_new][j].msgno_parts =
                          split[a] + "x2";
                      } else if (split[a].length == 4) {
                        // Match, not first element, and doesn't have previous matches
                        this.lm_msgs_received.value[index_new][j].msgno_parts +=
                          " " + split[a] + "x2";
                      } else if (a == 0) {
                        // Match, first element of the array so no leading space, has previous other matches so we increment the counter
                        let count = parseInt(split[a].substring(5)) + 1;
                        this.lm_msgs_received.value[index_new][j].msgno_parts =
                          split[a].substring(0, 4) + "x" + count;
                      } else {
                        // Match, has previous other matches so we increment the counter
                        let count = parseInt(split[a].substring(5)) + 1;
                        this.lm_msgs_received.value[index_new][j].msgno_parts +=
                          " " + split[a].substring(0, 4) + "x" + count;
                      }
                    } else {
                      // No match, re-add the MSG ID to the parent message
                      if (a == 0) {
                        this.lm_msgs_received.value[index_new][j].msgno_parts =
                          split[a];
                      } else {
                        this.lm_msgs_received.value[index_new][j].msgno_parts +=
                          " " + split[a];
                      }
                    }
                  }
                }

                this.lm_msgs_received.value[index_new][j]["timestamp"] =
                  msg.msghtml.timestamp;

                if (add_multi) {
                  // Multi-part message has been found
                  if (
                    this.lm_msgs_received.value[index_new][j]["text"] &&
                    msg.msghtml.hasOwnProperty("text")
                  )
                    // If the multi-part parent has a text field and the found match has a text field, append
                    this.lm_msgs_received.value[index_new][j][
                      "text"
                    ]! += msg.msghtml.text;
                  else if (msg.msghtml.hasOwnProperty("text"))
                    // If the new message has a text field but the parent does not, add the new text to the parent
                    this.lm_msgs_received.value[index_new][j]["text"] =
                      msg.msghtml.text;

                  if (
                    this.lm_msgs_received.value[index_new][j].hasOwnProperty(
                      "msgno_parts"
                    )
                  ) {
                    // If the new message is multi, with no dupes found we need to append the msg ID to the found IDs
                    this.lm_msgs_received.value[index_new][j]["msgno_parts"] +=
                      " " + msg.msghtml.msgno;
                  } else {
                    this.lm_msgs_received.value[index_new][j]["msgno_parts"] =
                      this.lm_msgs_received.value[index_new][j]["msgno"] +
                      " " +
                      msg.msghtml.msgno;
                  }

                  // Re-run the text decoder against the text field we've updated
                  let decoded_msg = this.lm_md.decode(
                    this.lm_msgs_received.value[index_new][j]
                  );
                  if (decoded_msg.decoded == true) {
                    this.lm_msgs_received.value[index_new][j][
                      "decoded_msg"
                    ] = decoded_msg;
                  }

                  if (matched.was_found && !msg.loading) sound_alert();
                }
              }

              if (rejected) {
                // Promote the message back to the front
                this.lm_msgs_received.value[index_new].forEach(
                  (item: any, i: number) => {
                    if (i == j) {
                      this.lm_msgs_received.value[index_new].splice(i, 1);
                      this.lm_msgs_received.value[index_new].unshift(item);
                    }
                  }
                );
                j = this.lm_msgs_received.value[index_new].length;
              }
            }
          }

          // If the message was found we'll move the message group back to the top
          if (found) {
            // If the message was found, and not rejected, we'll append it to the message group
            if (!rejected) {
              this.lm_msgs_received.value[index_new].unshift(msg.msghtml);
            }

            this.lm_msgs_received.value.forEach((item, i) => {
              if (i == index_new) {
                this.lm_msgs_received.value.splice(i, 1);
                this.lm_msgs_received.value.unshift(item);
              }
            });
          }
        }
        if (!found && !rejected) {
          if (matched.was_found && !msg.loading) sound_alert();
          this.lm_msgs_received.unshift([msg.msghtml]);
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
        display_messages(this.lm_msgs_received.value, this.selected_tabs, true)
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
    for (const msgList of this.lm_msgs_received.value) {
      for (const msg of msgList) {
        // check to see if any of the inputs match the message. msg.tail needs to be checked
        // against both callsign and tail because sometimes the tail is the flight/callsign
        if (
          msg.icao_hex === hex.toUpperCase() ||
          msg.flight === callsign ||
          msg.tail === callsign ||
          (tail != undefined && msg.tail === tail)
        ) {
          return msgList;
        }
      }
    }
    return [];
  },

  find_matches: function () {
    let output_hex: { [hex: string]: number } = {};
    let output_icao_callsigns: { [callsign: string]: number } = {};
    let output_tail: { [tail: string]: number } = {};
    for (const msgList of this.lm_msgs_received.value) {
      let matched_hex,
        matched_tail,
        matched_flight = false;
      for (const msg of msgList) {
        if (!matched_hex && msg.icao_hex != null)
          output_hex[msg.icao_hex.toUpperCase()] = msgList.length;
        if (!matched_flight && msg.icao_flight != null)
          output_icao_callsigns[msg.icao_flight] = msgList.length;
        if (!matched_tail && msg.tail != null)
          output_tail[msg.tail] = msgList.length;

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
