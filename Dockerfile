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
RUN set -xe && \
    npm ci --include=dev

# Re-declare ARG after FROM so it is in scope for the RUN
ARG BUILD_NUMBER=0

RUN set -xe && \
    export VITE_BUILD_NUMBER="${BUILD_NUMBER}" && \
    npm run build && \
    # Stage React SPA output
    mkdir -p /webapp/dist && \
    cp -r ./acarshub-react/dist/* /webapp/dist/ && \
    # Stage compiled Node.js backend
    mkdir -p /backend/dist && \
    cp -r ./acarshub-backend/dist/* /backend/dist/ && \
    # Stage Drizzle SQL migration files (needed by migration01_initialSchema at runtime)
    cp -r ./acarshub-backend/drizzle/ /backend/drizzle/

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
COPY --from=acarshub-react-builder /usr/local/bin/node /usr/local/bin/node
COPY --from=acarshub-react-builder /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN printf '#!/bin/sh\nexec /usr/local/bin/node /usr/local/lib/node_modules/npm/bin/npm-cli.js "$@"\n' \
    > /usr/local/bin/npm && chmod +x /usr/local/bin/npm

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

# Copy only the package manifests needed for npm to resolve the workspace graph
# from the lockfile. No source files are needed - npm ci only reads package.json
# files to set up workspace symlinks and then follows the lockfile for resolution.
WORKDIR /backend
COPY package.json package-lock.json ./
COPY acarshub-backend/package.json ./acarshub-backend/
COPY acarshub-types/package.json   ./acarshub-types/
COPY acarshub-react/package.json   ./acarshub-react/

# Install production-only dependencies directly in /backend.
#
# Why build tools are installed and removed in the same layer:
#   better-sqlite3 is a native addon that must compile against the Node ABI.
#   Installing and purging make/python3/g++ in one RUN keeps them out of the
#   final image layer while still allowing the addon to compile.
#
# Why we remove node_modules/@acarshub/:
#   npm workspaces creates symlinks for every workspace package regardless of
#   whether it is an actual runtime dependency. All @acarshub/* imports in the
#   backend are "import type" declarations erased by tsc, so none of these
#   symlinks are needed at runtime. Removing them prevents broken-symlink noise.
#
# The --mount=type=cache on /root/.npm avoids re-downloading tarballs on
# subsequent builds when the package-lock.json has not changed.
#
# hadolint ignore=DL3008
RUN --mount=type=cache,target=/root/.npm \
    set -xe && \
    apt-get update && \
    TEMP_PACKAGES=(make python3 g++ cmake) && \
    apt-get install -y --no-install-recommends ${TEMP_PACKAGES[@]} && \
    npm ci --omit=dev && \
    npm dedupe && \
    npm prune --production && \
    rm -rf node_modules/@acarshub && \
    apt-get autoremove -q -o APT::Autoremove::RecommendsImportant=0 -o APT::Autoremove::SuggestsImportant=0 -y ${TEMP_PACKAGES[@]} && \
    apt-get clean -q -y && \
    rm -rf /tmp/* /var/lib/apt/lists/* /var/cache/* && \
    # ----------------------------------------------------------------
    # Surgical node_modules cleanup (~35 MB)
    # ----------------------------------------------------------------
    # better-sqlite3: remove SQLite amalgamation source and C++ bindings
    # that are only needed to compile the native addon. The compiled
    # .node file in build/Release/ is all that is needed at runtime.
    rm -rf \
    node_modules/better-sqlite3/deps \
    node_modules/better-sqlite3/src && \
    # zeromq: remove prebuilts for other OSes (win32, darwin) and the
    # C++ source tree – these are never loaded on Linux.
    # Also remove the musl (Alpine) variant; docker-baseimage:base is
    # Debian/glibc so only the glibc prebuilt is used at runtime.
    # The cmake-ts loader selects the prebuilt by os+arch+libc at
    # startup, so we can safely delete incompatible candidates.
    rm -rf \
    node_modules/zeromq/build/win32 \
    node_modules/zeromq/build/darwin \
    node_modules/zeromq/src && \
    find node_modules/zeromq/build/linux -type d -name "musl-*" -exec rm -rf {} + 2>/dev/null || true && \
    # zeromq multi-arch: remove the prebuilt for the architecture we are
    # NOT running on (the image is built natively for each target arch).
    if [ "$(uname -m)" = "x86_64" ]; then \
    rm -rf node_modules/zeromq/build/linux/arm64; \
    else \
    rm -rf node_modules/zeromq/build/linux/x64; \
    fi && \
    # drizzle-orm: remove every database dialect except the ones needed
    # at runtime. We use better-sqlite3, sqlite-core, and sql. However,
    # drizzle-orm/sql/sql.js has a hardcoded static import of
    # pg-core/columns/enum.js (used to detect PG enums during SQL
    # serialisation), so pg-core must be kept even though we never
    # import it directly. All other dialect directories are dead weight.
    rm -rf \
    node_modules/drizzle-orm/aws-data-api \
    node_modules/drizzle-orm/bun-sql \
    node_modules/drizzle-orm/bun-sqlite \
    node_modules/drizzle-orm/cache \
    node_modules/drizzle-orm/d1 \
    node_modules/drizzle-orm/durable-sqlite \
    node_modules/drizzle-orm/expo-sqlite \
    node_modules/drizzle-orm/gel \
    node_modules/drizzle-orm/gel-core \
    node_modules/drizzle-orm/kysely \
    node_modules/drizzle-orm/knex \
    node_modules/drizzle-orm/libsql \
    node_modules/drizzle-orm/mysql-core \
    node_modules/drizzle-orm/mysql-proxy \
    node_modules/drizzle-orm/mysql2 \
    node_modules/drizzle-orm/neon \
    node_modules/drizzle-orm/neon-http \
    node_modules/drizzle-orm/neon-serverless \
    node_modules/drizzle-orm/node-postgres \
    node_modules/drizzle-orm/op-sqlite \
    node_modules/drizzle-orm/pg-proxy \
    node_modules/drizzle-orm/pglite \
    node_modules/drizzle-orm/planetscale-serverless \
    node_modules/drizzle-orm/postgres-js \
    node_modules/drizzle-orm/prisma \
    node_modules/drizzle-orm/singlestore \
    node_modules/drizzle-orm/singlestore-core \
    node_modules/drizzle-orm/singlestore-proxy \
    node_modules/drizzle-orm/sql-js \
    node_modules/drizzle-orm/sqlite-proxy \
    node_modules/drizzle-orm/supabase \
    node_modules/drizzle-orm/tidb-serverless \
    node_modules/drizzle-orm/vercel-postgres \
    node_modules/drizzle-orm/xata-http

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

# Node.js backend: compiled JS + Drizzle SQL migrations
# (node_modules are already installed above via npm ci)
COPY --from=acarshub-react-builder /backend/dist/    /backend/dist/
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
