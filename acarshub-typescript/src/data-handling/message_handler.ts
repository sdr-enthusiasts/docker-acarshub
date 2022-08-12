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
import { get_setting, is_label_excluded } from "../acarshub";
import { v4 as uuidv4 } from "uuid";
import {
  acars_msg,
  adsb,
  adsb_plane,
  plane,
  planes_array,
  alert_terms,
  aircraft_position,
  message_properties,
} from "src/interfaces";
import { AlertHandler } from "./alert_handler";

export class MessageHandler {
  alert_handler: AlertHandler;
  // @ts-expect-error
  planes: planes_array = [] as Array<plane>;
  adsb_last_update_time: number = 0;
  //lm_md = new MessageDecoder();
  // this is a temp workaround to get things building while acars decoder is broken
  lm_md = {
    decode: (message: acars_msg) => {
      return { decoded: false, decoded_msg: "" } as any;
    },
  };
  msg_tags = [
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
  ] as Array<keyof acars_msg>;

  constructor(acarshub_url: string) {
    // Overload the unshift operator for the planes array
    // The array should keep only 50 planes with messages if they DO NOT
    // have an ADSB position
    this.alert_handler = new AlertHandler(acarshub_url);
    this.planes.prepend = (p: plane) => {
      if (this.planes.length >= 50) {
        let indexes_to_delete: Array<number> = []; // All of the indexes with messages and ADSB positions

        // Find all of the planes with no ADSB position and messages
        this.planes.forEach((plane, index) => {
          if (!plane.position && plane.messages && plane.messages.length > 0)
            indexes_to_delete.push(index);
        });

        // Only delete any in excess of 50
        const index_to_splice: number =
          indexes_to_delete.length > 50 ? indexes_to_delete.length - 49 : 0;

        if (index_to_splice > 0) {
          indexes_to_delete
            .splice(0, index_to_splice) // remove all of the "new" planes
            .sort((a, b) => b - a) // reverse the sort so we don't fuck up the indexes we've saved relative to the old array
            .forEach((index) => {
              this.planes.splice(index, 1);
            });
        }
      }
      return this.planes.unshift.apply(this.planes, [p]);
    };
  }

  acars_message(msg: acars_msg) {
    const callsign = this.get_callsign_from_acars(msg);
    const hex = this.get_hex_from_acars(msg);
    const tail = this.get_tail_from_acars(msg);
    const squitter = this.get_squitter_from_acars(msg);
    const plane = this.match_plane_from_id(
      callsign,
      hex,
      tail,
      undefined,
      squitter
    );

    if (typeof plane !== "undefined") {
      this.update_plane_message(msg, plane);
      const matched_terms = this.alert_handler.find_alerts(
        this.planes[plane].messages[0]
      );
      if (matched_terms && matched_terms.length > 0) {
        this.planes[plane].messages[0].matched = true;
        this.planes[plane].messages[0].matched_text = matched_terms;
        this.planes[plane].has_alerts = true;
        this.planes[plane].num_alerts += 1;
      }
      // Ensure we always have a good selected tab UID
      // If there was never a message (aka this is the first time ACARS has been received)
      // Or if the user has never interacted with the tab selection for this plane
      // Then we'll set the selected tab to the first message
      if (
        (this.should_display_message(this.planes[plane].messages[0]) &&
          this.planes[plane].messages.length == 1) ||
        !this.planes[plane].manually_selected_tab
      ) {
        this.planes[plane].selected_tab = this.planes[plane].messages[0].uid;
      }

      this.planes.forEach((item, i) => {
        if (i == plane) {
          this.planes.splice(i, 1);
          this.planes.prepend(item);
        }
      });

      this.update_values_from_acars();
    } else {
      let processed_message = this.update_plane_message(msg);
      const matched_terms = this.alert_handler.find_alerts(msg);
      const msg_uid =
        processed_message &&
        processed_message[0] &&
        this.should_display_message(processed_message[0])
          ? msg.uid
          : undefined;
      if (matched_terms && matched_terms.length > 0 && processed_message) {
        processed_message[0].matched = true;
        processed_message[0].matched_text = matched_terms;
      }
      this.planes.prepend({
        callsign: callsign,
        hex: hex,
        tail: tail,
        squitter: squitter,
        position: undefined,
        position_history: [] as Array<aircraft_position>,
        messages: processed_message ? processed_message : [],
        has_alerts: matched_terms && matched_terms.length > 0,
        num_alerts: matched_terms && matched_terms.length > 0 ? 1 : 0,
        last_updated: 0,
        uid: uuidv4(),
        selected_tab: msg_uid,
        manually_selected_tab: false,
      });
    }

    return {
      uid: this.planes[0].uid,
      has_alerts: this.planes[0].messages[0].matched,
      should_display: this.should_display_message(this.planes[0].messages[0]),
    } as message_properties;
  }

