# ACARS Hub - Decoder Connection Architecture

> **Implementation status: COMPLETE** — All components implemented, all tests passing, `just ci` green.

This document is the authoritative reference for how ACARS Hub receives data from external
decoder processes (acarsdec, vdlm2dec, dumpvdl2, dumphfdl, acars_router, etc.).

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

`ENABLE_<TYPE>` continues to gate whether a decoder is active at all. If `ENABLE_ACARS=false`,
then `ACARS_CONNECTIONS` is ignored.

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

### Descriptor Semantics

| Descriptor                    | Node.js behaviour                                                                                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `udp` / `udp://<bind>:<port>` | Opens a `dgram` UDP socket bound to the specified address and port. Receives incoming datagrams. "Connected" means the socket is successfully bound.                                               |
| `tcp://<host>:<port>`         | Opens a `net.Socket` TCP connection to the specified remote host and port. Reconnects automatically on disconnect. "Connected" mirrors socket state.                                               |
| `zmq://<host>:<port>`         | Opens a ZMQ `SUB` socket and connects to `tcp://<host>:<port>`. Subscribes to all topics (`""`). Reconnection is handled by libzmq internally. "Connected" is tracked by successful frame receipt. |

### Default Values (set in Dockerfile)

```dockerfile
ENV ACARS_CONNECTIONS="udp" \
    VDLM_CONNECTIONS="udp"  \
    HFDL_CONNECTIONS="udp"  \
    IMSL_CONNECTIONS="udp"  \
    IRDM_CONNECTIONS="udp"
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
```

The `parseConnections(raw: string, defaultPort: number): DecoderConnections` function handles
the comma-split and per-descriptor URI parsing. It is a pure function with no side effects,
making it straightforward to unit-test exhaustively.

Validation rules enforced at parse time:

- Port must be in range 1–65535.
- `listenType` must be one of the three known values.
- Unrecognised descriptor strings produce a `warn` log and are skipped (graceful degradation).
- An empty `descriptors` array after parsing produces an `error` log at startup.

### Listener Abstraction (`src/services/decoder-listener.ts`) ✅ DONE

A shared interface that all listener implementations satisfy:

```typescript
export interface IDecoderListener extends EventEmitter<DecoderListenerEvents> {
  start(): void;
  stop(): void;
  readonly connected: boolean;
  getStats(): DecoderListenerStats;
}

export interface DecoderListenerEvents {
  message: [type: MessageType, data: unknown];
  connected: [type: MessageType];
  disconnected: [type: MessageType];
  error: [type: MessageType, error: Error];
}

export interface DecoderListenerStats {
  type: MessageType;
  listenType: ListenType;
  connectionPoint: string; // human-readable "host:port"
  connected: boolean;
}
```

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
- `receive()` returns a single frame per await; each frame is treated as one potential JSON
  message (same parse-and-split logic applies defensively).
- libzmq handles reconnection transparently when the remote PUB server restarts. `connected`
  state is updated on first successful frame receipt and on `ETERM`/close events.
- ZMQ native add-on compilation requires `libzmq-dev` at build time and `libzmq5` at runtime.
  Both are added to the Dockerfile.

### Connection Factory (`src/services/decoder-listener.ts`) ✅ DONE

```typescript
export function createDecoderListener(
  type: MessageType,
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

### `BackgroundServices` (`src/services/index.ts`) ✅ DONE

`setupListener()` is replaced by `setupDecoderConnections()`. For each enabled decoder type,
it iterates the `descriptors` array and creates one listener per descriptor via the factory.
All listeners for a given type share the same `on("message")` handler that pushes into
`MessageQueue`. Connection status for a decoder type is `true` if **any** of its listeners
reports connected.

The `tcpListeners: Map<MessageType, TcpListener>` field becomes
`listeners: Map<string, IDecoderListener>` keyed by `"<TYPE>-<index>"` (e.g. `"ACARS-0"`,
`"ACARS-1"`) to support multiple listeners per type.

`emitSystemStatus()` is updated to derive per-decoder `connected` state by checking whether
any listener key matching that type is connected.

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
```

Exposing the UDP ports is optional but recommended so that `docker-compose.yaml` examples
with explicit port mappings are self-documenting.

### ENV defaults

```dockerfile
ENV ACARS_CONNECTIONS="udp" \
    VDLM_CONNECTIONS="udp"  \
    HFDL_CONNECTIONS="udp"  \
    IMSL_CONNECTIONS="udp"  \
    IRDM_CONNECTIONS="udp"
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
- `stop()` closes the socket without throwing.

### `BackgroundServices` — `services/index.test.ts` ✅ DONE — `services-index.test.ts`

- With `ACARS_CONNECTIONS=udp,tcp://host:1234`, two listeners are created for `ACARS`.
- Decoder `connected` status is `true` if any listener for that type is connected.
- Decoder `connected` status is `false` only when all listeners for that type are disconnected.
- Messages from both listeners for the same type arrive in the message queue.

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
No implicit enable logic is introduced.

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
