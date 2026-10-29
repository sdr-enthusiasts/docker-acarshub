// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Icon Component Tests
 *
 * Why this exists: every icon in components/icons is a module-level
 * component rendering the shared SvgIcon. These tests pin the contract all
 * call sites rely on, for every exported icon:
 *  - decorative defaults (aria-hidden, focusable="false") so icons are
 *    skipped by assistive tech unless a caller opts in;
 *  - the `.icon` class (SCSS sizing) is always present and a caller's
 *    className is merged rather than replacing it;
 *  - remaining SVG props are forwarded and may override the defaults;
 *  - each icon has its own viewBox and path data (guards against a
 *    copy-paste slip when adding icons).
 */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { IconComponent, IconProps } from "../icons";
import * as icons from "../icons";

const iconEntries = Object.entries(icons).filter(
  (entry): entry is [string, IconComponent] => typeof entry[1] === "function",
);

function renderSvg(Icon: IconComponent, props: IconProps = {}): SVGSVGElement {
  const { container } = render(<Icon {...props} />);
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("icon did not render an <svg>");
  return svg;
}

describe("icons", () => {
  it("exports icon components", () => {
    expect(iconEntries.length).toBeGreaterThan(0);
  });

  describe.each(iconEntries)("%s", (_name, Icon) => {
    it("renders a decorative svg with the icon class and a single path", () => {
      const svg = renderSvg(Icon);

      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("focusable")).toBe("false");
      expect(svg.getAttribute("class")).toBe("icon");
      expect(svg.getAttribute("viewBox")).toMatch(/^0 0 \d+ \d+$/);

      const paths = svg.querySelectorAll("path");
      expect(paths).toHaveLength(1);
      expect(paths[0].getAttribute("fill")).toBe("currentColor");
      expect(paths[0].getAttribute("d")).toBeTruthy();
    });

    it("merges a caller className with the icon class", () => {
      const svg = renderSvg(Icon, { className: "spin large" });
      expect(svg.getAttribute("class")).toBe("icon spin large");
    });

    it("forwards SVG props and lets them override the defaults", () => {
      const svg = renderSvg(Icon, {
        width: 12,
        "aria-hidden": false,
        "aria-label": "Close",
      });
      expect(svg.getAttribute("width")).toBe("12");
      expect(svg.getAttribute("aria-hidden")).toBe("false");
      expect(svg.getAttribute("aria-label")).toBe("Close");
    });
  });

  it("gives every distinct icon its own path data", () => {
    // IconTimes is a deliberate alias of IconXmark; dedupe by component.
    const distinct = new Set(iconEntries.map(([, Icon]) => Icon));
    const pathData = [...distinct].map(
      (Icon) => renderSvg(Icon).querySelector("path")?.getAttribute("d") ?? "",
    );
    expect(new Set(pathData).size).toBe(pathData.length);
  });
});
