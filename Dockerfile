# hadolint ignore=DL3007
FROM fredclausen/acarshub-baseimage:latest

ENV BRANCH_RTLSDR="ed0317e6a58c098874ac58b769cf2e609c18d9a5" \
    S6_BEHAVIOUR_IF_STAGE2_FAILS=2 \
    FEED="" \
    STATION_ID_ACARS="" \
    STATION_ID_VDLM="" \
    SERIAL_ACARS="" \
    SERIAL_VDLM="" \
    FREQS_ACARS="" \
    FREQS_VDLM="" \
    ENABLE_ACARS="" \
    ENABLE_VDLM="" \
    GAIN_ACARS="-10" \
    GAIN_VDLM="280" \
    ENABLE_WEB="true" \
    QUIET_LOGS="" \
    DB_SAVEALL="true" \
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

ENTRYPOINT [ "/init" ]

EXPOSE 80

# Add healthcheck
HEALTHCHECK --start-period=3600s --interval=600s CMD /scripts/healthcheck.sh
