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
import subprocess
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


if os.getenv("TAR1090_URL", default=False):
    if os.getenv("TAR1090_URL").endswith("/"):
        ADSB_URL = os.getenv("TAR1090_URL") + "?icao="
    else:
        ADSB_URL = os.getenv("TAR1090_URL") + "/?icao="
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
    stale_keys = []
    for key in json_message:
        if not has_specified_key_not_none(json_message, key):
            stale_keys.append(key)

    for key in stale_keys:
        del json_message[key]

    # Now we process individual keys, if that key is present

    # database tablename for the message text doesn't match up with typescript-decoder (needs it to be text)
    # so we rewrite the key
    if has_specified_key(json_message, "msg_text"):
        json_message["text"] = json_message["msg_text"]
        del json_message["msg_text"]

    if has_specified_key(json_message, "time"):
        json_message["timestamp"] = json_message["time"]
        del json_message["time"]

    # libacars is kept as raw JSON string for React frontend to parse
    # React has its own parseAndFormatLibacars() function in decoderUtils.ts

    if has_specified_key(json_message, "icao"):
        json_message["icao_hex"] = try_format_as_int(json_message["icao"], "icao")

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


def service_check():
    import re

    global decoders
    global servers
    global receivers
    global system_error
    global stats
    global external_formats

    if os.getenv("LOCAL_TEST", default=False):
        healthcheck = subprocess.Popen(
            ["../../tools/healthtest.sh"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    else:
        healthcheck = subprocess.Popen(
            ["/scripts/healthcheck.sh"], stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
    stdout, _ = healthcheck.communicate()
    healthstatus = stdout.decode()

    decoders = dict()
    servers = dict()
    receivers = dict()
    stats = dict()
    external_formats = dict()
    system_error = False

    for line in healthstatus.split("\n"):
        try:
            match = re.search("(?:acarsdec|dumpvdl2)-.+ =", line)
            if match:
                if match.group(0).strip(" =") not in decoders:
                    decoders[match.group(0).strip(" =")] = dict()
                    continue
            else:
                for decoder in decoders:
                    if line.find(decoder) != -1:
                        if line.find(f"Decoder {decoder}") and line.endswith(
                            "UNHEALTHY"
                        ):
                            decoders[decoder]["Status"] = "Bad"
                            system_error = True
                        elif line.find(f"Decoder {decoder}") == 0 and line.endswith(
                            "HEALTHY"
                        ):
                            decoders[decoder]["Status"] = "Ok"
                        elif line.find(f"Decoder {decoder}") == 0:
                            system_error = True
                            decoders[decoder]["Status"] = "Unknown"

                        continue

            match = re.search("^(?:acars|vdlm2|hfdl|imsl|irdm)_server", line)

            if match:
                if match.group(0) not in servers:
                    servers[match.group(0)] = dict()

                if line.find("listening") != -1 and line.endswith("UNHEALTHY"):
                    servers[match.group(0)]["Status"] = "Bad"
                    system_error = True
                elif line.find("listening") != -1 and line.endswith("HEALTHY"):
                    servers[match.group(0)]["Status"] = "Ok"
                elif line.find("listening") != -1:
                    system_error = True
                    servers[match.group(0)]["Status"] = "Unknown"
                elif line.find("python") != -1 and line.endswith("UNHEALTHY"):
                    system_error = True
                    servers[match.group(0)]["Web"] = "Bad"
                elif line.find("python") != -1 and line.endswith("HEALTHY"):
                    servers[match.group(0)]["Web"] = "Ok"
                elif line.find("python") != -1:
                    system_error = True
                    servers[match.group(0)]["Web"] = "Unknown"

                continue

            match = re.search("\\d+\\s+(?:ACARS|VDLM2|HFDL|IMSL|IRDM) messages", line)

            if match:
                if line.find("ACARS") != -1 and "ACARS" not in receivers:
                    receivers["ACARS"] = dict()
                    receivers["ACARS"]["Count"] = line.split(" ")[0]
                    if line.endswith("UNHEALTHY"):
                        if time.time() - start_time > 300.0:
                            system_error = True
                            receivers["ACARS"]["Status"] = "Bad"
                        else:
                            receivers["ACARS"]["Status"] = "Waiting for first message"
                    elif line.endswith("HEALTHY"):
                        receivers["ACARS"]["Status"] = "Ok"
                    else:
                        system_error = True
                        receivers["ACARS"]["Status"] = "Unknown"
                if line.find("VDLM2") != -1 and "VDLM2" not in receivers:
                    receivers["VDLM2"] = dict()
                    receivers["VDLM2"]["Count"] = line.split(" ")[0]
                    if line.endswith("UNHEALTHY"):
                        if time.time() - start_time > 300.0:
                            system_error = True
                            receivers["VDLM2"]["Status"] = "Bad"
                        else:
                            receivers["VDLM2"]["Status"] = "Waiting for first message"
                    elif line.endswith("HEALTHY"):
                        receivers["VDLM2"]["Status"] = "Ok"
                    else:
                        system_error = True
                        receivers["VDLM2"]["Status"] = "Unknown"
                if line.find("HFDL") != -1 and "HFDL" not in receivers:
                    receivers["HFDL"] = dict()
                    receivers["HFDL"]["Count"] = line.split(" ")[0]
                    if line.endswith("UNHEALTHY"):
                        if time.time() - start_time > 300.0:
                            system_error = True
                            receivers["HFDL"]["Status"] = "Bad"
                        else:
                            receivers["HFDL"]["Status"] = "Waiting for first message"
                    elif line.endswith("HEALTHY"):
                        receivers["HFDL"]["Status"] = "Ok"
                    else:
                        system_error = True
                        receivers["HFDL"]["Status"] = "Unknown"
                if line.find("IMSL") != -1 and "IMSL" not in receivers:
                    receivers["IMSL"] = dict()
                    receivers["IMSL"]["Count"] = line.split(" ")[0]
                    if line.endswith("UNHEALTHY"):
                        if time.time() - start_time > 300.0:
                            system_error = True
                            receivers["IMSL"]["Status"] = "Bad"
                        else:
                            receivers["IMSL"]["Status"] = "Waiting for first message"
                    elif line.endswith("HEALTHY"):
                        receivers["IMSL"]["Status"] = "Ok"
                    else:
                        system_error = True
                        receivers["IMSL"]["Status"] = "Unknown"
                if line.find("IRDM") != -1 and "IRDM" not in receivers:
                    receivers["IRDM"] = dict()
                    receivers["IRDM"]["Count"] = line.split(" ")[0]
                    if line.endswith("UNHEALTHY"):
                        if time.time() - start_time > 300.0:
                            system_error = True
                            receivers["IRDM"]["Status"] = "Bad"
                        else:
                            receivers["IRDM"]["Status"] = "Waiting for first message"
                    elif line.endswith("HEALTHY"):
                        receivers["IRDM"]["Status"] = "Ok"
                    else:
                        system_error = True
                        receivers["IRDM"]["Status"] = "Unknown"

                continue

            match = re.search("^(acars|vdlm2|hfdl|imsl|irdm)_stats", line)

            if match:
                if match.group(0) not in stats:
                    stats[match.group(0)] = dict()

                if line.endswith("UNHEALTHY"):
                    system_error = True
                    stats[match.group(0)]["Status"] = "Bad"
                elif line.endswith("HEALTHY"):
                    stats[match.group(0)]["Status"] = "Ok"
                else:
                    system_error = True
                    stats[match.group(0)]["Status"] = "Unknown"

            match = re.search("^planeplotter", line)

            if match:
                if line.find("vdl2") != -1:
                    pp_decoder = "VDLM2"
                else:
                    pp_decoder = "ACARS"

                if pp_decoder not in external_formats:
                    external_formats[pp_decoder] = []

                if line.endswith("UNHEALTHY"):
                    system_error = True
                    external_formats[pp_decoder].append(
                        {"type": "planeplotter", "Status": "Bad"}
                    )
                elif line.endswith("HEALTHY"):
                    external_formats[pp_decoder].append(
                        {"type": "planeplotter", "Status": "Ok"}
                    )
                else:
                    system_error = True
                    external_formats[pp_decoder].append(
                        {"type": "planeplotter", "Status": "Unknown"}
                    )

            match = re.search("dumpvdl2 and planeplotter", line)

            if match:
                if line.find("vdl2") != -1:
                    pp_decoder = "VDLM2"
                else:
                    pp_decoder = "ACARS"

                if pp_decoder not in external_formats:
                    external_formats[pp_decoder] = []

                if line.endswith("UNHEALTHY"):
                    system_error = True
                    external_formats[pp_decoder].append(
                        {"type": "dumpvdl2 to planeplotter", "Status": "Bad"}
                    )
                elif line.endswith("HEALTHY"):
                    external_formats[pp_decoder].append(
                        {"type": "dumpvdl2 to planeplotter", "Status": "Ok"}
                    )
                else:
                    system_error = True
                    external_formats[pp_decoder].append(
                        {"type": "dumpvdl2 to planeplotter", "Status": "Unknown"}
                    )

        except Exception as e:
            acarshub_logging.log(e, "service_check", level=LOG_LEVEL["ERROR"])
            acarshub_logging.acars_traceback(e)


if os.getenv("LOCAL_TEST", default=False):
    service_check()


def get_service_status():
    """
    DEPRECATED: Legacy shell-script based status check.
    Use get_realtime_status() instead for real-time data.

    This function is kept for backwards compatibility during migration.
    """
    return {
        "decoders": decoders,
        "servers": servers,
        "global": receivers,
        "error_state": system_error,
        "stats": stats,
        "external_formats": external_formats,
    }


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

    This replaces the legacy service_check() shell script approach.

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
