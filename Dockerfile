FROM node:25.5.0-slim@sha256:3393543ad82b7ca5f9329c5115ad801f9e08b4d385f81a616cfb981c32e16c7b AS acarshub-react-builder
# pushd/popd
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Accept version and build number as build args
ARG VERSION=0.0.0
ARG BUILD_NUMBER=0

# Set environment variables for Vite build
ENV DOCKER_BUILD="true"
ENV VITE_DOCKER_BUILD="true"
ENV VITE_VERSION="${VERSION}"
ENV VITE_BUILD_NUMBER="${BUILD_NUMBER}"

#hadolint ignore=DL3008
RUN set -xe && \
    apt-get update && \
    apt-get install -y --no-install-recommends make python3 g++ && \
    rm -rf /src/* /tmp/* /var/lib/apt/lists/*

COPY acarshub-react/package.json /acarshub-react/package.json
COPY acarshub-react/package-lock.json /acarshub-react/package-lock.json

RUN set -xe && \
    pushd /acarshub-react && \
    npm install

COPY acarshub-react/ /acarshub-react/

# Pass build args to environment variables for this stage
ARG VERSION=0.0.0
ARG BUILD_NUMBER=0

RUN set -xe && \
    pushd /acarshub-react && \
    # Set Vite env vars for build
    export VITE_DOCKER_BUILD="true" && \
    export VITE_VERSION="${VERSION}" && \
    export VITE_BUILD_NUMBER="${BUILD_NUMBER}" && \
    npm run build && \
    # Copy entire React build output to /webapp/dist
    mkdir -p /webapp/dist && \
    cp -r ./dist/* /webapp/dist/

FROM ghcr.io/sdr-enthusiasts/docker-baseimage:base
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Accept version and build number as build args
ARG VERSION=0.0.0
ARG BUILD_NUMBER=0

COPY rootfs/webapp/requirements.txt /src/requirements.txt

# hadolint ignore=DL3008,SC2086,DL3042,DL3013,SC1091
RUN set -x && \
    TEMP_PACKAGES=() && \
    KEPT_PACKAGES=() && \
    # Required for building multiple packages.
    TEMP_PACKAGES+=(build-essential) && \
    TEMP_PACKAGES+=(pkg-config) && \
    TEMP_PACKAGES+=(cmake) && \
    TEMP_PACKAGES+=(automake) && \
    TEMP_PACKAGES+=(autoconf) && \
    TEMP_PACKAGES+=(git) && \
    # Packages for nginx+python
    KEPT_PACKAGES+=(nginx-light) && \
    TEMP_PACKAGES+=(python3-dev) && \
    TEMP_PACKAGES+=(python3-pip) && \
    KEPT_PACKAGES+=(python3-cryptography) && \
    TEMP_PACKAGES+=(python3-setuptools) && \
    KEPT_PACKAGES+=(python3-packaging) && \
    # libffi arm build fix
    TEMP_PACKAGES+=(libffi-dev) && \
    KEPT_PACKAGES+=(libffi8) && \
    # stats
    KEPT_PACKAGES+=(rrdtool) && \
    TEMP_PACKAGES+=(librrd-dev) && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    "${KEPT_PACKAGES[@]}" \
    "${TEMP_PACKAGES[@]}"\
    && \
    pushd /src/ && \
    python3 -m pip install --no-cache-dir --break-system-packages --ignore-installed \
    -r /src/requirements.txt \
    && \
    # Fix for Eventlet issues
    apt-get \
    -o Dpkg::Options::='--force-confmiss' \
    install --reinstall --no-install-recommends -y \
    netbase \
    && \
    popd && \
    # Clean up
    # remove pycache
    { find /usr | grep -E "/__pycache__$" | xargs rm -rf || true; } && \
    apt-get autoremove -q -o APT::Autoremove::RecommendsImportant=0 -o APT::Autoremove::SuggestsImportant=0 -y "${TEMP_PACKAGES[@]}" && \
    apt-get clean -q -y && \
    rm -rf /src/* /tmp/* /var/lib/apt/lists/* /var/cache/* && \
    rm -rf /root/.cargo

COPY --from=acarshub-react-builder /webapp/dist/ /webapp/dist/

RUN set -x && \
    mkdir -p /run/acars && \
    # grab the ground stations and other data from airframes
    mkdir -p /webapp/data/ && \
    # Download the airframes Ground Station and ACARS Label data
    pushd /webapp/data/ && \
    curl -O https://raw.githubusercontent.com/airframesio/data/master/json/vdl/ground-stations.json && \
    curl -O https://raw.githubusercontent.com/airframesio/data/master/json/acars/metadata.json && \
    # Clean up
    rm -rf /src/* /tmp/* /var/lib/apt/lists/*

COPY rootfs/ /

RUN set -x && \
    # Use version and build number from build args
    # These are passed from CI or default to 0.0.0/0 for local builds
    ACARS_VERSION="${VERSION}" && \
    ACARS_BUILD="${BUILD_NUMBER}" && \
    echo "ACARS Hub: v${ACARS_VERSION} Build ${ACARS_BUILD}" && \
    # Write version files for runtime display
    printf "v%sBuild%s" "$ACARS_VERSION" "$ACARS_BUILD" > /acarshub_version && \
    printf "v%s Build %s\nv%sBuild%s" "$ACARS_VERSION" "$ACARS_BUILD" "$ACARS_VERSION" "$ACARS_BUILD" > /version

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
    DB_FTS_OPTIMIZE="off"


# Add healthcheck
HEALTHCHECK --start-period=3600s --interval=600s CMD /scripts/healthcheck.sh
