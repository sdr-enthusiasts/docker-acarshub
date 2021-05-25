import showdown from "showdown";

let acars_path: string = "";
let acars_url: string = "";

let page_html: string = "";
let page_active = false;

export function about() {
  let converter: showdown.Converter = new showdown.Converter();
  fetch(`${acars_url}aboutmd`)
    .then((response) => response.text())
    .then((data) => {
      save_html(converter.makeHtml(data));
    });
  console.log(page_html);
  if (page_active) about_active(true);
}

function save_html(html: string) {
  page_html = html;
  about_active(page_active);
}

export function about_active(state = false) {
  page_active = state;
  if (page_active) {
    // page is active
    set_html();
    $("#log").html(page_html); // show the messages we've received
  }
}

export function set_about_page_urls(documentPath: string, documentUrl: string) {
  acars_path = documentPath;
  acars_url = documentUrl;
}

function set_html() {
  $("#right").html(
    `<div class="fixed_results">
</div>`
  );

  $("#page_name").html("");
  $("#log").html("");
}
