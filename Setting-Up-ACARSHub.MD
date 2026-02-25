# Setting Up ACARS Hub

## Purpose

This document is designed to show the most common `docker-compose.yaml` setup that requires
minimal, if any, modifications.

### Migrating from earlier v4 releases

If you are running an earlier version of v4 that used `acars_router` with UDP forwarding into
ACARS Hub, the setup has been updated. ACARS Hub now connects directly to `acars_router` via
ZMQ using the `*_CONNECTIONS` environment variables, which eliminates the need to expose UDP
decoder ports on ACARS Hub for the common case. The `acars_router` container remains the
recommended integration point as it handles deduplication, station ID stamping, and
multi-destination fanout.

## How This Setup Works

The recommended data flow is:

```text
acarsdec  ──UDP──► ┐
dumpvdl2  ──ZMQ──► │  acars_router  ──ZMQ──►  acarshub
dumphfdl  ──UDP──► ┘       │
                            └──UDP/TCP──►  feed.airframes.io (optional)
```

1. Each decoder sends its output to `acars_router`.
2. `acars_router` deduplicates messages, optionally stamps a station ID, and republishes them.
3. ACARS Hub subscribes to `acars_router`'s ZMQ serve ports to receive the processed messages.
   No inbound decoder ports need to be mapped on the ACARS Hub container.

## Connection Modes

