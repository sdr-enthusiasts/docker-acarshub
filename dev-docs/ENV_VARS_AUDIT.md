# ACARS Hub v4 Environment Variables Audit Report

**Date**: 2025-01-XX (Pre-v4 Release)

**Purpose**: Audit of environment variables comparing documentation (README.md) against implementation (acarshub_configuration.py and broader codebase)

## Executive Summary

This audit identifies discrepancies between documented and implemented environment variables. Key findings:

- **3 variables** documented but not fully implemented
- **17 variables** used in code but not documented for users
- **8 variables** read from environment but never actually used in application logic

## 1. Variables Documented But NOT Implemented

These variables appear in `README.md` but have issues in the implementation:

### 1.1 `FEED`

- **Documented Default**: `false`
- **Purpose (per docs)**: "Used to toggle feeding to ACARS.io"
- **Status**: ❌ **NOT IMPLEMENTED**
- **Evidence**: No references found in any Python or shell scripts
- **Impact**: Users setting this variable will see no effect
- **Recommendation**: Either implement ACARS.io feeding functionality or remove from documentation

### 1.2 `ENABLE_WEB`

- **Documented Default**: `true`
- **Purpose (per docs)**: "Enable the web server"
- **Status**: ⚠️ **PARTIALLY IMPLEMENTED**
- **Evidence**: Used in shell scripts (`nginx.sh`, `webapp.sh`, `healthcheck.sh`) but NOT imported into `acarshub_configuration.py`
- **Impact**: Works for container lifecycle but not available to Python application
- **Recommendation**: Add to `acarshub_configuration.py` for consistency, or document that it's shell-only

### 1.3 `TAR1090_URL`

- **Documented Default**: Blank
- **Purpose (per docs)**: "Generate link to tar1090 instance"
- **Status**: ⚠️ **DECENTRALIZED IMPLEMENTATION**
- **Evidence**: Used directly in `acarshub_helpers.py:37-44` but NOT managed through `acarshub_configuration.py`
- **Impact**: Works but inconsistent with configuration pattern
- **Recommendation**: Move to central configuration file for consistency

## 2. Variables Used But NOT Documented

These variables are implemented and functional but missing from user-facing documentation:

### 2.1 Port Configuration (5 variables)

| Variable            | Default | Used In                                                        | Purpose                       |
| ------------------- | ------- | -------------------------------------------------------------- | ----------------------------- |
| `ACARS_SOURCE_PORT` | `15550` | `acarshub_configuration.py:147-149`<br>`acarshub.py:971-975`   | ACARS decoder listener port   |
| `VDLM_SOURCE_PORT`  | `15555` | `acarshub_configuration.py:151-153`<br>`acarshub.py:992-996`   | VDLM2 decoder listener port   |
| `HFDL_SOURCE_PORT`  | `15556` | `acarshub_configuration.py:155-157`<br>`acarshub.py:1008-1012` | HFDL decoder listener port    |
| `IMSL_SOURCE_PORT`  | `15557` | `acarshub_configuration.py:159-161`<br>`acarshub.py:1024-1028` | Inmarsat L-Band listener port |
| `IRDM_SOURCE_PORT`  | `15558` | `acarshub_configuration.py:163-165`<br>`acarshub.py:1040-1044` | Iridium decoder listener port |

**Impact**: Users cannot customize internal ports for multi-instance setups or port conflicts

**Recommendation**: Document in README.md under new "Advanced Configuration" section

### 2.2 Database Configuration (3 variables)

| Variable        | Default                            | Used In                                                                                                            | Purpose                                  |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `ACARSHUB_DB`   | `sqlite:////run/acars/messages.db` | `acarshub_configuration.py:168-172`<br>`acarshub_database.py:88-92`<br>`upgrade_db.py:68-72`                       | Primary database URL (SQLAlchemy format) |
| `RRD_DB_PATH`   | `/run/acars/`                      | `acarshub_configuration.py:174-178`<br>`acarshub.py:389-397`<br>`acarshub.py:1089-1091`<br>`acarshub.py:1735-1745` | RRD statistics database path             |
| `DB_LEGACY_FIX` | `False`                            | `acarshub_configuration.py:243-244`                                                                                | Legacy database migration flag           |

