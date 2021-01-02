#!/usr/bin/env python3

import rrdtool
import os


def update_db(vdlm=0, acars=0, error=0):
    import sys
    total = vdlm + acars

    if os.getenv("DEBUG_LOGGING", default=False):
        print(f"[rrdtool] updating VDLM with {vdlm}, ACARS with {acars}, Errors with {error}")
        sys.stdout.flush()
    try:
        rrdtool.update("/run/acars/acarshub.rrd", f"N:{acars}:{vdlm}:{total}:{error}")
    except Exception as e:
        print(e)
        sys.stdout.flush()


def create_db():
    if not os.path.exists("/run/acars/acarshub.rrd"):
        print("[rrdtool] creating the RRD Database")
        rrdtool.create("/run/acars/acarshub.rrd",
                       "--start", "N",
                       "--step", "60",
                       "DS:ACARS:GAUGE:120:U:U",
                       "DS:VDLM:GAUGE:120:U:U",
                       "DS:TOTAL:GAUGE:120:U:U",
                       "DS:ERROR:GAUGE:120:U:U",
                       "RRA:AVERAGE:0.5:1:1500",  # 25 hours at 1 minute reso
                       "RRA:AVERAGE:0.5:5:8640",  # 1 month at 5 minute reso
                       "RRA:AVERAGE:0.5:60:4320",  # 6 months at 1 hour reso
                       "RRA:AVERAGE:0.5:360:4380")  # 3 year at 6 hour reso
    else:
        print("[rrdtool] Database found")


def update_graphs():
    import sys
    if os.getenv("DEBUG_LOGGING", default=False):
        print("[rrdtool] Generating graphs")
        sys.stdout.flush()

    args = ["/webapp/static/images/1hour.png", "-a", "PNG", "--title", "1 Hour", "-w", "1000",
            "-h", "200", "--start", "-1h", "--vertical-label", "Messages", "--slope-mode"]

    if os.getenv("ENABLE_ACARS", default=False):
        args.append("DEF:messages-acars=/run/acars/acarshub.rrd:ACARS:AVERAGE")
        args.append("LINE1:messages-acars#660A60:ACARS")

    if os.getenv("ENABLE_VDLM", default=False):
        args.append("DEF:messages-vdlm=/run/acars/acarshub.rrd:VDLM:AVERAGE")
        args.append("LINE1:messages-vdlm#1E73BE:VDLM")

    if os.getenv("ENABLE_ACARS", default=False) and os.getenv("ENABLE_VDLM", default=False):
        args.append("DEF:messages-total=/run/acars/acarshub.rrd:TOTAL:AVERAGE")
        args.append("LINE1:messages-total#C850B0:Total")

    args.append("DEF:messages-error=/run/acars/acarshub.rrd:ERROR:AVERAGE")
    args.append("LINE1:messages-error#FF0000:Errors")

    try:
        # 1 Hour
        rrdtool.graph(*args)

        # 6 Hours
        args[0] = "/webapp/static/images/6hour.png"
        args[4] = "6 Hours"
        args[10] = "-6h"
        rrdtool.graph(*args)

        # 12 Hours

        args[0] = "/webapp/static/images/12hour.png"
        args[4] = "12 Hours"
        args[10] = "-12h"
        rrdtool.graph(*args)

        # 24 Hours

        args[0] = "/webapp/static/images/24hours.png"
        args[4] = "1 Day"
        args[10] = "-1d"
        rrdtool.graph(*args)

        # 1 Week

        args[0] = "/webapp/static/images/1week.png"
        args[4] = "1 Week"
        args[10] = "-1w"
        rrdtool.graph(*args)

        # 30 Days

        args[0] = "/webapp/static/images/30days.png"
        args[4] = "1 Month"
        args[10] = "-1mon"
        rrdtool.graph(*args)

        # 6 Months

        args[0] = "/webapp/static/images/6months.png"
        args[4] = "6 Months"
        args[10] = "-6mon"
        rrdtool.graph(*args)

        # 1 year

        args[0] = "/webapp/static/images/1year.png"
        args[4] = "1 Year"
        args[10] = "-1yr"

        rrdtool.graph(*args)

    except Exception as e:
        print(e)

    if os.getenv("DEBUG_LOGGING", default=False):
        print("[rrdtool] Generating graphs complete")
