#!/usr/bin/env python3

import rrdtool
import datetime
import os

def update_db(vdlm=0, acars=0):
    import sys
    dt = datetime.datetime.now()
    dt = dt.replace(microsecond=0)
    epoch = dt.replace().timestamp()

    total = vdlm + acars

    if os.getenv("DEBUG_LOGGING", default=False):
         print(f"[rrdtool] updating VDLM with {vdlm}, ACARS with {acars} at {epoch}")
         sys.stdout.flush()
    try:
        rrdtool.update("/run/acars/acarshub.rrd", f"N:{acars}:{vdlm}:{total}")
    except Exception as e:
        print(e)
        sys.stdout.flush()


def create_db():
    dt = datetime.datetime.now()

    if not os.path.exists("/run/acars/acarshub.rrd"):
        print("[rrdtool] creating the RRD Database")
        rrdtool.create("/run/acars/acarshub.rrd",
            "--start", "1609202173",
            "--step", "60",
            "DS:ACARS:GAUGE:120:U:U",
            "DS:VDLM:GAUGE:120:U:U",
            "DS:TOTAL:GAUGE:120:U:U",
            "RRA:MAX:0.5:1:1500",  # 25 hours at 1 minute reso
            "RRA:MAX:0.5:5:8640",  # 1 month at 5 minute reso
            "RRA:MAX:0.5:60:4320",  # 6 months at 1 hour reso
            "RRA:MAX:0.5:360:4380") # 3 year at 6 hour reso
    else:
        print("[rrdtool] Database found")


def update_graphs():
    import sys
    if os.getenv("DEBUG_LOGGING", default=False):
         print(f"[rrdtool] Generating graphs")
         sys.stdout.flush()

    args = []
    dt = datetime.datetime.now()
    dt = dt.replace(microsecond=0)
    now = dt.replace().timestamp()

    # Grab the current time and find 1 hour ago
    onehour_delta = dt - datetime.timedelta(minutes=60)

    # Grab the current time and find 6 hours ago
    sixhour_delta = dt - datetime.timedelta(hours=6)

    # Grab the current time and find 12 hours ago
    twelvehour_delta = dt - datetime.timedelta(hours=12)

    # Grab the current time and find 1 day ago
    oneday_delta = dt - datetime.timedelta(days=1)

    # Grab the current time and find 7 day ago
    oneweek_delta = dt - datetime.timedelta(days=7)

    # Grab the current time and find 30 day ago
    onemonth_delta = dt - datetime.timedelta(days=30)

    # Grab the current time and find 180 days ago
    sixmonths_delta = dt - datetime.timedelta(days=180)

    # Grab the current time and find 1 year ago
    oneyear_delta = dt - datetime.timedelta(days=365)

    sys.stdout.flush()

    if os.getenv("ENABLE_ACARS", default=False):
        args.append("DEF:messages-acars=/run/acars/acarshub.rrd:ACARS:MAX")
        args.append("LINE2:messages-acars#FF0000:ACARS")

    if os.getenv("ENABLE_VDLM", default=False):
        args.append("DEF:messages-vdlm=/run/acars/acarshub.rrd:VDLM:MAX")
        args.append("LINE2:messages-vdlm#00FF00:VDLM")

    if os.getenv("ENABLE_ACARS", default=False) and os.getenv("ENABLE_VDLM", default=False):
        args.append("DEF:messages-total=/run/acars/acarshub.rrd:TOTAL:MAX")
        args.append("LINE2:messages-total#0037FA:Total")

    sys.stdout.flush()

    try:
        rrdtool.graph("/webapp/static/images/1hour.png",
                      "-a", "PNG",
                      "--title", "1 Hour",
                      "-w", "1000",
                      "-h", "200",
                      "--start", "-1h", 
                      "--vertical-label", "Messages",
                      *args)

        rrdtool.graph("/webapp/static/images/6hour.png",
                      "-a", "PNG",
                      "--title", "6 Hours",
                      "-w", "1000",
                      "-h", "200",
                      "--start", "-6h", 
                      "--vertical-label", "Messages",
                      *args)

        rrdtool.graph("/webapp/static/images/12hour.png",
                      "-a", "PNG",
                      "--title", "12 Hours",
                      "-w", "1000",
                      "-h", "200",
                      "--start", "-12h", 
                      "--vertical-label", "Messages",
                      *args)

        rrdtool.graph("/webapp/static/images/24hours.png",
                      "-a", "PNG",
                      "--title", "1 Day",
                      "-w", "1000",
                      "-h", "200",
                      "--start", "-1d", 
                      "--vertical-label", "Messages",
                      *args)

        rrdtool.graph("/webapp/static/images/1week.png",
                      "-a", "PNG",
                      "--title", "1 Week",
                      "-w", "1000",
                      "-h", "200",
                      "--start", "-1w", 
                      "--vertical-label", "Messages",
                      *args)

        rrdtool.graph("/webapp/static/images/30days.png",
                      "-a", "PNG",
                      "--title", "1 Month",
                      "-w", "1000",
                      "-h", "200",
                      "--start", "-1mon", 
                      "--vertical-label", "Messages",
                      *args)

        rrdtool.graph("/webapp/static/images/6months.png",
                      "-a", "PNG",
                      "--title", "6 Months",
                      "-w", "1000",
                      "-h", "200",
                      "--start", "-6mon", 
                      "--vertical-label", "Messages",
                      *args)

        rrdtool.graph("/webapp/static/images/1year.png",
                      "-a", "PNG",
                      "--title", "1 Year",
                      "-w", "1000",
                      "-h", "200",
                      "--start", "-1yr", 
                      "--vertical-label", "Messages",
                      *args)
    except Exception as e:
        print(e)

    if os.getenv("DEBUG_LOGGING", default=False):
         print("[rrdtool] Generating graphs complete")