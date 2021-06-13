#!/usr/bin/env python3

import eventlet

eventlet.monkey_patch()
import acarshub
import acarshub_helpers
from adsb import ADSBClient

if not acarshub_helpers.SPAM:
    import acarshub_rrd
import logging

from flask_socketio import SocketIO
from flask import Flask, render_template, request, redirect, url_for
from threading import Thread, Event
from collections import deque

log = logging.getLogger("werkzeug")
log.setLevel(logging.ERROR)

app = Flask(__name__)
# Make the browser not cache files
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

# Global variable to keep track of connected users in the main namespace
connected_users = 0

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

# adsb threads

thread_adsb = Thread()
thread_adsb_stop_event = Event()

thread_adsb_listner = Thread()
thread_adsb_listner_stop_event = Event()

# maxlen is to keep the que from becoming ginormous
# the messages will be in the que all the time, even if no one is using the website
# old messages will automatically be removed
# Note on the que: We are adding new messages to the right
# This means oldest messages are to the left

que_messages = deque(maxlen=15)
que_database = deque(maxlen=15)
que_adsb = deque(maxlen=1)
messages_recent = []  # list to store most recent msgs

# counters for messages
# will be reset once written to RRD
vdlm_messages = 0
acars_messages = 0
error_messages = 0

# all namespaces

acars_namespaces = ["/main"]


def update_rrd_db():
    global vdlm_messages
    global acars_messages
    global error_messages

    acarshub_rrd.update_db(
        vdlm=vdlm_messages, acars=acars_messages, error=error_messages
    )
    vdlm_messages = 0
    acars_messages = 0
    error_messages = 0


def adsbListener():
    import time
    import sys

    global connected_users
    global que_adsb

    while not thread_adsb_stop_event.isSet():
        sys.stdout.flush()
        time.sleep(1)

        while len(que_adsb) != 0:
            adsb_msg = que_adsb.pop()

            if connected_users > 0:
                socketio.emit("adsb", {"planes": adsb_msg}, namespace="/main")


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
            json_message = acarshub.update_keys(json_message)

            socketio.emit("acars_msg", {"msghtml": json_message}, namespace="/main")

    if acarshub_helpers.DEBUG_LOGGING:
        acarshub_helpers.log("Exiting HTML Listener thread", "htmlListener")


