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

message = '{"timestamp":1609022235.4580381,"station_id":"CS-KABQ-ACARS","channel":0,"freq":130.025,"level":-19,"error":0,"mode":"2","label":"H1","block_id":"6","ack":false,"tail":"N979UY","flight":"AA2320","msgno":"D49B","text":"6349452,-1079358,369,01485,440,0210,1/C70000415,0000039,0889,28480,28598,-50/C80000246,0000027,1040,28782,28238,-52/C90001141,0000023,1027,28896,27838,-52/C00000044,0000020,0974,29097,27558,-52/E10000047,00","end":true}\n{"timestamp":1609022236.7661481,"station_id":"CS-KABQ-ACARS","channel":0,"freq":130.025,"level":-18,"error":0,"mode":"2","label":"5Z","block_id":"5","ack":false,"tail":"N490UA","flight":"UA1603","msgno":"M52A","text":"/B6 ORDPHX PHX R8"}'

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
