// Copyright (C) 2022-2024 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.

// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

import { Chart, registerables } from "chart.js";

import ChartDataLabels from "chartjs-plugin-datalabels";
import {
  generate_stat_submenu,
  is_connected,
  signal_grab_freqs,
  signal_grab_message_count,
  signal_grab_updated_graphs,
} from "../index";
import type {
  alert_term,
  decoders,
  signal,
  signal_count_data,
  signal_freq_data,
} from "../interfaces";
import palette from "../js-other/palette";
import { ACARSHubPage } from "./master";

export class StatsPage extends ACARSHubPage {
  #image_prefix: string = "";

  #chart_alerts: Chart = (<unknown>null) as Chart;
  #chart_signals: Chart = (<unknown>null) as Chart;
  #chart_frequency_data_acars: Chart = (<unknown>null) as Chart;
  #chart_frequency_data_vdlm: Chart = (<unknown>null) as Chart;
  #chart_frequency_data_hfdl: Chart = (<unknown>null) as Chart;
  #chart_frequency_data_imsl: Chart = (<unknown>null) as Chart;
  #chart_frequency_data_irdm: Chart = (<unknown>null) as Chart;
  #chart_message_counts_data: Chart = (<unknown>null) as Chart;
  #chart_message_counts_empty: Chart = (<unknown>null) as Chart;

  #alert_data: alert_term = {} as alert_term;
  #signal_data: signal = {} as signal;
  #freqs_data: signal_freq_data = {} as signal_freq_data;
  #count_data: signal_count_data = {} as signal_count_data;

  #acars_on: boolean = false;
  #vdlm_on: boolean = false;
  #hfdl_on: boolean = false;
  #imsl_on: boolean = false;
  #irdm_on: boolean = false;

