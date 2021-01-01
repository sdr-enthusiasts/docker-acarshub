#!/usr/bin/env python3

# Little script to generate traffic for testing outside of docker
# I needed to change the socket parameters in application.py so it would
# connect and receive all the data. export SPAM=True to enable application.py to function properly
# Additionally, for database pathing in testing, export ACARSHUB_DB="sqlite:////path/to/db"
# 3 leading slashes required, the fourth is for unix path starting from root
# I use this line to start application.py
# env ACARSHUB_DB=sqlite:////Users/fred/messages.db SPAM=True DEBUG_LOGGING=True ENABLE_ACARS=True python3 application.py

import socket
import time
import sys, getopt
from random import randint

try:
	# load the messages to send
	message_interval = 0
	if len(sys.argv) > 0:
		print("more")

	#with open("messages.txt", "r") as lines:
	#	message = lines.readlines()
	message = ["test"]

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
	    # we will send a random message
	    index = randint(0, len(message))
	    clientConnected.send(message[index].encode())
	    print("message sent")
	    time.sleep(10)

	receiver.close()

except Exception as e:
	print(e)
