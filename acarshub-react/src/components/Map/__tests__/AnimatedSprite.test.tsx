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

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedSprite } from "../AnimatedSprite";

// Mock the spriteLoader module so tests don't depend on the real spritesheet
// (which requires async load + atlas data). We return a fixed position per
// (spriteName, frameIndex) pair so we can verify frame cycling drives the
// CSS variables.
const getSpritePosition = vi.fn();
const getCSSBackgroundSize = vi.fn();

vi.mock("../../../utils/spriteLoader", () => ({
  getSpriteLoader: () => ({
    getSpritePosition,
    getCSSBackgroundSize,
  }),
}));

function defaultProps(
  overrides: Partial<React.ComponentProps<typeof AnimatedSprite>> = {},
) {
  return {
    spriteName: "plane-medium",
    spriteClass: "aircraft-sprite--medium",
    frames: [0],
    frameTime: 100,
    rotation: 45,
    onClick: vi.fn(),
    onMouseEnter: vi.fn(),
    onMouseLeave: vi.fn(),
    isHovered: false,
    hasUnreadMessages: false,
    ariaLabel: "Aircraft UAL123",
    cursorStyle: "pointer" as const,
    ...overrides,
  };
}

describe("AnimatedSprite", () => {
  beforeEach(() => {
    getSpritePosition.mockImplementation((_name: string, frame: number) => ({
      x: 10 + frame * 100, // distinct per frame so we can detect cycling
      y: 20,
      width: 48,
      height: 48,
    }));
    getCSSBackgroundSize.mockReturnValue("345.6px 1468.8px");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("Basic rendering", () => {
    it("renders a button with the supplied aria-label", () => {
      render(<AnimatedSprite {...defaultProps()} />);
      expect(
        screen.getByRole("button", { name: "Aircraft UAL123" }),
      ).toBeInTheDocument();
    });

    // FEAT-MARKER-SIZE: the button is now a 44px-floored hit-target wrapper
    // (.aircraft-marker-hit); the visual sprite lives on a decorative inner
    // <span> so growing the hit target never distorts the atlas crop.
    it("wraps the visual sprite in a 44px hit-target button", () => {
      render(<AnimatedSprite {...defaultProps()} />);
      expect(
        screen.getByRole("button", { name: "Aircraft UAL123" }),
      ).toHaveClass("aircraft-marker-hit");
    });

    it("marks the inner visual span as aria-hidden (decorative)", () => {
      render(<AnimatedSprite {...defaultProps()} />);
      const button = screen.getByRole("button", { name: "Aircraft UAL123" });
      const visual = button.querySelector(".aircraft-sprite");
      expect(visual).toHaveAttribute("aria-hidden", "true");
    });

    it("applies the spriteClass to the inner visual span", () => {
      render(
        <AnimatedSprite
          {...defaultProps({ spriteClass: "aircraft-sprite--small" })}
        />,
      );
      const button = screen.getByRole("button", { name: "Aircraft UAL123" });
      expect(button.querySelector(".aircraft-sprite")).toHaveClass(
        "aircraft-sprite--small",
      );
    });

    it("returns null when the loader cannot resolve the sprite position", () => {
      getSpritePosition.mockReturnValueOnce(null);
      const { container } = render(<AnimatedSprite {...defaultProps()} />);
      expect(container.firstChild).toBeNull();
    });

    it("falls back to default background size when loader returns null", () => {
      getCSSBackgroundSize.mockReturnValueOnce(null);
      render(<AnimatedSprite {...defaultProps()} />);
      const visual = screen
        .getByRole("button")
        .querySelector(".aircraft-sprite");
      expect(visual?.getAttribute("style")).toContain(
        "--sprite-bg-size: 345.6px 1468.8px",
      );
    });
  });

  describe("CSS variables wiring", () => {
    it("propagates position and rotation as CSS custom properties on the inner visual span", () => {
      render(<AnimatedSprite {...defaultProps({ rotation: 180 })} />);

      const visual = screen
        .getByRole("button")
        .querySelector(".aircraft-sprite");
      const style = visual?.getAttribute("style") ?? "";
      expect(style).toContain("--sprite-x: -10px");
      expect(style).toContain("--sprite-y: -20px");
      expect(style).toContain("--sprite-width: 48px");
      expect(style).toContain("--sprite-height: 48px");
      expect(style).toContain("--sprite-rotation: 180deg");
    });

    it("propagates cursorStyle as --marker-cursor on the outer hit-target button", () => {
      render(<AnimatedSprite {...defaultProps({ cursorStyle: "default" })} />);
      const style = screen.getByRole("button").getAttribute("style") ?? "";
      expect(style).toContain("--marker-cursor: default");
    });
  });

  describe("State-based class modifiers (on the inner visual span)", () => {
    it("adds the hovered modifier when isHovered is true", () => {
      render(<AnimatedSprite {...defaultProps({ isHovered: true })} />);
      const visual = screen
        .getByRole("button")
        .querySelector(".aircraft-sprite");
      expect(visual).toHaveClass("aircraft-marker--hovered");
    });

    it("adds the unread modifier when hasUnreadMessages is true", () => {
      render(<AnimatedSprite {...defaultProps({ hasUnreadMessages: true })} />);
      const visual = screen
        .getByRole("button")
        .querySelector(".aircraft-sprite");
      expect(visual).toHaveClass("aircraft-marker--unread");
    });

    it("adds the followed modifier when isFollowed is true", () => {
      render(<AnimatedSprite {...defaultProps({ isFollowed: true })} />);
      const visual = screen
        .getByRole("button")
        .querySelector(".aircraft-sprite");
      expect(visual).toHaveClass("aircraft-marker--followed");
    });

    it("omits all state modifiers by default", () => {
      render(<AnimatedSprite {...defaultProps()} />);
      const visual = screen
        .getByRole("button")
        .querySelector(".aircraft-sprite");
      expect(visual).not.toHaveClass("aircraft-marker--hovered");
      expect(visual).not.toHaveClass("aircraft-marker--unread");
      expect(visual).not.toHaveClass("aircraft-marker--followed");
    });
  });

  describe("marker-size scale (FEAT-MARKER-SIZE)", () => {
    it("defaults scale to 0.6 when the prop is omitted", () => {
      render(<AnimatedSprite {...defaultProps()} />);
      expect(getSpritePosition).toHaveBeenCalledWith("plane-medium", 0, 0.6);
      expect(getCSSBackgroundSize).toHaveBeenCalledWith(0.6);
    });

    it("forwards a custom scale to both spriteLoader calls", () => {
      render(<AnimatedSprite {...defaultProps({ scale: 0.48 })} />);
      expect(getSpritePosition).toHaveBeenCalledWith("plane-medium", 0, 0.48);
      expect(getCSSBackgroundSize).toHaveBeenCalledWith(0.48);
    });
  });

  describe("Event wiring", () => {
    it("calls onClick when the button is clicked", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<AnimatedSprite {...defaultProps({ onClick })} />);

      await user.click(screen.getByRole("button"));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("calls onContextMenu when right-clicked", async () => {
      const user = userEvent.setup();
      const onContextMenu = vi.fn();
      render(<AnimatedSprite {...defaultProps({ onContextMenu })} />);

      await user.pointer({
        keys: "[MouseRight]",
        target: screen.getByRole("button"),
      });
      expect(onContextMenu).toHaveBeenCalled();
    });

    it("calls onMouseEnter and onMouseLeave on hover transitions", async () => {
      const user = userEvent.setup();
      const onMouseEnter = vi.fn();
      const onMouseLeave = vi.fn();
      render(
        <AnimatedSprite {...defaultProps({ onMouseEnter, onMouseLeave })} />,
      );

      const btn = screen.getByRole("button");
      await user.hover(btn);
      expect(onMouseEnter).toHaveBeenCalled();
      await user.unhover(btn);
      expect(onMouseLeave).toHaveBeenCalled();
    });
  });

  describe("Frame animation", () => {
    it("does NOT start an animation loop when there is only one frame", () => {
      const rafSpy = vi.spyOn(window, "requestAnimationFrame");
      render(<AnimatedSprite {...defaultProps({ frames: [0] })} />);
      expect(rafSpy).not.toHaveBeenCalled();
    });

    it("schedules a requestAnimationFrame when there are multiple frames", () => {
      const rafSpy = vi.spyOn(window, "requestAnimationFrame");
      render(
        <AnimatedSprite
          {...defaultProps({ frames: [0, 1, 2], frameTime: 50 })}
        />,
      );
      expect(rafSpy).toHaveBeenCalledTimes(1);
    });

    it("advances to the next frame when enough time has elapsed (drives RAF + Date.now)", () => {
      // Drive RAF manually and stub Date.now so we control elapsed time
      let nowMs = 1_000_000;
      const dateSpy = vi.spyOn(Date, "now").mockImplementation(() => nowMs);

      let rafCallback: FrameRequestCallback | null = null;
      const rafSpy = vi
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation((cb: FrameRequestCallback) => {
          rafCallback = cb;
          return 1;
        });
      vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

      render(
        <AnimatedSprite
          {...defaultProps({ frames: [0, 1, 2], frameTime: 100 })}
        />,
      );

      // Initial frame is 0 — getSpritePosition called with frameIndex 0
      expect(getSpritePosition).toHaveBeenCalledWith("plane-medium", 0, 0.6);

      // Advance virtual time past frameTime and fire the RAF callback
      nowMs += 150;
      act(() => {
        rafCallback?.(0);
      });

      // The component should have re-rendered with frame 1
      expect(getSpritePosition).toHaveBeenCalledWith("plane-medium", 1, 0.6);

      dateSpy.mockRestore();
      rafSpy.mockRestore();
    });

    it("cancels the animation frame on unmount", () => {
      const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");
      vi.spyOn(window, "requestAnimationFrame").mockReturnValue(42);

      const { unmount } = render(
        <AnimatedSprite
          {...defaultProps({ frames: [0, 1], frameTime: 100 })}
        />,
      );

      unmount();
      expect(cancelSpy).toHaveBeenCalledWith(42);
    });

    it("restarts the loop when frames prop changes", () => {
      const rafSpy = vi.spyOn(window, "requestAnimationFrame");

      const { rerender } = render(
        <AnimatedSprite {...defaultProps({ frames: [0] })} />,
      );
      expect(rafSpy).not.toHaveBeenCalled();

      rerender(<AnimatedSprite {...defaultProps({ frames: [0, 1, 2] })} />);
      expect(rafSpy).toHaveBeenCalled();
    });
  });
});
