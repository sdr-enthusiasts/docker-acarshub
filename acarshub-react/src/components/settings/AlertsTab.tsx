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

// ----------------------------------------------------------------------------
// GOD-05: extracted from components/SettingsModal.tsx.
//
// Owns alert-term/ignore-term management state and the "Load Defaults"/
// add/remove handlers. isRegenerating and onRegenerateClick remain props
// from the parent: the regenerate confirmation dialog and processing
// overlay are rendered as Modal-level siblings (not inside this tabpanel),
// since they must stay visible even if the user switches tabs mid-run.
// ----------------------------------------------------------------------------

import { useCallback, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { Button } from "../Button";
import { Card } from "../Card";

/**
 * Static list of default alert terms.
 * Defined at module scope so it has a stable reference identity and does not
 * need to appear in useCallback dependency arrays inside the component.
 */
const DEFAULT_ALERT_TERMS: string[] = [
  "COP",
  "POLICE",
  "AUTHORITIES",
  "FIRE",
  "CHOP",
  "TURBULENCE",
  "TURB",
  "FAULT",
  "DIVERT",
  "MASK",
  "CSR",
  "AGENT",
  "MEDICAL",
  "SECURITY",
  "MAYDAY",
  "EMERGENCY",
  "PAN",
  "RED COAT",
  "RED",
  "OXYGEN",
  "DOCTOR",
  "LEAK",
  "COAT",
  "SIGMET",
  "ASH",
  "DIPS",
  "PAX",
  "DOG",
  "DRUNK",
  "VOMIT",
  "HAZMAT",
];

export interface AlertsTabProps {
  isRegenerating: boolean;
  onRegenerateClick: () => void;
}

export function AlertsTab({
  isRegenerating,
  onRegenerateClick,
}: AlertsTabProps) {
  const alertTerms = useAppStore((state) => state.alertTerms);
  const setAlertTerms = useAppStore((state) => state.setAlertTerms);
  const decoders = useAppStore((state) => state.decoders);
  const allowRemoteUpdates = decoders?.allow_remote_updates ?? true;

  const [newAlertTerm, setNewAlertTerm] = useState("");
  const [newIgnoreTerm, setNewIgnoreTerm] = useState("");

  const handleLoadDefaultTerms = useCallback(() => {
    // Only add terms that aren't already present
    const newTermsToAdd = DEFAULT_ALERT_TERMS.filter(
      (term) => !alertTerms.terms.includes(term),
    );

    if (newTermsToAdd.length === 0) {
      alert("All default alert terms are already loaded.");
      return;
    }

    const newTerms = {
      terms: [...alertTerms.terms, ...newTermsToAdd],
      ignore: alertTerms.ignore,
    };
    setAlertTerms(newTerms);

    // Emit to backend via Socket.IO
    import("../../services/socket").then((socketModule) => {
      const socket = socketModule.socketService.getSocket();
      socket?.emit("update_alerts", newTerms);
    });

    alert(
      `Added ${newTermsToAdd.length} default alert term${newTermsToAdd.length !== 1 ? "s" : ""}.`,
    );
  }, [alertTerms, setAlertTerms]);

  const handleAddAlertTerm = useCallback(() => {
    const input = newAlertTerm.trim();
    if (!input) return;

    // Split on commas and process each term
    const termsToAdd = input
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t && !alertTerms.terms.includes(t));

    if (termsToAdd.length > 0) {
      const newTerms = {
        terms: [...alertTerms.terms, ...termsToAdd],
        ignore: alertTerms.ignore,
      };
      setAlertTerms(newTerms);
      setNewAlertTerm("");

      // Emit to backend via Socket.IO
      import("../../services/socket").then((socketModule) => {
        const socket = socketModule.socketService.getSocket();
        socket?.emit("update_alerts", newTerms);
      });
    }
  }, [newAlertTerm, alertTerms, setAlertTerms]);

  const handleRemoveAlertTerm = useCallback(
    (term: string) => {
      const newTerms = {
        terms: alertTerms.terms.filter((t) => t !== term),
        ignore: alertTerms.ignore,
      };
      setAlertTerms(newTerms);

      // Emit to backend via Socket.IO
      import("../../services/socket").then((socketModule) => {
        const socket = socketModule.socketService.getSocket();
        socket?.emit("update_alerts", newTerms);
      });
    },
    [alertTerms, setAlertTerms],
  );

  const handleAlertTermKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddAlertTerm();
      }
    },
    [handleAddAlertTerm],
  );

  const handleAddIgnoreTerm = useCallback(() => {
    const input = newIgnoreTerm.trim();
    if (!input) return;

    // Split on commas and process each term
    const termsToAdd = input
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t && !alertTerms.ignore.includes(t));

    if (termsToAdd.length > 0) {
      const newTerms = {
        terms: alertTerms.terms,
        ignore: [...alertTerms.ignore, ...termsToAdd],
      };
      setAlertTerms(newTerms);
      setNewIgnoreTerm("");

      // Emit to backend via Socket.IO
      import("../../services/socket").then((socketModule) => {
        const socket = socketModule.socketService.getSocket();
        socket?.emit("update_alerts", newTerms);
      });
    }
  }, [newIgnoreTerm, alertTerms, setAlertTerms]);

  const handleRemoveIgnoreTerm = useCallback(
    (term: string) => {
      const newTerms = {
        terms: alertTerms.terms,
        ignore: alertTerms.ignore.filter((t) => t !== term),
      };
      setAlertTerms(newTerms);

      // Emit to backend via Socket.IO
      import("../../services/socket").then((socketModule) => {
        const socket = socketModule.socketService.getSocket();
        socket?.emit("update_alerts", newTerms);
      });
    },
    [alertTerms, setAlertTerms],
  );

  const handleIgnoreTermKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddIgnoreTerm();
      }
    },
    [handleAddIgnoreTerm],
  );

  return (
    <div
      id="alerts-panel"
      role="tabpanel"
      aria-labelledby="alerts-tab"
      className="settings-panel"
    >
      <Card
        title="Alert Terms"
        subtitle="Manage alert terms for message filtering"
        variant="warning"
      >
        {!allowRemoteUpdates && (
          <p className="settings-help-text settings-help-text--disabled-warning">
            ⚠️ Alert term editing is disabled by the server administrator.
            Contact your system administrator to modify alert terms.
          </p>
        )}
        {/* Alert Terms */}
        <div className="settings-field-group">
          <div className="settings-label-row">
            <label htmlFor="alert-terms-input" className="settings-label">
              Alert Terms
            </label>
            <Button
              variant="info"
              size="sm"
              onClick={handleLoadDefaultTerms}
              disabled={!allowRemoteUpdates}
              aria-label="Load default alert terms"
            >
              Load Defaults
            </Button>
          </div>
          <div className="alert-terms-input-group">
            <input
              id="alert-terms-input"
              type="text"
              value={newAlertTerm}
              onChange={(e) => setNewAlertTerm(e.target.value)}
              onKeyPress={handleAlertTermKeyPress}
              placeholder="Enter term and press Enter"
              className="alert-terms-input"
              disabled={!allowRemoteUpdates}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddAlertTerm}
              disabled={!newAlertTerm.trim() || !allowRemoteUpdates}
              aria-label="Add alert term"
            >
              Add
            </Button>
          </div>
          <p className="settings-help-text">
            Examples: EMERGENCY, UAL123, N12345, A1B2C3 (hex code). Use commas
            to add multiple terms at once.
          </p>

          {alertTerms.terms.length > 0 && (
            <div className="alert-terms-chips">
              {alertTerms.terms.map((term) => (
                <span key={term} className="alert-term-chip">
                  {term}
                  <button
                    type="button"
                    onClick={() => handleRemoveAlertTerm(term)}
                    aria-label={`Remove alert term ${term}`}
                    className="alert-term-chip__remove"
                    disabled={!allowRemoteUpdates}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Ignore Terms */}
        <div className="settings-field-group">
          <label htmlFor="ignore-terms-input" className="settings-label">
            Ignore Terms
          </label>
          <div className="alert-terms-input-group">
            <input
              id="ignore-terms-input"
              type="text"
              value={newIgnoreTerm}
              onChange={(e) => setNewIgnoreTerm(e.target.value)}
              onKeyPress={handleIgnoreTermKeyPress}
              placeholder="Enter term and press Enter"
              className="alert-terms-input"
              disabled={!allowRemoteUpdates}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddIgnoreTerm}
              disabled={!newIgnoreTerm.trim() || !allowRemoteUpdates}
              aria-label="Add ignore term"
            >
              Add
            </Button>
          </div>
          <p className="settings-help-text">
            Messages matching these terms will NOT trigger alerts, even if they
            match alert terms above
          </p>

          {alertTerms.ignore.length > 0 && (
            <div className="alert-terms-chips">
              {alertTerms.ignore.map((term) => (
                <span
                  key={term}
                  className="alert-term-chip alert-term-chip--ignore"
                >
                  {term}
                  <button
                    type="button"
                    onClick={() => handleRemoveIgnoreTerm(term)}
                    aria-label={`Remove ignore term ${term}`}
                    className="alert-term-chip__remove"
                    disabled={!allowRemoteUpdates}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Regenerate Alert Matches */}
        <div className="settings-field-group regenerate-section">
          <div className="regenerate-section__header">
            <h4 className="regenerate-section__title">
              Regenerate Alert Matches
            </h4>
            <p className="settings-help-text regenerate-section__description">
              Re-process all messages in the database against current alert
              terms. This will delete all existing matches and rebuild them from
              scratch.
            </p>
            <p className="settings-help-text regenerate-section__warning">
              ⚠️ <strong>Warning:</strong> This operation can take a long time
              on large databases (minutes for millions of messages). Processing
              runs in the background - you can continue using the app while it
              completes.
            </p>
          </div>
          <Button
            variant="warning"
            onClick={onRegenerateClick}
            disabled={!allowRemoteUpdates || isRegenerating}
            aria-label="Regenerate all alert matches"
          >
            {isRegenerating
              ? "Regenerating in background..."
              : "Regenerate All Matches"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
