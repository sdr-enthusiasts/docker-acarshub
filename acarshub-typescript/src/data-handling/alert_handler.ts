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

import { get_alerts, get_setting } from "../acarshub";
import { acars_msg } from "src/interfaces";

export class AlertHandler {
  alert_sound: HTMLAudioElement | undefined;
  constructor(acarshub_url: string) {
    this.alert_sound = new Audio(`${acarshub_url}static/sounds/alert.mp3`);
  }

  async sound_alert(): Promise<void> {
    if (get_setting("alerts_play_sound")) {
      try {
        if (this.alert_sound) {
          await this.alert_sound.play();
        }
      } catch (err) {
        console.error(err);
      }
    }
  }

  find_alerts(acars_message: acars_msg): Array<string> {
    const current_terms = get_alerts();
    if (!acars_message) {
      console.error("Blank Message. Skipping alert matching");
      return [];
    }

    if (!current_terms) {
      console.error("No Alert Terms. Skipping alert matching");
      return [];
    }

    if (acars_message.text) {
      // first make sure we shouldn't ignore this

      const should_not_ignore = current_terms.ignore.every((term) => {
        // TODO: fix TS !
        return (
          acars_message
            .text!.toUpperCase()
            .search(new RegExp("\\b" + term.toUpperCase() + "\\b")) == -1
        );
      });

      if (should_not_ignore) {
        let matches: Array<string> = [];

        current_terms.text_terms.forEach((term) => {
          // TODO: fix TS !
          if (
            acars_message
              .text!.toUpperCase()
              .search(new RegExp("\\b" + term.toUpperCase() + "\\b")) != -1
          ) {
            matches.push(term);
          }
        });

        return matches;
      }
    }
    return [];
  }
}
