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

import eventlet

eventlet.monkey_patch()
import acarshub_helpers  # noqa: E402
import acarshub_configuration  # noqa: E402
import acars_formatter  # noqa: E402

if not acarshub_configuration.SPAM:
    import acarshub_rrd_database  # noqa: E402
import logging  # noqa: E402

from flask_socketio import SocketIO  # noqa: E402
from flask import Flask, render_template, request, redirect, url_for  # noqa: E402
from threading import Thread, Event  # noqa: E402
from collections import deque  # noqa: E402

log = logging.getLogger("werkzeug")
log.setLevel(logging.ERROR)

app = Flask(__name__)
# Make the browser not cache files if running in dev mode
if acarshub_configuration.SPAM:
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

messages_recent = []  # list to store most recent msgs

# counters for messages
# will be reset once written to RRD
vdlm_messages = 0
acars_messages = 0
error_messages = 0

# all namespaces

acars_namespaces = ["/main"]

# REMOVE AFTER AIRFRAMES IS UPDATED ####
# VDLM Feeders
que_vdlm2_feed = deque(maxlen=15)
vdlm2_feeder_thread = Thread()
vdlm2_feeder_stop_event = Event()


def vdlm_feeder():
    import socket
    import time
    import json

    airframes = (socket.gethostbyname("feed.acars.io"), 5555)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    while not vdlm2_feeder_stop_event.isSet():
        time.sleep(1)

        while len(que_vdlm2_feed) != 0:
            time.sleep(0.5)
            msg = que_vdlm2_feed.popleft()

            try:
                sock.sendto(json.dumps(msg, separators=(",", ":")).encode(), airframes)
            except Exception as e:
                acarshub_configuration.acars_traceback(e, "vdlm_python_feeder")
                que_vdlm2_feed.appendleft(msg)
                break


# REMOVE AFTER AIRFRAMES IS UPDATED ####


def update_rrd_db():
    global vdlm_messages
    global acars_messages
    global error_messages

    acarshub_rrd_database.update_db(
        vdlm=vdlm_messages, acars=acars_messages, error=error_messages
    )
    vdlm_messages = 0
    acars_messages = 0
    error_messages = 0


def htmlListener():
    import time
    import sys
    import copy

    # Run while requested...
    while not thread_html_generator_event.isSet():
        sys.stdout.flush()
        time.sleep(1)

        while len(que_messages) != 0:
            message_source, json_message_initial = que_messages.popleft()
            json_message = copy.deepcopy(
                json_message_initial
            )  # creating a copy so that our changes below aren't made to the parent object
            # Send output via socketio
            json_message.update(
                {"message_type": message_source}
            )  # add in the message_type key because the parent object didn't have it
            json_message = acarshub_helpers.update_keys(json_message)

            socketio.emit("acars_msg", {"msghtml": json_message}, namespace="/main")

    if acarshub_configuration.DEBUG_LOGGING:
        acarshub_configuration.log("Exiting HTML Listener thread", "htmlListener")


def scheduled_tasks():
    from SafeScheduler import SafeScheduler
    import time

    schedule = SafeScheduler()
    # init the dbs if not already there
    acarshub_configuration.check_github_version()
    if not acarshub_configuration.SPAM:
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
            t, m = que_database.pop()
            acarshub_helpers.acarshub_database.add_message_from_json(
                message_type=t, message_from_json=m
            )
        else:
            pass


