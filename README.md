# fredclausen/acarshub

![Banner](Logo-Sources/ACARS%20Hub.png "banner")
[![GitHub Workflow Status](https://img.shields.io/github/workflow/status/fredclausen/docker-acarshub/Deploy%20to%20Docker%20Hub)](https://github.com/fredclausen/docker-acarshub/actions?query=workflow%3A%22Deploy+to+Docker+Hub%22)
[![Docker Pulls](https://img.shields.io/docker/pulls/fredclausen/acarshub.svg)](https://hub.docker.com/r/fredclausen/acarshub)
[![Docker Image Size (tag)](https://img.shields.io/docker/image-size/fredclausen/acarshub/latest)](https://hub.docker.com/r/fredclausen/acarshub)
[![Discord](https://img.shields.io/discord/734090820684349521)](https://discord.gg/sTf9uYF)

Docker container to view and also stream ACARS messages to [ACARS.io/Airframes.io](http://acars.io).

We make extensive use of the [airframes](https://github.com/airframesio) work to make the messages more 'human-readable' as well as provide more detail for each of the messages.

Builds and runs on `amd64`, `arm64`, `arm/v7`, `arm/v6` and `386` architectures.

## Table of Contents

- [Users of v2 that need to migrate to v3](#Users-of-v2-that-need-to-migrate-to-v3)
- [IMPORTANT NOTE FOR BUSTER USERS](#IMPORTANT-NOTE-FOR-BUSTER-USERS)
- [Pre-requisites/Totally new to docker but you think this looks cool?](#Pre-requisitesTotally-new-to-docker-but-you-think-this-looks-cool)
- [Supported tags and respective Dockerfiles](#Supported-tags-and-respective-Dockerfiles)
- [Thanks](#thanks)
- [Getting valid ACARS/VDLM2 data](#Getting-valid-ACARSVDLM2-data))
- [Up-and-Running](#up-and-running)
- [Ports](#ports)
- [Volumes / Database](#VolumesDatabase)
- [Environment Variables](#environment-variables)
  - [General](#general)
  - [ADSB](#adsb)
  - [ACARS](#acars)
  - [VDLM2](#vdlm2)
- [Viewing the messages](#viewing-the-messages)
- [Which frequencies should you monitor?](#which-frequencies-should-you-monitor)
- [Logging](#logging)
- [A note about data sources used for the website](#a-note-about-data-sources-used-for-the-web-site)
- [Accessing ACARS/VDLM data with external programs](#accessing-acarsvdlm-data-with-external-programs)
- [Website Tips and Tricks](#website-tips-and-tricks)
- [Future Improvements](#future-improvements)
- [Getting Help](#getting-help)

## Users of v2 that need to migrate to v3

Please see [this](Setting-Up-ACARSHub.md) for an example `docker-compose.yaml` file to get you started. You should be able to copy/paste values quickly over in to the new config and be up and running very quickly.

## IMPORTANT NOTE FOR BUSTER USERS

Please see [this](https://github.com/sdr-enthusiasts/Buster-Docker-Fixes) if you encounter `RTC/Real Time Clock` issues.

## Pre-requisites/Totally new to docker but you think this looks cool?

Welcome! New to docker but you love the idea of monitoring ACARS and/or ADSB data? You will to prepare your system to run this, but it's super easy!

You will need the following:

- A Linux computer capable of running docker with the system installed and running. I personally recommend a raspberry Pi
- At least one RTL-SDR Dongle. Two if you want to listen to both ACARS and VDLM. Something like [this](https://www.amazon.com/dp/B0129EBDS2), although other kinds do work.
- Docker and docker-compose installed. Please see [installing docker and docker compose](https://github.com/sdr-enthusiasts/docker-install) for help with that, and come back here when you're ready.

## Supported tags and respective Dockerfiles

- `latest` (`master` branch, `Dockerfile`)
- Version and architecture specific tags available

## Thanks

Thanks to [mikenye](https://github.com/mikenye) for his excellent ADSB docker containers from which I shamelessly copied a lot of the ideas for setting up the docker container, as well as his excellent work to move this project from its humble beginnings to what it is now.

Additional thanks goes to the folks over at [airframes.io](airframes.io) for their tireless work in figuring out what all of these ACARS messages mean and making their work available in usable packages.

I am missing a boat load of people who have provided feed back as this project has progressed, as well as contributed ideas or let me bounce thoughts off of them. You've all molded this project and made it better than I could have done on my own.

## Getting valid ACARS/VDLM2 data

External to ACARS Hub you need to be running an ACARS and/or VDLM2 decoder for ACARS Hub, and have that decoder connect to ACARS Hub to send over the messages for processing.

The following decoders are supported:

- [acarsdec](https://github.com/TLeconte/acarsdec) or one of the forks of acarsdec. I suggest [the airframes fork](https://github.com/airframesio/acarsdec). Run the decoder with the option `-j youracarshubip:5550`, ensuring that port `5550` is mapped to the container.
- [dumpvdl2](https://github.com/szpajder/dumpvdl2). Run the decoder with the option `--output decoded:json:udp:address=<youracarshubip>,port=5555`, ensuring that port `5555` is mapped to the container.
- [vdlm2dec](https://github.com/TLeconte/vdlm2dec). Run the decoder with the option `-j youracarshubip:5555`, ensuring that port `5555` is mapped to the container.

For VDLM decoding `dumpvdl2` is preferred as the decoder provides richer data and is more modern than `vdlm2dec`.

For ease of use I have provided docker images set up to work with ACARS Hub. This is the preferred way to get data in to ACARS Hub.

- [docker-acarsdec](https://github.com/fredclausen/docker-acarsdec) for ACARS decoding.
- [docker-dumpvdl2](https://github.com/fredclausen/docker-dumpvdl2) for VDLM decoding. This is the preferred decoder.
- [docker-vdlm2dec](https://github.com/fredclausen/docker-vdlm2dec) as an alternative for VDLM decoding. This decoder is far less feature-rich compared to `dumpvdl2` and is provided only as an alternative if you have a strong preference for using this over `dumpvdl2`.

If you wish to use `acars` decoding please ensure port `5550` is mapped to the container. If you wish to use `vdlm2` decoding please ensure port `5555` is mapped to the container.

## Up-and-Running

The document below covers a lot of configuration options, however, most of them are not needed to get started. Please see [this](Setting-Up-ACARSHub.md) for an example `docker-compose.yaml` file that should get you off the ground.

## Ports

| Port    | Description                              |
| ------- | ---------------------------------------- |
| `80`    | Port used for the web interface          |
| `5550`  | Port used for pushing ACARS JSON data to |
| `5555`  | Port used for pushing VDLM2 JSON data to |
| `15550` | Port used for exposing JSON ACARS data   |
| `15555` | Port used for exposing JSON VDLM2 data   |

## Volumes / Database

It is recommended to give the container a volume so that database and message data is persisted between container restarts/upgrade. If you wish to persist this database between container restarts, mount a volume to `/run/acars/`.

The database is used on the website for various functions. It is automatically pruned of data older than 7 days old.

The reality of running any kind of database on a Pi is that database performance can be lacking. I have found that a database that has seven days worth of data, on a moderately busy site like mine, can reach file sizes of 17Mb and have 112,000+ rows of data. In other words, an awful lot of data, and with database sizes that large you will see a degradation in search performance. Queries might take a few seconds to execute after you type your search terms on the search page.

If you set `DB_SAVEALL` to a blank value you will gain back a lot of performance because messages with no informational value won't be stored. The trade-off in disabling saving all messages means you won't have all messages logged which may or may not be important to you.

It is also recommended you use a tmpfs mount to reduce SD card writes.

## Environment variables

There are quite a few configuration options this container can accept.

### General

| Variable             | Description                                                                                                                                                                                                                                                                                                            | Required | Default |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| `FEED`               | Used to toggle feeding to [ACARS.io](http://acars.io). If set to any non-blank value feeding will be enabled.                                                                                                                                                                                                          | No       | Blank   |
| `ENABLE_WEB`         | Enable the web server. Set to a blank value to disable the web server.                                                                                                                                                                                                                                                 | No       | `true`  |
| `QUIET_LOGS`         | By default the container displays all logging messages. If you wish to only see errors and critical messages in the container logs set `QUIET_LOGS` to a non-blank value.                                                                                                                                              | No       | Blank   |
| `QUIET_MESSAGES`     | By default the decoders will not output their received messages to the container logs. If you want to see these messages in the logs set `QUIET_MESSAGES` to a blank value.                                                                                                                                            | No       | `true`  |
| `DB_SAVEALL`         | By default the container will save all received messages in to a database, even if the message is a blank message. If you want to increase performance/decrease database size, set this option to blank to only save messages with at least one informationial field.                                                  | No       | `true`  |
| `DB_SAVE_DAYS`       | By default the container will save message data for 7 days. If you wish to over-ride this behavior, set this to the number of days you wish to have retained.                                                                                                                                                          | No       | blank   |
| `DB_ALERT_SAVE_DAYS` | By default the container will save message data for 7 days. If you wish to over-ride this behavior, set this to the number of days you wish to have retained.                                                                                                                                                          | No       | blank   |
| `DB_BACKUP`          | If you want to run a second database for backup purposes set this value to a [SQL Alchemy formatted URL](https://docs.sqlalchemy.org/en/13/core/engines.html#database-urls). See the link for supported DB types. This database will have to be managed by you, as ACARS Hub will only ever write incoming data to it. | No       | Blank   |
| `IATA_OVERRIDE`      | Override or add any custom IATA codes. Used for the web front end to show proper callsigns; See [below](#the-fix) on formatting and [more details](#A-note-about-data-sources-used-for-the-web-site) why this might be necessary.                                                                                      | No       | Blank   |
| `TAR1090_URL`        | Flights where the container is able to, it will generate a link to a tar1090 instance so that you can see the position of the aircraft that generated the message. By default, it will link to [ADSB Exchange](https://www.adsbexchange.com), but if desired, you can set the URL to be a local tar1090 instance.      | No       | Blank   |
| `AUTO_VACUUM`        | If you find your database size to be too large you can temporarily enable this and on the next container startup the database will attempt to reduce itself in size. When you do this startup time will take a few minutes. It is recommended to leave this flag disabled and only enable it temporarily.              | No       | `False` |

Please note that for `TAR1090_URL` the required format is `http[s]://**HOSTNAME**` only. So if your tar1090 instance is at IP address `192.168.31.10` with no SSL, the TAR1090_URL would look like `http://192.168.31.10`

### ADSB

The ACARS Hub website contains the ability to display ADSB targets along side ACARS messages. To enable this feature you need to have an available `aircraft.json` file generated from readsb and available on `tar1090webserverurl/data/aircraft.json`. [Mike Nye's tar1090](https://github.com/mikenye/docker-tar1090) is the recommended container to run to easily get this data. By turning this on you will get a map that shows the ADSB targets picked up by your readsb instance and enable you to click on planes to see what messages they've sent.

The following options will set the options for ADSB

| Variable              | Description                                                                    | Required                         | Default                             |
| --------------------- | ------------------------------------------------------------------------------ | -------------------------------- | ----------------------------------- |
| `ENABLE_ADSB`         | Turns on ADSB in ACARS Hub                                                     | Yes, if you want to monitor ADSB | Blank                               |
| `ADSB_URL`            | The IP address or URL for your tar1090 instance                                | No (see note below)              | `http://tar1090/data/aircraft.json` |
| `ADSB_LAT`            | The latitude of your ADSB site                                                 | No, but recommended              | 0                                   |
| `ADSB_LON`            | The longitude of your ADSB site                                                | No, but recommended              | 0                                   |
| `DISABLE_RANGE_RINGS` | Turn off range rings on your map. Set to a blank value to disable range rings. | No                               | Blank                               |

If you run Mike's tar1090 container on the same machine as ACARS Hub then the default value for `ADSB_URL` is fine. If you don't, the formatting for `ADSB_URL` should be the full URL path to `aircraft.json` from your readsb source.

If you desire enhanced ADSB and ACARS message matching and thus show coloured aircraft icons on Live Map, and are running Mike's tar1090 container, you can enable the following option:

```yaml
- TAR1090_ENABLE_AC_DB=true
```

In the configuration options for tar1090. Setting this will include additional aircraft information in the `aircraft.json` file that is not normally part of the ADSB broadcast, such as the aircraft's tail number and aircraft type. Please enable this with caution: there is increased memory usage in the tar1090 container so RAM constrained systems should be cautious enabling this.

### ACARS

| Variable       | Description                                                                                                                                                                         | Required | Default |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| `ENABLE_ACARS` | Toggle ACARS decoding on. If set to `external` this will enable VDLM processing in the container. Push valid `ACARS` json data to UDP port 5550 (needs port mapping 5550:5550/udp). | No       | Blank   |

### VDLM2

| Variable      | Description                                                                                                                                                                   | Required | Default |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| `ENABLE_VDLM` | Toggle VDLM decoding on. If set to `external` this will enable VDLM processing in the container. Push valid `VDLM2` data to UDP port 5555 (needs port mapping 5555:5555/udp). | No       | Blank   |

## Viewing the messages

The container implements a basic web interface, listening on port `80`, which will show messages as they are received.

If `QUIET_MESSAGES`is disabled, received messages are also logged to the container log.

## Which frequencies should you monitor

The [ACARS.io/Airframes.io](https://app.airframes.io/about) website has a great list of community derived frequencies that aircraft typically will broadcast ACARS/VDLM on, and what regions those are applicable to. The values provided in the example docker-compose/docker run example above are frequencies I have found to be good in the United States, with a decent level of traffic. I imagine the list is not complete, and could be refined better.

Some notes about frequencies:

- `acarsdec` and `dumpvdl2` are limited to monitoring 8 frequencies apiece
- The spread of frequencies for each decoder has to be within 2 Mhz.

## Logging

All processes are logged to the container's stdout. If `QUIET_LOGS` is disabled, all received aircraft messages are logged to the container log as well. General logging can be viewed with `docker logs [-f] container`.

## A note about data sources used for the web site

A brief primer on some terms:

- All ACARS/VDLM broadcasts that have a callsign appended to the message will use a two letter airline code

- IATA is a two letter airline identification code. Many airlines don't actually have an IATA code and use their own internal code.

- ICAO is an international standard, unique-across-the-world three letter airline code.

In order to make the website more usable, I have included a database used by the container to convert the two airline codes used in the messages from IATA to ICAO codes, and to show their long-form name. This data was found from public, free sources. The data had some errors in it, some of which was due to the age of the data, and some of it is due to airlines not always using the correct IATA codes in their broadcoast messages.

My observations are US centric, but from what I have seen there are "errors" you might notice in the converted callsigns.

- US Airlines that have acquired airlines as part of mergers (for instance, American Airlines/AA/AAL, who has, among others, merged with America West/US/AWE) would show up as their legacy callsign if the aircraft being picked up was part of the airline that was merged in to the bigger airline. I've selectively fixed some of these errors because the IATA code of the legacy airline was not in use by anyone else.

- Some airlines (UPS and FedEx, particularlly, among others) don't use their designated IATA callsigns period, or seem to be using contracted planes which are using an alternative two letter airline code in their message.

- There are three IATA code regions that cover the world. If an airline flies only in one region, and another flies in a separate region, those airlines are allowed to use the same IATA code. The airline code generated from the database might use the wrong IATA code because of this.

So what this means is you will occasionally see callsigns on the web front end that are wrong. The above mentioned UPS will show up `BHSxxxx/BahamasAir` which is obviously not right, at least for my part of the world. I am hesitant to "fix" too many of these "errors" in the database because this container is being used all around the world.

The end result of this is that in messages where the airline code is improperly mapped the Flight Aware link generated will lead to the wrong flight. The TAIL link generated should be correct.

### The Fix

If you add in the ENV variable `IATA_OVERRIDE` you can change your local web site to display the correct airline for your region.

Formatting is as follows: `IATA|ICAO|Airline Name`

If you have multiple airlines you wish to override, you add in a `;` between them, such as the following: `UP|UPS|United Parcel Service;US|AAL|American Airlines`

For anyone in the US, I suggest adding `IATA_OVERRIDE=UP|UPS|United Parcel Service` to start out with.

If there are airlines you notice that are wrong because the data used is wrong (IATA codes do change over time as airlines come and go), or airlines that are missing from the database that do have an IATA code, submit a PR above and I'll get it in there!

## Accessing ACARS/VDLM data with external programs

If you wish to access the JSON data that the decoders `acarsdec` and `dumpvdl2` generate with an external program expose the following ports in your docker-compose configuration:

- Port 80 for the web site
- Port 15555 for UDP VDLM2 JSON
- Port 15550 for UDP ACARS JSON

### YAML Configuration for Ports

```yaml
ports:
  - 80:80
  - 5550:5550
  - 5555:5555
  - 15550:15550
  - 15555:15555
```

And then you will be able to connect to `yourpisipaddress:15555` or `yourpisipaddress:15550` respectively, in whatever program can decode ACARS/VDLM JSON.

## Website tips and tricks

- On the `Live Message` page pressing the `p` key on your keyboard will pause the message updates so you can catch up. Pressing `p` again will cause the page to refresh again and display messages as they come in.
- On the search page enter your search terms and then press `enter` to start the search.

## Future improvements

ACARS decoding appears to be in active development, and as such, I expect a lot of movement in data-visualization and presentation to happen. This container will follow those developments and add in functionality as it appears.

The following features are in active development:

- A fresh new look to the website
- Desktop application to view the data

## Getting Help

You can [log an issue](https://github.com/fredclausen/docker-acarshub/issues) on the project's GitHub or visit the [discord](https://discord.gg/sTf9uYF) server.
