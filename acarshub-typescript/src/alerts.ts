import Cookies from "js-cookie";
import { display_messages } from "./html_generator.js";
import { alert_term_query, alert_text_update } from "./index.js";
import { html_msg, terms } from "./interfaces.js";
import jBox from "jbox";
import "jbox/dist/jBox.all.css";

declare const window: any;

let alerts: number = 0;
let alert_text: string[] = [];
let alert_callsigns: string[] = [];
let alert_tail: string[] = [];
let alert_icao: string[] = [];
let msgs_received: any[] = [];
let acars_path: string = "";
let acars_url: string = "";
let page_active: boolean = false;
let default_text_values: string[] = [
  "cop",
  "police",
  "authorities",
  "chop",
  "turbulence",
  "turb",
  "fault",
  "divert",
  "mask",
  "csr",
  "agent",
  "medical",
  "security",
  "mayday",
  "emergency",
  "pan",
  "red coat",
];

let alert_message_modal = new jBox("Modal", {
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
  onOpen: function () {
    show_modal_values();
  },
  //attach: '#settings_modal',
  title: "Alert Message Settings",
  content: `  <p><a href="javascript:toggle_playsound()" id="playsound_link" class="spread_text">Turn On Alert Sound</a></p>
  <span id="stat_menu">
    <label for="alert_text" class="menu_non_link">Text Field:</label><br />
    <textarea rows="2" id="alert_text"></textarea><br />
    <label for="alert_callsigns" class="menu_non_link">Callsign:</label><br />
    <textarea rows="2" id="alert_callsigns"></textarea><br />
    <label for="alert_tail" class="menu_non_link">Tail Number:</label><br />
    <textarea rows="2" id="alert_tail"></textarea><br />
    <label for="alert_icao" class="menu_non_link">ICAO Address:</label><br />
    <textarea rows="2" id="alert_icao"></textarea><br />
    <button type="submit" value="Submit" onclick="updateAlerts()">Update</button>
    <p><a href="javascript:default_alert_values()" class="spread_text">Default alert values</a></p>
  </span>`,
});

let alert_sound: HTMLAudioElement = new Audio(
  `${acars_url}static/sounds/alert.mp3`
);
let play_sound: boolean = false;

msgs_received.unshift = function () {
  if (this.length >= 50) {
    this.pop();
  }
  return Array.prototype.unshift.apply(this, arguments as any);
};

function show_modal_values() {
  show_sound();
  (<HTMLInputElement>document.getElementById("alert_text")).value = (<
    HTMLInputElement
  >document.getElementById("alert_text")).value = combineArray(
    alert_text
  ).toUpperCase();
  (<HTMLInputElement>document.getElementById("alert_callsigns")).value = (<
    HTMLInputElement
  >document.getElementById("alert_callsigns")).value = combineArray(
    alert_callsigns
  ).toUpperCase();
  (<HTMLInputElement>document.getElementById("alert_tail")).value = (<
    HTMLInputElement
  >document.getElementById("alert_tail")).value = combineArray(
    alert_tail
  ).toUpperCase();
  (<HTMLInputElement>document.getElementById("alert_icao")).value = (<
    HTMLInputElement
  >document.getElementById("alert_icao")).value = combineArray(
    alert_icao
  ).toUpperCase();
}

export function alert() {
  // Document on ready new syntax....or something. Passing a function directly to jquery
  // Update the cookies so the expiration date pushes out in to the future
  // Also sets all of the user saved prefs
  onInit();
  alert_term_query(alert_icao, alert_callsigns, alert_tail);
}

export function alerts_terms(msg: terms) {
  alert_text = msg.terms;
}

export function alerts_acars_message(msg: html_msg) {
  let matched = match_alert(msg, true);
  if (matched.was_found) {
    if (msg.loading != true) sound_alert();
    msg.msghtml.matched_text = matched.text !== null ? matched.text : [];
    msg.msghtml.matched_icao = matched.icao !== null ? matched.icao : [];
    msg.msghtml.matched_flight = matched.flight !== null ? matched.flight : [];
    msg.msghtml.matched_tail = matched.tail !== null ? matched.tail : [];
    msgs_received.unshift([msg.msghtml]);
    if (page_active) {
      $("#log").html(display_messages(msgs_received));
    } else if (matched.was_found && msg.loading != true) {
      alerts += 1;
      updateAlertCounter();
      sound_alert();
    }
  }
}

