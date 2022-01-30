#!/usr/bin/env python3

# Copyright (C) 2022 Frederick Clausen II
# This file is part of acarshub <https://github.com/fredclausen/docker-acarshub>.
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

import rrdtool
import acarshub_configuration
import os


def update_db(vdlm=0, acars=0, error=0):
    total = vdlm + acars

    try:
        rrdtool.update("/run/acars/acarshub.rrd", f"N:{acars}:{vdlm}:{total}:{error}")
        if acarshub_configuration.DEBUG_LOGGING:
            acarshub_configuration.log(
                f"rrdtool.update: N:{acars}:{vdlm}:{total}:{error}", "rrdtool"
            )
    except Exception as e:
        acarshub_configuration.acars_traceback(e, "rrdtool")


def create_db():
    try:
        if not os.path.exists("/run/acars/acarshub.rrd"):
            acarshub_configuration.log("creating the RRD Database", "rrdtool")
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
        acarshub_configuration.acars_traceback(e, "rrdtool")
    else:
        if not acarshub_configuration.QUIET_LOGS:
            acarshub_configuration.log("Database found", "rrdtool")
