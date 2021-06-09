import leaflet from "leaflet";

let livemap_acars_path: string = "";
let livemap_acars_url: string = "";

let live_map_page_active: boolean = false;

export function live_map() {
  console.log("live map");
}

export function live_map_active(state = false) {
  live_map_page_active = state;
  console.log(state);
  if (live_map_page_active) {
    set_html();
    // @ts-expect-error
    var map = L.map("mapid").setView([51.505, -0.09], 13);

    // @ts-expect-error
    L.tileLayer("http://{s}.tile.osm.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
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
  $("#modal_text").html("");
  $("#page_name").html("");
  $("#log").html('<div id="mapid"></div>');
}
