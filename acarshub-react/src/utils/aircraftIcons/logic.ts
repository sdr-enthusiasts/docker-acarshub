// Copyright (C) 2022-2026 Frederick Clausen II
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

/**
 * Aircraft icon generation logic
 * Ported from legacy acarshub-typescript/src/js-other/aircraft_icons.js
 * Original source: wiedehopf/tar1090
 * https://raw.githubusercontent.com/wiedehopf/tar1090/refs/heads/master/html/markers.js
 *
 * Generates SVG icons for aircraft based on:
 * - Type designator (e.g., "B738", "A320")
 * - Type description (e.g., "L2J", "H")
 * - Category (e.g., "A1", "A3")
 *
 * GOD-06: extracted from utils/aircraftIcons.ts (1510 lines). The lookup
 * tables this logic consumes (shapes, TypeDesignatorIcons,
 * TypeDescriptionIcons, CategoryIcons) live in data.ts.
 */

import {
  CategoryIcons,
  shapes,
  TypeDescriptionIcons,
  TypeDesignatorIcons,
} from "./data";

interface IconResult {
  name: string;
  scale: number;
}

export interface SVGResult {
  svg: string;
  width: number;
  height: number;
}

/**
 * Get the base marker icon name and scale for an aircraft
 * Based on type designator, description, category, etc.
 *
 * @param category - ADS-B category (e.g., "A3")
 * @param typeDesignator - ICAO type designator (e.g., "B738")
 * @param typeDescription - Type description (e.g., "L2J")
 * @param wtc - Wake turbulence category
 * @param altitude - Altitude (or "ground" for ground vehicles)
 * @returns Icon name and scale factor
 */
export function getBaseMarker(
  category?: string,
  typeDesignator?: string,
  typeDescription?: string,
  wtc?: string | null,
  altitude?: number | string,
): IconResult {
  if (typeDesignator && typeDesignator in TypeDesignatorIcons) {
    const shape = TypeDesignatorIcons[typeDesignator][0];
    const scaling = TypeDesignatorIcons[typeDesignator][1];
    return { name: shape, scale: scaling };
  }

  if (typeDescription != null && typeDescription.length === 3) {
    if (wtc !== null && wtc !== undefined && wtc.length === 1) {
      const typeDescriptionWithWtc = typeDescription + "-" + wtc;
      if (typeDescriptionWithWtc === "L2J-M" && category === "A2") {
        return { name: "jet_swept", scale: 1 };
      }
      if (typeDescriptionWithWtc in TypeDescriptionIcons) {
        const shape = TypeDescriptionIcons[typeDescriptionWithWtc][0];
        const scaling = TypeDescriptionIcons[typeDescriptionWithWtc][1];
        return { name: shape, scale: scaling };
      }
    }

    if (typeDescription in TypeDescriptionIcons) {
      const shape = TypeDescriptionIcons[typeDescription][0];
      const scaling = TypeDescriptionIcons[typeDescription][1];
      return { name: shape, scale: scaling };
    }

    const basicType = typeDescription.charAt(0);
    if (basicType in TypeDescriptionIcons) {
      return { name: TypeDescriptionIcons[basicType][0], scale: 1 };
    }
  }

  if (category && category in CategoryIcons) {
    return {
      name: CategoryIcons[category][0],
      scale: CategoryIcons[category][1],
    };
  }

  if (altitude === "ground") {
    return { name: "ground_square", scale: 1 };
  }

  return { name: "unknown", scale: 1 };
}

