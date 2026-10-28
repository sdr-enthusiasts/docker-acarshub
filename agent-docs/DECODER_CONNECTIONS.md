# ACARS Hub - Decoder Connection Architecture

> **Implementation status: COMPLETE** — All components implemented, all tests passing, `just ci` green.

This document is the authoritative reference for how ACARS Hub receives data from external
decoder processes (acarsdec, vdlm2dec, dumpvdl2, dumphfdl, satdump, JAERO, gr-iridium,
xng, acars_router, etc.).

## Why This Architecture Exists

### The Old Model (Retired)

The original design used a two-process relay chain managed by s6-overlay for each decoder type:

1. **`<type>_server`** — a `socat` + `ncat` pipeline that listened on a UDP port and
   re-broadcast the stream on a TCP port. The sole reason this existed was fan-out: multiple
   consumers needed to tap the same UDP stream simultaneously.
2. **`<type>_stats`** — a second `socat` process that connected to the TCP fan-out port and
   wrote rolling 5-minute JSON capture files to `/database/`.
3. **`generate_stats`** — a shell loop that counted those capture files and wrote
   `/webapp/data/stats.json` every 60 seconds for external consumers.

This chain was overengineered. The Node.js backend was the only real consumer of the data
stream; the stats consumers exist purely to feed a file that Node.js's `timeseries_stats`
table already supersedes. Worse, the relay chain made it impossible to connect to non-UDP
sources (TCP, ZMQ) without adding yet more socat wrappers.

### The New Model

Node.js owns the transport layer directly. Each decoder type can be configured with one or
more connection descriptors. The backend opens the appropriate socket(s), receives JSON
frames, and feeds them into the existing `MessageQueue` pipeline. No relay processes, no
intermediate files.

Fan-in is a first-class feature: multiple connection descriptors for the same decoder type
all feed the same pipeline, enabling scenarios like receiving from both a local decoder over
UDP and a remote aggregator over TCP simultaneously.

---

## Environment Variable Specification

### Variable Names

One variable per decoder type:

| Decoder | Variable            |
| ------- | ------------------- |
| ACARS   | `ACARS_CONNECTIONS` |
| VDL-M2  | `VDLM_CONNECTIONS`  |
| HFDL    | `HFDL_CONNECTIONS`  |
| IMS-L   | `IMSL_CONNECTIONS`  |
| IRDM    | `IRDM_CONNECTIONS`  |
| xng     | `XNG_CONNECTIONS`   |

`ENABLE_<TYPE>` continues to gate whether a listener is created at all. If
`ENABLE_ACARS=false`, then `ACARS_CONNECTIONS` is ignored. `ENABLE_XNG` (default `false`)
gates `XNG_CONNECTIONS` the same way.

`XNG` is an **ingest-only** type. xng emits one JSON envelope per message for every air
interface it decodes, so the XNG listener carries traffic for several carriers. Before an
envelope reaches the `MessageQueue` it is re-labelled to its carrier `MessageType` by the
envelope `mode`:

| xng `mode`         | Re-labelled as     |
| ------------------ | ------------------ |
| `acars_poa`        | `ACARS`            |
| `vdl2`             | `VDLM2`            |
| `hfdl`             | `HFDL`             |
| `aero_l`, `aero_c` | `IMSL`             |
| `iridium`          | `IRDM`             |
| anything else      | dropped at ingest  |

Downstream of the listeners (queue, stats, DB, search, Socket.IO) `XNG` never appears; an xng
VDL2 message is a VDLM2 message. Payloads on the XNG listener that are not valid xng envelopes
are dropped.

The carrier `ENABLE_<TYPE>` flags gate their own listeners only, not xng-fed traffic. When an
xng envelope arrives for a carrier whose flag is off, that carrier is **auto-enabled** at
runtime and stays enabled until the process restarts. See the `BackgroundServices` section
below.

### Value Format

A comma-separated list of one or more **connection descriptors**. Whitespace around commas is
ignored.

```text
<descriptor>[,<descriptor>...]
```

### Connection Descriptor Grammar

