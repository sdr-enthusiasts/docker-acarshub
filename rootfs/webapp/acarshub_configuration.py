#!/usr/bin/env python3

# Copyright (C) 2022-2024 Frederick Clausen II
# This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
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


import json
import os

import urllib
import acarshub_logging
from acarshub_logging import LOG_LEVEL

# debug levels

QUIET_MESSAGES = False
LOCAL_TEST = False
ENABLE_ACARS = False
ENABLE_VDLM = False
ENABLE_HFDL = False
ENABLE_IMSL = False
ENABLE_IRDM = False
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
ACARS_WEB_PORT = 8888  # default port for nginx proxying. LOCAL_TEST will change this to 8080 for running outside of docker
ACARS_SOURCE_PORT = 15550
VDLM_SOURCE_PORT = 15555
HFDL_SOURCE_PORT = 15556
IMSL_SOURCE_PORT = 15557
IRDM_SOURCE_PORT = 15558
LIVE_DATA_SOURCE = "127.0.0.1"  # This is to switch from localhost for ACARS/VDLM to connecting to a remote data source
ACARSHUB_VERSION = "0"
ACARSHUB_BUILD = "0"
CURRENT_ACARS_HUB_VERSION = "0"
CURRENT_ACARS_HUB_BUILD = "0"
IS_UPDATE_AVAILABLE = False
ENABLE_RANGE_RINGS = True
ARCH = "unknown"
DB_SAVE_DAYS = 7
DB_ALERT_SAVE_DAYS = 120
ALLOW_REMOTE_UPDATES = True
FLIGHT_TRACKING_URL = "https://flightaware.com/live/flight/"

if os.getenv("FLIGHT_TRACKING_URL", default=False):
    FLIGHT_TRACKING_URL = os.getenv("FLIGHT_TRACKING_URL", default=False)

if (
    os.getenv("QUIET_MESSAGES", default=False)
    and str(os.getenv("QUIET_MESSAGES")).upper() == "TRUE"
):
    QUIET_MESSAGES = True
elif not os.getenv("QUIET_MESSAGES", default=False):
    QUIET_MESSAGES = True

# Application states

if (
    os.getenv("ALLOW_REMOTE_UPDATES", default=False)
    and str(os.getenv("ALLOW_REMOTE_UPDATES")).upper() == "FALSE"
):
    ALLOW_REMOTE_UPDATES = False

if (
    os.getenv("LOCAL_TEST", default=False)
    and str(os.getenv("LOCAL_TEST")).upper() == "TRUE"
):
    LOCAL_TEST = True
    ACARS_WEB_PORT = 8080
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
    os.getenv("ENABLE_HFDL", default=False)
    and str(os.getenv("ENABLE_HFDL")).upper() == "EXTERNAL"
):
    ENABLE_HFDL = True

if (
    os.getenv("ENABLE_IMSL", default=False)
    and str(os.getenv("ENABLE_IMSL")).upper() == "EXTERNAL"
):
    ENABLE_IMSL = True

if (
    os.getenv("ENABLE_IRDM", default=False)
    and str(os.getenv("ENABLE_IRDM")).upper() == "EXTERNAL"
):
    ENABLE_IRDM = True

if (
    os.getenv("DB_SAVEALL", default=False)
    and str(os.getenv("DB_SAVEALL")).upper() == "TRUE"
):
    DB_SAVEALL = True

if os.getenv("ACARS_SOURCE_PORT", default=False):
    ACARS_SOURCE_PORT = int(os.getenv("ACARS_SOURCE_PORT"))

if os.getenv("VDLM_SOURCE_PORT", default=False):
    VDLM_SOURCE_PORT = int(os.getenv("VDLM_SOURCE_PORT"))

if os.getenv("HFDL_SOURCE_PORT", default=False):
    HFDL_SOURCE_PORT = int(os.getenv("HFDL_SOURCE_PORT"))

if os.getenv("IMSL_SOURCE_PORT", default=False):
    IMSL_SOURCE_PORT = int(os.getenv("IMSL_SOURCE_PORT"))

if os.getenv("IRDM_SOURCE_PORT", default=False):
    IRDM_SOURCE_PORT = int(os.getenv("IRDM_SOURCE_PORT"))

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
            acarshub_logging.log(
                f"ADSB URL ({ADSB_URL}) appears to be malformed. Disabling ADSB",
                "init",
                level=LOG_LEVEL["ERROR"],
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
    version_path = "../../version"
else:
    version_path = "/version"

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
    global IS_UPDATE_AVAILABLE
    IS_UPDATE_AVAILABLE = False
    global CURRENT_ACARS_HUB_VERSION
    global ACARSHUB_VERSION
    global ACARSHUB_BUILD
    global CURRENT_ACARS_HUB_BUILD
    # FIXME: This is a hack to get around the fact that the version file is not updated on the build server
    if not LOCAL_TEST:
        try:
            operUrl = urllib.request.urlopen(
                "https://api.github.com/repos/sdr-enthusiasts/docker-acarshub/releases/latest"
            )
            if operUrl.getcode() == 200:
                data = operUrl.read()
                jsonData = json.loads(data)
            else:
                print("Error receiving data", operUrl.getcode())
        except Exception as e:
            acarshub_logging.log(
                "Error getting latest version from github",
                "version_checker",
                level=LOG_LEVEL["ERROR"],
            )
            acarshub_logging.acars_traceback(e, "version_checker")
            return

        github_version_from_json = jsonData["name"]
        print(github_version_from_json)

        CURRENT_ACARS_HUB_VERSION = (
            github_version_from_json.split("\n")[0].split(" ")[0].replace("v", "")
        )
        CURRENT_ACARS_HUB_BUILD = (
            github_version_from_json.split("\n")[0].split(" ")[2].replace("v", "")
        )

        if ACARSHUB_BUILD == "0":
            acarshub_logging.log(
                "Detected a Pre-Release build.",
                "version-checker",
                level=LOG_LEVEL["WARNING"],
            )
            IS_UPDATE_AVAILABLE = False
            return

        if (
            CURRENT_ACARS_HUB_VERSION != ACARSHUB_VERSION
            and ACARSHUB_VERSION < CURRENT_ACARS_HUB_VERSION
        ) or (
            CURRENT_ACARS_HUB_BUILD != ACARSHUB_BUILD
            and ACARSHUB_BUILD < CURRENT_ACARS_HUB_BUILD
        ):
            acarshub_logging.log(
                "Update found", "version-checker", level=LOG_LEVEL["WARNING"]
            )
            IS_UPDATE_AVAILABLE = True
        else:
            acarshub_logging.log(
                "No update found", "version-checker", level=LOG_LEVEL["DEBUG"]
            )
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
