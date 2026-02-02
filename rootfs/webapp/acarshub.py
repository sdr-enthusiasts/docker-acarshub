#!/usr/bin/env python3

# Copyright (C) 2022-2026 Frederick Clausen II
# This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
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

# ============================================================================
# BACKEND ARCHITECTURE (Post React Migration)
# ============================================================================
# This Python backend is API-ONLY:
#   - Socket.IO handlers for real-time messaging
#   - /metrics endpoint for Prometheus monitoring
#
# nginx serves the React frontend (static HTML/CSS/JS) from acarshub-react/dist/
# nginx proxies /socket.io/* and /metrics to this Python backend
#
# NO HTML templates are served by Flask - all presentation logic is in React
# ============================================================================

import acarshub_helpers  # noqa: E402
import acarshub_configuration  # noqa: E402
import acarshub_logging  # noqa: E402
from acarshub_logging import LOG_LEVEL  # noqa: E402
import acars_formatter  # noqa: E402
import acarshub_metrics  # noqa: E402

import acarshub_rrd_database  # noqa: E402

from flask_socketio import SocketIO  # noqa: E402
from flask import (
    Flask,
    request,
    Response,
)  # noqa: E402
from threading import Thread, Event, Lock  # noqa: E402
from collections import deque  # noqa: E402
import time  # noqa: E402
import requests  # noqa: E402

app = Flask(__name__)
# Make the browser not cache files if running in dev mode
if acarshub_configuration.LOCAL_TEST:
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
    app.config["TEMPLATES_AUTO_RELOAD"] = True
    app.config["DEBUG"] = True

# turn the flask app into a socketio app
# regarding async_handlers=True, see: https://github.com/miguelgrinberg/Flask-SocketIO/issues/348
socketio = SocketIO(
    app,
    async_mode="gevent",
    async_handlers=True,
    logger=False,
    engineio_logger=False,
    ping_timeout=300,
    cors_allowed_origins="*",
)

# scheduler thread

thread_scheduler = Thread()
thread_scheduler_stop_event = Event()

# thread for processing the incoming data

thread_message_relay = Thread()
thread_message_relay_active = False
thread_message_relay_event = Event()

# web thread

thread_acars_listener = Thread()
thread_vdlm2_listener = Thread()
thread_hfdl_listener = Thread()
thread_imsl_listener = Thread()
thread_irdm_listener = Thread()
thread_message_listener_stop_event = Event()

# db thread

thread_database = Thread()
thread_database_stop_event = Event()

# maxlen is to keep the que from becoming ginormous
# the messages will be in the que all the time, even if no one is using the website
# old messages will automatically be removed
# Note on the que: We are adding new messages to the right
# This means oldest messages are to the left

que_messages = deque(maxlen=15)
que_database = deque(maxlen=15)

list_of_recent_messages = []  # list to store most recent msgs
list_of_recent_messages_max = 150

# counters for messages
# will be reset once written to RRD
vdlm_messages_last_minute = 0
acars_messages_last_minute = 0
hfdl_messages_last_minute = 0
imsl_messages_last_minute = 0
irdm_messages_last_minute = 0
error_messages_last_minute = 0

# Connection state tracking for real-time status
# Thread-safe dictionary tracking decoder connection status
decoder_connections = {
    "ACARS": False,
    "VDLM2": False,
    "HFDL": False,
    "IMSL": False,
    "IRDM": False,
}
decoder_connections_lock = Lock()

# Cumulative message counters (never reset, for total counts)
acars_messages_total = 0
vdlm_messages_total = 0
hfdl_messages_total = 0
imsl_messages_total = 0
irdm_messages_total = 0
error_messages_total = 0

# all namespaces

acars_namespaces = ["/main"]
function_cache = dict()


def get_status_data():
    """
    Helper function to collect all status data for get_realtime_status().
    Returns a tuple of (threads, connections, message_counts_last_minute, message_counts_total)
    """
    # Thread references
    threads_data = {
        "acars": thread_acars_listener,
        "vdlm2": thread_vdlm2_listener,
        "hfdl": thread_hfdl_listener,
        "imsl": thread_imsl_listener,
        "irdm": thread_irdm_listener,
        "database": thread_database,
        "scheduler": thread_scheduler,
    }

    # Connection states (thread-safe copy)
    with decoder_connections_lock:
        connections_data = decoder_connections.copy()

    # Message counts - last minute
    message_counts_last_minute = {
        "acars": acars_messages_last_minute,
        "vdlm2": vdlm_messages_last_minute,
        "hfdl": hfdl_messages_last_minute,
        "imsl": imsl_messages_last_minute,
        "irdm": irdm_messages_last_minute,
        "errors": error_messages_last_minute,
    }

    # Message counts - total
    message_counts_total = {
        "acars": acars_messages_total,
        "vdlm2": vdlm_messages_total,
        "hfdl": hfdl_messages_total,
        "imsl": imsl_messages_total,
        "irdm": irdm_messages_total,
        "errors": error_messages_total,
    }

    return (
        threads_data,
        connections_data,
        message_counts_last_minute,
        message_counts_total,
    )


def get_cached(func, validSecs):
    fname = func.__name__

    cached, cacheTime = function_cache.get(fname, (None, None))

    if cacheTime and time.time() - cacheTime < validSecs:
        # print(f'using function cache for {fname}')
        return cached

    result = func()

    function_cache[fname] = (result, time.time())
    return result


