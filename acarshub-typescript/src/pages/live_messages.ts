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
    this.page_active = true;
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
    this.page_active = false;

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
