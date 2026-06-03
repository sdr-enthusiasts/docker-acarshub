---
name: acarshub-socket-namespace
description: Use ONLY when working in the docker-acarshub repository AND touching socket.io code -- emit / on / connect calls on either the React frontend or the Fastify backend. Codifies the `/main` namespace binding that's done at construction time and the historical Flask-SocketIO-quirk pitfall: do NOT pass `"/main"` as an extra argument to `socket.emit(...)` calls.
---

# ACARS Hub: Socket.IO `/main` namespace is bound at construction

The frontend connects to the `/main` namespace at construction
time:

```typescript
const socket = io(`${origin}/main`, { ... });
```

The backend binds handlers via `io.of("/main")`. Once the
constructor URL includes the namespace, **all subsequent
`socket.emit(...)` and `socket.on(...)` calls implicitly use it**.

## The pitfall

Do **NOT** pass `"/main"` as an extra argument to emits:

```typescript
// Wrong -- the extra "/main" is silently consumed as a 2nd handler param
//         a future handler that adds a second parameter would silently
//         consume it and the bug would be invisible.
socket.emit("query_search", payload, "/main");

// Right
socket.emit("query_search", payload);
```

This pattern was a quirk of the **Flask-SocketIO Python client**
that lived in the old Python backend. When the backend was ported
to Node Socket.IO v4 (in tasks TYPE-01 / TYPE-02; commit pinned in
`agent-docs/REMEDIATION_PLAN.md`), the trailing `"/main"`
arguments became dead-but-harmless code. They were removed during
that port. **Do not re-introduce them**, including in copy-pasted
examples from older agent sessions, old git history, or
documentation that predates the port.

## Events at a glance

**Backend -> frontend** (frontend `socket.on(...)`):

- `acars_msg` -- new ACARS message
- `adsb_aircraft` -- ADS-B aircraft positions
- `system_status` -- backend health status
- `terms` -- alert term updates
- `database_search_results` -- search results

**Frontend -> backend** (frontend `socket.emit(...)`):

- `query_search` -- database search request
- `update_alerts` -- update alert terms
- `request_status` -- request system status

Full event catalogue (with payload shapes) is the responsibility
of the typed `acarshub-types` package. When adding an event, add
it there first, then on both ends.

## When to stop and ask

- A new event is needed that doesn't fit the existing patterns
  (e.g. a binary stream rather than a JSON-serialisable event).
  Surface the design choice before inventing a transport.
- The event would push a payload over the Socket.IO default frame
  size. Confirm whether to bump the frame size or split the
  payload.
- A handler genuinely needs to consume more than one positional
  parameter (very rare in Socket.IO v4 patterns). Stop -- this is
  exactly where the legacy `"/main"` arg becomes a real bug.