def optimize_adsb_data(raw_data):
    """
    Optimize ADS-B aircraft.json data by pruning unused fields.
    Reduces payload from ~52 fields to 13 essential fields.

    Args:
        raw_data: Raw aircraft.json response dict

    Returns:
        Optimized dict with 'now' timestamp and trimmed 'aircraft' list
    """
    # Fields actually used by frontend (13 of ~52 total)
    keep_fields = [
        "hex",  # ICAO hex code (required, unique ID)
        "flight",  # Callsign
        "lat",  # Latitude
        "lon",  # Longitude
        "track",  # Heading for icon rotation
        "alt_baro",  # Altitude
        "gs",  # Ground speed
        "squawk",  # Transponder code
        "baro_rate",  # Climb/descent rate
        "category",  # Aircraft category (for icon shape)
        "t",  # Tail/registration
        "type",  # Aircraft type
        "seen",  # Seconds since last update
    ]

    aircraft = []
    for plane in raw_data.get("aircraft", []):
        # Only keep essential fields
        optimized = {k: plane[k] for k in keep_fields if k in plane}

        # Must have hex field at minimum
        if "hex" in optimized:
            aircraft.append(optimized)

    return {"now": raw_data.get("now"), "aircraft": aircraft}


def poll_adsb_data():
    """
    Background task to poll ADS-B aircraft.json data every 5 seconds.
    Fetches from ADSB_URL, optimizes payload, and broadcasts via Socket.IO.
    """
    acarshub_logging.log(
        "ADS-B polling background task started",
        "poll_adsb_data",
        level=LOG_LEVEL["INFO"],
    )

    while True:
        if acarshub_configuration.ENABLE_ADSB:
            try:
                response = requests.get(acarshub_configuration.ADSB_URL, timeout=5)

                if response.status_code == 200:
                    raw_data = response.json()
                    optimized_data = optimize_adsb_data(raw_data)

                    # Broadcast to all connected clients
                    socketio.emit("adsb_aircraft", optimized_data, namespace="/main")

                    acarshub_logging.log(
                        f"ADS-B data broadcast: {len(optimized_data['aircraft'])} aircraft",
                        "poll_adsb_data",
                        level=LOG_LEVEL["DEBUG"],
                    )
                else:
                    acarshub_logging.log(
                        f"ADS-B fetch failed: HTTP {response.status_code}",
                        "poll_adsb_data",
                        level=LOG_LEVEL["WARNING"],
                    )

            except requests.exceptions.Timeout:
                acarshub_logging.log(
                    "ADS-B fetch timeout (5s)",
                    "poll_adsb_data",
                    level=LOG_LEVEL["WARNING"],
                )
            except requests.exceptions.RequestException as e:
                acarshub_logging.log(
                    f"ADS-B fetch failed: {e}",
                    "poll_adsb_data",
                    level=LOG_LEVEL["ERROR"],
                )
            except Exception as e:
                acarshub_logging.log(
                    f"ADS-B processing error: {e}",
                    "poll_adsb_data",
                    level=LOG_LEVEL["ERROR"],
                )
                acarshub_logging.acars_traceback(e, "poll_adsb_data")

        # Sleep for 5 seconds before next poll
        socketio.sleep(5)


def update_rrd_db():
    global vdlm_messages_last_minute
    global acars_messages_last_minute
    global error_messages_last_minute
    global hfdl_messages_last_minute
    global imsl_messages_last_minute
    global irdm_messages_last_minute

    acarshub_rrd_database.update_db(
        vdlm=vdlm_messages_last_minute,
        acars=acars_messages_last_minute,
        error=error_messages_last_minute,
        hfdl=hfdl_messages_last_minute,
        imsl=imsl_messages_last_minute,
        irdm=irdm_messages_last_minute,
        path=acarshub_configuration.RRD_DB_PATH,
    )
    vdlm_messages_last_minute = 0
    acars_messages_last_minute = 0
    error_messages_last_minute = 0
    hfdl_messages_last_minute = 0
    imsl_messages_last_minute = 0
    irdm_messages_last_minute = 0


def generateClientMessage(message_type, json_message):
    import copy

    # creating a copy so that our changes below aren't made to the passed object
    client_message = copy.deepcopy(json_message)

    # add in the message_type key because the parent object didn't have it
    client_message.update({"message_type": message_type})

    # enrich message using update_keys
    acarshub_helpers.update_keys(client_message)

    return client_message


def getQueType(message_type):
    if message_type == "VDLM2":
        return "VDL-M2"
    elif message_type == "ACARS":
        return "ACARS"
    elif message_type == "HFDL":
        return "HFDL"
    elif message_type == "IMSL":
        return "IMS-L"
    elif message_type == "IRDM":
        return "IRDM"
    elif message_type is not None:
        return str(message_type)
    else:
        return "UNKNOWN"


def messageRelayListener():
    """
    Background thread that relays ACARS messages from the message queue to connected clients.

    This function continuously monitors the message queue (que_messages) and broadcasts
    new messages to all connected Socket.IO clients via the 'acars_msg' event.

    Note: Despite the historical name, this does NOT generate HTML - it relays raw JSON data.
    React frontend handles all HTML rendering.
    """
    global thread_message_relay_active
    import time
    import sys

    thread_message_relay_active = True

    # Run while requested...
    while not thread_message_relay_event.is_set():
        sys.stdout.flush()
        time.sleep(1)

        while len(que_messages) != 0:
            message_source, json_message = que_messages.popleft()

            client_message = generateClientMessage(message_source, json_message)

            socketio.emit("acars_msg", {"msghtml": client_message}, namespace="/main")
            # acarshub_logging.log(f"EMIT: {client_message}", "messageRelayListener", level=LOG_LEVEL["DEBUG"])

    acarshub_logging.log(
        "Exiting message relay thread", "messageRelayListener", level=LOG_LEVEL["DEBUG"]
    )
    thread_message_relay_active = False


