FROM node:22.6.0-slim AS acarshub-typescript-builder
# pushd/popd
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV DOCKER_BUILD="true"

#hadolint ignore=DL3008
RUN set -xe && \
    apt-get update && \
    apt-get install -y --no-install-recommends make python3 g++ && \
    rm -rf /src/* /tmp/* /var/lib/apt/lists/*

COPY acarshub-typescript/package.json /acarshub-typescript/package.json
COPY acarshub-typescript/package-lock.json /acarshub-typescript/package-lock.json

RUN set -xe && \
    pushd /acarshub-typescript && \
    npm install

COPY acarshub-typescript/ /acarshub-typescript/

RUN set -xe && \
    pushd /acarshub-typescript && \
    mkdir -p /webapp/static/images && \
    mkdir -p /webapp/static/js && \
    mkdir -p /webapp/static/sounds && \
    mkdir -p /webapp/templates && \
    # patch acarshub version && \
    npm run build && \
    cp -r ./dist/static/images /webapp/static/ && \
    cp -r ./dist/static/sounds /webapp/static/ && \
    cp -r ./dist/static/js /webapp/static/ && \
    mv ./dist/static/index.html /webapp/templates/

FROM ghcr.io/sdr-enthusiasts/docker-baseimage:python
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

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
    KEPT_PACKAGES+=(python3-cryptography) && \
    # stats
    KEPT_PACKAGES+=(rrdtool) && \
    TEMP_PACKAGES+=(librrd-dev) && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    "${KEPT_PACKAGES[@]}" \
    "${TEMP_PACKAGES[@]}"\
    && \
    pushd /src/ && \
    python3 -m pip install --no-cache-dir --break-system-packages \
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
    apt-get remove -y "${TEMP_PACKAGES[@]}" && \
    apt-get autoremove -y && \
    rm -rf /src/* /tmp/* /var/lib/apt/lists/* && \
    rm -rf /root/.cargo

COPY --from=acarshub-typescript-builder /webapp/static/ /webapp/static/
COPY --from=acarshub-typescript-builder /webapp/templates/ /webapp/templates/

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
    # find the latest version of acarshub from /webapp/static/js/acarshub.*.js
    # it is in the format ACARS Hub: v0.0.0 Build 0000
    # and we want to extract the version number and echo it out to /acarshub_version
    # get the acarshub version from the js file along with the build number
    ACARS_VERSION=$(grep -oP 'ACARS Hub: v\K[0-9\.]+' /webapp/static/js/acarshub.*.js) || $(echo "") && \
    ACARS_BUILD=$(grep -oP 'ACARS Hub: v\K[0-9\.]+ Build \K[0-9]+' /webapp/static/js/acarshub.*.js) || $(echo "") && \
    echo "ACARS Hub: v${ACARS_VERSION} Build ${ACARS_BUILD}" && \
    # echo the version and build number to /acarshub_version
    # check and see if we have a build number and version. If not, set it to 0
    # This will be for local non-github versions
    if [ -z "${ACARS_VERSION}" ]; then ACARS_VERSION="0.0.0"; fi && \
    if [ -z "${ACARS_BUILD}" ]; then ACARS_BUILD="0"; fi && \
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
    ADSB_URL="http://tar1090/data/aircraft.json"


# Add healthcheck
HEALTHCHECK --start-period=3600s --interval=600s CMD /scripts/healthcheck.sh
