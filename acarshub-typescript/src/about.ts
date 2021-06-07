import showdown from "showdown";

let about_acars_path: string = "";
let about_acars_url: string = "";

let page_html: string = "";
let about_page_active = false;

export function about() {
  let converter: showdown.Converter = new showdown.Converter();
  fetch(`${about_acars_url}aboutmd`)
    .then((response) => response.text())
    .then((data) => {
      save_html(converter.makeHtml(data));
    });
  if (about_page_active) about_active(true);
}

function save_html(html: string) {
  page_html = html;
  about_active(about_page_active);
}

export function about_active(state = false) {
  about_page_active = state;
  if (about_page_active) {
    // page is active
    set_html();
    $("#log").html(page_html); // show the messages we've received
  }
}

export function set_about_page_urls(documentPath: string, documentUrl: string) {
  about_acars_path = documentPath;
  about_acars_url = documentUrl;
}

function set_html() {
  $("#right").html(
    `<div class="fixed_results">
</div>`
  );

  $("#modal_text").html("");
  $("#page_name").html("");
  $("#log").html("");
}