  should_display_message(msg: acars_msg): boolean {
    // The message matched an alert, we should display

    if (msg.matched) {
      return true;
    }
    // We are not doing any filtering, we should display
    if (
      Boolean(get_setting("live_messages_page_exclude_empty")) === false &&
      get_setting("live_messages_page_exclude_labels").length === 0
    ) {
      return true;
    }

    // are we filtering by empty messages?
    // if so, and the message is empty, don't display
    if (
      Boolean(get_setting("live_messages_page_exclude_empty")) === true &&
      !this.is_not_empty(msg)
    ) {
      return false;
    }

    // are filtering by labels?
    // if so, and the message containers a label in the list, don't display
    if (
      msg.label &&
      get_setting("live_messages_page_exclude_labels").length > 0 &&
      is_label_excluded(msg.label)
    ) {
      return false;
    }
    return true;
  }

  is_not_empty(message: acars_msg): boolean {
    return !Object.values(this.msg_tags).every((tag) => {
      if (tag in message) return false;
      return true;
    });
  }

  adsb_message(adsb_positions: adsb) {
    this.adsb_last_update_time = adsb_positions.now;

    adsb_positions.aircraft.forEach((target) => {
      const callsign = this.get_callsign_from_adsb(target);
      const hex = this.get_hex_from_adsb(target);
      const tail = this.get_tail_from_adsb(target);
      const plane = this.match_plane_from_id(callsign, hex, tail);
      if (typeof plane !== "undefined") {
        this.update_plane_position(target, plane);
      } else {
        this.planes.unshift({
          callsign: callsign,
          hex: hex,
          tail: tail,
          position: target,
          position_history: [] as Array<aircraft_position>,
          messages: [],
          has_alerts: false,
          num_alerts: 0,
          last_updated: this.adsb_last_update_time,
          uid: uuidv4(),
          selected_tab: "0",
          manually_selected_tab: false,
        });
      }
    });

    // now loop through all of the planes and make sure their positions are still valid. Remove if not found
    this.planes.forEach((plane, index) => {
      if (
        plane.position &&
        plane.last_updated &&
        plane.last_updated < this.adsb_last_update_time
      ) {
        this.planes[index].last_updated = undefined;
        this.planes[index].position = undefined;
      }
    });
  }

  update_values_from_acars() {
    if (
      (this.planes[0].callsign == "" ||
        typeof this.planes[0].callsign === "undefined") &&
      this.get_callsign_from_acars(this.planes[0].messages[0]) != ""
    ) {
      this.planes[0].callsign = this.get_callsign_from_acars(
        this.planes[0].messages[0]
      );
    }
    if (
      (this.planes[0].hex == "" || typeof this.planes[0].hex === "undefined") &&
      this.get_hex_from_acars(this.planes[0].messages[0]) != ""
    ) {
      this.planes[0].hex = this.get_hex_from_acars(this.planes[0].messages[0]);
    }

    if (
      (this.planes[0].tail == "" ||
        typeof this.planes[0].tail === "undefined") &&
      this.get_tail_from_acars(this.planes[0].messages[0]) != ""
    ) {
      this.planes[0].tail = this.get_tail_from_acars(
        this.planes[0].messages[0]
      );
    }
  }

