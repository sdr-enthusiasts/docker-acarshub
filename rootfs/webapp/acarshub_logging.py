#!/usr/bin/env python3

# Copyright (C) 2022 Frederick Clausen II
# This file is part of acarshub <https://github.com/fredclausen/docker-acarshub>.
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

import logging
import sys
import os

# AVAILABLE LOG LEVELS:
# 1 logging.error('This is an error message')
# 2 logging.critical('This is a critical message')
# 3 logging.warning('This is a warning message')
# 4 logging.info('This is an info message')
# 5 logging.debug('This is a debug message')

MIN_LOG_LEVEL = 3

logger = logging.getLogger("werkzeug")
logging.basicConfig(
    stream=sys.stdout,
    filemode="w",
    format="%(levelname)s:%(message)s",
)

# we are using a second logger for messages, in case the user has a log level lower
# than the log level of the error messages


def log(msg, source, level=4):
    if level == 1:
        logger.error(f"[{source}]: {msg}")
    elif level == 2:
        logger.critical(f"[{source}]: {msg}")
    elif level == 3:
        logger.warning(f"[{source}]: {msg}")
    elif level == 4:
        logger.info(f"[{source}]: {msg}")
    elif level == 5:
        logger.debug(f"[{source}]: {msg}")


def acars_traceback(e, source):
    logger.exception(f"[{source}]: {e}")


if os.getenv("MIN_LOG_LEVEL", default=False):
    if os.getenv("MIN_LOG_LEVEL").isdigit():
        MIN_LOG_LEVEL = int(os.getenv("MIN_LOG_LEVEL"))
    else:
        log(f"LOG_LEVEL is not a number: {os.getenv('MIN_LOG_LEVEL')}", "MIN_LOG_LEVEL")
        log(f"LOG_LEVEL set to {MIN_LOG_LEVEL}", "MIN_LOG_LEVEL")

    if MIN_LOG_LEVEL <= 3:
        logger.setLevel(logging.WARNING)
    elif MIN_LOG_LEVEL == 4:
        logger.setLevel(logging.INFO)
    elif MIN_LOG_LEVEL == 5:
        logger.setLevel(logging.DEBUG)
