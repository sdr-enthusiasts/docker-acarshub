#!/usr/bin/env python3

# Little script to generate traffic for testing outside of docker
# I needed to change the socket parameters in application.py so it would
# connect and receive all the data. export SPAM=True to enable application.py to function properly
# Additionally, for database pathing in testing, export ACARSHUB_DB="sqlite:////path/to/db"
# 3 leading slashes required, the fourth is for unix path starting from root
# python3 spammer.py /path/to/messages/file 5
# env ACARSHUB_DB=sqlite:////Users/fred/messages.db SPAM=True DEBUG_LOGGING=True ENABLE_ACARS=True python3 application.py

import socket
import time
import sys, getopt
from random import randint

run = True

while run:
	try:
		# load the messages to send
		message_interval = int(sys.argv[2])

		with open(sys.argv[1], "r") as lines:
			message = lines.readlines()

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
		    time.sleep(5)

		receiver.close()

	except KeyboardInterrupt:
		print("Exiting...")
		receiver.close()
		run = False
	except Exception as e:
		print(e)
		receiver.close()