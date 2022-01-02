#!/usr/bin/env python3

import rrdtool
import acarshub_helpers
import os


def update_db(vdlm=0, acars=0, error=0):
    import sys

    total = vdlm + acars

    try:
        rrdtool.update("/run/acars/acarshub.rrd", f"N:{acars}:{vdlm}:{total}:{error}")
        if acarshub_helpers.DEBUG_LOGGING:
            acarshub_helpers.log(
                f"rrdtool.update: N:{acars}:{vdlm}:{total}:{error}", "rrdtool"
            )
    except Exception as e:
        acarshub_helpers.acars_traceback(e, "rrdtool")


def create_db():
    try:
        if not os.path.exists("/run/acars/acarshub.rrd"):
            acarshub_helpers.log("creating the RRD Database", "rrdtool")
            rrdtool.create(
                "/run/acars/acarshub.rrd",
                "--start",
                "N",
                "--step",
                "60",
                "DS:ACARS:GAUGE:120:U:U",
                "DS:VDLM:GAUGE:120:U:U",
                "DS:TOTAL:GAUGE:120:U:U",
                "DS:ERROR:GAUGE:120:U:U",
                "RRA:AVERAGE:0.5:1:1500",  # 25 hours at 1 minute reso
                "RRA:AVERAGE:0.5:5:8640",  # 1 month at 5 minute reso
                "RRA:AVERAGE:0.5:60:4320",  # 6 months at 1 hour reso
                "RRA:AVERAGE:0.5:360:4380",  # 3 year at 6 hour reso
            )
    except Exception as e:
        acarshub_helpers.acars_traceback(e, "rrdtool")
    else:
        acarshub_helpers.log("Database found", "rrdtool")
