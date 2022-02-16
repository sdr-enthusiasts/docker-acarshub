#!/usr/bin/env python3

# Copyright (C) 2022 Frederick Clausen II
# This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
# acarshub is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

# acarshub is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
#  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.

# You should have received a copy of the GNU General Public License
# along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

import os
import traceback

# AVAILABLE LOG LEVELS:
# 1 logging.error('This is an error message')
# 2 logging.critical('This is a critical message')
# 3 logging.warning('This is a warning message')
# 4 logging.info('This is an info message')
# 5 logging.debug('This is a debug message')

MIN_LOG_LEVEL = 3

LOG_LEVEL = {"ERROR": 1, "CRITICAL": 2, "WARNING": 3, "INFO": 4, "DEBUG": 5}


def log(msg, source, level=4):
    # line length 20
    if level == 1:
        print(f"ERROR:[{source}]:".ljust(25, " ") + f"{msg}")
    elif level == 2:
        print(f"CRITICAL:[{source}]:".ljust(25, " ") + f"{msg}")
    elif level == 3:
        print(f"WARNING:[{source}]:".ljust(25, " ") + f"{msg}")
    elif level == 4 and level <= MIN_LOG_LEVEL:
        print(f"INFO:[{source}]:".ljust(25, " ") + f"{msg}")
    elif level == 5 and level <= MIN_LOG_LEVEL:
        print(f"DEBUG:[{source}]:".ljust(25, " ") + f"{msg}")


def acars_traceback(e, source):
    # logger.exception(f"[{source}]: {e}")
    traceback.print_exception(e.__class__, e, e.__traceback__)


if os.getenv("MIN_LOG_LEVEL", default=False):
    if os.getenv("MIN_LOG_LEVEL").isdigit():
        MIN_LOG_LEVEL = int(os.getenv("MIN_LOG_LEVEL"))
    else:
        log(f"LOG_LEVEL is not a number: {os.getenv('MIN_LOG_LEVEL')}", "logger")
        log(f"LOG_LEVEL set to {MIN_LOG_LEVEL}", "logger")
