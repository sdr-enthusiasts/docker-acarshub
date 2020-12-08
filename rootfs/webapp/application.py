#!/usr/bin/env python3

from flask_socketio import SocketIO, emit
from flask import Flask, render_template, url_for, copy_current_request_context
from random import random
from time import sleep
from threading import Thread, Event

import logging
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

app = Flask(__name__)
# app.config['SECRET_KEY'] = 'secret!'
#app.config['DEBUG'] = True

#turn the flask app into a socketio app
socketio = SocketIO(app, async_mode=None, logger=False, engineio_logger=False)

#random number Generator Thread
thread_acars = Thread()
thread_vdlm2 = Thread()
thread_acars_stop_event = Event()
thread_vdlm2_stop_event = Event()

def vdlm2Generator():

    import datetime
    import socket
    import json
    import pprint
    import sys
    import os

    DEBUG_LOGGING=False
    if os.getenv("DEBUG_LOGGING", default=False): DEBUG_LOGGING=True

    # Define vdlm2_receiver
    vdlm2_receiver = socket.socket(
        family=socket.AF_INET,
        type=socket.SOCK_DGRAM,
    )

    # Set socket timeout 1 seconds
    vdlm2_receiver.settimeout(1)

    if DEBUG_LOGGING: print("[vdlm2Generator] vdlm2_receiver created")
    
    # Listen on 127.0.0.1:13155 for UDP datagrams from vdlm2dec JSON
    vdlm2_receiver.bind(('127.0.0.1', 13697))
    if DEBUG_LOGGING: print("[vdlm2Generator] vdlm2_receiver bound to 127.0.0.1:13697")

    # Run while requested...
    while not thread_vdlm2_stop_event.isSet():
        sys.stdout.flush()

        if DEBUG_LOGGING: print("[vdlm2Generator] listening for messages to vdlm2_receiver")

        data = None

        try:
            data,addr = vdlm2_receiver.recvfrom(1024)
            if DEBUG_LOGGING: print("[vdlm2Generator] received data")
        except socket.timeout:
            if DEBUG_LOGGING: print("[vdlm2Generator] timeout")
            pass

        if data is not None:

            if os.getenv("VERBOSE", default=None):
                print("[vdlm2 data] %s" % (repr(data)))

            if DEBUG_LOGGING: print("[vdlm2Generator] data contains data")

            # Decode json
            vdlm2_json = json.loads(data)

            # Print json (for debugging)
            if DEBUG_LOGGING: print(json.dumps(vdlm2_json, indent=4, sort_keys=True))

            # Set up list allowing us to track what keys have been decoded
            remaining_keys = list(vdlm2_json.keys())

            # Prepare Table HTML
            html_output = str()
            html_output += "<table>"

            # Table header row, message type & from
            html_output += "<tr>"
            html_output += "<td>{msgtype} from {station_id}</td>".format(
                msgtype="VDL-M2",
                station_id=vdlm2_json['station_id'],
            )
            remaining_keys.remove('station_id')

            # Table header row, timestamp
            html_output += "<td style=\"text-align: right\">{timestamp}</td>".format(
                timestamp=datetime.datetime.fromtimestamp(vdlm2_json['timestamp']).strftime(r'%Y-%m-%dT-%H:%M:%S:%f')
            )
            remaining_keys.remove('timestamp')
            html_output += "</tr>"

            # Table content
            html_output += "<tr><td colspan=\"2\">"

            if "toaddr" in vdlm2_json.keys():
                    html_output += "<p>To Address: {toaddr}</p>".format(
                        toaddr=vdlm2_json['toaddr']
                    )
                    remaining_keys.remove('toaddr')

            if "depa" in vdlm2_json.keys():
                    html_output += "<p>Departing: {depa}</p>".format(
                        depa=vdlm2_json['depa']
                    )
                    remaining_keys.remove('depa')

            if "dsta" in vdlm2_json.keys():
                    html_output += "<p>Destination: {dsta}</p>".format(
                        dsta=vdlm2_json['depa']
                    )
                    remaining_keys.remove('dsta')

            if "eta" in vdlm2_json.keys():
                    html_output += "<p>Estimated time of arrival: {eta} hours</p>".format(
                        eta=vdlm2_json['eta']
                    )
                    remaining_keys.remove('eta')

            if "gtout" in vdlm2_json.keys():
                    html_output += "<p>Pushback from gate: {gtout} hours</p>".format(
                        gtout=vdlm2_json['gtout']
                    )
                    remaining_keys.remove('gtout')

            if "gtin" in vdlm2_json.keys():
                    html_output += "<p>Arriving at gate: {gtin} hours</p>".format(
                        gtin=vdlm2_json['gtin']
                    )
                    remaining_keys.remove('gtin')

            if "wloff" in vdlm2_json.keys():
                    html_output += "<p>Wheels off: {wloff} hours</p>".format(
                        wloff=vdlm2_json['wloff']
                    )
                    remaining_keys.remove('wloff')

            if "wlin" in vdlm2_json.keys():
                    html_output += "<p>Wheels down: {wlin}</p>".format(
                        wlin=vdlm2_json['wlin']
                    )
                    remaining_keys.remove('wlin')

            if "text" in vdlm2_json.keys():
                html_output += "<p>"
                html_output += "<pre>{text}</pre>".format(
                    text=vdlm2_json['text'].replace("\r\n","\n"),
                )
                remaining_keys.remove('text')
                html_output += "</p>"
            else:
                html_output += "<p><i>No text</i></p>"

            html_output += "</td></tr>"
            
            # Table footer row, tail & flight info
            html_output += "<tr>"
            html_output += "<td>"
            if "tail" in vdlm2_json.keys():
                html_output += "Tail: {tail} ".format(
                    tail=vdlm2_json['tail'],
                )
                remaining_keys.remove('tail')
            if "flight" in vdlm2_json.keys():
                html_output += "Flight: {flight} ".format(
                    flight=vdlm2_json['flight'],
                )
                remaining_keys.remove('flight')
            if "icao" in vdlm2_json.keys():
                html_output += "ICAO: {icao} ".format(
                    icao=vdlm2_json['icao'],
                )
                remaining_keys.remove('icao')
            html_output += "</td>"
            
            # Table footer row, metadata
            html_output += "<td style=\"text-align: right\">"
            if "freq" in vdlm2_json.keys():
                html_output += "F: {freq} ".format(
                    freq=vdlm2_json['freq'],
                )
                remaining_keys.remove('freq')

            if "ack" in vdlm2_json.keys():
                if vdlm2_json['ack'] is not False:
                    html_output += "A: {ack} ".format(
                        ack=vdlm2_json['ack'],
                    )
                remaining_keys.remove('ack')

            if "mode" in vdlm2_json.keys():
                html_output += "M: {mode} ".format(
                    mode=vdlm2_json['mode'],
                )
                remaining_keys.remove('mode')

            if "label" in vdlm2_json.keys():
                html_output += "L: {label} ".format(
                    label=vdlm2_json['label'],
                )
                remaining_keys.remove('label')
            
            if "block_id" in vdlm2_json.keys():
                html_output += "B: {block_id} ".format(
                    block_id=vdlm2_json['block_id'],
                )
                remaining_keys.remove('block_id')

            if "msgno" in vdlm2_json.keys():
                html_output += "M#: {msgno} ".format(
                    msgno=vdlm2_json['msgno'],
                )
                remaining_keys.remove('msgno')

            if "is_response" in vdlm2_json.keys():
                html_output += "R: {is_response} ".format(
                    is_response=vdlm2_json['is_response'],
                )
                remaining_keys.remove('is_response')

            if "is_onground" in vdlm2_json.keys():
                html_output += "G: {is_onground} ".format(
                    is_onground=vdlm2_json['is_onground'],
                )
                remaining_keys.remove('is_onground')
            
            if "error" in vdlm2_json.keys():
                if vdlm2_json['error'] != 0:
                    html_output += '<span style="color:red;">'
                    html_output += "E: {error} ".format(
                        error=vdlm2_json['error'],
                    )
                    html_output += '</span>'
                remaining_keys.remove('error')

            html_output += "</td>"
            html_output += "</tr>"
            
            # Finish table html
            html_output += "</table>"

            # Send output via socketio
            if DEBUG_LOGGING: print("[acarsGenerator] sending output via socketio.emit")
            socketio.emit('newmsg', {'msghtml': html_output}, namespace='/test')

            # Check to see if any data remains, if so, send some debugging output
            remaining_keys.remove('channel')
            if len(remaining_keys) > 0:
                print("")
                print("Non decoded data exists:")
                print(repr(remaining_keys))
                print("")
                print(json.dumps(vdlm2_json, indent=4, sort_keys=True))
                print("")
                print("-----")

        else:
            if DEBUG_LOGGING: print("[vdlm2Generator] sending noop")
            socketio.emit('noop', {'noop': 'noop'}, namespace='/test')