```text
descriptor    = udp-bare | udp-uri | tcp-uri | zmq-uri

udp-bare      = "udp"
udp-uri       = "udp://" bind-addr ":" port
tcp-uri       = "tcp://" host ":" port
zmq-uri       = "zmq://" host ":" port

bind-addr     = ip4-addr | "*"        ; address to bind the UDP socket to
host          = hostname | ip4-addr   ; remote host to connect to
port          = 1*DIGIT               ; TCP/UDP port number 1-65535
```

The bare `udp` token is shorthand for binding the default port for that decoder type on all
interfaces. It is equivalent to `udp://0.0.0.0:<default-port>` where default ports are:

| Decoder | Default UDP Port |
| ------- | ---------------- |
| ACARS   | 5550             |
| VDLM    | 5555             |
| HFDL    | 5556             |
| IMSL    | 5557             |
| IRDM    | 5558             |
| XNG     | 5559             |

### Descriptor Semantics

| Descriptor                    | Node.js behaviour                                                                                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `udp` / `udp://<bind>:<port>` | Opens a `dgram` UDP socket bound to the specified address and port. Receives incoming datagrams. "Connected" means the socket is successfully bound.                                               |
| `tcp://<host>:<port>`         | Opens a `net.Socket` TCP connection to the specified remote host and port. Reconnects automatically on disconnect. "Connected" mirrors socket state.                                               |
| `zmq://<host>:<port>`         | Opens a ZMQ `SUB` socket and connects to `tcp://<host>:<port>`. Subscribes to all topics (`""`). The payload is the **last frame** of each multipart message. Reconnection is handled by libzmq internally. "Connected" is tracked by the ZMQ monitor socket. |

### Default Values (set in Dockerfile)

```dockerfile
ENV ACARS_CONNECTIONS="udp" \
    VDLM_CONNECTIONS="udp"  \
    HFDL_CONNECTIONS="udp"  \
    IMSL_CONNECTIONS="udp"  \
    IRDM_CONNECTIONS="udp"  \
    XNG_CONNECTIONS="udp"
```

---

## Configuration Examples

### Legacy-compatible UDP (default behaviour)

```yaml
environment:
  - ENABLE_ACARS=true
  - ACARS_CONNECTIONS=udp
```

Identical to the old default. Binds UDP port 5550. acars_router sends to `acarshub:5550`.

### Single TCP source

```yaml
environment:
  - ENABLE_ACARS=true
  - ACARS_CONNECTIONS=tcp://acars_router:15550
```

Node.js connects outbound to `acars_router:15550`. No UDP port is opened. No `EXPOSE` entry
is required for port 5550.

### Single ZMQ source (direct from decoder)

```yaml
environment:
  - ENABLE_VDLM=true
  - VDLM_CONNECTIONS=zmq://dumpvdl2:45555
```

Node.js subscribes to the ZMQ PUB endpoint that dumpvdl2 exposes when configured with
`ZMQ_MODE=server` and `ZMQ_ENDPOINT=tcp://0.0.0.0:45555`.

### ZMQ source via acars_router

```yaml
environment:
  - ENABLE_ACARS=true
  - ACARS_CONNECTIONS=zmq://acars_router:35550
```

acars_router republishes aggregated ACARS messages on ZMQ port 35550.

### Fan-in: multiple sources for the same decoder type

```yaml
environment:
  - ENABLE_ACARS=true
  # Receive from local acarsdec over UDP AND from a remote aggregator over TCP
  - ACARS_CONNECTIONS=udp,tcp://remote-acars-router:15550
```

Both connections feed the same `MessageQueue`. The existing database deduplication layer
handles any messages that arrive via both paths simultaneously.

### Override UDP bind address and port

```yaml
environment:
  - ENABLE_ACARS=true
  - ACARS_CONNECTIONS=udp://0.0.0.0:9550
```

Useful when the default port conflicts with another service on the host.

### Mixed protocol fan-in

```yaml
environment:
  - ENABLE_VDLM=true
  # Local dumpvdl2 via ZMQ, plus a remote vdlm2dec instance via UDP
  - VDLM_CONNECTIONS=zmq://dumpvdl2:45555,udp://0.0.0.0:5555
```

### xng via acars_router

```yaml
environment:
  - ENABLE_XNG=true
  - XNG_CONNECTIONS=udp
```

xng outputs envelopes over ZMQ only. acars_router subscribes with
`AR_RECV_ZMQ_XNG=xng:5555` and forwards with `AR_SEND_UDP_XNG=acarshub:5559`. The hub binds
the default XNG UDP port 5559. `ENABLE_ACARS`, `ENABLE_VDLM`, etc. are not required for the
carriers xng feeds; they auto-enable on first message.

