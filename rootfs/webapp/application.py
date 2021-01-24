#!/usr/bin/env python3

import eventlet
eventlet.monkey_patch()
import acarshub
import acarshub_helpers
if not acarshub_helpers.SPAM:
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
messages_recent = []

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
    import copy

    # TOOLTIPS: <span class="wrapper">visible text<span class="tooltip">tooltip text</span></span>

    # Run while requested...
    while not thread_html_generator_event.isSet():
        sys.stdout.flush()
        time.sleep(1)

        if len(que_messages) != 0:
            message_source, json_message_initial = que_messages.popleft()
            json_message = copy.deepcopy(json_message_initial)  # creating a copy so that our changes below aren't made to the parent object
            # Send output via socketio
            if acarshub_helpers.DEBUG_LOGGING:
                print("[htmlListener] sending output via socketio.emit")
            json_message.update({"message_type": message_source})

            json_message = acarshub.update_keys(json_message)

            socketio.emit('newmsg', {'msghtml': json_message}, namespace='/main')
            if acarshub_helpers.DEBUG_LOGGING:
                print("[htmlListener] packet sent via socketio.emit")
                print("[htmlListener] Completed with generation")
        else:
            pass

    if acarshub_helpers.DEBUG_LOGGING:
        print("Exiting [htmlListener] thread")


def scheduled_tasks():
    import schedule
    import time

    # init the dbs if not already there

    if not acarshub_helpers.SPAM:
        acarshub_rrd.create_db()
        acarshub_rrd.update_graphs()
        schedule.every().minute.at(":00").do(update_rrd_db)
        schedule.every().minute.at(":30").do(acarshub_rrd.update_graphs)

    # Schedule the database pruner
    schedule.every().hour.do(acarshub.acarshub_db.pruneOld)
    while not thread_scheduler_stop_event.isSet():
        schedule.run_pending()
        time.sleep(1)


def database_listener():
    import sys
    import time

    while not thread_database_stop_event.isSet():
        sys.stdout.flush()
        time.sleep(1)

        if len(que_database) != 0:
            if acarshub_helpers.DEBUG_LOGGING:
                print("[databaseListener] Dispatching message to database")
            sys.stdout.flush()
            t, m = que_database.pop()
            acarshub.acarshub_db.add_message_from_json(message_type=t, message_from_json=m)
        else:
            pass


def message_listener(message_type=None, ip='127.0.0.1', port=None):
    import time
    import socket
    import json
    import sys

    global error_messages

    if message_type == "VDLM2":
        global vdlm_messages
    else:
        global acars_messages

    disconnected = True

    receiver = socket.socket(
        family=socket.AF_INET,
        type=socket.SOCK_STREAM,)

    # Run while requested...
    while not thread_message_listener_stop_event.isSet():
        sys.stdout.flush()
        time.sleep(0)

        if acarshub_helpers.EXTREME_LOGGING:
            print(f"[{message_type.lower()}Generator] listening for messages to {message_type.lower()}_receiver")
        try:
            if disconnected:
                receiver = socket.socket(
                    family=socket.AF_INET,
                    type=socket.SOCK_STREAM,
                )
                # Set socket timeout 1 seconds
                receiver.settimeout(1)

                if acarshub_helpers.DEBUG_LOGGING:
                    print(f"[{message_type.lower()}Generator] {message_type.lower()}_receiver created")

                # Connect to the sender
                receiver.connect((ip, port))
                disconnected = False
                if acarshub_helpers.DEBUG_LOGGING:
                    print(f"[{message_type.lower()}Generator] {message_type.lower()}_receiver connected to {ip}:{port}")

            data = None

            if acarshub_helpers.SPAM is True:
                data, addr = receiver.recvfrom(65527)
            else:
                data, addr = receiver.recvfrom(65527, socket.MSG_WAITALL)
            if acarshub_helpers.EXTREME_LOGGING:
                print(f"[{message_type.lower()}Generator] received data")
        except socket.timeout:
            if acarshub_helpers.EXTREME_LOGGING:
                print(f"[{message_type.lower()}Generator] timeout")
            pass
        except socket.error as e:
            print(f"[{message_type.lower()}Generator] Error to {ip}:{port}. Reattemping...")
            acarshub_helpers.acars_traceback(e, f"{message_type.lower()}Generator")
            disconnected = True
            receiver.close()
            time.sleep(1)
        except Exception as e:
            print(f"[{message_type.lower()}Generator] Socket error: {e}")
            acarshub_helpers.acars_traceback(e, f"{message_type.lower()}Generator")
            disconnected = True
            receiver.close()
            time.sleep(1)
        else:
            if data.decode() == '':
                print(f"[{message_type.lower()}Generator] Lost connection!")
                disconnected = True
                receiver.close()
                data = None
            elif data is not None:

                if acarshub_helpers.DEBUG_LOGGING:
                    print(f"[{message_type.lower()} data] {repr(data)}")
                    sys.stdout.flush()

                if acarshub_helpers.DEBUG_LOGGING:
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

                        if acarshub_helpers.EXTREME_LOGGING:
                            print(json.dumps(j, indent=4, sort_keys=True))
                        if connected_users > 0:
                            if acarshub_helpers.DEBUG_LOGGING:
                                print(f"[{message_type.lower()}Generator] appending message")
                            que_messages.append((que_type, j))
                        if acarshub_helpers.DEBUG_LOGGING:
                            print(f"[{message_type.lower()}Generator] sending off to db")
                        que_database.append((que_type, j))
                        if(len(messages_recent) >= 50):
                            del messages_recent[0]
                        messages_recent.append((que_type, j))


