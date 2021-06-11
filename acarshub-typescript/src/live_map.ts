import * as L from "leaflet";
import { acars_msg, adsb_plane } from "./interfaces";
import { find_matches, get_match } from "./live_messages.js";
import jBox from "jbox";
import { display_messages } from "./html_generator.js";

let livemap_acars_path: string = "";
let livemap_acars_url: string = "";

let live_map_page_active: boolean = false;
let adsb_planes: adsb_plane[];
let map: L.Map;
let layerGroup: L.LayerGroup;
declare const window: any;

const airplane_icon = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 1000 1000" enable-background="new 0 0 1000 1000" xml:space="preserve">
<metadata> Svg Vector Icons : http://www.onlinewebfonts.com/icon </metadata>
<g><path d="M552.5,614.1c0.8-14.1,16.9-9.2,16.9-9.2L696,630.7l261.3,99.4c0-49-7.8-54.1-19.2-62.7L565.3,400c0,0-10-122.5-10-230.5c0-50-24.1-159.5-55.3-159.5c-31.2,0-55.3,111.1-55.3,159.5c0,102.5-10,230.5-10,230.5L61.9,667.4c-14.5,10.2-19.2,15.7-19.2,62.7L304,630.7l126.4-25.7c0,0,16.1-4.9,16.9,9.2c0.8,14.1-2.5,141.1,12,208.5c1.8,9-5.1,9.6-9.8,15.1l-106,67c-3.5,3.9-5.1,14.9-5.1,14.9l-2,37.8l138.8-32.7l24.5,65.3l24.5-65.3l138.8,32.7l-2-37.8c0.2,0-1.4-11-4.9-14.9l-106-67c-4.7-5.5-11.6-6.1-9.8-15.1C554.5,755.2,551.7,628.2,552.5,614.1z"/></g>
</svg>`;

const airplane_matched_icon = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generator: Adobe Illustrator 18.1.1, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg version="1.1" id="_x31_0" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 512 512" style="enable-background:new 0 0 512 512;" xml:space="preserve">
<style type="text/css">
	.st0{fill:#00000;}
</style>
<g>
	<path class="st0" d="M256,0C114.614,0,0,114.614,0,256s114.614,256,256,256s256-114.614,256-256S397.386,0,256,0z M413.766,295.718
		l-0.043,7.11l-104.542-28.77l-25.555-7.074v0.043l-0.16-0.046l-2.672,107.129l24.41,8.168c3.426,1.148,5.734,4.355,5.734,7.965
		v15.402c0,0.703-0.09,1.374-0.246,2.019c-0.008,0.027-0.011,0.054-0.019,0.082c-0.84,3.285-3.594,5.691-6.836,6.203h-0.004
		c-1.301,0.202-2.68,0.101-4.043-0.371l-41.038-14.223c-1.782-0.617-3.719-0.617-5.5,0l-41.039,14.223
		c-5.458,1.89-11.153-2.161-11.153-7.934v-15.402c0-3.61,2.309-6.817,5.734-7.965l24.41-8.168l-2.153-86.238l-0.48-20.734
		l-0.035,0.008l-0.004-0.164l-102.707,28.266l-27.59,7.55v-33.82l39.652-20.836v-31.324c0-4.52,3.699-8.215,8.219-8.215
		c4.519,0,8.218,3.695,8.218,8.215v15.363l-0.074,7.183l0.074-0.039v0.184l21.84-11.477v-30.969c0-4.519,3.699-8.218,8.219-8.218
		c4.519,0,8.218,3.699,8.218,8.218v15.118l-0.078,7.074l0.078-0.038v0.179l34.293-18.015l-1.809-72.516
		c0-17.004,13.91-30.914,30.914-30.914c17,0,30.914,13.91,30.914,30.914l-1.813,72.516l23.34,12.262l10.793,5.754v-0.082
		l0.164,0.082v-22.332c0-4.519,3.695-8.218,8.218-8.218c4.52,0,8.215,3.699,8.215,8.218v30.969l14.832,7.793l6.852,3.684v-0.086
		l0.16,0.086v-22.691c0-4.52,3.699-8.215,8.218-8.215c4.52,0,8.215,3.695,8.215,8.215v31.324l39.656,20.836V295.718z"/>
</g>
</svg>`;

let plane_message_modal = new jBox("Modal", {
  id: "set_modal",
  width: 350,
  height: 400,
  blockScroll: false,
  isolateScroll: true,
  animation: "zoomIn",
  // draggable: 'title',
  closeButton: "title",
  overlay: true,
  reposition: false,
  repositionOnOpen: true,
  // onOpen: function () {
  //   update_size();
  // },
  //attach: '#settings_modal',
  title: "Messages",
  content: `<div class="img_box"><img src="${livemap_acars_url}static/images/acarshubsquare.png" class="banner_img" alt="ACARS Hub Logo"></div>`,
});

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
          html: `<div style="fill: hsl(${hsl[0]}, ${hsl[1]}%, ${
            hsl[2]
          }%); -webkit-transform:rotate(${rotate}deg); -moz-transform: rotate(${rotate}deg); -ms-transform: rotate(${rotate}deg); -o-transform: rotate(${rotate}deg); transform: rotate(${rotate}deg);">${
            matched_with_acars ? airplane_matched_icon : airplane_icon
          }</div>`,
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

        if (matched_with_acars) {
          plane_marker.on("click", function (e) {
            window.showPlaneMessages(callsign);
          });
        }
      }
    }
  }
}

window.showPlaneMessages = function (plane_id: string = "") {
  if (plane_id === "") return;
  const matches: acars_msg[] = get_match(plane_id);
  console.log("matches", matches.length);
  if (matches.length === 0) return;
  const html = display_messages([matches], "", true);
  console.log(html);
  plane_message_modal.setContent(html);
  plane_message_modal.setTitle(`Messages for ${plane_id}`);
  plane_message_modal.open();
};

export function live_map_active(state = false) {
  live_map_page_active = state;
  if (live_map_page_active) {
    set_html();
    map = L.map("mapid").setView([35.18808, -106.56953], 8);

    L.tileLayer("http://{s}.tile.osm.org/{z}/{x}/{y}.png", {
      detectRetina: true,
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
