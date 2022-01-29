# hadolint ignore=DL3007
FROM ghcr.io/fredclausen/acarshub-baseimage:nextgen

ENV FEED="" \
    ENABLE_ACARS="" \
    ENABLE_VDLM="" \
    ENABLE_WEB="true" \
    QUIET_LOGS="" \
    QUIET_MESSAGES="true" \
    DB_SAVEALL="true" \
    ENABLE_RANGE_RINGS="true" \
    ADSB_URL="http://tar1090/data/aircraft.json"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Copy needs to be prior to any curl/wget so SSL certs from GitHub runner are loaded
# Using the ADD commands makes it so we don't have to untar the archive in the RUN step
COPY rootfs/ /
ADD webapp.tar.gz /

RUN set -x && \
    mkdir -p /run/acars && \
    # grab the ground stations and other data from airframes
    mkdir -p /webapp/data/ && \
    # Download the airframes Ground Station and ACARS Label data
    pushd /webapp/data/ && \
    curl -O https://raw.githubusercontent.com/airframesio/data/master/json/vdl/ground-stations.json&& \
    curl -O https://raw.githubusercontent.com/airframesio/data/master/json/acars/metadata.json && \
    # Clean up
    rm -rf /src/* /tmp/* /var/lib/apt/lists/*

EXPOSE 80

# Add healthcheck
HEALTHCHECK --start-period=3600s --interval=600s CMD /scripts/healthcheck.sh
