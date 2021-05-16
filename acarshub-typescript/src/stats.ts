import { Chart } from "chart.js";
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { connection_status, updateAlertCounter } from "./alerts.js"
import { generate_menu, generate_footer, generate_stat_submenu } from "./menu.js"

let socket: SocketIOClient.Socket;
let image_prefix: string = "";
let acars_path: string = document.location.pathname.replace(
  /about|search|stats|status|alerts/gi,
  ""
);
acars_path += acars_path.endsWith("/") ? "" : "/";
let acars_url: string = document.location.origin + acars_path;

let chart_alerts: Chart;
let chart_signals: Chart;

$(document).ready(function () {
  generate_menu();
  generate_footer();
  updateAlertCounter();

  socket = io.connect(`${document.location.origin}/stats`, {
    path: acars_path + "socket.io",
  });

  socket.on("newmsg", function (msg: any) {
    generate_stat_submenu(msg.acars, msg.vdlm);
  });

  socket.on("signal", function (msg: any) {
    let input_labels: string[] = [];
    let input_data: number[] = [];

    // This float check is a hack and will discard good data. However, for reasons I don't understand
    // The database stores whole numbers not as the input float but as an int
    // This might be an artifact of any database that was running the old acarsdec (which used whole numbers only)
    // And the matching done for signal levels in the db write function...in any case, the graph should even out the
    // missing data points
    // The ultimate result here is that anyone who had run the old acarsdec would see massive spikes on whole numbers
    // that skews the graph significantly. Removing those values smooths the graph and is more representative of what
    // really has been received with the newer, better signal levels

    for (let i in msg.levels) {
      if (msg.levels[i].level != null && isFloat(msg.levels[i].level)) {
        input_labels.push(`${msg.levels[i].level}`);
        input_data.push(msg.levels[i].count);
      }
    }
    if (chart_signals) {
      chart_signals.destroy();
    }

    const canvas: HTMLCanvasElement = <HTMLCanvasElement> document.getElementById('signallevels');
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d')!;
    if(ctx != null) {
      chart_signals = new Chart(ctx, {
        // The type of chart we want to create
        type: "line",

        // The data for our dataset
        data: {
          labels: input_labels,
          datasets: [
            {
              label: "Received Signal Levels",
              backgroundColor: "rgb(30, 255, 30)",
              borderColor: "rgb(0, 0, 0)",
              data: input_data,
              //pointRadius: 0,
              borderWidth: 1,
            },
          ],
        },

        // Configuration options go here
        options: {},
      });
    }
  });

  socket.on("alert_terms", function (msg: any) {
    let labels: string[] = [];
    let alert_data: number[] = [];
    for (let i in msg.data) {
      // for now checking if count > 0 is a hack to get it to work
      // ideally, it should list out 0 term items
      if (msg.data[i].count > 0) {
        labels.push(msg.data[i].term);
        alert_data.push(msg.data[i].count);
      }
    }
    if (chart_alerts) {
      chart_alerts.destroy();
    }
    const canvas_alerts: HTMLCanvasElement = <HTMLCanvasElement> document.getElementById('alertterms');
    const ctx_alerts: CanvasRenderingContext2D = canvas_alerts.getContext('2d')!;
    if(ctx_alerts != null) {
      // @ts-expect-error
      let p = palette("tol", 12, 0, "").map(function (hex: any) {
        return "#" + hex;
      });

      chart_alerts = new Chart(ctx_alerts, {
        // The type of chart we want to create
        type: "bar",

        // The data for our dataset
        data: {
          labels: labels,
          datasets: [
            {
              label: "Received Alert Terms",
              backgroundColor: p,
              //borderColor: 'rgb(0, 0, 0)',
              data: alert_data,
              //borderWidth: 1
            },
          ],
        },

        // Configuration options go here
        options: {
          plugins: {
            datalabels: {
              backgroundColor: function (context: any) {
                return context.dataset.backgroundColor;
              },
              borderRadius: 4,
              color: "white",
              font: {
                weight: "bold",
              },
              formatter: Math.round,
              padding: 6,
            },
          },
        },
        plugins: [ChartDataLabels],
      });
    }
  });

  socket.on("freqs", function (msg: any) {
    let html: string = '<table class="search">';
    html +=
      '<thead><th><span class="menu_non_link">Frequency</span></th><th><span class="menu_non_link">Count</span></th><th><span class="menu_non_link">Type</span></th></thead>';
    for (let i = 0; i < msg.freqs.length; i++) {
      if (msg.freqs[i].freq_type == "ACARS")
        html += `<tr><td><span class=\"menu_non_link\">${msg.freqs[i].freq}</span></td><td><span class=\"menu_non_link\">${msg.freqs[i].count}</span></td><td><span class=\"menu_non_link\">${msg.freqs[i].freq_type}</span></td></tr>`;
    }

    for (let i = 0; i < msg.freqs.length; i++) {
      if (msg.freqs[i].freq_type == "VDL-M2")
        html += `<tr><td><span class=\"menu_non_link\">${msg.freqs[i].freq}</span></td><td><span class=\"menu_non_link\">${msg.freqs[i].count}</span></td><td><span class=\"menu_non_link\">${msg.freqs[i].freq_type}</span></td></tr>`;
    }

    html += "</table>";

    $("#freqs").html(html);
  });

  socket.on("system_status", function (msg: any) {
    if (msg.status.error_state == true) {
      $("#system_status").html(
        `<a href="${acars_url}status">System Status: <span class="red_body">Error</a></span>`
      );
    } else {
      $("#system_status").html(
        `<a href="${acars_url}status">System Status: <span class="green">Okay</a></span>`
      );
    }
  });

  socket.on("count", function (msg: any) {
    let error: number = msg.count[1];
    let total: number = msg.count[0] + msg.count[2] + msg.count[3];
    let good_msg: number = msg.count[0] - error;

    let empty_error: number = msg.count[3];
    let empty_good: number = msg.count[2];

    let html: string = '<p><table class="search">';
    html += `<tr><td><span class="menu_non_link">Total Messages (All): </span></td><td><span class="menu_non_link">${total}</span></td><td></td></tr>`;
    html += `<tr><td><span class="menu_non_link">Messages (No Errors): </span></td><td><span class="menu_non_link">${good_msg}</span></td><td><span class="menu_non_link">${
      total ? parseFloat(String((good_msg / total) * 100)).toFixed(2) + "%" : ""
    }</span></td></tr>`;
    html += `<tr><td><span class="menu_non_link">Messages (W/Errors): </span></td><td><span class="menu_non_link">${error}</span></td><td><span class="menu_non_link">${
      total ? parseFloat(String((error / total) * 100)).toFixed(2) + "%" : ""
    }</span></td></tr>`;
    html += "</table></p>";
    html += '<table class="search">';
    html += `<tr><td><span class="menu_non_link">Empty Messages (Total): </span></td><td><span class="menu_non_link">${
      empty_good + empty_error
    }</span></td><td><span class="menu_non_link">${
      total
        ? parseFloat(String(((empty_good + empty_error) / total) * 100)).toFixed(2) +
          "%"
        : ""
    }</span></td></tr>`;
    html += `<tr><td><span class="menu_non_link">Empty Messages (No Errors): </span></td><td><span class="menu_non_link">${empty_good}</span></td><td><span class="menu_non_link">${
      total ? parseFloat(String((empty_good / total) * 100)).toFixed(2) + "%" : ""
    }</span></td></tr>`;
    html += `<tr><td><span class="menu_non_link">Empty Messages (W/Errors): </span></td><td><span class="menu_non_link">${empty_error}</span></td><td><span class="menu_non_link">${
      total ? parseFloat(String((empty_error / total) * 100)).toFixed(2) + "%" : ""
    }</span></td></tr>`;
    html += "</table>";

    $("#msgs").html(html);
  });

  socket.on("disconnect", function () {
    connection_status();
  });

  socket.on("connect_error", function () {
    connection_status();
  });

  socket.on("connect_timeout", function () {
    connection_status();
  });

  socket.on("connect", function () {
    connection_status(true);
  });

  socket.on("reconnect", function () {
    connection_status(true);
  });

  grab_freqs();
  grab_message_count();
});

