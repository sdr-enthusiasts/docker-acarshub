# ACARS Hub Change Log

## ACARS Hub v4.0.0

### v4.0.0 New

- Complete rewrite of the web front end
- Desktop notifications
- Unified Settings, localization, custom map provider(S), and so much more
- Improved statistics
- Live map: layers, pausing, follow aircraft, filters, animated sprites...
- Improved searching/alert matching

## ACARS Hub v4.0.1

### v4.0.1 Bug Fixes

- Live Map Side bar: Hovering over plane in the side bar no longer causes the plane to change heading
- Live Map: Mobile pinch to zoom is fixed

### v4.0.1 New

- Re-add functionality to generate <yourip><:port>/data/stats.json

## ACARS Hub v4.1.0

### v4.1.0 New

- Backend: completely rewritten in Node.js
- Backend: Connect to `acars_router` or decoders directly via TCP/ZMQ [(2)](#v410-n2)
- Front End: Reduced initial load time and bandwidth for all deployment types
- Database: Time series data is now stored in the main SQLite database and migrated automatically from RRD on first run
- Message Groups: Instead of showing a generic "ADS-B" label, the actual source type is now shown (ADS-B/UAT/TIS-B/ADSC etc.)
- Live Messages: Filter by station ID
- Live Map: ADS-B source type is displayed on mouse hover of an aircraft
- Live Map: Updated sprites to latest from Plane Watch (BL8 and C206 added)
- Live Map: Aircraft markers outside the viewport are no longer rendered — improves performance on HFDL and other long-range deployments
- Live Map: Side bar filter option to show only aircraft currently visible on the map
- Live Map: Side bar is now resizable and collapsible
- Live Map: Side bar badges indicate which decoder type(s) received each aircraft, replacing the generic green checkmark with a colour-coded badge. At minimum width only the most recent decoder type is shown; expand the sidebar to see all badges for aircraft received on multiple decoder types
- Live Map: Worldwide TRACON boundary overlay [(1)](#v410-n1)
- Live Map: Worldwide FIR boundary overlay [(1)](#v410-n1)
- Live Map: Hey What's That support. Enable with `HEYWHATSTHAT=<token>`. Optionally specify the altitudes to display with `HEYWHATSTHAT_ALTS=<comma-separated list of altitudes in feet, no units>`
- Mobile Live Map: Additional map controls collapse into a flyout menu at smaller breakpoints

### v4.1.0 Bug Fixes

- Database: Migration from **any** version of ACARS Hub prior to v4 incorrectly skipped FTS table rebuilds. New databases created in v4 are unaffected. The database will repair itself automatically if the issue is detected — this may take some time on large databases, but no data is lost.
- Network: Removed IPv6 binding in nginx that caused container startup failures on some host configurations
- Live Map: Panning and zooming no longer hides overlays or re-requests overlay data from the server on every interaction
- Live Map: Zoom In/Out buttons now render above aircraft markers

### v4.1.0 Notes

1. <a id="v410-n1"></a>Worldwide TRACON and FIR boundary data is sourced from VATSIM — a community of flight simulation enthusiasts who volunteer as virtual ATC controllers. The data appears to be derived from real ATC boundaries: US coverage is largely accurate (Amarillo Approach is close but not quite right), though I cannot independently verify accuracy for non-US regions. As an FAA employee, I won't use my work access to pull official data for comparison in order to avoid any conflict of interest.

2. <a id="v410-n2"></a>By default, ACARS Hub will behave exactly as before — no change is required and message ingestion is unaffected.

   The new `<ACARS/VDLM/HFDL/IRDM/IMSL>_CONNECTIONS` variables optionally allow ACARS Hub to connect out to `acars_router` or the decoders directly, rather than waiting for them to push data in. Multiple sources per decoder type are supported. This is now the recommended setup.

   Example configuration:

   ```yaml
   ACARS_CONNECTIONS=udp                          # default — no change needed
   ACARS_CONNECTIONS=udp://0.0.0.0:42069          # UDP on a custom port
   HFDL_CONNECTIONS=zmq://acars_router:15556      # connect to acars_router over ZMQ
   VDLM_CONNECTIONS=udp;zmq://acars_router:45555  # listen on UDP and also connect via ZMQ
   ```

   The `_CONNECTIONS` variables are ignored if the corresponding `ENABLE_` variable is not set. If you migrate to the outbound connection model, remove `acarshub` from your `AR_SEND_UDP` variables to avoid log spam from `acars_router` attempting to push to an offline host.

   Documentation has been updated to reflect the new recommended setup.
