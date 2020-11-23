FROM debian:stable-slim

ENV BRANCH_RTLSDR="ed0317e6a58c098874ac58b769cf2e609c18d9a5" \
    S6_BEHAVIOUR_IF_STAGE2_FAILS= \
    FEED="" \
    STATON_ID_ACARS="" \
    STATION_ID_VDLM="" \
    SERIAL_ACARS="" \
    SERIAL_VDLM="" \
    FREQS_ACARS="" \
    FREQS_VDLM="" \
    ENABLE_ACARS="" \
    ENABLE_VDLM="" \
    GAIN="280" \
    VERBOSE="" \
    TRIM_LOGS="true"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN set -x && \
    TEMP_PACKAGES=() && \
    KEPT_PACKAGES=() && \
    # Required for building multiple packages.
    TEMP_PACKAGES+=(build-essential) && \
    TEMP_PACKAGES+=(pkg-config) && \
    TEMP_PACKAGES+=(cmake) && \
    TEMP_PACKAGES+=(git) && \
    TEMP_PACKAGES+=(automake) && \
    TEMP_PACKAGES+=(autoconf) && \
    TEMP_PACKAGES+=(wget) && \
    # logging
    KEPT_PACKAGES+=(gawk) && \
    # required for S6 overlay
    TEMP_PACKAGES+=(gnupg2) && \
    TEMP_PACKAGES+=(file) && \
    TEMP_PACKAGES+=(curl) && \
    TEMP_PACKAGES+=(ca-certificates) && \
    # libusb-1.0-0 + dev - Required for rtl-sdr, libiio (bladeRF/PlutoSDR).
    KEPT_PACKAGES+=(libusb-1.0-0) && \
    TEMP_PACKAGES+=(libusb-1.0-0-dev) && \
    # packages for libacars
    TEMP_PACKAGES+=(zlib1g-dev) && \
    TEMP_PACKAGES+=(libxml2-dev) && \
    KEPT_PACKAGES+=(zlib1g) && \
    KEPT_PACKAGES+=(libxml2) && \
    # packages for acarsserv
    TEMP_PACKAGES+=(libsqlite3-dev) && \
    KEPT_PACKAGES+=(libsqlite3-0) && \
    # packages for lighttpd
    KEPT_PACKAGES+=(lighttpd) && \
    # install packages
    apt-get update && \
    apt-get install -y --no-install-recommends \
        ${KEPT_PACKAGES[@]} \
        ${TEMP_PACKAGES[@]} \
        && \
    # rtl-sdr
    git clone git://git.osmocom.org/rtl-sdr.git /src/rtl-sdr && \
    pushd /src/rtl-sdr && \
    git checkout "${BRANCH_RTLSDR}" && \
    echo "rtl-sdr ${BRANCH_RTLSDR}" >> /VERSIONS && \
    mkdir -p /src/rtl-sdr/build && \
    pushd /src/rtl-sdr/build && \
    cmake ../ -DINSTALL_UDEV_RULES=ON -Wno-dev && \
    make -Wstringop-truncation && \
    make -Wstringop-truncation install && \
    cp -v /src/rtl-sdr/rtl-sdr.rules /etc/udev/rules.d/ && \
    popd && popd && \
    # libacars
    git clone git://github.com/szpajder/libacars.git /src/libacars && \
    pushd /src/libacars && \
    git checkout master && \
    mkdir build && \
    pushd build && \
    cmake ../ && \
    make && \
    make install && \
    popd && popd && \
    # acarsdec
    git clone git://github.com/TLeconte/acarsdec.git /src/acarsdec && \
    pushd /src/acarsdec && \
    git checkout master && \
    mkdir build && \
    pushd build && \
    cmake .. -Drtl=ON && \
    make && \
    make install && \
    popd && popd && \
    # vdlm2dec
    git clone git://github.com/TLeconte/vdlm2dec.git /src/vdlm2dec && \
    pushd /src/vdlm2dec && \
    git checkout master && \
    mkdir build && \
    pushd build && \
    cmake .. -Drtl=ON && \
    make && \
    make install && \
    popd && popd && \
    # directory for logging
    mkdir -p /run/acars && \
    # lighttpd config
    mkdir -p "/var/run/lighttpd" && \
    # lighttpd configuration - mod_compress location + permissions.
    mkdir -p "/var/cache/lighttpd/compress/script/readsb/backend" && \
    mkdir -p "/var/cache/lighttpd/compress/css/bootstrap" && \
    mkdir -p "/var/cache/lighttpd/compress//css/leaflet" && \
    # lighttpd configuration - remove "unconfigured" conf.
    rm -v "/etc/lighttpd/conf-enabled/99-unconfigured.conf" && \
    # lighttpd configuration - change server port (needs to be a high port as this is a rootless container).
    sed -i 's/^server\.port.*/server.port = 8080/g' /etc/lighttpd/lighttpd.conf && \
    # lighttpd configuration - remove errorlog, lighttpd runs in the foreground so errors will show in container log.
    sed -i 's/^server\.errorlog.*//g' /etc/lighttpd/lighttpd.conf && \
    # install S6 Overlay
    curl -s https://raw.githubusercontent.com/mikenye/deploy-s6-overlay/master/deploy-s6-overlay.sh | sh && \
    # Clean up
    apt-get remove -y ${TEMP_PACKAGES[@]} && \
    apt-get autoremove -y && \
    rm -rf /src/* /tmp/* /var/lib/apt/lists/* 

COPY rootfs/ /

ENTRYPOINT [ "/init" ]

EXPOSE 80