def scheduled_tasks():
    from SafeScheduler import SafeScheduler
    import time

    schedule = SafeScheduler()
    # init the dbs if not already there
    acarshub_configuration.check_github_version()

    # Emit real-time status every 30 seconds
    def emit_status():
        threads_data, connections_data, msg_last_min, msg_total = get_status_data()
        status = acarshub_helpers.get_realtime_status(
            threads_data, connections_data, msg_last_min, msg_total
        )
        for page in acars_namespaces:
            socketio.emit("system_status", {"status": status}, namespace=page)

    schedule.every(30).seconds.do(emit_status)
    schedule.every().minute.at(":00").do(update_rrd_db)
    schedule.every().hour.at(":05").do(acarshub_configuration.check_github_version)
    schedule.every().hour.at(":01").do(send_version)
    schedule.every(6).hours.do(acarshub_helpers.acarshub_database.optimize_db_regular)
    schedule.every().minute.at(":30").do(
        acarshub_helpers.acarshub_database.prune_database
    )
    schedule.every(5).minutes.do(acarshub_helpers.acarshub_database.optimize_db_merge)

    # Check for dead threads and restart
    schedule.every().minute.at(":45").do(
        init_listeners, "Error encountered! Restarting... "
    )

    while not thread_scheduler_stop_event.is_set():
        schedule.run_pending()
        time.sleep(1)


def database_listener():
    import sys
    import time

    while not thread_database_stop_event.is_set():
        sys.stdout.flush()
        time.sleep(1)

        while len(que_database) != 0:
            sys.stdout.flush()
            message_type, message_as_json = que_database.pop()
            acarshub_helpers.acarshub_database.add_message_from_json(
                message_type=message_type, message_from_json=message_as_json
            )
        else:
            pass


