# Setting Up ACARS Hub

## Purpose

This document is designed to show the most common `docker-compose.yaml` setup that requires minimal, if any, modifications.

### Migrating from v2 to v3/NextGen

If you are migrating from `v2` to `v3/NextGen` this would be a fantastic starting place for you to copy/paste values from your old compose file. I also highly suggest backing up your old compose file just in case you need to roll back if there are bugs.

## How to do the setup

Please use the `yaml` file below and save it to your computer with docker installed. You need to modify a few lines to get started:

ACARS Hub:

- If you intend to feed VDLM, change `ENABLE_VDLM=false` to `ENABLE_VDLM=external`
- If you intend to feed ACARS, change `ENABLE_ACARS=false` to `ENABLE_ACARS=external`
- If you have a local `tar1090` instance and want to be able to click on a link in the message to see that plane on it,
  - Remove the `#` from the start of the line
  - After the `=` sign input the URL you use in your browser to visit `tar1090`, ie `http://192.168.1.100`
- If you are in the United States I recommend removing the `#` from the line with `IATA_OVERRIDE`
- If you have a source of `tar1090` ADSB data and want to enable the ADSB visualizations on the ACARS Hub website
  - Remove the `#` from the start of the line with `ENABLE_ADSB`
  - Remove the `#` from the lines `ADSB_LAT`/`ADSB_LON` and set each value appropriately
  - If you are **_NOT_** running `tar1090` on the same Pi as ACARS Hub
    - Remove the `#` from the `ADSB_URL` line and set the value to the **_FULL_** URL to the `aircraft.json` data, ie `http://192.168.1.100/data/aircraft.json`

If you have chosen to decode ACARS Data and have a RTL-SDR device dedicated to it, do the following under `acarsdec`

- Set the serial number to your device after the `=` on the line `SERIAL`
- Alter the frequencies, if need be
- Set your feed ID.

Otherwise, remove the `acarsdec` section

If you have chosen to decode VDLM Data and have a RTL-SDR device dedicated to it, do the following under `dumpvdl2`

- Set the serial number to your device after the `=` on the line `SERIAL`
- Alter the frequencies, if need be. Frequenices need to be 9 digits long and contain no period
- Set your feed ID.

Otherwise, remove the `dumpvdl2` section

### docker-compose.yaml

```yaml
version: "3.8"

volumes:
  acars_data:

services:
  acarshub:
    image: ghcr.io/sdr-enthusiasts/docker-acarshub:latest
    tty: true
    container_name: acarshub
    restart: always
    devices:
      - /dev/bus/usb:/dev/bus/usb
    ports:
      - 8080:80
      - 5550:5550/udp
      - 5555:5555/udp
      - 15550:15550
      - 15555:15555
    volumes:
      - acars_data:/run/acars
    tmpfs:
      - /database:exec,size=64M
      - /run:exec,size=64M
      - /var/log,size=64M
    environment:
      - TZ=Etc/UTC
      - ENABLE_VDLM=false
      - ENABLE_ACARS=false
      - MIN_LOG_LEVEL=3
  #      - TAR1090_URL=http://tar1090
  #      - IATA_OVERRIDE=UP|UPS|United Parcel Service;GS|FTH|Mountain Aviation (Foothills);GS|EJA|ExecJet
  #      - ENABLE_ADSB=true
  #      - ADSB_LAT=
  #      - ADSB_LON=
  #      - ADSB_URL=

  ### Remove this section if you are NOT decoding ACARS
  acarsdec:
    image: ghcr.io/sdr-enthusiasts/docker-acarsdec:latest
    tty: true
    container_name: acarsdec
    restart: always
    devices:
      - /dev/bus/usb:/dev/bus/usb
    environment:
      - QUIET_LOGS=true
      - TZ=Etc/UTC
      - SERIAL=
      - GAIN=-10
      - PPM=0
      - FREQUENCIES=130.025;130.450;131.125;131.550
      - FEED_ID=
      - SERVER=acars_router
    tmpfs:
      - /run:exec,size=64M
      - /var/log,size=64M
  #####

  ### Remove this section if you are NOT decoding VDLM

  dumpvdl2:
    image: ghcr.io/sdr-enthusiasts/docker-dumpvdl2:latest
    tty: true
    container_name: dumpvdl2
    restart: always
    devices:
      - /dev/bus/usb:/dev/bus/usb
    environment:
      - QUIET_LOGS=true
      - TZ=Etc/UTC
      - SERIAL=
      - GAIN=40.0
      - PPM=0
      - FREQUENCIES=136650000;136700000;136975000;136925000;136800000
      - FEED_ID=
      - VDLM_FILTER_ENABLE=true
      - ZMQ_MODE=server
      - ZMQ_ENDPOINT=tcp://0.0.0.0:45555
      - SERVER=
    tmpfs:
      - /run:exec,size=64M
      - /var/log,size=64M

  acars_router:
    image: ghcr.io/sdr-enthusiasts/acars_router:latest
    labels:
      - "autoheal=true"
    tty: true
    ports:
      - 55555:15555
      - 55550:15550
    container_name: acars_router
    restart: always
    environment:
      - TZ=${FEEDER_TZ}
      # The line below should be uncommented if you are receiving acars data from acarsdec AND do not want to feed
      #- AR_SEND_UDP_ACARS=acarshub:5550
      # The line below should be uncommented if you are receiving acars data from acarsdec AND want to feed airframes
      #- AR_SEND_UDP_ACARS=acarshub:5550;feed.airframes.io:5550
      # The line below should uncommented if you are receiving VDLM and DO NOT want to feed aiframes
      #- AR_SEND_UDP_VDLM2=acarshub:5555
      # The line below should uncommented if you are receiving VDLM, using dumpvdl2 AND want to feed airframes
      #- AR_SEND_UDP_VDLM2=acarshub:5555;feed.airframes.io:5552
      # The line below should uncommented if you are receiving VDLM, using vdlm2dec AND want to feed airframes
      #- AR_SEND_UDP_VDLM2=acarshub:5555;feed.airframes.io:5555
      # The line below should uncommented if you are receiving dumpvdl2 AND using ZMQ (recommended)
      #- AR_RECV_ZMQ_VDLM2=dumpvdl2:45555
    tmpfs:
      - /run:exec,size=64M
      - /var/log
#####
```

## Final thoughts

This document is designed to get you up and started. I feel it's likely you will need to make minimal changes to the configuration options provided above; however `ACARS Hub` in particular has a few more options you can add and tweak to your needs. Please see the [Readme](README.md) for more on that.