### xng direct (hub subscribes to xng)

```yaml
environment:
  - ENABLE_XNG=true
  - XNG_CONNECTIONS=zmq://xng:5555
```

The port must match xng's `--zmq` / `XNG_ZMQ` endpoint. xng publishes `[topic, json]`
multipart messages; `ZmqListener` takes the last frame, so no intermediary is needed.

---

## Retired Environment Variables

The following variables are removed and no longer have any effect:

| Retired Variable  | Replacement         |
| ----------------- | ------------------- |
| `FEED_ACARS_HOST` | `ACARS_CONNECTIONS` |
| `FEED_ACARS_PORT` | `ACARS_CONNECTIONS` |
| `FEED_VDLM_HOST`  | `VDLM_CONNECTIONS`  |
| `FEED_VDLM_PORT`  | `VDLM_CONNECTIONS`  |
| `FEED_HFDL_HOST`  | `HFDL_CONNECTIONS`  |
| `FEED_HFDL_PORT`  | `HFDL_CONNECTIONS`  |
| `FEED_IMSL_HOST`  | `IMSL_CONNECTIONS`  |
| `FEED_IMSL_PORT`  | `IMSL_CONNECTIONS`  |
| `FEED_IRDM_HOST`  | `IRDM_CONNECTIONS`  |
| `FEED_IRDM_PORT`  | `IRDM_CONNECTIONS`  |

These variables were never documented for end users and were always internal plumbing pointing
at the socat relay. They have no migration path; users who referenced them in compose files
should replace them with an appropriate `<TYPE>_CONNECTIONS` value.

---

## Implementation Components

### Config Module (`src/config.ts`) ✅ DONE

New exports replace the `FEED_*` constants:

```typescript
export type ListenType = "udp" | "tcp" | "zmq";

export interface ConnectionDescriptor {
  listenType: ListenType;
  /** Bind address (UDP) or remote host (TCP/ZMQ) */
  host: string;
  /** Port number */
  port: number;
}

export interface DecoderConnections {
  descriptors: ConnectionDescriptor[];
}

// Resolved per-decoder connection config
export const ACARS_CONNECTIONS: DecoderConnections;
export const VDLM_CONNECTIONS: DecoderConnections;
export const HFDL_CONNECTIONS: DecoderConnections;
export const IMSL_CONNECTIONS: DecoderConnections;
export const IRDM_CONNECTIONS: DecoderConnections;
export const XNG_CONNECTIONS: DecoderConnections; // default port 5559

// Gate for the XNG listener (also exposed as getConfig().enableXng)
export const ENABLE_XNG: boolean;
```

The `parseConnections(raw: string, defaultPort: number): DecoderConnections` function handles
the comma-split and per-descriptor URI parsing. It is a pure function with no side effects,
making it straightforward to unit-test exhaustively.

Validation rules enforced at parse time:

- Port must be in range 1–65535.
- `listenType` must be one of the three known values.
- Unrecognised descriptor strings produce a `warn` log and are skipped (graceful degradation).
- An empty `descriptors` array after parsing produces an `error` log at startup.

### Listener Abstraction (`src/services/listener-types.ts`) ✅ DONE

The types live in `listener-types.ts` and are re-exported from `decoder-listener.ts`. A
shared interface that all listener implementations satisfy:

```typescript
/** Carrier types: what is queued, stored, counted and searched. */
export type MessageType = "ACARS" | "VDLM2" | "HFDL" | "IMSL" | "IRDM";

/** Listener label. XNG is ingest-only and never reaches the queue. */
export type ListenerType = MessageType | "XNG";

export interface IDecoderListener extends EventEmitter<DecoderListenerEvents> {
  start(): void;
  stop(): void;
  readonly connected: boolean;
  getStats(): DecoderListenerStats;
}

export interface DecoderListenerEvents {
  message: [type: ListenerType, data: unknown];
  connected: [type: ListenerType];
  disconnected: [type: ListenerType];
  error: [type: ListenerType, error: Error];
}

export interface DecoderListenerStats {
  type: ListenerType;
  listenType: ListenType;
  connectionPoint: string; // human-readable "host:port"
  connected: boolean;
}
```

