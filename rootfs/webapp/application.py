#!/usr/bin/env python3

import eventlet
eventlet.monkey_patch()
import acarshub_db
import logging
import os

from flask_socketio import SocketIO, emit
from flask import Flask, render_template, url_for, copy_current_request_context
from threading import Thread, Event
from collections import deque

log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

app = Flask(__name__)
# app.config['SECRET_KEY'] = 'secret!'
# app.config['DEBUG'] = True

# turn the flask app into a socketio app
# regarding async_handlers=True, see: https://github.com/miguelgrinberg/Flask-SocketIO/issues/348
socketio = SocketIO(
    app,
    async_mode=None,
    async_handlers=True,
    logger=False,
    engineio_logger=False,
    ping_timeout=300)

# random number Generator Thread

# threads for processing the incoming data

thread_html_generator = Thread()
thread_html_generator_event = Event()

# web thread

thread_acars_listener = Thread()
thread_vdlm2_listener = Thread()
thread_acars_listener_stop_event = Event()
thread_vdlm2_listener_stop_event = Event()

# db thread

thread_database = Thread()
thread_database_stop_event = Event()

# maxlen is to keep the que from becoming ginormous
# the messages will be in the que all the time, even if no one is using the website
# old messages will automatically be removed
# the nice thing is once a web page is loaded message should auto-populate

que_messages = deque(maxlen=15)
que_database = deque(maxlen=15)


