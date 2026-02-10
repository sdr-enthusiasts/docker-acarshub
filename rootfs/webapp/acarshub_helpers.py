#!/usr/bin/env python3

# Copyright (C) 2022-2026 Frederick Clausen II
# File is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
#
# acarshub is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# acarshub is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

import os
import acarshub_database
import time
import acarshub_logging
from acarshub_logging import LOG_LEVEL

start_time = time.time()

decoders = dict()
servers = dict()
receivers = dict()
stats = dict()
external_formats = dict()
system_error = False

# Set the URL used for the web front end to show flight tracking.
# Not doing too much sanitizing of the URL to ensure it's formatted right
# But we'll at least check and see if the user put a trailing slash or not


tar1090_url = os.getenv("TAR1090_URL")
if tar1090_url:
    if tar1090_url.endswith("/"):
        ADSB_URL = tar1090_url + "?icao="
    else:
        ADSB_URL = tar1090_url + "/?icao="
else:
    ADSB_URL = "https://globe.adsbexchange.com/?icao="


def has_specified_key_not_none(message=None, key=None):
    if (key is None or message is None) or (
        key not in message or message[key] is None or message[key] == ""
    ):
        return False
    return True


def has_specified_key(message=None, key=None):
    if (key is None or message is None) or (key not in message):
        return False
    return True


# Function to prepare a message for the front end
# We do any pre-processing/updating of the keys that can't be done on the front end


def update_keys(json_message):
    # Santiztize the message of any empty/None vales
    # This won't occur for live messages but if the message originates from a DB query
    # It will return all keys, even ones where the original message didn't have a value

    # FIRST: Convert field names BEFORE cleanup to ensure conversion happens even for empty values
    # database tablename for the message text doesn't match up with typescript-decoder (needs it to be text)
    # so we rewrite the key
    if has_specified_key(json_message, "msg_text"):
        acarshub_logging.log(
            f"update_keys: Converting msg_text to text for UID {json_message.get('uid', 'unknown')}",
            "update_keys",
            level=LOG_LEVEL["DEBUG"],
        )
        json_message["text"] = json_message["msg_text"]
        del json_message["msg_text"]

    if has_specified_key(json_message, "time"):
        json_message["timestamp"] = json_message["time"]
        del json_message["time"]

    # SECOND: Clean up empty/None values after field conversion
    # Preserve backend-supplied alert metadata, UID, and converted fields (never delete these)
    protected_keys = {
        "uid",
        "matched",
        "matched_text",
        "matched_icao",
        "matched_tail",
        "matched_flight",
        "text",  # Protected after conversion from msg_text (even if empty - needed for decoder)
        "timestamp",  # Protected after conversion from time
    }

    stale_keys = []
    for key in json_message:
        if key not in protected_keys and not has_specified_key_not_none(
            json_message, key
        ):
            stale_keys.append(key)

    for key in stale_keys:
        del json_message[key]

    # Now we process other individual keys, if that key is present

    # libacars is kept as raw JSON string for React frontend to parse
    # React has its own parseAndFormatLibacars() function in decoderUtils.ts

    if has_specified_key(json_message, "icao"):
        # ICAO can be either:
        # 1. Hex string (e.g., "ABF308") from VDLM2/HFDL formatters
        # 2. Numeric value from raw ACARS messages
        # Always ensure icao_hex is a hex string for frontend consistency
        icao_value = json_message["icao"]

        if isinstance(icao_value, str):
            # Already a string - check if it's hex or decimal
            try:
                # Check if it's a hex string (6 chars, all hex digits)
                is_hex_format = len(icao_value) == 6 and all(
                    c in "0123456789ABCDEFabcdef" for c in icao_value
                )

                if is_hex_format:
                    # Already in hex format - just uppercase it
                    json_message["icao_hex"] = icao_value.upper()
                else:
                    # It's a decimal string - convert to hex
                    icao_int = int(icao_value)
                    json_message["icao_hex"] = format(icao_int, "06X")
            except (ValueError, TypeError):
                # Not a valid number - use as-is (probably already hex)
                json_message["icao_hex"] = (
                    icao_value.upper()
                    if isinstance(icao_value, str)
                    else str(icao_value)
                )
        elif isinstance(icao_value, int):
            # Numeric ICAO - convert to 6-character hex string
            json_message["icao_hex"] = format(icao_value, "06X")
        else:
            # Unknown type - convert to string and uppercase
            json_message["icao_hex"] = str(icao_value).upper()

    if has_specified_key(json_message, "flight"):
        airline, iata_flight, icao_flight, flight_number = flight_finder(
            callsign=json_message["flight"]
        )
        json_message["airline"] = airline
        json_message["iata_flight"] = iata_flight
        json_message["icao_flight"] = icao_flight
        json_message["flight_number"] = flight_number

    if has_specified_key(json_message, "toaddr"):
        json_message["toaddr_hex"] = try_format_as_int(json_message["toaddr"], "toaddr")

        toaddr_icao, toaddr_name = acarshub_database.lookup_groundstation(
            json_message["toaddr_hex"]
        )

        if toaddr_icao is not None:
            json_message["toaddr_decoded"] = f"{toaddr_name} ({toaddr_icao})"

    if has_specified_key(json_message, "fromaddr"):
        json_message["fromaddr_hex"] = try_format_as_int(
            json_message["fromaddr"], "fromaddr"
        )

        fromaddr_icao, fromaddr_name = acarshub_database.lookup_groundstation(
            json_message["fromaddr_hex"]
        )

        if fromaddr_icao is not None:
            json_message["fromaddr_decoded"] = f"{fromaddr_name} ({fromaddr_icao})"

    if has_specified_key(json_message, "label"):
        label_type = acarshub_database.lookup_label(json_message["label"])

        if label_type is not None:
            json_message["label_type"] = label_type
        else:
            json_message["label_type"] = "Unknown Message Label"


