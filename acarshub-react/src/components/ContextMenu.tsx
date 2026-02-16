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

import { useEffect, useRef, useState } from "react";
import "../styles/components/_context-menu.scss";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  variant?: "default" | "primary" | "danger";
  divider?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * ContextMenu Component
 *
 * Generic right-click context menu with Catppuccin theming.
 *
 * Features:
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Auto-positioning to stay within viewport
 * - Click-outside to close
 * - Accessible (ARIA labels, focus management)
 * - Mobile-friendly (44px min touch targets)
 * - Themed with Catppuccin colors
 *
 * Design Notes:
 * - Follows DESIGN_LANGUAGE.md patterns
 * - Uses semantic HTML (menu, menuitem)
 * - Supports disabled items
 * - Supports visual separators (dividers)
 * - Supports item variants (default, primary, danger)
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [posX, setposX] = useState(x);
  const [posY, setposY] = useState(y);
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Adjust position to keep menu within viewport
  useEffect(() => {
    if (!menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    // Adjust horizontal position if menu would overflow right edge
    if (x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 8; // 8px padding from edge
    }

    // Adjust vertical position if menu would overflow bottom edge
    if (y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 8; // 8px padding from edge
    }

    // Ensure menu doesn't go off left/top edges
    adjustedX = Math.max(8, adjustedX);
    adjustedY = Math.max(8, adjustedY);

    setposX(adjustedX);
    setposY(adjustedY);
  }, [x, y]);

  // Handle click outside menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Small delay to prevent immediate close from the right-click event
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const enabledItems = items.filter(
        (item) => !item.disabled && !item.divider,
      );

      switch (event.key) {
        case "Escape":
          event.preventDefault();
          onClose();
          break;

        case "ArrowDown":
          event.preventDefault();
          setFocusedIndex((prev) => {
            const nextIndex = (prev + 1) % enabledItems.length;
            return nextIndex;
          });
          break;

        case "ArrowUp":
          event.preventDefault();
          setFocusedIndex((prev) => {
            const nextIndex =
              (prev - 1 + enabledItems.length) % enabledItems.length;
            return nextIndex;
          });
          break;

        case "Enter":
        case " ": {
          event.preventDefault();
          const focusedItem = enabledItems[focusedIndex];
          if (focusedItem && !focusedItem.disabled) {
            focusedItem.onClick();
            onClose();
          }
          break;
        }

        default:
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [items, focusedIndex, onClose]);

  // Focus menu when mounted
  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled) return;
    item.onClick();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: `${posX}px`, top: `${posY}px` }}
      role="menu"
      tabIndex={-1}
      aria-label="Context menu"
    >
      {items.map((item) => {
        if (item.divider) {
          return <hr key={item.id} className="context-menu__divider" />;
        }

        const enabledItems = items.filter((i) => !i.disabled && !i.divider);
        const enabledIndex = enabledItems.indexOf(item);
        const isFocused = enabledIndex === focusedIndex;

        return (
          <button
            key={item.id}
            type="button"
            className={`context-menu__item context-menu__item--${item.variant || "default"} ${
              isFocused ? "context-menu__item--focused" : ""
            }`}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            role="menuitem"
            aria-disabled={item.disabled}
            tabIndex={-1}
          >
            {item.icon && (
              <span className="context-menu__icon">{item.icon}</span>
            )}
            <span className="context-menu__label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
