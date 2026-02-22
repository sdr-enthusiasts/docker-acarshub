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
# Stage 2: Prune devDependencies from the workspace
#
# Inheriting the full build context lets npm prune reuse the
# already-compiled native add-ons (better-sqlite3) so we never
# have to rebuild them from source in a second install pass.
# ============================================================
FROM acarshub-react-builder AS acarshub-backend-prod

RUN set -xe && \
    npm prune --omit=dev && \
    # After removing devDeps, @playwright/test and its transitive dep chain
    # (chromium-bidi -> zod@3) are gone. npm prune removes the files but does
    # not restructure the remaining packages, so zod@4 is still stranded in
    # acarshub-backend/node_modules/zod rather than hoisted to the workspace
    # root. npm dedupe sees only one zod consumer left and hoists zod@4 to
    # node_modules/zod, removing the backend-local copy.
    npm dedupe && \
    # The @acarshub/types workspace entry is a symlink whose target
    # (../../acarshub-types) will not exist in the final image.
    # All backend imports from @acarshub/types are "import type" and
    # are erased by tsc, so the module is never loaded at runtime.
    rm -rf ./node_modules/@acarshub/types

# ============================================================
# Stage 3: Runtime image
# ============================================================
FROM ghcr.io/sdr-enthusiasts/docker-baseimage:base
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG VERSION=0.0.0
ARG BUILD_NUMBER=0

# Copy the Node.js binary from the builder.
# node:slim is Debian-based (same ABI family as docker-baseimage:base) so the
# binary and its pre-compiled native add-ons are directly compatible.
COPY --from=acarshub-react-builder /usr/local/bin/node /usr/local/bin/node

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

# React SPA served by nginx
COPY --from=acarshub-react-builder /webapp/dist/ /webapp/dist/

# Node.js backend: compiled JS, Drizzle SQL migrations, production node_modules
COPY --from=acarshub-react-builder /backend/dist/     /backend/dist/
COPY --from=acarshub-react-builder /backend/drizzle/  /backend/drizzle/
# Workspace root node_modules contain all hoisted production deps (including
# the compiled better-sqlite3 native add-on).
COPY --from=acarshub-backend-prod /workspace/node_modules/ /backend/node_modules/

COPY rootfs/      /

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
