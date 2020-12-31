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

message = '{"timestamp":1609367438.9092679,"station_id":"CS-KABQ-ACARS","channel":3,"freq":131.550,"level":-16,"error":0,"mode":"2","label":"SA","block_id":"2","ack":false,"tail":"N155QS","flight":"GS0001","msgno":"M49A","text":"0LS223037V","libacars":{"media-adv":{"err":false,"version":0,"current_link":{"code":"S","descr":"Default SATCOM","established":false,"time":{"hour":22,"min":30,"sec":37}},"links_avail":[{"code":"V","descr":"VHF ACARS"}]}}}\n'

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
