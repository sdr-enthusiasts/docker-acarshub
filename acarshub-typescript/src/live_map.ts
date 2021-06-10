import * as L from "leaflet";
import { adsb_plane } from "./interfaces";
import { find_matches } from "./live_messages.js";

let livemap_acars_path: string = "";
let livemap_acars_url: string = "";

let live_map_page_active: boolean = false;
let adsb_planes: adsb_plane[];
let map: L.Map;
let layerGroup: L.LayerGroup;
const airplane_icon = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 1000 1000" enable-background="new 0 0 1000 1000" xml:space="preserve">
<metadata> Svg Vector Icons : http://www.onlinewebfonts.com/icon </metadata>
<g><path d="M552.5,614.1c0.8-14.1,16.9-9.2,16.9-9.2L696,630.7l261.3,99.4c0-49-7.8-54.1-19.2-62.7L565.3,400c0,0-10-122.5-10-230.5c0-50-24.1-159.5-55.3-159.5c-31.2,0-55.3,111.1-55.3,159.5c0,102.5-10,230.5-10,230.5L61.9,667.4c-14.5,10.2-19.2,15.7-19.2,62.7L304,630.7l126.4-25.7c0,0,16.1-4.9,16.9,9.2c0.8,14.1-2.5,141.1,12,208.5c1.8,9-5.1,9.6-9.8,15.1l-106,67c-3.5,3.9-5.1,14.9-5.1,14.9l-2,37.8l138.8-32.7l24.5,65.3l24.5-65.3l138.8,32.7l-2-37.8c0.2,0-1.4-11-4.9-14.9l-106-67c-4.7-5.5-11.6-6.1-9.8-15.1C554.5,755.2,551.7,628.2,552.5,614.1z"/></g>
</svg>`;
const darkerColors = false;

// thanks to wiedehopf/tar1090 for the color to altitude code
const ColorByAlt = {
  // HSL for planes with unknown altitude:
  unknown: { h: 0, s: 0, l: 20 },

  // HSL for planes that are on the ground:
  ground: { h: 220, s: 0, l: 30 },

  air: {
    // These define altitude-to-hue mappings
    // at particular altitudes; the hue
    // for intermediate altitudes that lie
    // between the provided altitudes is linearly
    // interpolated.
    //
    // Mappings must be provided in increasing
    // order of altitude.
    //
    // Altitudes below the first entry use the
    // hue of the first entry; altitudes above
    // the last entry use the hue of the last
    // entry.
    h: [
      { alt: 0, val: 20 }, // orange
      { alt: 2000, val: 32.5 }, // yellow
      { alt: 4000, val: 43 }, // yellow
      { alt: 6000, val: 54 }, // yellow
      { alt: 8000, val: 72 }, // yellow
      { alt: 9000, val: 85 }, // green yellow
      { alt: 11000, val: 140 }, // light green
      { alt: 40000, val: 300 }, // magenta
      { alt: 51000, val: 360 }, // red
    ],
    s: 88,
    l: [
      { h: 0, val: 53 },
      { h: 20, val: 50 },
      { h: 32, val: 54 },
      { h: 40, val: 52 },
      { h: 46, val: 51 },
      { h: 50, val: 46 },
      { h: 60, val: 43 },
      { h: 80, val: 41 },
      { h: 100, val: 41 },
      { h: 120, val: 41 },
      { h: 140, val: 41 },
      { h: 160, val: 40 },
      { h: 180, val: 40 },
      { h: 190, val: 44 },
      { h: 198, val: 50 },
      { h: 200, val: 58 },
      { h: 220, val: 58 },
      { h: 240, val: 58 },
      { h: 255, val: 55 },
      { h: 266, val: 55 },
      { h: 270, val: 58 },
      { h: 280, val: 58 },
      { h: 290, val: 47 },
      { h: 300, val: 43 },
      { h: 310, val: 48 },
      { h: 320, val: 48 },
      { h: 340, val: 52 },
      { h: 360, val: 53 },
    ],
  },

  // Changes added to the color of the currently selected plane
  selected: { h: 0, s: 10, l: 5 },

  // Changes added to the color of planes that have stale position info
  stale: { h: 0, s: -35, l: 9 },

  // Changes added to the color of planes that have positions from mlat
  mlat: { h: 0, s: 0, l: 0 },
};

function altitudeColor(altitude: any) {
  let h, s, l;

  if (altitude == null) {
    h = ColorByAlt.unknown.h;
    s = ColorByAlt.unknown.s;
    l = ColorByAlt.unknown.l;
  } else if (altitude === "ground") {
    h = ColorByAlt.ground.h;
    s = ColorByAlt.ground.s;
    l = ColorByAlt.ground.l;
  } else {
    s = ColorByAlt.air.s;

    // find the pair of points the current altitude lies between,
    // and interpolate the hue between those points
    let hpoints = ColorByAlt.air.h;
    h = hpoints[0].val;
    for (let i = hpoints.length - 1; i >= 0; --i) {
      if (altitude > hpoints[i].alt) {
        if (i == hpoints.length - 1) {
          h = hpoints[i].val;
        } else {
          h =
            hpoints[i].val +
            ((hpoints[i + 1].val - hpoints[i].val) *
              (altitude - hpoints[i].alt)) /
              (hpoints[i + 1].alt - hpoints[i].alt);
        }
        break;
      }
    }
    let lpoints = ColorByAlt.air.l;
    // @ts-expect-error
    lpoints = lpoints.length ? lpoints : [{ h: 0, val: lpoints }];
    l = lpoints[0].val;
    for (let i = lpoints.length - 1; i >= 0; --i) {
      if (h > lpoints[i].h) {
        if (i == lpoints.length - 1) {
          l = lpoints[i].val;
        } else {
          l =
            lpoints[i].val +
            ((lpoints[i + 1].val - lpoints[i].val) * (h - lpoints[i].h)) /
              (lpoints[i + 1].h - lpoints[i].h);
        }
        break;
      }
    }
  }
  if (darkerColors) {
    l *= 0.8;
    s *= 0.7;
  }

  if (h < 0) {
    h = (h % 360) + 360;
  } else if (h >= 360) {
    h = h % 360;
  }

  if (s < 0) s = 0;
  else if (s > 95) s = 95;

  if (l < 0) l = 0;
  else if (l > 95) l = 95;

  return [h, s, l];
}

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
    const plane_data = find_matches();
    const plane_icaos = plane_data.hex;
    const plane_callsign = plane_data.callsigns;
    const plane_tails = plane_data.tail;

    for (let plane in adsb_planes) {
      if (adsb_planes[plane].lat !== null && adsb_planes[plane].lon !== null) {
        let callsign = adsb_planes[plane].call || plane;
        let matched_with_acars = false;
        callsign = callsign.replace(/_+/g, "");
        let rotate = adsb_planes[plane].trk || 0;
        let alt = adsb_planes[plane].alt || 0;
        let hsl = altitudeColor(adsb_planes[plane].alt);
        for (let i = 0; i < plane_icaos.length; i++) {
          if (plane_icaos[i] == plane) {
            matched_with_acars = true;
            i = plane_icaos.length;
          }
        }
        for (let j = 0; j < plane_callsign.length; j++) {
          if (plane_callsign[j] == callsign) {
            matched_with_acars = true;
            j = plane_callsign.length;
          }
        }
        for (let u = 0; u < plane_tails.length; u++) {
          if (plane_tails[u] == callsign) {
            matched_with_acars = true;
            u = plane_tails.length;
          }
        }
        let plane_icon = L.divIcon({
          className: "airplane",
          html: `<div style="fill: hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%); -webkit-transform:rotate(${rotate}deg); -moz-transform: rotate(${rotate}deg); -ms-transform: rotate(${rotate}deg); -o-transform: rotate(${rotate}deg); transform: rotate(${rotate}deg);">${airplane_icon}</div>`,
          iconSize: [30, 30],
        });
        let plane_marker = L.marker(
          [adsb_planes[plane].lat, adsb_planes[plane].lon],
          {
            icon: plane_icon,
            riseOnHover: true,
          }
        );
        plane_marker.bindTooltip(
          `<div style='background:white; padding:1px 3px 1px 3px'>${callsign}<br>Altitude: ${alt}ft<br>Heading: ${Math.round(
            rotate
          )}&deg;</div>`,
          { className: "popup" }
        );
        plane_marker.addTo(layerGroup);
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