def htmlGenerator():
    import time
    import datetime
    import json
    import pprint
    import sys
    import os

    # TOOLTIPS: <span class="wrapper">visible text<span class="tooltip">tooltip text</span></span>

    DEBUG_LOGGING = False
    EXTREME_LOGGING = False
    if os.getenv("DEBUG_LOGGING", default=False):
        DEBUG_LOGGING = True
    if os.getenv("EXTREME_LOGGING", default=False):
        EXTREME_LOGGING = True

    # Run while requested...
    while not thread_html_generator_event.isSet():
        sys.stdout.flush()
        time.sleep(1)

        if len(que_messages) != 0:
            if DEBUG_LOGGING:
                print("[htmlGenerator] Generating HTML")
            # Set up list allowing us to track what keys have been decoded
            message_source, json_message = que_messages.pop()
            remaining_keys = list(json_message.keys())

            # Prepare Table HTML
            html_output = str()
            html_output += "<table id=\"shadow\">"

            # Table header row, message type & from
            html_output += "<tr>"
            html_output += "<td>{msgtype} from {station_id}</td>".format(
                msgtype=f"{message_source}",
                station_id=json_message['station_id'],
            )
            remaining_keys.remove('station_id')

            # Table header row, timestamp
            html_output += "<td style=\"text-align: right\">{timestamp}</td>".format(
                timestamp=datetime.datetime.fromtimestamp(json_message['timestamp']).strftime(r'%Y-%m-%d T: %H:%M:%S')
            )
            remaining_keys.remove('timestamp')
            html_output += "</tr>"

            # Table content
            html_output += "<tr><td colspan=\"2\">"

            if "toaddr" in json_message.keys():
                html_output += "<p>To Address: {toaddr}</p>".format(
                    toaddr=json_message['toaddr']
                )
                remaining_keys.remove('toaddr')

            if "fromaddr" in json_message.keys():
                html_output += "<p>From Address: {fromaddr}</p>".format(
                    fromaddr=json_message['fromaddr']
                )
                remaining_keys.remove('fromaddr')

            if "depa" in json_message.keys():
                html_output += "<p>Departing: {depa}</p>".format(
                    depa=json_message['depa']
                )
                remaining_keys.remove('depa')

            if "dsta" in json_message.keys():
                html_output += "<p>Destination: {dsta}</p>".format(
                    dsta=json_message['dsta']
                )
                remaining_keys.remove('dsta')

            if "eta" in json_message.keys():
                html_output += "<p>Estimated time of arrival: {eta} hours</p>".format(
                    eta=json_message['eta']
                )
                remaining_keys.remove('eta')

            if "gtout" in json_message.keys():
                html_output += "<p>Pushback from gate: {gtout} hours</p>".format(
                    gtout=json_message['gtout']
                )
                remaining_keys.remove('gtout')

            if "gtin" in json_message.keys():
                html_output += "<p>Arriving at gate: {gtin} hours</p>".format(
                    gtin=json_message['gtin']
                )
                remaining_keys.remove('gtin')

            if "wloff" in json_message.keys():
                html_output += "<p>Wheels off: {wloff} hours</p>".format(
                    wloff=json_message['wloff']
                )
                remaining_keys.remove('wloff')

            if "wlin" in json_message.keys():
                html_output += "<p>Wheels down: {wlin}</p>".format(
                    wlin=json_message['wlin']
                )
                remaining_keys.remove('wlin')

            if "lat" in json_message.keys():
                html_output += "<p>Latitude: {lat}</p>".format(
                    lat=json_message['lat']
                )
                remaining_keys.remove('lat')

            if "lon" in json_message.keys():
                html_output += "<p>Longitude: {lon}</p>".format(
                    lon=json_message['lon']
                )
                remaining_keys.remove('lon')

            if "alt" in json_message.keys():
                html_output += "<p>Altitude: {alt}</p>".format(
                    alt=json_message['alt']
                )
                remaining_keys.remove('alt')

            if "text" in json_message.keys():
                html_output += "<p>"
                html_output += "<pre id=\"shadow\">{text}</pre>".format(
                    text=json_message['text'].replace("\r\n", "\n"),
                )
                remaining_keys.remove('text')
                html_output += "</p>"
            elif "data" in json_message.keys():
                html_output += "<p>"
                html_output += "<pre id=\"shadow\">{data}</pre>".format(
                    data=json_message['data'].replace("\r\n", "\n"),
                )
                remaining_keys.remove('data')
                html_output += "</p>"
            else:
                html_output += "<p><i>No text</i></p>"

            if "libacars" in json_message.keys():
                html_output += "<p>Decoded:</p>"
                html_output += "<p>"
                html_output += "<pre id=\"shadow\">{libacars}</pre>".format(
                    libacars=pprint.pformat(
                        json_message['libacars'],
                        indent=2,
                    )
                )
                remaining_keys.remove('libacars')
                html_output += "</p>"

            html_output += "</td></tr>"

            # Table footer row, tail & flight info
            html_output += "<tr>"
            html_output += "<td>"
            if "tail" in json_message.keys():
                html_output += "Tail: <a href=\"https://flightaware.com/live/flight/{tail}\" target=\"_blank\">{tail}</a> ".format(
                    tail=json_message['tail'],
                )
                remaining_keys.remove('tail')
            if "flight" in json_message.keys():
                icao, airline = acarshub_db.find_airline_code_from_iata(json_message['flight'][:2])
                flight_number = json_message['flight'][2:]
                flight = icao + flight_number

                # If the iata and icao variables are not equal, airline was found in the database and we'll add in the tool-tip for the decoded airline
                # Otherwise, no tool-tip and use the IATA code
                if icao != json_message['flight'][:2]:
                    html_output += f"Flight: <span class=\"wrapper\"><a href=\"https://flightaware.com/live/flight/{flight}\" target=\"_blank\">{flight}</a><span class=\"tooltip\">{airline} Flight {flight_number}</span></span> "
                else:
                    html_output += f"Flight: <a href=\"https://flightaware.com/live/flight/{flight}\" target=\"_blank\">{flight}</a> "
                remaining_keys.remove('flight')
            if "icao" in json_message.keys():
                html_output += "ICAO: {icao} ".format(
                    icao=json_message['icao'],
                )
                remaining_keys.remove('icao')
            html_output += "</td>"

            # Table footer row, metadata
            html_output += "<td style=\"text-align: right\">"
            if "freq" in json_message.keys():
                html_output += "F: {freq} ".format(
                    freq=json_message['freq'],
                )
                remaining_keys.remove('freq')

            if "ack" in json_message.keys():
                if json_message['ack'] is not False:
                    html_output += "A: {ack} ".format(
                        ack=json_message['ack'],
                    )
                remaining_keys.remove('ack')

            if "mode" in json_message.keys():
                html_output += "M: {mode} ".format(
                    mode=json_message['mode'],
                )
                remaining_keys.remove('mode')

            if "label" in json_message.keys():
                html_output += "L: {label} ".format(
                    label=json_message['label'],
                )
                remaining_keys.remove('label')

            if "block_id" in json_message.keys():
                html_output += "B: {block_id} ".format(
                    block_id=json_message['block_id'],
                )
                remaining_keys.remove('block_id')

            if "msgno" in json_message.keys():
                html_output += "M#: {msgno} ".format(
                    msgno=json_message['msgno'],
                )
                remaining_keys.remove('msgno')

            if "is_response" in json_message.keys():
                html_output += "R: {is_response} ".format(
                    is_response=json_message['is_response'],
                )
                remaining_keys.remove('is_response')

            if "is_onground" in json_message.keys():
                html_output += "G: {is_onground} ".format(
                    is_onground=json_message['is_onground'],
                )
                remaining_keys.remove('is_onground')

            if "error" in json_message.keys():
                if json_message['error'] != 0:
                    html_output += '<span style="color:red;">'
                    html_output += "E: {error} ".format(
                        error=json_message['error'],
                    )
                    html_output += '</span>'
                remaining_keys.remove('error')

            html_output += "</td>"
            html_output += "</tr>"

            # Finish table html
            html_output += "</table>"

            if EXTREME_LOGGING:
                print(html_output)

            # Send output via socketio
            if EXTREME_LOGGING:
                print("[acarsGenerator] sending output via socketio.emit")
            socketio.emit('newmsg', {'msghtml': html_output}, namespace='/test')
            if EXTREME_LOGGING:
                print("[acarsGenerator] packet sent via socketio.emit")

            # Remove leftover keys that we don't really care about (do we care about these?)
            if 'channel' in remaining_keys:
                remaining_keys.remove('channel')
            if 'level' in remaining_keys:
                remaining_keys.remove('level')
            if 'end' in remaining_keys:
                remaining_keys.remove('end')

            if len(remaining_keys) > 0:
                print("")
                print("Non decoded data exists:")
                print(repr(remaining_keys))
                print("")
                print(json.dumps(json_message, indent=4, sort_keys=True))
                print("")
                print("-----")
        else:
            pass