**Impact**: Users with custom database requirements cannot discover these options

**Recommendation**: Document `ACARSHUB_DB` and `RRD_DB_PATH` in README.md; determine if `DB_LEGACY_FIX` is still needed

### 2.3 Feature Configuration (4 variables)

| Variable              | Default                                | Used In                                                       | Purpose                             |
| --------------------- | -------------------------------------- | ------------------------------------------------------------- | ----------------------------------- |
| `ALERT_STAT_TERMS`    | 17 default keywords                    | `acarshub_configuration.py:189-210`                           | Alert keywords for message matching |
| `LIVE_DATA_SOURCE`    | `127.0.0.1`                            | `acarshub_configuration.py:123-124`<br>`acarshub.py:971-1044` | Remote data source IP override      |
| `ADSB_BYPASS_URL`     | `False`                                | `acarshub_configuration.py:232-233`                           | Bypass ADSB URL validation          |
| `FLIGHT_TRACKING_URL` | `https://flightaware.com/live/flight/` | `acarshub_configuration.py:98-99`                             | Flight tracking link base URL       |

**Impact**: Advanced users cannot customize alert terms or flight tracking integration

**Recommendation**: Document `ALERT_STAT_TERMS` and `FLIGHT_TRACKING_URL`; verify if `ADSB_BYPASS_URL` is used

### 2.4 Development/Testing (1 variable)

| Variable     | Default | Used In                                                                                                                                                            | Purpose                                                                               |
| ------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `LOCAL_TEST` | `False` | `acarshub_configuration.py:117-122`<br>`acarshub.py:55-58`<br>`acarshub.py:659-663`<br>`acarshub.py:1060-1070`<br>`acarshub.py:1989-1995`<br>`upgrade_db.py:60-62` | Development mode (changes port to 8080, enables Flask debug, disables reloader guard) |

**Impact**: Developers unaware of this flag may struggle with local development

**Recommendation**: Document in `DEVELOPMENT.md` or `DEV-QUICK-START.md` (already partially documented there)

## 3. Variables Read But Never Used

These variables are read from environment and stored in configuration, but the configuration variables are **never referenced** in application logic:

### 3.1 Alert Configuration

**Variable**: `ALERT_STAT_TERMS`

- **Read**: `acarshub_configuration.py:189-210`
- **Stored in**: `ALERT_STAT_TERMS` (list)
- **Referenced**: ❌ No references to `acarshub_configuration.ALERT_STAT_TERMS` found
- **Status**: Set-and-forget (defaults are used, but custom values ignored)
- **Recommendation**: Verify if alert terms are actually pulled from configuration or if they're hardcoded elsewhere

### 3.2 ADSB Configuration

**Variable**: `ADSB_BYPASS_URL`

- **Read**: `acarshub_configuration.py:232-233`
- **Stored in**: `ADSB_BYPASS_URL` (boolean)
- **Referenced**: ❌ No references found in any Python file
- **Status**: Set-and-forget (no effect)
- **Recommendation**: Remove from configuration or implement the bypass logic

### 3.3 Database Configuration

**Variable**: `DB_LEGACY_FIX`

- **Read**: `acarshub_configuration.py:243-244`
- **Stored in**: `DB_LEGACY_FIX` (boolean)
- **Referenced**: ❌ No references found in any Python file
- **Status**: Set-and-forget (no effect)
- **Recommendation**: Remove if legacy migration is complete

### 3.4 Version Tracking (5 variables with issues)

#### `ACARSHUB_VERSION`

- **Read**: `acarshub_configuration.py:262` (from `/version` file)
- **Stored in**: `ACARSHUB_VERSION`
- **Also copied to**: `CURRENT_ACARS_HUB_VERSION` (line 263)
- **Referenced**: ❌ No references to `acarshub_configuration.ACARSHUB_VERSION`
- **Status**: Immediately replaced by `CURRENT_ACARS_HUB_VERSION`

