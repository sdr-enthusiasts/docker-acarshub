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
import { IconCircleDot, IconCloudSunRain, IconPlaneUp } from "../../icons";
import { MapOverlaysMenu } from "../MapOverlaysMenu";

describe("MapOverlaysMenu", () => {
  const mockOverlays = [
    {
      id: "range-rings",
      label: "Range Rings",
      icon: IconCircleDot,
      active: false,
      onClick: vi.fn(),
    },
    {
      id: "nexrad",
      label: "NEXRAD Radar",
      icon: IconCloudSunRain,
      active: true,
      onClick: vi.fn(),
    },
    {
      id: "openaip",
      label: "OpenAIP Charts",
      icon: IconPlaneUp,
      active: false,
      onClick: vi.fn(),
    },
  ];

  it("renders the menu trigger button", () => {
    render(<MapOverlaysMenu overlays={mockOverlays} />);

    const button = screen.getByRole("button", { name: /map overlays/i });
    expect(button).toBeInTheDocument();
  });

  it("shows active overlay count badge when overlays are active", () => {
    render(<MapOverlaysMenu overlays={mockOverlays} />);

    // One overlay (nexrad) is active
    const badge = screen.getByText("1");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("map-overlays-menu__badge");
  });

  it("shows correct badge count when multiple overlays are active", () => {
    const multiActive = mockOverlays.map((o) => ({ ...o, active: true }));
    render(<MapOverlaysMenu overlays={multiActive} />);

    const badge = screen.getByText("3");
    expect(badge).toBeInTheDocument();
  });

  it("does not show badge when no overlays are active", () => {
    const inactiveOverlays = mockOverlays.map((o) => ({
      ...o,
      active: false,
    }));
    render(<MapOverlaysMenu overlays={inactiveOverlays} />);

    // Badge element should not be present at all
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        (_, el) => el?.classList.contains("map-overlays-menu__badge") ?? false,
      ),
    ).not.toBeInTheDocument();
  });

  it("dropdown is not visible before the button is clicked", () => {
    render(<MapOverlaysMenu overlays={mockOverlays} />);

    expect(screen.queryByText("Range Rings")).not.toBeInTheDocument();
    expect(screen.queryByText("NEXRAD Radar")).not.toBeInTheDocument();
    expect(screen.queryByText("OpenAIP Charts")).not.toBeInTheDocument();
  });

  it("opens dropdown when trigger button is clicked", async () => {
    const user = userEvent.setup();
    render(<MapOverlaysMenu overlays={mockOverlays} />);

    const button = screen.getByRole("button", { name: /map overlays/i });
    await user.click(button);

    expect(screen.getByText("Range Rings")).toBeInTheDocument();
    expect(screen.getByText("NEXRAD Radar")).toBeInTheDocument();
    expect(screen.getByText("OpenAIP Charts")).toBeInTheDocument();
  });

  it("closes dropdown when trigger button is clicked again", async () => {
    const user = userEvent.setup();
    render(<MapOverlaysMenu overlays={mockOverlays} />);

    const button = screen.getByRole("button", { name: /map overlays/i });

    await user.click(button);
    expect(screen.getByText("Range Rings")).toBeInTheDocument();

    await user.click(button);
    expect(screen.queryByText("Range Rings")).not.toBeInTheDocument();
  });

  it("renders a checkbox for each overlay in the dropdown", async () => {
    const user = userEvent.setup();
    render(<MapOverlaysMenu overlays={mockOverlays} />);

    await user.click(screen.getByRole("button", { name: /map overlays/i }));

    const rangeCheckbox = screen.getByLabelText("Range Rings");
    const nexradCheckbox = screen.getByLabelText("NEXRAD Radar");
    const oaipCheckbox = screen.getByLabelText("OpenAIP Charts");

    expect(rangeCheckbox).toBeInTheDocument();
    expect(nexradCheckbox).toBeInTheDocument();
    expect(oaipCheckbox).toBeInTheDocument();
  });

  it("reflects active state in checkbox checked status", async () => {
    const user = userEvent.setup();
    render(<MapOverlaysMenu overlays={mockOverlays} />);

    await user.click(screen.getByRole("button", { name: /map overlays/i }));

    const rangeCheckbox = screen.getByLabelText(
      "Range Rings",
    ) as HTMLInputElement;
    const nexradCheckbox = screen.getByLabelText(
      "NEXRAD Radar",
    ) as HTMLInputElement;
    const oaipCheckbox = screen.getByLabelText(
      "OpenAIP Charts",
    ) as HTMLInputElement;

    expect(rangeCheckbox.checked).toBe(false);
    expect(nexradCheckbox.checked).toBe(true);
    expect(oaipCheckbox.checked).toBe(false);
  });

  it("calls the onClick handler when a checkbox is toggled", async () => {
    const user = userEvent.setup();
    const onClickSpy = vi.fn();
    const overlaysWithSpy = [
      { ...mockOverlays[0], onClick: onClickSpy },
      ...mockOverlays.slice(1),
    ];

    render(<MapOverlaysMenu overlays={overlaysWithSpy} />);

    await user.click(screen.getByRole("button", { name: /map overlays/i }));
    await user.click(screen.getByLabelText("Range Rings"));

    expect(onClickSpy).toHaveBeenCalledTimes(1);
  });

  it("does not call other onClick handlers when one checkbox is toggled", async () => {
    const user = userEvent.setup();
    const spy0 = vi.fn();
    const spy1 = vi.fn();
    const spy2 = vi.fn();
    const overlaysWithSpies = [
      { ...mockOverlays[0], onClick: spy0 },
      { ...mockOverlays[1], onClick: spy1 },
      { ...mockOverlays[2], onClick: spy2 },
    ];

    render(<MapOverlaysMenu overlays={overlaysWithSpies} />);

    await user.click(screen.getByRole("button", { name: /map overlays/i }));
    await user.click(screen.getByLabelText("NEXRAD Radar"));

    expect(spy0).not.toHaveBeenCalled();
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).not.toHaveBeenCalled();
  });

  it("closes dropdown when clicking outside the menu", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <MapOverlaysMenu overlays={mockOverlays} />
        <div data-testid="outside">Outside element</div>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: /map overlays/i }));
    expect(screen.getByText("Range Rings")).toBeInTheDocument();

    await user.click(screen.getByTestId("outside"));
    expect(screen.queryByText("Range Rings")).not.toBeInTheDocument();
  });

  it("closes dropdown when Escape key is pressed", async () => {
    const user = userEvent.setup();
    render(<MapOverlaysMenu overlays={mockOverlays} />);

    await user.click(screen.getByRole("button", { name: /map overlays/i }));
    expect(screen.getByText("Range Rings")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText("Range Rings")).not.toBeInTheDocument();
  });

  it("sets aria-expanded to false on the trigger button by default", () => {
    render(<MapOverlaysMenu overlays={mockOverlays} />);

    const button = screen.getByRole("button", { name: /map overlays/i });
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("sets aria-expanded to true when dropdown is open", async () => {
    const user = userEvent.setup();
    render(<MapOverlaysMenu overlays={mockOverlays} />);

    const button = screen.getByRole("button", { name: /map overlays/i });
    await user.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("sets aria-expanded back to false when dropdown is closed", async () => {
    const user = userEvent.setup();
    render(<MapOverlaysMenu overlays={mockOverlays} />);

    const button = screen.getByRole("button", { name: /map overlays/i });

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("applies the open modifier class to the button when dropdown is open", async () => {
    const user = userEvent.setup();
    render(<MapOverlaysMenu overlays={mockOverlays} />);

    const button = screen.getByRole("button", { name: /map overlays/i });

    expect(button).not.toHaveClass("map-overlays-menu__button--open");

    await user.click(button);
    expect(button).toHaveClass("map-overlays-menu__button--open");

    await user.click(button);
    expect(button).not.toHaveClass("map-overlays-menu__button--open");
  });

  it("renders with an empty overlays array without crashing", () => {
    render(<MapOverlaysMenu overlays={[]} />);

    const button = screen.getByRole("button", { name: /map overlays/i });
    expect(button).toBeInTheDocument();
  });

  it("renders no dropdown items when overlays array is empty", async () => {
    const user = userEvent.setup();
    render(<MapOverlaysMenu overlays={[]} />);

    await user.click(screen.getByRole("button", { name: /map overlays/i }));

    // Dropdown renders but is empty — no checkboxes
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("regression: badge count matches exactly the number of active overlays", () => {
    const twoActive = [
      { ...mockOverlays[0], active: true },
      { ...mockOverlays[1], active: true },
      { ...mockOverlays[2], active: false },
    ];
    render(<MapOverlaysMenu overlays={twoActive} />);

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });
});
