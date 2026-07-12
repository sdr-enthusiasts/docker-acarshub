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

import type React from "react";
import { useEffect, useState } from "react";
import { getSpriteLoader } from "../../utils/spriteLoader";

interface AnimatedSpriteProps {
  spriteName: string;
  spriteClass: string;
  frames: number[];
  frameTime: number;
  rotation: number;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave: () => void;
  isHovered: boolean;
  isFollowed?: boolean;
  hasUnreadMessages: boolean;
  ariaLabel: string;
  cursorStyle: "pointer" | "default";
  /**
   * Sprite-atlas display scale, forwarded to `getSpritePosition()`/
   * `getCSSBackgroundSize()` (FEAT-MARKER-SIZE). Defaults to 0.6 — the
   * pre-existing hardcoded value — so omitting this prop is fully
   * backward compatible. Callers pass `0.6 * getMarkerSizeScale(size)`.
   */
  scale?: number;
}

/**
 * AnimatedSprite Component
 *
 * Renders an animated aircraft sprite with frame cycling.
 * Uses requestAnimationFrame for smooth 60fps animations.
 *
 * FE-MODAL-A11Y-adjacent note (FEAT-MARKER-SIZE): the rendered `<button>`
 * is a 44px-floored hit target (`.aircraft-marker-hit`, see
 * _aircraft-markers.scss) wrapping a purely decorative inner `<span>`
 * that carries the actual sprite size/position. This keeps the clickable
 * area WCAG-compliant even when the visual sprite itself is smaller than
 * 44px (the "small" marker-size setting, or small airframe types at the
 * default 0.6 base scale) — growing the *button* to 44px directly would
 * instead have grown the background-image crop box and bled in
 * neighbouring atlas art.
 */
export function AnimatedSprite({
  spriteName,
  spriteClass,
  frames,
  frameTime,
  rotation,
  onClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  isHovered,
  isFollowed = false,
  hasUnreadMessages,
  ariaLabel,
  cursorStyle,
  scale = 0.6,
}: AnimatedSpriteProps) {
  const [currentFrame, setCurrentFrame] = useState(0);

  // Frame cycling with requestAnimationFrame
  useEffect(() => {
    if (frames.length <= 1) {
      return;
    }

    let lastFrameTime = Date.now();
    let animationFrameId: number;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - lastFrameTime;

      if (elapsed >= frameTime) {
        setCurrentFrame((prev) => (prev + 1) % frames.length);
        lastFrameTime = now;
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [frames, frameTime]);

  // Get position for current frame
  const loader = getSpriteLoader();
  const position = loader.getSpritePosition(spriteName, currentFrame, scale);
  const backgroundSize =
    loader.getCSSBackgroundSize(scale) ?? "345.6px 1468.8px";

  if (!position) {
    return null;
  }

  return (
    <button
      type="button"
      className="aircraft-marker-hit"
      aria-label={ariaLabel}
      style={{ "--marker-cursor": cursorStyle } as React.CSSProperties}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span
        aria-hidden="true"
        className={`aircraft-sprite ${spriteClass} ${
          isHovered ? "aircraft-marker--hovered" : ""
        } ${hasUnreadMessages ? "aircraft-marker--unread" : ""} ${
          isFollowed ? "aircraft-marker--followed" : ""
        }`}
        style={
          {
            "--sprite-x": `-${position.x}px`,
            "--sprite-y": `-${position.y}px`,
            "--sprite-bg-size": backgroundSize,
            "--sprite-width": `${position.width}px`,
            "--sprite-height": `${position.height}px`,
            "--sprite-rotation": `${rotation}deg`,
          } as React.CSSProperties
        }
      />
    </button>
  );
}
