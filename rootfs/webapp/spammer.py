#!/usr/bin/env python3

# Little script to generate traffic for testing outside of docker
# I needed to change the socket parameters in application.py so it would
# connect and receive all the data. export SPAM=True to enable application.py to function properly
# Additionally, for database pathing in testing, export ACARSHUB_DB="sqlite:////path/to/db"
# 3 leading slashes required, the fourth is for unix path starting from root
# I use this line to start application.py
# export ACARSHUB_DB=sqlite:////Users/fred/messages.db && export SPAM=True && export DEBUG_LOGGING=True && export ENABLE_ACARS=True && python3 application.py

import socket
import time

message = '{"timestamp": 1608663465.318815, "station_id": "CS-KABQ-VDLM", "channel": 2, "freq": 136.975, "icao": 10690646, "toaddr": 1053386, "is_response": 0, "is_onground": 0, "mode": "2", "label": "5Z", "block_id": "3", "ack": "!", "tail": "N300LK", "flight": "MQ3331", "msgno": "M77A", "text": "OS KABQ /IR KABQ1901"}'

receiver = socket.socket(
    family=socket.AF_INET,
    type=socket.SOCK_STREAM)

receiver.bind(('127.0.0.1', 15550))
receiver.listen()
(clientConnected, clientAddress) = receiver.accept()
clientConnected.setblocking(0)
clientConnected.settimeout(1)
while True:
    print("sending message")
    clientConnected.send(message.encode())
    print("message sent")
    time.sleep(10)

receiver.close()