  update_plane_message(
    new_msg: acars_msg,
    index: number | undefined = undefined
  ): undefined | Array<acars_msg> {
    // TODO: add in alert matching

    new_msg.uid = uuidv4(); // Each message gets a unique ID. Used to track tab selection
    if ("text" in new_msg) {
      // see if we can run it through the text decoder
      let decoded_msg = this.lm_md.decode(new_msg);
      if (decoded_msg.decoded == true) {
        new_msg.decodedText = decoded_msg;
      }
    }

    if (typeof index === "undefined") {
      return [new_msg];
    }
    let rejected = false;

    // TODO: remove this ! check for TS
    for (let message of this.planes[index].messages!) {
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
      } else if (
        // check if text fields are the same
        "text" in message &&
        "text" in new_msg &&
        message.text == new_msg.text
      ) {
        // it's the same message
        message.timestamp = new_msg.timestamp;
        message.duplicates = String(Number(message.duplicates || 0) + 1);
        rejected = true;
      } else if (
        new_msg.station_id == message.station_id && // Is the message from the same station id? Keep ACARS/VDLM separate
        new_msg.timestamp - message.timestamp < 8.0 && // We'll assume the message is not a multi-part message if the time from the new message is too great from the rest of the group
        typeof new_msg.msgno !== "undefined" && // For reasons unknown to me TS is throwing an error if we don't check for undefined
        typeof message.msgno !== "undefined" && // Even though we can't reach this point if the message doesn't have a msgno
        ((new_msg.msgno.charAt(0) == message.msgno.charAt(0) && // Next two lines match on AzzA pattern
          new_msg.msgno.charAt(3) == message.msgno.charAt(3)) ||
          new_msg.msgno.substring(0, 3) == message.msgno.substring(0, 3))
      ) {
        // This check matches if the group is a AAAz counter
        // We have a multi part message. Now we need to see if it is a dup
        rejected = true;
        let add_multi = true;

        if ("msgno_parts" in message) {
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
                message.msgno_parts = split[a].substring(0, 4) + "x" + count;
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
          let decoded_msg = this.lm_md.decode(message);
          if (decoded_msg.decoded == true) {
            message["decodedText"] = decoded_msg;
          }
        }
        break;
      }

      if (rejected) {
        // Promote the message back to the front
        this.planes[index].messages!.forEach((item: any, i: number) => {
          if (i == this.planes[index].messages!.indexOf(message)) {
            this.planes[index].messages!.splice(i, 1);
            this.planes[index].messages!.unshift(item);
          }
        });
        break;
      }
    }