Listeners, the factory and `ListenerManager` work in `ListenerType`. Everything from the
`MessageQueue` onward works in `MessageType`. `routeListenerMessage()` is the only place one
becomes the other, so adding `XNG` did not widen any downstream type.

### `TcpListener` (`src/services/tcp-listener.ts`) ✅ DONE

Unchanged in behaviour. Updated to implement `IDecoderListener`. Constructor signature
changes to accept a `ConnectionDescriptor` instead of the previous `host`/`port` split.

### `UdpListener` (`src/services/udp-listener.ts`) ✅ DONE

New class. Uses `node:dgram` to bind a UDP socket.

Key implementation notes:

- `connected` is `true` once the socket is successfully bound; there is no remote connection
  state to track.
- Datagrams arrive as complete buffers. Each buffer may contain one JSON object, or multiple
  back-to-back JSON objects (the `}{` → `}\n{` splitting logic from `TcpListener` applies).
- Partial-message reassembly is not needed for UDP (datagrams are atomic) but the same
  JSON-split logic handles the `}{` edge case.
- No reconnect loop is required; a bound UDP socket stays open until explicitly closed. If
  `bind()` fails (port in use), the listener emits `error` and retries after `reconnectDelay`.

### `ZmqListener` (`src/services/zmq-listener.ts`) ✅ DONE

New class. Uses the `zeromq` npm package (v6, native add-on).

Key implementation notes:

- Uses a `Subscriber` socket (`ZMQ_SUB`), not a `Publisher`.
- Connects (does not bind) to `tcp://<host>:<port>`. The remote decoder or router is the PUB
  server; Node.js is the SUB client.
- Subscribes to all topics: `await socket.subscribe("")`.
- The receive loop yields one **multipart message** per iteration and uses its **last
  frame** as the payload. Single-frame publishers (acars_router, dumpvdl2) send `[json]`,
  where last equals first. xng publishes `[topic, json]`, which is why the hub can subscribe to
  xng directly. A message with no frames is skipped. The payload frame is treated as one
  potential JSON message (same parse-and-split logic applies defensively).
- libzmq handles reconnection transparently when the remote PUB server restarts. `connected`
  state is updated on first successful frame receipt and on `ETERM`/close events.
- ZMQ native add-on compilation requires `libzmq-dev` at build time and `libzmq5` at runtime.
  Both are added to the Dockerfile.

### Connection Factory (`src/services/decoder-listener.ts`) ✅ DONE

```typescript
export function createDecoderListener(
  type: ListenerType,
  descriptor: ConnectionDescriptor,
): IDecoderListener {
  switch (descriptor.listenType) {
    case "udp":
      return new UdpListener(type, descriptor);
    case "tcp":
      return new TcpListener(type, descriptor);
    case "zmq":
      return new ZmqListener(type, descriptor);
  }
}
```

### `BackgroundServices` (`src/services/background-services.ts`) ✅ DONE

`src/services/index.ts` is a thin barrel. Listener wiring lives in `ListenerManager`
(`src/services/listener-manager.ts`), and status payloads are built in
`src/services/system-status.ts`.

`ListenerManager.setupDecoderConnections(type, descriptors)` is called once per enabled
`ListenerType` (the five carriers plus `XNG` when `enableXng` is set). It iterates the
`descriptors` array and creates one listener per descriptor via the factory. Listeners are
stored in `decoderListeners: Map<string, IDecoderListener>` keyed by `"<TYPE>-<index>"` (e.g.
`"ACARS-0"`, `"ACARS-1"`, `"XNG-0"`) to support multiple listeners per type.
`ConnectionStatus` has one flag per `ListenerType`, including `XNG`. A type's flag is `true`
if **any** of its listeners reports connected.

All listeners share one `onMessage` hook, set by `BackgroundServices`. The hook calls
`routeListenerMessage(type, data, push)` (`src/formatters/xng.ts`):

- Non-XNG types are pushed into the `MessageQueue` unchanged.
- XNG payloads are checked with `isXngEnvelope()`, re-labelled with `xngCarrierType(mode)`,
  then pushed under the carrier `MessageType`. Invalid envelopes and unhandled modes are
  dropped.

For each pushed message that came from the XNG listener, the hook also:

1. Calls `recordXngMessage()` to increment the in-memory xng envelope counter shown as the
   XNG total on the Status page.
2. Calls `markDecoderActive(carrier)` (`src/services/decoder-activity.ts`). This records the
   carrier as xng-fed. It returns `true` only the first time a carrier arrives while its
   `ENABLE_*` flag is off. In that case `onDecoderActivated()` re-emits `system_status` and
   broadcasts a fresh `features_enabled` payload, so clients show the new type without
   reconnecting.

`decoder-activity.ts` is the effective-enablement source of truth. `isDecoderEnabled(type)` is
the config flag OR runtime activation. Activation lasts until process restart. Every runtime
gate reads `isDecoderEnabled()` instead of `getConfig().enable*`: `buildSystemStatus()`,
`buildDecoderFeatures()` (the `features_enabled` payload on connect), the signal-stats socket
handler, and the Prometheus decoder-enabled metrics. Listener creation still reads the
config flags, so auto-enable never opens a socket.

`buildSystemStatus()` reports an xng-fed carrier as connected if its own listener is
connected, **or** if `isFedByXng(type)` and the XNG listener is connected. A type fed only by
xng has no listener of its own. When `enableXng` is set, the status also has an `XNG` decoder
entry (connection state) and an `XNG` global entry whose `Count` is `getXngMessageCount()`.
Queue, DB and per-type counts are **not** affected: xng messages are counted under their
carrier type.

Message formatting is unchanged at the queue boundary. `formatAcarsMessage()` checks
`isXngEnvelope()` first and delegates to `formatXngMessage()` (`src/formatters/index.ts`),
which produces the same `FormattedMessage` shape as the carrier's native formatter:

- Envelope fields: `timestamp` (RFC3339 → epoch seconds), `source.station.ident` →
  `station_id`, `decode.errors` (or `crc_ok` → 0/1) → `error`, `frequency_hz` → `freq` in the
  carrier's native representation, `signal.rssi_db` → `level`.
- ACARS bodies: `mode`, `label`, `text`, `tail`, `flight`, `block_id`, `msg_num` → `msgno`,
  `more_to_come` → `end` (inverted), and `ack` (unset for NAK, matching native formatters).
  The acars_poa flat app fields (`depa`, `dsta`, `eta`, `gtout`, `gtin`, `wloff`, `wlin`,
  `position`, `altitude_ft`) map to the matching stored fields. A structured application
  decode is serialised into `libacars`, and ADS-C basic reports supply `lat`/`lon`/`alt`.
- VDL2 ACARS frames: `toaddr` / `fromaddr` are decoded from the AVLC header in `raw`
  (`decodeAvlcAddresses()`). `icao` is set when the source address is an aircraft.
- Non-ACARS frames (HFDL, Aero, Iridium and VDL2 link-layer bodies): stored with
  `libacars = JSON.stringify({ [kind]: details })`. `flight`, `lat`/`lon` and `icao` are
  pulled from `details` where present. VDL2 `toaddr` / `fromaddr` come from `details.dst` /
  `details.src`.
- `body.type === "undecoded"` and unhandled modes format to `null` and are not stored.

Known limitation: xng does not include aircraft/ground addresses for ACARS frames carried over
HFDL, Aero or Iridium, so those messages have no `toaddr` / `fromaddr`.

---

## Stats Endpoint Migration ✅ DONE

### What `generate_stats` / `<type>_stats` produced

A JSON file at `/webapp/data/stats.json` with this schema:

```json
{
  "acars": 142,
  "vdlm2": 87,
  "hfdl": 0,
  "imsl": 0,
  "irdm": 0,
  "total": 229
}
```

Counts represented messages received in the **last hour**.

nginx served this file at `GET /data/stats.json` with `Cache-Control: no-cache`.

### Replacement

The Node.js backend exposes `GET /data/stats.json` as a Fastify route. nginx's
`location /data/stats.json` block is changed from a static file serve to a proxy pass
(matching the existing pattern used for `/socket.io` and `/metrics`).

The route implementation:

1. Queries `timeseries_stats` for all rows with `timestamp >= (now - 3600)`.
2. Sums `acarsCount`, `vdlmCount`, `hfdlCount`, `imslCount`, `irdmCount` across those rows.
3. If no rows exist yet (first minute of operation), falls back to
   `MessageQueue.getStats()` live counters (which reflect the current minute only).
