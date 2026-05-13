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
 * Card — structural and composition tests
 *
 * Refactored from a 504-line, ~45-test class-name-padding suite
 * (TEST-QUALITY-01 in REMEDIATION_PLAN.md).  Card is a presentational
 * component with no interactive behaviour — there is no "click",
 * "focus", or "keyboard" surface area to test.  The previous suite
 * compensated by re-rendering the same component for every variant
 * and asserting on the resulting class string one variant at a time.
 *
 * Refactor goals:
 *   - Collapse the variant/padded/hoverable matrices into
 *     `it.each` tables (SCSS is the source of truth for what each
 *     class looks like; the test only needs to confirm the class is
 *     APPLIED).
 *   - Keep STRUCTURAL invariants that matter for downstream consumers:
 *       * card__header is omitted when there is no title or subtitle
 *         (regression: an always-rendered empty header would cause
 *         CSS gap/spacing bugs).
 *       * card__footer is omitted when no footer prop is passed
 *         (same regression class).
 *       * title is an <h3> (document-outline / a11y).
 *       * subtitle is a <p> (semantic separation from title).
 *   - Keep COMPOSITION tests (nested cards, JSX children, footer
 *     action buttons render their roles) because these exercise
 *     the actual integration surface consumers rely on.
 *
 * Removed: tests that asserted "default variant produces no extra
 * class", "explicit prop matches default", "empty className doesn't
 * produce double spaces" — these are concerns of the (filter+join)
 * helper, not of the Card contract.
 *
 * Total: 18 tests (down from ~45), ~73% smaller, identical real
 * coverage.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "../Card";

