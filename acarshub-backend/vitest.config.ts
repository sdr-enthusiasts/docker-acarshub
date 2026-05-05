import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["src/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "**/*.config.*",
        "**/__tests__/**",
        "**/types/**",
      ],
      // TEST-CFG-01: Coverage thresholds set at the measured floor (with a
      // small safety margin) so CI fails if coverage regresses. Current
      // measured coverage at the time these were set:
      //   statements 84.65 / branches 71.01 / functions 88.59 / lines 84.99
      //
      // Thresholds are intentionally a few points below the floor so that
      // small unrelated refactors don't tip the build red. Ratchet these
      // upward as untested modules (services/index.ts, services/station-ids.ts,
      // services/decoder-listener.ts, db/client.ts, services/stats-pruning.ts)
      // gain coverage. AGENTS.md targets are 80% for services and 90% for
      // formatters/enrichment — the global floor below is the conservative
      // services target; per-area higher thresholds can be added later.
      thresholds: {
        statements: 80,
        branches: 65,
        functions: 85,
        lines: 80,
      },
    },
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
  },
});
