import Cookies from "js-cookie"
import { generate_menu, generate_footer } from "./menu.js";
import { display_messages } from "./html_generator.js";

let socket_alerts: SocketIOClient.Socket;
let alerts = 0;
let alert_text: string[] = [];
let alert_callsigns: string[] = [];
let alert_tail:string[] = [];
let alert_icao:string[] = [];
let msgs_received:any[] = [];
let acars_path = document.location.pathname.replace(
  /about|search|stats|status|alerts/gi,
  ""
);
acars_path += acars_path.endsWith("/") ? "" : "/";
let acars_url = document.location.origin + acars_path;
let acars_page = "/" + document.location.pathname.replace(acars_path, "");
let default_text_values = [
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

let alert_sound = new Audio(`${acars_url}static/sounds/alert.mp3`);
let play_sound = false;

msgs_received.unshift = function () {
  if (this.length >= 50) {
    this.pop();
  }
  return Array.prototype.unshift.apply(this, arguments as any);
};

$(document).ready(function () {
  socket_alerts = io.connect(`${document.location.origin}/alerts`, {
    path: acars_path + "socket.io",
  });

  socket_alerts.on("terms", function (msg: any) {
    alert_text = msg.terms;
    if (acars_page == "/alerts") {
      (<HTMLInputElement>document.getElementById("alert_text")).value = (<HTMLInputElement>document.getElementById(
        "alert_text"
      )).value = combineArray(alert_text).toUpperCase();
    }
  });

  // Update the cookies so the expiration date pushes out in to the future
  // Also sets all of the user saved prefs
  onInit();

  if (acars_page == "/alerts") {
    generate_menu();
    generate_footer();
    Cookies.set("alert_unread", "0", { expires: 365 });

    // temporarily toggle the play_sound letiable so we can set the UI correctly
    play_sound = play_sound ? false : true;
    toggle_playsound(true);

    // Set the text areas to the values saved in the cookies
    // document.getElementById("alert_text").value = Cookies.get("alert_text")
    //   ? Cookies.get("alert_text")
    //   : "";
    (<HTMLInputElement>document.getElementById("alert_callsigns")).value = Cookies.get(
      "alert_callsigns"
    ) ||  "";
      (<HTMLInputElement>document.getElementById("alert_tail")).value = Cookies.get("alert_tail")
      ||  "";
      (<HTMLInputElement>document.getElementById("alert_icao")).value = Cookies.get("alert_icao")
      || "";

    socket_alerts.emit(
      "query",
      {
        icao: alert_icao.length > 0 ? alert_icao : null,
        //text: alert_text.length > 0 ? alert_text : null,
        flight: alert_callsigns.length > 0 ? alert_callsigns : null,
        tail: alert_tail.length > 0 ? alert_tail : null,
      },
      "/alerts"
    );
    socket_alerts.on("newmsg", function (msg: any) {
      let matched = match_alert(msg);
      if (matched.was_found) {
        if (msg.loading != true) sound_alert();
        msg.msghtml.matched_text = matched.text;
        msg.msghtml.matched_icao = matched.icao;
        msg.msghtml.matched_flight = matched.flight;
        msg.msghtml.matched_tail = matched.tail;
        msgs_received.unshift([msg.msghtml]);
        $("#log").html(display_messages(msgs_received));
      }
    });

    socket_alerts.on("system_status", function (msg: any) {
      if (msg.status.error_state == true) {
        $("#system_status").html(
          `<a href="${acars_url}status">System Status: <span class="red_body">Error</span>`
        );
      } else {
        $("#system_status").html(
          `<a href="${acars_url}status">System Status: <span class="green">Okay</a></span>`
        );
      }
    });

    socket_alerts.on("disconnect", function () {
      connection_status();
    });

    socket_alerts.on("connect_error", function () {
      connection_status();
    });

    socket_alerts.on("connect_timeout", function () {
      connection_status();
    });

    socket_alerts.on("connect", function () {
      connection_status(true);
    });

    socket_alerts.on("reconnect", function () {
      connection_status(true);
    });
  } else if (acars_page != "/") {
    socket_alerts.on("newmsg", function (msg: any) {
      let matched = match_alert(msg);
      if (matched.was_found && msg.loading != true) {
        alerts += 1;
        updateAlertCounter();
        sound_alert();
      }
    });
  } else {
    Cookies.set("alert_unread", "0", { expires: 365 });
  }
});

export function updateAlertCounter() {
  if (alerts) $("#alert_count").html(` <span class="red">(${alerts})</span>`);
  Cookies.set("alert_unread", String(alerts), { expires: 365 });
}

function updateAlerts() {
  if ((<HTMLInputElement>document.getElementById("alert_text")).value.length > 0) {
    let split = (<HTMLInputElement>document.getElementById("alert_text")).value.split(",");
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

  if ((<HTMLInputElement>document.getElementById("alert_callsigns")).value.length > 0) {
    let split = (<HTMLInputElement>document.getElementById("alert_callsigns")).value.split(",");
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

  if ((<HTMLInputElement>document.getElementById("alert_tail")).value.length > 0) {
    let split = (<HTMLInputElement>document.getElementById("alert_tail")).value.split(",");
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

  if ((<HTMLInputElement>document.getElementById("alert_icao")).value.length > 0) {
    let split = (<HTMLInputElement>document.getElementById("alert_icao")).value.split(",");
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

  (<HTMLInputElement>document.getElementById("alert_text")).value = (<HTMLInputElement>document.getElementById(
    "alert_text"
  )).value = combineArray(alert_text).toUpperCase();
  (<HTMLInputElement>document.getElementById("alert_callsigns")).value = (<HTMLInputElement>document.getElementById(
    "alert_callsigns"
  )).value = combineArray(alert_callsigns).toUpperCase();
  (<HTMLInputElement>document.getElementById("alert_tail")).value = (<HTMLInputElement>document.getElementById(
    "alert_tail"
  )).value = combineArray(alert_tail).toUpperCase();
  (<HTMLInputElement>document.getElementById("alert_icao")).value = (<HTMLInputElement>document.getElementById(
    "alert_icao"
  )).value = combineArray(alert_icao).toUpperCase();

  socket_alerts.emit(
    "update_alerts",
    {
      terms: alert_text,
    },
    "/alerts"
  );

  // Cookies.set("alert_text", combineArray(alert_text), { expires: 365 });
  Cookies.set("alert_callsigns", combineArray(alert_callsigns), {
    expires: 365,
  });
  Cookies.set("alert_tail", combineArray(alert_tail), { expires: 365 });
  Cookies.set("alert_icao", combineArray(alert_icao), { expires: 365 });
}

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
    Cookies.get("alert_callsigns") && Cookies.get("alert_callsigns")!.length > 0
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

function combineArray(input: any) {
  let output = "";

  for (let i = 0; i < input.length; i++) {
    output += `${i != 0 ? "," + input[i] : input[i]}`;
  }

  return output;
}

export function match_alert(msg: any) {
  let found = false;
  let matched_tail = [];
  let matched_flight = [];
  let matched_icao = [];
  let matched_text = [];

  if (msg.msghtml.hasOwnProperty("text")) {
    for (let i = 0; i < alert_text.length; i++) {
      if (
        msg.msghtml.text
          .toUpperCase()
          .search(new RegExp("\\b" + alert_text[i].toUpperCase() + "\\b")) != -1
      ) {
        found = true;
        matched_text.push(alert_text[i]);
      }
    }
  }

  if (msg.msghtml.hasOwnProperty("flight")) {
    for (let i = 0; i < alert_callsigns.length; i++) {
      if (
        msg.msghtml.flight
          .toUpperCase()
          .includes(alert_callsigns[i].toUpperCase())
      ) {
        found = true;
        matched_flight.push(alert_callsigns[i]);
      }
    }
  }

  if (msg.msghtml.hasOwnProperty("tail")) {
    for (let i = 0; i < alert_tail.length; i++) {
      if (
        msg.msghtml.tail.toUpperCase().includes(alert_tail[i].toUpperCase())
      ) {
        found = true;
        matched_tail.push(alert_tail[i]);
      }
    }
  }

  if (msg.msghtml.hasOwnProperty("icao")) {
    for (let i = 0; i < alert_icao.length; i++) {
      if (
        msg.msghtml.icao
          .toString()
          .toUpperCase()
          .includes(alert_icao[i].toUpperCase()) ||
        (msg.msghtml.hasOwnProperty("icao_hex") &&
          msg.msghtml.icao_hex
            .toUpperCase()
            .includes(alert_icao[i].toUpperCase()))
      ) {
        found = true;
        matched_icao.push(alert_icao[i]);
      }
    }
  }

  return {
    was_found: found,
    text: matched_text.length > 0 ? matched_text : null,
    icao: matched_icao.length > 0 ? matched_icao : null,
    flight: matched_flight.length > 0 ? matched_flight : null,
    tail: matched_tail.length > 0 ? matched_tail : null,
  };
}

function default_alert_values() {
  let current = (<HTMLInputElement>document.getElementById("alert_text")).value;

  default_text_values.forEach((element) => {
    if (!alert_text.includes(element.toUpperCase())) {
      current += `${current.length > 0 ? "," + element : element}`;
    }
  });
  (<HTMLInputElement>document.getElementById("alert_text")).value = current;
  updateAlerts();
}

export function connection_status(connected = false) {
  $("#disconnect").html(
    !connected
      ? ' | <strong><span class="red_body">DISCONNECTED FROM WEB SERVER'
      : ""
  );
}

export function toggle_playsound(loading = false) {
  if (play_sound) {
    let id = document.getElementById("playsound_link");
    if(id !== null) {
      id.innerHTML = "";
      let txt = document.createTextNode("Turn On Alert Sound");
      id.appendChild(txt);
    }
  } else {
    let id = document.getElementById("playsound_link");
    if(id !== null) {
      id.innerHTML = "";
      let txt = document.createTextNode("Turn Off Alert Sound");
      id.appendChild(txt);
    }
  }
  play_sound = play_sound ? false : true;
  Cookies.set("play_sound", play_sound == true ? "true" : "false", {
    expires: 365,
  });

  if (!loading) sound_alert();
}

export async function sound_alert() {
  if (play_sound) {
    try {
      await alert_sound.play();
    } catch (err) {
      console.log(err);
    }
  }
}
