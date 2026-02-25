# ============================================================
# Stage 1: Build React frontend + Node.js backend
# ============================================================
FROM node:25.6.1-slim@sha256:32f45869cf02c26971de72c383d5f99cab002905ed8b515b56df925007941782 AS acarshub-react-builder
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

WORKDIR /workspace

# Build number comes from CI (GitHub Actions run number).
# Version strings are read directly from the workspace package.json files by
# vite.config.ts (frontend) and config.ts (backend) — no ARG injection needed.
ARG BUILD_NUMBER=0

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY acarshub-react/ ./acarshub-react/
COPY acarshub-backend/ ./acarshub-backend/
COPY acarshub-types/ ./acarshub-types/

# Install all workspace dependencies (devDeps required for tsc/vite build tools)
# --loglevel=error suppresses deprecation warnings from transitive deps in @lhci/cli
# and drizzle-kit (both at latest versions; upstream fixes required to remove them)
RUN set -xe && \
    npm ci --include=dev --loglevel=error

# Re-declare ARG after FROM so it is in scope for the RUN
ARG BUILD_NUMBER=0

RUN set -xe && \
    export VITE_BUILD_NUMBER="${BUILD_NUMBER}" && \
    npm run build && \
    # Bundle the backend into a single ESM file with esbuild.
    # better-sqlite3 and zeromq are marked external because they contain native
    # .node addons that cannot be inlined into a JS bundle — they must be loaded
    # from disk by Node.js at runtime.  All other production dependencies
    # (fastify, socket.io, drizzle-orm, pino, pino-pretty, zod, @airframes, …)
    # are inlined, so they do not need to be present in the runtime node_modules.
    # node:* built-ins are always external.
    npx esbuild acarshub-backend/src/server.ts \
    --bundle \
    --platform=node \
    --format=esm \
    --target=node22 \
    --external:better-sqlite3 \
    --external:zeromq \
    --external:'node:*' \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
    --outfile=/backend/server.bundle.mjs && \
    # Stage React SPA output
    mkdir -p /webapp/dist && \
    cp -r ./acarshub-react/dist/* /webapp/dist/ && \
    # Stage Drizzle SQL migration files (needed by the migrator at runtime)
    cp -r ./acarshub-backend/drizzle/ /backend/drizzle/ && \
    # Stage native addon runtime files.
    # Only better-sqlite3 and zeromq (plus their JS-level loaders and the
    # cmake-ts prebuilt-loader that zeromq depends on) are needed at runtime.
    # All other production deps are already inlined in server.bundle.mjs.
    #
    # better-sqlite3 runtime deps:
    #   build/Release/   — compiled .node addon
    #   lib/             — JS wrapper that loads the addon via 'bindings'
    #   bindings/        — helper that locates build/Release/
    #   file-uri-to-path/ — transitive dep of bindings
    #
    # zeromq runtime deps:
    #   build/           — prebuilt .node addons (all platforms; pruned below)
    #   lib/             — JS wrapper
    #   cmake-ts/        — prebuilt-addon loader (reads build/manifest.json)
    mkdir -p \
    /addon-deps/better-sqlite3 \
    /addon-deps/zeromq \
    /addon-deps/cmake-ts \
    /addon-deps/bindings \
    /addon-deps/file-uri-to-path && \
    cp -r node_modules/better-sqlite3/build   /addon-deps/better-sqlite3/build && \
    cp -r node_modules/better-sqlite3/lib     /addon-deps/better-sqlite3/lib && \
    cp    node_modules/better-sqlite3/package.json /addon-deps/better-sqlite3/ && \
    cp -r node_modules/zeromq/build           /addon-deps/zeromq/build && \
    cp -r node_modules/zeromq/lib             /addon-deps/zeromq/lib && \
    cp    node_modules/zeromq/package.json    /addon-deps/zeromq/ && \
    cp -r node_modules/cmake-ts/.             /addon-deps/cmake-ts/ && \
    cp -r node_modules/bindings/.             /addon-deps/bindings/ && \
    cp -r node_modules/file-uri-to-path/.     /addon-deps/file-uri-to-path/ && \
    # Prune zeromq prebuilts that will never be used in this Linux container:
    #   win32 and darwin — wrong OS entirely
    #   musl variants    — docker-baseimage:base is Debian/glibc, not Alpine
    #   other CPU arch   — the image is built natively; the wrong arch is dead weight
    #   src/             — C++ source, not needed post-compilation
    rm -rf \
    /addon-deps/zeromq/build/win32 \
    /addon-deps/zeromq/build/darwin \
    /addon-deps/zeromq/src && \
    { find /addon-deps/zeromq/build/linux -type d -name "musl-*" -exec rm -rf {} + 2>/dev/null || true; } && \
    if [ "$(uname -m)" = "x86_64" ]; then \
    rm -rf /addon-deps/zeromq/build/linux/arm64; \
    else \
    rm -rf /addon-deps/zeromq/build/linux/x64; \
    fi && \
    # Prune better-sqlite3 build artifacts:
    #   deps/  — SQLite amalgamation C source (only needed to compile the addon)
    #   src/   — C++ binding source (only needed to compile the addon)
    rm -rf \
    /addon-deps/better-sqlite3/deps \
    /addon-deps/better-sqlite3/src && \
    #   cleanup js map files, those are just for viewing the code
    { find /addon-deps | grep -E ".map$" | xargs rm -rf || true; }

# ============================================================
# Stage 2: Runtime image
# ============================================================
FROM ghcr.io/sdr-enthusiasts/docker-baseimage:base
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG BUILD_NUMBER=0

# Copy the Node.js runtime from the builder.
# node:slim is Debian-based (same ABI family as docker-baseimage:base) so the
# binary and its pre-compiled native add-ons are directly compatible.
#
# We copy only the node binary and the npm module directory - NOT /usr/local/bin/npm.
# In node:slim, /usr/local/bin/npm is a symlink whose target (npm-cli.js) uses
# __dirname to locate ../lib/cli.js. COPY --from dereferences symlinks, so the
# file lands at /usr/local/bin/npm with __dirname=/usr/local/bin and the relative
# require('../lib/cli.js') resolves to /usr/local/lib/cli.js (wrong).
# A shell wrapper that invokes npm-cli.js by absolute path keeps __dirname correct.
# Copy only the node binary — npm is not needed in the runtime image.
COPY --from=acarshub-react-builder /usr/local/bin/node /usr/local/bin/node

# hadolint ignore=DL3008,SC2086
RUN set -x && \
    KEPT_PACKAGES=() && \
    KEPT_PACKAGES+=(nginx-light) && \
    KEPT_PACKAGES+=(libnginx-mod-http-brotli-filter) && \
    KEPT_PACKAGES+=(rrdtool) && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    "${KEPT_PACKAGES[@]}" \
    && \
    apt-get clean -q -y && \
    rm -rf /tmp/* /var/lib/apt/lists/* /var/cache/* && \
    # Runtime directories expected by s6 services and the Node backend
    mkdir -p /run/acars /webapp/data/ /backend

# Package manifests are needed at runtime for version reporting (config.ts reads
# package.json files via process.cwd() to determine the container/backend/frontend
# version strings).  The lockfile and workspace source files are not needed.
WORKDIR /backend
COPY package.json ./
COPY acarshub-backend/package.json ./acarshub-backend/
COPY acarshub-types/package.json   ./acarshub-types/
COPY acarshub-react/package.json   ./acarshub-react/

# Copy the esbuild bundle and its native addon runtime dependencies.
#
# The bundle (server.bundle.mjs) contains all pure-JS production dependencies
# inlined — fastify, socket.io, drizzle-orm, pino, pino-pretty, zod,
# @airframes/acars-decoder, etc.  Only the two native addons (better-sqlite3
# and zeromq) remain as external packages that Node.js must resolve from disk.
#
# The native addon runtime files were staged and pruned in the builder:
#   - cross-platform zeromq prebuilts removed (win32, darwin, musl, other arch)
#   - better-sqlite3 build artifacts removed (deps/, src/)
#
# This replaces the entire "apt-get install compilers → npm ci → apt-get purge"
# block from the old approach — no compilers are needed in the runtime stage
# because the native addons were already compiled in the builder stage, which
# already has all build tools present for the tsc/vite/esbuild steps.
COPY --from=acarshub-react-builder /backend/server.bundle.mjs ./server.bundle.mjs
COPY --from=acarshub-react-builder /addon-deps/better-sqlite3  ./node_modules/better-sqlite3
COPY --from=acarshub-react-builder /addon-deps/zeromq          ./node_modules/zeromq
COPY --from=acarshub-react-builder /addon-deps/cmake-ts        ./node_modules/cmake-ts
COPY --from=acarshub-react-builder /addon-deps/bindings        ./node_modules/bindings
COPY --from=acarshub-react-builder /addon-deps/file-uri-to-path ./node_modules/file-uri-to-path

# React SPA served by nginx
COPY --from=acarshub-react-builder /webapp/dist/ /webapp/dist/

# Pre-compress text assets so nginx can serve them via gzip_static without
# runtime compression cost.  The originals are kept alongside the .gz files
# so nginx can still serve uncompressed versions to clients that don't send
# Accept-Encoding: gzip.  Targets JS, CSS, and GeoJSON (the two large overlay
# files – TRACONBoundaries and FIRBoundaries – compress ~80% as JSON text).
RUN find /webapp/dist/assets \
    \( -name "*.js" -o -name "*.css" -o -name "*.geojson" \) \
    -exec gzip -9 --keep {} \;

# Drizzle SQL migration files — read from disk by the migrator at startup
COPY --from=acarshub-react-builder /backend/drizzle/ /backend/drizzle/

COPY rootfs/ /

RUN set -x && \
    # Read the container version directly from the workspace root package.json.
    # This is the single source of truth — no ARG VERSION injection from CI.
    ACARS_VERSION=$(node -p "JSON.parse(require('fs').readFileSync('/backend/package.json','utf8')).version") && \
    ACARS_BUILD="${BUILD_NUMBER}" && \
    echo "ACARS Hub (Node.js): v${ACARS_VERSION} Build ${ACARS_BUILD}" && \
    # Standard version files used by base-image infrastructure
    printf "v%sBuild%s" "$ACARS_VERSION" "$ACARS_BUILD" > /acarshub_version && \
    printf "v%s Build %s\nv%sBuild%s" \
    "$ACARS_VERSION" "$ACARS_BUILD" \
    "$ACARS_VERSION" "$ACARS_BUILD" > /version && \
    # Ensure all s6 scripts and the healthcheck are executable
    find /etc/s6-overlay/scripts -name "*.sh" -exec chmod +x {} \; && \
    chmod +x /scripts/healthcheck.sh

EXPOSE 80
# Default UDP listen ports for each decoder type (informational; Docker does
# not require EXPOSE for UDP to work, but this documents the defaults).
EXPOSE 5550/udp
EXPOSE 5555/udp
EXPOSE 5556/udp
EXPOSE 5557/udp
EXPOSE 5558/udp

ENV ENABLE_ACARS="false" \
    ENABLE_VDLM="false" \
    ENABLE_ADSB="false" \
    MIN_LOG_LEVEL=3 \
    DB_SAVEALL="true" \
    ENABLE_RANGE_RINGS="true" \
    ADSB_URL="http://tar1090/data/aircraft.json" \
    PORT=8888 \
    ACARSHUB_DB="/run/acars/messages.db" \
    GROUND_STATION_PATH="/webapp/data/ground-stations.json" \
    MESSAGE_LABELS_PATH="/webapp/data/metadata.json" \
    AIRLINES_PATH="/webapp/data/airlines.json" \
    ACARS_CONNECTIONS="udp" \
    VDLM_CONNECTIONS="udp" \
    HFDL_CONNECTIONS="udp" \
    IMSL_CONNECTIONS="udp" \
    IRDM_CONNECTIONS="udp"

HEALTHCHECK --start-period=3600s --interval=600s CMD /scripts/healthcheck.sh
