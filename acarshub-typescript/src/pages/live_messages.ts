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

//import { MessageDecoder } from "@airframes/acars-decoder/dist/MessageDecoder";

import {
  generate_messages_html_from_planes,
  generate_message_group_html_from_plane,
} from "../helpers/html_generator";
import {
  html_msg,
  acars_msg,
  labels,
  plane,
  plane_data,
  alert_matched,
  plane_match,
} from "../interfaces";
import jBox from "jbox";
//i mport "jbox/dist/jBox.all.css";
import { tooltip } from "../helpers/tooltips";
import {
  get_all_planes,
  set_live_messages_paused,
  // match_alert,
  // sound_alert,
  // is_adsb_enabled,
  // get_current_planes,
} from "../acarshub";

import { Page } from "./pages";

export class LiveMessagesPage extends Page {
  current_message_string: string = "";
  page_updates_paused = false;

  constructor() {
    super("Live Messages");

    //@ts-expect-error
    $.fn.renderedText = function () {
      var s = this.text();
      //@ts-expect-error
      if (s.length && this[0].scrollWidth > this.innerWidth()) {
        return true;
      }

      return false;
    };
  }

  set_page_active(): void {
    this.update_title_bar();

    if (!this.current_message_string) {
      $(this.content_area).html("Welcome to ACARS Hub. Waiting for data...");
    } else {
      $(this.content_area).html(this.current_message_string);
    }

    $(document).on("keyup", (event: any) => {
      // key code for escape is 27
      if (event.keyCode == 80) {
        this.page_updates_paused = !this.page_updates_paused;

        set_live_messages_paused(this.page_updates_paused);
      }

      if (!this.page_updates_paused) this.update_page(get_all_planes(), false);
    });
  }

  set_page_inactive(): void {
    $(document).off("keyup");
  }

  update_page_in_place(planes: plane[] | undefined = undefined) {
    if (!planes) {
      return;
    }

    const new_html = generate_message_group_html_from_plane(planes[0], false);
    $(`#${planes[0].uid}_container`).html(new_html);
    this.current_message_string = $(this.content_area).html();
  }

  update_page(planes: plane[] | undefined = undefined, dont_reset_page = true) {
    if (!planes) {
      $(this.content_area).html("No data received yet.");
      return;
    }

    if (this.page_updates_paused) return;

    // FIXME
    //const num_planes = Number(get_setting("live_messages_page_num_items"));
    const num_planes = 20;
    if (this.current_message_string && dont_reset_page) {
      $(`#${planes[0].uid}_container`).remove();

      // Display the new message at the front of the DOM tree
      $(this.content_area).prepend(
        generate_message_group_html_from_plane(planes[0])
      );
      // After updating the tree we may exceed the length. If so, remove the last element

      while (
        $(`${this.content_area} div.acars_message_container`).length >
        num_planes
      ) {
        $(".acars_message_container:last").remove();
      }
      // Save the DOM tree HTML because this is a hacky hack to get the page refreshed on page in
      this.current_message_string = $(this.content_area).html();
    } else {
      // This is a new load or we need to refresh the entire DOM tree
      this.current_message_string = generate_messages_html_from_planes(planes);
      $(this.content_area).html(this.current_message_string);
    }

    // $(".cropText").each((_, element) => {
    //   //comment for test
    //   //@ts-expect-error
    //   console.log($(element).renderedText());
    //   //@ts-expect-error
    //   if ($(element).renderedText()) {
    //     console.log("cropped");
    //   } else {
    //     console.log("not cropped.");
    //   }
    // });
  }
}

