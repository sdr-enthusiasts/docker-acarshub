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

if os.getenv("DEBUG_LOGGING", default=False):
    DEBUG_LOGGING = True
if os.getenv("EXTREME_LOGGING", default=False):
    EXTREME_LOGGING = True

# Application states

if os.getenv("SPAM", default=False):
    SPAM = True
if os.getenv("ENABLE_ACARS", default=False):
    ENABLE_ACARS = True
if os.getenv("ENABLE_VDLM", default=False):
    ENABLE_VDLM = True
if os.getenv("FREQS_ACARS", default=False):
    FREQS_ACARS = os.getenv("FREQS_ACARS")
if os.getenv("FREQS_VDLM", default=False):
    FREQS_VDLM = os.getenv("FREQS_VDLM")
if os.getenv("DB_SAVEALL", default=False):
    DB_SAVEALL = True

# Application Settings

if os.getenv("ACARSHUB_DB"):
    ACARSHUB_DB = os.getenv("ACARSHUB_DB", default=False)
else:
    ACARSHUB_DB = 'sqlite:////run/acars/messages.db'

if os.getenv("IATA_OVERRIDE", default=False):
    IATA_OVERRIDE = os.getenv("IATA_OVERRIDE")


def acars_traceback(e, source):
    traceback = e.__traceback__
    print(f"[{source}] An error has occurred: " + str(e))
    while traceback:
        print("{}: {}".format(traceback.tb_frame.f_code.co_filename, traceback.tb_lineno))
        traceback = traceback.tb_next
