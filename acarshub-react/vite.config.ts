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
    // PERF-BUNDLE Phase B (see agent-docs/REMEDIATION_PLAN.md §15):
    // `build.modulePreload.resolveDependencies` (above) strips route-only
    // vendor *script* preload hints from the root HTML, but Vite has no
    // equivalent public config for CSS — any stylesheet associated with a
    // named `manualChunks` group gets an unconditional `<link
    // rel="stylesheet">` in the generated `index.html`, regardless of
    // whether that chunk's JS is reached via a static or dynamic import.
    // `map-*.css` (maplibre-gl's base styles, ~10KB gzip) was blocking
    // render on every route, including ones that never touch the map.
    // Strip it here; the chunk-loading runtime (rolldown/vite's
    // `__vitePreload` helper) injects the stylesheet dynamically the
    // moment the "map" JS chunk itself is actually requested (verified —
    // see the Docker Playwright check in the PERF-BUNDLE Phase B
    // write-up), so this doesn't reintroduce a FOUC on `/adsb` itself.
    {
      name: "strip-eager-route-only-css",
      apply: "build",
      transformIndexHtml(html) {
        return html.replace(
          /\s*<link rel="stylesheet"[^>]*href="[^"]*\/map-[^"]*\.css"[^>]*>\n?/,
          "\n",
        );
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        // PERF-BUNDLE Phase B (see agent-docs/REMEDIATION_PLAN.md §15):
        // this project builds with Rolldown (Vite 8's default bundler —
        // note the `rolldown-runtime` chunk and the
        // `build.rolldownOptions.output.codeSplitting` hint in Vite's own
        // build warnings). The classic Rollup-compatible `manualChunks`
        // callback form (equivalent to `codeSplitting.groups[].name()`
        // under the hood) has a confirmed, currently-open upstream bug:
        // when a module (e.g. a small shared CJS-interop helper for
        // "react"/"react-dom", which are themselves CJS-only packages
        // with no ESM entry point) is needed by more than one manually-
        // named chunk, Rolldown's chunk optimizer assigns it to only the
        // *first* chunk that claims it and forces every other chunk to
        // statically import it from there
        // (rolldown/rolldown#6083, rolldown/rolldown#9291). Concretely,
        // this meant the "react" bucket didn't fully contain react's own
        // interop code — a duplicate landed inside "charts"/"map"
        // instead, and the eagerly-loaded entry chunk statically
        // `import`ed it back out of those two lazy vendor chunks,
        // forcing the *entire* 1MB `map`/253KB `charts` files to load on
        // every single page regardless of route. rolldown/rolldown#9291
        // confirms the regex-based `codeSplitting.groups[].test` form
        // does not hit this bug (only the `name()`/`manualChunks`
        // function form does) — verified here too: switching to `test`
        // patterns removes the forced entry -> map/charts static import
        // entirely (confirmed via inspecting the built entry chunk's
        // import list and a real-browser network trace, see the
        // Phase B write-up).
        codeSplitting: {
          groups: [
            // Vite/Rolldown's own internal virtual runtime helpers (e.g.
            // `__vitePreload`, used by every dynamic `import()` call —
            // both the route-level ones in `App.tsx` and any internal
            // ones inside `maplibre-gl`/`@vis.gl/react-maplibre`) hit the
            // exact same rolldown/rolldown#6083 sharing bug as the
            // react/react-dom case below: without an explicit group,
            // Rolldown assigned the single shared instance of
            // `vite/preload-helper.js` to whichever chunk claimed it
            // first (`map`), forcing the entry to statically import it
            // back out — reintroducing the eager-load bug for one
            // leftover shared module even after the react/charts fix.
            // Claiming it explicitly (matching classic Vite/Rollup's own
            // documented list of shared-helper ids prone to this, e.g.
            // vitejs/vite#5189) keeps it out of any route-specific chunk.
            {
              name: "vite-runtime-helpers",
              test: /vite\/preload-helper|vite\/modulepreload-polyfill|vite\/dynamic-import-helper|commonjsHelpers|commonjs-dynamic-modules/,
            },
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|react-router-dom)[\\/]/,
            },
            {
              name: "charts",
              test: /node_modules[\\/](chart\.js|react-chartjs-2|chartjs-adapter-date-fns|chartjs-plugin-datalabels)[\\/]/,
            },
            // Map library. `react-map-gl@8+` is a thin compatibility shim
            // (`node_modules/react-map-gl/dist/maplibre.js`) re-exporting
            // the real implementation package `@vis.gl/react-maplibre` —
            // matched explicitly since its own path doesn't contain
            // "maplibre-gl" or "react-maplibre" (PERF-BUNDLE Phase A
            // finding #5 — ~133 bytes, negligible size but wrong cache
            // partition without this).
            {
              name: "map",
              test: /node_modules[\\/](maplibre-gl|react-map-gl|@vis\.gl[\\/]react-maplibre)[\\/]/,
            },
            {
              name: "socketio",
              test: /node_modules[\\/]socket\.io-client[\\/]/,
            },
          ],
        },
      },
    },
    // Warn if chunk size exceeds 500KB
    chunkSizeWarningLimit: 500,
    // PERF-BUNDLE Phase B (see agent-docs/REMEDIATION_PLAN.md §15): by
    // default Vite's `modulePreload` preloads the *entire* async-import
    // dependency graph reachable from the entry — including route-only
    // vendor chunks like `map` (maplibre-gl, ~280KB gzip) and `charts`
    // (chart.js, ~83KB gzip) — from the root `index.html`, regardless of
    // which route the user actually lands on. That defeats the whole
    // point of the route-level `React.lazy()` splitting in `App.tsx`: a
    // user on the default Live Messages route was paying for both
    // vendor chunks anyway. This filter only strips them from the
    // `"html"` host (the initial document's preload list); it leaves
    // `"js"`-host preloads untouched, so the *correct* preload — issued
    // when a lazy route's own `import()` actually resolves and needs its
    // vendor chunk — still fires normally.
    modulePreload: {
      resolveDependencies: (_filename, deps, { hostType }) => {
        if (hostType !== "html") {
          return deps;
        }
        return deps.filter(
          (dep) => !dep.includes("/map-") && !dep.includes("/charts-"),
        );
      },
    },
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
      // HeyWhatsThat coverage GeoJSON (with base path support)
      "^/acarshub-test/data/heywhatsthat\\.geojson": {
        target: "http://localhost:8888",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/acarshub-test/, ""),
      },
      // Fallback HeyWhatsThat proxy (no base path)
      "^/data/heywhatsthat\\.geojson": {
        target: "http://localhost:8888",
        changeOrigin: true,
      },
    },
  },
});
