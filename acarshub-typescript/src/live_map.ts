let livemap_acars_path: string = "";
let livemap_acars_url: string = "";

let live_map_page_active: boolean = false;

export function live_map() {
  console.log("live map");
}

export function live_map_active(state = false) {
  live_map_page_active = state;

  if (live_map_page_active) {
    set_html();
  }
}

export function set_live_map_page_urls(
  documentPath: string,
  documentUrl: string
) {
  livemap_acars_path = documentPath;
  livemap_acars_url = documentUrl;
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