def message_listener(message_type=None, ip="127.0.0.1", port=None):
    if port is None:
        acarshub_logging.log(
            "No port specified", "message_listener", level=LOG_LEVEL["ERROR"]
        )
        return

    import time
    import socket
    import json

    global error_messages_last_minute
    global error_messages_total

    if message_type == "VDLM2":
        global vdlm_messages_last_minute
        global vdlm_messages_total
    elif message_type == "ACARS":
        global acars_messages_last_minute
        global acars_messages_total
    elif message_type == "HFDL":
        global hfdl_messages_last_minute
        global hfdl_messages_total
    elif message_type == "IMSL":
        global imsl_messages_last_minute
        global imsl_messages_total
    elif message_type == "IRDM":
        global irdm_messages_last_minute
        global irdm_messages_total

    disconnected = True

    receiver = socket.socket(family=socket.AF_INET, type=socket.SOCK_STREAM)

    acarshub_logging.log(
        f"message_listener starting: {message_type.lower()}",
        "message_listener",
        level=LOG_LEVEL["DEBUG"],
    )

    partial_message = None

    # Run while requested...
    while not thread_message_listener_stop_event.is_set():
        data = None

        # acarshub_logging.log(f"recv_from ...", "message_listener", level=LOG_LEVEL["DEBUG"])
        try:
            if disconnected:
                receiver = socket.socket(family=socket.AF_INET, type=socket.SOCK_STREAM)
                # Set socket timeout 1 seconds
                receiver.settimeout(1)

                # Connect to the sender
                receiver.connect((ip, port))
                disconnected = False

                # Update connection state (thread-safe)
                with decoder_connections_lock:
                    decoder_connections[message_type] = True

                acarshub_logging.log(
                    f"{message_type.lower()}_receiver connected to {ip}:{port}",
                    f"{message_type.lower()}Generator",
                    level=LOG_LEVEL["DEBUG"],
                )

                # Emit status update on connection
                threads_data, connections_data, msg_last_min, msg_total = (
                    get_status_data()
                )
                status = acarshub_helpers.get_realtime_status(
                    threads_data, connections_data, msg_last_min, msg_total
                )
                socketio.emit("system_status", {"status": status}, namespace="/main")

            if acarshub_configuration.LOCAL_TEST is True:
                data, addr = receiver.recvfrom(65527)
            else:
                data, addr = receiver.recvfrom(65527, socket.MSG_WAITALL)

        except socket.timeout:
            continue
        except socket.error as e:
            acarshub_logging.log(
                f"Error to {ip}:{port}. Reattempting...",
                f"{message_type.lower()}Generator",
                level=LOG_LEVEL["ERROR"],
            )
            acarshub_logging.acars_traceback(e, f"{message_type.lower()}Generator")
            disconnected = True

            # Update connection state (thread-safe)
            with decoder_connections_lock:
                decoder_connections[message_type] = False

            receiver.close()

            # Emit status update on disconnection
            threads_data, connections_data, msg_last_min, msg_total = get_status_data()
            status = acarshub_helpers.get_realtime_status(
                threads_data, connections_data, msg_last_min, msg_total
            )
            socketio.emit("system_status", {"status": status}, namespace="/main")

            time.sleep(1)
            continue
        except Exception as e:
            acarshub_logging.acars_traceback(e, f"{message_type.lower()}Generator")
            disconnected = True

            # Update connection state (thread-safe)
            with decoder_connections_lock:
                decoder_connections[message_type] = False

            receiver.close()

            # Emit status update on disconnection
            threads_data, connections_data, msg_last_min, msg_total = get_status_data()
            status = acarshub_helpers.get_realtime_status(
                threads_data, connections_data, msg_last_min, msg_total
            )
            socketio.emit("system_status", {"status": status}, namespace="/main")

            time.sleep(1)
            continue

        # acarshub_logging.log(f"{message_type.lower()}: got data", "message_listener", level=LOG_LEVEL["DEBUG"])

        if data is not None:
            decoded = data.decode()
        else:
            decoded = ""

        if decoded == "":
            disconnected = True

            # Update connection state (thread-safe)
            with decoder_connections_lock:
                decoder_connections[message_type] = False

            receiver.close()

            # Emit status update on disconnection
            threads_data, connections_data, msg_last_min, msg_total = get_status_data()
            status = acarshub_helpers.get_realtime_status(
                threads_data, connections_data, msg_last_min, msg_total
            )
            socketio.emit("system_status", {"status": status}, namespace="/main")

            continue

        # Decode json
        # There is a rare condition where we'll receive two messages at once
        # We will cover this condition off by ensuring each json message is
        # broken apart and handled individually

        # acarsdec or vdlm2dec single message ends with a newline so no additional processing required
        # acarsdec or vdlm2dec multi messages ends with a newline and each message has a newline but the decoder
        # breaks with more than one JSON object

        # in case of back to back objects, add a newline to split on
        decoded = decoded.replace("}{", "}\n{")

        # split on newlines
        split_json = decoded.splitlines()

        # try and reassemble messages that were received separately
        if partial_message is not None and len(split_json) > 0:
            combined = partial_message + split_json[0]

            try:
                # check if we can decode the json
                json.loads(combined)

                # no exception, json decoded fine, reassembly succeeded
                # replace the first string in the list with the reassembled string
                split_json[0] = combined
                acarshub_logging.log(
                    "Reassembly successful, message not skipped after all!",
                    f"{message_type.lower()}Generator",
                    level=LOG_LEVEL["DEBUG"],
                )
            except Exception as e:
                # reassembly didn't work, don't do anything but print an error when debug is enabled
                acarshub_logging.log(
                    f"Reassembly failed {e}: {combined}",
                    f"{message_type.lower()}Generator",
                    level=LOG_LEVEL["WARNING"],
                )

            # forget the partial message, it can't be useful anymore
            partial_message = None

        for part in split_json:
            # acarshub_logging.log(f"{message_type.lower()}: part: {part}", "message_listener", level=LOG_LEVEL["DEBUG"])

            if len(part) == 0:
                continue

            msg = None
            try:
                msg = json.loads(part)
            except ValueError:
                if part == split_json[-1]:
                    # last element in the list, could be a partial json object
                    partial_message = part
                acarshub_logging.log(
                    f"Skipping Message: {part}",
                    f"{message_type.lower()}Generator",
                    LOG_LEVEL["DEBUG"],
                )
                continue
            except Exception as e:
                acarshub_logging.log(
                    f"Unknown Error with JSON input: {e}",
                    f"{message_type.lower()}Generator",
                    level=LOG_LEVEL["ERROR"],
                )
                acarshub_logging.acars_traceback(e, f"{message_type.lower()}Generator")
                continue

            que_type = getQueType(message_type)

            formatted_message = acars_formatter.format_acars_message(msg)

            if formatted_message:
                if message_type == "VDLM2":
                    vdlm_messages_last_minute += 1
                    vdlm_messages_total += 1
                elif message_type == "ACARS":
                    acars_messages_last_minute += 1
                    acars_messages_total += 1
                elif message_type == "HFDL":
                    hfdl_messages_last_minute += 1
                    hfdl_messages_total += 1
                elif message_type == "IMSL":
                    imsl_messages_last_minute += 1
                    imsl_messages_total += 1
                elif message_type == "IRDM":
                    irdm_messages_last_minute += 1
                    irdm_messages_total += 1

                if "error" in msg:
                    if msg["error"] > 0:
                        error_messages_last_minute += msg["error"]
                        error_messages_total += msg["error"]

                que_messages.append((que_type, formatted_message))
                que_database.append((que_type, formatted_message))

                if (
                    len(list_of_recent_messages) >= list_of_recent_messages_max
                ):  # Keep the que size down
                    del list_of_recent_messages[0]

                if not acarshub_configuration.QUIET_MESSAGES:
                    print(f"MESSAGE:{message_type.lower()}Generator: {msg}")

                client_message = generateClientMessage(que_type, formatted_message)

                # add to recent message que for anyone fresh loading the page
                list_of_recent_messages.append(client_message)


