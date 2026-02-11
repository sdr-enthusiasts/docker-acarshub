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

import { useEffect, useState } from "react";
import { getSpriteLoader } from "../../utils/spriteLoader";

interface AnimatedSpriteProps {
  spriteName: string;
  spriteClass: string;
  frames: number[];
  frameTime: number;
  rotation: number;
  onClick: () => void;
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave: () => void;
  isHovered: boolean;
  hasUnreadMessages: boolean;
  ariaLabel: string;
  cursorStyle: "pointer" | "default";
}

/**
 * AnimatedSprite Component
 *
 * Renders an animated aircraft sprite with frame cycling.
 * Uses requestAnimationFrame for smooth 60fps animations.
 */
export function AnimatedSprite({
  spriteName,
  spriteClass,
  frames,
  frameTime,
  rotation,
  onClick,
  onMouseEnter,
  onMouseLeave,
  isHovered,
  hasUnreadMessages,
  ariaLabel,
  cursorStyle,
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
  const position = loader.getSpritePosition(spriteName, currentFrame);

  if (!position) {
    return null;
  }

  return (
    <button
      type="button"
      className={`aircraft-sprite ${spriteClass} ${
        isHovered ? "aircraft-marker--hovered" : ""
      } ${hasUnreadMessages ? "aircraft-marker--unread" : ""}`}
      aria-label={ariaLabel}
      style={{
        backgroundPosition: `-${position.x}px -${position.y}px`,
        width: `${position.width}px`,
        height: `${position.height}px`,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
        cursor: cursorStyle,
      }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}
