#!/usr/bin/env python3

# Copyright (C) 2022 Frederick Clausen II
# This file is part of acarshub <https://github.com/fredclausen/docker-acarshub>.
#
# acarshub is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# acarshub is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

import logging
import os
import sys
import requests

# debug levels

DEBUG_LOGGING = False
EXTREME_LOGGING = False
QUIET_LOGS = False
QUIET_MESSAGES = False
LOCAL_TEST = False
ENABLE_ACARS = False
ENABLE_VDLM = False
DB_SAVEALL = False
ACARSHUB_DB = ""
IATA_OVERRIDE = ""
DB_BACKUP = ""
ALERT_STAT_TERMS = []
ENABLE_ADSB = False
ADSB_URL = "http://tar1090/data/aircraft.json"
ADSB_LAT = 0
ADSB_LON = 0
ADSB_BYPASS_URL = False
ACARS_WEB_PORT = 8888  # default port for nginx proxying. LOCAL_TEST will change this to 80 for running outside of docker
LIVE_DATA_SOURCE = "127.0.0.1"  # This is to switch from localhost for ACARS/VDLM to connecting to a remote data source
ACARSHUB_VERSION = "0"
ACARSHUB_BUILD = "0"
CURRENT_ACARS_HUB_VERSION = "0"
CURRENT_ACARS_HUB_BUILD = "0"
IS_UPDATE_AVAILABLE = False
ENABLE_RANGE_RINGS = True
FEED = False
ARCH = "unknown"
DB_SAVE_DAYS = 7
DB_ALERT_SAVE_DAYS = 120

logger = logging.getLogger("werkzeug")


def log(msg, source):
    logger.error(f"[{source}]: {msg}")
    sys.stdout.flush()


if os.getenv("FEED", default=False) and str(os.getenv("FEED")).upper() == "TRUE":
    FEED = True

if (
    os.getenv("DEBUG_LOGGING", default=False)
    and str(os.getenv("DEBUG_LOGGING")).upper() == "TRUE"
):
    DEBUG_LOGGING = True
if (
    os.getenv("EXTREME_LOGGING", default=False)
    and str(os.getenv("EXTREME_LOGGING")).upper() == "TRUE"
):
    EXTREME_LOGGING = True
if (
    os.getenv("QUIET_LOGS", default=False)
    and str(os.getenv("QUIET_LOGS")).upper() == "TRUE"
):
    QUIET_LOGS = True

if (
    os.getenv("QUIET_MESSAGES", default=False)
    and str(os.getenv("QUIET_MESSAGES")).upper() == "TRUE"
):
    QUIET_MESSAGES = True
elif not os.getenv("QUIET_MESSAGES", default=False):
    QUIET_MESSAGES = True

# Application states

if (
    os.getenv("LOCAL_TEST", default=False)
    and str(os.getenv("LOCAL_TEST")).upper() == "TRUE"
):
    LOCAL_TEST = True
    ACARS_WEB_PORT = 80
if os.getenv("LIVE_DATA_SOURCE", default=False):
    LIVE_DATA_SOURCE = os.getenv("LIVE_DATA_SOURCE")
if (
    os.getenv("ENABLE_ACARS", default=False)
    and str(os.getenv("ENABLE_ACARS")).upper() == "EXTERNAL"
):
    ENABLE_ACARS = True
if (
    os.getenv("ENABLE_VDLM", default=False)
    and str(os.getenv("ENABLE_VDLM")).upper() == "EXTERNAL"
):
    ENABLE_VDLM = True

if (
    os.getenv("DB_SAVEALL", default=False)
    and str(os.getenv("DB_SAVEALL")).upper() == "TRUE"
):
    DB_SAVEALL = True

# Application Settings

if os.getenv("ACARSHUB_DB", default=False):
    ACARSHUB_DB = os.getenv("ACARSHUB_DB", default=False)
else:
    ACARSHUB_DB = "sqlite:////run/acars/messages.db"

if os.getenv("DB_BACKUP", default=False):
    DB_BACKUP = os.getenv("DB_BACKUP")

if os.getenv("IATA_OVERRIDE", default=False):
    IATA_OVERRIDE = os.getenv("IATA_OVERRIDE")

if os.getenv("ALERT_STAT_TERMS", default=False):
    ALERT_STAT_TERMS = os.getenv("ALERT_STAT_TERMS").split(",")
