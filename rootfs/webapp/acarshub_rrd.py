#!/usr/bin/env python3

import rrdtool
import datetime
import os

def update_db(vdlm=0, acars=0):
    dt = datetime.datetime.now()
    epoch = dt.replace().timestamp()

    if os.getenv("ENABLE_VDLM", default=False):
        if os.getenv("DEBUG_LOGGING", default=False):
            print(f"[rrdtool] updating VDLM with {vdlm} at {epoch}")
        rrdtool.update("/run/acars/vdlm.rrd",
            f"{epoch}:{vdlm}")

    if os.getenv("ENABLE_ACARS", default=False):
        if os.getenv("DEBUG_LOGGING", default=False):
            print(f"[rrdtool] updating ACARS with {acars} at {epoch}")
        rrdtool.update("/run/acars/acars.rrd",
            f"{epoch}:{acars}")

def create_db():
    dt = datetime.datetime.now()
    epoch = dt.replace().timestamp()

    if os.getenv("ENABLE_VDLM") and not os.path.exists("/run/acars/vdlm.rrd"):
        print("[rrdtool] creating the VDLM RRD Database")
        rrdtool.create("/run/acars/vdlm.rrd",
            f"--start {epoch}",
            "DS:ACARS:GAUGE:600:U:U",
            "RRA:AVERAGE:0.5:1:120",
            "RRA:AVERAGE:0.5:2:120",
            "RRA:AVERAGE:0.5:4:120",
            "RRA:AVERAGE:0.5:10:288",
            "RRA:AVERAGE:0.5:20:1008",
            "RRA:AVERAGE:0.5:60:1440",
            "RRA:AVERAGE:0.5:80:3240",
            "RRA:AVERAGE:0.5:100:5184",
            "RRA:AVERAGE:0.5:120:8760",
            "RRA:AVERAGE:0.5:240:8760",
            "RRA:AVERAGE:0.5:360:8760",
            "RRA:MAX:0.5:1:120",
            "RRA:MAX:0.5:2:120",
            "RRA:MAX:0.5:4:120",
            "RRA:MAX:0.5:10:288",
            "RRA:MAX:0.5:20:1008",
            "RRA:MAX:0.5:60:1440",
            "RRA:MAX:0.5:80:3240",
            "RRA:MAX:0.5:100:5184",
            "RRA:MAX:0.5:120:8760",
            "RRA:MAX:0.5:240:8760",
            "RRA:MAX:0.5:360:8760",
            "RRA:LAST:0.5:1:120",
            "RRA:LAST:0.5:2:120",
            "RRA:LAST:0.5:4:120",
            "RRA:LAST:0.5:10:288",
            "RRA:LAST:0.5:20:1008",
            "RRA:LAST:0.5:60:1440",
            "RRA:LAST:0.5:80:3240",
            "RRA:LAST:0.5:100:5184",
            "RRA:LAST:0.5:120:8760",
            "RRA:LAST:0.5:240:8760",
            "RRA:LAST:0.5:360:8760")


    if os.getenv("ENABLE_ACARS") and not os.path.exists("/run/acars/acars.rrd"):
        print("[rrdtool] creating the ACARS RRD Database")
        rrdtool.create("/run/acars/acars.rrd",
            f"--start {epoch}",
            "DS:ACARS:GAUGE:600:U:U",
            "RRA:AVERAGE:0.5:1:120",
            "RRA:AVERAGE:0.5:2:120",
            "RRA:AVERAGE:0.5:4:120",
            "RRA:AVERAGE:0.5:10:288",
            "RRA:AVERAGE:0.5:20:1008",
            "RRA:AVERAGE:0.5:60:1440",
            "RRA:AVERAGE:0.5:80:3240",
            "RRA:AVERAGE:0.5:100:5184",
            "RRA:AVERAGE:0.5:120:8760",
            "RRA:AVERAGE:0.5:240:8760",
            "RRA:AVERAGE:0.5:360:8760",
            "RRA:MAX:0.5:1:120",
            "RRA:MAX:0.5:2:120",
            "RRA:MAX:0.5:4:120",
            "RRA:MAX:0.5:10:288",
            "RRA:MAX:0.5:20:1008",
            "RRA:MAX:0.5:60:1440",
            "RRA:MAX:0.5:80:3240",
            "RRA:MAX:0.5:100:5184",
            "RRA:MAX:0.5:120:8760",
            "RRA:MAX:0.5:240:8760",
            "RRA:MAX:0.5:360:8760",
            "RRA:LAST:0.5:1:120",
            "RRA:LAST:0.5:2:120",
            "RRA:LAST:0.5:4:120",
            "RRA:LAST:0.5:10:288",
            "RRA:LAST:0.5:20:1008",
            "RRA:LAST:0.5:60:1440",
            "RRA:LAST:0.5:80:3240",
            "RRA:LAST:0.5:100:5184",
            "RRA:LAST:0.5:120:8760",
            "RRA:LAST:0.5:240:8760",
            "RRA:LAST:0.5:360:8760")


def update_graphs():
    pass