def try_format_as_int(value, key, as_type="X"):
    try:
        return format(int(value), as_type)
    except Exception as e:
        acarshub_logging.log(
            f"Unable to convert {key}:{value} to hex. Using 0",
            "try_format_as_int",
            LOG_LEVEL["WARNING"],
        )
        acarshub_logging.acars_traceback(e, "try_format_as_int")
        return "0"


def flight_finder(callsign=None):
    """
    Resolve flight callsign to airline name, IATA flight, ICAO flight, and flight number.

    Args:
        callsign: Flight callsign in either IATA (e.g., "UA123") or ICAO (e.g., "UAL123") format

    Returns:
        Tuple of (airline_name, iata_flight, icao_flight, flight_number)
        Returns (None, None, None, None) if callsign is None or invalid
    """

    if callsign is not None:
        # Check the ICAO DB to see if we know what it is
        # The ICAO DB will return the ICAO code back if it didn't find anything

        # see if the callsign is in IATA or ICAO format
        # if there are three letters starting the callsign, it's ICAO
        # anything else is IATA

        # check the first three characters for letters
        icao_flight = ""
        iata_flight = ""
        airline = None

        if callsign[:3].isalpha():
            # ICAO format (e.g., UAL123)
            icao_flight = callsign
            iata, airline = acarshub_database.find_airline_code_from_icao(callsign[:3])
            flight_number = callsign[3:]
            iata_flight = iata + flight_number
        else:
            # IATA format (e.g., UA123)
            icao, airline = acarshub_database.find_airline_code_from_iata(callsign[:2])
            flight_number = callsign[2:]
            icao_flight = icao + flight_number
            iata_flight = callsign

        return (airline, iata_flight, icao_flight, flight_number)
    else:
        # We should never run in to this condition, I don't think, but we'll add a case for it
        return (None, None, None, None)


def handle_message(message=None):
    if message is not None:
        total_results = 0
        serialized_json = []
        search_term = ""
        results = None
        # If the user has cleared the search bar, we'll execute the else statement
        # And the browsers clears the data
        # otherwise, run the search and format the results

        if "show_all" in message or message["search_term"] != "":
            # Decide if the user is executing a new search or is clicking on a page of results
            # search.js appends the "results_after" as the result page index user is requested
            # Otherwise, we're at the first page

            if "search_term" in message:
                search_term = message["search_term"]

                if "results_after" in message:
                    # ask the database for the results at the user requested page
                    results, total_results = acarshub_database.database_search(
                        message["search_term"], message["results_after"]
                    )
                else:
                    results, total_results = acarshub_database.database_search(
                        message["search_term"]
                    )
            elif "show_all" in message:
                if "results_after" in message:
                    results, total_results = acarshub_database.show_all(
                        message["results_after"]
                    )
                else:
                    results, total_results = acarshub_database.show_all()

            # the db returns two values
            # index zero is the query results in json
            # the other is the count of total results

            if results is not None:
                # Loop through the results and format html
                for result in results:
                    update_keys(result)
                    serialized_json.append(result)

            return (total_results, serialized_json, search_term)
    else:
        return (None, None, None)