export function updateAlertCounter() {
  // if (alerts) $("#alert_count").html(` <span class="red">(${alerts})</span>`);
  // Cookies.set("alert_unread", String(alerts), { expires: 365 });
}

window.updateAlerts = function () {
  if (
    (<HTMLInputElement>document.getElementById("alert_text")).value.length > 0
  ) {
    let split = (<HTMLInputElement>(
      document.getElementById("alert_text")
    )).value.split(",");
    alert_text = [];
    for (let i = 0; i < split.length; i++) {
      if (
        split[i].trim().length > 0 &&
        !alert_text.includes(split[i].trim().toUpperCase())
      )
        alert_text.push(split[i].trim().toUpperCase());
    }
  } else {
    alert_text = [];
  }

  if (
    (<HTMLInputElement>document.getElementById("alert_callsigns")).value
      .length > 0
  ) {
    let split = (<HTMLInputElement>(
      document.getElementById("alert_callsigns")
    )).value.split(",");
    alert_callsigns = [];
    for (let i = 0; i < split.length; i++) {
      if (
        split[i].trim().length > 0 &&
        !alert_callsigns.includes(split[i].trim().toUpperCase())
      )
        alert_callsigns.push(split[i].trim().toUpperCase());
    }
  } else {
    alert_callsigns = [];
  }

  if (
    (<HTMLInputElement>document.getElementById("alert_tail")).value.length > 0
  ) {
    let split = (<HTMLInputElement>(
      document.getElementById("alert_tail")
    )).value.split(",");
    alert_tail = [];
    for (let i = 0; i < split.length; i++) {
      if (
        split[i].trim().length > 0 &&
        !alert_tail.includes(split[i].trim().toUpperCase())
      )
        alert_tail.push(split[i].trim().toUpperCase());
    }
  } else {
    alert_tail = [];
  }

  if (
    (<HTMLInputElement>document.getElementById("alert_icao")).value.length > 0
  ) {
    let split = (<HTMLInputElement>(
      document.getElementById("alert_icao")
    )).value.split(",");
    alert_icao = [];
    for (let i = 0; i < split.length; i++) {
      if (
        split[i].trim().length > 0 &&
        !alert_icao.includes(split[i].trim().toUpperCase())
      )
        alert_icao.push(split[i].trim().toUpperCase());
    }
  } else {
    alert_icao = [];
  }

  (<HTMLInputElement>document.getElementById("alert_text")).value = (<
    HTMLInputElement
  >document.getElementById("alert_text")).value = combineArray(
    alert_text
  ).toUpperCase();
  (<HTMLInputElement>document.getElementById("alert_callsigns")).value = (<
    HTMLInputElement
  >document.getElementById("alert_callsigns")).value = combineArray(
    alert_callsigns
  ).toUpperCase();
  (<HTMLInputElement>document.getElementById("alert_tail")).value = (<
    HTMLInputElement
  >document.getElementById("alert_tail")).value = combineArray(
    alert_tail
  ).toUpperCase();
  (<HTMLInputElement>document.getElementById("alert_icao")).value = (<
    HTMLInputElement
  >document.getElementById("alert_icao")).value = combineArray(
    alert_icao
  ).toUpperCase();

  alert_text_update(alert_text);

  // Cookies.set("alert_text", combineArray(alert_text), { expires: 365 });
  Cookies.set("alert_callsigns", combineArray(alert_callsigns), {
    expires: 365,
  });
  Cookies.set("alert_tail", combineArray(alert_tail), { expires: 365 });
  Cookies.set("alert_icao", combineArray(alert_icao), { expires: 365 });
};

