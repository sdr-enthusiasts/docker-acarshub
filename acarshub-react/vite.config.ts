import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vite.dev/config/
export default defineConfig({
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
  ],
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      // Proxy Socket.IO requests to Flask backend
      "/socket.io": {
        target: "http://localhost:8080",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path,
      },
      // Proxy metrics endpoint
      "/metrics": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