def acarsGenerator():

    import datetime
    import socket
    import json
    import pprint
    import sys
    import os

    DEBUG_LOGGING=False
    if os.getenv("DEBUG_LOGGING", default=False): DEBUG_LOGGING=True

    # Define acars_receiver
    acars_receiver = socket.socket(
        family=socket.AF_INET,
        type=socket.SOCK_DGRAM,
    )

    # Set socket timeout 1 seconds
    acars_receiver.settimeout(1)

    if DEBUG_LOGGING: print("[acarsGenerator] acars_receiver created")
    
    # Listen on 127.0.0.1:13155 for UDP datagrams from acarsdec JSON
    acars_receiver.bind(('127.0.0.1', 13155))
    if DEBUG_LOGGING: print("[acarsGenerator] acars_receiver bound to 127.0.0.1:13155")

    # Run while requested...
    while not thread_acars_stop_event.isSet():
        if DEBUG_LOGGING: print("[acarsGenerator] listening for messages to acars_receiver")
        sys.stdout.flush()

        data = None

        try:
            data,addr = acars_receiver.recvfrom(1024)
            if DEBUG_LOGGING: print("[acarsGenerator] received data")
        except socket.timeout:
            if DEBUG_LOGGING: print("[acarsGenerator] timeout")
            pass

        if data is not None:

            if os.getenv("VERBOSE", default=None):
                print("[acars data] %s" % (repr(data)))

            if DEBUG_LOGGING: print("[acarsGenerator] received data")

            # Decode json
            acars_json = json.loads(data)

            # Print json (for debugging)
            if DEBUG_LOGGING: print(json.dumps(acars_json, indent=4, sort_keys=True))

            # Set up list allowing us to track what keys have been decoded
            remaining_keys = list(acars_json.keys())

            # Prepare Table HTML
            html_output = str()
            html_output += "<table>"

            # Table header row, message type & from
            html_output += "<tr>"
            html_output += "<td>{msgtype} from {station_id}</td>".format(
                msgtype="ACARS",
                station_id=acars_json['station_id'],
            )
            remaining_keys.remove('station_id')

            # Table header row, timestamp
            html_output += "<td style=\"text-align: right\">{timestamp}</td>".format(
                timestamp=datetime.datetime.fromtimestamp(acars_json['timestamp']).strftime(r'%Y-%m-%dT-%H:%M:%S:%f')
            )
            remaining_keys.remove('timestamp')
            html_output += "</tr>"

            # Table content
            html_output += "<tr><td colspan=\"2\">"

            if "text" in acars_json.keys():
                html_output += "<p>"
                html_output += "<pre>{text}</pre>".format(
                    text=acars_json['text'].replace("\r\n","\n"),
                )
                remaining_keys.remove('text')
                html_output += "</p>"
            else:
                html_output += "<p><i>No text</i></p>"
            
            if "libacars" in acars_json.keys():
                html_output += "<p>Decoded:</p>"
                html_output += "<p>"
                html_output += "<pre>{libacars}</pre>".format(
                    libacars=pprint.pformat(
                        acars_json['libacars'],
                        indent=2,
                    )
                )
                remaining_keys.remove('libacars')
                html_output += "</p>"

            html_output += "</td></tr>"

            # Table footer row, tail & flight info
            html_output += "<tr>"
            html_output += "<td>"
            if "tail" in acars_json.keys():
                html_output += "Tail: {tail} ".format(
                    tail=acars_json['tail'],
                )
                remaining_keys.remove('tail')
            if "flight" in acars_json.keys():
                html_output += "Flight: {flight} ".format(
                    flight=acars_json['flight'],
                )
                remaining_keys.remove('flight')
            html_output += "</td>"
            
            # Table footer row, metadata
            html_output += "<td style=\"text-align: right\">"
            if "freq" in acars_json.keys():
                html_output += "F: {freq} ".format(
                    freq=acars_json['freq'],
                )
                remaining_keys.remove('freq')

            if "ack" in acars_json.keys():
                if acars_json['ack'] is not False:
                    html_output += "A: {ack} ".format(
                        ack=acars_json['ack'],
                    )
                remaining_keys.remove('ack')

            if "mode" in acars_json.keys():
                html_output += "M: {mode} ".format(
                    mode=acars_json['mode'],
                )
                remaining_keys.remove('mode')

            if "label" in acars_json.keys():
                html_output += "L: {label} ".format(
                    label=acars_json['label'],
                )
                remaining_keys.remove('label')
            
            if "block_id" in acars_json.keys():
                html_output += "B: {block_id} ".format(
                    block_id=acars_json['block_id'],
                )
                remaining_keys.remove('block_id')

            if "msgno" in acars_json.keys():
                html_output += "M#: {msgno} ".format(
                    msgno=acars_json['msgno'],
                )
                remaining_keys.remove('msgno')
            
            if "error" in acars_json.keys():
                if acars_json['error'] != 0:
                    html_output += '<span style="color:red;">'
                    html_output += "E: {error} ".format(
                        error=acars_json['error'],
                    )
                    html_output += '</span>'
                remaining_keys.remove('error')

            html_output += "</td>"
            html_output += "</tr>"
            
            # Finish table html
            html_output += "</table>"

            # Send output via socketio
            if DEBUG_LOGGING: print("[acarsGenerator] sending output via socketio.emit")
            socketio.emit('newmsg', {'msghtml': html_output}, namespace='/test')

            # Remove leftover keys that we don't really care about (do we care about these?)
            if 'channel' in remaining_keys: remaining_keys.remove('channel')
            if 'level' in remaining_keys: remaining_keys.remove('level')
            if 'end' in remaining_keys: remaining_keys.remove('end')

            # Check to see if any data remains, if so, send some debugging output
            if len(remaining_keys) > 0:
                print("")
                print("Non decoded data exists:")
                print(repr(remaining_keys))
                print("")
                print(json.dumps(acars_json, indent=4, sort_keys=True))
                print("")
                print("-----")

        else:
            if DEBUG_LOGGING: print("[acarsGenerator] sending noop")
            socketio.emit('noop', {'noop': 'noop'}, namespace='/test')

@app.route('/')
def index():
    #only by sending this page first will the client be connected to the socketio instance
    return render_template('index.html')

@socketio.on('connect', namespace='/test')
def test_connect():
    # need visibility of the global thread object
    global thread_acars
    global thread_vdlm2
    #print('Client connected')

    #Start the acarsGenerator thread only if the thread has not been started before.
    if not thread_acars.isAlive():
        #print("Starting acarsGenerator")
        thread_acars = socketio.start_background_task(acarsGenerator)
    if not thread_vdlm2.isAlive():
        #print("Starting vdlm2Generator")
        thread_vdlm2 = socketio.start_background_task(vdlm2Generator)

@socketio.on('disconnect', namespace='/test')
def test_disconnect():
    #print('Client disconnected')
    pass

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=80)
