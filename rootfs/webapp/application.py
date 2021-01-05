#!/usr/bin/env python3

import eventlet
eventlet.monkey_patch()
import os
import acarshub_db
if not os.getenv("SPAM", default=False):
    import acarshub_rrd
import logging

from flask_socketio import SocketIO
from flask import Flask, render_template, request
from threading import Thread, Event
from collections import deque

log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

app = Flask(__name__)
# Make the browser not cache files
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

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
    ping_timeout=300)

# scheduler thread

thread_scheduler = Thread()
thread_scheduler_stop_event = Event()

# threads for processing the incoming data

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

vdlm_messages = 0
acars_messages = 0
error_messages = 0


def update_rrd_db():
    global vdlm_messages
    global acars_messages
    global error_messages

    acarshub_rrd.update_db(vdlm=vdlm_messages, acars=acars_messages, error=error_messages)
    vdlm_messages = 0
    acars_messages = 0
    error_messages = 0


def htmlListener():
    import time
    import sys
    import os
    import copy
    import pprint

    # TOOLTIPS: <span class="wrapper">visible text<span class="tooltip">tooltip text</span></span>

    DEBUG_LOGGING = False
    if os.getenv("DEBUG_LOGGING", default=False):
        DEBUG_LOGGING = True

    # Run while requested...
    while not thread_html_generator_event.isSet():
        sys.stdout.flush()
        time.sleep(1)

        if len(que_messages) != 0:
            message_source, json_message_initial = que_messages.popleft()
            json_message = copy.deepcopy(json_message_initial)  # creating a copy so that our changes below aren't made to the object
            # Send output via socketio
            if DEBUG_LOGGING:
                print("[htmlListener] sending output via socketio.emit")
            json_message.update({"message_type": message_source})

            if "libacars" in json_message.keys():
                    html_output = "<p>Decoded:</p>"
                    html_output += "<p>"
                    html_output += "<pre>{libacars}</pre>".format(
                        libacars=pprint.pformat(
                            json_message['libacars'],
                            indent=2,
                        )
                    )
                    html_output += "</p>"

                    json_message['libacars'] = html_output

            if "flight" in json_message.keys():
                icao, airline = acarshub_db.find_airline_code_from_iata(json_message['flight'][:2])
                flight_number = json_message['flight'][2:]
                flight = icao + flight_number

                # If the iata and icao variables are not equal, airline was found in the database and we'll add in the tool-tip for the decoded airline
                # Otherwise, no tool-tip, no FA link, and use the IATA code for display
                if icao != json_message['flight'][:2]:
                    json_message['flight'] = f"Flight: <span class=\"wrapper\"><strong><a href=\"https://flightaware.com/live/flight/{flight}\" target=\"_blank\">{flight}/{json_message['flight']}</a></strong><span class=\"tooltip\">{airline} Flight {flight_number}</span></span> "
                else:
                    json_message['flight'] = f"Flight: <strong><a href=\"https://flightaware.com/live/flight/{flight}\" target=\"_blank\">{flight}</a></strong> "

            socketio.emit('newmsg', {'msghtml': json_message}, namespace='/main')
            if DEBUG_LOGGING:
                print("[htmlListener] packet sent via socketio.emit")
                print("[htmlListener] Completed with generation")
        else:
            pass

    if os.getenv("DEBUG_LOGGING", default=False):
        print("Exiting [htmlListener] thread")


def scheduled_tasks():
    import schedule
    import time

    # init the dbs if not already there

    if not os.getenv("SPAM", default=False):
        acarshub_rrd.create_db()
        acarshub_rrd.update_graphs()
        schedule.every().minute.at(":00").do(update_rrd_db)
        schedule.every().minute.at(":30").do(acarshub_rrd.update_graphs)

    # Schedule the database pruner
    schedule.every().hour.do(acarshub_db.pruneOld)
    while not thread_scheduler_stop_event.isSet():
        schedule.run_pending()
        time.sleep(1)


def database_listener():
    import sys
    import os
    import time

    DEBUG_LOGGING = False
    if os.getenv("DEBUG_LOGGING", default=False):
        DEBUG_LOGGING = True

    while not thread_database_stop_event.isSet():
        sys.stdout.flush()
        time.sleep(1)

        if len(que_database) != 0:
            if DEBUG_LOGGING:
                print("[databaseListener] Dispatching message to database")
            sys.stdout.flush()
            t, m = que_database.pop()
            acarshub_db.add_message_from_json(message_type=t, message_from_json=m)
        else:
            pass


