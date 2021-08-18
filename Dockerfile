FROM debian:stable-20210816-slim

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
COPY rootfs/ /

# Copy in acars-decoder-typescript from previous build stage
# hadolint ignore=DL3010
COPY acars-decoder-typescript.tgz /src/acars-decoder-typescript.tgz
# hadolint ignore=DL3010
COPY webapp.tar.gz /src/webapp.tar.gz
COPY rootfs/scripts /scripts
# hadolint ignore=DL3008,SC2086
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
    KEPT_PACKAGES+=(pv) && \
    # required for S6 overlay
    # curl kept for healthcheck
    # ca-certificates kept for python
    TEMP_PACKAGES+=(gnupg2) && \
    TEMP_PACKAGES+=(file) && \
    KEPT_PACKAGES+=(curl) && \
    KEPT_PACKAGES+=(ca-certificates) && \
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
    # packages for network stuff
    KEPT_PACKAGES+=(socat) && \
    KEPT_PACKAGES+=(ncat) && \
    KEPT_PACKAGES+=(net-tools) && \
    # Packages for nginx
    KEPT_PACKAGES+=(nginx-light) && \
    # packages for python
    # commented out are for building manually
    # TEMP_PACKAGES+=(libssl-dev) && \
    # TEMP_PACKAGES+=(libbz2-dev) && \
    # TEMP_PACKAGES+=(libreadline-dev) && \
    # KEPT_PACKAGES+=(llvm) && \
    # TEMP_PACKAGES+=(libncurses5-dev) && \
    # TEMP_PACKAGES+=(libncursesw5-dev) && \
    # KEPT_PACKAGES+=(xz-utils ) && \
    # KEPT_PACKAGES+=(tk-dev) && \
    # TEMP_PACKAGES+=(libffi-dev) && \
    KEPT_PACKAGES+=(python3) && \
    KEPT_PACKAGES+=(python3-pip) && \
    KEPT_PACKAGES+=(python3-setuptools) && \
    KEPT_PACKAGES+=(python3-wheel) && \
    # KEPT_PACKAGES+=(gunicorn3) && \
    TEMP_PACKAGES+=(python3-dev) && \
    # process management
    KEPT_PACKAGES+=(procps) && \
    # stats
    KEPT_PACKAGES+=(rrdtool) && \
    TEMP_PACKAGES+=(librrd-dev) && \
    # install packages
    ## Builder fixes...
    mkdir -p /usr/sbin/ && \
    ln -s /usr/bin/dpkg-split /usr/sbin/dpkg-split && \
    ln -s /usr/bin/dpkg-deb /usr/sbin/dpkg-deb && \
    ln -s /bin/tar /usr/sbin/tar && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        "${KEPT_PACKAGES[@]}" \
        "${TEMP_PACKAGES[@]}"\
        && \
    # Make latest python from source
    # pushd /src/ && \
    # wget -q https://www.python.org/ftp/python/3.9.5/Python-3.9.5.tgz && \
    # tar xzf Python-3.9.5.tgz && \
    # cd Python-3.9.5 && \
    # ./configure --enable-optimizations --with-lto --with-computed-gotos --with-system-ffi --enable-shared && \
    # make -j "$(nproc)" && \
    # make install && \
    # ldconfig /usr/local/lib  && \
    # dependencies for web interface
    python3 -m pip install --no-cache-dir \
        -r /webapp/requirements.txt \
        && \
    # Fix for Eventlet issues
    apt-get \
      -o Dpkg::Options::='--force-confmiss' \
      install --reinstall --no-install-recommends -y \
      netbase \
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
    #git clone https://github.com/fredclausen/acarsdec.git /src/acarsdec && \
    git clone --single-branch --branch testing https://github.com/airframesio/acarsdec.git /src/acarsdec && \
    pushd /src/acarsdec && \
    #git checkout master && \
    git checkout testing && \
    mkdir build && \
    pushd build && \
    cmake ../ -Drtl=ON && \
    make && \
    make install && \
    popd && popd && \
    # vdlm2dec
    git clone https://github.com/fredclausen/vdlm2dec.git /src/vdlm2dec && \
    pushd /src/vdlm2dec && \
    git checkout master && \
    mkdir build && \
    pushd build && \
    cmake ../ -Drtl=ON && \
    make && \
    make install && \
    popd && popd && \
    # directory for logging
    mkdir -p /run/acars && \
    # extract webapp
    tar -xzvf /src/webapp.tar.gz -C / && \
    # extract airframes-acars-decoder package to /webapp/static/airframes-acars-decoder
    mkdir -p /src/airframes-acars-decoder && \
    tar xvf /src/acars-decoder-typescript.tgz -C /src/airframes-acars-decoder && \
    mkdir -p /webapp/static/airframes-acars-decoder && \
    # delete the source files and testing artifacts
    rm -rf /src/airframes-acars-decoder/package/dist/bin && \
    find /src/airframes-acars-decoder/package/dist -type f -iname "*.ts" -delete && \
    python3 /scripts/rename_acars_decoder_imports.py && \
    rm /scripts/rename_acars_decoder_imports.py && \
    mv -v /src/airframes-acars-decoder/package/dist/* /webapp/static/airframes-acars-decoder/ && \
    # fix the import for Message Decoder
    export INDEX_PATH=$(ls /webapp/static/js/index*.js) && \
    export OLD_MD5=$(md5sum $INDEX_PATH | awk -F' ' '{print $1}') && \
    echo $(basename /webapp/static/airframes-acars-decoder/MessageDecoder*.js) | xargs -I '{}' sed -i "s/MessageDecoder.js/$(echo {})/g" $INDEX_PATH && \
    export NEW_MD5=$(md5sum $INDEX_PATH | awk -F' ' '{print $1}') && \
    mv $INDEX_PATH $(echo $INDEX_PATH | sed -e "s/$OLD_MD5/$NEW_MD5/g") && \
    sed -i "s/$(echo $OLD_MD5)/$(echo $NEW_MD5)/g" /webapp/templates/index.html && \
    # grab the ground stations and other data from airframes
    mkdir -p /webapp/data/ && \
    curl https://raw.githubusercontent.com/airframesio/data/master/json/vdl/ground-stations.json > /webapp/data/ground-stations.json && \
    curl https://raw.githubusercontent.com/airframesio/data/master/json/acars/metadata.json > /webapp/data/acars-metadata.json && \
    # install S6 Overlay
    curl -s https://raw.githubusercontent.com/mikenye/deploy-s6-overlay/master/deploy-s6-overlay.sh | sh && \
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
    # Clean up
    apt-get remove -y "${TEMP_PACKAGES[@]}" && \
    apt-get autoremove -y && \
    rm -rf /src/* /tmp/* /var/lib/apt/lists/*

ENTRYPOINT [ "/init" ]

EXPOSE 80

# Add healthcheck
HEALTHCHECK --start-period=3600s --interval=600s CMD /scripts/healthcheck.sh
