import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vite.dev/config/
export default defineConfig({
  // For production builds (Docker/nginx): use relative paths
  base: "./",

  // For local reverse proxy testing: uncomment line below and comment out line above
  // base: "/acarshub-test/",
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
    nodePolyfills({
      // Enable polyfills for specific Node.js modules
      // zlib is needed by minizlib (used by @airframes/acars-decoder)
      include: ["events", "stream", "string_decoder", "buffer", "util", "zlib"],
      // Optionally include globals like Buffer and process
      globals: {
        Buffer: true,
        process: true,
      },
    }),
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
        manualChunks: {
          // Split vendor chunks for better caching
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["chart.js", "react-chartjs-2", "chartjs-adapter-date-fns"],
          map: ["maplibre-gl"],
          decoder: ["@airframes/acars-decoder"],
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
        target: "http://localhost:8080",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/acarshub-test/, ""),
      },
      // Fallback Socket.IO proxy (no base path)
      "^/socket.io": {
        target: "http://localhost:8080",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path,
      },
      // Proxy metrics endpoint (with base path support)
      "^/acarshub-test/metrics": {
        target: "http://localhost:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/acarshub-test/, ""),
      },
      // Fallback metrics proxy (no base path)
      "^/metrics": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