def message_listener(message_type=None, ip='127.0.0.1', port=None):
    import time
    import socket
    import json
    import sys
    import os

    global error_messages

    if message_type == "VDLM2":
        global vdlm_messages
    else:
        global acars_messages

    disconnected = True

    DEBUG_LOGGING = False
    EXTREME_LOGGING = False
    SPAM = False
    if os.getenv("DEBUG_LOGGING", default=False):
        DEBUG_LOGGING = True
    if os.getenv("EXTREME_LOGGING", default=False):
        EXTREME_LOGGING = True
    if os.getenv("SPAM", default=False):
        SPAM = True

    receiver = socket.socket(
        family=socket.AF_INET,
        type=socket.SOCK_STREAM,)

    # Run while requested...
    while not thread_message_listener_stop_event.isSet():
        sys.stdout.flush()
        time.sleep(0)

        if EXTREME_LOGGING:
            print(f"[{message_type.lower()}Generator] listening for messages to {message_type.lower()}_receiver")
        try:
            if disconnected:
                receiver = socket.socket(
                    family=socket.AF_INET,
                    type=socket.SOCK_STREAM,
                )
                # Set socket timeout 1 seconds
                receiver.settimeout(1)

                if DEBUG_LOGGING:
                    print(f"[{message_type.lower()}Generator] {message_type.lower()}_receiver created")

                # Connect to the sender
                receiver.connect((ip, port))
                disconnected = False
                if DEBUG_LOGGING:
                    print(f"[{message_type.lower()}Generator] {message_type.lower()}_receiver connected to {ip}:{port}")

            data = None

            if SPAM is True:
                data, addr = receiver.recvfrom(65527)
            else:
                data, addr = receiver.recvfrom(65527, socket.MSG_WAITALL)
            if EXTREME_LOGGING:
                print(f"[{message_type.lower()}Generator] received data")
        except socket.timeout:
            if EXTREME_LOGGING:
                print(f"[{message_type.lower()}Generator] timeout")
            pass
        except socket.error as e:
            print(f"[{message_type.lower()}Generator] Error {e} to {ip}:{port}. Reattemping...")
            disconnected = True
            receiver.close()
            time.sleep(1)
        except Exception as e:
            print(f"[{message_type.lower()}Generator] Socket error: {e}")
            disconnected = True
            receiver.close()
            time.sleep(1)
        else:
            if data.decode() == '':
                print("[{message_type.lower()}Generator] Lost connection!")
                disconnected = True
                receiver.close()
                data = None
            elif data is not None:

                if os.getenv("DEBUG_LOGGING", default=None):
                    print(f"[{message_type.lower()} data] {repr(data)}")
                    sys.stdout.flush()

                if DEBUG_LOGGING:
                    print(f"[{message_type.lower()}Generator] data contains data")

                # Decode json
                # There is a rare condition where we'll receive two messages at once
                # We will cover this condition off by ensuring each json message is
                # broken apart and handled individually

                try:
                    message_json = []
                    if data.decode().count('}\n') == 1:
                        message_json.append(json.loads(data))
                    else:
                        split_json = data.decode().split('}\n')

                        for j in split_json:
                            if len(j) > 1:
                                message_json.append(json.loads(j + '}\n'))

                except Exception as e:
                    print(f"[{message_type.lower()} data] Error with JSON input {repr(data)} .\n{e}")
                else:
                    for j in message_json:
                        if message_type == "VDLM2":
                            vdlm_messages += 1
                            que_type = "VDL-M2"
                        else:
                            acars_messages += 1
                            que_type = "ACARS"

                        if "error" in j:
                            if j['error'] > 0:
                                error_messages += j['error']

                        if EXTREME_LOGGING:
                            print(json.dumps(j, indent=4, sort_keys=True))
                        if connected_users > 0:
                            if DEBUG_LOGGING:
                                print(f"[{message_type.lower()}Generator] appending message")
                            que_messages.append((que_type, j))
                        if DEBUG_LOGGING:
                            print(f"[{message_type.lower()}Generator] sending off to db")
                        que_database.append((que_type, j))


