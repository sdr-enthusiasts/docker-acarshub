import jBox from "jbox";
import "jbox/dist/jBox.all.css";

// TODO: figure why "Mouse" isn't in the jBox acceptable types

// @ts-expect-error
const freq_tooltip = new jBox("Mouse", {
  title: "Frequency",
  content: "The frequency this message was received on",
  closeOnMouseleave: true,
  adjustTracker: true,
  position: {
    x: "right",
    y: "bottom",
  },
});

// @ts-expect-error
const ground_tooltip = new jBox("Mouse", {
  title: "Ground",
  content: "Is the aircraft on the ground?",
  closeOnMouseleave: true,
  adjustTracker: true,
  position: {
    x: "right",
    y: "bottom",
  },
});

// @ts-expect-error
const tail_tooltip = new jBox("Mouse", {
  title: "Tail",
  content: "The tail number of the plane",
  closeOnMouseleave: true,
  adjustTracker: true,
  position: {
    x: "right",
    y: "bottom",
  },
});

// @ts-expect-error
const flight_tooltip = new jBox("Mouse", {
  title: "Flight Number/Callsign",
  getContent: "data-jbox-content",
  closeOnMouseleave: true,
  adjustTracker: true,
  position: {
    x: "right",
    y: "bottom",
  },
});

// @ts-expect-error
const icao_tooltip = new jBox("Mouse", {
  title: "ICAO Value",
  content: "The ICAO value assigned to the aircraft",
  closeOnMouseleave: true,
  adjustTracker: true,
  position: {
    x: "right",
    y: "bottom",
  },
});
// @ts-expect-error
const level_tooltip = new jBox("Mouse", {
  title: "Signal Level",
  getContent: "data-jbox-content",
  closeOnMouseleave: true,
  adjustTracker: true,
  position: {
    x: "right",
    y: "bottom",
  },
});
// Function to close all open tool tips. This is needed so that when the page updates tooltips aren't just chilling randomly

export function close_all_tooltips() {
  freq_tooltip.close();
  ground_tooltip.close();
  tail_tooltip.close();
  flight_tooltip.close();
  icao_tooltip.close();
  level_tooltip.close();
}

// Function to attach all of the tooltips to the new elements on the page

export function attach_all_tooltips() {
  // Stop ts errors
  // TODO: Figure out why it gives a jquery TS error...
  // @ts-expect-error
  freq_tooltip.attach(".freq-tooltip");
  // @ts-expect-error
  ground_tooltip.attach(".ground-tooltip");
  // @ts-expect-error
  tail_tooltip.attach(".tail-tooltip");
  // @ts-expect-error
  flight_tooltip.attach(".flight-tooltip");
  // @ts-expect-error
  icao_tooltip.attach(".icao-tooltip");
  // @ts-expect-error
  level_tooltip.attach(".level-tooltip");
}
