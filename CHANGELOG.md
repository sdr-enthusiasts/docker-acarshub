# ACARS Hub Change Log

## ACARS Hub v4.0.0

New:

Complete rewrite of the web front end
Desktop notifications
Unified Settings, localization, custom map provider(S), and so much more
Improved statistics
Live map: layers, pausing, follow aircraft, filters, animated sprites...
Improved searching/alert matching

Please see ⁠acarshub⁠ for important notes. The TL;DR is expect a long startup if you are coming from a v3 install, please let it do it's thing, backing up your db just in case isn't a bad idea, and once you migrate to v4 going back to v3 isn't possible

## ACARS Hub v4.0.1

Bug Fixes:

Live Map Side bar: Hovering over plane in the side bar no longer causes the plane to change heading
Live Map: Mobile pinch to zoom is fixed

New:

Re-add functionality to generate <yourip><:port>/data/stats.json

## ACARS Hub 4.1.0

New:

- Backend: completely rewritten in Node.JS
- Backend: Enable TCP and ZMQ connections to acars router and/or the decoders directly (2)
- Front End: Optimize load times and reduce fresh load bandwidth for all use cases
- Database: Time Series data is no longer stored in an RRD. It will be migrated in to the main database.
- Message Groups: Instead of showing generic "ADSB" if the aircraft is tracked, it will show the actual source (ADSB/UAT/TIS-B/ADSC etc)
- Live Messages: Filter by station ID
- Live Map: ADSB source type is displayed on mouse hover of a plane
- Live Map: Updated sprites to latest from Plane Watch (BL8 and C206 added)
- Live Map: Do not render aircraft markers outside of the view port. Should (marginally) increase performance, especially on deployments with HFDL or other long range position sources
- Live Map: Side bar now has a filter option to only show aircraft that are currently visible on the map
- Live Map: Side bar is now resizable and collapsible
- Live Map: Side bar will now flag what message type(s) the aircraft has been picked up on. Replaces the default green check mark with a colored checkmark of the decoder type. At the default/minimum width only the most recent message type is displayed in the sidebar for that aircraft. As you expand you will see badges for more decoder types if the airplane has them.
  dis
- Live Map: Worldwide TRACON boundary overlay (1)
- Live Map: Worldwide FIR boundary overlay (1)
- Live Map: Hey What's That support. Enabled with `HEYWHATSTHAT=<token>`. Optionally, specify the altitude(s) you want to see with `HEYWHATSTHAT_ALTS=<commas separated list of altitudes in feet. No units>`
- Mobile Live Map: More map controls collapsed in to a flyout at appropriate break points

Bug fix:

- Database: migration from ANY version of ACARS Hub prior to v4 incorrectly skipped FTS table rebuilds causing some issues. New databases created in v4 are unaffected. DB will repair itself if the issue is detected. May take some time. No data is/was lost.
- Network: Removed ipv6 binding in nginx, which appears to have made the container unusable on some configs
- Live Map: Zoom operations on the live map no longer hide the overlays and no longer hit the web server over and over again for the data as you pan/zoom
- Live Map: Zoom In/Out buttons now should be shown on top of any airplanes that are behind it

Notes:

(1) Worldwide TRACON and FIR boundary data comes from VATSIM, which for the uninitiated are sim enthusiasts that play ATC with flight sim. The data, at least for the US, seems accurate (well, I see a problem with Amarillo Approach...it's close, but not right) and probably from actual ATC data. I cannot speak to the veracity of the data for non-US sources. I also cannot practically verify the verasity of the data for US sources. Even though I work for the FAA, I am not going have any potential conflict of interests or other ethical concerns and use my access to pull the real data and compare/generate my own data.

(2) By _default_ it will act exactly as before. You should NOT see any difference in ACARS Hub taking in messages.

You now have the option to set `<ACARS/VDLM/HFDL/IRDM/IMSL>_CONNECTIONS` to point at acars router (or the decoders) to get messages. You can also specify MULTIPLE sources to connect to. This is now the default recommended setup.

An example would look like:

```yaml
ACARS_CONNECTIONS=udp # default, does not need to be set.
ACARS_CONNECTIONS=udp://0.0.0.0:42069 # udp listen on a custom port
HFDL_CONNECTIONS=zmq://acars_router:15556 # would connect to acars router over tcp
VDLM_CONNECTIONS=udp;zmq://acars_router:45555 # listen on udp on the default port and also connect to acars_router over zmq
```

The documentation has been updated to reflect that the recommended setup is have ACARS Hub connect out to the source of data rather than the source of data send it to Hub. the `_CONNECTIONS` are ignored if the `ENABLE_` variable is not set for the decoder type.

If you change to the new recommended setup, remove acarshub from the `AR_SEND_UDP` variables. I do recommend changing over, so that you don't get a load of acars_router log spam as it tries to send data over to Hub and Hub is offline.
