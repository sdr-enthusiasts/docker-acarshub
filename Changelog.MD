# ACARS Hub Change Log

## Version 5.0.0

> [!WARNING]
> Version 5.0.0 is in alpha development. This is not currently being built on the github CI, and does not offer the same level of functionality that previous versions do.

Version 5 is a complete rewrite of ACARS Hub. This went through many fits and starts through the years, but it's finally happening. It will happen in phases, and the first phase is going to be a re-write of the back end in Rust, aiming to have 1:1 feature parity with the current version of ACARS Hub. This rewrite isn't technically necessary, but it will enable many potential future cool things (desktop app, ADSB data retention and pairing with messages, etc), as well as a much easier path to do database migrations in place, transparent to the user so I can improve the database without users losing data.

> [!IMPORTANT]
> Many options are going to be deprecated, and/or removed. Please look at the next section carefully to ease the migration to v5.0.0

### Deprecations

- Data path for acarshub has been moved from `/run/acars` to `/opt/acarshub-data`. Please update your `volumes` section in your yaml.
- `ENABLE_{ACARS|VDLM|HFDL|IRDM|IMSL}` used to require `external` to turn it on. We now use the much more sensible `true` and `false`. Please update your configuration accordingly.
- Options for disabling the web server and related functionality have been removed.

### New Features

- Database is going to be migrated, and more data is going to be stored
