#!/usr/bin/env python3
import sys
import os

if os.getenv("GAIN", default=False):
    print(
        "WARNING. GAIN ENV variable is deprecated. Please see the github page for updated usage."
    )


if os.getenv("SERIAL_ACARS", default=False):
    print(
        "WARNING: SERIAL_ACARS is deprecated. If you are using this in conjunction with SERIAL unexpected results will happen. Please see the github readme for update usage."
    )


if os.getenv("SERIAL_VDLM", default=False):
    print(
        "WARNING: SERIAL_VDLM is deprecated. If you are using this in conjunction with SERIAL unexpected results will happen. Please see the github readme for update usage."
    )


if os.getenv("ENABLE_ACARS", default=False):
    if not os.getenv("STATION_ID_ACARS", default=False):
        print("Error: ACARS enabled with no STATION_ID_ACARS set. Exiting")
        sys.exit(1)

    if (
            not os.getenv("FREQS_ACARS", default=False)
            and not os.getenv("ACARS_FREQ_0", default=False)
            and os.getenv("ENABLE_ACARS", default=False) != "external"
            ):
        print("Error: ACARS enabled with no FREQS_ACARS or ACARS_FREQ_0. Exiting")
        sys.exit(1)


if os.getenv("ENABLE_VDLM", default=False):
    if not os.getenv("STATION_ID_VDLM", default=False):
        print("Error: VDLM enabled with no STATION_ID_VDLM set. Exiting")
        sys.exit(1)

    if (
            not os.getenv("FREQS_VDLM", default=False)
            and not os.getenv("VDLM_FREQ_0", default=False)
            and os.getenv("ENABLE_VDLM", default=False) != "external"
            ):
        print("Error: VDLM enabled with no FREQS_VDLM or VDLM_FREQ_0. Exiting")
        sys.exit(1)

if os.getenv("ENABLE_ADSB", default=False):
    ENABLE_ADSB = True
    if os.getenv("ADSB_URL", default=False):
        ADSB_URL = os.getenv("ADSB_URL", default=False)

        if not ADSB_URL.startswith("http") and not ADSB_URL.endswith("aircraft.json"):
            print("Error: ADSB_URL appears to be malformed. Exiting")
            sys.exit(1)