else:
    ALERT_STAT_TERMS = [
        "cop",
        "police",
        "authorities",
        "chop",
        "turbulence",
        "turb",
        "fault",
        "divert",
        "mask",
        "csr",
        "agent",
        "medical",
        "security",
        "mayday",
        "emergency",
        "pan",
        "red coat",
    ]

if (
    os.getenv("ENABLE_ADSB", default=False)
    and str(os.getenv("ENABLE_ADSB")).upper() == "TRUE"
):
    ENABLE_ADSB = True
    if os.getenv("ADSB_URL", default=False):
        ADSB_URL = os.getenv("ADSB_URL", default=False)

        if not ADSB_URL.startswith("http") and not ADSB_URL.endswith("aircraft.json"):
            ENABLE_ADSB = False
            log(
                f"ADSB URL ({ADSB_URL}) appears to be malformed. Disabling ADSB", "init"
            )
    if os.getenv("ADSB_LON", default=False):
        ADSB_LON = float(os.getenv("ADSB_LON"))
    if os.getenv("ADSB_LAT", default=False):
        ADSB_LAT = float(os.getenv("ADSB_LAT"))
    if (
        os.getenv("DISABLE_RANGE_RINGS", default=False)
        and str(os.getenv("DISABLE_RANGE_RINGS")).upper() == "TRUE"
    ):
        ENABLE_RANGE_RINGS = False

if os.getenv("ADSB_BYPASS_URL", default=False):
    ADSB_BYPASS_URL = True

if os.getenv("DB_SAVE_DAYS", default=False):
    DB_SAVE_DAYS = int(os.getenv("DB_SAVE_DAYS"))

if os.getenv("DB_ALERT_SAVE_DAYS", default=False):
    DB_ALERT_SAVE_DAYS = int(os.getenv("DB_ALERT_SAVE_DAYS"))

if LOCAL_TEST:
    version_path = "../../VERSION"
else:
    version_path = "/acarshub-version"
with open(version_path, "r") as f:
    lines = f.read()
    ACARSHUB_VERSION = lines.split("\n")[0].split(" ")[0].replace("v", "")
    CURRENT_ACARS_HUB_VERSION = ACARSHUB_VERSION
    ACARSHUB_BUILD = lines.split("\n")[0].split(" ")[2].replace("v", "")
    CURRENT_ACARS_HUB_BUILD = ACARSHUB_BUILD

if not LOCAL_TEST and os.path.exists("/arch"):
    with open("/arch", "r") as f:
        lines = f.read()
        ARCH = lines.split("\n")[0]


def check_github_version():
    global CURRENT_ACARS_HUB_VERSION
    global ACARSHUB_VERSION
    global ACARSHUB_BUILD
    global CURRENT_ACARS_HUB_BUILD
    global IS_UPDATE_AVAILABLE
    # FIXME: This is a hack to get around the fact that the version file is not updated on the build server
    if not LOCAL_TEST:
        r = requests.get(
            "https://raw.githubusercontent.com/fredclausen/docker-acarshub/main/version"
        )
        CURRENT_ACARS_HUB_VERSION = r.text.split("\n")[0].split(" ")[0].replace("v", "")
        CURRENT_ACARS_HUB_BUILD = r.text.split("\n")[0].split(" ")[2].replace("v", "")

        if (
            CURRENT_ACARS_HUB_VERSION != ACARSHUB_VERSION
            and ACARSHUB_VERSION < CURRENT_ACARS_HUB_VERSION
        ) or (
            CURRENT_ACARS_HUB_BUILD != ACARSHUB_BUILD
            and ACARSHUB_BUILD < CURRENT_ACARS_HUB_BUILD
        ):
            log("Update found", "version-checker")
            IS_UPDATE_AVAILABLE = True
        else:
            if not QUIET_LOGS:
                log("No update found", "version-checker")
            IS_UPDATE_AVAILABLE = False


def get_version():
    global CURRENT_ACARS_HUB_VERSION
    global CURRENT_ACARS_HUB_BUILD
    global ACARSHUB_VERSION
    global ACARSHUB_BUILD
    global IS_UPDATE_AVAILABLE
    return {
        "github_version": "v"
        + CURRENT_ACARS_HUB_VERSION
        + " Build "
        + CURRENT_ACARS_HUB_BUILD,
        "container_version": "v" + ACARSHUB_VERSION + " Build " + ACARSHUB_BUILD,
        "is_outdated": IS_UPDATE_AVAILABLE,
    }


def acars_traceback(e, source):
    logger.exception(f"[{source}]: {e}")
