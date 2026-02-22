import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

// ---------------------------------------------------------------------------
// Version constants — read from each workspace package.json at build time.
// This eliminates the need to inject VITE_VERSION as a Docker ARG; the values
// come directly from the source of truth (package.json files) during `vite build`.
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

// https://vite.dev/config/
export default defineConfig({
  // For production builds (Docker/nginx): use relative paths
  base: "./",

  // For local reverse proxy testing: uncomment line below and comment out line above
  // base: "/acarshub-test/",

  // Bake version strings into the bundle at build time from the actual
  // package.json files. No environment variable injection required.
  define: {
    __CONTAINER_VERSION__: JSON.stringify(containerVersion),
    __FRONTEND_VERSION__: JSON.stringify(frontendVersion),
    __BACKEND_VERSION__: JSON.stringify(backendVersion),
  },

  resolve: {
    alias: {
      "@": "/src",
    },
  },
  ssr: {
    noExternal: ["react-map-gl", "maplibre-gl"],
  },
  plugins: [
    react(),
    // Bundle size visualization (only in build mode)
    visualizer({
      filename: "./dist/stats.html",
      open: false,
      gzipSize: true,
      brotliSize: true,
      template: "treemap", // sunburst, treemap, network
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // React core
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react-router-dom/")
          ) {
            return "react";
          }

          // Font Awesome - all icons and core into fonts chunk
          if (id.includes("@fortawesome")) {
            return "fonts";
          }

          // Charts
          if (
            id.includes("chart.js") ||
            id.includes("react-chartjs-2") ||
            id.includes("chartjs-adapter-date-fns") ||
            id.includes("chartjs-plugin-datalabels")
          ) {
            return "charts";
          }

          // Map library
          if (id.includes("maplibre-gl") || id.includes("react-maplibre")) {
            return "map";
          }

          // socket.io
          if (id.includes("socket.io-client")) {
            return "socketio";
          }
        },
      },
    },
    // Warn if chunk size exceeds 500KB
    chunkSizeWarningLimit: 500,
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      // Proxy Socket.IO requests to Flask backend (with base path support)
      "^/acarshub-test/socket.io": {
        target: "http://localhost:8888",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/acarshub-test/, ""),
      },
      // Fallback Socket.IO proxy (no base path)
      "^/socket.io": {
        target: "http://localhost:8888",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path,
      },
      // Proxy metrics endpoint (with base path support)
      "^/acarshub-test/metrics": {
        target: "http://localhost:8888",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/acarshub-test/, ""),
      },
      // Fallback metrics proxy (no base path)
      "^/metrics": {
        target: "http://localhost:8888",
        changeOrigin: true,
      },
    },
  },
});
