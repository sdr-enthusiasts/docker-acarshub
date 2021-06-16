#!/usr/bin/env python3

import os

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
ACARS_WEB_PORT = (
    8888
)  # default port for nginx proxying. SPAM will change this to 80 for running outside of docker
LIVE_DATA_SOURCE = (
    "127.0.0.1"
)  # This is to switch from localhost for ACARS/VDLM to connecting to a remote data source


def log(msg, source):
    print(f"[{source}]: {msg}")


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

if os.getenv("ENABLE_ADSB", default=False):
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


def acars_traceback(e, source):
    traceback = e.__traceback__
    print(f"[{source}] An error has occurred: " + str(e))
    while traceback:
        print(
            "{}: {}".format(traceback.tb_frame.f_code.co_filename, traceback.tb_lineno)
        )
        traceback = traceback.tb_next