def init_listeners():
    global thread_acars_listener
    global thread_vdlm2_listener
    global thread_database
    global thread_scheduler

    if acarshub_helpers.DEBUG_LOGGING:
        print('[init] Starting data listeners')

    if not thread_acars_listener.isAlive() and acarshub_helpers.ENABLE_ACARS:
        if acarshub_helpers.DEBUG_LOGGING:
            print('[init] Starting ACARS listener')
        thread_acars_listener = Thread(target=message_listener, args=("ACARS", "127.0.0.1", 15550))
        thread_acars_listener.start()

    if not thread_vdlm2_listener.isAlive() and acarshub_helpers.ENABLE_VDLM:
        if acarshub_helpers.DEBUG_LOGGING:
            print('[init] Starting VDLM listener')
        thread_vdlm2_listener = Thread(target=message_listener, args=("VDLM2", "127.0.0.1", 15555))
        thread_vdlm2_listener.start()
    if not thread_database.isAlive():
        if acarshub_helpers.DEBUG_LOGGING:
            print('[init] Starting Database Thread')
        thread_database = Thread(target=database_listener)
        thread_database.start()
    if not thread_scheduler.isAlive():
        if acarshub_helpers.DEBUG_LOGGING:
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


@app.route('/about')
def about():
    return render_template('about.html')


@app.route('/aboutmd')
def aboutmd():
    return render_template('helppage.MD')


# The listener for the live message page
# Ensure the necessary listeners are fired up


@socketio.on('connect', namespace='/main')
def main_connect():
    import sys
    import json
    # need visibility of the global thread object
    global thread_html_generator
    global connected_users

    connected_users += 1

    if acarshub_helpers.DEBUG_LOGGING:
        print(f'Client connected. Total connected: {connected_users}')

    requester = request.sid
    socketio.emit('labels', {'labels': acarshub.acarshub_db.get_message_label_json()}, room=requester,
                  namespace="/main")
    for msg_type, json_message in messages_recent:
        json_message.update({"message_type": msg_type})
        socketio.emit('newmsg', {'msghtml': acarshub.update_keys(json_message)}, room=requester,
                      namespace='/main')

    # Start the htmlGenerator thread only if the thread has not been started before.
    if not thread_html_generator.isAlive():
        if acarshub_helpers.DEBUG_LOGGING:
            print("Starting htmlListener")
        sys.stdout.flush()
        thread_html_generator_event.clear()
        thread_html_generator = socketio.start_background_task(htmlListener)


@socketio.on('connect', namespace='/search')
def search_connect():
    if acarshub_helpers.DEBUG_LOGGING:
        print('Client connected')

    rows, size = acarshub.acarshub_db.database_get_row_count()
    requester = request.sid
    socketio.emit('database', {"count": rows, "size": size}, room=requester, namespace='/search')


@socketio.on('connect', namespace='/stats')
def stats_connect():
    if acarshub_helpers.DEBUG_LOGGING:
        print('Client connected stats')

    socketio.emit('newmsg', {"vdlm": acarshub_helpers.ENABLE_VDLM, "acars": acarshub_helpers.ENABLE_ACARS},
                   namespace='/stats')


@socketio.on('freqs', namespace="/stats")
def request_freqs(message, namespace):
    requester = request.sid
    socketio.emit('freqs', {'freqs': acarshub.acarshub_db.get_freq_count()}, room=requester,
                  namespace="/stats")


@socketio.on('count', namespace="/stats")
def request_count(message, namespace):
    requester = request.sid
    socketio.emit('count', {'count': acarshub.acarshub_db.get_errors()}, room=requester, 
                  namespace="/stats")

# handle a query request from the browser


@socketio.on('query', namespace='/search')
def handle_message(message, namespace):

    # We are going to send the result over in one blob
    # search.js will only maintain the most recent blob we send over
    total_results, serialized_json, search_term = acarshub.handle_message(message)

    # grab the socket id for the request
    # This stops the broadcast of the search results to everyone
    # in the search namespace.

    requester = request.sid
    socketio.emit('newmsg', {'num_results': total_results, 'msghtml': serialized_json,
                             'search_term': str(search_term)}, room=requester, namespace='/search')


@socketio.on('disconnect', namespace='/main')
def main_disconnect():
    import time
    global connected_users

    connected_users -= 1
    if acarshub_helpers.DEBUG_LOGGING:
        print(f'Client disconnected. Total connected: {connected_users}')

    # Client disconnected, stop the htmlListener
    # We are going to pause for one second in case the user was refreshing the page
    time.sleep(1)
    if connected_users == 0:
        thread_html_generator_event.set()
        que_messages.clear()


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=80)


@socketio.on_error()
def error_handler(e):
    acarshub_helpers.acars_traceback(e, "server-error")


@socketio.on_error('/main')
def error_handler_main(e):
    acarshub_helpers.acars_traceback(e, "server-main")


@socketio.on_error('/search')
def error_handler_search(e):
    acarshub_helpers.acars_traceback(e, "server-search")


@socketio.on_error('/stats')
def stats_handler_search(e):
    acarshub_helpers.acars_traceback(e, "server-stats")


@socketio.on_error_default
def default_error_handler(e):
    acarshub_helpers.acars_traceback(e, "server")