function isFloat(n: number) {
  return Number(n) === n && n % 1 !== 0;
}

setInterval(function () {
  grab_images();
  grab_freqs();
  grab_message_count();
  grab_updated_graphs();
}, 60000);

function update_prefix(prefix: any) {
  image_prefix = prefix;
  grab_images();
}

function grab_images() {
  let onehour: HTMLElement = document.getElementById("1hr")!;
  if(onehour !== null && onehour.hasOwnProperty("src")) (<HTMLImageElement>onehour).src = `static/images/${image_prefix}1hour.png?rand=` + Math.random();

  let sixhours: HTMLElement = document.getElementById("6hr")!;
  if(sixhours !== null && sixhours.hasOwnProperty("src'")) (<HTMLImageElement>sixhours).src = `static/images/${image_prefix}6hour.png?rand=` + Math.random();

  let twelvehours: HTMLElement = document.getElementById("12hr")!;
  if(twelvehours !== null && twelvehours.hasOwnProperty("src")) (<HTMLImageElement>twelvehours).src = `static/images/${image_prefix}12hour.png?rand=` + Math.random();

  let twentyfourhours: HTMLElement = document.getElementById("24hr")!;
  if(twentyfourhours !== null && twentyfourhours.hasOwnProperty("src")) (<HTMLImageElement>twentyfourhours).src = `static/images/${image_prefix}24hours.png?rand=` + Math.random();

  let oneweek: HTMLElement = document.getElementById("1wk")!;
  if(oneweek !== null && oneweek.hasOwnProperty("src")) (<HTMLImageElement>oneweek).src = `static/images/${image_prefix}1week.png?rand=` + Math.random();

  let thirtydays: HTMLElement = document.getElementById("30day")!;
  if(thirtydays !== null && thirtydays.hasOwnProperty("src")) (<HTMLImageElement>thirtydays).src = `static/images/${image_prefix}30days.png?rand=` + Math.random();

  let sixmonths: HTMLElement = document.getElementById("6mon")!;
  if(sixmonths !== null && sixmonths.hasOwnProperty("src'")) (<HTMLImageElement>sixmonths).src = `static/images/${image_prefix}6months.png?rand=` + Math.random();

  let oneyear: HTMLElement = document.getElementById("1yr")!;
  if(oneyear !== null && oneyear.hasOwnProperty("src")) (<HTMLImageElement>oneyear).src = `static/images/${image_prefix}1year.png?rand=` + Math.random();
}

function grab_freqs() {
  socket.emit("freqs", { freqs: true }, ("/stats"));
}

function grab_message_count() {
  socket.emit("count", { count: true }, ("/stats"));
}

function grab_updated_graphs() {
  socket.emit("graphs", { graphs: true }, ("/stats"));
}
