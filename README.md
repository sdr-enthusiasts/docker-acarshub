# fredclausen/acarshub

[![GitHub Workflow Status](https://img.shields.io/github/workflow/status/fredclausen/docker-acarshub/Deploy%20to%20Docker%20Hub)](https://github.com/fredclausen/docker-acarshub/actions?query=workflow%3A%22Deploy+to+Docker+Hub%22)
[![Docker Pulls](https://img.shields.io/docker/pulls/fredclausen/acarshub.svg)](https://hub.docker.com/r/fredclausen/acarshub)
[![Docker Image Size (tag)](https://img.shields.io/docker/image-size/fredclausen/acarshub/latest)](https://hub.docker.com/r/fredclausen/acarshub)
[![Discord](https://img.shields.io/discord/734090820684349521)](https://discord.gg/sTf9uYF)

Docker container to view and also stream ACARS messages to [ACARS.io/Airframes.io](http://acars.io). Uses [libacars](https://github.com/szpajder/libacars), [acarsdec](https://github.com/TLeconte/acarsdec) and [vdlm2dec](https://github.com/TLeconte/vdlm2dec). Builds and runs on `amd64`, `arm64`, `arm/v7`, `arm/v6` and `386` architectures.

## Supported tags and respective Dockerfiles

* `latest` (`master` branch, `Dockerfile`)
* Version and architecture specific tags available

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
version: '3.8'

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

No exposed ports are necessary to run the container. However, the built in webserver is available on port `80` if you wish the view messages in realtime.

## Volumes / Database

No volumes are needed to run the container. However, this container does log messages to a database. If you wish to persist this database between container restarts, mount a volume to `/run/acars/`.

The database is used on the website for various functions. It is automatically pruned of data older than 7 days old.

The reality of running any kind of database on a Pi is that database performance can be lacking. I have found that a database that has seven days worth of data, on a moderately busy site like mine, can reach file sizes of 17Mb and have 112,000+ rows of data. In other words, an awful lot of data, and with database sizes that large you will see a degredation in search performance. Queries might take a few seconds to execute after you type your search terms on the seach page.

If you set `DB_SAVEALL` to a blank value you will gain back a lot of performance because messages with no informational value won't be stored. The trade-off in disabling saving all messages means you won't have all messages logged which may or may not be important to you.

## Environment variables

There are quite a few configuration options this container can accept.

### General

| Variable | Description | Required | Default |
|----------|-------------|---------|--------|
| `GAIN`     | Sets the gain for the dongle | No | `280` |
| `FEED`     | Used to toggle feeding to [ACARS.io](http://acars.io). If set to any non-blank value feeding will be enabled. | No | Blank |
| `ENABLE_WEB`  | Enable the web server. Set to a blank value to disable the web server. | No | `true` |
| `QUIET_LOGS` | By default the received ACARS/VDLM messages will be logged to the container's std output. To stop this, set to any non-blank value. | No | Blank |
| `DB_SAVEALL` | By default the container will save all received messages in to a database, even if the message is a blank message. If you want to increase performance/decrease database size, set this option to blank to only save messages with at least one informationial field. | No | `true` |

### ACARS

| Variable | Description | Required | Default |
|----------|-------------|---------|--------|
| `ENABLE_ACARS` | Toggle ACARS decoding on. If set to any non-blank value ACARS decoding will start | No | Blank |
| `STATION_ID_ACARS` | Your unique ID for the ACARS feed. Used on the [ACARS.io](http://acars.io) site. Follow the guide [here](https://app.airframes.io/about) for formatting. | Yes, if ENABLE_ACARS is enabled | Blank |
| `FREQS_ACARS` | List of frequencies, separaed by a single `;`, used for ACARS monitoring. | Yes, if ENABLE_ACARS is enabled | Blank |
| `ACARS_PPM` | If your SDR requires a PPM correction, set this value | No | Blank |

For RTLSDR device selection, _one_ of the following arguments must also be set if `ENABLE_ACARS` is enabled.

| Variable | Description | Required | Default |
|----------|-------------|---------|--------|
| `SERIAL_ACARS` | Serial of the RTLSDR dongle used for ACARS decoding. | Yes, if ENABLE_ACARS is enabled | Blank |
| `DEVICE_ACARS` | Device number of the RTLSDR dongle used for ACARS decoding. | Yes, if ENABLE_ACARS is enabled | Blank |

It is generally recommended to use `SERIAL_ACARS`, as device numbers can change if devices are added/removed/etc.

### VDLM2

| Variable | Description | Required | Default |
|----------|-------------|---------|--------|
| `ENABLE_VDLM` | Toggle VDLM decoding on. If set to any non-blank value VDLM decoding will start | No | Blank |
| `STATION_ID_VDLM`  | Your unique ID for the VDLM  feed. Used on the [ACARS.io](http://acars.io) site. Follow the guide [here](https://app.airframes.io/about) for formatting. | Yes, if ENABLE_VDLM is enabled | Blank |
| `FREQS_VDLM`  | List of frequencies, separated by a single `;`, used for VDLM monitoring. | Yes, if ENABLE_VDLM is enabled | Blank |
| `VDLM_PPM` | If your SDR requires a PPM correction, set this value | No | Blank |

For RTLSDR device selection, _one_ of the following arguments must also be set if `ENABLE_ACARS` is enabled.

| Variable | Description | Required | Default |
|----------|-------------|---------|--------|
| `SERIAL_VDLM`  | Serial of the RTLSDR dongle used for VDLM decoding. | Yes, if ENABLE_VDLM is enabled | Blank |
| `DEVICE_VDLM`  | Device number of the RTLSDR dongle used for VDLM decoding. | Yes, if ENABLE_VDLM is enabled | Blank |

It is generally recommended to use `SERIAL_VDLM`, as device numbers can change if devices are added/removed/etc.

## Viewing the messages

The container implements a basic web interface, listening on port `80`, which will show messages as they are received.

If `QUIET_LOGS` is disabled, received messages are also logged to the container log.

## Which frequencies should you monitor?

The [ACARS.io/Airframes.io](https://app.airframes.io/about) website has a great list of community derived frequencies that aircraft typically will broadcast ACARS/VDLM on, and what regions those are applicable to. The values provided in the example docker-compose/docker run example above are frequencies I have found to be good in the United States, with a decent level of traffic. I imagine the list is not complete, and could be refined better.

Some notes about frequencies:

* `acarsdec` and `vdlm2dec` are limited to monitoring 8 frequencies apiece
* The spread of frequencies for each decoder has to be within 2 Mhz.

## Logging

* All processes are logged to the container's stdout. If `QUIET_LOGS` is disabled, all received aircraft messages are logged to the container log as well. General logging can be viewed with `docker logs [-f] container`.

## A note about data sources used for the web site

The database used by the container to convert the airline codes used in the messages from IATA to ICAO was found from public, free sources. The data had some errors in it, some of which was due to the age of the data, and some of it is due to airlines not always using the correct IATA codes.

My observations are US centric, but from what I have seen there are two kinds of "errors" you might notice in the converted callsigns.

* US Airlines that have aquired airlines as part of mergers (for instance, American Airlines/AAL, who has, among others, merged with America West/AWE) would show up as their legacy callsign if the aircraft being picked up was part of the airline that was merged in to the bigger airline. I've selectively fixed some of these errors.

* Some airlines (UPS and Fedex, particularlly, among other) don't use their designated IATA callsigns period, or seem to be using contracted planes which are using an alternative two letter airline code in their message.

I am hesitant to "fix" too many of these "errors" because in most cases, the IATA code in the data is accurate, and it is the message itself using a bad code. I don't want to replace good data because some airlines aren't using their IATA code and instead are using an internal code.

The end result of this is that in messages where the airline code is improperly mapped the Flight Aware link generated will lead to the wrong flight. The TAIL link generated should be correct.

I am not really sure what the best answer is, but if there are airlines you notice that are wrong because the data used is wrong (IATA codes do change over time as airlines come and go), or airlines that are missing from the database that do have an IATA code, submit a PR above and I'll get it in there!

## Future improvements

ACARS decoding appears to be in active development, and as such, I expect a lot of movement in data-visualization and presentation to happen. This container will follow those developments and add in functionality as it appears.

## Getting Help

You can [log an issue](https://github.com/fredclausen/docker-acarshub/issues) on the project's GitHub.
