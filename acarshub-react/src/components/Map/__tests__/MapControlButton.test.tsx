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

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconCircleDot } from "../../icons";
import { MapControlButton } from "../MapControlButton";

describe("MapControlButton", () => {
  it("renders the icon and exposes the tooltip as aria-label", () => {
    render(
      <MapControlButton
        icon={IconCircleDot}
        active={false}
        onClick={vi.fn()}
        tooltip="Toggle range rings"
      />,
    );

    const button = screen.getByRole("button", { name: "Toggle range rings" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("type", "button");
  });

  it("applies active modifier class when active is true", () => {
    render(
      <MapControlButton
        icon={IconCircleDot}
        active={true}
        onClick={vi.fn()}
        tooltip="Range rings"
      />,
    );

    const button = screen.getByRole("button", { name: "Range rings" });
    expect(button).toHaveClass("map-control-button");
    expect(button).toHaveClass("map-control-button--active");
  });

  it("does not apply active modifier class when active is false", () => {
    render(
      <MapControlButton
        icon={IconCircleDot}
        active={false}
        onClick={vi.fn()}
        tooltip="Range rings"
      />,
    );

    const button = screen.getByRole("button", { name: "Range rings" });
    expect(button).toHaveClass("map-control-button");
    expect(button).not.toHaveClass("map-control-button--active");
  });

  it("forwards extra className without dropping the base class", () => {
    render(
      <MapControlButton
        icon={IconCircleDot}
        active={true}
        onClick={vi.fn()}
        tooltip="Range rings"
        className="extra-class another"
      />,
    );

    const button = screen.getByRole("button", { name: "Range rings" });
    expect(button).toHaveClass("map-control-button");
    expect(button).toHaveClass("map-control-button--active");
    expect(button).toHaveClass("extra-class");
    expect(button).toHaveClass("another");
  });

  it("invokes onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <MapControlButton
        icon={IconCircleDot}
        active={false}
        onClick={onClick}
        tooltip="Range rings"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Range rings" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not invoke onClick when disabled (and exposes disabled attribute)", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <MapControlButton
        icon={IconCircleDot}
        active={false}
        onClick={onClick}
        tooltip="Range rings"
        disabled
      />,
    );

    const button = screen.getByRole("button", { name: "Range rings" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows tooltip text on hover and hides it on mouse leave", async () => {
    const user = userEvent.setup();
    render(
      <MapControlButton
        icon={IconCircleDot}
        active={false}
        onClick={vi.fn()}
        tooltip="Range rings"
      />,
    );

    // Initially the tooltip span is NOT rendered (only the aria-label is present)
    expect(
      screen.queryByText("Range rings", { selector: "span" }),
    ).not.toBeInTheDocument();

    const button = screen.getByRole("button", { name: "Range rings" });
    await user.hover(button);

    expect(screen.getByText("Range rings", { selector: "span" })).toHaveClass(
      "map-control-button__tooltip",
    );

    await user.unhover(button);

    expect(
      screen.queryByText("Range rings", { selector: "span" }),
    ).not.toBeInTheDocument();
  });
});
