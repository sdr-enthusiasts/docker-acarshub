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
import { MapContextMenu } from "../MapContextMenu";

interface RenderOpts {
  isPaused?: boolean;
  isFollowingAircraft?: boolean;
}

function renderMenu(opts: RenderOpts = {}) {
  const onClose = vi.fn();
  const onUnfollowAircraft = vi.fn();
  const onTogglePause = vi.fn();

  render(
    <MapContextMenu
      x={100}
      y={200}
      isPaused={opts.isPaused ?? false}
      isFollowingAircraft={opts.isFollowingAircraft ?? false}
      onClose={onClose}
      onUnfollowAircraft={onUnfollowAircraft}
      onTogglePause={onTogglePause}
    />,
  );

  return { onClose, onUnfollowAircraft, onTogglePause };
}

describe("MapContextMenu", () => {
  it("always renders the toggle-pause menu item", () => {
    renderMenu();
    expect(
      screen.getByRole("menuitem", { name: /pause updates/i }),
    ).toBeInTheDocument();
  });

  it("labels the toggle as 'Pause Updates' with pause icon when not paused", () => {
    renderMenu({ isPaused: false });
    const item = screen.getByRole("menuitem", { name: /pause updates/i });
    expect(item).toHaveTextContent("Pause Updates");
    // Pause icon glyph
    expect(item).toHaveTextContent("⏸");
  });

  it("labels the toggle as 'Resume Updates' with play icon when paused", () => {
    renderMenu({ isPaused: true });
    const item = screen.getByRole("menuitem", { name: /resume updates/i });
    expect(item).toHaveTextContent("Resume Updates");
    // Play icon glyph
    expect(item).toHaveTextContent("▶");
    // And the inverse label is gone
    expect(
      screen.queryByRole("menuitem", { name: /pause updates/i }),
    ).not.toBeInTheDocument();
  });

  it("hides the 'Unfollow Aircraft' item when not following", () => {
    renderMenu({ isFollowingAircraft: false });
    expect(
      screen.queryByRole("menuitem", { name: /unfollow aircraft/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the 'Unfollow Aircraft' item when following", () => {
    renderMenu({ isFollowingAircraft: true });
    expect(
      screen.getByRole("menuitem", { name: /unfollow aircraft/i }),
    ).toBeInTheDocument();
  });

  it("invokes onTogglePause and closes the menu when toggle-pause is clicked", async () => {
    const user = userEvent.setup();
    const { onTogglePause, onClose } = renderMenu();

    await user.click(screen.getByRole("menuitem", { name: /pause updates/i }));

    expect(onTogglePause).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("invokes onUnfollowAircraft and closes the menu when unfollow is clicked", async () => {
    const user = userEvent.setup();
    const { onUnfollowAircraft, onClose } = renderMenu({
      isFollowingAircraft: true,
    });

    await user.click(
      screen.getByRole("menuitem", { name: /unfollow aircraft/i }),
    );

    expect(onUnfollowAircraft).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("regression: onClose is invoked exactly once per item activation, from ContextMenu's own auto-close (NIT-09)", async () => {
    // Previously MapContextMenu's item onClick handlers called onClose()
    // themselves IN ADDITION TO the underlying ContextMenu component already
    // calling onClose() after every item click (see ContextMenu.tsx
    // handleItemClick) — a redundant double-call. This test fails (count
    // === 2) without the NIT-09 fix and passes (count === 1) with it.
    const user = userEvent.setup();
    const { onClose } = renderMenu();

    await user.click(screen.getByRole("menuitem", { name: /pause updates/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not invoke onTogglePause when unfollow is clicked", async () => {
    const user = userEvent.setup();
    const { onTogglePause } = renderMenu({ isFollowingAircraft: true });

    await user.click(
      screen.getByRole("menuitem", { name: /unfollow aircraft/i }),
    );

    expect(onTogglePause).not.toHaveBeenCalled();
  });

  it("renders both items in order when paused AND following (pause first, unfollow second)", () => {
    renderMenu({ isPaused: true, isFollowingAircraft: true });
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Resume Updates");
    expect(items[1]).toHaveTextContent("Unfollow Aircraft");
  });
});
