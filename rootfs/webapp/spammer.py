#!/usr/bin/env python3

## Little script to generate traffic for testing outside of docker
# I needed to change the socket parameters in application.py so it would
# connect and receive all the data. export SPAM=True to enable application.py to function properly
# Okay had to undo the SPAM thing because it wasn't working in application.py...will fix. To run the spammer
# right now, remove socket.MSG_WAITALL from the acars/vdlm socket listeners
# Additionally, for database pathing in testing, export ACARS_DB="sqlite:////path/to/db"
# 3 leading slashes required, the fourth is for unix path starting from root

import socket
import time

spammer_event = Event()
message='{"timestamp":1608428171.426852,"station_id":"CS-KABQ-ACARS","channel":0,"freq":130.025,"level":-22,"error":0,"mode":"2","label":"81","block_id":"4","ack":false,"tail":"N332FR","flight":"F91275","msgno":"M58A","text":"DISPHAHAHA"}\n'

receiver = socket.socket(
        family=socket.AF_INET,
        type=socket.SOCK_STREAM,
    )

receiver.bind(('127.0.0.1', 15550))
receiver.listen()
(clientConnected, clientAddress) = receiver.accept();
clientConnected.setblocking(0)
clientConnected.settimeout(1)
while True:
	print("sending message")
	clientConnected.send(message.encode())
	print("message sent")
	time.sleep(10)

receiver.close()
