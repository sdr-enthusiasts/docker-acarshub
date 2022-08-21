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
  page_active = false;
  should_update_title_bar: boolean = true;
  constructor(name: string = "", update_title_bar: boolean = true) {
    if (!name) {
      console.error("You need to define a name!");
      return;
    }

    this.name = name;
    this.should_update_title_bar = update_title_bar;
  }

  is_active(): boolean {
    return this.page_active;
  }

  update_title_bar(): void {
    if (this.should_update_title_bar)
      $(document).attr("title", `ACARS Hub: ${this.name}`);
  }

  update_page(): void {
    console.log(`Updating ${this.name} page`);
  }

  set_page_inactive(): void {
    this.page_active = false;
    console.log(`Setting ${this.name} page inactive`);
  }

  set_page_active(): void {
    this.page_active = true;
    console.log(`Setting ${this.name} page active`);
  }
}
