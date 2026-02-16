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

/**
 * ACARS Hub Node.js Backend Server
 *
 * This is a placeholder server file that will be implemented during
 * the Python → Node.js migration (Week 1-6 of migration plan).
 *
 * See: dev-docs/NODEJS_MIGRATION_PLAN.md
 */

import type { SocketEmitEvents, SocketEvents } from "@acarshub/types";

interface ServerConfig {
  port: number;
  host: string;
}

const config: ServerConfig = {
  port: Number.parseInt(process.env.PORT ?? "8080", 10),
  host: process.env.HOST ?? "0.0.0.0",
};

console.log("ACARS Hub Backend - Placeholder Server");
console.log(`Configuration: ${JSON.stringify(config, null, 2)}`);
console.log("");
console.log(
  "This is a placeholder. The actual server will be implemented during:",
);
console.log("  - Week 1: Database Layer (Drizzle ORM + SQLite)");
console.log("  - Week 2: Socket.IO Server");
console.log("  - Week 3: Background Services (TCP listeners, ADS-B poller)");
console.log("  - Week 4: Message Formatters & Metrics");
console.log("  - Week 5-6: Testing & Deployment");
console.log("");
console.log("See dev-docs/NODEJS_MIGRATION_PLAN.md for details.");
console.log("");
console.log("Type safety is already working:");
console.log("  - Shared types from @acarshub/types");
console.log("  - SocketEvents and SocketEmitEvents define the API contract");
console.log("  - Frontend and backend will use THE SAME type definitions");

// Type checking works!
// @ts-expect-error - Unused variable for type checking only
const _typeCheck: SocketEvents = {
  acars_msg: () => {},
  newmsg: () => {},
  labels: () => {},
  terms: () => {},
  alert_matches: () => {},
  database_search_results: () => {},
  alerts_by_term_results: () => {},
  system_status: () => {},
  signal: () => {},
  signal_freqs: () => {},
  signal_count: () => {},
  adsb: () => {},
  adsb_aircraft: () => {},
  decoders: () => {},
  alert_terms_stats: () => {},
  database_size: () => {},
  acarshub_version: () => {},
};

// @ts-expect-error - Unused variable for type checking only
const _emitTypeCheck: SocketEmitEvents = {
  query_search: () => {},
  update_alerts: () => {},
  signal_freqs: () => {},
  signal_count: () => {},
  alert_term_query: () => {},
  request_status: () => {},
  query_alerts_by_term: () => {},
};

console.log("✅ TypeScript compilation successful!");
console.log("✅ Shared types working!");
console.log("");
console.log("Next: Run 'just ci' to verify everything still works.");