function onInit() {
  alerts = Cookies.get("alert_unread")
    ? Number(Cookies.get("alert_unread"))
    : 0;
  play_sound = Cookies.get("play_sound") == "true" ? true : false;
  Cookies.set("play_sound", play_sound == true ? "true" : "false", {
    expires: 365,
  });

  // if (Cookies.get("alert_text") ? Cookies.get("alert_text") : "" > 0) {
  //   let split = Cookies.get("alert_text").split(",");
  //   for (let i = 0; i < split.length; i++) {
  //     if (
  //       split[i].trim().length > 0 &&
  //       !alert_text.includes(split[i].trim().toUpperCase())
  //     )
  //       alert_text.push(split[i].toUpperCase());
  //   }
  // } else {
  //   alert_text = [];
  // }

  if (
    Cookies.get("alert_callsigns") &&
    Cookies.get("alert_callsigns")!.length > 0
  ) {
    let split = Cookies.get("alert_callsigns")!.split(",");
    for (let i = 0; i < split.length; i++) {
      if (
        split[i].trim().length > 0 &&
        !alert_callsigns.includes(split[i].trim().toUpperCase())
      )
        alert_callsigns.push(split[i].toUpperCase());
    }
  } else {
    alert_callsigns = [];
  }

  if (Cookies.get("alert_tail") && Cookies.get("alert_tail")!.length > 0) {
    let split = Cookies.get("alert_tail")!.split(",");
    for (let i = 0; i < split.length; i++) {
      if (
        split[i].trim().length > 0 &&
        !alert_tail.includes(split[i].trim().toUpperCase())
      )
        alert_tail.push(split[i].toUpperCase());
    }
  } else {
    alert_tail = [];
  }

  if (Cookies.get("alert_icao") && Cookies.get("alert_icao")!.length > 0) {
    let split = Cookies.get("alert_icao")!.split(",");
    for (let i = 0; i < split.length; i++) {
      if (
        split[i].trim().length > 0 &&
        !alert_icao.includes(split[i].trim().toUpperCase())
      )
        alert_icao.push(split[i].toUpperCase());
    }
  } else {
    alert_icao = [];
  }

  // socket_alerts.emit(
  //   "update_alerts",
  //   {
  //     terms: alert_text,
  //   },
  //   "/alerts"
  // );

  // Cookies.set("alert_text", combineArray(alert_text), { expires: 365 });
  Cookies.set("alert_callsigns", combineArray(alert_callsigns), {
    expires: 365,
  });
  Cookies.set("alert_tail", combineArray(alert_tail), { expires: 365 });
  Cookies.set("alert_icao", combineArray(alert_icao), { expires: 365 });
}

function combineArray(input: string[]) {
  let output = "";

  for (let i = 0; i < input.length; i++) {
    output += `${i != 0 ? "," + input[i] : input[i]}`;
  }

  return output;
}

export function match_alert(msg: html_msg, show_alert: boolean = false) {
  let found = false;
  let matched_tail = [];
  let matched_flight = [];
  let matched_icao = [];
  let matched_text = [];
  let term_string: string = "";

  if (
    msg.msghtml.hasOwnProperty("text") &&
    typeof msg.msghtml.text !== "undefined"
  ) {
    for (let i = 0; i < alert_text.length; i++) {
      if (
        msg.msghtml.text
          .toUpperCase()
          .search(new RegExp("\\b" + alert_text[i].toUpperCase() + "\\b")) != -1
      ) {
        found = true;
        matched_text.push(alert_text[i]);
        term_string =
          term_string.length > 0 ? ", " + alert_text[i] : alert_text[i];
      }
    }
  }

  if (
    msg.msghtml.hasOwnProperty("flight") &&
    typeof msg.msghtml.flight !== "undefined"
  ) {
    for (let i = 0; i < alert_callsigns.length; i++) {
      if (
        msg.msghtml.flight
          .toUpperCase()
          .includes(alert_callsigns[i].toUpperCase())
      ) {
        found = true;
        matched_flight.push(alert_callsigns[i]);
        term_string =
          term_string.length > 0
            ? ", " + alert_callsigns[i]
            : alert_callsigns[i];
      }
    }
  }

  if (
    msg.msghtml.hasOwnProperty("tail") &&
    typeof msg.msghtml.tail !== "undefined"
  ) {
    for (let i = 0; i < alert_tail.length; i++) {
      if (
        msg.msghtml.tail.toUpperCase().includes(alert_tail[i].toUpperCase())
      ) {
        found = true;
        matched_tail.push(alert_tail[i]);
        term_string =
          term_string.length > 0 ? ", " + alert_tail[i] : alert_tail[i];
      }
    }
  }

  if (
    msg.msghtml.hasOwnProperty("icao") &&
    typeof msg.msghtml.icao !== "undefined"
  ) {
    for (let i = 0; i < alert_icao.length; i++) {
      if (
        msg.msghtml.icao
          .toString()
          .toUpperCase()
          .includes(alert_icao[i].toUpperCase()) ||
        (msg.msghtml.hasOwnProperty("icao_hex") &&
          typeof msg.msghtml.icao_hex !== "undefined" &&
          msg.msghtml.icao_hex
            .toUpperCase()
            .includes(alert_icao[i].toUpperCase()))
      ) {
        found = true;
        matched_icao.push(alert_icao[i]);
        term_string =
          term_string.length > 0 ? ", " + alert_icao[i] : alert_icao[i];
      }
    }
  }

  if (
    show_alert &&
    found &&
    (typeof msg.loading === "undefined" || !msg.loading)
  ) {
    const msg_text: string =
      "A new message matched with the following term(s): " + term_string;
    new jBox("Notice", {
      attributes: {
        x: "right",
        y: "bottom",
      },
      stack: true,
      delayOnHover: true,
      showCountdown: true,
      animation: {
        open: "zoomIn",
        close: "zoomIn",
      },
      content: msg_text,
      color: "green",
    });
  }

  return {
    was_found: found,
    text: matched_text.length > 0 ? matched_text : null,
    icao: matched_icao.length > 0 ? matched_icao : null,
    flight: matched_flight.length > 0 ? matched_flight : null,
    tail: matched_tail.length > 0 ? matched_tail : null,
  };
}