export function svgShapeToURI(
  shapeName: string,
  strokeWidth = 0.5,
  scale = 1.0,
  color = "#ffffff",
): SVGResult {
  const shape = shapes[shapeName] || shapes.unknown;

  // Apply stroke scale if defined
  const finalStrokeWidth = strokeWidth * (shape.strokeScale || 1.0);
  const wi = shape.w * scale;
  const he = shape.h * scale;

  // If shape has pre-defined SVG string, use it
  if (shape.svg) {
    const svg = shape.svg
      .replace("fillColor", color)
      .replace("strokeColor", "#000000")
      .replace("strokeWidth", String(finalStrokeWidth))
      .replace("SIZE", `width="${wi}px" height="${he}px"`);

    return {
      svg: `data:image/svg+xml;base64,${btoa(svg)}`,
      width: wi,
      height: he,
    };
  }

  // Build SVG from path
  let svg =
    `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="${shape.viewBox || "0 0 32 32"}" ` +
    (shape.noAspect
      ? 'preserveAspectRatio="none" '
      : 'preserveAspectRatio="xMidYMid meet" ') +
    ">" +
    "<g" +
    (shape.transform ? ` transform="${shape.transform}"` : "") +
    ">";

  // Add main path(s)
  const paths = Array.isArray(shape.path) ? shape.path : [shape.path || ""];
  for (const path of paths) {
    svg += `<path fill="${color}" stroke="#000000" stroke-width="${2 * finalStrokeWidth}" paint-order="stroke" d="${path}"/>`;
  }

  // Add accent path(s) if present
  if (shape.accent) {
    const accentWidth =
      0.6 *
      (shape.accentMult
        ? shape.accentMult * finalStrokeWidth
        : finalStrokeWidth);
    const accents = Array.isArray(shape.accent) ? shape.accent : [shape.accent];
    for (const accent of accents) {
      svg += `<path fill="none" stroke="#000000" stroke-width="${accentWidth}" d="${accent}"/>`;
    }
  }

  svg += "</g></svg>";

  return {
    svg: `data:image/svg+xml;base64,${btoa(svg)}`,
    width: wi,
    height: he,
  };
}

/**
 * Get aircraft icon color based on state or decoder type
 *
 * Uses CSS variables for theme-aware colors
 *
 * @param hasAlerts - Aircraft has active alerts
 * @param hasMessages - Aircraft has ACARS messages
 * @param altitude - Current altitude (number or "ground" literal)
 * @param colorByDecoder - Color by decoder type instead of message state
 * @param decoderType - Decoder type (ACARS, VDLM, HFDL, IMSL, IRDM)
 * @param groundThreshold - Altitude threshold (ft MSL) for "on ground" color
 * @returns Hex color code from current theme
 */
export function getAircraftColor(
  hasAlerts: boolean,
  hasMessages: boolean,
  altitude?: number | "ground",
  colorByDecoder = false,
  decoderType?: string,
  groundThreshold = 500,
): string {
  // Get computed CSS variables from document root
  const root = document.documentElement;
  const computedStyle = getComputedStyle(root);

  // Alert always takes priority
  if (hasAlerts) {
    return computedStyle.getPropertyValue("--color-red").trim();
  }

  // Color by decoder type (if enabled and decoder type is available)
  if (colorByDecoder && decoderType) {
    const normalizedType = decoderType.toUpperCase();
    switch (normalizedType) {
      case "ACARS":
        return computedStyle.getPropertyValue("--color-blue").trim();
      case "VDLM":
      case "VDL-M2":
        return computedStyle.getPropertyValue("--color-green").trim();
      case "HFDL":
        return computedStyle.getPropertyValue("--color-yellow").trim();
      case "IMSL":
        return computedStyle.getPropertyValue("--color-peach").trim();
      case "IRDM":
        return computedStyle.getPropertyValue("--color-mauve").trim();
    }
  }

  // Has ACARS messages = Catppuccin green (legacy message state coloring)
  if (hasMessages) {
    return computedStyle.getPropertyValue("--color-green").trim();
  }

  // Ground = Catppuccin overlay1 (gray)
  // Check for "ground" literal OR altitude at/below threshold
  if (
    altitude === "ground" ||
    (typeof altitude === "number" && altitude <= groundThreshold)
  ) {
    return computedStyle.getPropertyValue("--color-overlay1").trim();
  }

  // Default = Catppuccin text (adapts to theme)
  return computedStyle.getPropertyValue("--color-text").trim();
}

/**
 * Check if a shape should rotate with aircraft heading
 *
 * @param shapeName - Name of the shape
 * @returns True if shape should rotate
 */
export function shouldRotate(shapeName: string): boolean {
  const shape = shapes[shapeName];
  return !shape?.noRotate;
}
