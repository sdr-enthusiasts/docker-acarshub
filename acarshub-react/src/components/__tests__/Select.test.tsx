// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Select Component Tests
 *
 * Why this exists: Select is a design-system primitive used by
 * SettingsModal (theme, time format, locale), MessageFilters (label
 * type), and AlertSoundManager. The behavior most likely to regress is
 * the number-coercion path — Select preserves the *original* value
 * type, so a numeric `value` prop means onChange must receive a number,
 * not the string form HTMLSelectElement.value always returns. This
 * suite pins that, plus the a11y wiring (aria-describedby, label
 * association, required indicator) and option rendering.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Select } from "../Select";

const STRING_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "12h", label: "12-hour" },
  { value: "24h", label: "24-hour" },
];

const NUMERIC_OPTIONS = [
  { value: 5, label: "5 messages" },
  { value: 10, label: "10 messages" },
  { value: 25, label: "25 messages" },
];

describe("Select", () => {
  describe("rendering", () => {
    it("renders the label text", () => {
      render(
        <Select
          id="s1"
          label="Time Format"
          value="auto"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
        />,
      );
      expect(screen.getByText("Time Format")).toBeInTheDocument();
    });

    it("renders all options", () => {
      render(
        <Select
          id="s1"
          label="X"
          value="auto"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
        />,
      );
      // All three options should be present in the DOM under the select.
      expect(screen.getByRole("option", { name: "Auto" })).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "12-hour" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "24-hour" }),
      ).toBeInTheDocument();
    });

    it("renders help text when provided and wires aria-describedby", () => {
      render(
        <Select
          id="s1"
          label="X"
          value="auto"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
          helpText="Pick one"
        />,
      );
      expect(screen.getByText("Pick one")).toBeInTheDocument();
      expect(
        screen.getByRole("combobox").getAttribute("aria-describedby"),
      ).toBe("s1-help");
    });

    it("omits aria-describedby when no help text provided", () => {
      render(
        <Select
          id="s1"
          label="X"
          value="auto"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
        />,
      );
      // Regression: prior shape set aria-describedby unconditionally,
      // which dangled when no help element existed.
      expect(
        screen.getByRole("combobox").getAttribute("aria-describedby"),
      ).toBeNull();
    });

    it("renders the required asterisk when required=true", () => {
      const { container } = render(
        <Select
          id="s1"
          label="X"
          value="auto"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
          required={true}
        />,
      );
      expect(container.querySelector(".select-label__required")).not.toBeNull();
      // The select itself must also carry the required attribute for
      // form validation, not just visual styling.
      expect(screen.getByRole("combobox")).toBeRequired();
    });

    it("does not render the required asterisk by default", () => {
      const { container } = render(
        <Select
          id="s1"
          label="X"
          value="auto"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
        />,
      );
      expect(container.querySelector(".select-label__required")).toBeNull();
    });

    it("marks per-option disabled state when option.disabled=true", () => {
      const opts = [
        { value: "a", label: "A" },
        { value: "b", label: "B", disabled: true },
      ];
      render(
        <Select
          id="s1"
          label="X"
          value="a"
          options={opts}
          onChange={vi.fn()}
        />,
      );
      const optionB = screen.getByRole("option", {
        name: "B",
      }) as HTMLOptionElement;
      expect(optionB.disabled).toBe(true);
    });
  });

  describe("controlled value", () => {
    it("reflects the current string value on the underlying select", () => {
      render(
        <Select
          id="s1"
          label="X"
          value="24h"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
        />,
      );
      expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
        "24h",
      );
    });

    it("reflects the current numeric value on the underlying select", () => {
      render(
        <Select
          id="s1"
          label="X"
          value={10}
          options={NUMERIC_OPTIONS}
          onChange={vi.fn()}
        />,
      );
      // HTMLSelectElement.value is always a string; we assert the
      // stringified form because that is what the DOM exposes.
      expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
        "10",
      );
    });
  });

  describe("onChange type-preservation (the critical contract)", () => {
    it("emits a string when the original value was a string", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Select
          id="s1"
          label="X"
          value="auto"
          options={STRING_OPTIONS}
          onChange={onChange}
        />,
      );
      await user.selectOptions(screen.getByRole("combobox"), "24h");
      expect(onChange).toHaveBeenCalledTimes(1);
      // Critical: callers store this back via setState. If the original
      // value was a string ("auto"), the new value must remain a string
      // — strict-equality checks in reducers would otherwise misfire.
      expect(onChange).toHaveBeenCalledWith("24h");
      expect(typeof onChange.mock.calls[0][0]).toBe("string");
    });

    it("emits a number when the original value was a number", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Select
          id="s1"
          label="X"
          value={5}
          options={NUMERIC_OPTIONS}
          onChange={onChange}
        />,
      );
      await user.selectOptions(screen.getByRole("combobox"), "25");
      expect(onChange).toHaveBeenCalledTimes(1);
      // HTMLSelectElement.value returns "25"; the component coerces
      // back to Number because the original value was numeric. Without
      // this, callers like `setPageSize(25)` would receive "25" and
      // break arithmetic / strict-equality lookups.
      expect(onChange).toHaveBeenCalledWith(25);
      expect(typeof onChange.mock.calls[0][0]).toBe("number");
    });

    it("regression: numeric coercion does not produce NaN for valid options", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Select
          id="s1"
          label="X"
          value={5}
          options={NUMERIC_OPTIONS}
          onChange={onChange}
        />,
      );
      await user.selectOptions(screen.getByRole("combobox"), "10");
      // Number("10") === 10; pin this to guard against a future
      // refactor that swaps to parseInt without a radix.
      expect(onChange).toHaveBeenCalledWith(10);
      expect(Number.isNaN(onChange.mock.calls[0][0])).toBe(false);
    });
  });

  describe("disabled state", () => {
    it("disables the select element", () => {
      render(
        <Select
          id="s1"
          label="X"
          value="auto"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
          disabled={true}
        />,
      );
      expect(screen.getByRole("combobox")).toBeDisabled();
    });

    it("applies the disabled wrapper class for SCSS hooks", () => {
      const { container } = render(
        <Select
          id="s1"
          label="X"
          value="auto"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
          disabled={true}
        />,
      );
      expect(
        container.querySelector(".select-wrapper--disabled"),
      ).not.toBeNull();
    });
  });

  describe("class composition", () => {
    it("applies full-width modifier when fullWidth=true", () => {
      const { container } = render(
        <Select
          id="s1"
          label="X"
          value="auto"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
          fullWidth={true}
        />,
      );
      expect(
        container.querySelector(".select-wrapper--full-width"),
      ).not.toBeNull();
    });

    it("appends custom className without dropping base classes", () => {
      const { container } = render(
        <Select
          id="s1"
          label="X"
          value="auto"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
          className="custom-cls"
        />,
      );
      const wrapper = container.querySelector(".select-wrapper") as HTMLElement;
      expect(wrapper.classList.contains("select-wrapper")).toBe(true);
      expect(wrapper.classList.contains("custom-cls")).toBe(true);
    });

    it("does not leak falsy strings into class list", () => {
      const { container } = render(
        <Select
          id="s1"
          label="X"
          value="auto"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
        />,
      );
      const wrapper = container.querySelector(".select-wrapper") as HTMLElement;
      const classes = Array.from(wrapper.classList);
      // Guards .filter(Boolean) — a refactor to template strings would
      // emit "false" classes from `disabled && '...'` evaluating to false.
      expect(classes).not.toContain("false");
      expect(classes).not.toContain("");
    });
  });

  describe("accessibility wiring", () => {
    it("links the visible label to the select via htmlFor/id", () => {
      render(
        <Select
          id="my-select"
          label="My label"
          value="auto"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
        />,
      );
      // Clicking the label should focus the select; assert the
      // htmlFor/id wiring that makes that work.
      expect(screen.getByText("My label").getAttribute("for")).toBe(
        "my-select",
      );
      expect(screen.getByRole("combobox").getAttribute("id")).toBe("my-select");
    });

    it("marks the chevron icon as aria-hidden so screen readers skip it", () => {
      const { container } = render(
        <Select
          id="s1"
          label="X"
          value="auto"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
        />,
      );
      const icon = container.querySelector(".select-icon");
      // The ▼ glyph is decorative — without aria-hidden, screen
      // readers announce "down pointing triangle" which is noise.
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
    });
  });
});
