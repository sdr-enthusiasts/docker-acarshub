import jBox from "jbox";
import "jbox/dist/jBox.all.css";

export let tooltip = {
  freq_tooltip: new jBox("Mouse", {
    title: "Frequency",
    content: "The frequency this message was received on",
    closeOnMouseleave: true,
    adjustTracker: true,
    position: {
      x: "right",
      y: "bottom",
    },
  }),

  ground_tooltip: new jBox("Mouse", {
    title: "Ground",
    content: "Is the aircraft on the ground?",
    closeOnMouseleave: true,
    adjustTracker: true,
    position: {
      x: "right",
      y: "bottom",
    },
  }),

  tail_tooltip: new jBox("Mouse", {
    title: "Tail",
    content: "The tail number of the plane",
    closeOnMouseleave: true,
    adjustTracker: true,
    position: {
      x: "right",
      y: "bottom",
    },
  }),

  flight_tooltip: new jBox("Mouse", {
    title: "Flight Number/Callsign",
    getContent: "data-jbox-content",
    closeOnMouseleave: true,
    adjustTracker: true,
    position: {
      x: "right",
      y: "bottom",
    },
  }),

  icao_tooltip: new jBox("Mouse", {
    title: "ICAO Value",
    content: "The ICAO value assigned to the aircraft",
    closeOnMouseleave: true,
    adjustTracker: true,
    position: {
      x: "right",
      y: "bottom",
    },
  }),

  level_tooltip: new jBox("Mouse", {
    title: "Signal Level",
    getContent: "data-jbox-content",
    closeOnMouseleave: true,
    adjustTracker: true,
    position: {
      x: "right",
      y: "bottom",
    },
  }),

  ack_tooltip: new jBox("Mouse", {
    title: "Acknowledgement",
    content:
      "A flag to indicate if the message is, or requires, an acknolwedgement.",
    closeOnMouseleave: true,
    adjustTracker: true,
    position: {
      x: "right",
      y: "bottom",
    },
  }),

  mode_tooltip: new jBox("Mouse", {
    title: "Mode",
    content: "A flag to indicate the mode of the message.",
    closeOnMouseleave: true,
    adjustTracker: true,
    position: {
      x: "right",
      y: "bottom",
    },
  }),

  blockid_tooltip: new jBox("Mouse", {
    title: "Block ID",
    content: "A flag to indicate the block-id of the message.",
    closeOnMouseleave: true,
    adjustTracker: true,
    position: {
      x: "right",
      y: "bottom",
    },
  }),

  msgno_tooltip: new jBox("Mouse", {
    title: "Message Number",
    content:
      "A flag to indicate the message-number. This is used in a series of messages that the receiver is meant to combine together, and the order they should be put in.",
    closeOnMouseleave: true,
    adjustTracker: true,
    position: {
      x: "right",
      y: "bottom",
    },
  }),

  response_tooltip: new jBox("Mouse", {
    title: "Response",
    content: "A flag to indicate if the message is, or requires, a response.",
    closeOnMouseleave: true,
    adjustTracker: true,
    position: {
      x: "right",
      y: "bottom",
    },
  }),

  error_tooltip: new jBox("Mouse", {
    title: "Error",
    content: "A flag to indicate if the message had any errors in decoding.",
    closeOnMouseleave: true,
    adjustTracker: true,
    position: {
      x: "right",
      y: "bottom",
    },
  }),
  // Function to close all open tool tips. This is needed so that when the page updates tooltips aren't just chilling randomly

  close_all_tooltips: function () {
    this.freq_tooltip.close();
    this.ground_tooltip.close();
    this.tail_tooltip.close();
    this.flight_tooltip.close();
    this.icao_tooltip.close();
    this.level_tooltip.close();
    this.ack_tooltip.close();
    this.mode_tooltip.close();
    this.blockid_tooltip.close();
    this.msgno_tooltip.close();
    this.response_tooltip.close();
    this.error_tooltip.close();
  },

  // Function to attach all of the tooltips to the new elements on the page

  attach_all_tooltips: function () {
    this.freq_tooltip.attach($(".freq-tooltip"));
    this.ground_tooltip.attach($(".ground-tooltip"));
    this.tail_tooltip.attach($(".tail-tooltip"));
    this.flight_tooltip.attach($(".flight-tooltip"));
    this.icao_tooltip.attach($(".icao-tooltip"));
    this.level_tooltip.attach($(".level-tooltip"));
    this.ack_tooltip.attach($(".ack-tooltip"));
    this.mode_tooltip.attach($(".mode-tooltip"));
    this.blockid_tooltip.attach($(".blockid-tooltip"));
    this.msgno_tooltip.attach($(".msgno-tooltip"));
    this.response_tooltip.attach($(".response-tooltip"));
    this.error_tooltip.attach($(".error-tooltip"));
  },
};
