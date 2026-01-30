// Copyright (C) 2022-2024 Frederick Clausen II
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

import jBox from "jbox";

export interface SettingsSection {
  id: string;
  title: string;
  content: string;
  onShow?: () => void;
}

export class SettingsManager {
  #modal: unknown = null;
  #allSections: SettingsSection[] = [];
  #globalSections: SettingsSection[] = [];

  constructor() {
    this.initializeModal();
  }

  private initializeModal(): void {
    // Determine modal dimensions based on screen size
    const getModalDimensions = (): { width: number; height: number } => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      // Mobile: full width minus padding, auto height up to max
      if (windowWidth < 768) {
        return {
          width: Math.min(windowWidth - 40, 500),
          height: Math.min(windowHeight - 100, 600),
        };
      }
      // Tablet: reasonable width, taller height
      else if (windowWidth < 1024) {
        return {
          width: 600,
          height: Math.min(windowHeight - 100, 650),
        };
      }
      // Desktop: wider modal, avoid scrolling if possible
      else {
        return {
          width: 750,
          height: Math.min(windowHeight - 100, 700),
        };
      }
    };

    const dimensions = getModalDimensions();

    this.#modal = new jBox("Modal", {
      id: "unified_settings_modal",
      width: dimensions.width,
      height: dimensions.height,
      blockScroll: false,
      isolateScroll: true,
      animation: "zoomIn",
      closeButton: "box",
      overlay: true,
      reposition: true,
      repositionOnOpen: true,
      responsiveWidth: true,
      responsiveHeight: true,
      title: "Settings",
      content: '<div id="settings_content">Loading...</div>',
      onOpen: () => {
        this.renderCurrentSettings();
      },
    });

    // Listen for window resize events to update modal size
    let resizeTimer: NodeJS.Timeout | null = null;
    window.addEventListener("resize", () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const newDimensions = getModalDimensions();
        if (this.#modal) {
          // biome-ignore lint/suspicious/noExplicitAny: jBox doesn't export proper types
          (this.#modal as any).options.width = newDimensions.width;
          // biome-ignore lint/suspicious/noExplicitAny: jBox doesn't export proper types
          (this.#modal as any).options.height = newDimensions.height;
          // biome-ignore lint/suspicious/noExplicitAny: jBox doesn't export proper types
          if ((this.#modal as any).isOpen !== false) {
            // biome-ignore lint/suspicious/noExplicitAny: jBox doesn't export proper types
            (this.#modal as any).position();
          }
        }
      }, 250);
    });
  }

  public registerGlobalSettings(sections: SettingsSection[]): void {
    // Replace all global sections
    this.#globalSections = sections;
  }

  public registerPageSettings(page: string, sections: SettingsSection[]): void {
    // Remove existing sections for this page
    this.#allSections = this.#allSections.filter(
      (s) => !s.id.startsWith(page + "_"),
    );

    // Add new sections with page prefix if not already present
    sections.forEach((section) => {
      if (!section.id.startsWith(page + "_")) {
        section.id = page + "_" + section.id;
      }
      this.#allSections.push(section);
    });
  }

  public clearPageSettings(page: string): void {
    this.#allSections = this.#allSections.filter(
      (s) => !s.id.startsWith(page + "_"),
    );
  }

  public openSettings(_page: string): void {
    if (this.#modal) {
      // biome-ignore lint/suspicious/noExplicitAny: jBox doesn't export proper types
      (this.#modal as any).open();
    }
  }

  private renderCurrentSettings(): void {
    // Combine global sections (first) with page-specific sections
    const sections = [...this.#globalSections, ...this.#allSections];
    if (!sections || sections.length === 0) {
      $("#settings_content").html(
        '<p class="text-center">No settings available.</p>',
      );
      return;
    }

    let html = '<div class="settings-container">';

    // Always use tabs for better organization
    html += '<div class="settings-tabs">';
    html += '<ul class="nav nav-tabs" role="tablist">';
    sections.forEach((section, index) => {
      const activeClass = index === 0 ? "active" : "";
      html += `<li class="nav-item" role="presentation">`;
      html += `<button class="nav-link ${activeClass}" id="${section.id}-tab" data-bs-toggle="tab" data-bs-target="#${section.id}-panel" type="button" role="tab" aria-controls="${section.id}-panel" aria-selected="${index === 0}">${section.title}</button>`;
      html += `</li>`;
    });
    html += "</ul>";

    html += '<div class="tab-content settings-tab-content">';
    sections.forEach((section, index) => {
      const activeClass = index === 0 ? "show active" : "";
      html += `<div class="tab-pane fade ${activeClass}" id="${section.id}-panel" role="tabpanel" aria-labelledby="${section.id}-tab">`;
      html += `<div class="settings-section-content">${section.content}</div>`;
      html += "</div>";
    });
    html += "</div>";
    html += "</div>";

    html += "</div>";

    $("#settings_content").html(html);

    // Call onShow callback for the first section
    if (sections[0]?.onShow) {
      sections[0].onShow();
    }

    // Handle tab switching to call onShow using vanilla JS event delegation
    const tabContainer = document.querySelector(".nav-tabs");
    if (tabContainer) {
      tabContainer.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains("nav-link")) {
          const sectionId = target.id.replace("-tab", "");
          const section = sections.find((s) => s.id === sectionId);

          // Remove active class from all tabs and panels
          document.querySelectorAll(".nav-link").forEach((tab) => {
            tab.classList.remove("active");
          });
          document.querySelectorAll(".tab-pane").forEach((pane) => {
            pane.classList.remove("show", "active");
          });

          // Add active class to clicked tab and corresponding panel
          target.classList.add("active");
          const panel = document.getElementById(sectionId + "-panel");
          if (panel) {
            panel.classList.add("show", "active");
          }

          // Call onShow callback
          if (section?.onShow) {
            section.onShow();
          }
        }
      });
    }
  }

  public close(): void {
    if (this.#modal) {
      // biome-ignore lint/suspicious/noExplicitAny: jBox doesn't export proper types
      (this.#modal as any).close();
    }
  }
}

// Global settings manager instance
export const settingsManager = new SettingsManager();