def init_listeners(special_message=""):
    # This function both starts the listeners and is used with the scheduler to restart errant threads

    global thread_acars_listener
    global thread_vdlm2_listener
    global thread_hfdl_listener
    global thread_imsl_listener
    global thread_irdm_listener
    global thread_database
    global thread_scheduler
    global thread_message_relay
    # global thread_adsb_listner
    # global thread_adsb
    # REMOVE AFTER AIRFRAMES IS UPDATED ####
    # REMOVE AFTER AIRFRAMES IS UPDATED ####

    # show log message if this is container startup
    acarshub_logging.log(
        (
            "Starting Data Listeners"
            if special_message == ""
            else "Checking Data Listeners"
        ),
        "init",
        level=LOG_LEVEL["INFO"] if special_message == "" else LOG_LEVEL["DEBUG"],
    )
    if not thread_database.is_alive():
        acarshub_logging.log(
            f"{special_message}Starting Database Thread",
            "init",
            level=LOG_LEVEL["INFO"] if special_message == "" else LOG_LEVEL["ERROR"],
        )
        thread_database = Thread(target=database_listener)
        thread_database.start()
    if not thread_scheduler.is_alive():
        acarshub_logging.log(
            f"{special_message}starting scheduler",
            "init",
            level=LOG_LEVEL["INFO"] if special_message == "" else LOG_LEVEL["ERROR"],
        )
        thread_scheduler = Thread(target=scheduled_tasks)
        thread_scheduler.start()

    # check if 'g' is not in thread_message_relay
    if thread_message_relay_active is False:
        acarshub_logging.log(
            f"{special_message}Starting messageRelayListener",
            "init",
            level=LOG_LEVEL["INFO"] if special_message == "" else LOG_LEVEL["ERROR"],
        )
        thread_message_relay = socketio.start_background_task(messageRelayListener)
    if not thread_acars_listener.is_alive() and acarshub_configuration.ENABLE_ACARS:
        acarshub_logging.log(
            f"{special_message}Starting ACARS listener",
            "init",
            level=LOG_LEVEL["INFO"] if special_message == "" else LOG_LEVEL["ERROR"],
        )
        thread_acars_listener = Thread(
            target=message_listener,
            args=(
                "ACARS",
                acarshub_configuration.LIVE_DATA_SOURCE,
                acarshub_configuration.ACARS_SOURCE_PORT,
            ),
        )
        thread_acars_listener.start()

    if not thread_vdlm2_listener.is_alive() and acarshub_configuration.ENABLE_VDLM:
        acarshub_logging.log(
            f"{special_message}Starting VDLM listener",
            "init",
            level=LOG_LEVEL["INFO"] if special_message == "" else LOG_LEVEL["ERROR"],
        )
        thread_vdlm2_listener = Thread(
            target=message_listener,
            args=(
                "VDLM2",
                acarshub_configuration.LIVE_DATA_SOURCE,
                acarshub_configuration.VDLM_SOURCE_PORT,
            ),
        )
        thread_vdlm2_listener.start()

    if not thread_hfdl_listener.is_alive() and acarshub_configuration.ENABLE_HFDL:
        acarshub_logging.log(
            f"{special_message}Starting HFDL listener",
            "init",
            level=LOG_LEVEL["INFO"] if special_message == "" else LOG_LEVEL["ERROR"],
        )
        thread_hfdl_listener = Thread(
            target=message_listener,
            args=(
                "HFDL",
                acarshub_configuration.LIVE_DATA_SOURCE,
                acarshub_configuration.HFDL_SOURCE_PORT,
            ),
        )
        thread_hfdl_listener.start()

    if not thread_imsl_listener.is_alive() and acarshub_configuration.ENABLE_IMSL:
        acarshub_logging.log(
            f"{special_message}Starting IMSL listener",
            "init",
            level=LOG_LEVEL["INFO"] if special_message == "" else LOG_LEVEL["ERROR"],
        )
        thread_imsl_listener = Thread(
            target=message_listener,
            args=(
                "IMSL",
                acarshub_configuration.LIVE_DATA_SOURCE,
                acarshub_configuration.IMSL_SOURCE_PORT,
            ),
        )
        thread_imsl_listener.start()

    if not thread_irdm_listener.is_alive() and acarshub_configuration.ENABLE_IRDM:
        acarshub_logging.log(
            f"{special_message}Starting IRDM listener",
            "init",
            level=LOG_LEVEL["INFO"] if special_message == "" else LOG_LEVEL["ERROR"],
        )
        thread_irdm_listener = Thread(
            target=message_listener,
            args=(
                "IRDM",
                acarshub_configuration.LIVE_DATA_SOURCE,
                acarshub_configuration.IRDM_SOURCE_PORT,
            ),
        )
        thread_irdm_listener.start()

    # Grab real-time system status
    threads_data, connections_data, msg_last_min, msg_total = get_status_data()
    status = acarshub_helpers.get_realtime_status(
        threads_data, connections_data, msg_last_min, msg_total
    )

    # emit to all namespaces
    for page in acars_namespaces:
        socketio.emit("system_status", {"status": status}, namespace=page)


def init():

    # grab recent messages from db and fill the most recent array
    # then turn on the listeners
    acarshub_logging.log("Grabbing most recent messages from database", "init")
    try:
        results = acarshub_helpers.acarshub_database.grab_most_recent(
            list_of_recent_messages_max
        )
    except Exception as e:
        acarshub_logging.log(
            f"Startup Error grabbing most recent messages {e}",
            "init",
            level=LOG_LEVEL["ERROR"],
        )
        acarshub_logging.acars_traceback(e, "init")
    try:
        acarshub_logging.log("Initializing RRD Database", "init")
        acarshub_rrd_database.create_db(
            acarshub_configuration.RRD_DB_PATH
        )  # make sure the RRD DB is created / there
    except Exception as e:
        acarshub_logging.log(f"Startup Error creating RRD Database {e}", "init")
        acarshub_logging.acars_traceback(e, "init")
    if results is not None:
        for json_message in results:
            try:
                que_type = getQueType(json_message["message_type"])

                client_message = generateClientMessage(que_type, json_message)
                list_of_recent_messages.insert(0, client_message)

            except Exception as e:
                acarshub_logging.log(
                    f"Startup Error adding message to recent messages {e}", "init"
                )
                acarshub_logging.acars_traceback(e, "init")

    acarshub_logging.log(
        "Completed grabbing messages from database, starting up rest of services",
        "init",
    )

    init_listeners()


