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

import { faLayerGroup, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useRef, useState } from "react";
import {
  ALL_PROVIDERS,
  getProviderConfig,
  US_PROVIDERS,
  WORLDWIDE_PROVIDERS,
} from "../../config/mapProviders";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { MapProvider } from "../../types";
import { mapLogger } from "../../utils/logger";
import "./MapProviderSelector.scss";

/**
 * MapProviderSelector Component
 *
 * Dropdown menu for selecting map tile provider.
 * Inspired by tar1090's base layer selector.
 *
 * Features:
 * - Grouped providers (Worldwide, US Aviation Charts)
 * - Highlights current selection
 * - Click outside to close
 * - Keyboard navigation (Escape to close)
 * - Marks user-selected providers (prevents auto theme switching)
 */
export function MapProviderSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const currentProvider = useSettingsStore(
    (state) => state.settings.map.provider,
  );
  const userSelectedProvider = useSettingsStore(
    (state) => state.settings.map.userSelectedProvider,
  );
  const setMapProvider = useSettingsStore((state) => state.setMapProvider);
  const resetMapProviderToDefault = useSettingsStore(
    (state) => state.resetMapProviderToDefault,
  );

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleProviderSelect = (providerId: MapProvider) => {
    mapLogger.info("Map provider selected by user", {
      providerId,
      previousProvider: currentProvider,
    });

    // Mark as user-selected to prevent auto theme switching
    setMapProvider(providerId, true);
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const handleDefaultSelect = () => {
    mapLogger.info("Map provider reset to default (auto theme switching)", {
      previousProvider: currentProvider,
    });

    // Reset to default provider with auto theme switching enabled
    resetMapProviderToDefault();
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const currentProviderName =
    getProviderConfig(currentProvider)?.name || "Unknown Provider";

  return (
    <div className="map-provider-selector">
      <button
        ref={buttonRef}
        type="button"
        className="map-provider-selector__button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Select map provider"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <FontAwesomeIcon icon={faLayerGroup} />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="map-provider-selector__menu"
          role="menu"
          aria-label="Map provider options"
        >
          {/* Header */}
          <div className="map-provider-selector__header">
            <span className="map-provider-selector__title">Map Layers</span>
            <button
              type="button"
              className="map-provider-selector__close"
              onClick={() => {
                setIsOpen(false);
                buttonRef.current?.focus();
              }}
              aria-label="Close menu"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          {/* Current selection display */}
          <div className="map-provider-selector__current">
            Current: <strong>{currentProviderName}</strong>
          </div>

          {/* Default option */}
          <div className="map-provider-selector__group">
            <div className="map-provider-selector__items">
              <button
                type="button"
                className={`map-provider-selector__item ${
                  !userSelectedProvider
                    ? "map-provider-selector__item--active"
                    : ""
                }`}
                onClick={handleDefaultSelect}
                role="menuitem"
              >
                Default (Auto Theme)
              </button>
            </div>
          </div>

          {/* Worldwide Providers */}
          <div className="map-provider-selector__group">
            <div className="map-provider-selector__group-title">Worldwide</div>
            <div className="map-provider-selector__items">
              {WORLDWIDE_PROVIDERS.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  className={`map-provider-selector__item ${
                    currentProvider === provider.id
                      ? "map-provider-selector__item--active"
                      : ""
                  }`}
                  onClick={() => handleProviderSelect(provider.id)}
                  role="menuitem"
                >
                  {provider.name}
                  {provider.isVector && (
                    <span className="map-provider-selector__badge">Vector</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* US Aviation Charts */}
          <div className="map-provider-selector__group">
            <div className="map-provider-selector__group-title">
              US Aviation Charts
            </div>
            <div className="map-provider-selector__items">
              {US_PROVIDERS.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  className={`map-provider-selector__item ${
                    currentProvider === provider.id
                      ? "map-provider-selector__item--active"
                      : ""
                  }`}
                  onClick={() => handleProviderSelect(provider.id)}
                  role="menuitem"
                >
                  {provider.name}
                </button>
              ))}
            </div>
          </div>

          {/* Footer with provider count */}
          <div className="map-provider-selector__footer">
            {ALL_PROVIDERS.length} providers available
          </div>
        </div>
      )}
    </div>
  );
}