#### `ACARSHUB_BUILD`

- **Read**: `acarshub_configuration.py:265` (from `/version` file)
- **Stored in**: `ACARSHUB_BUILD`
- **Also copied to**: `CURRENT_ACARS_HUB_BUILD` (line 265)
- **Referenced**: ❌ No references to `acarshub_configuration.ACARSHUB_BUILD`
- **Status**: Immediately replaced by `CURRENT_ACARS_HUB_BUILD`

#### `CURRENT_ACARS_HUB_VERSION`

- **Initialized**: `acarshub_configuration.py:87` (default `"0"`)
- **Set from**: `ACARSHUB_VERSION` (line 263)
- **Referenced**: ❌ No references found in codebase
- **Status**: Set but never used

#### `CURRENT_ACARS_HUB_BUILD`

- **Initialized**: `acarshub_configuration.py:88` (default `"0"`)
- **Set from**: `ACARSHUB_BUILD` (line 265)
- **Referenced**: ❌ No references found in codebase
- **Status**: Set but never used

#### `IS_UPDATE_AVAILABLE`

- **Initialized**: `acarshub_configuration.py:88` (default `False`)
- **Set**: Never modified from `False`
- **Referenced**: ❌ No references found in codebase
- **Status**: Placeholder variable, never used

**Recommendation**: Simplify version tracking to single pair of variables (`ACARSHUB_VERSION`/`ACARSHUB_BUILD`) OR use the `CURRENT_*` versions, not both. Implement version checking logic or remove `IS_UPDATE_AVAILABLE`.

## 4. Correctly Implemented Variables

These variables are properly documented AND used (sample list):

### General Configuration

- ✅ `DB_SAVEALL` - Documented, implemented, used in message filtering
- ✅ `DB_SAVE_DAYS` - Documented, implemented, used in `upgrade_db.py:335-336`
- ✅ `DB_ALERT_SAVE_DAYS` - Documented, implemented, used in `upgrade_db.py:362-363`
- ✅ `DB_BACKUP` - Documented, implemented, used in `acarshub_database.py:98-101`
- ✅ `IATA_OVERRIDE` - Documented, implemented, used in `acarshub_database.py:119-133`
- ✅ `ALLOW_REMOTE_UPDATES` - Documented, implemented, used throughout webapp
- ✅ `HIDE_VERSION_UPDATE` - Documented, implemented, used
- ✅ `DB_FTS_OPTIMIZE` - Documented, implemented, used in `upgrade_db.py:383-393`

### Decoder Configuration

- ✅ `ENABLE_ACARS` - Documented, implemented, used
- ✅ `ENABLE_VDLM` - Documented, implemented, used
- ✅ `ENABLE_HFDL` - Documented, implemented, used
- ✅ `ENABLE_IMSL` - Documented, implemented, used
- ✅ `ENABLE_IRDM` - Documented, implemented, used

### ADSB Configuration

- ✅ `ENABLE_ADSB` - Documented, implemented, used
- ✅ `ADSB_URL` - Documented, implemented, used in `acarshub.py:329-341`
- ✅ `ADSB_LAT` - Documented, implemented, sent to frontend
- ✅ `ADSB_LON` - Documented, implemented, sent to frontend
- ✅ `DISABLE_RANGE_RINGS` - Documented, implemented (inverted to `ENABLE_RANGE_RINGS`)

### Logging Configuration

- ✅ `MIN_LOG_LEVEL` - Documented, implemented in `acarshub_logging.py:52-56`
- ✅ `QUIET_MESSAGES` - Documented, implemented, used in `acarshub.py:843-847`

### Special Variables (Not Environment Variables)

- ✅ `AUTO_VACUUM` - Documented, used directly in `upgrade_db.py:410-434` (not via config file)

## 5. Recommendations by Priority

### 🔴 Critical (Pre-v4 Release)