def send_version():
    socketio.emit(
        "acarshub-version", acarshub_configuration.get_version(), namespace="/main"
    )


init()


# ============================================================================
# API-ONLY ROUTES
# ============================================================================
# All HTML/CSS/JS is served by nginx from the React build (acarshub-react/dist/)
# This backend only provides:
#   1. /metrics endpoint (Prometheus monitoring)
#   2. Socket.IO handlers (real-time messaging - see below)
# ============================================================================


@app.route("/metrics")
def metrics():
    """Expose Prometheus metrics"""
    return Response(acarshub_metrics.get_metrics(), mimetype="text/plain")


# The listener for the live message page
# Ensure the necessary listeners are fired up


@socketio.on("connect", namespace="/main")
def main_connect():
    pt = time.time()
    import sys

    # need visibility of the global thread object
    global thread_message_relay
    # global thread_adsb
    # global thread_adsb_stop_event

    recent_options = {"loading": True, "done_loading": False}

    requester = request.sid

    try:
        socketio.emit(
            "features_enabled",
            {
                "vdlm": acarshub_configuration.ENABLE_VDLM,
                "acars": acarshub_configuration.ENABLE_ACARS,
                "hfdl": acarshub_configuration.ENABLE_HFDL,
                "imsl": acarshub_configuration.ENABLE_IMSL,
                "irdm": acarshub_configuration.ENABLE_IRDM,
                "allow_remote_updates": acarshub_configuration.ALLOW_REMOTE_UPDATES,
                "adsb": {
                    "enabled": acarshub_configuration.ENABLE_ADSB,
                    "lat": acarshub_configuration.ADSB_LAT,
                    "lon": acarshub_configuration.ADSB_LON,
                    "range_rings": acarshub_configuration.ENABLE_RANGE_RINGS,
                },
            },
            to=requester,
            namespace="/main",
        )

        socketio.emit(
            "terms",
            {
                "terms": acarshub_helpers.acarshub_database.get_alert_terms(),
                "ignore": acarshub_helpers.acarshub_database.get_alert_ignore(),
            },
            to=requester,
            namespace="/main",
        )
    except Exception as e:
        acarshub_logging.log(
            f"Main Connect: Error sending features_enabled: {e}", "webapp"
        )
        acarshub_logging.acars_traceback(e, "webapp")

    try:
        socketio.emit(
            "labels",
            {"labels": acarshub_helpers.acarshub_database.get_message_label_json()},
            to=requester,
            namespace="/main",
        )
    except Exception as e:
        acarshub_logging.log(f"Main Connect: Error sending labels: {e}", "webapp")
        acarshub_logging.acars_traceback(e, "webapp")

    msg_index = 1
    for json_message in list_of_recent_messages:
        if msg_index == len(list_of_recent_messages):
            recent_options["done_loading"] = True
        msg_index += 1
        try:
            socketio.emit(
                "acars_msg",
                {
                    "msghtml": json_message,
                    **recent_options,
                },
                to=requester,
                namespace="/main",
            )
        except Exception as e:
            acarshub_logging.log(
                f"Main Connect: Error sending acars_msg: {e}", "webapp"
            )
            acarshub_logging.acars_traceback(e, "webapp")

    try:
        socketio.emit(
            "system_status",
            {"status": acarshub_helpers.get_service_status()},
            to=requester,
            namespace="/main",
        )
    except Exception as e:
        acarshub_logging.log(
            f"Main Connect: Error sending system_status: {e}", "webapp"
        )
        acarshub_logging.acars_traceback(e, "webapp")

    try:
        rows, size = get_cached(
            acarshub_helpers.acarshub_database.database_get_row_count, 30
        )
        socketio.emit(
            "database", {"count": rows, "size": size}, to=requester, namespace="/main"
        )
    except Exception as e:
        acarshub_logging.log(f"Main Connect: Error sending database: {e}", "webapp")
        acarshub_logging.acars_traceback(e, "webapp")

    try:
        socketio.emit(
            "signal",
            {
                "levels": get_cached(
                    acarshub_helpers.acarshub_database.get_signal_levels, 30
                )
            },
            to=requester,
            namespace="/main",
        )
        socketio.emit(
            "alert_terms",
            {
                "data": get_cached(
                    acarshub_helpers.acarshub_database.get_alert_counts, 30
                )
            },
            to=requester,
            namespace="/main",
        )
        send_version()
    except Exception as e:
        acarshub_logging.log(
            f"Main Connect: Error sending signal levels: {e}", "webapp"
        )
        acarshub_logging.acars_traceback(e, "webapp")

    # Start the htmlGenerator thread only if the thread has not been started before.
    if thread_message_relay_active is False:
        sys.stdout.flush()
        thread_message_relay_event.clear()
        thread_message_relay = socketio.start_background_task(messageRelayListener)

    # Start the ADS-B polling background task if enabled (only once)
    if acarshub_configuration.ENABLE_ADSB:
        # Check if already started by looking for a global flag
        if not hasattr(main_connect, "_adsb_task_started"):
            acarshub_logging.log(
                "Starting ADS-B polling background task",
                "main_connect",
                level=LOG_LEVEL["INFO"],
            )
            socketio.start_background_task(poll_adsb_data)
            main_connect._adsb_task_started = True

    pt = time.time() - pt
    acarshub_logging.log(
        f"main_connect took {pt * 1000:.0f}ms",
        "messageRelayListener",
        level=LOG_LEVEL["DEBUG"],
    )