export let live_messages_page = {
  pause: false as boolean,
  text_filter: false as boolean,
  current_message_string: "" as string,
  exclude: [] as string[],
  selected_tabs: "" as string,
  filter_labels: (<unknown>null) as labels,
  lm_page_active: false as boolean,
  //lm_md: new MessageDecoder(),
  // this is a temp workaround to get things building while acars decoder is broken
  lm_md: {
    decode: (message: acars_msg) => {
      return { decoded: false, decoded_msg: "" } as any;
    },
  },
  lm_acars_path: "" as string,
  lm_acars_url: "" as string,
  msg_tags: [
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
  ] as Array<keyof acars_msg>,
  filtered_messages: 0 as number,
  received_messages: 0 as number,
  live_message_modal: new jBox("Modal", {
    id: "set_modal",
    width: 350,
    height: 200,
    blockScroll: false,
    isolateScroll: true,
    animation: "zoomIn",
    closeButton: "box",
    overlay: true,
    reposition: false,
    repositionOnOpen: true,
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

  setting_modal_on: function (): void {
    this.show_labels();
    this.pause_updates(false);
    this.filter_notext(false);
  },

  // Function to increment the counter of filtered messages

  increment_filtered: function (page_refresh = false): void {
    if (!page_refresh) this.filtered_messages++;
    $("#filteredmessages").html(String(this.filtered_messages));
  },

  // Function to increment the counter of received messages

  increment_received: function (page_refresh = false): void {
    if (!page_refresh) this.received_messages++;
    $("#receivedmessages").html(String(this.received_messages));
  },

  show_labels: function (): void {
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

  getRandomInt: function (max: number): number {
    return Math.floor(Math.random() * Math.floor(max));
  },

  // Function to handle click events on the message tab
  // Input is the element ID (aka message label ID) that has been selected
  // Input is the UID of the message group, which is also the element ID of the oldest element in that group

  handle_radio: function (element_id: string, uid: string): void {
    // $(`div.sub_msg${uid}`).removeClass("checked"); // Turn off the display of all messages in the UID group
    // $(`input.tabs_${uid}`).prop("checked", false); // Turn off the checked indicator for all messages in the UID group
    // $(`#message_${uid}_${element_id}`).addClass("checked"); // Turn on the display of the message that is now active
    // $(`#tab${element_id}_${uid}`).prop("checked", true); // Turn on the checked indicator for the message that is now active
    // // Now we need to update the nav arrow links
    // let next_tab: string = "0";
    // let previous_tab: string = "0";
    // Find the next / previous tabs
    // This is UGLY
    // FIXME....deuglify it
    // for (let i = 0; i < this.lm_msgs_received.planes.length; i++) {
    //   if (
    //     this.lm_msgs_received.planes[i].messages.length > 1 &&
    //     this.lm_msgs_received.planes[i].messages[
    //       this.lm_msgs_received.planes[i].messages.length - 1
    //     ].uid == uid
    //   ) {
    //     let active_tab = String(
    //       this.lm_msgs_received.planes[i].messages.findIndex(
    //         (sub_msg: acars_msg) => {
    //           if (sub_msg.uid === element_id) {
    //             return true;
    //           }
    //         }
    //       )
    //     );
    //     active_tab = active_tab === "-1" ? "0" : active_tab;
    //     if (active_tab === "0") {
    //       next_tab = this.lm_msgs_received.planes[i].messages[1].uid;
    //       previous_tab =
    //         this.lm_msgs_received.planes[i].messages[
    //           this.lm_msgs_received.planes[i].messages.length - 1
    //         ].uid;
    //     } else if (
    //       active_tab ===
    //       String(this.lm_msgs_received.planes[i].messages.length - 1)
    //     ) {
    //       next_tab = this.lm_msgs_received.planes[i].messages[0].uid;
    //       previous_tab =
    //         this.lm_msgs_received.planes[i].messages[
    //           this.lm_msgs_received.planes[i].messages.length - 2
    //         ].uid;
    //     } else {
    //       next_tab =
    //         this.lm_msgs_received.planes[i].messages[Number(active_tab) + 1]
    //           .uid;
    //       previous_tab =
    //         this.lm_msgs_received.planes[i].messages[Number(active_tab) - 1]
    //           .uid;
    //     }
    //     i = this.lm_msgs_received.planes.length;
    //   }
    //}
    // Update the buttons for the previous / next message
    // $(`#tab${uid}_previous`).attr(
    //   "href",
    //   `javascript:handle_radio("${previous_tab}", "${uid}")`
    // );
    // $(`#tab${uid}_next`).attr(
    //   "href",
    //   `javascript:handle_radio("${next_tab}", "${uid}")`
    // );
    // let added = false;
    // if (this.selected_tabs != "") {
    //   let split = this.selected_tabs.split(",");
    //   for (let i = 0; i < split.length; i++) {
    //     let sub_split = split[i].split(";");
    //     if (sub_split[0] == uid && i == 0) {
    //       this.selected_tabs = uid + ";" + element_id;
    //       added = true;
    //     } else if (sub_split[0] == uid) {
    //       this.selected_tabs += "," + uid + ";" + element_id;
    //       added = true;
    //     } else if (i == 0)
    //       this.selected_tabs = sub_split[0] + ";" + sub_split[1];
    //     else this.selected_tabs += "," + sub_split[0] + ";" + sub_split[1];
    //   }
    // }
    // if (this.selected_tabs.length == 0) {
    //   this.selected_tabs = uid + ";" + element_id;
    // } else if (!added) {
    //   this.selected_tabs += "," + uid + ";" + element_id;
    // }
  },

  // Function to toggle pausing visual update of the page

  pause_updates: function (toggle_pause: boolean = true): void {
    // if (!toggle_pause) this.pause = !this.pause;
    // if (this.pause) {
    //   this.pause = false;
    //   $("#pause_updates").html("Pause Updates");
    //   $("#received").html("Received messages: ");
    //   $("#log").html(
    //     display_messages(
    //       this.lm_msgs_received.get_all_messages(),
    //       this.selected_tabs,
    //       true
    //     )
    //   );
    //   resize_tabs();
    // } else {
    //   this.pause = true;
    //   $("#pause_updates").html('<span class="red">Unpause Updates</span>');
    //   $("#received").html(
    //     'Received messages <span class="red">(paused)</span>: '
    //   );
    // }
  },

  // function to toggle the filtering of empty/no text messages

  filter_notext: function (toggle_filter: boolean = true): void {
    // if (!toggle_filter) this.text_filter = !this.text_filter;
    // if (this.text_filter) {
    //   this.text_filter = false;
    //   $("#filter_notext").html("Hide Empty Messages");
    //   Cookies.set("filter", "false", {
    //     expires: 365,
    //     sameSite: "Strict",
    //   });
    //   // Only reset the counter if no filters are active
    //   if (this.exclude.length == 0) {
    //     this.filtered_messages = 0;
    //     $("#filtered").html("");
    //   }
    // } else {
    //   this.text_filter = true;
    //   $("#filtered").html(
    //     '<div><span class="menu_non_link">Filtered Messages:&nbsp;</span><span class="green" id="filteredmessages"></span></div>'
    //   );
    //   $("#filteredmessages").html(String(this.filtered_messages));
    //   $("#filter_notext").html('<span class="red">Show All Messages</span>');
    //   Cookies.set("filter", "true", {
    //     expires: 365,
    //     sameSite: "Strict",
    //   });
    // }
  },

  // Function to toggle/save the selected filtered message labels
  // Input is the message label ID that should be filtered

  toggle_label: function (key: string): void {
    // if (this.exclude.indexOf(key.toString()) == -1) {
    //   this.exclude.push(key.toString());
    //   $(`#${key.toString()}`).removeClass("sidebar_link").addClass("red");
    //   let exclude_string = "";
    //   for (let i = 0; i < this.exclude.length; i++) {
    //     exclude_string += this.exclude[i] + " ";
    //   }
    //   Cookies.set("exclude", exclude_string.trim(), {
    //     expires: 365,
    //     sameSite: "Strict",
    //   });
    // } else {
    //   let exclude_string = "";
    //   $(`#${key.toString()}`).removeClass("red").addClass("sidebar_link");
    //   for (let i = 0; i < this.exclude.length; i++) {
    //     if (this.exclude[i] != key.toString() && key !== " " && key !== "")
    //       exclude_string += this.exclude[i] + " ";
    //   }
    //   if (
    //     exclude_string.trim().split(" ").length == 1 &&
    //     exclude_string.trim().split(" ")[0] == ""
    //   )
    //     this.exclude = [];
    //   else this.exclude = exclude_string.trim().split(" ");
    //   Cookies.set("exclude", exclude_string.trim(), {
    //     expires: 365,
    //     sameSite: "Strict",
    //   });
    // }
    // if (this.exclude.length > 0 || this.text_filter) {
    //   $("#filtered").html(
    //     '<div><span class="menu_non_link">Filtered Messages:&nbsp;</span><span class="green" id="filteredmessages"></span></div>'
    //   );
    //   $("#filteredmessages").html(String(this.filtered_messages));
    // } else {
    //   this.filtered_messages = 0;
    //   $("#filtered").html("");
    // }
  },

  // Code that is ran when the page has loaded

  live_messages: function (): void {
    // Grab the current cookie value for message filtering
    // If the cookie is found with a value we run filter_notext to set the proper visual elements/variables for the rest of the functions
    // We'll also re-write the cookie (or start a new one) with the current value
    // This is necessary because Safari doesn't respect the expiration date of more than 7 days. It will set it to 7 days even though we've set 365 days
    // This also just keeps moving the expiration date moving forward every time the page is loaded
    // let filter = Cookies.get("filter");
    // if (filter == "true") {
    //   Cookies.set("filter", "true", {
    //     expires: 365,
    //     sameSite: "Strict",
    //   });
    //   this.filter_notext();
    // } else {
    //   this.text_filter = true; // temporarily flip the value so we can run the filter_notext() function and set the proper CSS
    //   Cookies.set("filter", "false", {
    //     expires: 365,
    //     sameSite: "Strict",
    //   });
    //   this.filter_notext();
    // }
    // // Grab the current cookie value for the message labels being filtered
    // // Same restrictions as the 'filter'
    // let exclude_cookie = Cookies.get("exclude");
    // if (exclude_cookie == null) {
    //   Cookies.set("exclude", "", {
    //     expires: 365,
    //     sameSite: "Strict",
    //   });
    // } else {
    //   Cookies.set("exclude", exclude_cookie, {
    //     expires: 365,
    //     sameSite: "Strict",
    //   });
    //   if (this.exclude.length > 0) this.exclude = exclude_cookie.split(" ");
    //   else this.exclude = [];
    // }
  },

  // if the live message page is active we'll toggle the display of everything here

  live_message_active: function (state = false): void {
    // this.lm_page_active = state;
    // $(document).off("keyup");
    // if (this.lm_page_active) {
    //   // page is active
    //   this.set_html();
    //   this.increment_received(true); // show the received msgs
    //   this.increment_filtered(true); // show the filtered msgs
    //   this.show_labels();
    //   $("#log").html(
    //     !this.pause
    //       ? display_messages(
    //           this.lm_msgs_received.get_all_messages(),
    //           this.selected_tabs,
    //           true
    //         )
    //       : this.current_message_string
    //   ); // show the messages we've received
    //   resize_tabs();
    //   $(document).on("keyup", (event: any) => {
    //     if (this.lm_page_active) {
    //       // key code for escape is 27
    //       if (event.keyCode == 80) {
    //         this.pause_updates();
    //       }
    //     }
    //   });
    // }
  },

  show_live_message_modal: function (): void {
    this.live_message_modal.open();
    this.setting_modal_on();
  },

  set_live_page_urls: function (documentPath: string, documentUrl: string) {
    this.lm_acars_path = documentPath;
    this.lm_acars_url = documentUrl;
  },

  set_html: function (): void {
    $("#modal_text").html(
      '<a href="javascript:show_page_modal()">Page Settings</a>'
    );
    $("#page_name").html("Messages will appear here, newest first:");
  },

  new_labels: function (msg: labels): void {
    this.filter_labels = msg;
    this.show_labels();
  },
};
