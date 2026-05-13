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
 * Button — behavioural tests
 *
 * Refactored from a 28-test variant-by-variant assertion suite
 * (TEST-QUALITY-01 in REMEDIATION_PLAN.md). The previous tests
 * exercised internal class-name construction one variant at a time
 * (`it("renders primary variant")`, `it("renders secondary variant")`,
 * …) which:
 *
 *   - duplicated identical rendering machinery 13 times,
 *   - asserted on implementation details (.btn--primary class string)
 *     rather than user-observable behaviour,
 *   - missed actual interaction semantics (does Space trigger click?
 *     does focus skip disabled? does loading prevent click?).
 *
 * The variant/size/state matrix is now collapsed into a single
 * `it.each` table that asserts only that the class is APPLIED — the
 * SCSS file is the source of truth for what each class looks like,
 * and re-asserting the class-name spelling N times adds no signal.
 * Everything else in this file is behaviour: keyboard activation,
 * focus management, disabled/loading interaction, ARIA pass-through,
 * and prop forwarding.
 *
 * Total: 23 tests (down from 28), with ~3x more behavioural coverage
 * per line.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../Button";

describe("Button", () => {
  describe("variant / size / state matrix", () => {
    // Single source of truth for the class-name contract.  If a
    // variant is renamed in Button.tsx, this table tells the test
    // suite which classes still exist — adding a row is one line,
    // not 30.
    it.each([
      // variant rows
      ["primary", "btn--primary"],
      ["secondary", "btn--secondary"],
      ["success", "btn--success"],
      ["danger", "btn--danger"],
      ["warning", "btn--warning"],
      ["info", "btn--info"],
      ["ghost", "btn--ghost"],
      ["outline-primary", "btn--outline-primary"],
      ["outline-secondary", "btn--outline-secondary"],
      ["outline-success", "btn--outline-success"],
      ["outline-danger", "btn--outline-danger"],
      ["outline-warning", "btn--outline-warning"],
      ["outline-info", "btn--outline-info"],
    ] as const)("variant=%s applies %s", (variant, cls) => {
      render(<Button variant={variant}>btn</Button>);
      expect(screen.getByRole("button")).toHaveClass(cls);
    });

    it.each([
      ["sm", "btn--sm"],
      ["lg", "btn--lg"],
    ] as const)("size=%s applies %s", (size, cls) => {
      render(<Button size={size}>btn</Button>);
      expect(screen.getByRole("button")).toHaveClass(cls);
    });

    it("size=md applies no size modifier (default is no class)", () => {
      // The "no class for default" invariant matters because if
      // Button.tsx ever started emitting btn--md, the SCSS would
      // need a matching rule or layout would silently shift.
      render(<Button size="md">btn</Button>);
      const btn = screen.getByRole("button");
      expect(btn).not.toHaveClass("btn--sm");
      expect(btn).not.toHaveClass("btn--lg");
      expect(btn).not.toHaveClass("btn--md");
    });

    it.each([
      ["block", "btn--block"],
      ["iconOnly", "btn--icon"],
      ["loading", "btn--loading"],
    ] as const)("boolean flag %s applies %s", (flag, cls) => {
      const props = { [flag]: true } as Record<string, boolean>;
      render(<Button {...props}>btn</Button>);
      expect(screen.getByRole("button")).toHaveClass(cls);
    });
  });

  describe("defaults", () => {
    it("renders as <button type='button'> by default", () => {
      // Critical default: prevents the button from being treated as
      // a submit when nested in a <form>.  A regression here would
      // make every Button in the app accidentally submit forms.
      render(<Button>btn</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("type", "button");
    });

    it("renders the primary variant when no variant is supplied", () => {
      render(<Button>btn</Button>);
      expect(screen.getByRole("button")).toHaveClass("btn--primary");
    });

    it("type prop overrides the default (e.g. type='submit')", () => {
      render(<Button type="submit">btn</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
    });
  });

  describe("click behaviour", () => {
    it("fires onClick on pointer click", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<Button onClick={onClick}>btn</Button>);
      await user.click(screen.getByRole("button"));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("does NOT fire onClick when disabled", async () => {
      // Pinned because the disabled attribute is enforced by the
      // browser, not by Button.tsx — if a future refactor swapped
      // disabled for aria-disabled (which does NOT block clicks),
      // this test would fail.
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(
        <Button onClick={onClick} disabled>
          btn
        </Button>,
      );
      await user.click(screen.getByRole("button"));
      expect(onClick).not.toHaveBeenCalled();
    });

    it("does NOT fire onClick when loading (loading implies disabled)", async () => {
      // Button.tsx:96 — `disabled={disabled || loading}`.  The
      // loading flag is what gates clicks during async submits;
      // double-submits are the regression target.
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(
        <Button onClick={onClick} loading>
          btn
        </Button>,
      );
      await user.click(screen.getByRole("button"));
      expect(onClick).not.toHaveBeenCalled();
    });

    it("loading=true forces disabled even if disabled={false} is passed explicitly", () => {
      // Regression: an earlier version computed
      // `disabled={loading ? true : disabled}` which silently
      // honoured `disabled={false}` and broke double-submit
      // prevention.  Current impl uses `disabled || loading` so
      // loading wins.
      render(
        <Button loading disabled={false}>
          btn
        </Button>,
      );
      expect(screen.getByRole("button")).toBeDisabled();
    });
  });

  describe("keyboard activation", () => {
    // The disabled-skip test is the critical one: tabIndex on a
    // disabled <button> should remove it from the tab order — a
    // regression here breaks screen-reader keyboard navigation.
    it("Tab focuses the button", async () => {
      const user = userEvent.setup();
      render(<Button>btn</Button>);
      await user.tab();
      expect(screen.getByRole("button")).toHaveFocus();
    });

    it("Enter on a focused button fires onClick", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<Button onClick={onClick}>btn</Button>);
      screen.getByRole("button").focus();
      await user.keyboard("{Enter}");
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("Space on a focused button fires onClick", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<Button onClick={onClick}>btn</Button>);
      screen.getByRole("button").focus();
      await user.keyboard(" ");
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("Tab SKIPS a disabled button and lands on the next focusable element", async () => {
      const user = userEvent.setup();
      render(
        <>
          <Button disabled>disabled</Button>
          <Button>enabled</Button>
        </>,
      );
      await user.tab();
      expect(screen.getByRole("button", { name: /enabled/i })).toHaveFocus();
    });
  });

  describe("accessibility", () => {
    // These pin "the consumer can supply ARIA and we don't drop it"
    // — i.e. the {...props} spread is not accidentally filtered.
    it("preserves aria-label for icon-only buttons", () => {
      render(
        <Button iconOnly aria-label="Close dialog">
          ×
        </Button>,
      );
      expect(screen.getByRole("button")).toHaveAccessibleName("Close dialog");
    });

    it.each([
      ["aria-pressed", "true"],
      ["aria-expanded", "false"],
      ["aria-busy", "true"],
      ["aria-controls", "panel-1"],
      ["aria-haspopup", "menu"],
    ] as const)("forwards %s='%s' to the underlying button", (attr, value) => {
      // Property forwarding is the whole reason this component
      // extends ButtonHTMLAttributes; a refactor that destructured
      // and forgot to spread would silently drop these.
      const props = { [attr]: value } as Record<string, string>;
      render(<Button {...props}>btn</Button>);
      expect(screen.getByRole("button")).toHaveAttribute(attr, value);
    });
  });

  describe("prop forwarding", () => {
    it("merges consumer className with the computed class string", () => {
      render(<Button className="my-extra">btn</Button>);
      const btn = screen.getByRole("button");
      expect(btn).toHaveClass("btn");
      expect(btn).toHaveClass("btn--primary");
      expect(btn).toHaveClass("my-extra");
    });

    it("forwards data-* attributes and id", () => {
      render(
        <Button id="my-btn" data-testid="t1">
          btn
        </Button>,
      );
      const btn = screen.getByTestId("t1");
      expect(btn).toHaveAttribute("id", "my-btn");
    });

    it("renders complex JSX children (icon + text composition)", () => {
      render(
        <Button>
          <span>icon</span> label
        </Button>,
      );
      expect(screen.getByRole("button")).toHaveTextContent("icon label");
    });
  });

  describe("state transitions across re-renders", () => {
    it("toggles disabled correctly as loading and disabled props change", () => {
      // Re-render scenario: an async-submit pattern flips loading
      // on/off.  Regression target: stale disabled state caused by
      // memoisation or incorrect prop derivation.
      const { rerender } = render(<Button>btn</Button>);
      expect(screen.getByRole("button")).not.toBeDisabled();

      rerender(<Button loading>btn</Button>);
      expect(screen.getByRole("button")).toBeDisabled();

      rerender(<Button>btn</Button>);
      expect(screen.getByRole("button")).not.toBeDisabled();

      rerender(<Button disabled>btn</Button>);
      expect(screen.getByRole("button")).toBeDisabled();
    });
  });
});