def database_listener():
    import sys
    import os
    import time
    import schedule

    DEBUG_LOGGING = False
    if os.getenv("DEBUG_LOGGING", default=False):
        DEBUG_LOGGING = True

    # Schedule the database pruner
    schedule.every().hour.do(acarshub_db.pruneOld)

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

        # Check and see if the db needs pruning
        schedule.run_pending()


def acars_listener():
    import time
    import socket
    import json
    import sys
    import os

    DEBUG_LOGGING = False
    EXTREME_LOGGING = False
    SPAM = False
    if os.getenv("DEBUG_LOGGING", default=False):
        DEBUG_LOGGING = True
    if os.getenv("EXTREME_LOGGING", default=False):
        EXTREME_LOGGING = True
    if os.getenv("SPAM", default=False):
        SPAM = True
    print(SPAM)

    # Define acars_receiver
    acars_receiver = socket.socket(
        family=socket.AF_INET,
        type=socket.SOCK_STREAM,
    )

    # Set socket timeout 1 seconds
    acars_receiver.settimeout(1)

    if DEBUG_LOGGING:
        print("[acarsGenerator] acars_receiver created")

    # Connect to 127.0.0.1:15550 for JSON messages acarsdec
    acars_receiver.connect(('127.0.0.1', 15550))
    if DEBUG_LOGGING:
        print("[acarsGenerator] acars_receiver connected to 127.0.0.1:15550")

    while not thread_acars_listener_stop_event.isSet():
        if EXTREME_LOGGING:
            print("[acarsGenerator] listening for messages to acars_receiver")
        sys.stdout.flush()
        time.sleep(1)

        data = None

        try:
            if SPAM is True:
                data, addr = acars_receiver.recvfrom(65527)
            else:
                data, addr = acars_receiver.recvfrom(65527, socket.MSG_WAITALL)
            if EXTREME_LOGGING:
                print("[acarsGenerator] received data")
        except socket.timeout:
            if EXTREME_LOGGING:
                print("[acarsGenerator] timeout")
            pass

        if data is not None:
            if os.getenv("DEBUG_LOGGING", default=None):
                print("[acars data] %s" % (repr(data)))
                sys.stdout.flush()

            if EXTREME_LOGGING:
                print("[acarsGenerator] received data")
            # Decode json
            try:
                acars_json = json.loads(data)
            except Exception:
                print("[acars data] Error with JSON input %s ." % (repr(data)))
            else:
                if EXTREME_LOGGING:
                    print(json.dumps(acars_json, indent=4, sort_keys=True))
                if DEBUG_LOGGING:
                    print("[acarsGenerator] appending message")
                que_messages.append(("ACARS", acars_json))
                if DEBUG_LOGGING:
                    print("[acarsGenerator] sending off to db")
                que_database.append(("ACARS", acars_json))


