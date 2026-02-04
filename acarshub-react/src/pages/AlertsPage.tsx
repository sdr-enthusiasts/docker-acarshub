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

import { useEffect, useMemo } from "react";
import { MessageGroup } from "../components/MessageGroup";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";
import type { MessageGroup as MessageGroupType } from "../types";
import { uiLogger } from "../utils/logger";

/**
 * AlertsPage Component
 * Displays messages that match configured alert terms
 *
 * Features:
 * - Shows only messages with alert matches
 * - Displays matched terms highlighting
 * - Sound notifications for new alerts (handled by global AlertSoundManager)
 * - Statistics (unread/total alerts, unique aircraft)
 * - Manual "Mark All Read" button
 * - Individual "Mark Read" buttons per message
 * - Mobile-first responsive design
 */
export const AlertsPage = () => {
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const messageGroups = useAppStore((state) => state.messageGroups);
  const alertTerms = useAppStore((state) => state.alertTerms);
  const readMessageUids = useAppStore((state) => state.readMessageUids);
  const markAllAlertsAsRead = useAppStore((state) => state.markAllAlertsAsRead);

  // Filter message groups to only show those with alerts
  const alertMessageGroups = useMemo(() => {
    const filtered = new Map<string, MessageGroupType>();

    for (const [key, group] of messageGroups.entries()) {
      // Only include groups with alerts
      if (group.has_alerts) {
        // Filter messages to only show those with alerts
        const alertMessages = group.messages.filter(
          (msg) => msg.matched === true,
        );

        if (alertMessages.length > 0) {
          filtered.set(key, {
            ...group,
            messages: alertMessages,
          });
        }
      }
    }

    return filtered;
  }, [messageGroups]);

  // Count total alert messages, unread alerts, and unique aircraft
  const stats = useMemo(() => {
    let totalAlerts = 0;
    let unreadAlerts = 0;
    const uniqueAircraft = new Set<string>();

    for (const group of alertMessageGroups.values()) {
      totalAlerts += group.messages.length;
      // Use first identifier as unique key
      if (group.identifiers.length > 0) {
        uniqueAircraft.add(group.identifiers[0]);
      }
      // Count unread alerts
      for (const message of group.messages) {
        if (!readMessageUids.has(message.uid)) {
          unreadAlerts++;
        }
      }
    }

    return {
      totalAlerts,
      unreadAlerts,
      uniqueAircraft: uniqueAircraft.size,
    };
  }, [alertMessageGroups, readMessageUids]);

  // No longer needed - alertCount is calculated in AppStore addMessage()

  useEffect(() => {
    setCurrentPage("Alerts");
    socketService.notifyPageChange("Alerts");
    uiLogger.info("Alerts page loaded", {
      termCount: alertTerms.terms.length,
      ignoreCount: alertTerms.ignore.length,
      alertGroups: alertMessageGroups.size,
      unreadAlerts: stats.unreadAlerts,
    });
  }, [setCurrentPage, alertTerms, alertMessageGroups.size, stats.unreadAlerts]);

  // Convert messageGroups Map to array and sort by most recent message (newest first)
  const alertGroupsArray = useMemo(() => {
    const groups = Array.from(alertMessageGroups.values());
    return groups.sort((a, b) => {
      // Get the most recent message timestamp from each group
      const aTimestamp = a.messages[0]?.timestamp || 0;
      const bTimestamp = b.messages[0]?.timestamp || 0;
      // Sort descending (newest first)
      return bTimestamp - aTimestamp;
    });
  }, [alertMessageGroups]);

  const handleMarkAllRead = () => {
    markAllAlertsAsRead();
    uiLogger.info("User manually marked all alerts as read", {
      count: stats.unreadAlerts,
    });
  };

  return (
    <div className="page alerts-page">
      <div className="page__header">
        <h1 className="page__title">Alerts</h1>

        <div className="page__stats">
          <span className="stat">
            <strong>{stats.unreadAlerts}</strong> unread
          </span>
          <span className="stat-separator">|</span>
          <span className="stat">
            <strong>{stats.totalAlerts}</strong> total alert
            {stats.totalAlerts !== 1 ? "s" : ""}
          </span>
          <span className="stat-separator">|</span>
          <span className="stat">
            <strong>{stats.uniqueAircraft}</strong> aircraft
          </span>
          {stats.unreadAlerts > 0 && (
            <>
              <span className="stat-separator">|</span>
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="alerts-page__mark-read-button"
                title="Mark all alerts as read"
              >
                Mark All Read
              </button>
            </>
          )}
        </div>
      </div>

      <div className="page__content">
        {alertTerms.terms.length === 0 ? (
          <div className="alerts-page__empty-state">
            <div className="alerts-page__empty-state-content">
              <h2>No Alert Terms Configured</h2>
              <p>
                Configure alert terms in Settings → Notifications to start
                receiving alerts for specific keywords, aircraft, or flight
                numbers.
              </p>
              <p className="text-muted">
                Alert terms can match message text, callsigns, tail numbers, or
                ICAO hex codes.
              </p>
            </div>
          </div>
        ) : stats.totalAlerts === 0 ? (
          <div className="alerts-page__empty-state">
            <div className="alerts-page__empty-state-content">
              <h2>No Matching Messages</h2>
              <p>
                No messages have been received that match your configured alert
                terms.
              </p>
              <div className="alerts-page__current-terms">
                <h3>Active Alert Terms</h3>
                <div className="alerts-page__term-list">
                  {alertTerms.terms.map((term) => (
                    <span key={term} className="alerts-page__term-badge">
                      {term}
                    </span>
                  ))}
                </div>
                {alertTerms.ignore.length > 0 && (
                  <>
                    <h3>Ignore Terms</h3>
                    <div className="alerts-page__term-list">
                      {alertTerms.ignore.map((term) => (
                        <span
                          key={term}
                          className="alerts-page__term-badge alerts-page__term-badge--ignore"
                        >
                          {term}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="alerts-page__messages">
            {alertGroupsArray.map((plane) => (
              <MessageGroup
                key={plane.identifiers[0] || "unknown"}
                plane={plane}
                showMarkReadButton={true}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
