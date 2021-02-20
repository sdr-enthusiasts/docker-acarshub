#!/usr/bin/env python3

import os
import subprocess
import acarshub_db

# Set the URL used for the web front end to show flight tracking.
# Not doing too much sanitizing of the URL to ensure it's formatted right
# But we'll at least check and see if the user put a trailing slash or not


if os.getenv("TAR1090_URL", default=False):
    if os.getenv("TAR1090_URL").endswith("/"):
        ADSB_URL = os.getenv("TAR1090_URL") + "?icao="
    else:
        ADSB_URL = os.getenv("TAR1090_URL") + "/?icao="
else:
    ADSB_URL = "https://globe.adsbexchange.com/?icao="


def libacars_formatted(libacars=None):
    import pprint

    html_output = "<p>Decoded:</p>"
    html_output += "<p>"
    html_output += "<pre>{libacars}</pre>".format(
        libacars=pprint.pformat(
            libacars,
            indent=2,
        )
    )
    html_output += "</p>"

    return html_output


# Function to prepare a message for the front end
# We do any pre-processing/updating of the keys that can't be done on the front end


def update_keys(json_message):
    # Santiztize the message of any empty/None vales
    # This won't occur for live messages but if the message originates from a DB query
    # It will return all keys, even ones where the original message didn't have a value

    stale_keys = []
    for key in json_message:
        if json_message[key] is None:
            stale_keys.append(key)

    for key in stale_keys:
        del json_message[key]

    # Now we process individual keys, if that key is present

    if "libacars" in json_message.keys() and json_message['libacars'] is not None:
        json_message['libacars'] = libacars_formatted(json_message['libacars'])

    if "icao" in json_message.keys() and json_message['icao'] is not None:
        json_message['icao_hex'] = format(int(json_message['icao']), 'X')

    if "flight" in json_message.keys() and json_message['flight'] is not None and 'icao_hex' in json_message.keys():
        json_message['flight'] = flight_finder(callsign=json_message['flight'], hex_code=json_message['icao_hex'])
    elif "flight" in json_message.keys() and json_message['flight'] is not None:
        json_message['flight'] = flight_finder(callsign=json_message['flight'], url=False)
    elif 'icao_hex' in json_message.keys():
        json_message['icao_url'] = flight_finder(hex_code=json_message['icao_hex'])

    if "toaddr" in json_message.keys() and json_message['toaddr'] is not None:
        json_message['toaddr_hex'] = format(int(json_message['toaddr']), 'X')

        toaddr_icao, toaddr_name = acarshub_db.lookup_groundstation(json_message['toaddr_hex'])

        if toaddr_icao is not None:
            json_message['toaddr_decoded'] = f"{toaddr_name} ({toaddr_icao})"

    if "fromaddr" in json_message.keys() and json_message['fromaddr'] is not None:
        json_message['fromaddr_hex'] = format(int(json_message['fromaddr']), 'X')

        fromaddr_icao, fromaddr_name = acarshub_db.lookup_groundstation(json_message['fromaddr_hex'])

        if fromaddr_icao is not None:
            json_message['fromaddr_decoded'] = f"{fromaddr_name} ({fromaddr_icao})"

    if "label" in json_message.keys() and json_message['label'] is not None:
        label_type = acarshub_db.lookup_label(json_message['label'])

        if label_type is not None:
            json_message['label_type'] = label_type
        else:
            json_message['label_type'] = "Unknown Message Label"

    return json_message


def flight_finder(callsign=None, hex_code=None, url=True):
    global ADSB_URL

    # If there is only a hex code, we'll return just the ADSB url
    # Front end will format correctly.

    if callsign is None and hex_code is not None:
        return f'{ADSB_URL}{hex_code}'

    if callsign is not None:
        # Check the ICAO DB to see if we know what it is
        # The ICAO DB will return the ICAO code back if it didn't find anything
        
        icao, airline = acarshub_db.find_airline_code_from_iata(callsign[:2])
        flight_number = callsign[2:]
        flight = icao + flight_number

        if icao != callsign[:2]:
            html = f"<span class=\"wrapper\"><strong>{flight}/{callsign}</strong><span class=\"tooltip\">{airline} Flight {flight_number}</span></span> "
        else:
            html = f"<strong>{flight}</strong> "

        # If the iata and icao variables are not equal, airline was found in the database and we'll add in the tool-tip for the decoded airline
        # Otherwise, no tool-tip, no FA link, and use the IATA code for display
        if url:
            return f"Flight: <span class=\"wrapper\"><strong><a href=\"{ADSB_URL}{hex_code}\" target=\"_blank\">{html}</a></strong>"
        else:
            return f"Flight: {html}"
    else:  # We should never run in to this condition, I don't think, but we'll add a case for it
        return "Flight: Error"


