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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type IconComponent, IconLayerGroup } from "../icons";

interface OverlayOption {
  id: string;
  label: string;
  icon: IconComponent;
  active: boolean;
  onClick: () => void;
}

interface MapOverlaysMenuProps {
  overlays: OverlayOption[];
}

/**
 * MapOverlaysMenu Component
 *
 * Height-based flyout menu for map overlay toggles (range rings, weather, aviation charts).
 * Collapses the overlays group into a single button at viewport heights ≤ 790px to prevent
 * the control panel from overflowing off-screen on short displays (landscape phones, small
 * tablets, compact laptop screens).
 *
 * Features:
 * - Click-outside to close
 * - Active overlay count badge
 * - Keyboard accessible (Escape to close)
 * - 44px touch targets
 * - Catppuccin theming
 * - Dropdown direction adapts to available viewport space (see below)
 *
 * Design Notes:
 * - Shown at max-height: 790px (controlled entirely by SCSS)
 * - Tall screens show individual overlay buttons instead (map-controls__overlay--tall)
 * - Mirrors MapFiltersMenu pattern but uses a height breakpoint rather than width
 * - Dropdown placement: the button usually sits near the TOP of the control
 *   column, so "open downward" is the default and fits most of the time.
 *   But at very short viewport heights (landscape phones, small tablets)
 *   there may not be enough room *below* the button either -- neither a
 *   fixed "always downward" nor a fixed "always upward" is correct for
 *   every viewport. Instead, measure the actual space above and below the
 *   button after each open, pick whichever direction has more room, AND
 *   clamp max-height to that actual measured space (not a fixed viewport-
 *   relative formula) so the dropdown scrolls internally rather than
 *   rendering partially off-screen when even the roomier direction can't
 *   fit every item.
 */
const DROPDOWN_VIEWPORT_MARGIN_PX = 16;
const DROPDOWN_MIN_HEIGHT_PX = 120;

export function MapOverlaysMenu({ overlays }: MapOverlaysMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [maxHeightPx, setMaxHeightPx] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Count active overlays for badge
  const activeCount = overlays.filter((o) => o.active).length;

  // Decide which direction the dropdown should open in, and how tall it's
  // allowed to be, based on the actual space available above/below the
  // button. Runs synchronously after the dropdown mounts (rendered downward
  // by default) but before the browser paints, so a flip to upward never
  // produces a visible flicker.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const buttonEl = buttonRef.current;
    const dropdownEl = dropdownRef.current;
    if (!buttonEl || !dropdownEl) return;

    const buttonRect = buttonEl.getBoundingClientRect();
    const dropdownHeight = dropdownEl.getBoundingClientRect().height;
    const spaceBelow = window.innerHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;

    // Prefer downward (the common case). Flip to upward only when downward
    // doesn't fully fit AND upward has more room to offer.
    const upward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
    setOpenUpward(upward);

    // Clamp height to whichever space we just chose, minus a small margin
    // so the dropdown never touches the very edge of the viewport. A floor
    // keeps it usable (with its own internal scroll) even when neither
    // direction has much room at all.
    const available = upward ? spaceAbove : spaceBelow;
    setMaxHeightPx(
      Math.max(DROPDOWN_MIN_HEIGHT_PX, available - DROPDOWN_VIEWPORT_MARGIN_PX),
    );
  }, [isOpen]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen]);

  // Close menu on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [isOpen]);

  return (
    <div className="map-overlays-menu" ref={menuRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`map-overlays-menu__button ${isOpen ? "map-overlays-menu__button--open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Map overlays"
        aria-expanded={isOpen}
      >
        <IconLayerGroup />
        {activeCount > 0 && (
          <span className="map-overlays-menu__badge">{activeCount}</span>
        )}
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className={`map-overlays-menu__dropdown ${openUpward ? "map-overlays-menu__dropdown--upward" : ""}`}
          style={
            maxHeightPx !== null
              ? ({
                  "--map-overlays-menu-max-height": `${maxHeightPx}px`,
                } as React.CSSProperties)
              : undefined
          }
        >
          {overlays.map((overlay) => {
            const OverlayIcon = overlay.icon;
            return (
              <label key={overlay.id} className="map-overlays-menu__item">
                <OverlayIcon className="map-overlays-menu__icon" />
                <span className="map-overlays-menu__label">
                  {overlay.label}
                </span>
                <input
                  type="checkbox"
                  checked={overlay.active}
                  onChange={() => {
                    overlay.onClick();
                  }}
                  aria-label={overlay.label}
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
