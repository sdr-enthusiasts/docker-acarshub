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

import { memo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useSettingsStore } from "../store/useSettingsStore";
import type { AcarsMsg } from "../types";
import { formatTimestamp } from "../utils/dateUtils";
import {
  formatDecodedText,
  highlightMatchedText,
  parseAndFormatLibacars,
} from "../utils/decoderUtils";
import { ensureHexFormat } from "../utils/stringUtils";

interface MessageCardProps {
  message: AcarsMsg;
  isAlert?: boolean;
  showDuplicates?: string;
  showMessageParts?: string;
  showMarkReadButton?: boolean;
}

/**
 * MessageCard Component
 * Displays a single ACARS message with all available fields
 *
 * Design Notes:
 * - Uses definition list (dl/dt/dd) for semantic field display
 * - Conditionally renders fields only when data exists
 * - Highlights alert matches in red
 * - Links to external flight tracking when configured
 * - Mobile-first responsive layout
 */
export const MessageCard = memo(
  ({
    message,
    isAlert = false,
    showDuplicates,
    showMessageParts,
    showMarkReadButton = false,
  }: MessageCardProps) => {
    const settings = useSettingsStore((state) => state.settings);
    const readMessageUids = useAppStore((state) => state.readMessageUids);
    const markMessageAsRead = useAppStore((state) => state.markMessageAsRead);

    const isRead = readMessageUids.has(message.uid);

    const handleMarkAsRead = () => {
      markMessageAsRead(message.uid);
    };

    // Format timestamp using user's preferred format
    // Handle both timestamp and msg_time fields from ACARS messages
    // Use useState with lazy initialization to get a stable fallback timestamp
    const [fallbackTimestamp] = useState(() => Math.floor(Date.now() / 1000));
    const timestamp =
      message.timestamp || message.msg_time || fallbackTimestamp;
    const formattedTimestamp = formatTimestamp(
      timestamp * 1000, // Convert Unix timestamp to milliseconds
      settings.regional.timeFormat,
      settings.regional.dateFormat,
      settings.regional.timezone,
    );

    // Message type badge color mapping
    const getMessageTypeClass = (type: string | undefined): string => {
      if (!type) return "message-type--unknown";
      const typeMap: Record<string, string> = {
        ACARS: "message-type--acars",
        VDLM: "message-type--vdlm",
        "VDL-M2": "message-type--vdlm",
        HFDL: "message-type--hfdl",
        IMSL: "message-type--imsl",
        IRDM: "message-type--irdm",
      };
      return typeMap[type.toUpperCase()] || "message-type--unknown";
    };

    return (
      <div
        className={`message-card ${isAlert ? "message-card--alert" : ""} ${isRead ? "message-card--read" : ""}`}
      >
        {/* Message Header */}
        <div className="message-card__header">
          <div className="message-card__type-badge">
            <span
              className={`message-type ${getMessageTypeClass(message.message_type)}`}
            >
              {message.message_type || "UNKNOWN"}
            </span>
            {message.station_id && (
              <span className="message-station">{message.station_id}</span>
            )}
          </div>
          <div className="message-card__header-right">
            <div className="message-card__timestamp">{formattedTimestamp}</div>
            {showMarkReadButton && !isRead && (
              <button
                type="button"
                onClick={handleMarkAsRead}
                className="message-card__mark-read-btn"
                title="Mark this alert as read"
              >
                Mark Read
              </button>
            )}
            {showMarkReadButton && isRead && (
              <span className="message-card__read-badge">Read</span>
            )}
          </div>
        </div>

        {/* Aircraft Identifiers */}
        <div className="message-card__identifiers">
          {message.tail && (
            <div className="identifier">
              <span className="identifier__label">Tail:</span>
              <span className="identifier__value">{message.tail}</span>
            </div>
          )}
          {(message.icao_flight || message.flight) && (
            <div className="identifier">
              <span className="identifier__label">Flight:</span>
              <span className="identifier__value">
                {message.icao_flight || message.flight}
                {message.airline && ` ${message.airline}`}
              </span>
            </div>
          )}
          {message.icao && (
            <div className="identifier">
              <span className="identifier__label">ICAO:</span>
              <span className="identifier__value">
                {message.icao_hex
                  ? ensureHexFormat(message.icao_hex)
                  : message.icao.toString(16).toUpperCase().padStart(6, "0")}
              </span>
            </div>
          )}
        </div>

        {/* Message Fields */}
        <dl className="message-card__fields">
          {/* Special tracking fields */}
          {showDuplicates && (
            <div className="message-field">
              <dt className="message-field__label">Duplicate(s) Received</dt>
              <dd className="message-field__value">{showDuplicates}</dd>
            </div>
          )}

          {showMessageParts && (
            <div className="message-field">
              <dt className="message-field__label">Message Parts</dt>
              <dd className="message-field__value">{showMessageParts}</dd>
            </div>
          )}

          {/* Label */}
          {message.label && (
            <div className="message-field">
              <dt className="message-field__label">Message Label</dt>
              <dd className="message-field__value">
                {message.label}
                {message.label_type && ` ${message.label_type.trim()}`}
              </dd>
            </div>
          )}

          {/* IATA Callsign */}
          {message.iata_flight &&
            message.iata_flight !== message.icao_flight && (
              <div className="message-field">
                <dt className="message-field__label">IATA Callsign</dt>
                <dd className="message-field__value">{message.iata_flight}</dd>
              </div>
            )}

          {/* Airline */}
          {message.airline &&
            message.airline !== "Unknown Airline" &&
            message.airline !== "UNKNOWN AIRLINE" && (
              <div className="message-field">
                <dt className="message-field__label">Airline</dt>
                <dd className="message-field__value">{message.airline}</dd>
              </div>
            )}

          {/* Addresses */}
          {message.toaddr && (
            <div className="message-field">
              <dt className="message-field__label">To Address</dt>
              <dd className="message-field__value">
                {message.toaddr}
                {message.toaddr_hex
                  ? `/${ensureHexFormat(message.toaddr_hex)}`
                  : "/?"}
              </dd>
            </div>
          )}

          {message.toaddr_decoded && (
            <div className="message-field">
              <dt className="message-field__label">To Address Station ID</dt>
              <dd className="message-field__value">{message.toaddr_decoded}</dd>
            </div>
          )}

          {message.fromaddr && (
            <div className="message-field">
              <dt className="message-field__label">From Address</dt>
              <dd className="message-field__value">
                {message.fromaddr}
                {message.fromaddr_hex
                  ? `/${ensureHexFormat(message.fromaddr_hex)}`
                  : "/?"}
              </dd>
            </div>
          )}

          {message.fromaddr_decoded && (
            <div className="message-field">
              <dt className="message-field__label">From Address Station ID</dt>
              <dd className="message-field__value">
                {message.fromaddr_decoded}
              </dd>
            </div>
          )}

          {/* Flight Information */}
          {message.depa && (
            <div className="message-field">
              <dt className="message-field__label">Departing</dt>
              <dd className="message-field__value">{message.depa}</dd>
            </div>
          )}

          {message.dsta && (
            <div className="message-field">
              <dt className="message-field__label">Destination</dt>
              <dd className="message-field__value">{message.dsta}</dd>
            </div>
          )}

          {message.eta && (
            <div className="message-field">
              <dt className="message-field__label">
                Estimated Time of Arrival
              </dt>
              <dd className="message-field__value">{message.eta}</dd>
            </div>
          )}

          {/* Gate and Runway Times */}
          {message.gtout && (
            <div className="message-field">
              <dt className="message-field__label">Pushback from Gate</dt>
              <dd className="message-field__value">{message.gtout}</dd>
            </div>
          )}

          {message.gtin && (
            <div className="message-field">
              <dt className="message-field__label">Arrived at Gate</dt>
              <dd className="message-field__value">{message.gtin}</dd>
            </div>
          )}

          {message.wloff && (
            <div className="message-field">
              <dt className="message-field__label">Wheels Off</dt>
              <dd className="message-field__value">{message.wloff}</dd>
            </div>
          )}

          {message.wlin && (
            <div className="message-field">
              <dt className="message-field__label">Wheels On</dt>
              <dd className="message-field__value">{message.wlin}</dd>
            </div>
          )}

          {/* Position Data */}
          {message.lat !== undefined && (
            <div className="message-field">
              <dt className="message-field__label">Latitude</dt>
              <dd className="message-field__value">
                {Number(message.lat).toFixed(6)}°
              </dd>
            </div>
          )}

          {message.lon !== undefined && (
            <div className="message-field">
              <dt className="message-field__label">Longitude</dt>
              <dd className="message-field__value">
                {Number(message.lon).toFixed(6)}°
              </dd>
            </div>
          )}

          {message.alt !== undefined && (
            <div className="message-field">
              <dt className="message-field__label">Altitude</dt>
              <dd className="message-field__value">{message.alt} ft</dd>
            </div>
          )}

          {/* Technical Details */}
          {message.freq && (
            <div className="message-field">
              <dt className="message-field__label">Frequency</dt>
              <dd className="message-field__value">
                {Number(message.freq).toFixed(3)} MHz
              </dd>
            </div>
          )}

          {message.ack && (
            <div className="message-field">
              <dt className="message-field__label">ACK</dt>
              <dd className="message-field__value">{message.ack}</dd>
            </div>
          )}

          {message.mode && (
            <div className="message-field">
              <dt className="message-field__label">Mode</dt>
              <dd className="message-field__value">{message.mode}</dd>
            </div>
          )}

          {message.block_id && (
            <div className="message-field">
              <dt className="message-field__label">Block ID</dt>
              <dd className="message-field__value">{message.block_id}</dd>
            </div>
          )}

          {message.msgno && (
            <div className="message-field">
              <dt className="message-field__label">Message Number</dt>
              <dd className="message-field__value">{message.msgno}</dd>
            </div>
          )}

          {message.is_response !== undefined && (
            <div className="message-field">
              <dt className="message-field__label">Response</dt>
              <dd className="message-field__value">
                {message.is_response ? "Yes" : "No"}
              </dd>
            </div>
          )}

          {message.is_onground !== undefined && (
            <div className="message-field">
              <dt className="message-field__label">On Ground</dt>
              <dd className="message-field__value">
                {message.is_onground ? "Yes" : "No"}
              </dd>
            </div>
          )}

          {message.error !== undefined && message.error !== 0 && (
            <div className="message-field message-field--error">
              <dt className="message-field__label">Error</dt>
              <dd className="message-field__value">{message.error}</dd>
            </div>
          )}

          {message.level !== undefined && (
            <div className="message-field">
              <dt className="message-field__label">Signal Level</dt>
              <dd className="message-field__value">{message.level} dB</dd>
            </div>
          )}
        </dl>

        {/* Message Content */}
        <div className="message-card__content">
          {/* Decoded Text from @airframes/acars-decoder */}
          {message.decodedText && (
            <div className="message-content message-content--decoded">
              <div className="message-content__label">
                Decoded Text (
                {message.decodedText.decoder.decodeLevel === "full"
                  ? "Full"
                  : "Partial"}
                ):
              </div>
              <pre
                className="message-content__text"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: needed for formatted decoder output
                dangerouslySetInnerHTML={{
                  __html: formatDecodedText(
                    message.decodedText,
                    message.matched_text,
                  ),
                }}
              />
            </div>
          )}

          {/* Raw Text (hidden on small screens if decoded text exists) */}
          {message.text && (
            <div
              className={`message-content ${message.decodedText ? "message-content--hide-small" : ""}`}
            >
              <div className="message-content__label">
                {message.decodedText ? "Non-Decoded Text:" : "Text:"}
              </div>
              <pre
                className="message-content__text"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: needed for alert term highlighting
                dangerouslySetInnerHTML={{
                  __html: message.matched_text
                    ? highlightMatchedText(
                        message.matched_text,
                        message.text.replace(/\\r\\n/g, "<br>"),
                      )
                    : message.text.replace(/\\r\\n/g, "<br>"),
                }}
              />
            </div>
          )}

          {/* Data field */}
          {message.data && (
            <div className="message-content">
              <div className="message-content__label">Data:</div>
              <pre
                className="message-content__data"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: needed for alert term highlighting
                dangerouslySetInnerHTML={{
                  __html: message.matched_text
                    ? highlightMatchedText(
                        message.matched_text,
                        message.data.replace(/\\r\\n/g, "<br>"),
                      )
                    : message.data.replace(/\\r\\n/g, "<br>"),
                }}
              />
            </div>
          )}

          {/* Decoded message field */}
          {message.decoded_msg && (
            <div className="message-content">
              <div className="message-content__label">Decoded:</div>
              <pre className="message-content__decoded">
                {message.decoded_msg}
              </pre>
            </div>
          )}

          {/* No content message */}
          {!message.text &&
            !message.data &&
            !message.decoded_msg &&
            !message.decodedText && (
              <div className="message-content message-content--empty">
                <pre className="message-content__text">
                  <em>No text</em>
                </pre>
              </div>
            )}
        </div>

        {/* Libacars Decoded Data */}
        {message.libacars &&
          (() => {
            const formatted = parseAndFormatLibacars(message.libacars);
            if (formatted) {
              return (
                <div className="message-card__libacars">
                  <div
                    className="libacars-content"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: needed for libacars decoder output
                    dangerouslySetInnerHTML={{ __html: formatted }}
                  />
                </div>
              );
            }
            return (
              <div className="message-card__libacars message-card__libacars--error">
                <pre className="libacars-error">
                  Error parsing Libacars data. Please see browser console for
                  details and submit a bug report.
                </pre>
              </div>
            );
          })()}

        {/* Alert Match Information */}
        {message.matched && (
          <div className="message-card__alert-info">
            <div className="alert-badge">
              <span className="alert-badge__icon">⚠</span>
              <span className="alert-badge__text">Alert Match</span>
            </div>
            {message.matched_text && message.matched_text.length > 0 && (
              <div className="alert-match">
                <span className="alert-match__label">Text matches:</span>
                <span className="alert-match__values">
                  {message.matched_text.join(", ")}
                </span>
              </div>
            )}
            {message.matched_icao && message.matched_icao.length > 0 && (
              <div className="alert-match">
                <span className="alert-match__label">ICAO matches:</span>
                <span className="alert-match__values">
                  {message.matched_icao.join(", ")}
                </span>
              </div>
            )}
            {message.matched_flight && message.matched_flight.length > 0 && (
              <div className="alert-match">
                <span className="alert-match__label">Flight matches:</span>
                <span className="alert-match__values">
                  {message.matched_flight.join(", ")}
                </span>
              </div>
            )}
            {message.matched_tail && message.matched_tail.length > 0 && (
              <div className="alert-match">
                <span className="alert-match__label">Tail matches:</span>
                <span className="alert-match__values">
                  {message.matched_tail.join(", ")}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);

MessageCard.displayName = "MessageCard";