def message_listener(message_type=None, ip="127.0.0.1", port=None):
    import time
    import socket
    import json
    import sys

    global error_messages

    if message_type == "VDLM2":
        global vdlm_messages
    elif message_type == "ACARS":
        global acars_messages

    disconnected = True

    receiver = socket.socket(family=socket.AF_INET, type=socket.SOCK_STREAM)

    # Run while requested...
    while not thread_message_listener_stop_event.isSet():
        sys.stdout.flush()
        time.sleep(0)

        try:
            if disconnected:
                receiver = socket.socket(family=socket.AF_INET, type=socket.SOCK_STREAM)
                # Set socket timeout 1 seconds
                receiver.settimeout(1)

                # Connect to the sender
                receiver.connect((ip, port))
                disconnected = False
                if acarshub_configuration.DEBUG_LOGGING:
                    acarshub_configuration.log(
                        f"{message_type.lower()}_receiver connected to {ip}:{port}",
                        f"{message_type.lower()}Generator",
                    )

            data = None

            if acarshub_configuration.SPAM is True:
                data, addr = receiver.recvfrom(65527)
            else:
                data, addr = receiver.recvfrom(65527, socket.MSG_WAITALL)
        except socket.timeout:
            pass
        except socket.error as e:
            acarshub_configuration.log(
                f"Error to {ip}:{port}. Reattemping...",
                f"{message_type.lower()}Generator",
            )
            acarshub_configuration.acars_traceback(
                e, f"{message_type.lower()}Generator"
            )
            disconnected = True
            receiver.close()
            time.sleep(1)
        except Exception as e:
            acarshub_configuration.acars_traceback(
                e, f"{message_type.lower()}Generator"
            )
            disconnected = True
            receiver.close()
            time.sleep(1)
        else:
            if data.decode() == "":
                disconnected = True
                receiver.close()
                data = None
            elif data is not None:
                # Decode json
                # There is a rare condition where we'll receive two messages at once
                # We will cover this condition off by ensuring each json message is
                # broken apart and handled individually

                try:
                    message_json = []
                    # JSON decoder requires a newline at the end of the string for processing?
                    # This is a workaround to ensure we don't lose the last message
                    # We'll add a newline to the end of the string if it doesn't already exist
                    # Additionally, decoders might send more than one message at once. We need
                    # to handle this.
                    # acarsdec or vdlm2dec single message ends with a newline so no additional processing required
                    # acarsdec or vdlm2dec multi messages ends with a newline and each message has a newline but the decoder
                    # breaks with more than one JSON object
                    # dumpvdl2 does not end with a newline so we need to add one
                    if data.decode().count("}\n") == 1:
                        message_json.append(json.loads(data.decode()))
                    # dumpvdl2 single message
                    elif (
                        data.decode().count("}\n") == 0
                        and data.decode().count("}{") == 0
                    ):
                        message_json.append(json.loads(data.decode() + "\n"))
                    # dumpvdl2 multi message
                    elif data.decode().count("}{") > 0:
                        split_json = data.decode().split("}{")
                        count = 0
                        for j in split_json:
                            if len(j) > 1:
                                msg = j
                                if not msg.startswith("{"):
                                    msg = "{" + msg
                                if not count == len(split_json) - 1:
                                    msg = msg + "}"
                                message_json.append(json.loads(msg + "\n"))

                            count += 1
                    # acarsdec/dumpvdl2 multi message
                    else:
                        split_json = data.decode().split("}\n")

                        for j in split_json:
                            if len(j) > 1:
                                message_json.append(json.loads(j + "}\n"))

                except Exception as e:
                    acarshub_configuration.log(
                        f"Error with JSON input {repr(data)} .\n{e}",
                        f"{message_type.lower()}Generator",
                    )
                else:
                    for j in message_json:
                        if message_type == "VDLM2":
                            vdlm_messages += 1
                            que_type = "VDL-M2"
                        elif message_type == "ACARS":
                            acars_messages += 1
                            que_type = "ACARS"

                        if "error" in j:
                            if j["error"] > 0:
                                error_messages += j["error"]

                        que_messages.append(
                            (que_type, acars_formatter.format_acars_message(j))
                        )
                        que_database.append(
                            (que_type, acars_formatter.format_acars_message(j))
                        )
                        if (
                            acarshub_configuration.FEED is True
                            and message_type == "VDLM2"
                        ):
                            que_vdlm2_feed.append(
                                acars_formatter.format_acars_message(j)
                            )
                        if len(messages_recent) >= 150:  # Keep the que size down
                            del messages_recent[0]
                        messages_recent.append(
                            (que_type, acars_formatter.format_acars_message(j))
                        )  # add to recent message que for anyone fresh loading the page


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
    # REMOVE AFTER AIRFRAMES IS UPDATED ####

    # show log message if this is container startup
    if special_message == "" and acarshub_configuration.QUIET_LOGS is False:
        acarshub_configuration.log("Starting Data Listeners", "init")
    if not thread_database.is_alive():
        if special_message or acarshub_configuration.QUIET_LOGS is False:
            acarshub_configuration.log(
                f"{special_message}Starting Database Thread", "init"
            )
        thread_database = Thread(target=database_listener)
        thread_database.start()
    if not thread_scheduler.is_alive():
        if special_message or acarshub_configuration.QUIET_LOGS is False:
            acarshub_configuration.log(f"{special_message}starting scheduler", "init")
        thread_scheduler = Thread(target=scheduled_tasks)
        thread_scheduler.start()
    if not thread_html_generator.is_alive():
        if special_message or acarshub_configuration.QUIET_LOGS is False:
            acarshub_configuration.log(
                f"{special_message}Starting htmlListener", "init"
            )
        thread_html_generator = socketio.start_background_task(htmlListener)
    if not thread_acars_listener.is_alive() and acarshub_configuration.ENABLE_ACARS:
        if special_message or acarshub_configuration.QUIET_LOGS is False:
            acarshub_configuration.log(
                f"{special_message}Starting ACARS listener", "init"
            )
        thread_acars_listener = Thread(
            target=message_listener,
            args=("ACARS", acarshub_configuration.LIVE_DATA_SOURCE, 15550),
        )
        thread_acars_listener.start()

    if not thread_vdlm2_listener.is_alive() and acarshub_configuration.ENABLE_VDLM:
        if special_message or acarshub_configuration.QUIET_LOGS is False:
            acarshub_configuration.log(
                f"{special_message}Starting VDLM listener", "init"
            )
        thread_vdlm2_listener = Thread(
            target=message_listener,
            args=("VDLM2", acarshub_configuration.LIVE_DATA_SOURCE, 15555),
        )
        thread_vdlm2_listener.start()
    # REMOVE AFTER AIRFRAMES IS UPDATED ####
    if (
        not acarshub_configuration.SPAM
        and acarshub_configuration.FEED
        and acarshub_configuration.ENABLE_VDLM
        and not vdlm2_feeder_thread.is_alive()
    ):
        if special_message or acarshub_configuration.QUIET_LOGS is False:
            acarshub_configuration.log(f"{special_message}Starting VDLM feeder", "init")
        vdlm2_feeder_thread = Thread(target=vdlm_feeder)
        vdlm2_feeder_thread.start()
    # REMOVE AFTER AIRFRAMES IS UPDATED ####
    status = acarshub_helpers.get_service_status()  # grab system status

    # emit to all namespaces
    for page in acars_namespaces:
        socketio.emit("system_status", {"status": status}, namespace=page)


