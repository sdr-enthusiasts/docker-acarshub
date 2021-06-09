import * as L from "leaflet";
import { adsb_plane } from "./interfaces";

let livemap_acars_path: string = "";
let livemap_acars_url: string = "";

let live_map_page_active: boolean = false;
let adsb_planes: adsb_plane[];
let map: L.Map;
let layerGroup: L.LayerGroup;

export function set_targets(adsb_targets: adsb_plane[]) {
  adsb_planes = adsb_targets;
  if (live_map_page_active) update_targets();
}

export function live_map() {
  console.log("live map");
}

function update_targets() {
  if (typeof map !== "undefined") {
    // clear old planes
    layerGroup.clearLayers();

    for (let plane in adsb_planes) {
      if (adsb_planes[plane].lat !== null && adsb_planes[plane].lon !== null) {
        let callsign = adsb_planes[plane].call || "ICAO Hex: " + plane;
        L.marker([adsb_planes[plane].lat, adsb_planes[plane].lon], {
          title: callsign.replace(/_+/g, ""),
        }).addTo(layerGroup);
      }
    }
  }
}

export function live_map_active(state = false) {
  live_map_page_active = state;
  console.log(state);
  if (live_map_page_active) {
    set_html();
    map = L.map("mapid").setView([35.18808, -106.56953], 13);

    L.tileLayer("http://{s}.tile.osm.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    layerGroup = L.layerGroup().addTo(map);
  }

  update_targets();
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