def init_listeners():
    import os
    global thread_acars_listener
    global thread_vdlm2_listener
    global thread_database
    global thread_scheduler

    if os.getenv("DEBUG_LOGGING", default=False):
        print('[init] Starting data listeners')

    if not thread_acars_listener.isAlive() and os.getenv("ENABLE_ACARS"):
        if os.getenv("DEBUG_LOGGING", default=False):
            print('[init] Starting ACARS listener')
        thread_acars_listener = Thread(target=message_listener, args=("ACARS", "127.0.0.1", 15550))
        thread_acars_listener.start()

    if not thread_vdlm2_listener.isAlive() and os.getenv("ENABLE_VDLM"):
        if os.getenv("DEBUG_LOGGING", default=False):
            print('[init] Starting VDLM listener')
        thread_vdlm2_listener = Thread(target=message_listener, args=("VDLM2", "127.0.0.1", 15555))
        thread_vdlm2_listener.start()
    if not thread_database.isAlive():
        if os.getenv("DEBUG_LOGGING", default=False):
            print('[init] Starting Database Thread')
        thread_database = Thread(target=database_listener)
        thread_database.start()
    if not thread_scheduler.isAlive():
        if os.getenv("DEBUG_LOGGING", default=False):
            print("[init] starting scheduler")
        thread_scheduler = Thread(target=scheduled_tasks)
        thread_scheduler.start()

# Any things we want to have started up in the background


init_listeners()


@app.route('/')
def index():
    # only by sending this page first will the client be connected to the socketio instance
    return render_template('index.html')


@app.route('/stats')
def stats():
    return render_template('stats.html')


@app.route('/search')
def search():
    return render_template('search.html')


# The listener for the live message page
# Ensure the necessary listeners are fired up


@socketio.on('connect', namespace='/main')
def main_connect():
    import os
    import sys
    # need visibility of the global thread object
    global thread_html_generator
    global connected_users

    connected_users += 1

    if os.getenv("DEBUG_LOGGING", default=False):
        print(f'Client connected. Total connected: {connected_users}')

    # Start the htmlGenerator thread only if the thread has not been started before.
    if not thread_html_generator.isAlive():
        if os.getenv("DEBUG_LOGGING", default=False):
            print("Starting htmlListener")
        sys.stdout.flush()
        thread_html_generator_event.clear()
        thread_html_generator = socketio.start_background_task(htmlListener)


@socketio.on('connect', namespace='/search')
def search_connect():
    import os

    if os.getenv("DEBUG_LOGGING", default=False):
        print('Client connected')
    pass


@socketio.on('connect', namespace='/stats')
def stats_connect():
    import os

    if os.getenv("DEBUG_LOGGING", default=False):
        print('Client connected stats')

    acars = False
    vdlm = False
    if os.getenv("ENABLE_ACARS", default=False):
        acars = True
    if os.getenv("ENABLE_VDLM", default=False):
        vdlm = True

    socketio.emit('newmsg', {"vdlm": vdlm, "acars": acars}, namespace='/stats')


# handle a query request from the browser


@socketio.on('query', namespace='/search')
def handle_message(message, namespace):
    # We are going to send the result over in one blob
    # search.js will only maintain the most recent blob we send over
    total_results = 0
    serialized_json = []
    # If the user has cleared the search bar, we'll execute the else statement
    # And the browsers clears the data
    # otherwise, run the search and format the results

    if message['search_term'] != "":
        # Decide if the user is executing a new search or is clicking on a page of results
        # search.js appends the "results_after" as the result page index user is requested
        # Otherwise, we're at the first page

        if 'results_after' in message:
            # ask the database for the results at the user requested index
            # multiply the selected index by 20 (we have 20 results per page) so the db
            # knows what result index to send back
            search = acarshub_db.database_search(message['field'], message['search_term'], message['results_after'] * 20)
        else:
            search = acarshub_db.database_search(message['field'], message['search_term'])

        # the db returns two values
        # index zero is the query results in json
        # the other is the count of total results

        query_result = search[0]
        if query_result is not None:
            total_results = search[1]
            # Loop through the results and format html
            for result in query_result:
                serialized_json.append(result)

    # grab the socket id for the request
    # This stops the broadcast of the search results to everyone
    # in the search namespace.

    requester = request.sid
    socketio.emit('newmsg', {'num_results': total_results, 'msghtml': serialized_json,
                             'search_term': str(message['search_term'])}, room=requester, namespace='/search')


@socketio.on('disconnect', namespace='/main')
def main_disconnect():
    global connected_users

    connected_users -= 1
    if os.getenv("DEBUG_LOGGING", default=False):
        print(f'Client disconnected. Total connected: {connected_users}')

    # Client disconnected, stop the htmlListener

    if connected_users == 0:
        thread_html_generator_event.set()
        que_messages.clear()


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=80)


@socketio.on_error()
def error_handler(e):
    print('[server] An error has occurred: ' + str(e))


@socketio.on_error('/main')
def error_handler_main(e):
    print('[server] An error has occurred: ' + str(e))


@socketio.on_error('/search')
def error_handler_search(e):
    print('[server] An error has occurred: ' + str(e))


@socketio.on_error_default
def default_error_handler(e):
    print('[server] An error has occurred: ' + str(e))
