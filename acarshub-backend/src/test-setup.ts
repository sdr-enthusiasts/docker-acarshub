// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
//
// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Global Vitest setup file.
 *
 * Runs once before any test module is loaded. Used to configure Node.js
 * process-level settings that must be in place before tests start.
 *
 * MaxListeners adjustment
 * -----------------------
 * prom-client's GC PerformanceObserver registers listeners on the process
 * object (uncaughtException, unhandledRejection, exit, SIGINT, SIGTERM).
 * Because metrics.test.ts calls resetMetricsForTesting() + collectMetrics()
 * in each beforeEach — rebuilding the registry 25+ times per run — Node.js
 * would emit a MaxListenersExceededWarning at the default limit of 10.
 *
 * Raising the limit to 128 is safe here: we are not hiding actual leaks
 * (the listeners are intentionally re-added per-test in a controlled way)
 * and 128 is well above the number of tests in the suite.
 */
process.setMaxListeners(128);

// ---------------------------------------------------------------------------
// Environment defaults for integration tests
//
// config.ts evaluates ALLOW_REMOTE_UPDATES at module-load time from
// process.env.  The config unit tests explicitly delete ALLOW_REMOTE_UPDATES
// before each import, so setting it here is safe.
//
// We deliberately do NOT set ENABLE_ACARS/VDLM/HFDl, MIN_LOG_LEVEL, or
// QUIET_MESSAGES here because the config unit tests assert on their default
// values (false / "info" / false respectively) without first deleting them.
// Setting them in test-setup would pollute the originalEnv snapshot those
// tests capture and cause false failures.
//
// Integration tests assert only on the *shape* of features_enabled (all
// fields are booleans), not on specific values, so they are unaffected by
// whatever defaults the config module picks up.
// ---------------------------------------------------------------------------

// Allow remote updates (alerts/regeneration) by default.
// The config test for this explicitly calls `delete process.env.ALLOW_REMOTE_UPDATES`
// before each "default" import, so setting it here is safe.
process.env.ALLOW_REMOTE_UPDATES = process.env.ALLOW_REMOTE_UPDATES ?? "true";