def vdlm_listener():
    import time
    import socket
    import json
    import sys
    import os

    DEBUG_LOGGING = False
    EXTREME_LOGGING = False
    SPAM = False
    if os.getenv("DEBUG_LOGGING", default=False):
        DEBUG_LOGGING = True
    if os.getenv("EXTREME_LOGGING", default=False):
        EXTREME_LOGGING = True
    if os.getenv("SPAM", default=False):
        SPAM = True

    # Define vdlm2_receiver
    vdlm2_receiver = socket.socket(
        family=socket.AF_INET,
        type=socket.SOCK_STREAM,
    )

    # Set socket timeout 1 seconds
    vdlm2_receiver.settimeout(1)

    if DEBUG_LOGGING:
        print("[vdlm2Generator] vdlm2_receiver created")

    # Connect to 127.0.0.1:15555 for JSON messages vdlm2dec
    vdlm2_receiver.connect(('127.0.0.1', 15555))

    if DEBUG_LOGGING:
        print("[vdlm2Generator] vdlm2_receiver connected to 127.0.0.1:15555")

    # Run while requested...
    while not thread_vdlm2_listener_stop_event.isSet():
        sys.stdout.flush()
        time.sleep(0)

        if EXTREME_LOGGING:
            print("[vdlm2Generator] listening for messages to vdlm2_receiver")

        data = None

        try:
            if SPAM is True:
                data, addr = vdlm2_receiver.recvfrom(65527, socket)
            else:
                data, addr = vdlm2_receiver.recvfrom(65527, socket.MSG_WAITALL)
            if EXTREME_LOGGING:
                print("[vdlm2Generator] received data")
        except socket.timeout:
            if EXTREME_LOGGING:
                print("[vdlm2Generator] timeout")
            pass

        if data is not None:

            if os.getenv("DEBUG_LOGGING", default=None):
                print("[vdlm2 data] %s" % (repr(data)))
                sys.stdout.flush()

            if DEBUG_LOGGING:
                print("[vdlm2Generator] data contains data")

            # Decode json
            try:
                vdlm2_json = json.loads(data)
            except Exception:
                print("[vdlm2 data] Error with JSON input %s ." % (repr(data)))
            else:
                # Print json (for debugging)
                if DEBUG_LOGGING:
                    print("[vdlm2Generator] appending message")
                if EXTREME_LOGGING:
                    print(json.dumps(vdlm2_json, indent=4, sort_keys=True))
                que_messages.append(("VDL-M2", vdlm2_json))
                if DEBUG_LOGGING:
                    print("[vdlm2Generator] sending off to db")
                que_database.append(("VDLM2", vdlm2_json))


def init_listeners():
    import os
    global thread_acars_listener
    global thread_vdlm2_listener
    global thread_database

    if os.getenv("DEBUG_LOGGING", default=False):
        print('[init] Starting data listeners')

    if not thread_acars_listener.isAlive() and os.getenv("ENABLE_ACARS"):
        if os.getenv("DEBUG_LOGGING", default=False):
            print('[init] Starting ACARS listener')
        thread_acars_listener = Thread(target=acars_listener)
        thread_acars_listener.start()

    if not thread_vdlm2_listener.isAlive() and os.getenv("ENABLE_VDLM"):
        if os.getenv("DEBUG_LOGGING", default=False):
            print('[init] Starting VDLM listener')
        thread_vdlm2_listener = Thread(target=vdlm_listener)
        thread_vdlm2_listener.start()
    if not thread_database.isAlive():
        if os.getenv("DEBUG_LOGGING", default=False):
            print('[init] Starting Database Thread')
        thread_database = Thread(target=database_listener)
        thread_database.start()

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


@socketio.on('connect', namespace='/test')
def test_connect():
    import os
    import sys
    # need visibility of the global thread object
    global thread_html_generator

    if os.getenv("DEBUG_LOGGING", default=False):
        print('Client connected')

    # Start the htmlGenerator thread only if the thread has not been started before.
    if not thread_html_generator.isAlive():
        if os.getenv("DEBUG_LOGGING", default=False):
            print("Starting htmlGenerator")
        sys.stdout.flush()
        thread_html_generator = socketio.start_background_task(htmlGenerator)


@socketio.on('disconnect', namespace='/test')
def test_disconnect():
    if os.getenv("DEBUG_LOGGING", default=False):
        print('Client disconnected')
    pass


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=80)


@socketio.on_error()
def error_handler(e):
    print('[server] An error has occurred: ' + str(e))


@socketio.on_error('/test')
def error_handler_chat(e):
    print('[server] An error has occurred: ' + str(e))


@socketio.on_error_default
def default_error_handler(e):
    print('[server] An error has occurred: ' + str(e))