ACARS Hub receives decoder data via the `ACARS_CONNECTIONS`, `VDLM_CONNECTIONS`,
`HFDL_CONNECTIONS`, `IMSL_CONNECTIONS`, and `IRDM_CONNECTIONS` environment variables. See the
[README](README.md#connection-descriptor-format) for the full URI syntax reference.

| Mode              | Example value              | When to use                                                                          |
| ----------------- | -------------------------- | ------------------------------------------------------------------------------------ |
| **ZMQ** (default) | `zmq://acars_router:45550` | Subscribe to `acars_router`'s ZMQ serve port. No inbound port mapping needed.        |
| **TCP**           | `tcp://acars_router:15550` | Connect outbound to `acars_router`'s TCP serve port. No inbound port mapping needed. |
| **UDP**           | `udp`                      | Bind a UDP port; decoders push datagrams directly. Requires a host port mapping.     |

`acars_router` exposes the following ports for ACARS Hub to connect to:

| Decoder       | ZMQ serve port | TCP serve port |
| ------------- | -------------- | -------------- |
| ACARS         | `45550`        | `15550`        |
| VDLM2         | `45555`        | `15555`        |
| HFDL          | `45556`        | `15556`        |
| Inmarsat IMSL | `45557`        | `15557`        |
| Iridium IRDM  | `45558`        | `15558`        |

## How to do the setup

Save the following `docker-compose.yaml` to a machine with Docker installed, then make the
changes listed below:

**ACARS Hub:**

- If you intend to feed VDLM, change `ENABLE_VDLM=false` to `ENABLE_VDLM=true`
- If you intend to feed ACARS, change `ENABLE_ACARS=false` to `ENABLE_ACARS=true`
- The `*_CONNECTIONS` variables are pre-set to connect to `acars_router` via ZMQ on the
  correct ports. Only change these if you are not using `acars_router`.
- If you are in the United States, uncomment the `IATA_OVERRIDE` line to correct common
  callsign mappings for US carriers.
- If you have a source of `tar1090` ADSB data and want to enable the ADSB visualizations:
  - Remove the `#` from the start of the line with `ENABLE_ADSB`
  - Remove the `#` from the lines `ADSB_LAT`/`ADSB_LON` and set each value appropriately
  - If you are **_NOT_** running `tar1090` on the same machine as ACARS Hub:
    - Remove the `#` from the `ADSB_URL` line and set the value to the **_FULL_** URL to the
      `aircraft.json` data, e.g. `http://192.168.1.100/data/aircraft.json`

**`acars_router`:**

- Set `AR_OVERRIDE_STATION_NAME` to a name that identifies your station (e.g. your callsign
  or location). This is stamped on every message before it is forwarded.
- If you want to feed [Airframes.io](https://airframes.io), uncomment the `AR_SEND_*` lines
  for each decoder type you are running.
- If you are running HFDL (`dumphfdl`), IMSL (`satdump`/`jaero`), or IRDM (`gr-iridium`),
  add the corresponding `AR_RECV_*` lines following the same pattern as the VDLM2 example.

**`acarsdec`** (ACARS decoder):

- Set the serial number to your RTL-SDR device after the `=` on the line `SERIAL`
- Alter the frequencies if needed
- Set your feed ID

Otherwise remove the `acarsdec` section.

**`dumpvdl2`** (VDLM2 decoder):

- Set the serial number to your RTL-SDR device after the `=` on the line `SERIAL`
- Alter the frequencies if needed. Frequencies must be 9 digits long and contain no period
- Set your feed ID

Otherwise remove the `dumpvdl2` section.

### docker-compose.yaml

```yaml
services:
  acarshub:
    image: ghcr.io/sdr-enthusiasts/docker-acarshub:latest
    container_name: acarshub
    restart: always
    ports:
      - 8080:80
      # UDP ports are NOT needed when using zmq:// or tcp:// connection modes.
      # Uncomment and map a UDP port only if you change a *_CONNECTIONS value to "udp".
      # - 5550:5550/udp
      # - 5555:5555/udp
    volumes:
      - ./acars_data:/run/acars
    tmpfs:
      - /database:exec,size=64M
      - /run:exec,size=64M
      - /var/log:size=64M
    environment:
      - TZ=Etc/UTC
      - ENABLE_ACARS=false
      - ENABLE_VDLM=false
      # Connect to acars_router's ZMQ serve ports to receive processed messages.
      # Change 45550/45555 only if you have customised acars_router's AR_SERVE_ZMQ_* ports.
      - ACARS_CONNECTIONS=zmq://acars_router:45550
      - VDLM_CONNECTIONS=zmq://acars_router:45555
      # Uncomment and enable these if you are also decoding HFDL, IMSL, or IRDM:
      # - ENABLE_HFDL=true
      # - HFDL_CONNECTIONS=zmq://acars_router:45556
      # - ENABLE_IMSL=true
      # - IMSL_CONNECTIONS=zmq://acars_router:45557
      # - ENABLE_IRDM=true
      # - IRDM_CONNECTIONS=zmq://acars_router:45558
      - MIN_LOG_LEVEL=3
  #      - IATA_OVERRIDE=UP|UPS|United Parcel Service;GS|FTH|Mountain Aviation (Foothills);GS|EJA|ExecJet
  #      - ENABLE_ADSB=true
  #      - ADSB_LAT=
  #      - ADSB_LON=
  #      - ADSB_URL=

  acars_router:
    image: ghcr.io/sdr-enthusiasts/acars_router:latest
    container_name: acars_router
    restart: always
    tmpfs:
      - /run:exec,size=64M
      - /var/log:size=64M
    environment:
      - TZ=Etc/UTC
      # Stamp all outgoing messages with your station name.
      - AR_OVERRIDE_STATION_NAME=MY-STATION
      # Deduplicate messages that arrive via multiple paths.
      - AR_ENABLE_DEDUPE=true
      #
      # ── Inbound connections ──────────────────────────────────────────────────
      #
      # acars_router automatically listens for ACARS on UDP port 5550 and VDLM2
      # on UDP port 5555 by default. acarsdec sends directly to acars_router
      # over UDP so no extra configuration is needed for ACARS ingest.
      #
      # Receive VDLM2 from dumpvdl2 via ZMQ. dumpvdl2 must be configured with
      # ZMQ_MODE=server and ZMQ_ENDPOINT=tcp://0.0.0.0:45555.
      - AR_RECV_ZMQ_VDLM2=dumpvdl2:45555
      #
      # ── Outbound: feed Airframes.io (optional) ───────────────────────────────
      # Uncomment the lines for the decoder types you are running.
      #
      # - AR_SEND_UDP_ACARS=feed.airframes.io:5550
      # - AR_SEND_TCP_VDLM2=feed.airframes.io:5553
      # - AR_SEND_TCP_HFDL=feed.airframes.io:5556
      #
      # ── ZMQ serve ports (acarshub subscribes to these) ───────────────────────
      # These are the defaults. Only set them if you need non-standard ports.
      # - AR_SERVE_ZMQ_ACARS=45550
      # - AR_SERVE_ZMQ_VDLM2=45555
      # - AR_SERVE_ZMQ_HFDL=45556
      # - AR_SERVE_ZMQ_IMSL=45557
      # - AR_SERVE_ZMQ_IRDM=45558

  ### Remove this section if you are NOT decoding ACARS
  acarsdec:
    image: ghcr.io/sdr-enthusiasts/docker-acarsdec:latest
    container_name: acarsdec
    restart: always
    environment:
      - QUIET_LOGS=true
      - TZ=Etc/UTC
      - SERIAL=
      - GAIN=-10
      - PPM=0
      - FREQUENCIES=130.025;130.450;131.125;131.550
      - FEED_ID=
      # Send ACARS output to acars_router over UDP (acars_router listens on 5550 by default).
      - OUTPUT_SERVER=acars_router
      - OUTPUT_SERVER_mode=udp
    tmpfs:
      - /run:exec,size=64M
      - /var/log:size=64M
    device_cgroup_rules:
      - "c 189:* rwm"
    volumes:
      - /dev/bus/usb:/dev/bus/usb:ro
  #####

  ### Remove this section if you are NOT decoding VDLM2
  dumpvdl2:
    image: ghcr.io/sdr-enthusiasts/docker-dumpvdl2:latest
    container_name: dumpvdl2
    restart: always
    environment:
      - QUIET_LOGS=true
      - TZ=Etc/UTC
      - SERIAL=
      - GAIN=40.0
      - PPM=0
      - FREQUENCIES=136650000;136700000;136975000;136925000;136800000
      - FEED_ID=
      - VDLM_FILTER_ENABLE=true
      # Expose a ZMQ PUB endpoint so that acars_router can subscribe to it.
      # acars_router uses AR_RECV_ZMQ_VDLM2=dumpvdl2:45555 to connect here.
      - ZMQ_MODE=server
      - ZMQ_ENDPOINT=tcp://0.0.0.0:45555
    tmpfs:
      - /run:exec,size=64M
      - /var/log:size=64M
    device_cgroup_rules:
      - "c 189:* rwm"
    volumes:
      - /dev/bus/usb:/dev/bus/usb:ro
  #####
```

## Setting Up acars_router

[acars_router](https://github.com/sdr-enthusiasts/acars_router) is the recommended way to
get data into ACARS Hub. It receives messages from one or more decoders, deduplicates them,
optionally stamps a station name, and republishes them on a set of well-known ports that ACARS
Hub (and other consumers) can subscribe to.

### How acars_router receives data

`acars_router` can accept incoming data in several ways. The most common patterns are:

| Source        | acars_router variable         | Description                                                                                                          |
| ------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| UDP push      | _(automatic)_                 | `acars_router` listens on UDP 5550 (ACARS), 5555 (VDLM2), etc. by default. Decoders simply push UDP datagrams to it. |
| TCP push      | _(automatic)_                 | `acars_router` listens on TCP 5550, 5555, etc. by default.                                                           |
| ZMQ subscribe | `AR_RECV_ZMQ_VDLM2=host:port` | `acars_router` connects to a ZMQ PUB socket on the decoder (e.g. dumpvdl2 port 45555) and subscribes.                |
| TCP connect   | `AR_RECV_TCP_ACARS=host:port` | `acars_router` connects outbound to a TCP server to pull messages.                                                   |

### How acars_router serves data

By default `acars_router` publishes processed messages on these ports:

| Decoder       | ZMQ serve port | TCP serve port | Description                                                 |
| ------------- | -------------- | -------------- | ----------------------------------------------------------- |
| ACARS         | `45550`        | `15550`        | ACARS Hub sets `ACARS_CONNECTIONS=zmq://acars_router:45550` |
| VDLM2         | `45555`        | `15555`        | ACARS Hub sets `VDLM_CONNECTIONS=zmq://acars_router:45555`  |
| HFDL          | `45556`        | `15556`        | ACARS Hub sets `HFDL_CONNECTIONS=zmq://acars_router:45556`  |
| Inmarsat IMSL | `45557`        | `15557`        | ACARS Hub sets `IMSL_CONNECTIONS=zmq://acars_router:45557`  |
| Iridium IRDM  | `45558`        | `15558`        | ACARS Hub sets `IRDM_CONNECTIONS=zmq://acars_router:45558`  |

> **Note:** The ZMQ serve ports (45xxx) are different from the ZMQ ingest/listen ports
> (35xxx). The 35xxx ports are where external ZMQ clients can push messages **into**
> `acars_router`. The 45xxx ports are where `acars_router` publishes messages **out** for
> subscribers like ACARS Hub. Always use 45xxx in `*_CONNECTIONS`.

### Feeding multiple destinations

One of the main reasons to use `acars_router` is to send the same decoded data to multiple
destinations simultaneously. For example, to feed both ACARS Hub and
[Airframes.io](https://airframes.io):

```yaml
environment:
  - AR_SEND_UDP_ACARS=feed.airframes.io:5550
  - AR_SEND_TCP_VDLM2=feed.airframes.io:5553
  - AR_SEND_TCP_HFDL=feed.airframes.io:5556
```

Multiple destinations for the same type are separated with a semicolon:

```yaml
- AR_SEND_UDP_ACARS=feed.airframes.io:5550;anotherhost:5550
```

### Key acars_router environment variables

| Variable                   | Default | Description                                                                                            |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `AR_OVERRIDE_STATION_NAME` | unset   | Stamps this string as the station ID on every outgoing message.                                        |
| `AR_ENABLE_DEDUPE`         | `false` | Enable message deduplication. Recommended when receiving from multiple sources.                        |
| `AR_DEDUPE_WINDOW`         | `2`     | Seconds a message is held for deduplication after first receipt.                                       |
| `AR_RECV_ZMQ_VDLM2`        | unset   | `host:port` of a ZMQ PUB socket to subscribe to for VDLM2 messages (e.g. `dumpvdl2:45555`).            |
| `AR_RECV_ZMQ_ACARS`        | unset   | `host:port` of a ZMQ PUB socket to subscribe to for ACARS messages.                                    |
| `AR_RECV_ZMQ_HFDL`         | unset   | `host:port` of a ZMQ PUB socket to subscribe to for HFDL messages.                                     |
| `AR_SEND_UDP_ACARS`        | unset   | `host:port` to send ACARS messages to via UDP. Separate multiple with `;`.                             |
| `AR_SEND_UDP_VDLM2`        | unset   | `host:port` to send VDLM2 messages to via UDP. Separate multiple with `;`.                             |
| `AR_SEND_TCP_VDLM2`        | unset   | `host:port` to send VDLM2 messages to via TCP. Separate multiple with `;`.                             |
| `AR_SEND_TCP_HFDL`         | unset   | `host:port` to send HFDL messages to via TCP. Separate multiple with `;`.                              |
| `AR_SERVE_ZMQ_ACARS`       | `45550` | ZMQ port on which `acars_router` publishes ACARS messages. Must match `ACARS_CONNECTIONS` in acarshub. |
| `AR_SERVE_ZMQ_VDLM2`       | `45555` | ZMQ port on which `acars_router` publishes VDLM2 messages. Must match `VDLM_CONNECTIONS` in acarshub.  |

For the full list of variables see the
[acars_router README](https://github.com/sdr-enthusiasts/acars_router).

## Further configuration

Most users need only a handful of changes to the compose file above to get started. ACARS Hub
has additional configuration options beyond what is shown here — see the
[README](README.md) for the full reference.
