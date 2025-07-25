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

import Cookies from "js-cookie";
import {
  display_messages,
  display_message_group,
} from "../helpers/html_generator";
import {
  alert_term_query,
  alert_text_update,
  get_window_size,
  resize_tabs,
} from "../index";
import { acars_msg, alert_matched, html_msg, terms } from "../interfaces";
import jBox from "jbox";
import { tooltip } from "../helpers/tooltips";
import { ACARSHubPage } from "./master";

export class AlertsPage extends ACARSHubPage {
  #alerts: number = 0;
  #alert_text: string[] = [];
  #ignore_text: string[] = [];
  #alert_callsigns: string[] = [];
  #alert_tail: string[] = [];
  #alert_icao: string[] = [];
  #alert_msgs_received = {
    value: [] as acars_msg[][],
    unshift: function (a: acars_msg[]) {
      if (this.value.length >= 50) {
        this.value.pop();
      }
      return Array.prototype.unshift.apply(this.value, [a] as acars_msg[][]);
    },
  };

  #default_text_values: string[] = [
    "cop",
    "police",
    "authorities",
    "chop",
    "turbulence",
    "turb",
    "fault",
    "divert",
    "mask",
    "csr",
    "agent",
    "medical",
    "security",
    "mayday",
    "emergency",
    "pan",
    "red coat",
  ] as string[];

  #alert_message_modal = new jBox("Modal", {
    id: "set_modal",
    width: 350,
    height: 450,
    blockScroll: false,
    isolateScroll: true,
    animation: "zoomIn",
    closeButton: "box",
    overlay: true,
    reposition: false,
    repositionOnOpen: true,
    content: `  <p><a href="javascript:toggle_playsound()" id="playsound_link" class="spread_text">Turn On Alert Sound</a></p>
    <span id="stat_menu">
      <label for="alert_text" class="menu_non_link">Text Field:</label><br />
      <textarea rows="2" id="alert_text"></textarea><br />
      <label for="alert_text_ignore" class="menu_non_link">Text Field to Ignore:</label><br />
      <textarea rows="2" id="alert_text_ignore"></textarea><br />
      <label for="alert_callsigns" class="menu_non_link">Callsign:</label><br />
      <textarea rows="2" id="alert_callsigns"></textarea><br />
      <label for="alert_tail" class="menu_non_link">Tail Number:</label><br />
      <textarea rows="2" id="alert_tail"></textarea><br />
      <label for="alert_icao" class="menu_non_link">ICAO Address:</label><br />
      <textarea rows="2" id="alert_icao"></textarea><br />
      <button type="submit" value="Submit" onclick="javascript:updateAlerts()">Update</button>
      <p><a href="javascript:default_alert_values()" class="spread_text">Default alert values</a><br>
      <a href="javascript:reset_alert_counts()" class="spread_text red">Reset ALL alert counts in data base</a></p>
    </span>`,
  });

  #alert_sound: any = "";
  #play_sound: boolean = false;

  constructor() {
    super();
    // Document on ready new syntax....or something. Passing a function directly to jquery
    // Update the cookies so the expiration date pushes out in to the future
    // Also sets all of the user saved prefs
    this.onInit();
    alert_term_query(this.#alert_icao, this.#alert_callsigns, this.#alert_tail);
  }

  show_modal_values(): void {
    this.show_sound();
    $("#alert_text").val(this.combineArray(this.#alert_text).toUpperCase());
    $("#alert_text_ignore").val(
      this.combineArray(this.#ignore_text).toUpperCase()
    );
    $("#alert_callsigns").val(
      this.combineArray(this.#alert_callsigns).toUpperCase()
    );
    $("#alert_tail").val(this.combineArray(this.#alert_tail).toUpperCase());
    $("#alert_icao").val(this.combineArray(this.#alert_icao).toUpperCase());
  }

  alerts_terms(msg: terms): void {
    this.#alert_text = msg.terms;
    this.#ignore_text = msg.ignore;
  }

  alerts_acars_message(msg: html_msg): void {
    let matched: alert_matched = this.match_alert(msg, true);
    if (matched.was_found) {
      if (msg.loading != true) this.sound_alert();
      msg.msghtml.matched_text = matched.text !== null ? matched.text : [];
      msg.msghtml.matched_icao = matched.icao !== null ? matched.icao : [];
      msg.msghtml.matched_flight =
        matched.flight !== null ? matched.flight : [];
      msg.msghtml.matched_tail = matched.tail !== null ? matched.tail : [];
      this.#alert_msgs_received.unshift([msg.msghtml]);
      if (
        this.page_active &&
        (typeof msg.done_loading === "undefined" || msg.done_loading === true)
      ) {
        $("#log").html(display_messages(this.#alert_msgs_received.value));
        tooltip.close_all_tooltips();
        tooltip.attach_all_tooltips();
      } else if (matched.was_found && msg.loading != true) {
        this.#alerts += 1;
        this.updateAlertCounter();
        this.sound_alert();
      }
    }
  }

  updateAlertCounter(): void {
    if (this.#alerts)
      $("#alert_count").html(` <span class="red">(${this.#alerts})</span>`);
  }

  updateAlerts(): void {
    if ($("#alert_text").val()) {
      let split = String($("#alert_text").val()).split(",");
      this.#alert_text = [];
      for (let i = 0; i < split.length; i++) {
        if (
          split[i].trim().length > 0 &&
          !this.#alert_text.includes(split[i].trim().toUpperCase())
        )
          this.#alert_text.push(split[i].trim().toUpperCase());
      }
    } else {
      this.#alert_text = [];
    }

    if ($("#alert_text_ignore").val()) {
      const split = String($("#alert_text_ignore").val()).split(",");
      this.#ignore_text = [];
      Object.values(split).forEach((value) => {
        if (
          value.trim().length > 0 &&
          !this.#ignore_text.includes(value.trim().toUpperCase())
        )
          this.#ignore_text.push(value.trim().toUpperCase());
      });
    } else {
      this.#ignore_text = [];
    }

    if ($("#alert_callsigns").val()) {
      let split = String($("#alert_callsigns").val()).split(",");
      this.#alert_callsigns = [];
      for (let i = 0; i < split.length; i++) {
        if (
          split[i].trim().length > 0 &&
          !this.#alert_callsigns.includes(split[i].trim().toUpperCase())
        )
          this.#alert_callsigns.push(split[i].trim().toUpperCase());
      }
    } else {
      this.#alert_callsigns = [];
    }

    if ($("#alert_tail").val()) {
      let split = String($("#alert_tail").val()).split(",");
      this.#alert_tail = [];
      for (let i = 0; i < split.length; i++) {
        if (
          split[i].trim().length > 0 &&
          !this.#alert_tail.includes(split[i].trim().toUpperCase())
        )
          this.#alert_tail.push(split[i].trim().toUpperCase());
      }
    } else {
      this.#alert_tail = [];
    }

    if ($("#alert_icao").val()) {
      let split = String($("#alert_icao").val()).split(",");
      this.#alert_icao = [];
      for (let i = 0; i < split.length; i++) {
        if (
          split[i].trim().length > 0 &&
          !this.#alert_icao.includes(split[i].trim().toUpperCase())
        )
          this.#alert_icao.push(split[i].trim().toUpperCase());
      }
    } else {
      this.#alert_icao = [];
    }

    $("#alert_text").val(this.combineArray(this.#alert_text).toUpperCase());
    $("#alert_callsigns").val(
      this.combineArray(this.#alert_callsigns).toUpperCase()
    );
    $("#alert_tail").val(this.combineArray(this.#alert_tail).toUpperCase());
    $("#alert_icao").val(this.combineArray(this.#alert_icao).toUpperCase());

    alert_text_update(this.#alert_text, this.#ignore_text);

    Cookies.set("alert_callsigns", this.combineArray(this.#alert_callsigns), {
      expires: 365,
      sameSite: "Strict",
    });
    Cookies.set("alert_tail", this.combineArray(this.#alert_tail), {
      expires: 365,
      sameSite: "Strict",
    });
    Cookies.set("alert_icao", this.combineArray(this.#alert_icao), {
      expires: 365,
      sameSite: "Strict",
    });
  }

  onInit(): void {
    this.#alerts = Cookies.get("alert_unread")
      ? Number(Cookies.get("alert_unread"))
      : 0;
    this.#play_sound = Cookies.get("play_sound") == "true" ? true : false;
    Cookies.set("play_sound", this.#play_sound == true ? "true" : "false", {
      expires: 365,
      sameSite: "Strict",
    });

    if (
      Cookies.get("alert_callsigns") &&
      Cookies.get("alert_callsigns")!.length > 0
    ) {
      let split = Cookies.get("alert_callsigns")!.split(",");
      for (let i = 0; i < split.length; i++) {
        if (
          split[i].trim().length > 0 &&
          !this.#alert_callsigns.includes(split[i].trim().toUpperCase())
        )
          this.#alert_callsigns.push(split[i].toUpperCase());
      }
    } else {
      this.#alert_callsigns = [];
    }

    if (Cookies.get("alert_tail") && Cookies.get("alert_tail")!.length > 0) {
      let split = Cookies.get("alert_tail")!.split(",");
      for (let i = 0; i < split.length; i++) {
        if (
          split[i].trim().length > 0 &&
          !this.#alert_tail.includes(split[i].trim().toUpperCase())
        )
          this.#alert_tail.push(split[i].toUpperCase());
      }
    } else {
      this.#alert_tail = [];
    }

    if (Cookies.get("alert_icao") && Cookies.get("alert_icao")!.length > 0) {
      let split = Cookies.get("alert_icao")!.split(",");
      for (let i = 0; i < split.length; i++) {
        if (
          split[i].trim().length > 0 &&
          !this.#alert_icao.includes(split[i].trim().toUpperCase())
        )
          this.#alert_icao.push(split[i].toUpperCase());
      }
    } else {
      this.#alert_icao = [];
    }

    Cookies.set("alert_callsigns", this.combineArray(this.#alert_callsigns), {
      expires: 365,
      sameSite: "Strict",
    });
    Cookies.set("alert_tail", this.combineArray(this.#alert_tail), {
      expires: 365,
      sameSite: "Strict",
    });
    Cookies.set("alert_icao", this.combineArray(this.#alert_icao), {
      expires: 365,
      sameSite: "Strict",
    });
  }

  combineArray(input: string[]): string {
    let output = "";

    for (let i = 0; i < input.length; i++) {
      output += `${i != 0 ? "," + input[i] : input[i]}`;
    }

    return output;
  }

  // FIXME: Rewrite this with forEach
  match_alert(msg: html_msg, show_alert: boolean = false): alert_matched {
    let found = false;
    let matched_tail = [];
    let matched_flight = [];
    let matched_icao = [];
    let matched_text = [];
    let term_string: string = "";
    if (
      msg.msghtml.hasOwnProperty("text") &&
      typeof msg.msghtml.text !== "undefined"
    ) {
      let dont_ignore_msg = true;
      for (let i = 0; i < this.#alert_text.length; i++) {
        if (
          msg.msghtml.text
            .toUpperCase()
            .search(
              new RegExp("\\b" + this.#alert_text[i].toUpperCase() + "\\b")
            ) != -1
        ) {
          const ignore_not_found = Object.values(this.#ignore_text).every(
            (text) => {
              return (
                msg.msghtml
                  .text!.toUpperCase()
                  .search(new RegExp("\\b" + text + "\\b")) == -1
              );
            }
          );
          if (!ignore_not_found) dont_ignore_msg = false;
          if (ignore_not_found && dont_ignore_msg) {
            found = true;
            matched_text.push(this.#alert_text[i]);
            term_string =
              term_string.length > 0
                ? ", " + this.#alert_text[i]
                : this.#alert_text[i];
          }
        }
      }
    }

    if (
      msg.msghtml.hasOwnProperty("flight") &&
      typeof msg.msghtml.flight !== "undefined"
    ) {
      for (let i = 0; i < this.#alert_callsigns.length; i++) {
        if (
          msg.msghtml.flight
            .toUpperCase()
            .includes(this.#alert_callsigns[i].toUpperCase())
        ) {
          found = true;
          matched_flight.push(this.#alert_callsigns[i]);
          term_string =
            term_string.length > 0
              ? ", " + this.#alert_callsigns[i]
              : this.#alert_callsigns[i];
        }
      }
    }

    if (
      msg.msghtml.hasOwnProperty("tail") &&
      typeof msg.msghtml.tail !== "undefined"
    ) {
      for (let i = 0; i < this.#alert_tail.length; i++) {
        if (
          msg.msghtml.tail
            .toUpperCase()
            .includes(this.#alert_tail[i].toUpperCase())
        ) {
          found = true;
          matched_tail.push(this.#alert_tail[i]);
          term_string =
            term_string.length > 0
              ? ", " + this.#alert_tail[i]
              : this.#alert_tail[i];
        }
      }
    }

    if (
      msg.msghtml.hasOwnProperty("icao") &&
      typeof msg.msghtml.icao !== "undefined"
    ) {
      for (let i = 0; i < this.#alert_icao.length; i++) {
        if (
          msg.msghtml.icao
            .toString()
            .toUpperCase()
            .includes(this.#alert_icao[i].toUpperCase()) ||
          (msg.msghtml.hasOwnProperty("icao_hex") &&
            typeof msg.msghtml.icao_hex !== "undefined" &&
            msg.msghtml.icao_hex
              .toUpperCase()
              .includes(this.#alert_icao[i].toUpperCase()))
        ) {
          found = true;
          matched_icao.push(this.#alert_icao[i]);
          term_string =
            term_string.length > 0
              ? ", " + this.#alert_icao[i]
              : this.#alert_icao[i];
        }
      }
    }

    if (
      show_alert &&
      found &&
      (typeof msg.loading === "undefined" || !msg.loading)
    ) {
      // get random number between 1000 and 10000000000
      const random_number = String(
        Math.floor(Math.random() * (1000000000 - 1000 + 1)) + 1000
      );
      const msg_text: string =
        "A new message matched with the following term(s): " + term_string;
      new jBox("Notice", {
        id: "alert_popup_" + random_number,
        attributes: {
          x: "right",
          y: "bottom",
        },
        stack: true,
        delayOnHover: true,
        showCountdown: true,
        animation: {
          open: "zoomIn",
          close: "zoomIn",
        },
        content: msg_text,
        color: "green",
        autoClose: 10000,
      });

      $("#alert_popup_" + random_number).on("click", () => {
        const window_size = get_window_size();
        let box = new jBox("Modal", {
          id: "set_modal" + random_number,
          blockScroll: false,
          isolateScroll: true,
          animation: "zoomIn",
          closeButton: "box",
          overlay: false,
          reposition: true,
          repositionOnOpen: false,
          title: "Messages",
          content:
            `<div id="msg${random_number}">` +
            display_message_group([msg.msghtml]) +
            "</div>",
        });
        box.open();
        resize_tabs();
      });
    }

    return {
      was_found: found,
      text: matched_text.length > 0 ? matched_text : null,
      icao: matched_icao.length > 0 ? matched_icao : null,
      flight: matched_flight.length > 0 ? matched_flight : null,
      tail: matched_tail.length > 0 ? matched_tail : null,
    } as alert_matched;
  }

  default_alert_values(): void {
    let current = String($("#alert_text").val());

    this.#default_text_values.forEach((element) => {
      if (!this.#alert_text.includes(element.toUpperCase())) {
        current += `${current.length > 0 ? "," + element : element}`;
      }
    });
    $("#alert_text").val(current);
    this.updateAlerts();
  }

  show_sound(): void {
    if (this.#play_sound) {
      $("#playsound_link").html("Turn Off Alert Sound");
    } else {
      $("#playsound_link").html("Turn On Alert Sound");
    }
  }

  toggle_playsound(loading = false): void {
    if (this.#play_sound) {
      $("#playsound_link").html("Turn On Alert Sound");
    } else {
      $("#playsound_link").html("Turn Off Alert Sound");
    }
    this.#play_sound = !this.#play_sound;
    Cookies.set("play_sound", this.#play_sound == true ? "true" : "false", {
      expires: 365,
      sameSite: "Strict",
    });

    if (!loading) this.sound_alert();
  }

  async sound_alert(): Promise<void> {
    if (this.#play_sound) {
      try {
        await this.#alert_sound.play();
      } catch (err) {
        console.log(err);
      }
    }
  }

  alerts_active(state = false, show_modal_link: boolean): void {
    super.active(state);

    if (this.page_active) {
      // page is active
      this.alerts_set_html(show_modal_link);
      Cookies.set("alert_unread", "0", {
        expires: 365,
        sameSite: "Strict",
      });
      this.#alerts = 0;
      $("#alert_count").html(` <span class="red"></span>`);

      // temporarily toggle the play_sound variable so we can set the UI correctly
      this.#play_sound = !this.#play_sound;
      this.toggle_playsound(true);

      $("#log").html(display_messages(this.#alert_msgs_received.value));
    }
  }

  set_page_urls(documentPath: string, documentUrl: string): void {
    super.set_page_urls(documentPath, documentUrl);

    this.#alert_sound = new Audio(
      `${this.document_url}static/sounds/alert.mp3`
    );
  }

  alerts_set_html(show_menu_modal: boolean): void {
    if (show_menu_modal) {
      $("#modal_text").html(
        '<a href="javascript:show_page_modal()">Page Settings</a>'
      );
    }
    $("#log").html("");
  }

  show_alert_message_modal(): void {
    this.#alert_message_modal.open();
    this.show_modal_values();
  }
}
