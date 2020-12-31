#!/usr/bin/env python3

import eventlet
eventlet.monkey_patch()
import acarshub_db
import acarshub_rrd
import logging
import os

from flask_socketio import SocketIO
from flask import Flask, render_template, request
from threading import Thread, Event
from collections import deque

log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

app = Flask(__name__)
# Make the browser not cache files
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
# app.config['SECRET_KEY'] = 'secret!'
# app.config['DEBUG'] = True

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
thread_acars_listener_stop_event = Event()
thread_vdlm2_listener_stop_event = Event()

# db thread

thread_database = Thread()
thread_database_stop_event = Event()

# maxlen is to keep the que from becoming ginormous
# the messages will be in the que all the time, even if no one is using the website
# old messages will automatically be removed
# the nice thing is once a web page is loaded message should auto-populate
# Note on the que: We are adding new messages to the right
# This means oldest messages are to the left

que_messages = deque(maxlen=50)
que_database = deque(maxlen=50)

vdlm_messages = 0
acars_messages = 0


def update_rrd_db():
    global vdlm_messages
    global acars_messages

    acarshub_rrd.update_db(vdlm=vdlm_messages, acars=acars_messages)
    vdlm_messages = 0
    acars_messages = 0


def htmlGenerator(message_source=None, json_message=None, from_query=False):
    import datetime
    import json
    import pprint
    import os

    DEBUG_LOGGING = False
    EXTREME_LOGGING = False
    if os.getenv("DEBUG_LOGGING", default=False):
        DEBUG_LOGGING = True
    if os.getenv("EXTREME_LOGGING", default=False):
        EXTREME_LOGGING = True

    if DEBUG_LOGGING:
        print("[htmlGenerator] Generating HTML")
        print(f"[htmlGenerator] Processing this message: {json_message}")
    # Set up list allowing us to track what keys have been decoded

    # if from_query is set function has been called to decode a message from the DB
    # We need to massage the data before processing

    if from_query:
        # Ignoring a couple of DB fields
        if '_sa_instance_state' in json_message:
            del json_message['_sa_instance_state']
        if 'id' in json_message:
            del json_message['id']
        if 'message_type' in json_message:
            message_source = json_message['message_type']
            del json_message['message_type']

        # converting the time key saved in the db to the expected output timestamp key and format
        # part of the need for this is because I foolishly didn't name the field in the db the same
        # as the message's original key, but it turns out, that probably saved some trouble
        # since the db is saving everything as text (tried numeric, WAY more of a pain...),
        # and we need to convert string to float
        # so the timestamp conversion below works right. Might be worth revisiting the db structure
        # and renaming the key (I think this conversion will work right if we save it back to the same key?)
        # but I didn't test, and I didn't want to mess about with my test-db since I have a fair bit of data saved

        if 'time' in json_message:
            json_message['timestamp'] = float(json_message['time'])
            del json_message['time']

        # We need to loop through the data and remove all keys without a value set.
        # The database query returns all columns, irrespective if there is a value set or the field is NULL

        delete = [key for key in json_message if json_message[key] is None]
        for key in delete:
            del json_message[key]

    remaining_keys = list(json_message.keys())

    # Prepare Table HTML
    html_output = str()
    html_output += "<table id=\"shadow\">"

    # Table header row, message type & from
    html_output += "<tr>"
    html_output += "<td><strong>{msgtype}</strong> from <strong>{station_id}</strong></td>".format(
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
        html_output += "<p>To Address: <strong>{toaddr}</strong></p>".format(
            toaddr=json_message['toaddr']
        )
        remaining_keys.remove('toaddr')

    if "fromaddr" in json_message.keys():
        html_output += "<p>From Address: <strong>{fromaddr}</strong></p>".format(
            fromaddr=json_message['fromaddr']
        )
        remaining_keys.remove('fromaddr')

    if "depa" in json_message.keys():
        html_output += "<p>Departing: <strong>{depa}</strong></p>".format(
            depa=json_message['depa']
        )
        remaining_keys.remove('depa')

    if "dsta" in json_message.keys():
        html_output += "<p>Destination: <strong>{dsta}</strong></p>".format(
            dsta=json_message['dsta']
        )
        remaining_keys.remove('dsta')

    if "eta" in json_message.keys():
        html_output += "<p>Estimated time of arrival: <strong>{eta}</strong> hours</p>".format(
            eta=json_message['eta']
        )
        remaining_keys.remove('eta')

    if "gtout" in json_message.keys():
        html_output += "<p>Pushback from gate: <strong>{gtout}</strong> hours</p>".format(
            gtout=json_message['gtout']
        )
        remaining_keys.remove('gtout')

    if "gtin" in json_message.keys():
        html_output += "<p>Arriving at gate: <strong>{gtin}</strong> hours</p>".format(
            gtin=json_message['gtin']
        )
        remaining_keys.remove('gtin')

    if "wloff" in json_message.keys():
        html_output += "<p>Wheels off: <strong>{wloff}</strong> hours</p>".format(
            wloff=json_message['wloff']
        )
        remaining_keys.remove('wloff')

    if "wlin" in json_message.keys():
        html_output += "<p>Wheels down: <strong>{wlin}</strong></p>".format(
            wlin=json_message['wlin']
        )
        remaining_keys.remove('wlin')

    if "lat" in json_message.keys():
        html_output += "<p>Latitude: <strong>{lat}</strong></p>".format(
            lat=json_message['lat']
        )
        remaining_keys.remove('lat')

    if "lon" in json_message.keys():
        html_output += "<p>Longitude: <strong>{lon}</strong></p>".format(
            lon=json_message['lon']
        )
        remaining_keys.remove('lon')

    if "alt" in json_message.keys():
        html_output += "<p>Altitude: <strong>{alt}</strong></p>".format(
            alt=json_message['alt']
        )
        remaining_keys.remove('alt')

    if "text" in json_message.keys():
        html_output += "<p>"
        html_output += "<pre id=\"shadow\"><strong>{text}</strong></pre>".format(
            text=json_message['text'].replace("\r\n", "\n"),
        )
        remaining_keys.remove('text')
        html_output += "</p>"
    elif "data" in json_message.keys():
        html_output += "<p>"
        html_output += "<pre id=\"shadow\"><strong>{data}</strong></pre>".format(
            data=json_message['data'].replace("\r\n", "\n"),
        )
        remaining_keys.remove('data')
        html_output += "</p>"
    else:
        html_output += "<p><pre id=\"shadow\"><i><strong>No text</strong></i></pre></p>"

    if "libacars" in json_message.keys():
        html_output += "<p>Decoded:</p>"
        html_output += "<p>"
        html_output += "<pre id=\"shadow\"><strong>{libacars}<strong></pre>".format(
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
        html_output += "Tail: <strong><a href=\"https://flightaware.com/live/flight/{tail}\" target=\"_blank\">{tail}</a></strong> ".format(
            tail=json_message['tail'],
        )
        remaining_keys.remove('tail')
    if "flight" in json_message.keys():
        icao, airline = acarshub_db.find_airline_code_from_iata(json_message['flight'][:2])
        flight_number = json_message['flight'][2:]
        flight = icao + flight_number

        # If the iata and icao variables are not equal, airline was found in the database and we'll add in the tool-tip for the decoded airline
        # Otherwise, no tool-tip, no FA link, and use the IATA code for display
        if icao != json_message['flight'][:2]:
            html_output += f"Flight: <span class=\"wrapper\"><strong><a href=\"https://flightaware.com/live/flight/{flight}\" target=\"_blank\">{flight}/{json_message['flight']}</a></strong><span class=\"tooltip\">{airline} Flight {flight_number}</span></span> "
        else:
            html_output += f"Flight: <strong><a href=\"https://flightaware.com/live/flight/{flight}\" target=\"_blank\">{flight}</a></strong> "
        remaining_keys.remove('flight')
    if "icao" in json_message.keys():
        html_output += "ICAO: <strong>{icao}</strong> ".format(
            icao=json_message['icao'],
        )
        remaining_keys.remove('icao')
    html_output += "</td>"

    # Table footer row, metadata
    html_output += "<td style=\"text-align: right\">"
    if "freq" in json_message.keys():
        html_output += "<span class=\"wrapper\">F: <strong>{freq}</strong><span class=\"tooltip\">The frequency this message was received on</span></span> ".format(
            freq=json_message['freq'],
        )
        remaining_keys.remove('freq')

    if "ack" in json_message.keys():
        if json_message['ack'] is not False:
            html_output += "<span class=\"wrapper\">A: <strong>{ack}</strong><span class=\"tooltip\">Acknolwedgement</span></span> ".format(
                ack=json_message['ack'],
            )
        remaining_keys.remove('ack')

    if "mode" in json_message.keys():
        html_output += "<span class=\"wrapper\">M: <strong>{mode}</strong><span class=\"tooltip\">Mode</span></span> ".format(
            mode=json_message['mode'],
        )
        remaining_keys.remove('mode')

    if "label" in json_message.keys():
        html_output += "<span class=\"wrapper\">L: <strong>{label}</strong><span class=\"tooltip\">Label</span></span> ".format(
            label=json_message['label'],
        )
        remaining_keys.remove('label')

    if "block_id" in json_message.keys():
        html_output += "<span class=\"wrapper\">B: <strong>{block_id}</strong><span class=\"tooltip\">Block ID</span></span> ".format(
            block_id=json_message['block_id'],
        )
        remaining_keys.remove('block_id')

    if "msgno" in json_message.keys():
        html_output += "<span class=\"wrapper\">M#: <strong>{msgno}</strong><span class=\"tooltip\">Message number. Used for multi-part messages.</span></span> ".format(
            msgno=json_message['msgno'],
        )
        remaining_keys.remove('msgno')

    if "is_response" in json_message.keys():
        html_output += "<span class=\"wrapper\">R: <strong>{is_response}</strong><span class=\"tooltip\">Response</span></span> ".format(
            is_response=json_message['is_response'],
        )
        remaining_keys.remove('is_response')

    if "is_onground" in json_message.keys():
        # We need to watch this to make sure I have this right. After spelunking through vdlm2dec source code
        # Input always appears to be a 0 or 2...for reasons I don't get. I could have this backwards
        # 0 indicates the plane is airborne
        # 2 indicates the plane is on the ground
        # https://github.com/TLeconte/vdlm2dec/blob/1ea300d40d66ecb969f1f463506859e36f62ef5c/out.c#L457
        # variable naming in vdlm2dec is inconsistent, but "ground" and "gnd" seem to be used

        if json_message['is_onground'] == 0:
            is_onground = "False"
        else:
            is_onground = "True"

        html_output += f"<span class=\"wrapper\">G: <strong>{is_onground}</strong><span class=\"tooltip\">Is on ground?</span></span> "
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

    return html_output


def htmlListener():
    import time
    import sys
    import os

    # TOOLTIPS: <span class="wrapper">visible text<span class="tooltip">tooltip text</span></span>

    DEBUG_LOGGING = False
    if os.getenv("DEBUG_LOGGING", default=False):
        DEBUG_LOGGING = True

    # Run while requested...
    while not thread_html_generator_event.isSet():
        sys.stdout.flush()
        time.sleep(1)

        if len(que_messages) != 0:
            message_source, json_message = que_messages.popleft()
            html_output = htmlGenerator(message_source, json_message)
            # Send output via socketio
            if DEBUG_LOGGING:
                print("[htmlListener] sending output via socketio.emit")
            socketio.emit('newmsg', {'msghtml': html_output}, namespace='/main')
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

    acarshub_rrd.create_db()
    acarshub_rrd.update_graphs()

    # Schedule the database pruner
    schedule.every().hour.do(acarshub_db.pruneOld)
    schedule.every().minute.at(":00").do(update_rrd_db)
    schedule.every().minute.at(":30").do(acarshub_rrd.update_graphs)
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


def acars_listener():
    import time
    import socket
    import json
    import sys
    import os

    global acars_messages

    DEBUG_LOGGING = False
    EXTREME_LOGGING = False
    SPAM = False
    if os.getenv("DEBUG_LOGGING", default=False):
        DEBUG_LOGGING = True
    if os.getenv("EXTREME_LOGGING", default=False):
        EXTREME_LOGGING = True
    if os.getenv("SPAM", default=False):
        SPAM = True

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
            # There is a rare condition where we'll receive two messages at once
            # We will cover this condition off by ensuring each json message is
            # broken apart and handled individually

            try:
                acars_json = []
                print("here")
                if data.decode().count('}\n') == 1:
                    acars_json.append(json.loads(data))
                else:
                    split_json = data.decode().split('}\n')

                    for j in split_json:
                        if len(j) > 1:
                            acars_json.append(json.loads(j + "}\n"))

            except Exception:
                print("[acars data] Error with JSON input %s ." % (repr(data)))
            else:
                for j in acars_json:
                    acars_messages += 1
                    if EXTREME_LOGGING:
                        print(json.dumps(j, indent=4, sort_keys=True))
                    if DEBUG_LOGGING:
                        print("[acarsGenerator] appending message")
                    que_messages.append(("ACARS", j))
                    if DEBUG_LOGGING:
                        print("[acarsGenerator] sending off to db")
                    que_database.append(("ACARS", j))


def vdlm_listener():
    import time
    import socket
    import json
    import sys
    import os

    global vdlm_messages

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
            # There is a rare condition where we'll receive two messages at once
            # We will cover this condition off by ensuring each json message is
            # broken apart and handled individually

            try:
                vdlm_json = []
                if data.decode().count('}\n') == 1:
                    vdlm_json.append(json.loads(data))
                else:
                    split_json = data.decode().split('}\n')

                    for j in split_json:
                        if len(j) > 1:
                            vdlm_json.append(json.loads(j + "}\n"))

            except Exception:
                print("[vdlm2 data] Error with JSON input %s ." % (repr(data)))
            else:
                for j in vdlm_json:
                    vdlm_messages += 1
                    if EXTREME_LOGGING:
                        print(json.dumps(j, indent=4, sort_keys=True))
                    if DEBUG_LOGGING:
                        print("[vdlm2Generator] appending message")
                    que_messages.append(("VDL-M2", j))
                    if DEBUG_LOGGING:
                        print("[vdlm2Generator] sending off to db")
                    que_database.append(("VDL-M2", j))


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


# handle a query request from the browser


@socketio.on('query', namespace='/search')
def handle_message(message, namespace):
    # We are going to send the result over in one blob
    # search.js will only maintain the most recent blob we send over
    html_output = ""
    current_search_page = 0

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
            current_search_page = message['results_after']
        else:
            search = acarshub_db.database_search(message['field'], message['search_term'])

        # the db returns two values
        # index zero is the query results in json
        # the other is the count of total results

        query_result = search[0]
        if query_result is not None:
            # Loop through the results and format html
            for result in query_result:
                html_output += "<p>" + htmlGenerator(None, result, True) + "</p> "

            html_output += f"<p>Found {search[1]} results.<p>"
            # we have more items found with the search than are displayed
            # We'll set up the list of clickable links for the user
            # So they can click through the results
            # The selected page is non-clickable

            html_output += "Page "

            # This bit of logic is to check and see if we need to append an extra page
            if search[1] % 20 != 0:
                total_pages = int(search[1] / 20) + 1
            else:
                total_pages = int(search[1] / 20)

            for i in range(0, total_pages):
                if i == current_search_page:
                    html_output += f"{i+1} "
                else:
                    html_output += f"<a href=\"#\" id=\"search_page\" onclick=\"runclick({i})\">{i+1}</a> "

        else:
            html_output += "<p>No results</p>"

    # grab the socket id for the request
    # This stops the broadcast of the search results to everyone
    # in the search namespace.

    requester = request.sid
    socketio.emit('newmsg', {'msghtml': html_output}, room=requester, namespace='/search')


@socketio.on('disconnect', namespace='/main')
def main_disconnect():
    global connected_users

    connected_users -= 1
    if os.getenv("DEBUG_LOGGING", default=False):
        print(f'Client disconnected. Total connected: {connected_users}')

    # Client disconnected, stop the htmlListener

    if connected_users == 0:
        thread_html_generator_event.set()


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
