import showdown from "showdown";
// @ts-expect-error
import * as helpfile from "./helppage.MD";
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