4. Returns the same JSON schema as the old file for external consumer compatibility.

No files are written to disk. The `timeseries_stats` table (written by `stats-writer.ts`
once per minute) is the single source of truth.

---

## s6-overlay Services Removed ✅ DONE

The following s6 service directories and their associated scripts are deleted entirely:

| s6 service directory     | Script                      | Replaced by                     |
| ------------------------ | --------------------------- | ------------------------------- |
| `s6-rc.d/acars_server`   | `scripts/acars_server.sh`   | `UdpListener` in Node.js        |
| `s6-rc.d/vdlm2_server`   | `scripts/vdlm2_server.sh`   | `UdpListener` in Node.js        |
| `s6-rc.d/hfdl_server`    | `scripts/hfdl_server.sh`    | `UdpListener` in Node.js        |
| `s6-rc.d/imsl_server`    | `scripts/imsl_server.sh`    | `UdpListener` in Node.js        |
| `s6-rc.d/irdm_server`    | `scripts/irdm_server.sh`    | `UdpListener` in Node.js        |
| `s6-rc.d/acars_stats`    | `scripts/acars_stats.sh`    | `timeseries_stats` table        |
| `s6-rc.d/vdlm2_stats`    | `scripts/vdlm2_stats.sh`    | `timeseries_stats` table        |
| `s6-rc.d/hfdl_stats`     | `scripts/hfdl_stats.sh`     | `timeseries_stats` table        |
| `s6-rc.d/imsl_stats`     | `scripts/imsl_stats.sh`     | `timeseries_stats` table        |
| `s6-rc.d/irdm_stats`     | `scripts/irdm_stats.sh`     | `timeseries_stats` table        |
| `s6-rc.d/generate_stats` | `scripts/generate_stats.sh` | `GET /data/stats.json` endpoint |

All corresponding `user/contents.d/<service>` marker files are removed.

`scripts/01-acarshub.sh` is updated to remove:

- `touch /database/vdlm2.past5min.json`
- `touch /database/acars.past5min.json`
- `mkdir -p /database/images` (only needed for RRD image output, which is retired)

---

## Dockerfile Changes ✅ DONE

### Packages

`libzmq5` is added to the runtime `apt-get install` layer to support the ZMQ native add-on.

```dockerfile
KEPT_PACKAGES+=(libzmq5)
```

`socat` and `ncat` are inherited from the base image and are not explicitly installed by this
Dockerfile; they need no removal action here. Their associated s6 services simply cease to
exist.

### EXPOSE

The old exposed ports reflect the relay architecture and are removed or reclassified:

```dockerfile
# REMOVE - internal relay ports, no longer exist
# EXPOSE 15550
# EXPOSE 15555

# KEEP - only if user documentation benefits from advertising default UDP listen ports
# These are purely informational; Docker does not require EXPOSE for UDP to work.
EXPOSE 5550/udp
EXPOSE 5555/udp
EXPOSE 5556/udp
EXPOSE 5557/udp
EXPOSE 5558/udp
EXPOSE 5559/udp
```

Exposing the UDP ports is optional but recommended so that `docker-compose.yaml` examples
with explicit port mappings are self-documenting.

### ENV defaults

```dockerfile
ENV ACARS_CONNECTIONS="udp" \
    VDLM_CONNECTIONS="udp"  \
    HFDL_CONNECTIONS="udp"  \
    IMSL_CONNECTIONS="udp"  \
    IRDM_CONNECTIONS="udp"  \
    XNG_CONNECTIONS="udp"
```

The `FEED_*` variables are removed from the `ENV` block entirely.

### npm dependency

`zeromq` is added to `acarshub-backend/package.json` dependencies. The existing native
add-on compilation layer (already present for `better-sqlite3`) handles the build without
Dockerfile changes.

---

## nginx Changes ✅ DONE

The stats file location block is replaced with a proxy:

