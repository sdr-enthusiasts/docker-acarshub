#!/usr/bin/env python3

import os
import acarshub_db

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


def update_keys(json_message):
    stale_keys = []
    for key in json_message:
        if json_message[key] is None:
            stale_keys.append(key)

    for key in stale_keys:
        del json_message[key]

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

    if callsign is None and hex_code is not None:
        return f'{ADSB_URL}{hex_code}'

    if callsign is not None:
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
                    # multiply the selected index by 20 (we have 20 results per page) so the db
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

                    serialized_json.insert(0, json.dumps(json_message))

            return (total_results, serialized_json, search_term)
    else:
        return (None, None, None)
