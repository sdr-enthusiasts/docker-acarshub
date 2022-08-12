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

export class Page {
  name: string = "";
  content_area = "#acarshub_content";
  constructor(name: string = "") {
    if (!name) {
      console.error("You need to define a name!");
      return;
    }

    this.name = name;
  }

  update_title_bar() {
    $(document).attr("title", `ACARS Hub: ${this.name}`);
  }

  update_page() {
    console.log(`Updating ${this.name} page`);
  }

  set_page_inactive() {
    console.log(`Setting ${this.name} page inactive`);
  }

  set_page_active() {
    console.log(`Setting ${this.name} page active`);
  }
}