@socketio.on("query_terms", namespace="/main")
def get_alerts(message, namespace):
    requester = request.sid
    results = acarshub_helpers.acarshub_database.search_alerts(
        icao=message["icao"],
        # text=message["text"],
        flight=message["flight"],
        tail=message["tail"],
    )
    if results is not None:
        results.reverse()

    recent_options = {"loading": True, "done_loading": False}
    msg_index = 1
    for item in [item for item in (results or [])]:
        if msg_index == len(results):
            recent_options["done_loading"] = True
        msg_index += 1
        acarshub_helpers.update_keys(item)
        socketio.emit(
            "alert_matches",
            {"msghtml": item, **recent_options},
            to=requester,
            namespace="/main",
        )


@socketio.on("update_alerts", namespace="/main")
def update_alerts(message, namespace):
    if not acarshub_configuration.ALLOW_REMOTE_UPDATES:
        acarshub_logging.log(
            "Remote updates are disabled. Not saving changes.",
            "update alerts",
            level=LOG_LEVEL["ERROR"],
        )
        return

    acarshub_logging.log(
        "Remote updates enabled. Updating alerts",
        "update alerts",
        level=LOG_LEVEL["DEBUG"],
    )
    acarshub_helpers.acarshub_database.set_alert_terms(message["terms"])
    acarshub_helpers.acarshub_database.set_alert_ignore(message["ignore"])


@socketio.on("request_status", namespace="/main")
def request_status(message, namespace):
    """
    Handle real-time status requests from React frontend.
    Returns current system status without shell script execution.
    """
    requester = request.sid
    threads_data, connections_data, msg_last_min, msg_total = get_status_data()
    status = acarshub_helpers.get_realtime_status(
        threads_data, connections_data, msg_last_min, msg_total
    )
    socketio.emit(
        "system_status",
        {"status": status},
        to=requester,
        namespace="/main",
    )
    acarshub_logging.log(
        "Real-time status requested",
        "request_status",
        level=LOG_LEVEL["DEBUG"],
    )


@socketio.on("signal_freqs", namespace="/main")
def request_freqs(message, namespace):
    requester = request.sid
    socketio.emit(
        "signal_freqs",
        {"freqs": acarshub_helpers.acarshub_database.get_freq_count()},
        to=requester,
        namespace="/main",
    )


@socketio.on("signal_count", namespace="/main")
def request_count(message, namespace):
    pt = time.time()
    requester = request.sid
    socketio.emit(
        "signal_count",
        {"count": get_cached(acarshub_helpers.acarshub_database.get_errors, 30)},
        to=requester,
        namespace="/main",
    )
    pt = time.time() - pt
    acarshub_logging.log(
        f"request_count took {pt * 1000:.0f}ms",
        "request_count",
        level=LOG_LEVEL["DEBUG"],
    )


@socketio.on("signal_graphs", namespace="/main")
def request_graphs(message, namespace):
    pt = time.time()
    requester = request.sid
    socketio.emit(
        "alert_terms",
        {"data": get_cached(acarshub_helpers.acarshub_database.get_alert_counts, 30)},
        to=requester,
        namespace="/main",
    )
    socketio.emit(
        "signal",
        {
            "levels": get_cached(
                acarshub_helpers.acarshub_database.get_all_signal_levels, 30
            )
        },
        namespace="/main",
    )
    pt = time.time() - pt
    acarshub_logging.log(
        f"request_graphs took {pt * 1000:.0f}ms",
        "request_graphs",
        level=LOG_LEVEL["DEBUG"],
    )