def init():
    global messages_recent
    # grab recent messages from db and fill the most recent array
    # then turn on the listeners
    if not acarshub_configuration.QUIET_LOGS:
        acarshub_configuration.log(
            "Grabbing most recent messages from database", "init"
        )
    try:
        results = acarshub_helpers.acarshub_database.grab_most_recent()
    except Exception as e:
        acarshub_configuration.log(
            f"Startup Error grabbing most recent messages {e}", "init"
        )
    if not acarshub_configuration.SPAM:
        try:
            if not acarshub_configuration.QUIET_LOGS:
                acarshub_configuration.log("Initializing RRD Database", "init")
            acarshub_rrd_database.create_db()  # make sure the RRD DB is created / there
        except Exception as e:
            acarshub_configuration.log(
                f"Startup Error creating RRD Database {e}", "init"
            )
    if results is not None:
        for item in results:
            json_message = item
            try:
                messages_recent.insert(0, [json_message["message_type"], json_message])
            except Exception as e:
                acarshub_configuration.log(
                    f"Startup Error adding message to recent messages {e}", "init"
                )

    if not acarshub_configuration.QUIET_LOGS:
        acarshub_configuration.log(
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
    import sys
    import copy

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
        acarshub_configuration.log(
            f"Main Connect: Error sending features_enabled: {e}", "webapp"
        )

    try:
        socketio.emit(
            "labels",
            {"labels": acarshub_helpers.acarshub_database.get_message_label_json()},
            to=requester,
            namespace="/main",
        )
    except Exception as e:
        acarshub_configuration.log(f"Main Connect: Error sending labels: {e}", "webapp")
    msg_index = 1
    for msg_type, json_message_orig in messages_recent:
        if msg_index == len(messages_recent):
            recent_options["done_loading"] = True
        msg_index += 1
        json_message = copy.deepcopy(json_message_orig)
        json_message["message_type"] = msg_type
        try:
            socketio.emit(
                "acars_msg",
                {
                    "msghtml": acarshub_helpers.update_keys(json_message),
                    **recent_options,
                },
                to=requester,
                namespace="/main",
            )
        except Exception as e:
            acarshub_configuration.log(
                f"Main Connect: Error sending acars_msg: {e}", "webapp"
            )

    try:
        socketio.emit(
            "system_status",
            {"status": acarshub_helpers.get_service_status()},
            to=requester,
            namespace="/main",
        )
    except Exception as e:
        acarshub_configuration.log(
            f"Main Connect: Error sending system_status: {e}", "webapp"
        )

    try:
        rows, size = acarshub_helpers.acarshub_database.database_get_row_count()
        socketio.emit(
            "database", {"count": rows, "size": size}, to=requester, namespace="/main"
        )
    except Exception as e:
        acarshub_configuration.log(
            f"Main Connect: Error sending database: {e}", "webapp"
        )

    try:
        socketio.emit(
            "signal",
            {"levels": acarshub_helpers.acarshub_database.get_signal_levels()},
            to=requester,
            namespace="/main",
        )
        socketio.emit(
            "alert_terms",
            {"data": acarshub_helpers.getAlerts()},
            to=requester,
            namespace="/main",
        )
        send_version()
    except Exception as e:
        acarshub_configuration.log(
            f"Main Connect: Error sending signal levels: {e}", "webapp"
        )

    # Start the htmlGenerator thread only if the thread has not been started before.
    if not thread_html_generator.is_alive():
        sys.stdout.flush()
        thread_html_generator_event.clear()
        thread_html_generator = socketio.start_background_task(htmlListener)


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
        socketio.emit(
            "alert_matches",
            {"msghtml": acarshub_helpers.update_keys(item), **recent_options},
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
    requester = request.sid
    socketio.emit(
        "signal_count",
        {"count": acarshub_helpers.acarshub_database.get_errors()},
        to=requester,
        namespace="/main",
    )


@socketio.on("signal_graphs", namespace="/main")
def request_graphs(message, namespace):
    requester = request.sid
    socketio.emit(
        "alert_terms",
        {"data": acarshub_helpers.getAlerts()},
        to=requester,
        namespace="/main",
    )
    socketio.emit(
        "signal",
        {"levels": acarshub_helpers.acarshub_database.get_signal_levels()},
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


@socketio.on("reset_alert_counts", namespace="/main")
def reset_alert_counts(message, namespace):
    if message["reset_alerts"]:
        acarshub_helpers.acarshub_database.reset_alert_counts()
        try:
            socketio.emit(
                "alert_terms", {"data": acarshub_helpers.getAlerts()}, namespace="/main"
            )
        except Exception as e:
            acarshub_configuration.log(
                f"Main Connect: Error sending alert_terms: {e}", "webapp"
            )


@socketio.on("disconnect", namespace="/main")
def main_disconnect():
    pass


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=acarshub_configuration.ACARS_WEB_PORT)


@socketio.on_error()
def error_handler(e):
    acarshub_configuration.acars_traceback(e, "server-error")


@socketio.on_error("/main")
def error_handler_main(e):
    acarshub_configuration.acars_traceback(e, "server-main")


@socketio.on_error_default
def default_error_handler(e):
    acarshub_configuration.acars_traceback(e, "server")
