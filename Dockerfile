# From https://github.com/sdr-enthusiasts/docker-baseimage/blob/bace2830cbb6d6de4bfe05a3116bc74cf5fea658/Dockerfile.base
FROM debian:bookworm-20230814-slim AS sdr-enthusiasts-baseimage

ENV S6_BEHAVIOUR_IF_STAGE2_FAILS=2 \
  S6OVERLAY_VERSION="v3.1.5.0" \
  # Fix for any issues with the S6 overlay. We have quite a few legacy services
  # that worked fine under v2, but v3 is more strict and will kill a startup process
  # if it takes more than 5 seconds. tar1090 and rtlsdrairband are the hardest hit
  # but we may have others.
  S6_CMD_WAIT_FOR_SERVICES_MAXTIME="0"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# hadolint ignore=DL3008,SC2086
RUN set -x && \
  TEMP_PACKAGES=() && \
  KEPT_PACKAGES=() && \
  # packages needed to install
  TEMP_PACKAGES+=(git) && \
  # logging
  KEPT_PACKAGES+=(gawk) && \
  KEPT_PACKAGES+=(pv) && \
  # required for S6 overlay
  # curl kept for healthcheck
  TEMP_PACKAGES+=(file) && \
  KEPT_PACKAGES+=(curl) && \
  TEMP_PACKAGES+=(xz-utils) && \
  KEPT_PACKAGES+=(ca-certificates) && \
  # bc for scripts and healthchecks
  KEPT_PACKAGES+=(bc) && \
  # packages for network stuff
  KEPT_PACKAGES+=(socat) && \
  KEPT_PACKAGES+=(ncat) && \
  KEPT_PACKAGES+=(net-tools) && \
  KEPT_PACKAGES+=(wget) && \
  # process management
  KEPT_PACKAGES+=(procps) && \
  # needed to compile s6wrap:
  TEMP_PACKAGES+=(gcc) && \
  TEMP_PACKAGES+=(build-essential) && \
  # install packages
  ## Builder fixes...
  mkdir -p /usr/sbin/ && \
  ln -s /usr/bin/dpkg-split /usr/sbin/dpkg-split && \
  ln -s /usr/bin/dpkg-deb /usr/sbin/dpkg-deb && \
  ln -s /bin/tar /usr/sbin/tar && \
  apt-get update && \
  apt-get install -y --no-install-recommends \
  "${KEPT_PACKAGES[@]}" \
  "${TEMP_PACKAGES[@]}" \
  && \
  # install S6 Overlay
  curl --location --output /tmp/deploy-s6-overlay.sh https://raw.githubusercontent.com/mikenye/deploy-s6-overlay/master/deploy-s6-overlay-v3.sh && \
  sh /tmp/deploy-s6-overlay.sh && \
  rm -f /tmp/deploy-s6-overlay.sh && \
  # deploy healthchecks framework
  git clone \
  --depth=1 \
  https://github.com/mikenye/docker-healthchecks-framework.git \
  /opt/healthchecks-framework \
  && \
  rm -rf \
  /opt/healthchecks-framework/.git* \
  /opt/healthchecks-framework/*.md \
  /opt/healthchecks-framework/tests \
  && \
  # fix healthchecks framework pathing
  sed -i 's/S6_SERVICE_PATH="\/run\/s6\/services"/S6_SERVICE_PATH="\/run\/s6\/legacy-services"/g' /opt/healthchecks-framework/checks/check_s6_service_abnormal_death_tally.sh && \
  # Add s6wrap
  pushd /tmp && \
  git clone --depth=1 https://github.com/wiedehopf/s6wrap.git && \
  cd s6wrap && \
  make && \
  mv s6wrap /usr/local/bin && \
  popd && \
  # Add additional stuff
  mkdir -p /scripts /etc/cont-init.d && \
  curl -sSL https://raw.githubusercontent.com/sdr-enthusiasts/Buster-Docker-Fixes/main/install_libseccomp2.sh | bash && \
  chmod +x /etc/s6-overlay/s6-rc.d/libseccomp2/up && \
  chmod +x /etc/s6-overlay/scripts/libseccomp2_check.sh && \
  curl -sSL https://raw.githubusercontent.com/sdr-enthusiasts/docker-baseimage/main/scripts/common -o /scripts/common && \
  # Clean up
  apt-get remove -y "${TEMP_PACKAGES[@]}" && \
  apt-get autoremove -y && \
  rm -rf /src/* /tmp/* /var/lib/apt/lists/*

ENTRYPOINT [ "/init" ]


FROM node:slim AS acarshub-typescript-builder
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
    npm run build && \
    cp -r ./dist/static/images /webapp/static/ && \
    cp -r ./dist/static/sounds /webapp/static/ && \
    cp -r ./dist/static/js /webapp/static/ && \
    mv ./dist/static/index.html /webapp/templates/

FROM sdr-enthusiasts-baseimage
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
    KEPT_PACKAGES+=(python3) && \
    KEPT_PACKAGES+=(python3-pip) && \
    KEPT_PACKAGES+=(python3-setuptools) && \
    KEPT_PACKAGES+=(python3-wheel) && \
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
    curl -O https://raw.githubusercontent.com/airframesio/data/master/json/vdl/ground-stations.json&& \
    curl -O https://raw.githubusercontent.com/airframesio/data/master/json/acars/metadata.json && \
    # Clean up
    rm -rf /src/* /tmp/* /var/lib/apt/lists/*

COPY rootfs/ /
COPY version-nextgen /acarshub-version

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

ARG BUILD_EXTRA="Build git"
# append BUILD_EXTRA to the only line in /acarshub-version
RUN set -x && \
    echo "$(cat /acarshub-version) ${BUILD_EXTRA}" > /acarshub-version