    if (!rejected) {
      if (!this.planes[index].messages) this.planes[index].messages = [];
      this.planes[index].messages!.unshift(new_msg);
    }
  }

  check_for_dup(message: acars_msg, new_msg: acars_msg): boolean {
    return Object.values(this.msg_tags).every((tag) => {
      if (tag in message && tag in new_msg) {
        if (message[tag] == new_msg[tag]) return true;
      } else if (!(tag in message) && !(tag in new_msg)) {
        return true;
      }
      return false;
    });
  }

  update_plane_position(
    plane: adsb_plane | undefined = undefined,
    index: number | undefined = undefined
  ) {
    if (!index || !plane) return;

    const previous_position = this.planes[index].position || undefined;
    this.planes[index].position = plane;
    this.planes[index].last_updated = this.adsb_last_update_time;
    this.planes[index].hex = this.get_hex_from_adsb(plane);
    this.planes[index].callsign = this.get_callsign_from_adsb(plane);
    this.planes[index].tail = this.get_tail_from_adsb(plane);

    if (previous_position) {
      // TODO: this is very imprecise and needs tweaking
      // Do we need a hard upper limit on position histories?
      // Should we save *EVERY* position or just those with some significant change in direction
      // altitude etc?

      this.planes[index].position_history.unshift({
        gs: previous_position.gs || undefined,
        ias: previous_position.ias || undefined,
        tas: previous_position.tas || undefined,
        mach: previous_position.mach || undefined,
        track: previous_position.track || undefined,
        track_rate: previous_position.track_rate || undefined,
        roll: previous_position.roll || undefined,
        mag_heading: previous_position.mag_heading || undefined,
        true_heading: previous_position.true_heading || undefined,
        baro_rate: previous_position.baro_rate || undefined,
        geom_rate: previous_position.geom_rate || undefined,
        lat: previous_position.lat || undefined,
        lon: previous_position.lon || undefined,
      } as aircraft_position);

      if (this.planes[index].position_history.length > 50) {
        this.planes[index].position_history.pop();
      }
    }
  }

  match_plane_from_id(
    callsign: string | null = null,
    hex: string | null = null,
    tail: string | null = null,
    uid: string | null = null,
    squitter: string | null = null
  ): undefined | number {
    // make sure we have some kind of value to match with
    if (!callsign && !hex && !tail && !uid && !squitter) return undefined;

    let plane_index = undefined;

    Object.values(this.planes).every((plane, index) => {
      if (uid && plane.uid == uid) {
        plane_index = index;
        return false;
      }
      if (callsign && plane.callsign == callsign) {
        plane_index = index;
        return false;
      }
      if (hex && plane.hex == hex) {
        plane_index = index;
        return false;
      }
      if (tail && plane.tail == tail) {
        plane_index = index;
        return false;
      }

      if (squitter && plane.squitter == squitter) {
        plane_index = index;
        return false;
      }

      return true;
    });
    return plane_index;
  }

  get_callsign_from_adsb(plane: adsb_plane): string {
    return (
      plane.flight && plane.flight.trim() !== ""
        ? plane.flight.trim()
        : plane.r && plane.r !== ""
        ? plane.r
        : plane.hex
    )
      .replace("~", "")
      .replace(".", "")
      .replace("-", "")
      .toUpperCase();
  }

  get_callsign_from_acars(msg: acars_msg): string | undefined {
    if (msg.icao_flight) return msg.icao_flight.toUpperCase();
    return undefined;
  }

  get_hex_from_acars(msg: acars_msg): string | undefined {
    if (msg.icao_hex) return msg.icao_hex.toUpperCase();
    return undefined;
  }

  get_tail_from_acars(msg: acars_msg): string | undefined {
    if (msg.tail) return msg.tail.toUpperCase();
    return undefined;
  }

  get_squitter_from_acars(msg: acars_msg): string | undefined {
    if (msg.label && msg.label === "SQ" && msg.text) return msg.text;
  }

  get_sqwk(plane: adsb_plane): number {
    return plane.squawk || 0;
  }

  get_alt(plane: adsb_plane): string | number {
    return plane.alt_baro ? String(plane.alt_baro).toUpperCase() : 0;
  }

  get_speed(plane: adsb_plane): number {
    return plane.gs ? plane.gs : 0;
  }

  get_tail_from_adsb(plane: adsb_plane): string {
    return plane.r
      ? plane.r.replace("-", "").replace(".", "").replace("~", "")
      : <any>undefined;
  }

  get_hex_from_adsb(plane: adsb_plane): string {
    return plane.hex
      ? plane.hex
          .replace("-", "")
          .replace(".", "")
          .replace("~", "")
          .toUpperCase()
      : <any>undefined;
  }

  get_baro_rate(plane: adsb_plane): number {
    return plane.baro_rate ? plane.baro_rate : 0;
  }

  get_heading(plane: adsb_plane): number {
    return plane.track || 0;
  }

  get_ac_type(plane: adsb_plane): string {
    return plane.t || <any>undefined;
  }

  // get_icon(plane: string): aircraft_icon | null {
  //   return this.adsb_planes[plane].icon || <any>undefined;
  // }

  get_lat(plane: adsb_plane): number {
    return plane.lat || 0;
  }

  get_lon(plane: adsb_plane): number {
    return plane.lon || 0;
  }

  get_message_by_id(id: undefined | string): undefined | plane[] {
    if (!id) return undefined;

    let output: undefined | plane[] = undefined;

    Object.values(this.planes).every((plane) => {
      if (plane.uid == id) {
        const found_plane = this.get_good_messages_by_plane(plane);
        if (found_plane.msgs.length > 0) {
          output = [plane];
        }
        return false;
      }
      return true;
    });

    return output;
  }

  get_all_messages(): plane[] {
    let output = [] as plane[];
    const num_planes = Number(get_setting("live_messages_page_num_items"));
    Object.values(this.planes).every((plane) => {
      if (plane.messages && plane.messages.length > 0) {
        // loop through all of the plane's messages to ensure we've got at least one good message
        // that isn't going to get caught in the filters

        const plane_messages = this.get_good_messages_by_plane(plane);
        if (plane_messages.msgs.length > 0) {
          // reset the selected tab if the selected tab wasn't found.
          if (!plane_messages.found_selected_id) {
            plane.selected_tab = plane_messages.msgs[0].uid;
            plane.manually_selected_tab = false;
          }
          let clone: plane = {} as plane;
          Object.assign(clone, plane);
          clone.messages = plane_messages.msgs;
          output.push(clone);
        }
      }
      if (output.length < num_planes) return true;
      return false;
    });

    return output;
  }

  get_good_messages_by_plane(plane: plane): {
    msgs: Array<acars_msg>;
    found_selected_id: boolean;
  } {
    let plane_messages: Array<acars_msg> = [];
    let found_selected_id = false;
    plane.messages.forEach((message) => {
      if (this.should_display_message(message)) {
        if (plane.selected_tab == message.uid) found_selected_id = true;
        plane_messages.push(message);
      }
    });

    return {
      msgs: plane_messages,
      found_selected_id: found_selected_id,
    };
  }

  getRandomInt(max: number): number {
    return Math.floor(Math.random() * Math.floor(max));
  }

  update_selected_tab(uid: string, direction: "left" | "right" = "left"): void {
    if (!uid) return;
    let index = this.match_plane_from_id(undefined, undefined, undefined, uid);

    if (index === undefined) return;

    this.planes[index].manually_selected_tab = true;
    // get current position of the current tab
    let current_tab_index = 0;

    this.planes[index].messages.every((message, msg_index) => {
      if (message.uid == this.planes[index!].selected_tab) {
        current_tab_index = msg_index;
        return false;
      }
      return true;
    });

    if (direction == "left") {
      // if we are at the first tab, go to the last tab
      if (current_tab_index == 0) {
        this.planes[index].selected_tab =
          this.planes[index].messages[
            this.planes[index].messages.length - 1
          ].uid;
      } else {
        this.planes[index].selected_tab =
          this.planes[index].messages[current_tab_index - 1].uid;
      }
    } else {
      // if we are at the last tab, go to the first tab
      if (current_tab_index == this.planes[index].messages.length - 1) {
        this.planes[index].selected_tab = this.planes[index].messages[0].uid;
      } else {
        this.planes[index].selected_tab =
          this.planes[index].messages[current_tab_index + 1].uid;
      }
    }
  }

  sound_alert() {
    this.alert_handler.sound_alert();
  }

  scan_for_new_alerts() {
    this.planes.forEach((plane, index) => {
      if (plane.messages) {
        this.planes[index].has_alerts = false;
        this.planes[index].num_alerts = 0;
        plane.messages.forEach((message, msg_index) => {
          const matched_terms = this.alert_handler.find_alerts(message);
          if (matched_terms && matched_terms.length > 0) {
            this.planes[index].messages[msg_index].matched = true;
            this.planes[index].messages[msg_index].matched_text = matched_terms;
            this.planes[index].has_alerts = true;
            this.planes[index].num_alerts += 1;
          } else {
            this.planes[index].messages[msg_index].matched = false;
            this.planes[index].messages[msg_index].matched_text = [];
          }
        });
      }
    });
  }
}