@socketio.on("rrd_timeseries", namespace="/main")
def request_rrd_timeseries(message, namespace):
    """
    Fetch RRD time-series data for a specific time period.
    Returns JSON data for all decoders (ACARS, VDLM, HFDL, IMSL, IRDM, TOTAL, ERROR).

    Message format: { "time_period": "1hr" | "6hr" | "12hr" | "24hr" | "1wk" | "30day" | "6mon" | "1yr" }
    """

    pt = time.time()
    requester = request.sid
    time_period = message.get("time_period", "24hr")

    # Map time periods to RRD fetch parameters
    # Format: (start_offset_seconds, resolution_hint)
    period_map = {
        "1hr": (3600, "1min"),  # 1 hour, 1-minute resolution
        "6hr": (21600, "1min"),  # 6 hours, 1-minute resolution
        "12hr": (43200, "1min"),  # 12 hours, 1-minute resolution
        "24hr": (86400, "1min"),  # 24 hours, 1-minute resolution
        "1wk": (604800, "5min"),  # 1 week, 5-minute resolution
        "30day": (2592000, "1hr"),  # 30 days, 1-hour resolution
        "6mon": (15768000, "1hr"),  # 6 months, 1-hour resolution
        "1yr": (31536000, "6hr"),  # 1 year, 6-hour resolution
    }

    if time_period not in period_map:
        socketio.emit(
            "rrd_timeseries_data",
            {"error": f"Invalid time period: {time_period}", "data": []},
            to=requester,
            namespace="/main",
        )
        return

    start_offset, resolution = period_map[time_period]

    try:
        import rrdtool
        import os

        rrd_path = acarshub_configuration.RRD_DB_PATH + "acarshub.rrd"

        acarshub_logging.log(
            f"Checking for RRD database at: {rrd_path}",
            "rrd_timeseries",
            level=LOG_LEVEL["DEBUG"],
        )

        if not os.path.exists(rrd_path):
            socketio.emit(
                "rrd_timeseries_data",
                {
                    "error": "RRD database not found",
                    "data": [],
                    "time_period": time_period,
                },
                to=requester,
                namespace="/main",
            )
            return

        # Fetch data from RRD
        # Data sources in order: ACARS, VDLM, TOTAL, ERROR, HFDL, IMSL, IRDM
        result = rrdtool.fetch(
            rrd_path, "AVERAGE", "--start", f"end-{start_offset}", "--end", "now"
        )

        # Parse the result
        # result[0] is (start_time, end_time, step)
        # result[1] is tuple of data source names
        # result[2] is list of tuples with values
        start_time, end_time, step = result[0]
        ds_names = result[1]
        data_rows = result[2]

        # Build the response data
        timeseries_data = []
        current_time = start_time

        for row in data_rows:
            # Skip rows where all values are None
            if all(v is None for v in row):
                current_time += step
                continue

            data_point = {
                "timestamp": current_time * 1000
            }  # Convert to milliseconds for JavaScript

            # Map data source names to values
            for i, ds_name in enumerate(ds_names):
                value = row[i]
                # Convert None to 0 for consistency
                data_point[ds_name.lower()] = 0 if value is None else float(value)

            timeseries_data.append(data_point)
            current_time += step

        # Check if we have any data
        if len(timeseries_data) == 0:
            socketio.emit(
                "rrd_timeseries_data",
                {
                    "error": "No data available yet. The RRD database is collecting data. Please wait a few minutes.",
                    "data": [],
                    "time_period": time_period,
                },
                to=requester,
                namespace="/main",
            )
        else:
            socketio.emit(
                "rrd_timeseries_data",
                {
                    "data": timeseries_data,
                    "time_period": time_period,
                    "resolution": resolution,
                    "data_sources": [name.lower() for name in ds_names],
                },
                to=requester,
                namespace="/main",
            )

        pt = time.time() - pt
        acarshub_logging.log(
            f"request_rrd_timeseries ({time_period}) took {pt * 1000:.0f}ms, returned {len(timeseries_data)} points",
            "rrd_timeseries",
            level=LOG_LEVEL["DEBUG"],
        )

    except Exception as e:
        acarshub_logging.acars_traceback(e, "rrd_timeseries")
        socketio.emit(
            "rrd_timeseries_data",
            {"error": str(e), "data": [], "time_period": time_period},
            to=requester,
            namespace="/main",
        )


# handle a query request from the browser


@socketio.on("query_search", namespace="/main")
def handle_message(message, namespace):
    import time

    start_time = time.time()
    # We are going to send the result over in one blob
    # search.js will only maintain the most recent blob we send over
    total_results, serialized_json, search_term = acarshub_helpers.handle_message(
        message
    )

    # grab the socket id for the request
    # This stops the broadcast of the search results to everyone
    # in the search namespace.

    requester = request.sid
    socketio.emit(
        "database_search_results",
        {
            "num_results": total_results,
            "msghtml": serialized_json,
            "search_term": str(search_term),
            "query_time": time.time() - start_time,
        },
        to=requester,
        namespace="/main",
    )

    pt = time.time() - start_time
    acarshub_logging.log(
        f"query took {pt * 1000:.0f}ms: {str(search_term)}",
        "query_search",
        level=LOG_LEVEL["DEBUG"],
    )


@socketio.on("reset_alert_counts", namespace="/main")
def reset_alert_counts(message, namespace):
    if not acarshub_configuration.ALLOW_REMOTE_UPDATES:
        acarshub_logging.log(
            "Remote updates are disabled. Not resetting counts.",
            "reset_alert_counts",
            level=LOG_LEVEL["ERROR"],
        )
        return

    if message["reset_alerts"]:
        acarshub_helpers.acarshub_database.reset_alert_counts()
        try:
            socketio.emit(
                "alert_terms",
                {"data": acarshub_helpers.acarshub_database.get_alert_counts()},
                namespace="/main",
            )
        except Exception as e:
            acarshub_logging.log(
                f"Main Connect: Error sending alert_terms: {e}", "webapp"
            )
            acarshub_logging.acars_traceback(e, "webapp")


@socketio.on("disconnect", namespace="/main")
def main_disconnect(reason):
    pass


if __name__ == "__main__":
    acarshub_logging.log(
        f"Starting ACARS Hub Web App on port {acarshub_configuration.ACARS_WEB_PORT}",
        "webapp",
        level=LOG_LEVEL["DEBUG"],
    )

    socketio.run(
        app,
        host="0.0.0.0",
        port=acarshub_configuration.ACARS_WEB_PORT,
        debug=True if acarshub_configuration.LOCAL_TEST else False,
    )


@socketio.on_error()
def error_handler(e):
    acarshub_logging.acars_traceback(e, "server-error")


@socketio.on_error("/main")
def error_handler_main(e):
    acarshub_logging.acars_traceback(e, "server-main")


@socketio.on_error_default
def default_error_handler(e):
    acarshub_logging.acars_traceback(e, "server")