1. **Document port configuration variables** (`ACARS_SOURCE_PORT`, etc.)
   - Add to README.md under new "Advanced Configuration" section
   - Users need these for multi-instance or custom port setups

2. **Remove or implement `FEED` variable**
   - Either implement ACARS.io feeding or remove from documentation
   - Current state misleads users

3. **Document `ACARSHUB_DB` and `RRD_DB_PATH`**
   - Critical for users with custom database requirements
   - Add to README.md under "Database Configuration" section

### 🟡 High Priority (v4.x Updates)

1. **Clean up version tracking variables**
   - Choose ONE set: `ACARSHUB_VERSION/BUILD` OR `CURRENT_ACARS_HUB_VERSION/BUILD`
   - Remove duplicate variables
   - Implement or remove `IS_UPDATE_AVAILABLE`

2. **Verify and document/remove unused variables**
   - `ALERT_STAT_TERMS` - Verify if custom terms actually work
   - `ADSB_BYPASS_URL` - Implement or remove
   - `DB_LEGACY_FIX` - Remove if migration is complete

3. **Centralize `TAR1090_URL` configuration**
   - Move from `acarshub_helpers.py` into `acarshub_configuration.py`
   - Maintain consistency with other configuration variables

4. **Add `ENABLE_WEB` to Python configuration**
   - Currently only in shell scripts
   - May be needed for future Python-side logic

### 🟢 Medium Priority (Future Releases)

1. **Document advanced features**
   - `FLIGHT_TRACKING_URL` - For custom flight tracking integration
   - `LIVE_DATA_SOURCE` - For distributed/remote decoder setups

2. **Improve development documentation**
   - `LOCAL_TEST` is partially documented but should be more prominent
   - Create comprehensive development environment variable guide

## 6. Summary Statistics

| Category                           | Count |
| ---------------------------------- | ----- |
| **Total variables in README.md**   | 22    |
| **Documented but not implemented** | 3     |
| **Used but not documented**        | 17    |
| **Read but never used**            | 8     |
| **Correctly implemented**          | ~18   |

## 7. Implementation Notes

### Variables Read Directly (Not via acarshub_configuration.py)

These variables bypass the central configuration module:

- `ENABLE_WEB` - Read in shell scripts only
- `TAR1090_URL` - Read in `acarshub_helpers.py`
- `AUTO_VACUUM` - Read in `upgrade_db.py`
- `DB_FTS_OPTIMIZE` - Read in both `acarshub_configuration.py` AND `upgrade_db.py`
- `MIN_LOG_LEVEL` - Read in `acarshub_logging.py`
- `SQLALCHEMY_URL` - Set by `upgrade_db.py` (internal, not user-facing)

**Recommendation**: Consider whether centralization would improve maintainability.

### Pattern: `is_enabled()` Function

The `is_enabled()` helper function (lines 24-49) supports multiple enabled values:

- `"1"`, `"true"`, `"on"`, `"enabled"`, `"enable"`, `"yes"`, `"y"`, `"ok"`, `"always"`, `"set"`, `"external"`

This is used for decoder enable flags and provides backward compatibility with legacy `"external"` value.

## 8. Files Analyzed

- `docker-acarshub/rootfs/webapp/acarshub_configuration.py` (primary configuration)
- `docker-acarshub/README.md` (user documentation)
- `docker-acarshub/rootfs/webapp/acarshub.py` (main webapp)
- `docker-acarshub/rootfs/webapp/acarshub_database.py` (database layer)
- `docker-acarshub/rootfs/webapp/acarshub_helpers.py` (helper functions)
- `docker-acarshub/rootfs/webapp/acarshub_logging.py` (logging configuration)
- `docker-acarshub/rootfs/scripts/upgrade_db.py` (database migrations)
- `docker-acarshub/rootfs/etc/s6-overlay/scripts/*.sh` (service scripts)
- `docker-acarshub/rootfs/scripts/healthcheck.sh` (container health checks)

---

**Report Generated**: 2025-01-XX

**Next Steps**: Review recommendations, update documentation, clean up unused variables before v4 release.
