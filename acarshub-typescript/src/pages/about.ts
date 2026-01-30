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

import showdown from "showdown";
import helpfile from "./helppage.MD";
import { ACARSHubPage } from "./master";

export class AboutPage extends ACARSHubPage {
  constructor() {
    super();

    const converter: showdown.Converter = new showdown.Converter();
    fetch(helpfile)
      .then((response) => response.text())
      .then((data) => {
        this.save_html(converter.makeHtml(data));
      });
    if (this.page_active) this.active(true);
  }

  save_html(html: string): void {
    this.page_html = html;
    this.active(this.page_active);
  }

  active(state = false): void {
    super.active(state);

    if (this.page_active) {
      // page is active
      this.set_html();
      $("#log").html(this.page_html); // show the messages we've received
    }
  }

  set_html(): void {
    $("#right").html(
      `<div class="fixed_results">
  </div>`,
    );

    $("#modal_text").html(
      '<a href="javascript:show_page_modal()">Settings</a>',
    );
    $("#log").html("");
  }
}
