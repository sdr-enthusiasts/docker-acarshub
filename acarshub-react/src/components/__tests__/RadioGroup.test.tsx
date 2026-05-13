// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * RadioGroup Component Tests
 *
 * Why this exists: RadioGroup is the SettingsModal theme picker (and
 * other mutually-exclusive choice surfaces). The contract pinned here:
 *  - Same type-preserving onChange as Select (string in -> string out;
 *    number in -> number out).
 *  - fieldset disabled propagates to all radios (browser native).
 *  - `required` is applied only to the *unchecked* radios so HTML5
 *    constraint validation doesn't fire on the already-satisfied one
 *    (subtle: required on a checked radio that user then toggles to
 *    another option would briefly mark the group invalid during the
 *    transition without this guard).
 *  - aria-describedby links the description sibling element when
 *    description is provided, omitted otherwise.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RadioGroup } from "../RadioGroup";

const STRING_OPTIONS = [
  { value: "mocha", label: "Mocha" },
  { value: "latte", label: "Latte" },
];

const NUMERIC_OPTIONS = [
  { value: 1, label: "One" },
  { value: 2, label: "Two" },
  { value: 3, label: "Three" },
];

describe("RadioGroup", () => {
  describe("rendering", () => {
    it("renders the group label as a fieldset legend", () => {
      render(
        <RadioGroup
          name="theme"
          label="Theme Preference"
          value="mocha"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
        />,
      );
      // Legend is the a11y-correct way to label a radio group; screen
      // readers announce it once when entering the fieldset.
      expect(screen.getByText("Theme Preference").tagName).toBe("LEGEND");
    });

    it("renders all options as radio inputs sharing the same name", () => {
      render(
        <RadioGroup
          name="theme"
          label="X"
          value="mocha"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
        />,
      );
      const radios = screen.getAllByRole("radio");
      expect(radios).toHaveLength(2);
      // Shared name attribute is what makes radios mutually exclusive
      // in HTML — without it, both could be selected simultaneously.
      expect(radios.every((r) => r.getAttribute("name") === "theme")).toBe(
        true,
      );
    });

    it("generates unique IDs per option by combining name + value", () => {
      render(
        <RadioGroup
          name="theme"
          label="X"
          value="mocha"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
        />,
      );
      // Format: `${name}-${option.value}`. If this scheme changed,
      // multiple RadioGroups on the same page could collide IDs and
      // break label associations.
      expect(document.getElementById("theme-mocha")).not.toBeNull();
      expect(document.getElementById("theme-latte")).not.toBeNull();
    });

    it("renders option descriptions when provided", () => {
      const opts = [
        { value: "mocha", label: "Mocha", description: "Dark theme" },
        { value: "latte", label: "Latte", description: "Light theme" },
      ];
      render(
        <RadioGroup
          name="theme"
          label="X"
          value="mocha"
          options={opts}
          onChange={vi.fn()}
        />,
      );
      expect(screen.getByText("Dark theme")).toBeInTheDocument();
      expect(screen.getByText("Light theme")).toBeInTheDocument();
    });

    it("renders help text when provided", () => {
      render(
        <RadioGroup
          name="theme"
          label="X"
          value="mocha"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
          helpText="Choose wisely"
        />,
      );
      expect(screen.getByText("Choose wisely")).toBeInTheDocument();
    });

    it("renders the required asterisk when required=true", () => {
      const { container } = render(
        <RadioGroup
          name="theme"
          label="X"
          value="mocha"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
          required={true}
        />,
      );
      expect(container.querySelector(".radio-group__required")).not.toBeNull();
    });
  });

  describe("controlled state", () => {
    it("marks only the matching option as checked", () => {
      render(
        <RadioGroup
          name="theme"
          label="X"
          value="latte"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
        />,
      );
      const mocha = screen.getByRole("radio", {
        name: /mocha/i,
      }) as HTMLInputElement;
      const latte = screen.getByRole("radio", {
        name: /latte/i,
      }) as HTMLInputElement;
      expect(mocha.checked).toBe(false);
      expect(latte.checked).toBe(true);
    });

    it("compares value with strict equality (number vs string)", () => {
      // Regression: if the component used == instead of ===, the
      // string "1" would also match value=1. Pin strict equality.
      render(
        <RadioGroup
          name="n"
          label="X"
          value={1}
          options={NUMERIC_OPTIONS}
          onChange={vi.fn()}
        />,
      );
      const one = screen.getByRole("radio", {
        name: /one/i,
      }) as HTMLInputElement;
      expect(one.checked).toBe(true);
    });
  });

  describe("onChange type-preservation", () => {
    it("emits a string when the original value was a string", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <RadioGroup
          name="theme"
          label="X"
          value="mocha"
          options={STRING_OPTIONS}
          onChange={onChange}
        />,
      );
      await user.click(screen.getByRole("radio", { name: /latte/i }));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("latte");
      expect(typeof onChange.mock.calls[0][0]).toBe("string");
    });

    it("emits a number when the original value was a number", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <RadioGroup
          name="n"
          label="X"
          value={1}
          options={NUMERIC_OPTIONS}
          onChange={onChange}
        />,
      );
      await user.click(screen.getByRole("radio", { name: /three/i }));
      // DOM exposes input.value as "3"; component must coerce to 3
      // because the original prop was numeric. Same critical contract
      // as Select — store callers do strict-equality lookups against
      // the original numeric type.
      expect(onChange).toHaveBeenCalledWith(3);
      expect(typeof onChange.mock.calls[0][0]).toBe("number");
    });
  });

  describe("disabled state", () => {
    it("disables all radios when group disabled=true", () => {
      render(
        <RadioGroup
          name="theme"
          label="X"
          value="mocha"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
          disabled={true}
        />,
      );
      // fieldset[disabled] disables all form descendants natively.
      // Each radio reports disabled=true.
      const radios = screen.getAllByRole("radio");
      expect(radios.every((r) => (r as HTMLInputElement).disabled)).toBe(true);
    });

    it("disables only the option flagged as disabled", () => {
      const opts = [
        { value: "a", label: "A" },
        { value: "b", label: "B", disabled: true },
      ];
      render(
        <RadioGroup
          name="x"
          label="X"
          value="a"
          options={opts}
          onChange={vi.fn()}
        />,
      );
      const a = screen.getByRole("radio", { name: "A" }) as HTMLInputElement;
      const b = screen.getByRole("radio", { name: "B" }) as HTMLInputElement;
      expect(a.disabled).toBe(false);
      expect(b.disabled).toBe(true);
    });
  });

  describe("required attribute placement (subtle)", () => {
    it("applies `required` only to unchecked radios", () => {
      // Why: applying `required` to *all* radios in a group is
      // redundant (one selection satisfies the constraint) and on the
      // already-checked radio it briefly fails validation during a
      // user toggling to another option. The component sets
      // required={required && !isChecked} to avoid this. Pin it.
      render(
        <RadioGroup
          name="theme"
          label="X"
          value="mocha"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
          required={true}
        />,
      );
      const mocha = screen.getByRole("radio", {
        name: /mocha/i,
      }) as HTMLInputElement;
      const latte = screen.getByRole("radio", {
        name: /latte/i,
      }) as HTMLInputElement;
      expect(mocha.checked).toBe(true);
      expect(mocha.required).toBe(false); // already checked, no constraint needed
      expect(latte.checked).toBe(false);
      expect(latte.required).toBe(true); // unchecked, constraint active
    });

    it("applies `required` to all radios when none are checked", () => {
      render(
        <RadioGroup
          name="theme"
          label="X"
          value="not-an-option"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
          required={true}
        />,
      );
      const radios = screen.getAllByRole("radio");
      expect(radios.every((r) => (r as HTMLInputElement).required)).toBe(true);
    });
  });

  describe("accessibility wiring", () => {
    it("wires aria-describedby to the description element when present", () => {
      const opts = [
        { value: "mocha", label: "Mocha", description: "Dark color scheme" },
      ];
      render(
        <RadioGroup
          name="theme"
          label="X"
          value="mocha"
          options={opts}
          onChange={vi.fn()}
        />,
      );
      const radio = screen.getByRole("radio");
      expect(radio.getAttribute("aria-describedby")).toBe("theme-mocha-desc");
      expect(document.getElementById("theme-mocha-desc")).not.toBeNull();
    });

    it("omits aria-describedby when no description is provided", () => {
      render(
        <RadioGroup
          name="theme"
          label="X"
          value="mocha"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
        />,
      );
      // Regression: dangling aria-describedby tripped axe-core in
      // earlier shapes; this matches the guard in Toggle/Select.
      const radios = screen.getAllByRole("radio");
      expect(
        radios.every((r) => r.getAttribute("aria-describedby") === null),
      ).toBe(true);
    });
  });

  describe("layout direction", () => {
    it("applies vertical modifier by default", () => {
      const { container } = render(
        <RadioGroup
          name="theme"
          label="X"
          value="mocha"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
        />,
      );
      expect(container.querySelector(".radio-group--vertical")).not.toBeNull();
    });

    it("applies horizontal modifier when direction='horizontal'", () => {
      const { container } = render(
        <RadioGroup
          name="theme"
          label="X"
          value="mocha"
          options={STRING_OPTIONS}
          onChange={vi.fn()}
          direction="horizontal"
        />,
      );
      expect(
        container.querySelector(".radio-group--horizontal"),
      ).not.toBeNull();
    });
  });
});
