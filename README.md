# fredclausen/acarshub

[![GitHub Workflow Status](https://img.shields.io/github/workflow/status/fredclausen/docker-acarshub/Deploy%20to%20Docker%20Hub)](https://github.com/fredclausen/docker-acarshub/actions?query=workflow%3A%22Deploy+to+Docker+Hub%22)
[![Requirements Status](https://requires.io/github/fredclausen/docker-acarshub/requirements.svg?branch=main)](https://requires.io/github/fredclausen/docker-acarshub/requirements/?branch=main)
[![Docker Pulls](https://img.shields.io/docker/pulls/fredclausen/acarshub.svg)](https://hub.docker.com/r/fredclausen/acarshub)
[![Docker Image Size (tag)](https://img.shields.io/docker/image-size/fredclausen/acarshub/latest)](https://hub.docker.com/r/fredclausen/acarshub)
[![Discord](https://img.shields.io/discord/734090820684349521)](https://discord.gg/sTf9uYF)

Docker container to view and also stream ACARS messages to [ACARS.io/Airframes.io](http://acars.io).

Uses [libacars](https://github.com/szpajder/libacars), the [airframe's fork of acarsdec](https://github.com/airframesio/acarsdec) and [vdlm2dec](https://github.com/TLeconte/vdlm2dec) for SDR side of decoding.

Also, we make extensive use of the [airframes](https://github.com/airframesio) work to make the message's more 'human-readable'.

Builds and runs on `amd64`, `arm64`, `arm/v7`, `arm/v6` and `386` architectures.

## Supported tags and respective Dockerfiles

* `latest` (`master` branch, `Dockerfile`)
* Version and architecture specific tags available

## Thanks

Thanks to [mikenye](https://github.com/mikenye) for his excellent ADSB docker containers from which I shamelessly copied a lot of the ideas for setting up the docker container, as well as his excellent work to move this project from its humble beginnings to what it is now.

Additional thanks goes to the folks over at [airframes.io](airframes.io) for their tireless work in figuring out what all of these ACARS messages mean and making their work available in usable packages.

I am missing a boat load of people who have provided feed back as this project has progressed, as well as contributed ideas or let me bounce thoughts off of them. You've all molded this project and made it better than I could have done on my own.

## Required hardware

You will need an RTLSDR dongle, and if you want to feed both VDLM2 and ACARS you will need two dongles with unique serial numbers.

## Up-and-Running with `docker run`

```shell
docker volume create acarshub &&
docker run \
 -d \
 --rm \
 --name acarshub \
 -p 80:80 \
 -e STATION_ID_ACARS="YOURIDHERE" \
 -e FREQS_ACARS="130.025;130.450;131.125;131.550" \
 -e ENABLE_ACARS="true" \
 -v acars_data:/run/acars \
 --device /dev/bus/usb:/dev/bus/usb \
fredclausen/acarshub
```

You should obviously replace `STATION_ID_ACARS` with a unique ID for your station.

## Up-and-Running with Docker Compose

```yaml
version: '3.8'

volumes:
  acars_data:

services:
  acarshub:
    image: fredclausen/acarshub
    tty: true
    container_name: acarshub
    restart: always
    devices:
      - /dev/bus/usb:/dev/bus/usb
    ports:
      - 80:80
    environment:
      - STATION_ID_ACARS=YOURIDHERE
      - FREQS_ACARS=130.025;130.450;131.125;131.550
      - ENABLE_ACARS=true
    volumes:
      - acars_data:/run/acars
```

## Ports

The built in webserver is available on port `80` if you wish the view messages in realtime.

## Volumes / Database

It is recommended to give the container a volume so that database and message data is persisted between container restarts/upgrade. If you wish to persist this database between container restarts, mount a volume to `/run/acars/`.

The database is used on the website for various functions. It is automatically pruned of data older than 7 days old.

The reality of running any kind of database on a Pi is that database performance can be lacking. I have found that a database that has seven days worth of data, on a moderately busy site like mine, can reach file sizes of 17Mb and have 112,000+ rows of data. In other words, an awful lot of data, and with database sizes that large you will see a degredation in search performance. Queries might take a few seconds to execute after you type your search terms on the seach page.

If you set `DB_SAVEALL` to a blank value you will gain back a lot of performance because messages with no informational value won't be stored. The trade-off in disabling saving all messages means you won't have all messages logged which may or may not be important to you.

## Environment variables

There are quite a few configuration options this container can accept.

### General

| Variable | Description | Required | Default |
|----------|-------------|---------|--------|
| `FEED`     | Used to toggle feeding to [ACARS.io](http://acars.io). If set to any non-blank value feeding will be enabled. | No | Blank |
| `ENABLE_WEB`  | Enable the web server. Set to a blank value to disable the web server. | No | `true` |
| `QUIET_LOGS` | By default the received ACARS/VDLM messages will be logged to the container's std output. To stop this, set to any non-blank value. | No | Blank |
| `DB_SAVEALL` | By default the container will save all received messages in to a database, even if the message is a blank message. If you want to increase performance/decrease database size, set this option to blank to only save messages with at least one informationial field. | No | `true` |
| `DB_SAVE_DAYS` | By default the container will save message data for 7 days. If you wish to over-ride this behavior, set this to the number of days you wish to have retained. | No | blank |
| `IATA_OVERRIDE` | Override or add any custom IATA codes. Used for the web front end to show proper callsigns; See [below](#the-fix) on formatting and [more details](#A-note-about-data-sources-used-for-the-web-site) why this might be necessary.| No | Blank |
| `TAR1090_URL` | Flights where the container is able to, it will generate a link to a tar1090 instance so that you can see the position of the aircraft that generated the message. By default, it will link to [ADSB Exchange](https://www.adsbexchange.com), but if desired, you can set the URL to be a local tar1090 instance. | No | Blank |

Please note that for `TAR1090_URL` the required format is `http[s]://**HOSTNAME**` only. So if your tar1090 instance is at IP address `192.168.31.10` with no SSL, the TAR1090_URL would look like `http://192.168.31.10`

### ACARS

| Variable | Description | Required | Default |
|----------|-------------|---------|--------|
| `ENABLE_ACARS` | Toggle ACARS decoding on. If set to any non-blank value ACARS decoding will start | No | Blank |
| `STATION_ID_ACARS` | Your unique ID for the ACARS feed. Used on the [ACARS.io](http://acars.io) site. Follow the guide [here](https://app.airframes.io/about) for formatting. | Yes, if ENABLE_ACARS is enabled | Blank |
| `FREQS_ACARS` | List of frequencies, separaed by a single `;`, used for ACARS monitoring. | Yes, if ENABLE_ACARS is enabled AND you are not using custom SDR definitions (see below)| Blank |

### VDLM2

| Variable | Description | Required | Default |
|----------|-------------|---------|--------|
| `ENABLE_VDLM` | Toggle VDLM decoding on. If set to any non-blank value VDLM decoding will start | No | Blank |
| `STATION_ID_VDLM`  | Your unique ID for the VDLM  feed. Used on the [ACARS.io](http://acars.io) site. Follow the guide [here](https://app.airframes.io/about) for formatting. | Yes, if ENABLE_VDLM is enabled | Blank |
| `FREQS_VDLM`  | List of frequencies, separated by a single `;`, used for VDLM monitoring. | Yes, if ENABLE_VDLM is enabled AND you are not using custom SDR definitions (see below)| Blank |

### RTL Device assignment

| Variable | Description | Required | Default |
|----------|-------------|---------|--------|
| `BYPASS_SDR_CHECK` | If you experience issues with ACARS Hub failing to start because it cannot find your SDRs based on their serial, set this to any non-blank value to force it to bypass the check. Depending on the reason ACARS Hub could not map a serial to an SDR is because there is a problem with the SDR, and as a result ACARS Hub still won't start up properly, but there are cases where it might. It is suggested you also replace the serial number in Method 1 or 2 below with the device index (found via `rtl_test`). | No | Blank |

You have two options that can be used interchangably to assign RTLSDR devices in the container. The first method is most likely what most users will want

#### Method 1: Auto-assignment of SDRs

The container will auto-assign frequencies to an SDR based on the number of available SDRs and what decoder you've set up for that frequency. You can use both Method 1 and Method 2 to assign SDRs in the container, but ensure the serials used in one method are not used in the other.

| Variable | Description | Required | Default |
|----------|-------------|---------|--------|
| `SERIAL` | List of SDRs and configuration options (see below), with each SDR separated by a `;` | Yes, if Method 2 below is not used | Blank |

Example: `SERIAL=00012507,2,-10,160;00012095,0,280,160`

#### Method 2: Assign Specific Frequencies to a Specific SDR

If you wish to not have frequencies auto-assigned use this method. You can use both Method 1 and Method 2 to assign SDRs in the container, but ensure the serials used in one method are not used in the other. For each SDR you want to specify the frequency assignment/decoder, use one value from each of the following tables:

| Variable | Description | Required | Default |
|----------|-------------|---------|--------|
| `ACARS_x` | SDR with configuration options. Replace x with 0, and for every SDR you add under ACARS increase the number by one | Yes, if Method 1 is not used above and you want ACARS decoding. See below for formatting the SDR line | Yes, if Method 1 is not used | Blank
| `VDLM_x` | SDR with configuration options. Replace x with 0, and for every SDR you add under VDLM increase the number by one | Yes, if Method 1 is not used above and you want VDLM decoding. See below for formatting the SDR line | Blank |

For frequency assignment, use the following:

| Variable | Description |
|----------|-------------|
| `ACARS_FREQ_x` | list of frequencies, each separated by a single `;`, to be used by the `ACARS_x` decoder above. Ensure the number used is the same in both configuration variables: ie `ACARS_0` and `ACARS_FREQ_0` |
| `VDLM_FREQ_x` | list of frequencies, each separated by a single `;`, to be used by the `VDLM_x` decoder above. Ensure the number used is the same in both configuration variables: IE `VDLM_0` and `VDLM_FREQ_0` |

#### Configuring the SDR options

To format the SDR configuration correctly, the container expects the following options:

* SDR serial
* PPM correction
* Gain (see below for options there)
* RTL Multiplier - for setting the bandwidth, used by ACARS only

If you don't wish to set the value for a certain option, you can skip it by leaving it blank

So if your serial for the SDR was `00012095`, you had no PPM correction, and a gain of `28.0` and wanted to use the default RTL Multiplier: `SERIAL=00012095,,28.0,`

If you have more than one SDR being auto-assigned (NOT APPLICABLE to Method 2 above), separate each SDR with a `;`

Example: `SERIAL=00012095,,28.0,;00012507,2,A460`

* The ACARS Decoder supports `AGC/Automatic Gain Control`. To enable, prepend the gain value with an `A`. Additonally, you will need to set the gain value for VDLM. See below.
* If you are not using ACG and wish to set the gain manually, use dBm format: `28.0`
* If you are using Auto-Assignment of the SDRs and wish to use ACG if the decoder is being used for ACARS, but want a specific value for VDLM, pre-pend the value with an `A`: `A46.0`
* For the sample rate, use `192` for `2.4 MS/s` and `160` for `2.0MS/s` (default)

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

A brief primer on some terms:

* All ACARS/VDLM broadcasts that have a callsign appended to the message will use a two letter airline code

* IATA is a two letter airline identification code. Many airlines don't actually have an IATA code and use their own internal code.

* ICAO is an international standard, unique-across-the-world three letter airline code.

In order to make the website more usable, I have included a database used by the container to convert the two airline codes used in the messages from IATA to ICAO codes, and to show their long-form name. This data was found from public, free sources. The data had some errors in it, some of which was due to the age of the data, and some of it is due to airlines not always using the correct IATA codes in their broadcoast messages.

My observations are US centric, but from what I have seen there are "errors" you might notice in the converted callsigns.

* US Airlines that have aquired airlines as part of mergers (for instance, American Airlines/AA/AAL, who has, among others, merged with America West/US/AWE) would show up as their legacy callsign if the aircraft being picked up was part of the airline that was merged in to the bigger airline. I've selectively fixed some of these errors because the IATA code of the legacy airline was not in use by anyone else.

* Some airlines (UPS and FedEx, particularlly, among others) don't use their designated IATA callsigns period, or seem to be using contracted planes which are using an alternative two letter airline code in their message.

* There are three IATA code regions that cover the world. If an airline flies only in one region, and another flies in a separate region, those airlines are allowed to use the same IATA code. The airline code generated from the database might use the wrong IATA code because of this.

So what this means is you will occasionally see callsigns on the web front end that are wrong. The above mentioned UPS will show up `BHSxxxx/BahamasAir` which is obviously not right, at least for my part of the world. I am hesitant to "fix" too many of these "errors" in the database because this container is being used all around the world.

The end result of this is that in messages where the airline code is improperly mapped the Flight Aware link generated will lead to the wrong flight. The TAIL link generated should be correct.

### The Fix

If you add in the ENV variable `IATA_OVERRIDE` you can change your local web site to display the correct airline for your region.

Formatting is as follows: `IATA|ICAO|Airline Name`

If you have multiple airlines you wish to override, you add in a `;` between them, such as the following: `UP|UPS|United Parcel Service;US|AAL|American Airlines`

For anyone in the US, I suggest adding `IATA_OVERRIDE=UP|UPS|United Parcel Service;GS|FTH|Mountain Aviation (Foothills)` to start out with.

If there are airlines you notice that are wrong because the data used is wrong (IATA codes do change over time as airlines come and go), or airlines that are missing from the database that do have an IATA code, submit a PR above and I'll get it in there!

## Future improvements

ACARS decoding appears to be in active development, and as such, I expect a lot of movement in data-visualization and presentation to happen. This container will follow those developments and add in functionality as it appears.

## Getting Help

You can [log an issue](https://github.com/fredclausen/docker-acarshub/issues) on the project's GitHub or visit the [discord](https://discord.gg/sTf9uYF) server.
