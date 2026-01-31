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
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";

/**
 * AboutPage Component
 * Displays information about ACARS Hub and demonstrates the styling system
 */
export const AboutPage = () => {
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const version = useAppStore((state) => state.version);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [loadingButton, setLoadingButton] = useState<string | null>(null);

  useEffect(() => {
    setCurrentPage("About");
    socketService.notifyPageChange("About");
  }, [setCurrentPage]);

  const handleLoadingDemo = (buttonId: string) => {
    setLoadingButton(buttonId);
    setTimeout(() => setLoadingButton(null), 2000);
  };

  return (
    <div className="page about-page">
      <div className="page__header">
        <div>
          <h1 className="page__title">About ACARS Hub</h1>
          <p className="page__subtitle">
            React Migration - Phase 2: Styling System Complete
          </p>
        </div>
        <div className="page__stats">
          <div className="page__stat">
            <span className="page__stat-label">Theme</span>
            <span className="page__stat-value">Catppuccin</span>
          </div>
          <div className="page__stat">
            <span className="page__stat-label">Status</span>
            <span className="page__stat-value">Active</span>
          </div>
        </div>
      </div>

      <div className="page__content">
        <section style={{ marginBottom: "3rem" }}>
          <h2 style={{ marginBottom: "1rem", fontSize: "1.5rem" }}>
            Welcome to ACARS Hub React
          </h2>
          <p style={{ marginBottom: "1rem", lineHeight: "1.75" }}>
            This is a complete rewrite of ACARS Hub using React and TypeScript.
            The application uses custom SCSS with Catppuccin theming for a
            beautiful, cohesive design system.
          </p>
          <div className="info-box info-box--success">
            <h3 className="info-box__title">✓ Phase 2 Complete</h3>
            <div className="info-box__content">
              <p>Custom SCSS styling system with Catppuccin theming</p>
              <p>Bootstrap removed - all custom components</p>
              <p>Theme switching between Mocha (dark) and Latte (light)</p>
              <p>Reusable Button, Modal, and other UI components</p>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: "3rem" }}>
          <h2 style={{ marginBottom: "1rem", fontSize: "1.5rem" }}>
            Button Components
          </h2>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              flexWrap: "wrap",
              marginBottom: "1.5rem",
            }}
          >
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="success">Success</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="warning">Warning</Button>
            <Button variant="info">Info</Button>
            <Button variant="ghost">Ghost</Button>
          </div>

          <h3 style={{ marginBottom: "0.75rem", fontSize: "1.125rem" }}>
            Outline Variants
          </h3>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              flexWrap: "wrap",
              marginBottom: "1.5rem",
            }}
          >
            <Button variant="outline-primary">Primary</Button>
            <Button variant="outline-secondary">Secondary</Button>
            <Button variant="outline-success">Success</Button>
            <Button variant="outline-danger">Danger</Button>
            <Button variant="outline-warning">Warning</Button>
            <Button variant="outline-info">Info</Button>
          </div>

          <h3 style={{ marginBottom: "0.75rem", fontSize: "1.125rem" }}>
            Sizes
          </h3>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              alignItems: "center",
              marginBottom: "1.5rem",
            }}
          >
            <Button variant="primary" size="sm">
              Small
            </Button>
            <Button variant="primary" size="md">
              Medium
            </Button>
            <Button variant="primary" size="lg">
              Large
            </Button>
          </div>

          <h3 style={{ marginBottom: "0.75rem", fontSize: "1.125rem" }}>
            States
          </h3>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              flexWrap: "wrap",
              marginBottom: "1.5rem",
            }}
          >
            <Button variant="primary" disabled>
              Disabled
            </Button>
            <Button
              variant="success"
              loading={loadingButton === "btn1"}
              onClick={() => handleLoadingDemo("btn1")}
            >
              {loadingButton === "btn1" ? "Loading..." : "Click for Loading"}
            </Button>
            <Button variant="primary" block>
              Block Button (Full Width)
            </Button>
          </div>
        </section>

        <section style={{ marginBottom: "3rem" }}>
          <h2 style={{ marginBottom: "1rem", fontSize: "1.5rem" }}>
            Modal Component
          </h2>
          <Button variant="primary" onClick={() => setDemoModalOpen(true)}>
            Open Demo Modal
          </Button>

          <Modal
            isOpen={demoModalOpen}
            onClose={() => setDemoModalOpen(false)}
            title="Example Modal"
            footer={
              <>
                <Button variant="ghost" onClick={() => setDemoModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setDemoModalOpen(false)}
                >
                  Save Changes
                </Button>
              </>
            }
          >
            <p style={{ marginBottom: "1rem" }}>
              This is a custom modal component built with Catppuccin theming.
            </p>
            <p style={{ marginBottom: "1rem" }}>Features include:</p>
            <ul style={{ marginLeft: "1.5rem", marginBottom: "1rem" }}>
              <li>Keyboard support (Escape to close)</li>
              <li>Click outside to close</li>
              <li>Focus management</li>
              <li>Accessible ARIA attributes</li>
              <li>Multiple sizes available</li>
            </ul>
            <div className="info-box">
              <h3 className="info-box__title">Info Box</h3>
              <div className="info-box__content">
                <p>Info boxes can be nested inside modals too!</p>
              </div>
            </div>
          </Modal>
        </section>

        <section style={{ marginBottom: "3rem" }}>
          <h2 style={{ marginBottom: "1rem", fontSize: "1.5rem" }}>
            Info Boxes
          </h2>
          <div className="info-box" style={{ marginBottom: "1rem" }}>
            <h3 className="info-box__title">Default Info Box</h3>
            <div className="info-box__content">
              <p>This is a default info box with informational styling.</p>
            </div>
          </div>
          <div
            className="info-box info-box--success"
            style={{ marginBottom: "1rem" }}
          >
            <h3 className="info-box__title">Success Info Box</h3>
            <div className="info-box__content">
              <p>This indicates a successful operation or positive message.</p>
            </div>
          </div>
          <div
            className="info-box info-box--warning"
            style={{ marginBottom: "1rem" }}
          >
            <h3 className="info-box__title">Warning Info Box</h3>
            <div className="info-box__content">
              <p>This is used for warnings or cautionary information.</p>
            </div>
          </div>
          <div className="info-box info-box--error">
            <h3 className="info-box__title">Error Info Box</h3>
            <div className="info-box__content">
              <p>This displays error messages or critical information.</p>
            </div>
          </div>
        </section>

        {version && (
          <section>
            <h2 style={{ marginBottom: "1rem", fontSize: "1.5rem" }}>
              Version Information
            </h2>
            <div className="info-box">
              <div className="info-box__content">
                <p>
                  <strong>Container Version:</strong>{" "}
                  {version.container_version}
                </p>
                <p>
                  <strong>GitHub Version:</strong> {version.github_version}
                </p>
                {version.is_outdated && (
                  <p style={{ color: "var(--color-warning)", fontWeight: 600 }}>
                    ⚠️ A newer version is available on GitHub
                  </p>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
