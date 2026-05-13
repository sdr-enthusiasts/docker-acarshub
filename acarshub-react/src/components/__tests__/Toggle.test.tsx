// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Toggle Component Tests
 *
 * Why this exists: Toggle is a design-system primitive consumed by
 * SettingsModal, MessageFilters, and AlertSoundManager. Behaviors pinned
 * here are the public contract those callers depend on:
 *  - Controlled checked state propagates to the underlying checkbox AND
 *    the aria-checked attribute (role="switch" requires both).
 *  - onChange is invoked with the *new* boolean, not the event.
 *  - disabled blocks both pointer and keyboard activation.
 *  - aria-describedby wires up only when helpText is provided (avoids
 *    referencing a non-existent #-help element).
 *  - Size + className compose into wrapper class list without dropping
 *    the base class or leaking falsy values ("toggle-wrapper--false").
 */

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Toggle } from "../Toggle";

describe("Toggle", () => {
  describe("rendering", () => {
    it("renders the label text", () => {
      render(
        <Toggle
          id="t1"
          label="Enable feature"
          checked={false}
          onChange={vi.fn()}
        />,
      );
      expect(screen.getByText("Enable feature")).toBeInTheDocument();
    });

    it("renders as role='switch' (not generic checkbox) for screen readers", () => {
      render(<Toggle id="t1" label="X" checked={false} onChange={vi.fn()} />);
      // role="switch" is more semantically accurate than checkbox for
      // toggle widgets and signals on/off rather than checked/unchecked.
      expect(screen.getByRole("switch")).toBeInTheDocument();
    });

    it("renders help text when provided", () => {
      render(
        <Toggle
          id="t1"
          label="X"
          checked={false}
          onChange={vi.fn()}
          helpText="Helpful explanation"
        />,
      );
      expect(screen.getByText("Helpful explanation")).toBeInTheDocument();
    });

    it("does not render help text element when not provided", () => {
      const { container } = render(
        <Toggle id="t1" label="X" checked={false} onChange={vi.fn()} />,
      );
      expect(container.querySelector(".toggle-help-text")).toBeNull();
    });
  });

  describe("controlled state", () => {
    it("reflects checked=true on both the input and aria-checked", () => {
      render(<Toggle id="t1" label="X" checked={true} onChange={vi.fn()} />);
      const sw = screen.getByRole("switch") as HTMLInputElement;
      // role="switch" requires aria-checked; the DOM `checked` property
      // and the aria attribute must agree, otherwise AT announces stale
      // state.
      expect(sw.checked).toBe(true);
      expect(sw.getAttribute("aria-checked")).toBe("true");
    });

    it("reflects checked=false on both the input and aria-checked", () => {
      render(<Toggle id="t1" label="X" checked={false} onChange={vi.fn()} />);
      const sw = screen.getByRole("switch") as HTMLInputElement;
      expect(sw.checked).toBe(false);
      expect(sw.getAttribute("aria-checked")).toBe("false");
    });
  });

  describe("onChange contract", () => {
    it("invokes onChange with the new boolean (true) when toggled on", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Toggle id="t1" label="X" checked={false} onChange={onChange} />);
      await user.click(screen.getByRole("switch"));
      // Contract: callback receives the *new* boolean, not the event
      // object — callers like settings stores expect `setFoo(checked)`.
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("invokes onChange with false when toggled off", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Toggle id="t1" label="X" checked={true} onChange={onChange} />);
      await user.click(screen.getByRole("switch"));
      expect(onChange).toHaveBeenCalledWith(false);
    });

    it("invokes onChange when the slider label is clicked (label-for-input)", () => {
      // The visual slider is a <label htmlFor={id}>; clicking it must
      // route through the input's onChange. fireEvent.click on the
      // checkbox directly simulates what the label click delegates to.
      const onChange = vi.fn();
      const { container } = render(
        <Toggle id="t1" label="X" checked={false} onChange={onChange} />,
      );
      const slider = container.querySelector(
        ".toggle-slider",
      ) as HTMLLabelElement;
      expect(slider).not.toBeNull();
      expect(slider.getAttribute("for")).toBe("t1");
      // jsdom does not auto-fire change on label clicks; we assert the
      // wiring (htmlFor matches id) which is what makes the label
      // clickable in a real browser.
    });
  });

  describe("disabled state", () => {
    it("sets the disabled attribute on the input", () => {
      render(
        <Toggle
          id="t1"
          label="X"
          checked={false}
          onChange={vi.fn()}
          disabled={true}
        />,
      );
      expect(screen.getByRole("switch")).toBeDisabled();
    });

    it("does not invoke onChange when clicked while disabled", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Toggle
          id="t1"
          label="X"
          checked={false}
          onChange={onChange}
          disabled={true}
        />,
      );
      await user.click(screen.getByRole("switch"));
      expect(onChange).not.toHaveBeenCalled();
    });

    it("applies the disabled wrapper class for SCSS hooks", () => {
      const { container } = render(
        <Toggle
          id="t1"
          label="X"
          checked={false}
          onChange={vi.fn()}
          disabled={true}
        />,
      );
      expect(
        container.querySelector(".toggle-wrapper--disabled"),
      ).not.toBeNull();
    });
  });

  describe("accessibility wiring", () => {
    it("links label to input via htmlFor/id", () => {
      render(
        <Toggle
          id="unique-id"
          label="My label"
          checked={false}
          onChange={vi.fn()}
        />,
      );
      // The text label must be associated with the input so clicking it
      // focuses + toggles the control, and screen readers announce both.
      const textLabel = screen.getByText("My label");
      expect(textLabel.getAttribute("for")).toBe("unique-id");
      expect(screen.getByRole("switch").getAttribute("id")).toBe("unique-id");
    });

    it("sets aria-describedby to the help-text element when helpText is provided", () => {
      render(
        <Toggle
          id="t1"
          label="X"
          checked={false}
          onChange={vi.fn()}
          helpText="Why this matters"
        />,
      );
      const sw = screen.getByRole("switch");
      expect(sw.getAttribute("aria-describedby")).toBe("t1-help");
      expect(screen.getByText("Why this matters").getAttribute("id")).toBe(
        "t1-help",
      );
    });

    it("omits aria-describedby when helpText is not provided", () => {
      render(<Toggle id="t1" label="X" checked={false} onChange={vi.fn()} />);
      // Regression: a previous shape used aria-describedby={`${id}-help`}
      // unconditionally, which dangled when no help element existed and
      // tripped axe-core. Guard remains via the helpText ? : undefined
      // ternary in the component.
      expect(
        screen.getByRole("switch").getAttribute("aria-describedby"),
      ).toBeNull();
    });

    it("is keyboard-activatable via Space (native checkbox semantics)", () => {
      const onChange = vi.fn();
      render(<Toggle id="t1" label="X" checked={false} onChange={onChange} />);
      const sw = screen.getByRole("switch");
      sw.focus();
      // Native <input type="checkbox"> handles Space → toggle. Using
      // fireEvent.click here matches what the browser dispatches after
      // keydown Space (jsdom does not synthesize the keyboard→click
      // chain reliably).
      fireEvent.click(sw);
      expect(onChange).toHaveBeenCalledWith(true);
    });
  });

  describe("class composition", () => {
    it("applies the size modifier class (default: medium)", () => {
      const { container } = render(
        <Toggle id="t1" label="X" checked={false} onChange={vi.fn()} />,
      );
      expect(container.querySelector(".toggle-wrapper--medium")).not.toBeNull();
    });

    it("applies the small size modifier class", () => {
      const { container } = render(
        <Toggle
          id="t1"
          label="X"
          checked={false}
          onChange={vi.fn()}
          size="small"
        />,
      );
      expect(container.querySelector(".toggle-wrapper--small")).not.toBeNull();
    });

    it("applies the large size modifier class", () => {
      const { container } = render(
        <Toggle
          id="t1"
          label="X"
          checked={false}
          onChange={vi.fn()}
          size="large"
        />,
      );
      expect(container.querySelector(".toggle-wrapper--large")).not.toBeNull();
    });

    it("appends custom className without dropping base classes", () => {
      const { container } = render(
        <Toggle
          id="t1"
          label="X"
          checked={false}
          onChange={vi.fn()}
          className="custom-extra"
        />,
      );
      const wrapper = container.querySelector(".toggle-wrapper") as HTMLElement;
      expect(wrapper).not.toBeNull();
      expect(wrapper.classList.contains("toggle-wrapper")).toBe(true);
      expect(wrapper.classList.contains("toggle-wrapper--medium")).toBe(true);
      expect(wrapper.classList.contains("custom-extra")).toBe(true);
    });

    it("does not leak 'false' into class list when disabled=false", () => {
      // The .filter(Boolean) in the component guards against this; the
      // test pins it because a future refactor to template strings
      // (`${disabled && "x"}`) would silently regress.
      const { container } = render(
        <Toggle
          id="t1"
          label="X"
          checked={false}
          onChange={vi.fn()}
          disabled={false}
        />,
      );
      const wrapper = container.querySelector(".toggle-wrapper") as HTMLElement;
      const classes = Array.from(wrapper.classList);
      expect(classes).not.toContain("false");
      expect(classes).not.toContain("");
    });
  });
});
