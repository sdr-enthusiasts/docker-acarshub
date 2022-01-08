import Chart from "chart.js/auto";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { generate_stat_submenu } from "./index";
import palette from "./js-other/palette";
import {
  signal_grab_freqs,
  signal_grab_message_count,
  signal_grab_updated_graphs,
  is_connected,
} from "./index";
import {
  alert_term,
  decoders,
  signal,
  signal_count_data,
  signal_freq_data,
} from "./interfaces";

export let stats_page = {
  image_prefix: "" as string,
  stats_acars_path: "" as string,
  stats_acars_url: "" as string,
  stats_page_active: false as boolean,

  chart_alerts: (<unknown>null) as Chart,
  chart_signals: (<unknown>null) as Chart,
  chart_frequency_data_acars: (<unknown>null) as Chart,
  chart_frequency_data_vdlm: (<unknown>null) as Chart,
  chart_message_counts_data: (<unknown>null) as Chart,
  chart_message_counts_empty: (<unknown>null) as Chart,

  alert_data: {} as alert_term,
  signal_data: {} as signal,
  freqs_data: {} as signal_freq_data,
  count_data: {} as signal_count_data,

  acars_on: false as boolean,
  vdlm_on: false as boolean,
  width: 1000 as number,

  tol: new palette("tol", 12, 0, "").map(function (hex: any) {
    return "#" + hex;
  }),

  rainbox: new palette("cb-Dark2", 8, 0, "").map(function (hex: any) {
    return "#" + hex;
  }),

  show_alert_chart: function (): void {
    if (typeof this.alert_data !== "undefined") {
      let labels: string[] = [];
      let alert_chart_data: number[] = [];
      for (let i in this.alert_data.data) {
        // for now checking if count > 0 is a hack to get it to work
        // ideally, it should list out 0 term items
        labels.push(this.alert_data.data[i].term);
        alert_chart_data.push(this.alert_data.data[i].count);
      }
      if (this.chart_alerts !== null) {
        this.chart_alerts.destroy();
      }

      const canvas_alerts: HTMLCanvasElement = <HTMLCanvasElement>(
        document.getElementById("alertterms")
      );
      const ctx_alerts: CanvasRenderingContext2D =
        canvas_alerts.getContext("2d")!;
      if (ctx_alerts != null) {
        this.chart_alerts = new Chart(ctx_alerts, {
          // The type of chart we want to create
          type: "bar",

          // The data for our dataset
          data: {
            labels: labels,
            datasets: [
              {
                label: "Received Alert Terms",
                backgroundColor: this.tol,
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
                formatter: (value) => {
                  return value.toLocaleString();
                },
                padding: 6,
              },
            },
          },
          plugins: [ChartDataLabels],
        });
      }
    }
  },

  show_signal_chart: function (): void {
    if (
      typeof this.signal_data !== "undefined" &&
      typeof this.signal_data.levels !== "undefined"
    ) {
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

      for (let i in this.signal_data.levels) {
        if (
          this.signal_data.levels[i].level != null &&
          this.isFloat(this.signal_data.levels[i].level)
        ) {
          input_labels.push(
            `${this.signal_data.levels[i].level.toLocaleString()}`
          );
          input_data.push(this.signal_data.levels[i].count);
        }
      }
      if (this.chart_signals) {
        this.chart_signals.destroy();
      }

      const canvas: HTMLCanvasElement = <HTMLCanvasElement>(
        document.getElementById("signallevels")
      );
      const ctx: CanvasRenderingContext2D = canvas.getContext("2d")!;
      if (ctx != null) {
        this.chart_signals = new Chart(ctx, {
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
          options: {
            responsive: true,
          },
        });
      }
    }
  },

  show_freqs: function (): void {
    if (
      typeof this.freqs_data !== "undefined" &&
      typeof this.freqs_data.freqs !== "undefined"
    ) {
      let freq_data_acars: number[] = [];
      let freq_data_vdlm: number[] = [];
      let freq_labels_acars: string[] = [];
      let freq_labels_vdlm: string[] = [];
      let freq_labels_acars_positions: string[] = [];
      let freq_labels_vdlm_positions: string[] = [];
      let freq_labels_acars_offset: number[] = [];
      let freq_labels_vdlm_offset: number[] = [];
      let total_count_acars: number = 0;
      let total_count_vdlm: number = 0;
      let acars_offset: number = 5;
      let vdlm_offset: number = 5;

      Object.entries(this.freqs_data.freqs).forEach(([key, value]) => {
        if (value.freq_type === "ACARS") total_count_acars += value.count;
        else total_count_vdlm += value.count;
      });

      Object.entries(this.freqs_data.freqs).forEach(([key, value]) => {
        if (value.freq_type === "ACARS") {
          freq_data_acars.push(value.count);
          freq_labels_acars.push(value.freq);

          if (value.count / total_count_acars > 0.2) {
            freq_labels_acars_positions.push("center");
            freq_labels_acars_offset.push(0);
          } else {
            freq_labels_acars_positions.push("end");
            freq_labels_acars_offset.push(acars_offset);
            acars_offset += 60;
          }
        } else {
          freq_data_vdlm.push(value.count);
          freq_labels_vdlm.push(value.freq);

          if (value.count / total_count_acars > 0.2) {
            freq_labels_vdlm_positions.push("center");
            freq_labels_vdlm_offset.push(0);
          } else {
            freq_labels_vdlm_positions.push("end");
            freq_labels_vdlm_offset.push(vdlm_offset);
            vdlm_offset += 60;
          }
        }
      });

      if (this.chart_frequency_data_acars !== null) {
        this.chart_frequency_data_acars.destroy();
      }

      if (this.chart_frequency_data_vdlm !== null) {
        this.chart_frequency_data_vdlm.destroy();
      }

      if (freq_data_acars.length > 0) {
        const canvas: HTMLCanvasElement = <HTMLCanvasElement>(
          document.getElementById("frequencies_acars")
        );
        const ctx: CanvasRenderingContext2D = canvas
          ? canvas.getContext("2d")!
          : null!;
        if (ctx != null) {
          this.chart_frequency_data_acars = new Chart(ctx, {
            // The type of chart we want to create
            type: "pie",

            // The data for our dataset
            data: {
              labels: freq_labels_acars,
              datasets: [
                {
                  label: "ACARS Frequencies",
                  backgroundColor: this.rainbox,
                  borderColor: "rgb(0, 0, 0)",
                  data: freq_data_acars,
                  //pointRadius: 0,
                  borderWidth: 1,
                },
              ],
            },

            // Configuration options go here
            options: {
              responsive: true,
              plugins: {
                legend: {
                  display: false,
                },
                tooltip: {
                  enabled: false,
                },
                title: {
                  display: true,
                  text: `ACARS Frequency Counts (${total_count_acars.toLocaleString()})`,
                },
                datalabels: {
                  backgroundColor: function (context: any) {
                    return context.dataset.backgroundColor;
                  },
                  borderRadius: 4,
                  color: "white",
                  font: {
                    weight: "bold",
                  },
                  formatter: (value, context) => {
                    return (
                      freq_labels_acars[context.dataIndex] +
                      "\n" +
                      freq_data_acars[context.dataIndex].toLocaleString() +
                      " msgs\n" +
                      (
                        (freq_data_acars[context.dataIndex] /
                          total_count_acars) *
                        100
                      )
                        .toFixed(2)
                        .toLocaleString() +
                      "%"
                    );
                  },
                  align: "bottom",
                  padding: 6,
                  anchor: (context) => {
                    return freq_labels_acars_positions[context.dataIndex] as
                      | "start"
                      | "end"
                      | "center";
                  },
                  offset: (context) => {
                    return freq_labels_acars_offset[context.dataIndex];
                  },
                  clip: false,
                },
              },
            },
            plugins: [ChartDataLabels],
          });
        }
      }

      if (freq_data_vdlm.length > 0) {
        const canvas: HTMLCanvasElement = <HTMLCanvasElement>(
          document.getElementById("frequencies_vdlm")
        );
        const ctx: CanvasRenderingContext2D = canvas
          ? canvas.getContext("2d")!
          : null!;
        if (ctx != null) {
          this.chart_frequency_data_vdlm = new Chart(ctx, {
            // The type of chart we want to create
            type: "pie",

            // The data for our dataset
            data: {
              labels: freq_labels_vdlm,
              datasets: [
                {
                  label: "VDLM Frequencies",
                  backgroundColor: this.rainbox,
                  borderColor: "rgb(0, 0, 0)",
                  data: freq_data_vdlm,
                  //pointRadius: 0,
                  borderWidth: 1,
                },
              ],
            },

            // Configuration options go here
            options: {
              responsive: true,
              plugins: {
                legend: {
                  display: false,
                },
                tooltip: {
                  enabled: false,
                },
                title: {
                  display: true,
                  text: `VDLM Frequency Counts  (${total_count_vdlm.toLocaleString()})`,
                },
                datalabels: {
                  backgroundColor: function (context: any) {
                    return context.dataset.backgroundColor;
                  },
                  borderRadius: 4,
                  color: "white",
                  font: {
                    weight: "bold",
                  },
                  formatter: (value, context) => {
                    return (
                      freq_labels_vdlm[context.dataIndex] +
                      "\n" +
                      freq_data_vdlm[context.dataIndex].toLocaleString() +
                      " msgs\n" +
                      (
                        (freq_data_vdlm[context.dataIndex] / total_count_vdlm) *
                        100
                      )
                        .toFixed(2)
                        .toLocaleString() +
                      "%"
                    );
                  },
                  align: "bottom",
                  padding: 6,
                  anchor: (context) => {
                    return freq_labels_vdlm_positions[context.dataIndex] as
                      | "start"
                      | "end"
                      | "center";
                  },
                  offset: (context) => {
                    return freq_labels_vdlm_offset[context.dataIndex];
                  },
                  clip: false,
                },
              },
            },
            plugins: [ChartDataLabels],
          });
        }
      }
    }
  },

  show_count: function (): void {
    if (
      typeof this.count_data !== "undefined" &&
      typeof this.count_data.count !== "undefined"
    ) {
      const total: number =
        this.count_data.count.non_empty_total +
        this.count_data.count.empty_total +
        this.count_data.count.non_empty_errors;
      const total_non_empty: number =
        this.count_data.count.non_empty_total +
        this.count_data.count.non_empty_errors;
      const error: number = this.count_data.count.non_empty_errors;
      const good_msg: number = this.count_data.count.non_empty_total - error;

      const empty_error: number = this.count_data.count.empty_errors;
      const empty_good: number = this.count_data.count.empty_total;
      const empty_total: number = empty_error + empty_good;

      const counts_data: number[] = [good_msg, error];

      const counts_empty: number[] = [empty_good, empty_error];
      const count_labels: string[] = [
        " Messages (No Errors)",
        " Messages (W/Errors)",
      ];

      if (this.chart_message_counts_data !== null) {
        this.chart_message_counts_data.destroy();
      }

      if (this.chart_message_counts_empty !== null) {
        this.chart_message_counts_empty.destroy();
      }
      const canvas_data: HTMLCanvasElement = <HTMLCanvasElement>(
        document.getElementById("msg_count_data")
      );
      const ctx_data: CanvasRenderingContext2D = canvas_data.getContext("2d")!;
      if (ctx_data != null) {
        this.chart_message_counts_data = new Chart(ctx_data, {
          // The type of chart we want to create
          type: "pie",

          // The data for our dataset
          data: {
            labels: count_labels,
            datasets: [
              {
                label: "Frequency Count for Messages",
                backgroundColor: this.rainbox,
                borderColor: "rgb(0, 0, 0)",
                data: counts_data,
                //pointRadius: 0,
                borderWidth: 1,
              },
            ],
          },

          // Configuration options go here
          options: {
            responsive: true,
            plugins: {
              legend: {
                display: false,
              },
              tooltip: {
                enabled: false,
              },
              title: {
                display: true,
                text: `Non-Empty Messages (${total_non_empty.toLocaleString()})`,
              },
              datalabels: {
                backgroundColor: function (context: any) {
                  return context.dataset.backgroundColor;
                },
                borderRadius: 4,
                color: "white",
                font: {
                  weight: "bold",
                },
                formatter: (value, context) => {
                  return (
                    value.toLocaleString() +
                    count_labels[context.dataIndex] +
                    "\n" +
                    ((value / total_non_empty) * 100)
                      .toFixed(2)
                      .toLocaleString() +
                    "% of total messages"
                  );
                },
                padding: 6,
              },
            },
          },
          plugins: [ChartDataLabels],
        });
      }

      const canvas_empty: HTMLCanvasElement = <HTMLCanvasElement>(
        document.getElementById("msg_count_empty")
      );
      const ctx_empty: CanvasRenderingContext2D =
        canvas_empty.getContext("2d")!;
      if (ctx_empty != null) {
        this.chart_message_counts_empty = new Chart(ctx_empty, {
          // The type of chart we want to create
          type: "pie",

          // The data for our dataset
          data: {
            labels: count_labels,
            datasets: [
              {
                label: "Frequency Count for Empty Messages",
                backgroundColor: this.rainbox,
                borderColor: "rgb(0, 0, 0)",
                data: counts_empty,
                //pointRadius: 0,
                borderWidth: 1,
              },
            ],
          },

          // Configuration options go here
          options: {
            responsive: true,
            plugins: {
              legend: {
                display: false,
              },
              tooltip: {
                enabled: false,
              },
              title: {
                display: true,
                text: `Empty Messages (${empty_total.toLocaleString()})`,
              },
              datalabels: {
                backgroundColor: function (context: any) {
                  return context.dataset.backgroundColor;
                },
                borderRadius: 4,
                color: "white",
                font: {
                  weight: "bold",
                },
                formatter: (value, context) => {
                  return (
                    value.toLocaleString() +
                    count_labels[context.dataIndex] +
                    "\n" +
                    ((value / empty_total) * 100).toFixed(2).toLocaleString() +
                    "% of total messages"
                  );
                },
                padding: 6,
              },
            },
          },
          plugins: [ChartDataLabels],
        });
      }
    }
  },

  decoders_enabled: function (msg: decoders): void {
    this.acars_on = msg.acars;
    this.vdlm_on = msg.vdlm;
    if (this.stats_page_active)
      generate_stat_submenu(this.acars_on, this.vdlm_on);
  },

  signals: function (msg: signal): void {
    this.signal_data = msg;
    if (this.stats_page_active) this.show_signal_chart();
  },

  alert_terms: function (msg: alert_term): void {
    this.alert_data = msg;
    if (this.stats_page_active) this.show_alert_chart();
  },

  signal_freqs: function (msg: signal_freq_data): void {
    this.freqs_data = msg;
    if (this.stats_page_active) this.show_freqs();
  },

  signal_count: function (msg: signal_count_data): void {
    this.count_data = msg;
    if (this.stats_page_active) this.show_count();
  },

  stats: function (): void {
    this.grab_freqs();
    this.grab_message_count();
  },

  isFloat: function (n: number): boolean {
    return Number(n) === n && n % 1 !== 0;
  },

  updatePage: function (): void {
    this.grab_images();
    this.grab_freqs();
    this.grab_message_count();
    this.grab_updated_graphs();
  },

  update_prefix: function (prefix: string): void {
    this.image_prefix = prefix;
    this.grab_images();
  },

  grab_images: function (): void {
    if (!is_connected()) {
      console.log("Server disconnected, skipping image updates");
      return;
    }
    $("#1hr").prop(
      "src",
      `static/images/${this.image_prefix}1hour.png?rand=` + Math.random()
    );
    $("#6hr").prop(
      "src",
      `static/images/${this.image_prefix}6hour.png?rand=` + Math.random()
    );
    $("#12hr").prop(
      "src",
      `static/images/${this.image_prefix}12hour.png?rand=` + Math.random()
    );
    $("#24hr").prop(
      "src",
      `static/images/${this.image_prefix}24hours.png?rand=` + Math.random()
    );
    $("#1wk").prop(
      "src",
      `static/images/${this.image_prefix}1week.png?rand=` + Math.random()
    );
    $("#30day").prop(
      "src",
      `static/images/${this.image_prefix}30days.png?rand=` + Math.random()
    );
    $("#6mon").prop(
      "src",
      `static/images/${this.image_prefix}6months.png?rand=` + Math.random()
    );
    $("#1yr").prop(
      "src",
      `static/images/${this.image_prefix}1year.png?rand=` + Math.random()
    );
  },

  grab_freqs: function (): void {
    signal_grab_freqs();
  },

  grab_message_count: function (): void {
    signal_grab_message_count();
  },

  grab_updated_graphs: function (): void {
    signal_grab_updated_graphs();
  },

  set_html: function (): void {
    $("#log").html(`<p><div id="stat_menu"></div></p>
    <div id="stat_images">
    <img src="static/images/1hour.png" id="1hr" alt="1 Hour"><br>
    <img src="static/images/6hour.png" id="6hr" alt="6 Hours"><br>
    <img src="static/images/12hour.png" id="12hr" alt="12 Hours"><br>
    <img src="static/images/24hours.png" id="24hr" alt="24 Hours"><br>
    <img src="static/images/1week.png" id="1wk" alt="1 Week"><br>
    <img src="static/images/30days.png" id="30day" alt="30 Days"><br>
    <img src="static/images/6months.png" id="6mon" alt="6 Months"><br>
    <img src="static/images/1year.png" id="1yr" alt="1 Year"><br>
    </div>
    <div class="chart_container"><canvas id="signallevels"></canvas></div>
    <canvas id="alertterms"></canvas>
    <div class="canvas_wrapper">${
      this.acars_on
        ? '<div id="acars_freq_graph" class="chart-container"><canvas id="frequencies_acars"></canvas></div>'
        : ""
    }
    ${
      this.vdlm_on
        ? '<div id="vdlm_freq_graph" class="chart-container"><canvas id="frequencies_vdlm"></canvas></div>'
        : ""
    }</div>
    <div id="counts" class="canvas_wrapper">
    <div id="chart_msg_good" class="chart-container"><canvas id="msg_count_data"></div>
    <div id="chart_msg_empty" class="chart-container"><canvas id="msg_count_empty"></div>
    </div>
    </p>'`); // show the messages we've received
    $("#modal_text").html("");
    $("#page_name").html("");
    this.resize();
  },

  resize(width: number = 0): void {
    if (width) {
      this.width = width;
    }
    $("#counts").css("padding-top", "10px");
    if (this.width >= 1000) {
      $("#acars_freq_graph").css("float", "left");
      $("#vdlm_freq_graph").css("float", "left");
      $("#vdlm_freq_graph").css("padding-top", "0px");
      $("#frequencies_acars").css("float", "right");
      $("#frequencies_vdlm").css("float", "right");

      $("#chart_msg_good").css("float", "left");
      $("#chart_msg_empty").css("float", "left");
      $("#chart_msg_empty").css("padding-top", "0px");
      $("#msg_count_data").css("float", "right");
      $("#msg_count_empty").css("float", "right");
    } else {
      $("#acars_freq_graph").css("float", "none");
      $("#vdlm_freq_graph").css("float", "none");
      $("#vdlm_freq_graph").css("padding-top", "10px");
      $("#frequencies_acars").css("float", "none");
      $("#frequencies_vdlm").css("float", "none");

      $("#chart_msg_good").css("float", "none");
      $("#chart_msg_empty").css("float", "none");
      $("#chart_msg_empty").css("padding-top", "10px");
      $("#msg_count_data").css("float", "none");
      $("#msg_count_empty").css("float", "none");
    }
  },

  stats_active: function (state = false): void {
    this.stats_page_active = state;

    if (this.stats_page_active) {
      // page is active
      this.set_html();
      generate_stat_submenu(this.acars_on, this.vdlm_on);
      this.show_signal_chart();
      this.show_alert_chart();
      this.show_count();
      this.show_freqs();
    }
  },

  set_stats_page_urls: function (
    documentPath: string,
    documentUrl: string
  ): void {
    this.stats_acars_path = documentPath;
    this.stats_acars_url = documentUrl;
  },
};
