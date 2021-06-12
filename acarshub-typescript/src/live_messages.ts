import { MessageDecoder } from "@airframes/acars-decoder/dist/MessageDecoder";
import Cookies from "js-cookie";
import { display_messages } from "./html_generator.js";
import { html_msg, acars_msg, labels } from "./interfaces.js";
import jBox from "jbox";
import "jbox/dist/jBox.all.css";
import { tooltip } from "./tooltips.js";
import { resize_tabs, match_alert, sound_alert } from "./index.js";

let pause: boolean = false;
let text_filter: boolean = false;
let lm_msgs_received: acars_msg[][] = [];
let exclude: string[] = [];
let selected_tabs: string = "";
let filter_labels: labels;
let lm_page_active: boolean = false;

let lm_acars_path = "";
let lm_acars_url = "";

let filtered_messages: number = 0;
let received_messages: number = 0;
let live_message_modal = new jBox("Modal", {
  id: "set_modal",
  width: 350,
  height: 200,
  blockScroll: false,
  isolateScroll: true,
  animation: "zoomIn",
  // draggable: 'title',
  closeButton: "title",
  overlay: true,
  reposition: false,
  repositionOnOpen: true,
  onOpen: function () {
    setting_modal_on();
  },
  //attach: '#settings_modal',
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
});

function setting_modal_on() {
  show_labels();
  window.pause_updates(false);
  window.filter_notext(false);
}

declare const window: any;

const lm_md = new MessageDecoder();

// Automatically keep the array size at 150 messages or less
// without the need to check before we push on to the stack

lm_msgs_received.unshift = function () {
  if (this.length >= 50) {
    this.pop();
  }
  return Array.prototype.unshift.apply(this, arguments as any);
};

// Function to increment the counter of filtered messages

function increment_filtered(page_refresh = false) {
  let id = document.getElementById("filteredmessages");
  if (!page_refresh) filtered_messages++;
  if (id !== null) {
    id.innerHTML = "";
    let txt = document.createTextNode(String(filtered_messages));
    id.appendChild(txt);
  }
}

// Function to increment the counter of received messages

function increment_received(page_refresh = false) {
  let id = document.getElementById("receivedmessages");
  if (!page_refresh) received_messages++;
  if (id !== null) {
    id.innerHTML = "";
    let txt = document.createTextNode(String(received_messages));
    id.appendChild(txt);
  }
}

function show_labels() {
  let label_html = "";
  if (typeof filter_labels !== "undefined" && lm_page_active) {
    for (let key in filter_labels.labels) {
      let link_class: string =
        exclude.indexOf(key.toString()) !== -1 ? "red" : "sidebar_link";
      label_html += `<a href="javascript:toggle_label('${key.toString()}');" id="${key}" class="${link_class}">${key} ${
        filter_labels.labels[key].name
      }</a><br>`;
    }
    $("#label_links").html(label_html);
  }
}

// Function to return a random integer
// Input: integter that represents the maximum number that can be returned

function getRandomInt(max: number) {
  return Math.floor(Math.random() * Math.floor(max));
}

// Function to handle click events on the message tab
// Input is the element ID (aka message label ID) that has been selected
// Input is the UID of the message group, which is also the element ID of the oldest element in that group

