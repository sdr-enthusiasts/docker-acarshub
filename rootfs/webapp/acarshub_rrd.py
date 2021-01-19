#!/usr/bin/env python3

import rrdtool
import acarshub_error
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
        acarshub_error.acars_traceback(e, "rrdtool")
        sys.stdout.flush()


def create_db():
    try:
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
    except Exception as e:
        acarshub_error.acars_traceback(e, "rrdtool")
    else:
        print("[rrdtool] Database found")


def update_graphs():
    import sys
    if os.getenv("DEBUG_LOGGING", default=False):
        print("[rrdtool] Generating graphs")
        sys.stdout.flush()

    args = ["/webapp/static/images/1hour.png", "-a", "PNG", "--title", "1 Hour", "-w", "1000",
            "-h", "200", "--start", "-1h", "--vertical-label", "Messages", "--slope-mode"]
    args_all = []    # combined graph arguements
    args_vdlm = []   # vdlm graph arguements
    args_acars = []  # acars graph arguements
    args_error = []  # error graph arguements

    if os.getenv("ENABLE_ACARS", default=False):
        args_all.append("DEF:messages-acars=/run/acars/acarshub.rrd:ACARS:AVERAGE")
        args_all.append("LINE1:messages-acars#000000:ACARS")
        args_acars.append("DEF:messages-acars=/run/acars/acarshub.rrd:ACARS:AVERAGE")
        args_acars.append("LINE1:messages-acars#000000:ACARS")

    if os.getenv("ENABLE_VDLM", default=False):
        args_all.append("DEF:messages-vdlm=/run/acars/acarshub.rrd:VDLM:AVERAGE")
        args_all.append("LINE1:messages-vdlm#0000ff:VDLM")
        args_vdlm.append("DEF:messages-vdlm=/run/acars/acarshub.rrd:VDLM:AVERAGE")
        args_vdlm.append("LINE1:messages-vdlm#0000ff:VDLM")

    if os.getenv("ENABLE_ACARS", default=False) and os.getenv("ENABLE_VDLM", default=False):
        args_all.append("DEF:messages-total=/run/acars/acarshub.rrd:TOTAL:AVERAGE")
        args_all.append("LINE1:messages-total#00ff00:Total")

    args_error.append("DEF:messages-error=/run/acars/acarshub.rrd:ERROR:AVERAGE")
    args_error.append("LINE1:messages-error#FF0000:Errors")
    args_all.append("DEF:messages-error=/run/acars/acarshub.rrd:ERROR:AVERAGE")
    args_all.append("LINE1:messages-error#FF0000:Errors")

    try:
        # 1 Hour
        rrdtool.graph(*args, *args_all)
        args[0] = "/webapp/static/images/error1hour.png"
        rrdtool.graph(*args, *args_error)
        if os.getenv("ENABLE_ACARS", default=False) and os.getenv("ENABLE_VDLM", default=False):
            args[0] = "/webapp/static/images/vdlm1hour.png"
            rrdtool.graph(*args, *args_vdlm)
            args[0] = "/webapp/static/images/acars1hour.png"
            rrdtool.graph(*args, *args_acars)

        # 6 Hours
        args[0] = "/webapp/static/images/6hour.png"
        args[4] = "6 Hours"
        args[10] = "-6h"
        rrdtool.graph(*args, *args_all)
        args[0] = "/webapp/static/images/error6hour.png"
        rrdtool.graph(*args, *args_error)
        if os.getenv("ENABLE_ACARS", default=False) and os.getenv("ENABLE_VDLM", default=False):
            args[0] = "/webapp/static/images/vdlm6hour.png"
            rrdtool.graph(*args, *args_vdlm)
            args[0] = "/webapp/static/images/acars6hour.png"
            rrdtool.graph(*args, *args_acars)

        # 12 Hours

        args[0] = "/webapp/static/images/12hour.png"
        args[4] = "12 Hours"
        args[10] = "-12h"
        rrdtool.graph(*args, *args_all)
        args[0] = "/webapp/static/images/error12hour.png"
        rrdtool.graph(*args, *args_error)
        if os.getenv("ENABLE_ACARS", default=False) and os.getenv("ENABLE_VDLM", default=False):
            args[0] = "/webapp/static/images/vdlm12hour.png"
            rrdtool.graph(*args, *args_vdlm)
            args[0] = "/webapp/static/images/acars12hour.png"
            rrdtool.graph(*args, *args_acars)

        # 24 Hours

        args[0] = "/webapp/static/images/24hours.png"
        args[4] = "1 Day"
        args[10] = "-1d"
        rrdtool.graph(*args, *args_all)
        args[0] = "/webapp/static/images/error24hours.png"
        rrdtool.graph(*args, *args_error)
        if os.getenv("ENABLE_ACARS", default=False) and os.getenv("ENABLE_VDLM", default=False):
            args[0] = "/webapp/static/images/vdlm24hours.png"
            rrdtool.graph(*args, *args_vdlm)
            args[0] = "/webapp/static/images/acars24hours.png"
            rrdtool.graph(*args, *args_acars)

        # 1 Week

        args[0] = "/webapp/static/images/1week.png"
        args[4] = "1 Week"
        args[10] = "-1w"
        rrdtool.graph(*args, *args_all)
        args[0] = "/webapp/static/images/error1week.png"
        rrdtool.graph(*args, *args_error)
        if os.getenv("ENABLE_ACARS", default=False) and os.getenv("ENABLE_VDLM", default=False):
            args[0] = "/webapp/static/images/vdlm1week.png"
            rrdtool.graph(*args, *args_vdlm)
            args[0] = "/webapp/static/images/acars1week.png"
            rrdtool.graph(*args, *args_acars)

        # 30 Days

        args[0] = "/webapp/static/images/30days.png"
        args[4] = "1 Month"
        args[10] = "-1mon"
        rrdtool.graph(*args, *args_all)
        args[0] = "/webapp/static/images/error30days.png"
        rrdtool.graph(*args, *args_error)
        if os.getenv("ENABLE_ACARS", default=False) and os.getenv("ENABLE_VDLM", default=False):
            args[0] = "/webapp/static/images/vdlm30days.png"
            rrdtool.graph(*args, *args_vdlm)
            args[0] = "/webapp/static/images/acars30days.png"
            rrdtool.graph(*args, *args_acars)

        # 6 Months

        args[0] = "/webapp/static/images/6months.png"
        args[4] = "6 Months"
        args[10] = "-6mon"
        rrdtool.graph(*args, *args_all)
        args[0] = "/webapp/static/images/error6months.png"
        rrdtool.graph(*args, *args_error)
        if os.getenv("ENABLE_ACARS", default=False) and os.getenv("ENABLE_VDLM", default=False):
            args[0] = "/webapp/static/images/vdlm6months.png"
            rrdtool.graph(*args, *args_vdlm)
            args[0] = "/webapp/static/images/acars6months.png"
            rrdtool.graph(*args, *args_acars)

        # 1 year

        args[0] = "/webapp/static/images/1year.png"
        args[4] = "1 Year"
        args[10] = "-1yr"
        rrdtool.graph(*args, *args_all)
        args[0] = "/webapp/static/images/error1year.png"
        rrdtool.graph(*args, *args_error)
        if os.getenv("ENABLE_ACARS", default=False) and os.getenv("ENABLE_VDLM", default=False):
            args[0] = "/webapp/static/images/vdlm1year.png"
            rrdtool.graph(*args, *args_vdlm)
            args[0] = "/webapp/static/images/acars1year.png"
            rrdtool.graph(*args, *args_acars)

    except Exception as e:
        acarshub_error.acars_traceback(e, "rrdtool")

    if os.getenv("DEBUG_LOGGING", default=False):
        print("[rrdtool] Generating graphs complete")
