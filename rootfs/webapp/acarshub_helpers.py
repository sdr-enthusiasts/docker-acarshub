#!/usr/bin/env python3

import os
import sys
import requests

# debug levels

DEBUG_LOGGING = False
EXTREME_LOGGING = False
SPAM = False
ENABLE_ACARS = False
ENABLE_VDLM = False
DB_SAVEALL = False
ACARSHUB_DB = ""
IATA_OVERRIDE = ""
FREQS_ACARS = ""
FREQS_VDLM = ""
DB_SAVE_DAYS = 7
DB_BACKUP = ""
ALERT_STAT_TERMS = []
ENABLE_ADSB = False
ADSB_URL = "http://tar1090/data/aircraft.json"
ADSB_LAT = 0
ADSB_LON = 0
ADSB_BYPASS_URL = False
ACARS_WEB_PORT = 8888  # default port for nginx proxying. SPAM will change this to 80 for running outside of docker
LIVE_DATA_SOURCE = "127.0.0.1"  # This is to switch from localhost for ACARS/VDLM to connecting to a remote data source
ACARSHUB_VERSION = "0"
ACARSHUB_BUILD = "0"
CURRENT_ACARS_HUB_VERSION = "0"
CURRENT_ACARS_HUB_BUILD = "0"
IS_UPDATE_AVAILABLE = False


import logging
logger = logging.getLogger("werkzeug")


def log(msg, source):
    logger.error(f"[{source}]: {msg}")


if os.getenv("DEBUG_LOGGING", default=False):
    DEBUG_LOGGING = True
if os.getenv("EXTREME_LOGGING", default=False):
    EXTREME_LOGGING = True

# Application states

if os.getenv("SPAM", default=False):
    SPAM = True
    ACARS_WEB_PORT = 80
if os.getenv("LIVE_DATA_SOURCE", default=False):
    LIVE_DATA_SOURCE = os.getenv("LIVE_DATA_SOURCE")
if os.getenv("ENABLE_ACARS", default=False):
    ENABLE_ACARS = True
if os.getenv("ENABLE_VDLM", default=False):
    ENABLE_VDLM = True
if os.getenv("FREQS_ACARS", default=False):
    FREQS_ACARS = os.getenv("FREQS_ACARS")

index = 0

while True:
    if os.getenv(f"ACARS_FREQ_{index}", default=False):
        if FREQS_ACARS == "":
            FREQS_ACARS += os.getenv(f"ACARS_FREQ_{index}")
        else:
            FREQS_ACARS += ";" + os.getenv(f"ACARS_FREQ_{index}")
        index += 1
    else:
        break

if os.getenv("FREQS_VDLM", default=False):
    FREQS_VDLM = os.getenv("FREQS_VDLM")

index = 0

while True:
    if os.getenv(f"VDLM_FREQ_{index}", default=False):
        if FREQS_VDLM == "":
            FREQS_VDLM += os.getenv(f"VDLM_FREQ_{index}")
        else:
            FREQS_VDLM += ";" + os.getenv(f"VDLM_FREQ_{index}")

        index += 1
    else:
        break

if os.getenv("DB_SAVEALL", default=False):
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

if os.getenv("DB_SAVE_DAYS", default=False):
    DB_SAVE_DAYS = int(os.getenv("DB_SAVE_DAYS"))

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

if os.getenv("ENABLE_ADSB", default=False) == "true":
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

if os.getenv("ADSB_BYPASS_URL", default=False):
    ADSB_BYPASS_URL = True


if SPAM:
    version_path = "../../VERSION"
else:
    version_path = "/acarshub-version"
with open(version_path, "r") as f:
    lines = f.read()
    ACARSHUB_VERSION = lines.split("\n")[0].split(" ")[0].replace("v", "")
    CURRENT_ACARS_HUB_VERSION = ACARSHUB_VERSION
    ACARSHUB_BUILD = lines.split("\n")[0].split(" ")[2].replace("v", "")
    CURRENT_ACARS_HUB_BUILD = ACARSHUB_BUILD


def check_github_version():
    global CURRENT_ACARS_HUB_VERSION
    global ACARSHUB_VERSION
    global ACARSHUB_BUILD
    global CURRENT_ACARS_HUB_BUILD
    global IS_UPDATE_AVAILABLE
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
    logger.exception(f"[{source}]")