window.handle_radio = function (element_id: string, uid: string) {
  let all_tabs = document.querySelectorAll(`div.sub_msg${uid}`); // Grab the tabinator group and remove check
  for (let i = 0; i < all_tabs.length; i++) {
    all_tabs[i].classList.remove("checked");
  }

  let all_tabinator: NodeListOf<HTMLInputElement> = document.querySelectorAll(
    `input.tabs_${uid}`
  ); // grab the message divs in that tab group and remove check
  for (let i = 0; i < all_tabinator.length; i++) {
    all_tabinator[i].checked = false;
  }

  let element = <HTMLInputElement>(
    document.getElementById(`message_${uid}_${element_id}`)
  ); // grab and tag the message that is checked
  element.classList.add("checked");

  let tab_element = <HTMLInputElement>(
    document.getElementById(`tab${element_id}_${uid}`)
  ); // grab and tag the tag that is checked
  tab_element.checked = true;

  // Now we need to update the nav arrow links

  let next_tab: string = "0";
  let previous_tab: string = "0";

  for (let i = 0; i < lm_msgs_received.length; i++) {
    if (
      lm_msgs_received[i].length > 1 &&
      lm_msgs_received[i][lm_msgs_received[i].length - 1].uid == uid
    ) {
      let active_tab = String(
        lm_msgs_received[i].findIndex((sub_msg: acars_msg) => {
          console.log(
            sub_msg.uid,
            typeof sub_msg.uid,
            element_id,
            typeof element_id
          );
          if (sub_msg.uid === element_id) {
            return true;
          }
        })
      );

      console.log(active_tab);
      active_tab = active_tab === "-1" ? "0" : active_tab;

      if (active_tab === "0") {
        next_tab = lm_msgs_received[i][1].uid;
        previous_tab = lm_msgs_received[i][lm_msgs_received[i].length - 1].uid;
      } else if (active_tab === String(lm_msgs_received[i].length - 1)) {
        next_tab = lm_msgs_received[i][0].uid;
        previous_tab = lm_msgs_received[i][lm_msgs_received[i].length - 2].uid;
      } else {
        next_tab = lm_msgs_received[i][Number(active_tab) + 1].uid;
        previous_tab = lm_msgs_received[i][Number(active_tab) - 1].uid;
      }

      i = lm_msgs_received.length;
    }
  }

  let curlink_previous = <HTMLInputElement>(
    document.getElementById(`tab${uid}_previous`)
  );
  curlink_previous.setAttribute(
    "href",
    `javascript:handle_radio("${previous_tab}", "${uid}")`
  );

  let curlink_next = <HTMLInputElement>(
    document.getElementById(`tab${uid}_next`)
  );
  curlink_next.setAttribute(
    "href",
    `javascript:handle_radio("${next_tab}", "${uid}")`
  );

  let added = false;
  if (selected_tabs != "") {
    let split = selected_tabs.split(",");
    for (let i = 0; i < split.length; i++) {
      let sub_split = split[i].split(";");

      if (sub_split[0] == uid && i == 0) {
        selected_tabs = uid + ";" + element_id;
        added = true;
      } else if (sub_split[0] == uid) {
        selected_tabs += "," + uid + ";" + element_id;
        added = true;
      } else if (i == 0) selected_tabs = sub_split[0] + ";" + sub_split[1];
      else selected_tabs += "," + sub_split[0] + ";" + sub_split[1];
    }
  }

  if (selected_tabs.length == 0) {
    selected_tabs = uid + ";" + element_id;
  } else if (!added) {
    selected_tabs += "," + uid + ";" + element_id;
  }
};

// Function to toggle pausing visual update of the page

window.pause_updates = function (toggle_pause: boolean = true) {
  if (!toggle_pause) pause = !pause;

  if (pause) {
    pause = false;
    let id = document.getElementById("pause_updates");
    if (id !== null) {
      id.innerHTML = "";
      let txt = document.createTextNode("Pause updates");
      id.appendChild(txt);
    }

    let id_filtered = document.getElementById("received");
    if (id_filtered !== null) {
      id_filtered.innerHTML = "";
      let txt_filtered = document.createTextNode("Received messages: ");
      id_filtered.appendChild(txt_filtered);
    }

    $("#log").html(display_messages(lm_msgs_received, selected_tabs, true));
  } else {
    pause = true;

    let id = document.getElementById("pause_updates");
    if (id !== null) id.innerHTML = '<span class="red">Unpause Updates</span>';
    //let txt = document.createTextNode("Unpause Updates");
    //id.appendChild(txt);

    let id_filtered = document.getElementById("received");
    if (id_filtered !== null) {
      id_filtered.innerHTML = "";
      let txt_filtered = document.createTextNode(
        "Received messages (paused): "
      );
      id_filtered.appendChild(txt_filtered);
    }
  }
};

// function to toggle the filtering of empty/no text messages