window.default_alert_values = function () {
  let current = (<HTMLInputElement>document.getElementById("alert_text")).value;

  default_text_values.forEach((element) => {
    if (!alert_text.includes(element.toUpperCase())) {
      current += `${current.length > 0 ? "," + element : element}`;
    }
  });
  (<HTMLInputElement>document.getElementById("alert_text")).value = current;
  window.updateAlerts();
};

function show_sound() {
  if (play_sound) {
    let id = document.getElementById("playsound_link");
    if (id !== null) {
      id.innerHTML = "";
      let txt = document.createTextNode("Turn Off Alert Sound");
      id.appendChild(txt);
    }
  } else {
    let id = document.getElementById("playsound_link");
    if (id !== null) {
      id.innerHTML = "";
      let txt = document.createTextNode("Turn On Alert Sound");
      id.appendChild(txt);
    }
  }
}

window.toggle_playsound = function (loading = false) {
  if (play_sound) {
    let id = document.getElementById("playsound_link");
    if (id !== null) {
      id.innerHTML = "";
      let txt = document.createTextNode("Turn On Alert Sound");
      id.appendChild(txt);
    }
  } else {
    let id = document.getElementById("playsound_link");
    if (id !== null) {
      id.innerHTML = "";
      let txt = document.createTextNode("Turn Off Alert Sound");
      id.appendChild(txt);
    }
  }
  play_sound = !play_sound;
  Cookies.set("play_sound", play_sound == true ? "true" : "false", {
    expires: 365,
  });

  if (!loading) sound_alert();
};

export async function sound_alert() {
  if (play_sound) {
    try {
      await alert_sound.play();
    } catch (err) {
      console.log(err);
    }
  }
}

export function alert_active(state = false) {
  page_active = state;

  if (page_active) {
    // page is active
    set_html();
    Cookies.set("alert_unread", "0", { expires: 365 });

    // temporarily toggle the play_sound variable so we can set the UI correctly
    play_sound = !play_sound;
    window.toggle_playsound(true);

    // (<HTMLInputElement>document.getElementById("alert_callsigns")).value =
    //   Cookies.get("alert_callsigns") || "";
    // (<HTMLInputElement>document.getElementById("alert_tail")).value =
    //   Cookies.get("alert_tail") || "";
    // (<HTMLInputElement>document.getElementById("alert_icao")).value =
    //   Cookies.get("alert_icao") || "";
    // (<HTMLInputElement>document.getElementById("alert_text")).value = (<
    //   HTMLInputElement
    // >document.getElementById("alert_text")).value = combineArray(
    //   alert_text
    // ).toUpperCase();
    $("#log").html(display_messages(msgs_received));
  }
}

export function set_alert_page_urls(documentPath: string, documentUrl: string) {
  acars_path = documentPath;
  acars_url = documentUrl;
}

function set_html() {
  $("#modal_text").html(
    '<a href="javascript:show_alert_message_modal()">Page Settings</a>'
  );
  $("#page_name").html("");
  $("#log").html("");
}

window.show_alert_message_modal = function () {
  alert_message_modal.open();
};