def scheduled_tasks():
    import schedule
    import time

    # init the dbs if not already there

    if not acarshub_helpers.SPAM:
        acarshub_rrd.create_db()  # make sure the RRD DB is created / there
        acarshub_rrd.update_graphs()  # generate graphs for the website so we don't 404 on images right after launch
        acarshub.service_check()

        schedule.every().minute.at(":00").do(update_rrd_db)
        schedule.every().minute.at(":30").do(acarshub_rrd.update_graphs)
        schedule.every().minute.at(":15").do(acarshub.service_check)
        # Run and Schedule the database pruner
        acarshub.acarshub_db.pruneOld()  # clean the database on startup
        schedule.every().hour.at(":30").do(acarshub.acarshub_db.pruneOld)

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
            acarshub.acarshub_db.add_message_from_json(
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
    global alert_users

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
                if acarshub_helpers.DEBUG_LOGGING:
                    acarshub_helpers.log(
                        f"{message_type.lower()}_receiver connected to {ip}:{port}",
                        f"{message_type.lower()}Generator",
                    )

            data = None

            if acarshub_helpers.SPAM is True:
                data, addr = receiver.recvfrom(65527)
            else:
                data, addr = receiver.recvfrom(65527, socket.MSG_WAITALL)
        except socket.timeout:
            pass
        except socket.error as e:
            acarshub_helpers.log(
                f"Error to {ip}:{port}. Reattemping...",
                f"{message_type.lower()}Generator",
            )
            acarshub_helpers.acars_traceback(e, f"{message_type.lower()}Generator")
            disconnected = True
            receiver.close()
            time.sleep(1)
        except Exception as e:
            acarshub_helpers.acars_traceback(e, f"{message_type.lower()}Generator")
            disconnected = True
            receiver.close()
            time.sleep(1)
        else:
            if data.decode() == "":
                disconnected = True
                receiver.close()
                data = None
            elif data is not None:

                if acarshub_helpers.DEBUG_LOGGING:
                    acarshub_helpers.log(
                        f"{repr(data)}", f"{message_type.lower()}Generator"
                    )
                    sys.stdout.flush()

                # Decode json
                # There is a rare condition where we'll receive two messages at once
                # We will cover this condition off by ensuring each json message is
                # broken apart and handled individually

                try:
                    message_json = []
                    if data.decode().count("}\n") == 1 or message_type == "ADSB":
                        message_json.append(json.loads(data))
                    else:
                        split_json = data.decode().split("}\n")

                        for j in split_json:
                            if len(j) > 1:
                                message_json.append(json.loads(j + "}\n"))

                except Exception as e:
                    acarshub_helpers.log(
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
                        if message_type == "ADSB":
                            que_adsb.append(j)
                        else:
                            if (
                                connected_users > 0
                            ):  # que message up if someone is on live message page
                                que_messages.append((que_type, j))
                            que_database.append((que_type, j))
                            if len(messages_recent) >= 150:  # Keep the que size down
                                del messages_recent[0]
                            messages_recent.append(
                                (que_type, j)
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

    # show log message if this is container startup
    if special_message == "":
        acarshub_helpers.log("Starting data listeners", "init")

    if not thread_acars_listener.is_alive() and acarshub_helpers.ENABLE_ACARS:
        acarshub_helpers.log(f"{special_message}Starting ACARS listener", "init")
        thread_acars_listener = Thread(
            target=message_listener,
            args=("ACARS", acarshub_helpers.LIVE_DATA_SOURCE, 15550),
        )
        thread_acars_listener.start()

    if not thread_vdlm2_listener.is_alive() and acarshub_helpers.ENABLE_VDLM:
        acarshub_helpers.log(f"{special_message}Starting VDLM listener", "init")
        thread_vdlm2_listener = Thread(
            target=message_listener,
            args=("VDLM2", acarshub_helpers.LIVE_DATA_SOURCE, 15555),
        )
        thread_vdlm2_listener.start()
    if not thread_database.is_alive():
        acarshub_helpers.log(f"{special_message}Starting Database Thread", "init")
        thread_database = Thread(target=database_listener)
        thread_database.start()
    if not thread_scheduler.is_alive():
        acarshub_helpers.log(f"{special_message}starting scheduler", "init")
        thread_scheduler = Thread(target=scheduled_tasks)
        thread_scheduler.start()
    if connected_users > 0 and not thread_html_generator.is_alive():
        acarshub_helpers.log(f"{special_message}Starting htmlListener", "init")
        thread_html_generator = socketio.start_background_task(htmlListener)

    if not thread_adsb.is_alive() and acarshub_helpers.ENABLE_ADSB:
        acarshub_helpers.log(f"{special_message}Starting ADSB Listener", "init")
        thread_adsb = Thread(target=message_listener, args=("ADSB", "127.0.0.1", 29005))
        thread_adsb.start()

    if not thread_adsb_listner.is_alive() and acarshub_helpers.ENABLE_ADSB:
        acarshub_helpers.log(f"{special_message}Starting ADSB Emitter", "init")
        thread_adsb_listner = Thread(target=adsbListener)
        thread_adsb_listner.start()

    status = acarshub.get_service_status()  # grab system status

    # emit to all namespaces
    for page in acars_namespaces:
        socketio.emit("system_status", {"status": status}, namespace=page)


def init():
    global messages_recent
    # grab recent messages from db and fill the most recent array
    # then turn on the listeners
    acarshub_helpers.log("grabbing most recent messages from database", "init")
    results = acarshub.acarshub_db.grab_most_recent()

    if results is not None:
        for item in results:
            json_message = item
            messages_recent.insert(0, [json_message["message_type"], json_message])
    acarshub_helpers.log(
        "Completed grabbing messages from database, starting up rest of services",
        "init",
    )
    init_listeners()


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
    # TODO: Fix on load ADSB
    if acarshub_helpers.ENABLE_ADSB:
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
    global connected_users

    recent_options = {"loading": True, "done_loading": False}

    connected_users += 1

    requester = request.sid

    socketio.emit(
        "features_enabled",
        {
            "vdlm": acarshub_helpers.ENABLE_VDLM,
            "acars": acarshub_helpers.ENABLE_ACARS,
            "adsb": {
                "enabled": acarshub_helpers.ENABLE_ADSB,
                "lat": acarshub_helpers.ADSB_LAT,
                "lon": acarshub_helpers.ADSB_LON,
            },
        },
        namespace="/main",
    )

    socketio.emit(
        "terms", {"terms": acarshub.acarshub_db.get_alert_terms()}, namespace="/main"
    )

    socketio.emit(
        "labels",
        {"labels": acarshub.acarshub_db.get_message_label_json()},
        to=requester,
        namespace="/main",
    )
    msg_index = 1
    for msg_type, json_message_orig in messages_recent:
        if msg_index == len(messages_recent):
            recent_options["done_loading"] = True
        msg_index += 1
        json_message = copy.deepcopy(json_message_orig)
        json_message["message_type"] = msg_type
        socketio.emit(
            "acars_msg",
            {"msghtml": acarshub.update_keys(json_message), **recent_options},
            to=requester,
            namespace="/main",
        )

    socketio.emit(
        "system_status", {"status": acarshub.get_service_status()}, namespace="/main"
    )

    rows, size = acarshub.acarshub_db.database_get_row_count()
    socketio.emit(
        "database", {"count": rows, "size": size}, to=requester, namespace="/main"
    )

    socketio.emit(
        "signal",
        {"levels": acarshub.acarshub_db.get_signal_levels()},
        namespace="/main",
    )
    socketio.emit("alert_terms", {"data": acarshub.getAlerts()}, namespace="/main")

    # Start the htmlGenerator thread only if the thread has not been started before.
    if not thread_html_generator.is_alive():
        sys.stdout.flush()
        thread_html_generator_event.clear()
        thread_html_generator = socketio.start_background_task(htmlListener)


@socketio.on("query_terms", namespace="/main")
def get_alerts(message, namespace):
    requester = request.sid
    results = acarshub.acarshub_db.search_alerts(
        icao=message["icao"],
        # text=message["text"],
        flight=message["flight"],
        tail=message["tail"],
    )
    if results is not None:
        results.reverse()

    for item in [item for item in (results or [])]:
        socketio.emit(
            "alert_matches",
            {"msghtml": acarshub.update_keys(item), "loading": True},
            to=requester,
            namespace="/main",
        )


@socketio.on("update_alerts", namespace="/main")
def update_alerts(message, namespace):
    acarshub.acarshub_db.set_alert_terms(message["terms"])


@socketio.on("signal_freqs", namespace="/main")
def request_freqs(message, namespace):
    requester = request.sid
    socketio.emit(
        "signal_freqs",
        {"freqs": acarshub.acarshub_db.get_freq_count()},
        to=requester,
        namespace="/main",
    )


@socketio.on("signal_count", namespace="/main")
def request_count(message, namespace):
    requester = request.sid
    socketio.emit(
        "signal_count",
        {"count": acarshub.acarshub_db.get_errors()},
        to=requester,
        namespace="/main",
    )


@socketio.on("signal_graphs", namespace="/main")
def request_graphs(message, namespace):
    requester = request.sid
    socketio.emit(
        "alert_terms", {"data": acarshub.getAlerts()}, to=requester, namespace="/main"
    )


# handle a query request from the browser


@socketio.on("query_search", namespace="/main")
def handle_message(message, namespace):
    import time

    print("starting search")
    start_time = time.time()
    # We are going to send the result over in one blob
    # search.js will only maintain the most recent blob we send over
    total_results, serialized_json, search_term = acarshub.handle_message(message)

    # grab the socket id for the request
    # This stops the broadcast of the search results to everyone
    # in the search namespace.

    requester = request.sid
    print(total_results)
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


@socketio.on("disconnect", namespace="/main")
def main_disconnect():
    import time

    global connected_users

    connected_users -= 1

    # Client disconnected, stop the htmlListener
    # We are going to pause for one second in case the user was refreshing the page
    time.sleep(1)
    if connected_users == 0:
        thread_html_generator_event.set()
        que_messages.clear()


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=80)


@socketio.on_error()
def error_handler(e):
    acarshub_helpers.acars_traceback(e, "server-error")


@socketio.on_error("/main")
def error_handler_main(e):
    acarshub_helpers.acars_traceback(e, "server-main")


@socketio.on_error_default
def default_error_handler(e):
    acarshub_helpers.acars_traceback(e, "server")