  #tol: string[] = new palette("tol", 12, 0, "").map(
    (hex: string) => "#" + hex,
  );

  #rainbox: string[] = new palette("cb-Dark2", 8, 0, "").map(
    (hex: string) => "#" + hex,
  );

  active(state = false): void {
    super.active(state);

    if (this.page_active) {
      Chart.register(...registerables);
      // page is active
      this.set_html();
      generate_stat_submenu(
        this.#acars_on,
        this.#vdlm_on,
        this.#hfdl_on,
        this.#imsl_on,
        this.#irdm_on,
      );
      this.show_signal_chart();
      this.show_alert_chart();
      this.show_count();
      this.show_freqs();
    }
  }

  show_alert_chart(): void {
    if (typeof this.#alert_data !== "undefined") {
      const labels: string[] = [];
      const alert_chart_data: number[] = [];
      for (const i in this.#alert_data.data) {
        // for now checking if count > 0 is a hack to get it to work
        // ideally, it should list out 0 term items
        labels.push(this.#alert_data.data[i].term);
        alert_chart_data.push(this.#alert_data.data[i].count);
      }
      if (this.#chart_alerts !== null) {
        this.#chart_alerts.destroy();
      }

      const canvas_alerts: HTMLCanvasElement = <HTMLCanvasElement>(
        document.getElementById("alertterms")
      );
      const background_color = window.matchMedia?.(
        "(prefers-color-scheme: dark)",
      ).matches
        ? "#3d3d3d"
        : "#ffffff";

      canvas_alerts.style.backgroundColor = background_color;

      const ctx_alerts: CanvasRenderingContext2D | null =
        canvas_alerts.getContext("2d");
      if (ctx_alerts != null) {
        this.#chart_alerts = new Chart(ctx_alerts, {
          // The type of chart we want to create
          type: "bar",

          // The data for our dataset
          data: {
            labels: labels,
            datasets: [
              {
                label: "Received Alert Terms",
                backgroundColor: this.#tol,
                //borderColor: 'rgb(0, 0, 0)',
                data: alert_chart_data,
                //borderWidth: 1
              },
            ],
          },

          // Configuration options go here
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              datalabels: {
                // biome-ignore lint/suspicious/noExplicitAny: chartjs-plugin-datalabels lacks proper typing
                backgroundColor: (context: any) =>
                  context.dataset.backgroundColor,
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
  }

  show_signal_chart(): void {
    if (
      typeof this.#signal_data !== "undefined" &&
      typeof this.#signal_data.levels !== "undefined"
    ) {
      const input_labels: string[] = [];
      const input_data: number[] = [];

      // This float check is a hack and will discard good data. However, for reasons I don't understand
      // The database stores whole numbers not as the input float but as an int
      // This might be an artifact of any database that was running the old acarsdec (which used whole numbers only)
      // And the matching done for signal levels in the db write function...in any case, the graph should even out the
      // missing data points
      // The ultimate result here is that anyone who had run the old acarsdec would see massive spikes on whole numbers
      // that skews the graph significantly. Removing those values smooths the graph and is more representative of what
      // really has been received with the newer, better signal levels

      for (const i in this.#signal_data.levels) {
        if (
          this.#signal_data.levels[i].level != null &&
          this.isFloat(this.#signal_data.levels[i].level)
        ) {
          input_labels.push(
            `${this.#signal_data.levels[i].level.toLocaleString()}`,
          );
          input_data.push(this.#signal_data.levels[i].count);
        }
      }
      if (this.#chart_signals) {
        this.#chart_signals.destroy();
      }

      const canvas: HTMLCanvasElement = <HTMLCanvasElement>(
        document.getElementById("signallevels")
      );

      const background_color = window.matchMedia?.(
        "(prefers-color-scheme: dark)",
      ).matches
        ? "#3d3d3d"
        : "#ffffff";

      canvas.style.backgroundColor = background_color;

      const ctx: CanvasRenderingContext2D | null = canvas.getContext("2d");
      if (ctx != null) {
        this.#chart_signals = new Chart(ctx, {
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
            maintainAspectRatio: false,
          },
        });
      }
    }
  }

  show_freqs(): void {
    if (
      typeof this.#freqs_data !== "undefined" &&
      typeof this.#freqs_data.freqs !== "undefined"
    ) {
      const freq_data_acars: number[] = [];
      const freq_data_vdlm: number[] = [];
      const freq_data_hfdl: number[] = [];
      const freq_data_imsl: number[] = [];
      const freq_data_irdm: number[] = [];

      const freq_labels_acars: string[] = [];
      const freq_labels_vdlm: string[] = [];
      const freq_labels_hfdl: string[] = [];
      const freq_labels_imsl: string[] = [];
      const freq_labels_irdm: string[] = [];

      const freq_labels_acars_positions: string[] = [];
      const freq_labels_vdlm_positions: string[] = [];
      const freq_labels_hfdl_positions: string[] = [];
      const freq_labels_imsl_positions: string[] = [];
      const freq_labels_irdm_positions: string[] = [];

      const freq_labels_acars_offset: number[] = [];
      const freq_labels_vdlm_offset: number[] = [];
      const freq_labels_hfdl_offset: number[] = [];
      const freq_labels_imsl_offset: number[] = [];
      const freq_labels_irdm_offset: number[] = [];

      let total_count_acars: number = 0;
      let total_count_vdlm: number = 0;
      let total_count_hfdl: number = 0;
      let total_count_imsl: number = 0;
      let total_count_irdm: number = 0;

      let acars_offset: number = 5;
      let vdlm_offset: number = 5;
      let hfdl_offset: number = 5;
      let imsl_offset: number = 5;
      let irdm_offset: number = 5;

      Object.entries(this.#freqs_data.freqs).forEach(([_key, value]) => {
        if (value.freq_type === "ACARS") {
          total_count_acars += value.count;
        } else if (value.freq_type === "VDL-M2") {
          total_count_vdlm += value.count;
        } else if (value.freq_type === "HFDL") {
          total_count_hfdl += value.count;
        } else if (value.freq_type === "IMS-L") {
          total_count_imsl += value.count;
        } else if (value.freq_type === "IRDM") {
          total_count_irdm += value.count;
        } else {
          console.error("Unknown freq type: " + value.freq_type);
        }
      });

      Object.entries(this.#freqs_data.freqs).forEach(([_key, value]) => {
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
        } else if (value.freq_type === "VDL-M2") {
          freq_data_vdlm.push(value.count);
          freq_labels_vdlm.push(value.freq);

          if (value.count / total_count_vdlm > 0.2) {
            freq_labels_vdlm_positions.push("center");
            freq_labels_vdlm_offset.push(0);
          } else {
            freq_labels_vdlm_positions.push("end");
            freq_labels_vdlm_offset.push(vdlm_offset);
            vdlm_offset += 60;
          }
        } else if (value.freq_type === "HFDL") {
          freq_data_hfdl.push(value.count);
          freq_labels_hfdl.push(value.freq);

          if (value.count / total_count_hfdl > 0.2) {
            freq_labels_hfdl_positions.push("center");
            freq_labels_hfdl_offset.push(0);
          } else {
            freq_labels_hfdl_positions.push("end");
            freq_labels_hfdl_offset.push(hfdl_offset);
            hfdl_offset += 60;
          }
        } else if (value.freq_type === "IMS-L") {
          freq_data_imsl.push(value.count);
          freq_labels_imsl.push(value.freq);

          if (value.count / total_count_imsl > 0.2) {
            freq_labels_imsl_positions.push("center");
            freq_labels_imsl_offset.push(0);
          } else {
            freq_labels_imsl_positions.push("end");
            freq_labels_imsl_offset.push(imsl_offset);
            imsl_offset += 60;
          }
        } else if (value.freq_type === "IRDM") {
          freq_data_irdm.push(value.count);
          freq_labels_irdm.push(value.freq);

          if (value.count / total_count_irdm > 0.2) {
            freq_labels_irdm_positions.push("center");
            freq_labels_irdm_offset.push(0);
          } else {
            freq_labels_irdm_positions.push("end");
            freq_labels_irdm_offset.push(irdm_offset);
            irdm_offset += 60;
          }
        } else {
          console.error("Unknown freq type: " + value.freq_type);
        }
      });

      if (this.#chart_frequency_data_acars !== null) {
        this.#chart_frequency_data_acars.destroy();
      }

      if (this.#chart_frequency_data_vdlm !== null) {
        this.#chart_frequency_data_vdlm.destroy();
      }

      if (this.#chart_frequency_data_hfdl !== null) {
        this.#chart_frequency_data_hfdl.destroy();
      }

      if (this.#chart_frequency_data_imsl !== null) {
        this.#chart_frequency_data_imsl.destroy();
      }

      if (this.#chart_frequency_data_irdm !== null) {
        this.#chart_frequency_data_irdm.destroy();
      }

      if (freq_data_acars.length > 0) {
        this.render_freq_graph(
          "ACARS",
          freq_labels_acars,
          freq_data_acars,
          total_count_acars,
          "frequencies_acars",
          "#acars_freq_graph",
        );
      }

      if (freq_data_vdlm.length > 0) {
        this.render_freq_graph(
          "VDLM",
          freq_labels_vdlm,
          freq_data_vdlm,
          total_count_vdlm,
          "frequencies_vdlm",
          "#vdlm_freq_graph",
        );
      }

      if (freq_data_hfdl.length > 0) {
        this.render_freq_graph(
          "HFDL",
          freq_labels_hfdl,
          freq_data_hfdl,
          total_count_hfdl,
          "frequencies_hfdl",
          "#hfdl_freq_graph",
        );
      }

      if (freq_data_imsl.length > 0) {
        this.render_freq_graph(
          "IMSL",
          freq_labels_imsl,
          freq_data_imsl,
          total_count_imsl,
          "frequencies_imsl",
          "#imsl_freq_graph",
        );
      }

      if (freq_data_irdm.length > 0) {
        this.render_freq_graph(
          "IRDM",
          freq_labels_irdm,
          freq_data_irdm,
          total_count_irdm,
          "frequencies_irdm",
          "#irdm_freq_graph",
        );
      }
    }
  }

  render_freq_graph(
    label: string,
    freq_labels: string[],
    freq_data: number[],
    total_count: number,
    canvas_id: string,
    graph_id: string,
  ) {
    let output_labels: string[] = [];
    let output_data: number[] = [];

    // If freq_data length is < 15, then we can just use the data as is
    // Otherwise, we need to aggregate the data. No need to sort, ACARS Hub already sorts the data before it's sent.
    // We will take the top 14 as is, and aggregate the rest into a single "Other" category
    // This is a hack.
    // Perhaps utilize the tooltips to show the user what freqs were aggregated into "Other". This is ugly, as possibly
    // the number of freqs aggregated into "Other" could be quite large.
    // Or lastly, keep creating new graphs with the aggregated data until we have less than 15 data points. This is ugly because
    // The UI/UX experience would be quite jarring.
    // I don't like any of these options, tbh.

    if (freq_data.length > 15) {
      let other_count: number = 0;
      for (let i = 0; i < 14; i++) {
        output_labels.push(freq_labels[i]);
        output_data.push(freq_data[i]);
      }
      for (let i = 14; i < freq_data.length; i++) {
        other_count += freq_data[i];
      }
      output_labels.push("Other");
      output_data.push(other_count);
    } else {
      output_labels = freq_labels;
      output_data = freq_data;
    }

    const canvas: HTMLCanvasElement = <HTMLCanvasElement>(
      document.getElementById(canvas_id)
    );
    const background_color = window.matchMedia?.("(prefers-color-scheme: dark)")
      .matches
      ? "#3d3d3d"
      : "#ffffff";

    canvas.style.backgroundColor = background_color;

    const ctx: CanvasRenderingContext2D | null = canvas.getContext("2d");
    if (ctx != null) {
      const temp_chart = new Chart(ctx, {
        // The type of chart we want to create
        type: "bar",

        // The data for our dataset
        data: {
          labels: output_labels,
          datasets: [
            {
              label: `${label} Frequencies`,
              backgroundColor: this.#rainbox,
              borderColor: "rgb(0, 0, 0)",
              data: output_data,
              //pointRadius: 0,
              borderWidth: 1,
            },
          ],
        },

        // Configuration options go here
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              enabled: false,
            },
            title: {
              display: true,
              text: `${label} Frequency Message Counts  (${total_count.toLocaleString()})`,
            },
            datalabels: {
              // biome-ignore lint/suspicious/noExplicitAny: chartjs-plugin-datalabels lacks proper typing
              backgroundColor: (context: any) =>
                context.dataset.backgroundColor,
              borderRadius: 4,
              color: "white",
              clamp: true,
              font: {
                weight: "bold",
              },
              formatter: (_value, context) => {
                return (
                  output_data[context.dataIndex].toLocaleString() +
                  " (" +
                  ((output_data[context.dataIndex] / total_count) * 100)
                    .toFixed(2)
                    .toLocaleString() +
                  "%)"
                );
              },
              align: "right",
              // padding: 6,
              // anchor: (context) => {
              //   return freq_labels_vdlm_positions[context.dataIndex] as
              //     | "start"
              //     | "end"
              //     | "center";
              // },
              // offset: (context) => {
              //   return freq_labels_vdlm_offset[context.dataIndex];
              // },
              clip: false,
            },
          },
        },
        plugins: [ChartDataLabels],
      });

      if (label === "ACARS") {
        this.#chart_frequency_data_acars = temp_chart;
      } else if (label === "VDLM") {
        this.#chart_frequency_data_vdlm = temp_chart;
      } else if (label === "HFDL") {
        this.#chart_frequency_data_hfdl = temp_chart;
      } else if (label === "IMSL") {
        this.#chart_frequency_data_imsl = temp_chart;
      } else if (label === "IRDM") {
        this.#chart_frequency_data_irdm = temp_chart;
      }
      // clamp the height of the parent container to the height of the chart based on the number of elements
      // this is a hack to get the chart to display properly

      $(graph_id).height(output_data.length * 50);
    }
  }

  show_count(): void {
    if (
      typeof this.#count_data !== "undefined" &&
      typeof this.#count_data.count !== "undefined"
    ) {
      const data_error: number = this.#count_data.count.non_empty_errors;
      const data_good: number = this.#count_data.count.non_empty_total;
      const data_total: number = data_error + data_good;

      const empty_error: number = this.#count_data.count.empty_errors;
      const empty_good: number = this.#count_data.count.empty_total;
      const empty_total: number = empty_error + empty_good;

      const counts_data: number[] = [data_good, data_error];

      const counts_empty: number[] = [empty_good, empty_error];
      const count_labels: string[] = [
        "Messages (No Errors)",
        "Messages (W/Errors)",
      ];

      if (this.#chart_message_counts_data !== null) {
        this.#chart_message_counts_data.destroy();
      }

      if (this.#chart_message_counts_empty !== null) {
        this.#chart_message_counts_empty.destroy();
      }
      const canvas_data: HTMLCanvasElement = <HTMLCanvasElement>(
        document.getElementById("msg_count_data")
      );
      const background_color = window.matchMedia?.(
        "(prefers-color-scheme: dark)",
      ).matches
        ? "#3d3d3d"
        : "#ffffff";

      canvas_data.style.backgroundColor = background_color;

      const ctx_data: CanvasRenderingContext2D | null =
        canvas_data.getContext("2d");
      if (ctx_data != null) {
        this.#chart_message_counts_data = new Chart(ctx_data, {
          // The type of chart we want to create
          type: "bar",

          // The data for our dataset
          data: {
            labels: count_labels,
            datasets: [
              {
                label: "Frequency Count for Messages",
                backgroundColor: this.#rainbox,
                borderColor: "rgb(0, 0, 0)",
                data: counts_data,
                //pointRadius: 0,
                borderWidth: 1,
              },
            ],
          },

          // Configuration options go here
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false,
              },
              tooltip: {
                enabled: false,
              },
              title: {
                display: true,
                text: `Non-Empty Messages (${data_total.toLocaleString()})`,
              },
              datalabels: {
                // biome-ignore lint/suspicious/noExplicitAny: chartjs-plugin-datalabels lacks proper typing
                backgroundColor: (context: any) =>
                  context.dataset.backgroundColor,
                borderRadius: 4,
                color: "white",
                font: {
                  weight: "bold",
                },
                align: "right",
                formatter: (value, _context) => {
                  return (
                    value.toLocaleString() +
                    " (" +
                    // count_labels[context.dataIndex] +
                    // "\n" +
                    ((value / data_total) * 100).toFixed(2).toLocaleString() +
                    "%) "
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
      canvas_empty.style.backgroundColor = background_color;

      const ctx_empty: CanvasRenderingContext2D | null =
        canvas_empty.getContext("2d");
      if (ctx_empty != null) {
        this.#chart_message_counts_empty = new Chart(ctx_empty, {
          // The type of chart we want to create
          type: "bar",

          // The data for our dataset
          data: {
            labels: count_labels,
            datasets: [
              {
                label: "Frequency Count for Empty Messages",
                backgroundColor: this.#rainbox,
                borderColor: "rgb(0, 0, 0)",
                data: counts_empty,
                //pointRadius: 0,
                borderWidth: 1,
              },
            ],
          },

          // Configuration options go here
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
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
                // biome-ignore lint/suspicious/noExplicitAny: chartjs-plugin-datalabels lacks proper typing
                backgroundColor: (context: any) =>
                  context.dataset.backgroundColor,
                borderRadius: 4,
                color: "white",
                font: {
                  weight: "bold",
                },
                align: "right",
                formatter: (value, _context) => {
                  return (
                    value.toLocaleString() +
                    " (" +
                    // count_labels[context.dataIndex] +
                    // "\n" +
                    ((value / empty_total) * 100).toFixed(2).toLocaleString() +
                    "%)"
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
  }

  decoders_enabled(msg: decoders): void {
    this.#acars_on = msg.acars;
    this.#vdlm_on = msg.vdlm;
    this.#hfdl_on = msg.hfdl;
    this.#imsl_on = msg.imsl;
    this.#irdm_on = msg.irdm;

    if (this.page_active)
      generate_stat_submenu(
        this.#acars_on,
        this.#vdlm_on,
        this.#hfdl_on,
        this.#imsl_on,
        this.#irdm_on,
      );
  }

  signals(msg: signal): void {
    this.#signal_data = msg;
    if (this.page_active) this.show_signal_chart();
  }

  alert_terms(msg: alert_term): void {
    this.#alert_data = msg;
    if (this.page_active) this.show_alert_chart();
  }

  signal_freqs(msg: signal_freq_data): void {
    this.#freqs_data = msg;
    if (this.page_active) this.show_freqs();
  }

  signal_count(msg: signal_count_data): void {
    this.#count_data = msg;
    if (this.page_active) this.show_count();
  }

  stats(): void {
    this.grab_freqs();
    this.grab_message_count();
  }

  isFloat(n: number): boolean {
    return Number(n) === n && n % 1 !== 0;
  }

  updatePage(): void {
    this.grab_images();
    this.grab_freqs();
    this.grab_message_count();
    this.grab_updated_graphs();
  }

  update_prefix(prefix: string): void {
    this.#image_prefix = prefix;
    this.grab_images();
  }

  grab_images(): void {
    if (!is_connected()) {
      console.log("Server disconnected, skipping image updates");
      return;
    }

    const prefix = window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "-dark"
      : "";

    $("#1hr").prop(
      "src",
      `static/images/${this.#image_prefix}1hour${prefix}.png?rand=` +
        Math.random(),
    );
    $("#6hr").prop(
      "src",
      `static/images/${this.#image_prefix}6hour${prefix}.png?rand=` +
        Math.random(),
    );
    $("#12hr").prop(
      "src",
      `static/images/${this.#image_prefix}12hour${prefix}.png?rand=` +
        Math.random(),
    );
    $("#24hr").prop(
      "src",
      `static/images/${this.#image_prefix}24hours${prefix}.png?rand=` +
        Math.random(),
    );
    $("#1wk").prop(
      "src",
      `static/images/${this.#image_prefix}1week${prefix}.png?rand=` +
        Math.random(),
    );
    $("#30day").prop(
      "src",
      `static/images/${this.#image_prefix}30days${prefix}.png?rand=` +
        Math.random(),
    );
    $("#6mon").prop(
      "src",
      `static/images/${this.#image_prefix}6months${prefix}.png?rand=` +
        Math.random(),
    );
    $("#1yr").prop(
      "src",
      `static/images/${this.#image_prefix}1year${prefix}.png?rand=` +
        Math.random(),
    );
  }

  grab_freqs(): void {
    signal_grab_freqs();
  }

  grab_message_count(): void {
    signal_grab_message_count();
  }

  grab_updated_graphs(): void {
    signal_grab_updated_graphs();
  }

  set_html(): void {
    const prefix = window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "-dark"
      : "";

    $("#log").html(`<p><div id="stat_menu"></div></p>
    <div id="stat_images">
    <div><img src="static/images/1hour${prefix}.png" id="1hr" alt="1 Hour"></div>
    <div><img src="static/images/6hour${prefix}.png" id="6hr" alt="6 Hours"></div>
    <div><img src="static/images/12hour${prefix}.png" id="12hr" alt="12 Hours"></div>
    <div><img src="static/images/24hours${prefix}.png" id="24hr" alt="24 Hours"></div>
    <div><img src="static/images/1week${prefix}.png" id="1wk" alt="1 Week"></div>
    <div><img src="static/images/30days${prefix}.png" id="30day" alt="30 Days"></div>
    <div><img src="static/images/6months${prefix}.png" id="6mon" alt="6 Months"></div>
    <div><img src="static/images/1year${prefix}.png" id="1yr" alt="1 Year"></div>
    </div>
    <div class="chart-container"><canvas id="signallevels"></canvas></div>
    <div class="chart-container"><canvas id="alertterms"></canvas></div>
    ${
      this.#acars_on
        ? '<div id="acars_freq_graph" class="chart-container"><canvas id="frequencies_acars"></canvas></div>'
        : ""
    }
    ${
      this.#vdlm_on
        ? '<div id="vdlm_freq_graph" class="chart-container"><canvas id="frequencies_vdlm"></canvas></div>'
        : ""
    }
    ${
      this.#hfdl_on
        ? '<div id="hfdl_freq_graph" class="chart-container"><canvas id="frequencies_hfdl"></canvas></div>'
        : ""
    }
    ${
      this.#imsl_on
        ? '<div id="imsl_freq_graph" class="chart-container"><canvas id="frequencies_imsl"></canvas></div>'
        : ""
    }
    ${
      this.#irdm_on
        ? '<div id="irdm_freq_graph" class="chart-container"><canvas id="frequencies_irdm"></canvas></div>'
        : ""
    }

    <div id="chart_msg_good" class="chart-container"><canvas id="msg_count_data"></div>
    <div id="chart_msg_empty" class="chart-container"><canvas id="msg_count_empty"></div>
    </p>`); // show the messages we've received
    $("#modal_text").html(
      '<a href="javascript:show_page_modal()">Settings</a>',
    );
    this.resize();
  }

  resize(_width: number = 0): void {
    $("#counts").addClass("padding-top-10");
  }
}
