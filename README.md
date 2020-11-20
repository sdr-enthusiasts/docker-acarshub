# docker-acarshub

Docker container to view and also stream ACARS messages to [ACARS.io](http://acars.io). Uses [libacars](https://github.com/szpajder/libacars), [arcarsdec](https://github.com/TLeconte/acarsdec) and [vdlm2dec](https://github.com/TLeconte/vdlm2dec). Builds and runs on `arm64`. A container is provided for, but not tested, `amd64` and `arm32v7` (see below).

## Supported tags and respective Dockerfiles

* `latest` (`master` branch, `Dockerfile`)
* Version and architecture specific tags available

## Multi Architecture Support

Currently, this image should pull and run on the following architectures:

* `amd64`: Linux x86-64 (Builds, untested. If it works for you let me know!)
* `arm32v7`: ARMv7 32-bit (Odroid HC1/HC2/XU4, RPi 2/3) (Builds, untested. If it works for you let me know!)
* `arm64`: ARMv8 64-bit (RPi 4 64-bit OSes)

## Thanks

Thanks to [mikenye](https://github.com/mikenye) for his excellent ADSB docker containers from which I shamelessly copied a lot of the ideas for setting up the docker container, as well as his excellent advice and help in getting this thing working.

## Required hardware

You will need an RTLSDR dongle, and if you want to feed both VDLM2 and ACARS you will need two dongles with unique serial numbers. 

## Up-and-Running with `docker run`

```shell
docker run \
 -d \
 --rm \
 --name acarshub \
 -e STATION_ID_ACARS="YOURIDHERE" \
 -e FREQS_ACARS="130.025 130.450 131.125 131.550"
 -e ENABLE_ACARS="true"
 --device /dev/bus/usb:/dev/bus/usb \
fredclausen/acarshub
```

You should obviously replace `STATION_ID_ACARS` with a unique ID for your station.

## Up-and-Running with Docker Compose

```yaml
version: '2.0'

services:
  acarshub:
    image: fredclausen/acarshub
    tty: true
    container_name: acarshub
    restart: always
    devices:
      - /dev/bus/usb:/dev/bus/usb
    environment:
      - STATION_ID_ACARS="YOURIDHERE"
      - FREQS_ACARS="130.025 130.450 131.125 131.550"
      - ENABLE_ACARS="true"
```

## Ports

No ports are exposed in this container.

## Volumes

No volumes are needed to run the container.

## Environment variables

There are quite a few configuration options this container can accept. 

### General

| Variable | Description | Required | Default |
|----------|-------------|---------|--------|
| GAIN     | Sets the gain for the dongle | No | 280 |
| FEED     | Used to toggle feeding to [ACARS.io](http://acars.io). If set to any non-blank value feeding will be enabled. | No | Blank |

### ACARS

| Variable | Description | Required | Default |
|----------|-------------|---------|--------|
| ENABLE_ACARS | Toggle ACARS decoding on. If set to any non-blank value ACARS decoding will start | No | Blank |
| STATON_ID_ACARS | Your unique ID for the ACARS feed. Used on the [ACARS.io](http://acars.io) site. Follow the guide [here](https://app.airframes.io/about) for formatting. | Yes, if ENABLE_ACARS is enabled | Blank |
| SERIAL_ACARS | Serial for the RTLSDR dongle used for ACARS decoding. | Yes, if ENABLE_ACARS and ENABLE_VDLM is enabled | Blank |
| FREQS_ACARS | List of frequencies, separaed by spaces, used for ACARS monitoring. | Yes, if ENABLE_ACARS is enabled | Blank |

### VDLM2

| Variable | Description | Required | Default |
|----------|-------------|---------|--------|
| ENABLE_VDLM | Toggle VDLM decoding on. If set to any non-blank value VDLM decoding will start | No | Blank |
| STATON_ID_VDLM  | Your unique ID for the VDLM  feed. Used on the [ACARS.io](http://acars.io) site. Follow the guide [here](https://app.airframes.io/about) for formatting. | Yes, if ENABLE_VDLM is enabled | Blank |
| SERIAL_VDLM  | Serial for the RTLSDR dongle used for VDLM decoding. | Yes, if ENABLE_ACARS and ENABLE_VDLM is enabled | Blank |
| FREQS_VDLM  | List of frequencies, separaed by spaces, used for VDLM monitoring. | Yes, if ENABLE_VDLM is enabled | Blank |

## Logging

* All processes are logged to the container's stdout, and can be viewed with `docker logs [-f] container`.

## Future improvements

ACARS decoding appears to be actively being developed, and as such, I expect a lot of movement in data-visualization and presentation to happen. This container will follow those developments and add in functionality as it appears.

As it stands right now, the easiest way to view the data you are generating will be to follow the docker logs via the command above. 

## Getting Help

You can [log an issue](https://github.com/fredclausen/docker-acarshub/issues) on the project's GitHub.