window.filter_notext = function (toggle_filter: boolean = true) {
  if (!toggle_filter) text_filter = !text_filter;

  if (text_filter) {
    text_filter = false;
    // (<HTMLInputElement>(
    //   document.getElementById("fixed_menu")
    // )).classList.remove("fixed_menu");
    // (<HTMLInputElement>document.getElementById("fixed_menu")).classList.add(
    //   "fixed_menu_short"
    // );

    let id = document.getElementById("filter_notext");
    if (id !== null) id.innerHTML = "Hide Empty Messages";
    Cookies.set("filter", "false", { expires: 365 });
    filtered_messages = 0;

    $("#filtered").html("");
  } else {
    text_filter = true;
    // (<HTMLInputElement>(
    //   document.getElementById("fixed_menu")
    // )).classList.remove("fixed_menu_short");
    // (<HTMLInputElement>document.getElementById("fixed_menu")).classList.add(
    //   "fixed_menu"
    // );

    $("#filtered").html(
      '<div><span class="menu_non_link">Filtered Messages:&nbsp;</span><span class="green" id="filteredmessages"></span></div>'
    );
    let id_filtered = <HTMLInputElement>(
      document.getElementById("filteredmessages")
    );
    let txt_filtered = document.createTextNode(String(filtered_messages));
    id_filtered.appendChild(txt_filtered);

    let id = document.getElementById("filter_notext");
    if (id !== null)
      id.innerHTML = '<span class="red">Show All Messages</span>';
    Cookies.set("filter", "true", { expires: 365 });
  }
};

// Function to toggle/save the selected filtered message labels
// Input is the message label ID that should be filtered

window.toggle_label = function (key: string) {
  if (exclude.indexOf(key.toString()) == -1) {
    exclude.push(key.toString());
    (<HTMLInputElement>(
      document.getElementById(key.toString())
    )).classList.remove("sidebar_link");
    (<HTMLInputElement>document.getElementById(key.toString())).classList.add(
      "red"
    );
    let exclude_string = "";
    for (let i = 0; i < exclude.length; i++) {
      exclude_string += exclude[i] + " ";
    }

    Cookies.set("exclude", exclude_string.trim(), { expires: 365 });
  } else {
    let exclude_string = "";
    (<HTMLInputElement>(
      document.getElementById(key.toString())
    )).classList.remove("red");
    (<HTMLInputElement>document.getElementById(key.toString())).classList.add(
      "sidebar_link"
    );
    for (let i = 0; i < exclude.length; i++) {
      if (exclude[i] != key.toString()) exclude_string += exclude[i] + " ";
    }
    exclude = exclude_string.trim().split(" ");
    Cookies.set("exclude", exclude_string.trim(), { expires: 365 });
  }
};

// Code that is ran when the page has loaded

export function live_messages() {
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
    window.filter_notext();
  } else {
    text_filter = true; // temporarily flip the value so we can run the filter_notext() function and set the proper CSS
    Cookies.set("filter", "false", { expires: 365 });
    window.filter_notext();
  }

  // Grab the current cookie value for the message labels being filtered
  // Same restrictions as the 'filter'
  let exclude_cookie = Cookies.get("exclude");
  if (exclude_cookie == null) {
    Cookies.set("exclude", "", { expires: 365 });
  } else {
    Cookies.set("exclude", exclude_cookie, { expires: 365 });
    exclude = exclude_cookie.split(" ");
  }
}

// if the live message page is active we'll toggle the display of everything here

export function live_message_active(state = false) {
  lm_page_active = state;

  if (lm_page_active) {
    // page is active
    set_html();
    increment_received(true); // show the received msgs
    increment_filtered(true); // show the filtered msgs
    show_labels();
    $("#log").html(display_messages(lm_msgs_received, selected_tabs, true)); // show the messages we've received
  }
}

window.show_live_message_modal = function () {
  live_message_modal.open();
};

export function set_live_page_urls(documentPath: string, documentUrl: string) {
  lm_acars_path = documentPath;
  lm_acars_url = documentUrl;
}

function set_html() {
  //   $("#right").html(
  //     `<div class="fixed_results">
  //   <p><a href="javascript:pause_updates()" id="pause_updates" class="spread_text">Pause updates</a></p>
  //   <a href="javascript:filter_notext()" id="filter_notext" class="spread_text">Filter out "No Text" messages</a>
  // </div> <!-- Fixed results -->
  // <div class="fixed_menu" id="fixed_menu">
  //     <div class="wrap-collabsible">
  //       <input id="collapsible" class="toggle" type="checkbox">
  //       <label for="collapsible" class="lbl-toggle">Filter Message Labels</label>
  //       <div class="collapsible-content" id="collapsible-content">
  //         <div class="content-inner" id="label_links">
  //           <p>&nbsp;</p>
  //         </div>
  //       </div>
  //     </div>
  //   </div>")`
  //   );

  $("#modal_text").html(
    '<a href="javascript:show_live_message_modal()">Page Settings</a>'
  );
  $("#page_name").html("Messages will appear here, newest first:");
}

