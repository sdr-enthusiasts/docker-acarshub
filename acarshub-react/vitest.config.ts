import { readFileSync } from "node:fs";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

import { defineConfig } from "vitest/config";

// ---------------------------------------------------------------------------
// Version constants — mirrors the define block in vite.config.ts so that
// tests which import modules referencing __CONTAINER_VERSION__ etc. resolve
// correctly under Vitest (which uses its own config, not vite.config.ts).
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));

function readPkgVersion(absPath: string): string {
  try {
    const pkg = JSON.parse(readFileSync(absPath, "utf-8")) as {
      version?: string;
    };
    return typeof pkg.version === "string" && pkg.version.length > 0
      ? pkg.version
      : "unknown";
  } catch {
    return "unknown";
  }
}

const containerVersion = readPkgVersion(resolve(__dirname, "../package.json"));
const frontendVersion = readPkgVersion(resolve(__dirname, "package.json"));
const backendVersion = readPkgVersion(
  resolve(__dirname, "../acarshub-backend/package.json"),
);

export default defineConfig({
  plugins: [react()],
  define: {
    __CONTAINER_VERSION__: JSON.stringify(containerVersion),
    __FRONTEND_VERSION__: JSON.stringify(frontendVersion),
    __BACKEND_VERSION__: JSON.stringify(backendVersion),
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/",
        "src/test/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/mockData.ts",
        "dist/",
      ],
      // TEST-CFG-02: Per-area coverage thresholds set at the measured floor
      // (with safety margin) so CI fails on regression. AGENTS.md targets:
      //   utils 90% / store 80% / components 70%
      //
      // Current measured coverage at the time these were set:
      //   global  76.33 / 68.07 / 76.78 / 76.61
      //   utils   93.19 / 86.85 / 95.28 / 93.84  (above target)
      //   hooks   93.13 / 62.22 / 93.22 / 93.44  (above target on most axes)
      //   store   69.07 / 60.46 / 68.75 / 69.39  (below target — ratchet later)
      //
      // The store/* thresholds are intentionally below the AGENTS.md 80% goal
      // because that is where coverage actually sits today. Backfill tests
      // for useAppStore/useSettingsStore (uncovered branches around 1075-1079
      // / 803, 864, 882) and raise those floors as work lands.
      thresholds: {
        // Global floor (matches the previous flat thresholds).
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
        // Per-area floors. Globs are relative to the vitest root.
        "src/utils/**": {
          lines: 88,
          functions: 90,
          branches: 80,
          statements: 88,
        },
        "src/hooks/**": {
          lines: 88,
          functions: 88,
          branches: 55,
          statements: 88,
        },
        "src/store/**": {
          lines: 65,
          functions: 65,
          branches: 55,
          statements: 65,
        },
      },
    },
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", ".direnv", ".venv"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
