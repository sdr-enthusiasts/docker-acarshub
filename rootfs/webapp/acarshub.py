#!/usr/bin/env python3

# Copyright (C) 2022 Frederick Clausen II
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

import eventlet

eventlet.monkey_patch()
import acarshub_helpers  # noqa: E402
import acarshub_configuration  # noqa: E402
import acarshub_logging  # noqa: E402
from acarshub_logging import LOG_LEVEL  # noqa: E402
import acars_formatter  # noqa: E402

if not acarshub_configuration.LOCAL_TEST:
    import acarshub_rrd_database  # noqa: E402

from flask_socketio import SocketIO  # noqa: E402
from flask import Flask, render_template, request, redirect, url_for  # noqa: E402
from threading import Thread, Event  # noqa: E402
from collections import deque  # noqa: E402
import time  # noqa: E402

app = Flask(__name__)
# Make the browser not cache files if running in dev mode
if acarshub_configuration.LOCAL_TEST:
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

# turn the flask app into a socketio app
# regarding async_handlers=True, see: https://github.com/miguelgrinberg/Flask-SocketIO/issues/348
socketio = SocketIO(
    app,
    async_mode=None,
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

thread_html_generator = Thread()
thread_html_generator_event = Event()

# web thread

thread_acars_listener = Thread()
thread_vdlm2_listener = Thread()
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
error_messages_last_minute = 0

# all namespaces

acars_namespaces = ["/main"]
function_cache = dict()


def get_cached(func, validSecs):
    fname = func.__name__

    cached, cacheTime = function_cache.get(fname, (None, None))

    if cacheTime and time.time() - cacheTime < validSecs:
        # print(f'using function cache for {fname}')
        return cached

    result = func()

    function_cache[fname] = (result, time.time())
    return result


def update_rrd_db():
    global vdlm_messages_last_minute
    global acars_messages_last_minute
    global error_messages_last_minute

    acarshub_rrd_database.update_db(
        vdlm=vdlm_messages_last_minute,
        acars=acars_messages_last_minute,
        error=error_messages_last_minute,
    )
    vdlm_messages_last_minute = 0
    acars_messages_last_minute = 0
    error_messages_last_minute = 0


def generateClientMessage(message_type, json_message):
    import copy

    # creating a copy so that our changes below aren't made to the passed object
    client_message = copy.deepcopy(json_message)

    # add in the message_type key because the parent object didn't have it
    client_message.update({"message_type": message_type})

    # enrich message using udpate_keys
    acarshub_helpers.update_keys(client_message)

    return client_message


def getQueType(message_type):
    if message_type == "VDLM2":
        return "VDL-M2"
    elif message_type == "ACARS":
        return "ACARS"
    elif message_type is not None:
        return str(message_type)
    else:
        return "UNKNOWN"


def htmlListener():
    import time
    import sys

    # Run while requested...
    while not thread_html_generator_event.isSet():
        sys.stdout.flush()
        time.sleep(1)

        while len(que_messages) != 0:
            message_source, json_message = que_messages.popleft()

            client_message = generateClientMessage(message_source, json_message)

            socketio.emit("acars_msg", {"msghtml": client_message}, namespace="/main")
            # acarshub_logging.log(f"EMIT: {client_message}", "htmlListener", level=LOG_LEVEL["DEBUG"])

    acarshub_logging.log(
        "Exiting HTML Listener thread", "htmlListener", level=LOG_LEVEL["DEBUG"]
    )


def scheduled_tasks():
    from SafeScheduler import SafeScheduler
    import time

    schedule = SafeScheduler()
    # init the dbs if not already there
    acarshub_configuration.check_github_version()
    if not acarshub_configuration.LOCAL_TEST:
        schedule.every().minute.at(":15").do(acarshub_helpers.service_check)
        schedule.every().minute.at(":00").do(update_rrd_db)

    schedule.every().hour.at(":05").do(acarshub_configuration.check_github_version)
    schedule.every().hour.at(":01").do(send_version)
    schedule.every().minute.at(":30").do(
        acarshub_helpers.acarshub_database.prune_database
    )

    # Check for dead threads and restart
    schedule.every().minute.at(":45").do(
        init_listeners, "Error encountered! Restarting... "
    )

    while not thread_scheduler_stop_event.isSet():
        schedule.run_pending()
        time.sleep(1)


def database_listener():
    import sys
    import time

    while not thread_database_stop_event.isSet():
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

    if message_type == "VDLM2":
        global vdlm_messages_last_minute
    elif message_type == "ACARS":
        global acars_messages_last_minute

    disconnected = True

    receiver = socket.socket(family=socket.AF_INET, type=socket.SOCK_STREAM)

    acarshub_logging.log(
        f"message_listener starting: {message_type.lower()}",
        "message_listener",
        level=LOG_LEVEL["DEBUG"],
    )

    partial_message = None

    # Run while requested...
    while not thread_message_listener_stop_event.isSet():
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
                acarshub_logging.log(
                    f"{message_type.lower()}_receiver connected to {ip}:{port}",
                    f"{message_type.lower()}Generator",
                    level=LOG_LEVEL["DEBUG"],
                )

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
            receiver.close()
            time.sleep(1)
            continue
        except Exception as e:
            acarshub_logging.acars_traceback(e, f"{message_type.lower()}Generator")
            disconnected = True
            receiver.close()
            time.sleep(1)
            continue

        # acarshub_logging.log(f"{message_type.lower()}: got data", "message_listener", level=LOG_LEVEL["DEBUG"])

        if data is not None:
            decoded = data.decode()
        else:
            decoded = ""

        if decoded == "":
            disconnected = True
            receiver.close()
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
                    1,
                )
            except Exception as e:
                # reassembly didn't work, don't do anything but print an error when debug is enabled
                acarshub_logging.log(
                    f"Reassembly failed {e}: {combined}",
                    f"{message_type.lower()}Generator",
                    level=LOG_LEVEL["DEBUG"],
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
            except ValueError as e:

                if part == split_json[-1]:
                    # last element in the list, could be a partial json object
                    partial_message = part

                acarshub_logging.log(
                    f"JSON Error: {e}", f"{message_type.lower()}Generator", 1
                )
                acarshub_logging.log(
                    f"Skipping Message: {part}", f"{message_type.lower()}Generator", 1
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

            if message_type == "VDLM2":
                vdlm_messages_last_minute += 1
            elif message_type == "ACARS":
                acars_messages_last_minute += 1

            if "error" in msg:
                if msg["error"] > 0:
                    error_messages_last_minute += msg["error"]

            que_messages.append((que_type, acars_formatter.format_acars_message(msg)))
            que_database.append((que_type, acars_formatter.format_acars_message(msg)))

            if (
                len(list_of_recent_messages) >= list_of_recent_messages_max
            ):  # Keep the que size down
                del list_of_recent_messages[0]

            if not acarshub_configuration.QUIET_MESSAGES:
                print(f"MESSAGE:{message_type.lower()}Generator: {msg}")

            client_message = generateClientMessage(
                que_type, acars_formatter.format_acars_message(msg)
            )

            # add to recent message que for anyone fresh loading the page
            list_of_recent_messages.append(client_message)


def init_listeners(special_message=""):
    # This function both starts the listeners and is used with the scheduler to restart errant threads

    global thread_acars_listener
    global thread_vdlm2_listener
    global thread_database
    global thread_scheduler
    global thread_html_generator
    global thread_adsb_listner
    global thread_adsb
    # REMOVE AFTER AIRFRAMES IS UPDATED ####
    global vdlm2_feeder_thread
    global acars_feeder_thread
    # REMOVE AFTER AIRFRAMES IS UPDATED ####

    # show log message if this is container startup
    acarshub_logging.log(
        "Starting Data Listeners"
        if special_message == ""
        else "Checking Data Listeners",
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
    if not thread_html_generator.is_alive():
        acarshub_logging.log(
            f"{special_message}Starting htmlListener",
            "init",
            level=LOG_LEVEL["INFO"] if special_message == "" else LOG_LEVEL["ERROR"],
        )
        thread_html_generator = socketio.start_background_task(htmlListener)
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

    status = acarshub_helpers.get_service_status()  # grab system status

    # emit to all namespaces
    for page in acars_namespaces:
        socketio.emit("system_status", {"status": status}, namespace=page)


def init():
    global list_of_recent_messages
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
    if not acarshub_configuration.LOCAL_TEST:
        try:
            acarshub_logging.log("Initializing RRD Database", "init")
            acarshub_rrd_database.create_db()  # make sure the RRD DB is created / there
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


@app.route("/")
def index():
    # only by sending this page first will the client be connected to the socketio instance
    return render_template("index.html")


@app.route("/stats")
def stats():
    return render_template("index.html")


@app.route("/search")
def search():
    return render_template("index.html")


@app.route("/about")
def about():
    return render_template("index.html")


@app.route("/aboutmd")
def aboutmd():
    return render_template("helppage.MD")


@app.route("/alerts")
def alerts():
    return render_template("index.html")


@app.route("/status")
def status():
    return render_template("index.html")


@app.route("/adsb")
def adsb():
    # For now we're going to redirect the ADSB url always to live messages
    # ADSB Page loading causes problems
    if acarshub_configuration.ENABLE_ADSB:
        return render_template("index.html")
    else:
        return redirect(url_for("index"))


@app.errorhandler(404)
def not_found(e):
    return redirect(url_for("index"))


# The listener for the live message page
# Ensure the necessary listeners are fired up


@socketio.on("connect", namespace="/main")
def main_connect():
    pt = time.time()
    import sys

    # need visibility of the global thread object
    global thread_html_generator
    global thread_adsb
    global thread_adsb_stop_event

    recent_options = {"loading": True, "done_loading": False}

    requester = request.sid

    try:
        socketio.emit(
            "features_enabled",
            {
                "vdlm": acarshub_configuration.ENABLE_VDLM,
                "acars": acarshub_configuration.ENABLE_ACARS,
                "arch": acarshub_configuration.ARCH,
                "adsb": {
                    "enabled": acarshub_configuration.ENABLE_ADSB,
                    "lat": acarshub_configuration.ADSB_LAT,
                    "lon": acarshub_configuration.ADSB_LON,
                    "url": acarshub_configuration.ADSB_URL,
                    "bypass": acarshub_configuration.ADSB_BYPASS_URL,
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
    if not thread_html_generator.is_alive():
        sys.stdout.flush()
        thread_html_generator_event.clear()
        thread_html_generator = socketio.start_background_task(htmlListener)

    pt = time.time() - pt
    acarshub_logging.log(
        f"main_connect took {pt * 1000:.0f}ms", "htmlListener", level=LOG_LEVEL["DEBUG"]
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
    acarshub_helpers.acarshub_database.set_alert_terms(message["terms"])
    acarshub_helpers.acarshub_database.set_alert_ignore(message["ignore"])


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
                acarshub_helpers.acarshub_database.get_signal_levels, 30
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
def main_disconnect():
    pass


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=acarshub_configuration.ACARS_WEB_PORT)


@socketio.on_error()
def error_handler(e):
    acarshub_logging.acars_traceback(e, "server-error")


@socketio.on_error("/main")
def error_handler_main(e):
    acarshub_logging.acars_traceback(e, "server-main")


@socketio.on_error_default
def default_error_handler(e):
    acarshub_logging.acars_traceback(e, "server")
