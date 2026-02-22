# ============================================================
# Stage 1: Build React frontend + Node.js backend
# ============================================================
FROM node:25.6.1-slim@sha256:32f45869cf02c26971de72c383d5f99cab002905ed8b515b56df925007941782 AS acarshub-react-builder
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

WORKDIR /workspace

# Accept version and build number as build args
ARG VERSION=0.0.0
ARG BUILD_NUMBER=0

# hadolint ignore=DL3008
RUN set -xe && \
    apt-get update && \
    apt-get install -y --no-install-recommends make python3 g++ && \
    rm -rf /tmp/* /var/lib/apt/lists/*

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY acarshub-react/ ./acarshub-react/
COPY acarshub-backend/ ./acarshub-backend/
COPY acarshub-types/ ./acarshub-types/

# Install all workspace dependencies (devDeps required for tsc/vite build tools)
RUN set -xe && \
    npm ci --include=dev

# Re-declare ARGs after FROM so they are in scope for the RUN
ARG VERSION=0.0.0
ARG BUILD_NUMBER=0

RUN set -xe && \
    export VITE_DOCKER_BUILD="true" && \
    export VITE_VERSION="${VERSION}" && \
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

ARG VERSION=0.0.0
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
    apt-get install -y --no-install-recommends make python3 g++ && \
    npm ci --omit=dev && \
    npm dedupe && \
    rm -rf node_modules/@acarshub && \
    apt-get purge -y make python3 g++ && \
    apt-get autoremove -y && \
    apt-get clean -q -y && \
    rm -rf /tmp/* /var/lib/apt/lists/* /var/cache/*

# React SPA served by nginx
COPY --from=acarshub-react-builder /webapp/dist/ /webapp/dist/

# Node.js backend: compiled JS + Drizzle SQL migrations
# (node_modules are already installed above via npm ci)
COPY --from=acarshub-react-builder /backend/dist/    /backend/dist/
COPY --from=acarshub-react-builder /backend/drizzle/ /backend/drizzle/

COPY rootfs/ /

RUN set -x && \
    ACARS_VERSION="${VERSION}" && \
    ACARS_BUILD="${BUILD_NUMBER}" && \
    echo "ACARS Hub (Node.js): v${ACARS_VERSION} Build ${ACARS_BUILD}" && \
    # Standard version files (read by Python tooling and display scripts)
    printf "v%sBuild%s" "$ACARS_VERSION" "$ACARS_BUILD" > /acarshub_version && \
    printf "v%s Build %s\nv%sBuild%s" \
    "$ACARS_VERSION" "$ACARS_BUILD" \
    "$ACARS_VERSION" "$ACARS_BUILD" > /version && \
    # Node backend reads "./version" relative to its working directory (/backend).
    # Write just the semver string so config.ts gets a clean value.
    printf "%s" "$ACARS_VERSION" > /backend/version && \
    # Ensure all s6 scripts and the healthcheck are executable
    find /etc/s6-overlay/scripts -name "*.sh" -exec chmod +x {} \; && \
    chmod +x /scripts/healthcheck.sh

EXPOSE 80
EXPOSE 5550
EXPOSE 5555
EXPOSE 15550
EXPOSE 15555

ENV FEED="" \
    ENABLE_ACARS="false" \
    ENABLE_VDLM="false" \
    ENABLE_ADSB="false" \
    ENABLE_WEB="true" \
    MIN_LOG_LEVEL=3 \
    QUIET_MESSAGES="true" \
    DB_SAVEALL="true" \
    ENABLE_RANGE_RINGS="true" \
    ADSB_URL="http://tar1090/data/aircraft.json" \
    DB_FTS_OPTIMIZE="off" \
    PORT=8888 \
    ACARSHUB_DB="/run/acars/messages.db" \
    GROUND_STATION_PATH="/webapp/data/ground-stations.json" \
    MESSAGE_LABELS_PATH="/webapp/data/metadata.json" \
    AIRLINES_PATH="/webapp/data/airlines.json"

HEALTHCHECK --start-period=3600s --interval=600s CMD /scripts/healthcheck.sh