def get_realtime_status(
    threads,
    connections,
    message_counts_last_minute,
    message_counts_total,
):
    """
    Get real-time system status without shell script execution.

    Returns status data from Python runtime state:
    - Thread health (alive/dead)
    - Connection states (connected/disconnected)
    - Message counters (per-minute and total)

    Args:
        threads: Dict of thread objects (acars, vdlm2, hfdl, imsl, irdm, database, scheduler)
        connections: Dict of connection states (ACARS, VDLM2, HFDL, IMSL, IRDM)
        message_counts_last_minute: Dict of per-minute message counts
        message_counts_total: Dict of total message counts

    Returns:
        dict: Status dictionary compatible with legacy format
    """
    import acarshub_configuration

    decoders_status = {}
    servers_status = {}
    global_status = {}
    error_state = False

    # ACARS status
    if acarshub_configuration.ENABLE_ACARS:
        thread_alive = threads.get("acars") and threads["acars"].is_alive()
        connected = connections.get("ACARS", False)

        if not thread_alive:
            status = "Dead"
            error_state = True
        elif not connected:
            status = "Disconnected"
            error_state = True
        else:
            status = "Ok"

        decoders_status["ACARS"] = {
            "Status": status,
            "Connected": connected,
            "Alive": thread_alive,
        }

        servers_status["acars_server"] = {
            "Status": status,
            "Messages": message_counts_total.get("acars", 0),
        }

        global_status["ACARS"] = {
            "Status": status,
            "Count": message_counts_total.get("acars", 0),
            "LastMinute": message_counts_last_minute.get("acars", 0),
        }

    # VDLM2 status
    if acarshub_configuration.ENABLE_VDLM:
        thread_alive = threads.get("vdlm2") and threads["vdlm2"].is_alive()
        connected = connections.get("VDLM2", False)

        if not thread_alive:
            status = "Dead"
            error_state = True
        elif not connected:
            status = "Disconnected"
            error_state = True
        else:
            status = "Ok"

        decoders_status["VDLM2"] = {
            "Status": status,
            "Connected": connected,
            "Alive": thread_alive,
        }

        servers_status["vdlm2_server"] = {
            "Status": status,
            "Messages": message_counts_total.get("vdlm2", 0),
        }

        global_status["VDLM2"] = {
            "Status": status,
            "Count": message_counts_total.get("vdlm2", 0),
            "LastMinute": message_counts_last_minute.get("vdlm2", 0),
        }

    # HFDL status
    if acarshub_configuration.ENABLE_HFDL:
        thread_alive = threads.get("hfdl") and threads["hfdl"].is_alive()
        connected = connections.get("HFDL", False)

        if not thread_alive:
            status = "Dead"
            error_state = True
        elif not connected:
            status = "Disconnected"
            error_state = True
        else:
            status = "Ok"

        decoders_status["HFDL"] = {
            "Status": status,
            "Connected": connected,
            "Alive": thread_alive,
        }

        servers_status["hfdl_server"] = {
            "Status": status,
            "Messages": message_counts_total.get("hfdl", 0),
        }

        global_status["HFDL"] = {
            "Status": status,
            "Count": message_counts_total.get("hfdl", 0),
            "LastMinute": message_counts_last_minute.get("hfdl", 0),
        }

    # IMSL status
    if acarshub_configuration.ENABLE_IMSL:
        thread_alive = threads.get("imsl") and threads["imsl"].is_alive()
        connected = connections.get("IMSL", False)

        if not thread_alive:
            status = "Dead"
            error_state = True
        elif not connected:
            status = "Disconnected"
            error_state = True
        else:
            status = "Ok"

        decoders_status["IMSL"] = {
            "Status": status,
            "Connected": connected,
            "Alive": thread_alive,
        }

        servers_status["imsl_server"] = {
            "Status": status,
            "Messages": message_counts_total.get("imsl", 0),
        }

        global_status["IMSL"] = {
            "Status": status,
            "Count": message_counts_total.get("imsl", 0),
            "LastMinute": message_counts_last_minute.get("imsl", 0),
        }

    # IRDM status
    if acarshub_configuration.ENABLE_IRDM:
        thread_alive = threads.get("irdm") and threads["irdm"].is_alive()
        connected = connections.get("IRDM", False)

        if not thread_alive:
            status = "Dead"
            error_state = True
        elif not connected:
            status = "Disconnected"
            error_state = True
        else:
            status = "Ok"

        decoders_status["IRDM"] = {
            "Status": status,
            "Connected": connected,
            "Alive": thread_alive,
        }

        servers_status["irdm_server"] = {
            "Status": status,
            "Messages": message_counts_total.get("irdm", 0),
        }

        global_status["IRDM"] = {
            "Status": status,
            "Count": message_counts_total.get("irdm", 0),
            "LastMinute": message_counts_last_minute.get("irdm", 0),
        }

    # Database thread status
    if threads.get("database") and not threads["database"].is_alive():
        error_state = True

    # Scheduler thread status
    if threads.get("scheduler") and not threads["scheduler"].is_alive():
        error_state = True

    # Error messages tracking
    error_stats = {
        "Total": message_counts_total.get("errors", 0),
        "LastMinute": message_counts_last_minute.get("errors", 0),
    }

    return {
        "decoders": decoders_status,
        "servers": servers_status,
        "global": global_status,
        "error_state": error_state,
        "stats": {},  # Legacy compatibility (empty for now)
        "external_formats": {},  # Legacy compatibility (empty for now)
        "errors": error_stats,
        "threads": {
            "database": threads.get("database") and threads["database"].is_alive(),
            "scheduler": threads.get("scheduler") and threads["scheduler"].is_alive(),
        },
    }