```nginx
# Before: static file from /webapp/data/stats.json
# location /data/stats.json {
#   add_header Cache-Control 'no-cache';
#   root /webapp;
# }

# After: proxied to Node.js backend
location /data/stats.json {
  add_header Cache-Control 'no-cache';
  proxy_pass http://127.0.0.1:8888;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

## Testing Requirements ✅ DONE

Per the project testing mandate, every new module requires tests before the implementation is
considered complete.

### `parseConnections()` — `config.test.ts` ✅ DONE

- Bare `udp` resolves to default port for each decoder type.
- `udp://0.0.0.0:9550` resolves correctly.
- `tcp://acars_router:15550` resolves correctly.
- `zmq://dumpvdl2:45555` resolves correctly.
- Comma-separated list produces multiple descriptors.
- Whitespace around commas is trimmed.
- Invalid descriptor is skipped with a warn log; remaining descriptors are still parsed.
- Port out of range (0, 65536) produces a warn log and is skipped.
- Empty string produces an empty descriptors array and an error log.
- `ENABLE_XNG` defaults to disabled; `XNG_CONNECTIONS` defaults to bare `udp` on port 5559 and
  honours an env override.

### `UdpListener` — `udp-listener.test.ts` ✅ DONE

- Binds on configured address and port.
- Emits `connected` when bind succeeds.
- Parses a valid single-object datagram and emits `message`.
- Handles `}{`-concatenated objects in a single datagram (splits and emits two messages).
- Emits `error` and retries bind when port is in use.
- `stop()` closes the socket cleanly.

### `ZmqListener` — `zmq-listener.test.ts` ✅ DONE

- Connects to a test ZMQ PUB socket and receives a message.
- Parses valid JSON frame and emits `message`.
- Handles `}{`-concatenated content in a frame.
- Uses the last frame of a two-frame `[topic, json]` message (xng).
- Skips a multipart message with no frames.
- `stop()` closes the socket without throwing.

### xng routing and formatting — `formatters/__tests__/xng.test.ts`, `xng-format.test.ts`

- `isXngEnvelope()` accepts captured envelopes and rejects native decoder output and
  malformed envelopes (missing/mistyped `mode`, `timestamp`, `frequency_hz`, `body`,
  `source.app`, or `app.name !== "xng"`).
- `xngCarrierType()` maps every handled mode and returns `null` for others.
- `routeListenerMessage()` passes non-XNG payloads through unvalidated, re-labels XNG
  envelopes, and drops invalid XNG payloads.
- `formatXngMessage()` field mapping per carrier, driven by the captured fixtures in
  `formatters/__tests__/fixtures/xng-*.jsonl`.

### Decoder activity — `services/__tests__/decoder-activity.test.ts`

- `isDecoderEnabled()` follows the config flag until `markDecoderActive()` activates the type.
- `markDecoderActive()` returns `true` once for a config-disabled type, `false` thereafter and
  for config-enabled types.
- `isFedByXng()`, the xng message counter and `buildDecoderFeatures()` reflect activation;
  `resetDecoderActivity()` clears all state.

### `BackgroundServices` — `services/__tests__/background-services.test.ts`, `listener-manager.test.ts` ✅ DONE

- With `ACARS_CONNECTIONS=udp,tcp://host:1234`, two listeners are created for `ACARS`.
- Decoder `connected` status is `true` if any listener for that type is connected.
- Decoder `connected` status is `false` only when all listeners for that type are disconnected.
- Messages from both listeners for the same type arrive in the message queue.
- An xng envelope for a config-disabled carrier activates it exactly once and refreshes
  clients once (`system_status` + `features_enabled`).
- Every routed xng envelope is counted; messages from non-XNG listeners are not.

### System status — `services/__tests__/system-status.test.ts`

- An xng-fed type with no listener of its own reports connected iff XNG is connected.
- XNG does not stand in for a type xng has not fed.
- The `XNG` entry is omitted when `ENABLE_XNG` is off, and reports connection state and the
  routed envelope count when on.

### Ingestion integration — `__tests__/ingestion.integration.test.ts`

- Envelopes on the XNG listener are re-labelled to their carrier type end to end.

### `GET /data/stats.json` — `server.test.ts` or `stats.test.ts` ✅ DONE — `stats.test.ts`

- Returns correct per-decoder counts from `timeseries_stats` rows within the last hour.
- Excludes rows older than one hour.
- Falls back to `MessageQueue` live stats when no DB rows exist.
- Returns the expected JSON schema (`acars`, `vdlm2`, `hfdl`, `imsl`, `irdm`, `total`).

### Regression tests ✅ DONE

