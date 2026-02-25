# sdr-enthusiasts/acarshub

![Banner](Logo-Sources/ACARS%20Hub.png "banner")

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/sdr-enthusiasts/docker-acarshub/deploy.yml?branch=main)](https://github.com/sdr-enthusiasts/docker-acarshub/actions?query=workflow%3ADeploy)
[![Discord](https://img.shields.io/discord/734090820684349521)](https://discord.gg/sTf9uYF)

Docker container to receive and display ACARS, VDLM2, HFDL, Inmarsat L-Band, and Iridium messages.

We make extensive use of the [airframes](https://github.com/airframesio) work to make the messages more 'human-readable' as well as provide more detail for each of the messages.

Builds and runs on `amd64`, and `arm64` architectures.

## Table of Contents

- [sdr-enthusiasts/acarshub](#sdr-enthusiastsacarshub)
  - [Table of Contents](#table-of-contents)
  - [Prerequisites](#prerequisites)
  - [Supported tags and respective Dockerfiles](#supported-tags-and-respective-dockerfiles)
  - [Thanks](#thanks)
  - [Supported Decoders](#supported-decoders)
  - [Quick Start](#quick-start)
  - [Ports](#ports)
  - [Volumes / Database](#volumes--database)
  - [Environment variables](#environment-variables)
    - [General](#general)
    - [Logging](#logging)
    - [ADSB](#adsb)
    - [Connection Descriptor Format](#connection-descriptor-format)
    - [ACARS](#acars)
    - [VDLM2](#vdlm2)
    - [HFDL](#hfdl)
    - [Inmarsat L-Band](#inmarsat-l-band)
    - [Iridium](#iridium)
  - [Viewing the messages](#viewing-the-messages)
  - [Which frequencies should you monitor](#which-frequencies-should-you-monitor)
  - [A note about data sources used for the web site](#a-note-about-data-sources-used-for-the-web-site)
    - [The Fix](#the-fix)
    - [YAML Configuration for Ports](#yaml-configuration-for-ports)
  - [Getting Help](#getting-help)
  - [Legacy Versions](#legacy-versions)

## Prerequisites

New to Docker? You will need the following before getting started:

- A Linux computer capable of running Docker. A Raspberry Pi works well.
- At least one RTL-SDR dongle — two if you want to receive both ACARS and VDLM2 simultaneously. Something like [this](https://www.amazon.com/dp/B0129EBDS2) works, though most RTL-SDR devices are compatible.
- Docker and Docker Compose installed. See [installing docker and docker compose](https://github.com/sdr-enthusiasts/docker-install) for help, then return here when ready.

## Supported tags and respective Dockerfiles

- `latest` (`main` branch, `Dockerfile`)
- `latest-build-x` where `x` is the build number (`main` branch, `Dockerfile`)

## Thanks

Thanks to [mikenye](https://github.com/mikenye) for his excellent ADS-B Docker containers, which provided many of the ideas for this container's structure, and for his work in moving this project forward from its early days.

Additional thanks to the folks at [airframes.io](https://airframes.io) for their tireless work decoding and documenting ACARS messages and making that work available in usable packages.

Many others have contributed feedback, ideas, and time throughout the project's development — you have all made it better.

## Supported Decoders

External to ACARS Hub you need to be running an ACARS, VDLM2, HFDL, Inmarsat L-Band and/or Iridium decoder for ACARS Hub, and have that decoder connect to ACARS Hub to send over the messages for processing.

ACARS Hub supports three connection modes, configured via the `*_CONNECTIONS` environment variables (e.g. `ACARS_CONNECTIONS`, `VDLM_CONNECTIONS`). The recommended setup uses [acars_router](https://github.com/sdr-enthusiasts/acars_router) as an intermediary: decoders send their output to `acars_router`, which deduplicates, optionally stamps a station ID, and republishes the messages over ZMQ. ACARS Hub then subscribes to `acars_router`'s ZMQ serve ports to receive the cleaned data. See [Setting-Up-ACARSHub.MD](Setting-Up-ACARSHub.MD) for a complete example.

The three connection modes are:

- **UDP** (default): the container binds a UDP port and decoders (or `acars_router`) push data to it. Requires a host port mapping (e.g. `5550:5550/udp`). Use `ACARS_CONNECTIONS=udp` or `ACARS_CONNECTIONS=udp://0.0.0.0:5550`.
- **TCP**: the container connects outbound to a TCP server. `acars_router` exposes TCP serve ports at `15550`–`15558`. Use `ACARS_CONNECTIONS=tcp://acars_router:15550`.
- **ZMQ** (recommended): the container subscribes to a ZMQ PUB endpoint. `acars_router` exposes ZMQ serve ports at `45550`–`45558` (one per decoder type). Use `ACARS_CONNECTIONS=zmq://acars_router:45550`. No inbound port mapping is needed on the ACARS Hub side for TCP or ZMQ modes.

Multiple descriptors can be combined with commas for fan-in from several sources, e.g. `ACARS_CONNECTIONS=udp,zmq://acars_router:45550`.

The following decoders are supported:

- [acarsdec](https://github.com/TLeconte/acarsdec) or one of the forks of acarsdec. I suggest [the airframes fork](https://github.com/airframesio/acarsdec). Sends output to `acars_router` via UDP on port `5550`. Direct UDP to ACARS Hub also works: run with the option `-j youracarshubip:5550`, ensuring that port `5550` is mapped to the container if the source is external to your docker network.
- [dumpvdl2](https://github.com/szpajder/dumpvdl2). **ZMQ mode (recommended):** configure dumpvdl2 with `ZMQ_MODE=server` and `ZMQ_ENDPOINT=tcp://0.0.0.0:45555`; `acars_router` connects to it via `AR_RECV_ZMQ_VDLM2=dumpvdl2:45555`. **UDP mode:** run with `--output decoded:json:udp:address=<youracarshubip>,port=5555`, ensuring port `5555` is mapped.
- `vdlm2dec` (deprecated). Run the decoder with the option `--jsondump --jsondump-udp <youracarshubip>:5555`, ensuring that port `5555` is mapped to the container if the source is external to your docker network.
- [dumphfdl](https://github.com/szpajder/dumphfdl). Run the decoder with the option `--output decoded:json:udp:address=<youracarshubip>,port=5556`, ensuring that port `5556` is mapped to the container if the source is external to the docker network.
- [satdump](https://github.com/SatDump/SatDump). Run the decoder with the Inmarsat.json options for `udp_sinks` set to `"address": "127.0.0.1"` and `"port": "5557"` , ensuring that port `5557` is mapped to the container.
- [JAERO](https://github.com/jontio/JAERO). Run the decoder with the JSONdump format for UDP output.
- [gr-iridium](https://github.com/muccc/gr-iridium) and [iridium-toolkit](https://github.com/muccc/iridium-toolkit). Pipe the output of reassembler.py into something like `nc -u acarshub 5558`.

For ease of use I have provided docker images set up to work with ACARS Hub. This is the preferred way to get data in to ACARS Hub.

- [docker-acarsdec](https://github.com/sdr-enthusiasts/docker-acarsdec) for ACARS decoding.
- [docker-dumpvdl2](https://github.com/sdr-enthusiasts/docker-dumpvdl2) for VDLM decoding. This is the preferred decoder.
- `vdlm2dec` is technically supported, but upstream development have ceased, so no docker image is provided for it.
- [docker-dumphfdl](https://github.com/sdr-enthusiasts/docker-dumphfdl) for HFDL decoding.
- [docker-satdump](https://github.com/rpatel3001/docker-satdump) for Inmarsat L-Band decoding.
- [docker-jaero](https://github.com/sdr-enthusiasts/docker-jaero) for Inmarsat L-Band decoding.
- [docker-gr-iridium-toolkit](https://github.com/rpatel3001/docker-gr-iridium-toolkit) for Iridium decoding.
- [acars_router](https://github.com/sdr-enthusiasts/acars_router) for receiving, deduplicating, and routing messages from one or more decoders to one or more destinations. This is the **recommended** integration point for ACARS Hub. Decoders send to `acars_router`; ACARS Hub connects to `acars_router`'s ZMQ serve ports (`45550`–`45558`) to receive processed messages.

## Quick Start

Most configuration options below are not required to get started. See [Setting-Up-ACARSHub.MD](Setting-Up-ACARSHub.MD) for an example `docker-compose.yaml` with the minimum required settings.

## Ports

| Port       | Description                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------- |
| `80`       | Port used for the web interface                                                             |
| `5550/udp` | Default UDP port for receiving ACARS JSON data (used when `ACARS_CONNECTIONS=udp`)          |
| `5555/udp` | Default UDP port for receiving VDLM2 JSON data (used when `VDLM_CONNECTIONS=udp`)           |
| `5556/udp` | Default UDP port for receiving HFDL JSON data (used when `HFDL_CONNECTIONS=udp`)            |
| `5557/udp` | Default UDP port for receiving Inmarsat L-Band JSON data (used when `IMSL_CONNECTIONS=udp`) |
| `5558/udp` | Default UDP port for receiving Iridium JSON data (used when `IRDM_CONNECTIONS=udp`)         |

> **Note:** The TCP relay ports (`15550`–`15558`) that existed in earlier versions have been removed. The container no longer runs socat relay services. Use the `*_CONNECTIONS` environment variables to configure TCP or ZMQ outbound connections instead — no additional port mappings are required for those modes.

## Volumes / Database

Mount a volume to `/run/acars/` to persist the database across container restarts and upgrades. A `tmpfs` mount is also recommended to reduce SD card writes on Raspberry Pi deployments.

The database is pruned automatically; records older than 7 days are removed by default. On a moderately busy site, seven days of data can amount to over 100,000 rows (~17 MB). Search performance degrades noticeably at this scale on low-powered hardware, with queries on the search page taking a few seconds.

Setting `DB_SAVEALL=false` reduces storage by skipping messages that carry no informational fields, at the cost of an incomplete message log.

## Environment variables

There are quite a few configuration options this container can accept.

### General

| Variable               | Description                                                                                                                                                                                                                                                            | Required | Default |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| `DB_SAVEALL`           | By default the container will save all received messages in to a database, even if the message is a blank message. If you want to increase performance/decrease database size, set this option to `false` to only save messages with at least one informational field. | No       | `true`  |
| `DB_SAVE_DAYS`         | By default the container will save message data for 7 days. If you wish to over-ride this behavior, set this to the number of days you wish to have retained.                                                                                                          | No       | `7`     |
| `DB_ALERT_SAVE_DAYS`   | By default the container will save message data for 120 days. If you wish to over-ride this behavior, set this to the number of days you wish to have retained.                                                                                                        | No       | `120`   |
| `DB_BACKUP`            | Set to an absolute file path to open a second SQLite database that receives all the same writes as the primary. ACARS Hub only ever writes to it; management (backup, rotation) is left to you.                                                                        | No       | Blank   |
| `IATA_OVERRIDE`        | Override or add any custom IATA codes. Used for the web front end to show proper callsigns; See [below](#the-fix) on formatting and [more details](#a-note-about-data-sources-used-for-the-web-site) why this might be necessary.                                      | No       | Blank   |
| `ALLOW_REMOTE_UPDATES` | If you do not want to allow users to update the alert terms (and potentially other things in the future) via the web interface, set this to `False`                                                                                                                    | No       | `True`  |

### Logging

By default ACARS Hub will only show errors, warnings, and other kinds of critical messages in the logs. This can be changed by setting `MIN_LOG_LEVEL` to a higher number.

All processes are logged to the container's stdout. General logging can be viewed with `docker logs [-f] container`.

| Variable        | Description                                                                                                                                               | Required | Default |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| `MIN_LOG_LEVEL` | Acceptable values are `3-5`. `3` is `Warnings/Critical/Errors`, `4` adds `Informational messages` and `5` adds everything previous plus `debug` messages. | No       | `3`     |

### ADSB

The ACARS Hub website contains the ability to display ADSB targets along side ACARS messages. To enable this feature you need to have an available `aircraft.json` file generated from readsb and available on `tar1090webserverurl/data/aircraft.json`. [SDR-Enthusiasts tar1090](https://github.com/sdr-enthusiasts/docker-tar1090)/[SDR-Enthusiasts Ultrafeeder (recommended)](https://github.com/sdr-enthusiasts/docker-adsb-ultrafeeder) is the recommended container to run to easily get this data. By turning this on you will get a map that shows the ADSB targets picked up by your readsb instance and enable you to click on planes to see what messages they've sent.

The following options will set the options for ADSB

| Variable              | Description                                                                                                                                                                                                                                                 | Required                         | Default                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------- |
| `ENABLE_ADSB`         | Turns on ADSB in ACARS Hub                                                                                                                                                                                                                                  | Yes, if you want to monitor ADSB | `false`                             |
| `ADSB_URL`            | The IP address or URL for your tar1090 instance                                                                                                                                                                                                             | No (see note below)              | `http://tar1090/data/aircraft.json` |
| `ADSB_LAT`            | The latitude of your ADSB site                                                                                                                                                                                                                              | No, but recommended              | 0                                   |
| `ADSB_LON`            | The longitude of your ADSB site                                                                                                                                                                                                                             | No, but recommended              | 0                                   |
| `DISABLE_RANGE_RINGS` | Turn off range rings on your map. Set to `true` to disable range rings.                                                                                                                                                                                     | No                               | `false`                             |
| `HEYWHATSTHAT`        | Your [Hey What's That](https://www.heywhatsthat.com/) site ID token (e.g. `NN6R7EXG`). When set, the live map displays estimated antenna coverage outlines. Data is fetched once at startup and cached; re-fetched only when the token or altitudes change. | No                               | Blank (feature disabled)            |
| `HEYWHATSTHAT_ALTS`   | Comma-separated list of altitudes in feet for coverage outlines (e.g. `10000,20000,30000`). Each altitude produces one ring on the map.                                                                                                                     | No                               | `10000,30000`                       |

If you run tar1090/ultrafeeder container on the same machine as ACARS Hub then the default value for `ADSB_URL` is fine. If you don't, the formatting for `ADSB_URL` should be the full URL path to `aircraft.json` from your readsb source.

Testing the ADSB_URL. The URL is served via the container (nginx reverse proxy), so to test what's
wrong if it doesn't work, you can test loading the json from within the container and check for
errors:

```shell
docker exec -it acarshub with-contenv bash
echo "$ADSB_URL"
curl "$ADSB_URL" -sS | cat | head -n3
```

For enhanced ADS-B and ACARS message matching (coloured aircraft icons on the Live Map), enable the following option in your tar1090 or ultrafeeder container:

```yaml
- TAR1090_ENABLE_AC_DB=true
```

In the configuration options for tar1090. Setting this will include additional aircraft information in the `aircraft.json` file that is not normally part of the ADSB broadcast, such as the aircraft's tail number and aircraft type. Please enable this with caution: there is increased memory usage in the tar1090 container so RAM constrained systems should be cautious enabling this.

### Connection Descriptor Format

The `*_CONNECTIONS` variables accept a comma-separated list of one or more **connection descriptors**. Each descriptor selects a protocol and a target:

| Form                   | Example                    | Behaviour                                                                                                                                                     |
| ---------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `udp`                  | `udp`                      | Bind the default UDP port for this decoder type on all interfaces (see defaults below). Decoders push datagrams to ACARS Hub. **Host port mapping required.** |
| `udp://bind-addr:port` | `udp://0.0.0.0:5550`       | Bind a specific address and UDP port. `bind-addr` may be an IPv4 address or `*` for all interfaces. **Host port mapping required.**                           |
| `tcp://host:port`      | `tcp://acars_router:15550` | ACARS Hub connects outbound to a TCP server at `host:port`. Reconnects automatically on disconnect. **No host port mapping needed.**                          |
| `zmq://host:port`      | `zmq://acars_router:45550` | ACARS Hub subscribes to a ZMQ PUB socket at `host:port`. Reconnection is handled by libzmq. **No host port mapping needed.**                                  |

**Default UDP ports** (used by the bare `udp` descriptor):

| Decoder | Default UDP Port |
| ------- | ---------------- |
| ACARS   | `5550`           |
| VDLM2   | `5555`           |
| HFDL    | `5556`           |
| IMSL    | `5557`           |
| IRDM    | `5558`           |

**`acars_router` reference ports** — when using `acars_router` as the intermediary:

| Decoder | ZMQ serve port (use with `zmq://`) | TCP serve port (use with `tcp://`) |
| ------- | ---------------------------------- | ---------------------------------- |
| ACARS   | `45550`                            | `15550`                            |
| VDLM2   | `45555`                            | `15555`                            |
| HFDL    | `45556`                            | `15556`                            |
| IMSL    | `45557`                            | `15557`                            |
| IRDM    | `45558`                            | `15558`                            |

**Fan-in example** — receive from two sources simultaneously:

```yaml
- ACARS_CONNECTIONS=udp,zmq://acars_router:45550
```

Both descriptors feed the same internal pipeline. The built-in deduplication layer discards any message that arrives via both paths.

### ACARS

| Variable            | Description                                                                                                                                                                                                                                                                                                                 | Required | Default |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| `ENABLE_ACARS`      | Toggle ACARS decoding on. Set to `true` to enable ACARS processing in the container. **Note:** The legacy value `external` is deprecated but still supported for backward compatibility.                                                                                                                                    | No       | `false` |
| `ACARS_CONNECTIONS` | Comma-separated connection descriptor(s) for receiving ACARS data. See [Connection Descriptor Format](#connection-descriptor-format) for syntax. Recommended value when using `acars_router`: `zmq://acars_router:45550`. Default binds UDP port 5550; a host port mapping (`5550:5550/udp`) is required for UDP mode only. | No       | `udp`   |

### VDLM2

| Variable           | Description                                                                                                                                                                                                                                            | Required | Default |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------- |
| `ENABLE_VDLM`      | Toggle VDLM decoding on. Set to `true` to enable VDLM processing in the container. **Note:** The legacy value `external` is deprecated but still supported for backward compatibility.                                                                 | No       | `false` |
| `VDLM_CONNECTIONS` | Comma-separated connection descriptor(s) for receiving VDLM2 data. See [Connection Descriptor Format](#connection-descriptor-format) for syntax. Recommended value when using `acars_router`: `zmq://acars_router:45555`. Default binds UDP port 5555. | No       | `udp`   |

### HFDL

| Variable           | Description                                                                                                                                                                                                                                           | Required | Default |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| `ENABLE_HFDL`      | Toggle HFDL decoding on. Set to `true` to enable HFDL processing in the container. **Note:** The legacy value `external` is deprecated but still supported for backward compatibility.                                                                | No       | `false` |
| `HFDL_CONNECTIONS` | Comma-separated connection descriptor(s) for receiving HFDL data. See [Connection Descriptor Format](#connection-descriptor-format) for syntax. Recommended value when using `acars_router`: `zmq://acars_router:45556`. Default binds UDP port 5556. | No       | `udp`   |

### Inmarsat L-Band

| Variable           | Description                                                                                                                                                                                                                                                      | Required | Default |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| `ENABLE_IMSL`      | Toggle Inmarsat L-Band decoding on. Set to `true` to enable IMSL processing in the container. **Note:** The legacy value `external` is deprecated but still supported for backward compatibility.                                                                | No       | `false` |
| `IMSL_CONNECTIONS` | Comma-separated connection descriptor(s) for receiving Inmarsat L-Band data. See [Connection Descriptor Format](#connection-descriptor-format) for syntax. Recommended value when using `acars_router`: `zmq://acars_router:45557`. Default binds UDP port 5557. | No       | `udp`   |

### Iridium

| Variable           | Description                                                                                                                                                                                                                                              | Required | Default |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| `ENABLE_IRDM`      | Toggle Iridium decoding on. Set to `true` to enable IRDM processing in the container. **Note:** The legacy value `external` is deprecated but still supported for backward compatibility.                                                                | No       | `false` |
| `IRDM_CONNECTIONS` | Comma-separated connection descriptor(s) for receiving Iridium data. See [Connection Descriptor Format](#connection-descriptor-format) for syntax. Recommended value when using `acars_router`: `zmq://acars_router:45558`. Default binds UDP port 5558. | No       | `udp`   |

## Viewing the messages

ACARS Hub serves a web interface on port `80` that displays messages in real time.

## Which frequencies should you monitor

The [Airframes.io](https://app.airframes.io/about) website maintains a community-sourced frequency list for ACARS and VDLM, with regional breakdowns. The example compose file uses a set of US frequencies with reasonable traffic; adjust them for your region.

A few constraints to keep in mind:

- `acarsdec` supports up to 16 frequencies simultaneously; `dumpvdl2` has no hard limit beyond available CPU.
- All frequencies for a single decoder instance must fall within a 2 MHz span.

## A note about data sources used for the web site

ACARS/VDLM broadcasts that include a callsign use a two-letter airline code. A brief primer on the code systems:

- **IATA** codes are two-letter airline identifiers. Some airlines do not have an assigned IATA code and use an internal code instead.
- **ICAO** codes are three-letter identifiers standardised internationally and unique worldwide.

ACARS Hub includes a bundled database that maps IATA codes to ICAO codes and full airline names, sourced from publicly available data. The data has known limitations:

- **Merged airlines:** When a carrier is absorbed through a merger (e.g. America West/US/AWE into American Airlines/AA/AAL), aircraft from the acquired fleet may still broadcast the legacy IATA code. Some of the more common cases have been corrected where the legacy code is no longer assigned to another carrier.
- **Non-standard codes:** Some airlines (UPS and FedEx notably) do not use their designated IATA codes, or operate contracted aircraft that broadcast a different carrier code.
- **Regional code overlap:** IATA divides the world into three regions, and the same two-letter code may be assigned to different airlines in different regions. The bundled database may resolve a code to the wrong carrier for your region.

The practical effect is that callsigns will occasionally be wrong, particularly outside the US. As a well-known example, UPS messages may display as `BHSxxxx/BahamasAir`. When a callsign is incorrectly mapped, the FlightAware link will point to the wrong flight; the tail number link is unaffected.

Because ACARS Hub is used globally, the bundled database is intentionally conservative about overrides. Use `IATA_OVERRIDE` to correct mappings for your region.

### The Fix

Set the `IATA_OVERRIDE` environment variable to correct callsign mappings for your region.

Format: `IATA|ICAO|Airline Name`

Separate multiple overrides with a semicolon:

```shell
IATA_OVERRIDE=UP|UPS|United Parcel Service;US|AAL|American Airlines
```

US operators: `UP|UPS|United Parcel Service` is a common starting point.

If you find mappings that are incorrect or missing, contributions via pull request are welcome.

### YAML Configuration for Ports

The ports you need to expose depend on your chosen connection mode:

**UDP mode** (default — decoders push data to ACARS Hub):

```yaml
ports:
  - 80:80
  - 5550:5550/udp # ACARS — only needed when ACARS_CONNECTIONS=udp
  - 5555:5555/udp # VDLM2 — only needed when VDLM_CONNECTIONS=udp
  - 5556:5556/udp # HFDL  — only needed when HFDL_CONNECTIONS=udp
  - 5557:5557/udp # IMSL  — only needed when IMSL_CONNECTIONS=udp
  - 5558:5558/udp # IRDM  — only needed when IRDM_CONNECTIONS=udp
```

**TCP or ZMQ mode** (ACARS Hub connects outbound to decoders):

```yaml
ports:
  - 80:80
  # No decoder ports needed — the container connects out to the decoders
```

> **Note:** The TCP relay ports (`15550`–`15558`) from earlier versions have been removed. The container no longer runs socat relay services; use `tcp://` or `zmq://` descriptors in the `*_CONNECTIONS` variables to achieve equivalent connectivity.

## Getting Help

You can [log an issue](https://github.com/sdr-enthusiasts/docker-acarshub/issues) on the project's GitHub or visit the [discord](https://discord.gg/sTf9uYF) server.

## Legacy Versions

The current major release version of ACARS Hub is version 4. If you need to continue running version 3 for whatever reason, you can pull the latest version 3 image with `docker pull ghcr.io/sdr-enthusiasts/docker-acarshub:latest-build-1477`. Please note that version 3 is no longer being developed and will not receive any updates, including security updates. It is recommended to upgrade to version 4 as soon as possible.

In addition, v3 (mostly) supported `armhf`/`armv7` architecture, but that support was dropped at the very end of the v3 lifecycle, and was never supported for v4. If you need to run on `armhf`/`armv7` architecture `docker pull ghcr.io/sdr-enthusiasts/docker-acarshub:latest-build-1461`.
