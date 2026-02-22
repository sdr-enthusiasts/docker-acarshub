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
      // Coverage thresholds
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
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