export function new_labels(msg: labels) {
  filter_labels = msg;
  show_labels();
}

export function new_acars_message(msg: html_msg) {
  if (
    msg.msghtml.hasOwnProperty("label") == false ||
    exclude.indexOf(msg.msghtml.label!) == -1
  ) {
    if (
      !text_filter ||
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
        let decoded_msg = lm_md.decode(msg.msghtml);
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

      msg.msghtml.uid = getRandomInt(1000000).toString(); // Each message gets a unique ID. Used to track tab selection

      // Loop through the received messages. If a message is found we'll break out of the for loop
      for (let u = 0; u < lm_msgs_received.length; u++) {
        // Now we loop through all of the messages in the message group to find a match in case the first doesn't
        // Have the field we need
        // There is a possibility that (for reasons I cannot fathom) aircraft will broadcast the same flight information
        // With one field being different. We'll reject that message as being not in the same message group if that's the case
        // We'll also test for squitter messages which don't have tail/icao/flight
        for (let z = 0; z < lm_msgs_received[u].length; z++) {
          if (
            lm_msgs_received[u][z].hasOwnProperty("tail") &&
            new_tail == lm_msgs_received[u][z].tail &&
            ((lm_msgs_received[u][z].hasOwnProperty("icao") &&
              lm_msgs_received[u][z]["icao"] == new_icao) ||
              !lm_msgs_received[u][z].hasOwnProperty("icao")) &&
            ((lm_msgs_received[u][z].hasOwnProperty("flight") &&
              lm_msgs_received[u][z]["flight"] == new_flight) ||
              !lm_msgs_received[u][z].hasOwnProperty("flight"))
          ) {
            found = true;
            index_new = u;
            z = lm_msgs_received[u].length;
          } else if (
            lm_msgs_received[u][z].hasOwnProperty("icao") &&
            new_icao == lm_msgs_received[u][z].icao &&
            ((lm_msgs_received[u][z].hasOwnProperty("tail") &&
              lm_msgs_received[u][z]["tail"] == new_tail) ||
              !lm_msgs_received[u][z].hasOwnProperty("tail")) &&
            ((lm_msgs_received[u][z].hasOwnProperty("flight") &&
              lm_msgs_received[u][z]["flight"] == new_flight) ||
              !lm_msgs_received[u][z].hasOwnProperty("flight"))
          ) {
            found = true;
            index_new = u;
            z = lm_msgs_received[u].length;
          } else if (
            lm_msgs_received[u][z].hasOwnProperty("flight") &&
            new_flight == lm_msgs_received[u][z].flight &&
            ((lm_msgs_received[u][z].hasOwnProperty("icao") &&
              lm_msgs_received[u][z]["icao"] == new_icao) ||
              !lm_msgs_received[u][z].hasOwnProperty("icao")) &&
            ((lm_msgs_received[u][z].hasOwnProperty("tail") &&
              lm_msgs_received[u][z]["tail"] == new_tail) ||
              !lm_msgs_received[u][z].hasOwnProperty("tail"))
          ) {
            found = true;
            index_new = u;
            z = lm_msgs_received[u].length;
          } else if (
            msg.msghtml.hasOwnProperty("label") &&
            lm_msgs_received[u][z].hasOwnProperty("label") &&
            msg.msghtml.hasOwnProperty("text") &&
            lm_msgs_received[u][z].hasOwnProperty("text") &&
            msg.msghtml.label == "SQ" &&
            lm_msgs_received[u][z]["label"] == "SQ" &&
            msg.msghtml.text == lm_msgs_received[u][z]["text"]
          ) {
            found = true;
            index_new = u;
            z = lm_msgs_received[u].length;
          }
        }

        // if we found a message group that matches the new message
        // run through the messages in that group to see if it is a dup.
        // if it is, we'll reject the new message and append a counter to the old/saved message
        if (found) {
          u = lm_msgs_received.length;

          for (let j = 0; j < lm_msgs_received[index_new].length; j++) {
            // First check is to see if the message is the same by checking all fields and seeing if they match
            // Second check is to see if the text field itself is a match
            // Last check is to see if we've received a multi-part message
            // If we do find a match we'll update the timestamp of the parent message
            // And add/update a duplicate counter to the parent message
            if (
              (lm_msgs_received[index_new][j]["text"] == msg.msghtml.text ||
                (!lm_msgs_received[index_new][j].hasOwnProperty("text") &&
                  !msg.msghtml.hasOwnProperty("text"))) &&
              (lm_msgs_received[index_new][j]["data"] == msg.msghtml.data ||
                (!lm_msgs_received[index_new][j].hasOwnProperty("data") &&
                  !msg.msghtml.hasOwnProperty("data"))) &&
              (lm_msgs_received[index_new][j]["libacars"] ==
                msg.msghtml.libacars ||
                (!lm_msgs_received[index_new][j].hasOwnProperty("libacars") &&
                  !msg.msghtml.hasOwnProperty("libacars"))) &&
              (lm_msgs_received[index_new][j]["dsta"] == msg.msghtml.dsta ||
                (!lm_msgs_received[index_new][j].hasOwnProperty("dsta") &&
                  !msg.msghtml.hasOwnProperty("dsta"))) &&
              (lm_msgs_received[index_new][j]["depa"] == msg.msghtml.depa ||
                (!lm_msgs_received[index_new][j].hasOwnProperty("depa") &&
                  !msg.msghtml.hasOwnProperty("depa"))) &&
              (lm_msgs_received[index_new][j]["eta"] == msg.msghtml.eta ||
                (!lm_msgs_received[index_new][j].hasOwnProperty("eta") &&
                  !msg.msghtml.hasOwnProperty("eta"))) &&
              (lm_msgs_received[index_new][j]["gtout"] == msg.msghtml.gtout ||
                (!lm_msgs_received[index_new][j].hasOwnProperty("gtout") &&
                  !msg.msghtml.hasOwnProperty("gtout"))) &&
              (lm_msgs_received[index_new][j]["gtin"] == msg.msghtml.gtin ||
                (!lm_msgs_received[index_new][j].hasOwnProperty("gtin") &&
                  !msg.msghtml.hasOwnProperty("gtin"))) &&
              (lm_msgs_received[index_new][j]["wloff"] == msg.msghtml.wloff ||
                (!lm_msgs_received[index_new][j].hasOwnProperty("wloff") &&
                  !msg.msghtml.hasOwnProperty("wloff"))) &&
              (lm_msgs_received[index_new][j]["wlin"] == msg.msghtml.wlin ||
                (!lm_msgs_received[index_new][j].hasOwnProperty("wlin") &&
                  !msg.msghtml.hasOwnProperty("wlin"))) &&
              (lm_msgs_received[index_new][j]["lat"] == msg.msghtml.lat ||
                (!lm_msgs_received[index_new][j].hasOwnProperty("lat") &&
                  !msg.msghtml.hasOwnProperty("lat"))) &&
              (lm_msgs_received[index_new][j]["lon"] == msg.msghtml.lon ||
                (!lm_msgs_received[index_new][j].hasOwnProperty("lon") &&
                  !msg.msghtml.hasOwnProperty("lon"))) &&
              (lm_msgs_received[index_new][j]["alt"] == msg.msghtml.alt ||
                (!lm_msgs_received[index_new][j].hasOwnProperty("alt") &&
                  !msg.msghtml.hasOwnProperty("alt")))
            ) {
              lm_msgs_received[index_new][j]["timestamp"] =
                msg.msghtml.timestamp;
              if (lm_msgs_received[index_new][j].hasOwnProperty("duplicates")) {
                lm_msgs_received[index_new][j]["duplicates"] = String(
                  Number(lm_msgs_received[index_new][j]["duplicates"]) + 1
                );
              } else {
                lm_msgs_received[index_new][j]["duplicates"] = "1";
              }
              rejected = true;
            } else if (
              lm_msgs_received[index_new][j].hasOwnProperty("text") &&
              msg.msghtml.hasOwnProperty("text") &&
              lm_msgs_received[index_new][j]["text"] == msg.msghtml["text"]
            ) {
              // it's the same message
              lm_msgs_received[index_new][j]["timestamp"] =
                msg.msghtml.timestamp;
              if (lm_msgs_received[index_new][j].hasOwnProperty("duplicates")) {
                lm_msgs_received[index_new][j]["duplicates"] = String(
                  Number(lm_msgs_received[index_new][j]["duplicates"]) + 1
                );
              } else {
                lm_msgs_received[index_new][j]["duplicates"] = "1";
              }
              rejected = true;
            } else if (
              msg.msghtml.station_id ==
                lm_msgs_received[index_new][j].station_id && // Is the message from the same station id? Keep ACARS/VDLM separate
              msg.msghtml.hasOwnProperty("msgno") &&
              lm_msgs_received[index_new][j].hasOwnProperty("msgno") &&
              msg.msghtml.timestamp - lm_msgs_received[index_new][j].timestamp <
                8.0 && // We'll assume the message is not a multi-part message if the time from the new message is too great from the rest of the group
              typeof msg.msghtml.msgno !== "undefined" &&
              ((msg.msghtml.msgno.charAt(0) ==
                lm_msgs_received[index_new][j].msgno!.charAt(0) && // Next two lines match on AzzA pattern
                msg.msghtml.msgno.charAt(3) ==
                  lm_msgs_received[index_new][j].msgno!.charAt(3)) ||
                msg.msghtml.msgno.substring(0, 3) ==
                  lm_msgs_received[index_new][j].msgno!.substring(0, 3))
            ) {
              // This check matches if the group is a AAAz counter
              // We have a multi part message. Now we need to see if it is a dup
              rejected = true;
              let add_multi = true;

              if (
                lm_msgs_received[index_new][j].hasOwnProperty("msgno_parts")
              ) {
                // Now we'll see if the multi-part message is a dup
                let split = lm_msgs_received[index_new][j]
                  .msgno_parts!.toString()
                  .split(" "); // format of stored parts is "MSGID MSGID2" etc

                for (let a = 0; a < split.length; a++) {
                  // Loop through the msg IDs present
                  if (split[a].substring(0, 4) == msg.msghtml["msgno"]) {
                    // Found a match in the message IDs already present
                    add_multi = false; // Ensure later checks know we've found a duplicate and to not add the message

                    if (a == 0 && split[a].length == 4) {
                      // Match, first element of the array with no previous matches so we don't want a leading space
                      lm_msgs_received[index_new][j].msgno_parts =
                        split[a] + "x2";
                    } else if (split[a].length == 4) {
                      // Match, not first element, and doesn't have previous matches
                      lm_msgs_received[index_new][j].msgno_parts +=
                        " " + split[a] + "x2";
                    } else if (a == 0) {
                      // Match, first element of the array so no leading space, has previous other matches so we increment the counter
                      let count = parseInt(split[a].substring(5)) + 1;
                      lm_msgs_received[index_new][j].msgno_parts =
                        split[a].substring(0, 4) + "x" + count;
                    } else {
                      // Match, has previous other matches so we increment the counter
                      let count = parseInt(split[a].substring(5)) + 1;
                      lm_msgs_received[index_new][j].msgno_parts +=
                        " " + split[a].substring(0, 4) + "x" + count;
                    }
                  } else {
                    // No match, re-add the MSG ID to the parent message
                    if (a == 0) {
                      lm_msgs_received[index_new][j].msgno_parts = split[a];
                    } else {
                      lm_msgs_received[index_new][j].msgno_parts +=
                        " " + split[a];
                    }
                  }
                }
              }

              lm_msgs_received[index_new][j]["timestamp"] =
                msg.msghtml.timestamp;

              if (add_multi) {
                // Multi-part message has been found
                if (
                  lm_msgs_received[index_new][j]["text"] &&
                  msg.msghtml.hasOwnProperty("text")
                )
                  // If the multi-part parent has a text field and the found match has a text field, append
                  lm_msgs_received[index_new][j]["text"]! += msg.msghtml.text;
                else if (msg.msghtml.hasOwnProperty("text"))
                  // If the new message has a text field but the parent does not, add the new text to the parent
                  lm_msgs_received[index_new][j]["text"] = msg.msghtml.text;

                if (
                  lm_msgs_received[index_new][j].hasOwnProperty("msgno_parts")
                ) {
                  // If the new message is multi, with no dupes found we need to append the msg ID to the found IDs
                  lm_msgs_received[index_new][j]["msgno_parts"] +=
                    " " + msg.msghtml.msgno;
                } else {
                  lm_msgs_received[index_new][j]["msgno_parts"] =
                    lm_msgs_received[index_new][j]["msgno"] +
                    " " +
                    msg.msghtml.msgno;
                }

                // Re-run the text decoder against the text field we've updated
                let decoded_msg = lm_md.decode(lm_msgs_received[index_new][j]);
                if (decoded_msg.decoded == true) {
                  lm_msgs_received[index_new][j]["decoded_msg"] = decoded_msg;
                }

                if (matched.was_found && !msg.loading) sound_alert();
              }
            }

            if (rejected) {
              // Promote the message back to the front
              lm_msgs_received[index_new].forEach(function (
                item: any,
                i: number
              ) {
                if (i == j) {
                  lm_msgs_received[index_new].splice(i, 1);
                  lm_msgs_received[index_new].unshift(item);
                }
              });
              j = lm_msgs_received[index_new].length;
            }
          }
        }

        // If the message was found we'll move the message group back to the top
        if (found) {
          // If the message was found, and not rejected, we'll append it to the message group
          if (!rejected) {
            lm_msgs_received[index_new].unshift(msg.msghtml);
          }

          lm_msgs_received.forEach(function (item, i) {
            if (i == index_new) {
              lm_msgs_received.splice(i, 1);
              lm_msgs_received.unshift(item);
            }
          });
        }
      }
      if (!found && !rejected) {
        if (matched.was_found && !msg.loading) sound_alert();
        lm_msgs_received.unshift([msg.msghtml]);
      }
    } else if (!msg.loading) {
      increment_filtered();
    }
  } else {
    if (text_filter && !msg.loading) increment_filtered();
  }
  if (!msg.loading) increment_received();
  if (
    lm_page_active &&
    !pause &&
    (typeof msg.done_loading === "undefined" || msg.done_loading === true)
  ) {
    $("#log").html(display_messages(lm_msgs_received, selected_tabs, true));
    resize_tabs();
    tooltip.close_all_tooltips();
    tooltip.attach_all_tooltips();
  }
}

