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

import { faFighterJet } from "@fortawesome/free-solid-svg-icons/faFighterJet";
import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MapFiltersMenu } from "../MapFiltersMenu";

describe("MapFiltersMenu", () => {
  const mockFilters = [
    {
      id: "military",
      label: "Military",
      icon: faFighterJet,
      active: false,
      onClick: vi.fn(),
    },
    {
      id: "interesting",
      label: "Interesting",
      icon: faStar,
      active: true,
      onClick: vi.fn(),
    },
  ];

  it("renders the menu button", () => {
    render(<MapFiltersMenu filters={mockFilters} />);

    const button = screen.getByRole("button", { name: /more filters/i });
    expect(button).toBeInTheDocument();
  });

  it("shows active filter count badge when filters are active", () => {
    render(<MapFiltersMenu filters={mockFilters} />);

    // One filter is active
    const badge = screen.getByText("1");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("map-filters-menu__badge");
  });

  it("does not show badge when no filters are active", () => {
    const inactiveFilters = mockFilters.map((f) => ({ ...f, active: false }));
    render(<MapFiltersMenu filters={inactiveFilters} />);

    const badge = screen.queryByText("0");
    expect(badge).not.toBeInTheDocument();
  });

  it("opens dropdown when button is clicked", async () => {
    const user = userEvent.setup();
    render(<MapFiltersMenu filters={mockFilters} />);

    const button = screen.getByRole("button", { name: /more filters/i });

    // Dropdown should not be visible initially
    expect(screen.queryByText("Military")).not.toBeInTheDocument();

    // Click button to open
    await user.click(button);

    // Dropdown should now be visible
    expect(screen.getByText("Military")).toBeInTheDocument();
    expect(screen.getByText("Interesting")).toBeInTheDocument();
  });

  it("closes dropdown when button is clicked again", async () => {
    const user = userEvent.setup();
    render(<MapFiltersMenu filters={mockFilters} />);

    const button = screen.getByRole("button", { name: /more filters/i });

    // Open dropdown
    await user.click(button);
    expect(screen.getByText("Military")).toBeInTheDocument();

    // Close dropdown
    await user.click(button);
    expect(screen.queryByText("Military")).not.toBeInTheDocument();
  });

  it("renders checkboxes for each filter", async () => {
    const user = userEvent.setup();
    render(<MapFiltersMenu filters={mockFilters} />);

    const button = screen.getByRole("button", { name: /more filters/i });
    await user.click(button);

    const militaryCheckbox = screen.getByLabelText("Military");
    const interestingCheckbox = screen.getByLabelText("Interesting");

    expect(militaryCheckbox).toBeInTheDocument();
    expect(interestingCheckbox).toBeInTheDocument();
  });

  it("reflects active state in checkbox checked status", async () => {
    const user = userEvent.setup();
    render(<MapFiltersMenu filters={mockFilters} />);

    const button = screen.getByRole("button", { name: /more filters/i });
    await user.click(button);

    const militaryCheckbox = screen.getByLabelText(
      "Military",
    ) as HTMLInputElement;
    const interestingCheckbox = screen.getByLabelText(
      "Interesting",
    ) as HTMLInputElement;

    expect(militaryCheckbox.checked).toBe(false);
    expect(interestingCheckbox.checked).toBe(true);
  });

  it("calls onClick handler when checkbox is toggled", async () => {
    const user = userEvent.setup();
    const onClickSpy = vi.fn();
    const filtersWithSpy = [
      { ...mockFilters[0], onClick: onClickSpy },
      mockFilters[1],
    ];

    render(<MapFiltersMenu filters={filtersWithSpy} />);

    const button = screen.getByRole("button", { name: /more filters/i });
    await user.click(button);

    const militaryCheckbox = screen.getByLabelText("Military");
    await user.click(militaryCheckbox);

    expect(onClickSpy).toHaveBeenCalledTimes(1);
  });

  it("closes dropdown when clicking outside", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <MapFiltersMenu filters={mockFilters} />
        <div data-testid="outside">Outside element</div>
      </div>,
    );

    const button = screen.getByRole("button", { name: /more filters/i });

    // Open dropdown
    await user.click(button);
    expect(screen.getByText("Military")).toBeInTheDocument();

    // Click outside
    const outside = screen.getByTestId("outside");
    await user.click(outside);

    // Dropdown should close
    expect(screen.queryByText("Military")).not.toBeInTheDocument();
  });

  it("closes dropdown on Escape key", async () => {
    const user = userEvent.setup();
    render(<MapFiltersMenu filters={mockFilters} />);

    const button = screen.getByRole("button", { name: /more filters/i });

    // Open dropdown
    await user.click(button);
    expect(screen.getByText("Military")).toBeInTheDocument();

    // Press Escape
    await user.keyboard("{Escape}");

    // Dropdown should close
    expect(screen.queryByText("Military")).not.toBeInTheDocument();
  });

  it("applies correct ARIA attributes", () => {
    render(<MapFiltersMenu filters={mockFilters} />);

    const button = screen.getByRole("button", { name: /more filters/i });

    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("updates ARIA expanded attribute when opened", async () => {
    const user = userEvent.setup();
    render(<MapFiltersMenu filters={mockFilters} />);

    const button = screen.getByRole("button", { name: /more filters/i });

    await user.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
  });
});
