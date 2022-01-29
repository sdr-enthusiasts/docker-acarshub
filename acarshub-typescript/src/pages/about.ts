// Copyright (C) 2022 Frederick Clausen II
// This file is part of acarshub <https://github.com/fredclausen/docker-acarshub>.

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
export let about = {
  about_acars_path: "" as string,
  about_acars_url: "" as string,

  page_html: "" as string,
  about_page_active: false as boolean,

  about: function (): void {
    let converter: showdown.Converter = new showdown.Converter();
    fetch(helpfile)
      .then((response) => response.text())
      .then((data) => {
        this.save_html(converter.makeHtml(data));
      });
    if (this.about_page_active) this.about_active(true);
  },

  save_html: function (html: string): void {
    this.page_html = html;
    this.about_active(this.about_page_active);
  },

  about_active: function (state = false): void {
    this.about_page_active = state;
    if (this.about_page_active) {
      // page is active
      this.set_html();
      $("#log").html(this.page_html); // show the messages we've received
    }
  },

  set_about_page_urls: function (
    documentPath: string,
    documentUrl: string
  ): void {
    this.about_acars_path = documentPath;
    this.about_acars_url = documentUrl;
  },

  set_html: function (): void {
    $("#right").html(
      `<div class="fixed_results">
  </div>`
    );

    $("#modal_text").html("");
    $("#page_name").html("");
    $("#log").html("");
  },
};