export function get_match(callsign: string = "", plane_hex: string = "") {
  if (callsign === "" && plane_hex === "") return [];
  for (let i = 0; i < lm_msgs_received.length; i++) {
    for (let j = 0; j < lm_msgs_received[i].length; j++) {
      if (
        typeof lm_msgs_received[i][j].icao_hex !== "undefined" &&
        lm_msgs_received[i][j].icao_hex == plane_hex
      ) {
        return lm_msgs_received[i];
      }

      if (
        callsign !== "" &&
        typeof lm_msgs_received[i][j].icao_flight !== "undefined" &&
        lm_msgs_received[i][j].icao_flight == callsign
      ) {
        return lm_msgs_received[i];
      }

      if (
        callsign !== "" &&
        typeof lm_msgs_received[i][j].tail !== "undefined" &&
        lm_msgs_received[i][j].tail == callsign
      ) {
        return lm_msgs_received[i];
      }
    }
  }

  return [];
}

export function find_matches() {
  let output_hex: string[] = [];
  let output_icao_callsigns: string[] = [];
  let output_tail: string[] = [];
  let found_callsign = false;
  let found_hex = false;
  let found_tail = false;

  for (let i = 0; i < lm_msgs_received.length; i++) {
    found_callsign = false;
    found_hex = false;
    found_tail = false;
    for (let j = 0; j < lm_msgs_received[i].length; j++) {
      if (
        !found_hex &&
        typeof lm_msgs_received[i][j].icao_hex !== "undefined"
      ) {
        // @ts-expect-error
        output_hex.push(lm_msgs_received[i][j].icao_hex);
        found_hex = true;
      }
      if (
        !found_callsign &&
        typeof lm_msgs_received[i][j].icao_flight !== "undefined"
      ) {
        // @ts-expect-error
        output_icao_callsigns.push(lm_msgs_received[i][j].icao_flight);
        found_callsign = true;
      }

      if (!found_tail && typeof lm_msgs_received[i][j].tail !== "undefined") {
        // @ts-expect-error
        output_tail.push(lm_msgs_received[i][j].tail);
        found_tail = true;
      }

      if (found_hex && found_callsign && found_tail) {
        j = lm_msgs_received[i].length;
      }
    }
  }

  return {
    hex: output_hex,
    callsigns: output_icao_callsigns,
    tail: output_tail,
  };
}
