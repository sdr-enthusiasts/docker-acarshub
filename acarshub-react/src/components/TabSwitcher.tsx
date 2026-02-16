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

import { useEffect, useRef } from "react";

interface Tab {
  /** Unique identifier for the tab */
  id: string;
  /** Display label for the tab */
  label: string;
  /** Whether the tab is disabled */
  disabled?: boolean;
}

interface TabSwitcherProps {
  /** Array of tabs to display */
  tabs: Tab[];
  /** Currently active tab ID */
  activeTab: string;
  /** Callback when tab is changed */
  onTabChange: (tabId: string) => void;
  /** Optional CSS class name */
  className?: string;
  /** Optional ARIA label for the tab list */
  ariaLabel?: string;
}

/**
 * TabSwitcher Component
 * A mobile-first tabbed navigation component with Catppuccin theming
 *
 * Features:
 * - Horizontal scrollable tabs on mobile
 * - Keyboard navigation (Arrow keys, Home, End)
 * - Active tab indicator
 * - Disabled state support
 * - Mobile-first responsive design
 * - Catppuccin theming
 */
export const TabSwitcher = ({
  tabs,
  activeTab,
  onTabChange,
  className = "",
  ariaLabel = "Tab navigation",
}: TabSwitcherProps) => {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Scroll active tab into view on mount and when it changes
  useEffect(() => {
    const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);
    if (activeIndex !== -1 && tabRefs.current[activeIndex]) {
      tabRefs.current[activeIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeTab, tabs]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let newIndex = index;

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        newIndex = index > 0 ? index - 1 : tabs.length - 1;
        break;
      case "ArrowRight":
        e.preventDefault();
        newIndex = index < tabs.length - 1 ? index + 1 : 0;
        break;
      case "Home":
        e.preventDefault();
        newIndex = 0;
        break;
      case "End":
        e.preventDefault();
        newIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    // Skip disabled tabs
    while (tabs[newIndex]?.disabled && newIndex !== index) {
      if (e.key === "ArrowLeft" || e.key === "End") {
        newIndex = newIndex > 0 ? newIndex - 1 : tabs.length - 1;
      } else {
        newIndex = newIndex < tabs.length - 1 ? newIndex + 1 : 0;
      }
    }

    if (!tabs[newIndex]?.disabled) {
      tabRefs.current[newIndex]?.focus();
      onTabChange(tabs[newIndex].id);
    }
  };

  const handleTabClick = (tabId: string, index: number) => {
    if (tabs[index]?.disabled) return;
    onTabChange(tabId);
  };

  return (
    <div className={`tab-switcher ${className}`}>
      <div className="tab-switcher__container">
        <div
          className="tab-switcher__list"
          role="tablist"
          aria-label={ariaLabel}
        >
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-disabled={tab.disabled}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={`tab-switcher__tab ${
                activeTab === tab.id ? "tab-switcher__tab--active" : ""
              } ${tab.disabled ? "tab-switcher__tab--disabled" : ""}`}
              onClick={() => handleTabClick(tab.id, index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              disabled={tab.disabled}
            >
              <span className="tab-switcher__tab-label">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