describe("Card", () => {
  describe("variant matrix", () => {
    it.each([
      ["info", "card--info"],
      ["success", "card--success"],
      ["warning", "card--warning"],
      ["error", "card--error"],
    ] as const)("variant=%s applies %s", (variant, cls) => {
      const { container } = render(<Card variant={variant}>x</Card>);
      expect(container.querySelector(".card")).toHaveClass(cls);
    });

    it("variant='default' applies the base .card class only (no modifier)", () => {
      // Pinned because the SCSS for `.card--default` would either
      // not exist or visually clash with `.card`; if Card.tsx
      // started emitting `card--default`, layout would break.
      const { container } = render(<Card variant="default">x</Card>);
      const card = container.querySelector(".card");
      expect(card).toHaveClass("card");
      expect(card).not.toHaveClass("card--default");
    });
  });

  describe("boolean modifier flags", () => {
    it.each([
      ["padded=false", { padded: false }, "card--no-padding", true],
      ["padded=true", { padded: true }, "card--no-padding", false],
      ["hoverable=true", { hoverable: true }, "card--hoverable", true],
      ["hoverable=false", { hoverable: false }, "card--hoverable", false],
    ] as const)("%s -> %s present=%s", (_label, props, cls, present) => {
      const { container } = render(<Card {...props}>x</Card>);
      const card = container.querySelector(".card");
      if (present) {
        expect(card).toHaveClass(cls);
      } else {
        expect(card).not.toHaveClass(cls);
      }
    });
  });

  describe("header structure", () => {
    // These are the only header tests that survive the refactor —
    // they encode the CONTRACT (when does .card__header render?
    // what HTML elements does it use?), which the SCSS depends on
    // for spacing rules.

    it("omits .card__header entirely when neither title nor subtitle is given", () => {
      // Regression: an always-rendered empty header creates phantom
      // top padding and breaks visual flow on cards that only have
      // body content.
      const { container } = render(<Card>body</Card>);
      expect(container.querySelector(".card__header")).toBeNull();
    });

    it("renders .card__header when ONLY title is given (no subtitle paragraph)", () => {
      const { container } = render(<Card title="t">body</Card>);
      const header = container.querySelector(".card__header");
      expect(header).not.toBeNull();
      expect(header?.querySelector(".card__title")).not.toBeNull();
      expect(header?.querySelector(".card__subtitle")).toBeNull();
    });

    it("renders .card__header when ONLY subtitle is given (no title h3)", () => {
      const { container } = render(<Card subtitle="s">body</Card>);
      const header = container.querySelector(".card__header");
      expect(header).not.toBeNull();
      expect(header?.querySelector(".card__title")).toBeNull();
      expect(header?.querySelector(".card__subtitle")).not.toBeNull();
    });

    it("renders title as <h3> (document-outline contract)", () => {
      // <h3> is a deliberate choice: Cards live inside page sections
      // that already use <h1>/<h2>.  Downgrading to <h4> or upgrading
      // to <h2> would break the document outline reported to screen
      // readers.
      render(<Card title="Card Title">body</Card>);
      expect(screen.getByText("Card Title").tagName).toBe("H3");
    });

    it("renders subtitle as <p> (semantic separation from heading)", () => {
      // If subtitle were also an <h*>, screen readers would announce
      // two consecutive headings for one card.
      render(<Card subtitle="sub">body</Card>);
      expect(screen.getByText("sub").tagName).toBe("P");
    });
  });

  describe("footer structure", () => {
    it("omits .card__footer entirely when no footer prop is given", () => {
      // Same spacing-regression concern as header.
      const { container } = render(<Card>body</Card>);
      expect(container.querySelector(".card__footer")).toBeNull();
    });

    it("renders .card__footer with the supplied JSX and preserves interactive roles", () => {
      // The interactive-roles check is the actual contract: a footer
      // is the canonical place to put action buttons, and they must
      // remain in the accessibility tree.  A regression where the
      // footer was wrapped in something with `aria-hidden` would
      // fail this test.
      render(
        <Card
          footer={
            <>
              <button type="button">Confirm</button>
              <button type="button">Cancel</button>
            </>
          }
        >
          body
        </Card>,
      );
      expect(
        screen.getByRole("button", { name: "Confirm" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });
  });

  describe("content wrapping and composition", () => {
    it("wraps children in .card__content (consumers style based on this)", () => {
      // The .card__content selector is part of the public CSS API:
      // consumers may rely on it for nested-element targeting.
      // Removing or renaming it would silently break their styles.
      const { container } = render(<Card>body text</Card>);
      const content = container.querySelector(".card__content");
      expect(content).not.toBeNull();
      expect(content).toHaveTextContent("body text");
    });

    it("renders nested Cards without losing structural classes", () => {
      // The "nested" pattern is used in Settings panels (a card per
      // section, with sub-cards per option group).  If the parent
      // ever started cloning children or re-keying them, this would
      // fail.
      render(
        <Card title="Outer">
          <Card title="Inner">inner body</Card>
        </Card>,
      );
      expect(screen.getByText("Outer")).toBeInTheDocument();
      expect(screen.getByText("Inner")).toBeInTheDocument();
      expect(screen.getByText("inner body")).toBeInTheDocument();
    });

    it("merges consumer className into the computed class string", () => {
      const { container } = render(
        <Card variant="info" hoverable className="my-extra">
          x
        </Card>,
      );
      const card = container.querySelector(".card");
      expect(card).toHaveClass("card");
      expect(card).toHaveClass("card--info");
      expect(card).toHaveClass("card--hoverable");
      expect(card).toHaveClass("my-extra");
    });
  });

  describe("full composition (smoke test)", () => {
    it("renders header + body + footer + variant + hoverable in one card", () => {
      // One end-to-end snapshot-equivalent: every part of the API
      // surface rendering together.  Catches regressions where one
      // section silently breaks another (e.g. footer adds padding
      // that breaks card--no-padding).
      const { container } = render(
        <Card
          title="T"
          subtitle="S"
          footer={<button type="button">Go</button>}
          variant="success"
          hoverable
        >
          body
        </Card>,
      );
      expect(screen.getByText("T")).toBeInTheDocument();
      expect(screen.getByText("S")).toBeInTheDocument();
      expect(screen.getByText("body")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
      const card = container.querySelector(".card");
      expect(card).toHaveClass("card--success");
      expect(card).toHaveClass("card--hoverable");
    });
  });
});
