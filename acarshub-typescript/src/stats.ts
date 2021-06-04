import { Chart } from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { updateAlertCounter } from "./alerts.js";
import { generate_stat_submenu } from "./menu.js";
import {
  signal_grab_freqs,
  signal_grab_message_count,
  signal_grab_updated_graphs,
  is_connected,
} from "./index.js";
import {
  alert_term,
  decoders,
  signal,
  signal_count_data,
  signal_freq_data,
} from "./interfaces.js";

declare const window: any;
let image_prefix: string = "";
let acars_path: string = "";
let acars_url: string = "";
let page_active = false;

let chart_alerts: Chart;
let chart_signals: Chart;

let alert_data: alert_term;
let signal_data: signal;
let freqs_data: signal_freq_data;
let count_data: signal_count_data;

let acars_on = false;
let vdlm_on = false;

function show_alert_chart() {
  if (typeof alert_data !== "undefined") {
    let labels: string[] = [];
    let alert_chart_data: number[] = [];
    for (let i in alert_data.data) {
      // for now checking if count > 0 is a hack to get it to work
      // ideally, it should list out 0 term items
      labels.push(alert_data.data[i].term);
      alert_chart_data.push(alert_data.data[i].count);
    }
    if (chart_alerts) {
      chart_alerts.destroy();
    }
    const canvas_alerts: HTMLCanvasElement = <HTMLCanvasElement>(
      document.getElementById("alertterms")
    );
    const ctx_alerts: CanvasRenderingContext2D = canvas_alerts.getContext(
      "2d"
    )!;
    if (ctx_alerts != null) {
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
              data: alert_chart_data,
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
  }
}

function show_signal_chart() {
  if (typeof signal_data !== "undefined") {
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

    for (let i in signal_data.levels) {
      if (
        signal_data.levels[i].level != null &&
        isFloat(signal_data.levels[i].level)
      ) {
        input_labels.push(`${signal_data.levels[i].level}`);
        input_data.push(signal_data.levels[i].count);
      }
    }
    if (chart_signals) {
      chart_signals.destroy();
    }

    const canvas: HTMLCanvasElement = <HTMLCanvasElement>(
      document.getElementById("signallevels")
    );
    const ctx: CanvasRenderingContext2D = canvas.getContext("2d")!;
    if (ctx != null) {
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
  }
}

function show_freqs() {
  if (typeof freqs_data !== "undefined") {
    let html: string = '<table class="search">';
    html +=
      '<thead><th><span class="menu_non_link">Frequency</span></th><th><span class="menu_non_link">Count</span></th><th><span class="menu_non_link">Type</span></th></thead>';
    for (let i = 0; i < freqs_data.freqs.length; i++) {
      if (freqs_data.freqs[i].freq_type == "ACARS")
        html += `<tr><td><span class=\"menu_non_link\">${freqs_data.freqs[i].freq}</span></td><td><span class=\"menu_non_link\">${freqs_data.freqs[i].count}</span></td><td><span class=\"menu_non_link\">${freqs_data.freqs[i].freq_type}</span></td></tr>`;
    }

    for (let i = 0; i < freqs_data.freqs.length; i++) {
      if (freqs_data.freqs[i].freq_type == "VDL-M2")
        html += `<tr><td><span class=\"menu_non_link\">${freqs_data.freqs[i].freq}</span></td><td><span class=\"menu_non_link\">${freqs_data.freqs[i].count}</span></td><td><span class=\"menu_non_link\">${freqs_data.freqs[i].freq_type}</span></td></tr>`;
    }

    html += "</table>";

    $("#freqs").html(html);
  }
}

function show_count() {
  if (typeof count_data !== "undefined") {
    let error: number = count_data.count.non_empty_errors;
    let total: number =
      count_data.count.non_empty_total +
      count_data.count.empty_total +
      count_data.count.non_empty_errors;
    let good_msg: number = count_data.count.non_empty_total - error;

    let empty_error: number = count_data.count.empty_errors;
    let empty_good: number = count_data.count.empty_total;

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
        ? parseFloat(
            String(((empty_good + empty_error) / total) * 100)
          ).toFixed(2) + "%"
        : ""
    }</span></td></tr>`;
    html += `<tr><td><span class="menu_non_link">Empty Messages (No Errors): </span></td><td><span class="menu_non_link">${empty_good}</span></td><td><span class="menu_non_link">${
      total
        ? parseFloat(String((empty_good / total) * 100)).toFixed(2) + "%"
        : ""
    }</span></td></tr>`;
    html += `<tr><td><span class="menu_non_link">Empty Messages (W/Errors): </span></td><td><span class="menu_non_link">${empty_error}</span></td><td><span class="menu_non_link">${
      total
        ? parseFloat(String((empty_error / total) * 100)).toFixed(2) + "%"
        : ""
    }</span></td></tr>`;
    html += "</table>";

    $("#msgs").html(html);
  }
}

export function decoders_enabled(msg: decoders) {
  acars_on = msg.acars;
  vdlm_on = msg.vdlm;
  if (page_active) generate_stat_submenu(acars_on, vdlm_on);
}

export function signals(msg: signal) {
  signal_data = msg;
  if (page_active) show_signal_chart();
}

export function alert_terms(msg: alert_term) {
  alert_data = msg;
  if (page_active) show_alert_chart();
}

export function signal_freqs(msg: signal_freq_data) {
  freqs_data = msg;
  if (page_active) show_freqs();
}

export function signal_count(msg: signal_count_data) {
  count_data = msg;
  if (page_active) show_count();
}

export function stats() {
  updateAlertCounter();
  grab_freqs();
  grab_message_count();
}

function isFloat(n: number) {
  return Number(n) === n && n % 1 !== 0;
}

setInterval(function () {
  grab_images();
  grab_freqs();
  grab_message_count();
  grab_updated_graphs();
}, 60000);

window.update_prefix = function (prefix: string) {
  image_prefix = prefix;
  grab_images();
};

function grab_images() {
  if (is_connected()) {
    let onehour: HTMLImageElement = <HTMLImageElement>(
      document.getElementById("1hr")!
    );
    if (onehour !== null)
      onehour.src =
        `static/images/${image_prefix}1hour.png?rand=` + Math.random();

    let sixhours: HTMLImageElement = <HTMLImageElement>(
      document.getElementById("6hr")!
    );
    if (sixhours !== null)
      sixhours.src =
        `static/images/${image_prefix}6hour.png?rand=` + Math.random();

    let twelvehours: HTMLImageElement = <HTMLImageElement>(
      document.getElementById("12hr")!
    );
    if (twelvehours !== null)
      twelvehours.src =
        `static/images/${image_prefix}12hour.png?rand=` + Math.random();

    let twentyfourhours: HTMLImageElement = <HTMLImageElement>(
      document.getElementById("24hr")!
    );
    if (twentyfourhours !== null)
      twentyfourhours.src =
        `static/images/${image_prefix}24hours.png?rand=` + Math.random();

    let oneweek: HTMLImageElement = <HTMLImageElement>(
      document.getElementById("1wk")!
    );
    if (oneweek !== null)
      oneweek.src =
        `static/images/${image_prefix}1week.png?rand=` + Math.random();

    let thirtydays: HTMLImageElement = <HTMLImageElement>(
      document.getElementById("30day")!
    );
    if (thirtydays !== null)
      thirtydays.src =
        `static/images/${image_prefix}30days.png?rand=` + Math.random();

    let sixmonths: HTMLImageElement = <HTMLImageElement>(
      document.getElementById("6mon")!
    );
    if (sixmonths !== null)
      sixmonths.src =
        `static/images/${image_prefix}6months.png?rand=` + Math.random();

    let oneyear: HTMLImageElement = <HTMLImageElement>(
      document.getElementById("1yr")!
    );
    if (oneyear !== null)
      oneyear.src =
        `static/images/${image_prefix}1year.png?rand=` + Math.random();
  } else {
    console.log("Server disconnected, skipping image updates");
  }
}

function grab_freqs() {
  signal_grab_freqs();
  //socket.emit("signal_freqs", { freqs: true }, ("/stats"));
}

function grab_message_count() {
  signal_grab_message_count();
  //socket.emit("count", { count: true }, ("/stats"));
}

function grab_updated_graphs() {
  signal_grab_updated_graphs();
  //socket.emit("graphs", { graphs: true }, ("/stats"));
}

function set_html() {
  $("#log").html(`<p></p>
  <img src="static/images/1hour.png" id="1hr" alt="1 Hour"><br>
  <img src="static/images/6hour.png" id="6hr" alt="6 Hours"><br>
  <img src="static/images/12hour.png" id="12hr" alt="12 Hours"><br>
  <img src="static/images/24hours.png" id="24hr" alt="24 Hours"><br>
  <img src="static/images/1week.png" id="1wk" alt="1 Week"><br>
  <img src="static/images/30days.png" id="30day" alt="30 Days"><br>
  <img src="static/images/6months.png" id="6mon" alt="6 Months"><br>
  <img src="static/images/1year.png" id="1yr" alt="1 Year"><br>
  <canvas id="signallevels"></canvas>
  <canvas id="alertterms"></canvas>`); // show the messages we've received
  $("#right").html(`<div class="fixed_results">
  <span id="stat_menu"></span>
</div>`);
  $("#modal_text").html("");
  $("#page_name").html("");
}

export function stats_active(state = false) {
  page_active = state;

  if (page_active) {
    // page is active
    set_html();
    generate_stat_submenu(acars_on, vdlm_on);
    show_signal_chart();
    show_alert_chart();
    show_count();
    show_freqs();
  }
}

export function set_stats_page_urls(documentPath: string, documentUrl: string) {
  acars_path = documentPath;
  acars_url = documentUrl;
}
