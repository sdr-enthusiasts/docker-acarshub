#!/usr/bin/env python3

## Little script to generate traffic for testing outside of docker
# I needed to change the socket parameters in application.py so it would
# connect and receive all the data. export SPAM=True to enable application.py to function properly
# Additionally, for database pathing in testing, export ACARSHUB_DB="sqlite:////path/to/db"
# 3 leading slashes required, the fourth is for unix path starting from root

import socket
import time

message='{"timestamp":1608564683.747422,"station_id":"CS-KABQ-ACARS","channel":0,"freq":130.025,"level":-23,"error":0,"mode":"2","label":"H1","block_id":"6","ack":false,"tail":"N972UY","flight":"US1268","msgno":"D04B","text":"73/N11325,1325,3924,0796,0847,0329,10044/N21325,1325,3988,0791,0842,0328,10003/S116925,0623,1635,4144,08801,062/S216660,0616,1585,4075,08782,061/T1097,082,00,026,45,171,06623,N190/T2099,083,00,020,43,207,06","end":true}\n'

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