```typescript
// Regression: fan-in does not double-count messages in stats
it("regression: two listeners for same type increment stats once per message", () => { ... });

// Regression: bare 'udp' descriptor uses correct default port per decoder type
it("regression: bare udp for VDLM resolves to port 5555, not 5550", () => { ... });
```

---

## Architectural Decisions

The following questions were raised during planning and are now resolved.

### `ENABLE_<TYPE>` stays as the gate

`ENABLE_ACARS`, `ENABLE_VDLM`, etc. are kept exactly as they are. They are already present in
every user's compose file and changing them would be a breaking change with no benefit.
`<TYPE>_CONNECTIONS` is only consulted when the corresponding `ENABLE_<TYPE>` flag is true.

The one implicit enable is xng auto-enable. A carrier type whose flag is off becomes enabled
for display, stats and status when its first xng envelope arrives. It stays enabled until
restart and never gains a listener of its own. This exists because xng is one process feeding
several carriers. Requiring users to set five `ENABLE_*` flags (which would also open five
unused UDP sockets) to see xng traffic would be a trap. The effect is runtime-only and
reversible by restart, so `ENABLE_<TYPE>` remains the gate for listeners.

### UDP `connected` state: bound = connected

A UDP listener has no remote connection to track. Once the socket is successfully bound,
`connected` is `true`. It stays `true` until `stop()` is called or the socket errors out.
There is no heartbeat timeout. On quiet sites with low message rates, a socket that is bound
and listening is correctly reported as connected even if no datagrams have arrived recently —
because it is connected.

### ZMQ `connected` state: monitor socket (Option C)

libzmq reconnects transparently when the remote PUB server restarts, which means there are no
application-level connect/disconnect events from the receive loop alone. The `ZmqListener`
runs a **second async loop** over `socket.events` — the ZMQ monitor socket — alongside the
main receive loop. libzmq emits real TCP-layer events into this iterator:

```typescript
for await (const event of this.socket.events) {
  if (event.type === "connect") {
    this.isConnected = true;
    this.emit("connected", this.config.type);
  } else if (event.type === "disconnect") {
    this.isConnected = false;
    this.emit("disconnected", this.config.type);
  }
}
```

This gives accurate connection state that reflects the actual TCP handshake to the remote PUB,
independent of message rate. A quiet site shows "Connected" correctly because the TCP session
is open; the moment the decoder process dies, libzmq detects the TCP close and the monitor
loop emits `disconnect`. No timeout heuristics are needed.

---

## Nix Development Environment ✅ DONE

The `zeromq` npm package v6 ships **prebuilt binaries** for Linux x86-64 (Debian 9+,
Ubuntu 16.04+) and macOS (10.9+ x86-64, arm64). On these platforms `npm install zeromq`
downloads a pre-compiled `.node` addon — no system packages are required.

If the prebuilt binary is unavailable (unsupported platform or libc variant), the package
falls back to building from source using **cmake-ts** and **vcpkg**. vcpkg downloads and
statically links libzmq itself; it does not use a system-installed libzmq. The source-build
dependencies are: a C++17 compiler, CMake 3.16+, and the vcpkg bootstrap tools
(`curl`, `unzip`, `zip`, `tar`, `git`, `pkg-config`).

`python3` is **not** added to the Nix shell — it is only needed for the source-build fallback
which never fires on the supported dev platforms (Linux x86-64, macOS x86-64/arm64).

`flake.nix` has been updated with `pkgs.cmake` and `pkgs.pkg-config`:

```nix
# In devShells.default.packages:
pkgs.cmake
pkgs.pkg-config
```

`pkgs.zeromq` (the C library) does **not** need to be added to the Nix shell. vcpkg manages
its own copy and the prebuilt binary bundles libzmq statically — the system zeromq library is
never used.

### Dockerfile build stage

The existing `apt-get install make python3 g++` layer already covers the source-build
fallback for `better-sqlite3`. Add `cmake` to that same layer so the zeromq source build is
also covered if the prebuilt binary is not used:

```dockerfile
apt-get install -y --no-install-recommends make python3 g++ cmake
```

### Dockerfile runtime stage

No changes. The prebuilt `.node` binary (or a source-built one via vcpkg) statically links
libzmq. `libzmq5` is **not** required as a runtime package.
