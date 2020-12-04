# docker-acarshub

Docker container to view and also stream ACARS messages to [ACARS.io](http://acars.io). Uses [libacars](https://github.com/szpajder/libacars), [acarsdec](https://github.com/TLeconte/acarsdec) and [vdlm2dec](https://github.com/TLeconte/vdlm2dec). Builds and runs on `arm64`. A container is provided for, but not tested, `amd64`, `arm32v6` and `arm32v7` (see below).

## Supported tags and respective Dockerfiles

* `latest` (`master` branch, `Dockerfile`)
* Version and architecture specific tags available

## Multi Architecture Support

Currently, this image should pull and run on the following architectures:

* `amd64`: Linux x86-64 (Builds, untested. If it works for you let me know!)
* `arm32v6`: ARMv6 32-bit (Older RPis) (Builds, untested. If it works for you let me know!)
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
 -e FREQS_ACARS="130.025;130.450;131.125;131.550" \
 -e ENABLE_ACARS="true" \
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
      - STATION_ID_ACARS=YOURIDHERE
      - FREQS_ACARS=130.025;130.450;131.125;131.550
      - ENABLE_ACARS=true
```

## Ports

No exposed ports are necessary to run the container. However, if you enable `VERBOSE` the built in webserver will be enabled as well, and will be available on port `80`.

## Volumes

No volumes are needed to run the container. However, if you wish to persist the `VERBOSE` data, mount a volume to `/run/acars`.

## Environment variables

There are quite a few configuration options this container can accept. 

### General

| Variable | Description | Required | Default |
|----------|-------------|---------|--------|
| GAIN     | Sets the gain for the dongle | No | 280 |
| FEED     | Used to toggle feeding to [ACARS.io](http://acars.io). If set to any non-blank value feeding will be enabled. | No | Blank |
| VERBOSE  | If you want to dump a json log file containing the aircraft messages to the disk, set this value to any non-blank value. This will also enable the web server where you will be able to see the last 200 received messages. | No | Blank |
| TRIM_LOGS | With VERBOSE enabled, the json files can get very large. If you want to keep ALL received messages, set this value to be blank. Any non-blank value will trim the json files down. SEE NOTE BELOW | No | blank |

* `TRIM_LOGS` might cause a problem with `vdlm2dec`/`acarsdec` writing to the log files after a trimming is done. I as of 11/24/20 I altered the scripts because there was a bug in it that duplicated log entries, instead of deleting them. After that, the container quit writing logs until I deleted the file and let it re-create it. I have a theory as to why, but unfortunately, I need to let it collect more messages. I will continue to test this on my hardware and make sure the container operates the way it should, but in the mean time, please treat `TRIM_LOGS` as experimental.

### ACARS

| Variable | Description | Required | Default |
|----------|-------------|---------|--------|
| ENABLE_ACARS | Toggle ACARS decoding on. If set to any non-blank value ACARS decoding will start | No | Blank |
| STATON_ID_ACARS | Your unique ID for the ACARS feed. Used on the [ACARS.io](http://acars.io) site. Follow the guide [here](https://app.airframes.io/about) for formatting. | Yes, if ENABLE_ACARS is enabled | Blank |
| SERIAL_ACARS | Serial for the RTLSDR dongle used for ACARS decoding. | Yes, if ENABLE_ACARS and ENABLE_VDLM is enabled | Blank |
| FREQS_ACARS | List of frequencies, separaed by a single `;`, used for ACARS monitoring. | Yes, if ENABLE_ACARS is enabled | Blank |

### VDLM2

| Variable | Description | Required | Default |
|----------|-------------|---------|--------|
| ENABLE_VDLM | Toggle VDLM decoding on. If set to any non-blank value VDLM decoding will start | No | Blank |
| STATON_ID_VDLM  | Your unique ID for the VDLM  feed. Used on the [ACARS.io](http://acars.io) site. Follow the guide [here](https://app.airframes.io/about) for formatting. | Yes, if ENABLE_VDLM is enabled | Blank |
| SERIAL_VDLM  | Serial for the RTLSDR dongle used for VDLM decoding. | Yes, if ENABLE_ACARS and ENABLE_VDLM is enabled | Blank |
| FREQS_VDLM  | List of frequencies, separaed by a single `;`, used for VDLM monitoring. | Yes, if ENABLE_VDLM is enabled | Blank |

## Viewing the messages

As it stands right now, this container will show the last 200 received messages via the web server if `VERBOSE` is enabled. No processing of the messages in to a more readable format is done. It is very ugly, I am not a fan of it, but it is better than nothing (I think...)

The messages are viewable at `containerip`.

## Logging

* All processes are logged to the container's stdout unless `VERBOSE` is enabled in which case aircraft messages are logged to the disk. General logging can be viewed with `docker logs [-f] container`.

## Future improvements

ACARS decoding appears to be in active development, and as such, I expect a lot of movement in data-visualization and presentation to happen. This container will follow those developments and add in functionality as it appears.

## Getting Help

You can [log an issue](https://github.com/fredclausen/docker-acarshub/issues) on the project's GitHub.
