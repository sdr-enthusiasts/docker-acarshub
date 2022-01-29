#!/usr/bin/env python3

# Little script to generate traffic for testing outside of docker
# I needed to change the socket parameters in application.py so it would
# connect and receive all the data. export SPAM=True to enable application.py to function properly
# Additionally, for database pathing in testing, export ACARSHUB_DB="sqlite:////path/to/db"
# 3 leading slashes required, the fourth is for unix path starting from root
# For a sequential play of the msg file: python3 spammer.py /path/to/messages/file 5 0
# For a random play of the msg file:     python3 spammer.py /path/to/messages/file 5 1
# env ACARSHUB_DB=sqlite:////Users/fred/messages.db SPAM=True DEBUG_LOGGING=True ENABLE_ACARS=True FREQS_ACARS="130.025;130.450;131.125;131.550" python3 application.py

import socket
import time
import sys
from random import randint
import json

run = True

while run:
    try:
        # load the messages to send
        message_interval = int(sys.argv[2])

        if sys.argv[3] == "0":
            random = False
        else:
            random = True

        with open(sys.argv[1], "r") as lines:
            message = lines.readlines()

        receiver = socket.socket(family=socket.AF_INET, type=socket.SOCK_STREAM)

        receiver.bind(("127.0.0.1", 15550))
        print("Waiting for connection")
        receiver.listen()
        (clientConnected, clientAddress) = receiver.accept()
        clientConnected.setblocking(0)
        clientConnected.settimeout(1)
        print("Connected")
        index = 1
        while True:
            # we will send a random message
            if random:
                index = randint(0, len(message) - 1)

            try:
                updated_message = json.loads(message[index])
                updated_message["timestamp"] = time.time()
                updated_message = json.dumps(updated_message)
            except socket.error as e:
                print(e)
                receiver.close()
            except KeyboardInterrupt:
                print("Exiting...")
                receiver.close()
                run = False
            except Exception as e:
                print(e)
                receiver.close()
            else:
                clientConnected.send(updated_message.encode() + b"\n")
                print("message sent")
                if not random:
                    index += 1
                    if index >= len(message):
                        index = 1

            time.sleep(message_interval)

        receiver.close()

    except KeyboardInterrupt:
        print("Exiting...")
        receiver.close()
        run = False
    except Exception as e:
        print(e)
        receiver.close()
        time.sleep(1)