def handle_message(message=None):
    import json
    if message is not None:
        total_results = 0
        serialized_json = []
        search_term = ""
        # If the user has cleared the search bar, we'll execute the else statement
        # And the browsers clears the data
        # otherwise, run the search and format the results

        if 'show_all' in message or message['search_term'] != "":
            # Decide if the user is executing a new search or is clicking on a page of results
            # search.js appends the "results_after" as the result page index user is requested
            # Otherwise, we're at the first page

            if 'search_term' in message:
                search_term = message['search_term']

                if 'results_after' in message:
                    # ask the database for the results at the user requested index
                    # multiply the selected index by 50 (we have 50 results per page) so the db
                    # knows what result index to send back
                    search = acarshub_db.database_search(message['field'], message['search_term'], message['results_after'] * 20)
                else:
                    search = acarshub_db.database_search(message['field'], message['search_term'])
            elif 'show_all' in message:
                if 'results_after' in message:
                    search = acarshub_db.show_all(message['results_after'] * 50)
                else:
                    search = acarshub_db.show_all()

            # the db returns two values
            # index zero is the query results in json
            # the other is the count of total results

            query_result = search[0]
            if query_result is not None:
                total_results = search[1]
                # Loop through the results and format html
                for result in query_result:
                    json_message = update_keys(json.loads(result))

                    serialized_json.append(json.dumps(json_message))

            return (total_results, serialized_json, search_term)
    else:
        return (None, None, None)


def service_check():
    import subprocess
    pass
    # ==== Checking acarsdec-00012095 =====
    # UDP4 connection between 127.0.0.1:ANY and 127.0.0.1:5550 for PID 361 established: PASS
    # Decoder acarsdec-00012095 (pid 361) is connected to acars_server at 127.0.0.1:5550: HEALTHY
    # ==== Checking vdlm2dec-00012507 =====
    # UDP4 connection between 127.0.0.1:ANY and 127.0.0.1:5555 for PID 354 established: PASS
    # Decoder vdlm2dec-00012507 (pid 354) is connected to vdlm2_server at 127.0.0.1:5555: HEALTHY
    # ==== Checking vdlm2_server =====
    # TCP4 listening on 127.0.0.1:15555 (tcp) for PID 359: PASS
    # vdlm2_server TCP listening on port 15555 (pid 359): HEALTHY
    # ==== Checking vdlm2_stats =====
    # TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15555 for PID 8366 established: PASS
    # vdlm2_stats (pid 8366) connected to acars_server (pid 359) at 127.0.0.1:15555: HEALTHY
    # ==== Check for VDLM2 activity =====
    # 1634 VDLM2 messages received in past hour: HEALTHY
    # ==== Checking acars_server =====
    # TCP4 listening on 127.0.0.1:15550 (tcp) for PID 380: PASS
    # acars_server TCP listening on port 15550 (pid 380): HEALTHY
    # ==== Checking acars_stats =====
    # TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15550 for PID 8367 established: PASS
    # acars_stats (pid 8367) connected to acars_server (pid 380) at 127.0.0.1:15550: HEALTHY
    # ==== Check for ACARS activity =====
    # 624 ACARS messages received in past hour: HEALTHY
    # ==== Check webapp =====
    # webapp available: HEALTHY
    # ==== Check Service Death Tallies =====
    # abnormal death tally for vdlm2_server since last check is: 0: HEALTHY
    # abnormal death tally for vdlm2_feeder since last check is: 0: HEALTHY
    # abnormal death tally for webapp since last check is: 0: HEALTHY
    # abnormal death tally for acars_stats since last check is: 0: HEALTHY
    # abnormal death tally for vdlm2_stats since last check is: 0: HEALTHY
    # abnormal death tally for vdlm2dec-00012507 since last check is: 0: HEALTHY
    # abnormal death tally for acars_feeder since last check is: 0: HEALTHY
    # abnormal death tally for acarsdec-00012095 since last check is: 0: HEALTHY
    # abnormal death tally for acars_server since last check is: 0: HEALTHY

    # healthstatus = subprocess.run(['/scripts/healthcheck.sh'], stdout=subprocess.PIPE).stdout.decode()
    # feeders = {}

    # for line in healthstatus.split("\n"):

    #     print("Line: " + line)
