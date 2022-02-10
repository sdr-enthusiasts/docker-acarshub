#!/usr/bin/env python3

# Copyright (C) 2022 Frederick Clausen II
# This file is part of acarshub <https://github.com/fredclausen/docker-acarshub>.
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

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Text,
    desc,
)
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.ext.declarative import DeclarativeMeta

from sqlalchemy.engine.reflection import Inspector
import json
import datetime
import acarshub_configuration
import acarshub_logging
import re
import os

groundStations = dict()  # dictionary of all ground stations
alert_terms = list()  # dictionary of all alert terms monitored
# dictionary of all alert terms that should flag a message as a non-alert, even if alert matched
alert_terms_ignore = list()
overrides = {}

# Download station IDs

try:
    acarshub_logging.log("Downloading Station IDs", "database")
    with open("./data/ground-stations.json", "r") as f:
        groundStations_json = json.load(f)

    for station in groundStations_json["ground_stations"]:
        stationId = station.get("id")
        if stationId:
            groundStations[stationId] = {
                "icao": station["airport"]["icao"],
                "name": station["airport"]["name"],
            }
    acarshub_logging.log("Completed loading Station IDs", "database")
except Exception as e:
    acarshub_logging.acars_traceback(e, "database")

# Load Message Labels

try:
    acarshub_logging.log("Downloading message labels", "database")
    with open("./data/metadata.json", "r") as f:
        message_labels = json.load(f)
    acarshub_logging.log("Completed loading message labels", "database")
except Exception as e:
    message_labels = {"labels": {}}  # handle URL exception
    acarshub_logging.acars_traceback(e, "database")

# DB PATH MUST BE FROM ROOT!
# default database
db_path = acarshub_configuration.ACARSHUB_DB
database = create_engine(db_path)
db_session = sessionmaker(bind=database)
Messages = declarative_base()

# second database for backup
# required input format is SQL Alchemy DB URL

if acarshub_configuration.DB_BACKUP:
    backup = True
    database_backup = create_engine(acarshub_configuration.DB_BACKUP)
    db_session_backup = sessionmaker(bind=database_backup)
else:
    backup = False

try:
    acarshub_logging.log("Loading Airline Codes", "database")
    f = open("data/airlines.json")
    airlines = json.load(f)
    acarshub_logging.log("Completed Loading Airline Codes", "database")
except Exception as e:
    airlines = {}
    acarshub_logging.acars_traceback(e, database)


# Set up the override IATA/ICAO callsigns
# Input format needs to be IATA|ICAO|Airline Name
# Multiple overrides need to be separated with a ;

if len(acarshub_configuration.IATA_OVERRIDE) > 0:
    iata_override = acarshub_configuration.IATA_OVERRIDE.split(";")
else:
    iata_override = ""

for item in iata_override:
    override_splits = item.split("|")
    if len(override_splits) == 3:
        overrides[override_splits[0]] = (override_splits[1], override_splits[2])
    else:
        acarshub_logging.log(
            f"Error adding in {item} to IATA overrides", "database", level=3
        )

# Class for storing the count of messages received on each frequency


class messagesFreq(Messages):
    __tablename__ = "freqs"
    it = Column(Integer, primary_key=True)
    freq = Column("freq", String(32))
    freq_type = Column("freq_type", String(32))
    count = Column("count", Integer)


# Class to store a count of how many messages are received at what signal level


class messagesLevel(Messages):
    __tablename__ = "level"
    id = Column(Integer, primary_key=True)
    level = Column("level", Integer)
    count = Column("count", Integer)


# Class to store a count of messages that have been received.


class messagesCount(Messages):
    __tablename__ = "count"
    id = Column(Integer, primary_key=True)
    total = Column("total", Integer)  # Count of logged messages
    errors = Column("errors", Integer)  # Count of logged messages with errors
    good = Column("good", Integer)  # Count of logged messages without errors


# Class to store a count of messages received but hold no data


class messagesCountDropped(Messages):
    __tablename__ = "nonlogged_count"
    id = Column(Integer, primary_key=True)
    nonlogged_errors = Column("errors", Integer)
    nonlogged_good = Column("good", Integer)


class alertStats(Messages):
    __tablename__ = "alert_stats"
    id = Column(Integer(), primary_key=True)
    term = Column("term", String(32))
    count = Column("count", Integer)


class ignoreAlertTerms(Messages):
    __tablename__ = "ignore_alert_terms"
    id = Column(Integer(), primary_key=True)
    term = Column("term", String(32))


# Class to store our messages


class messages(Messages):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    # ACARS or VDLM
    message_type = Column("message_type", String(32), nullable=False)
    # message time
    time = Column("msg_time", Integer, nullable=False)
    station_id = Column("station_id", String(32), nullable=False)
    toaddr = Column("toaddr", String(32), nullable=False)
    fromaddr = Column("fromaddr", String(32), nullable=False)
    depa = Column("depa", String(32), index=True, nullable=False)
    dsta = Column("dsta", String(32), index=True, nullable=False)
    eta = Column("eta", String(32), nullable=False)
    gtout = Column("gtout", String(32), nullable=False)
    gtin = Column("gtin", String(32), nullable=False)
    wloff = Column("wloff", String(32), nullable=False)
    wlin = Column("wlin", String(32), nullable=False)
    lat = Column("lat", String(32), nullable=False)
    lon = Column("lon", String(32), nullable=False)
    alt = Column("alt", String(32), nullable=False)
    text = Column("msg_text", Text, index=True, nullable=False)
    tail = Column("tail", String(32), index=True, nullable=False)
    flight = Column("flight", String(32), index=True, nullable=False)
    icao = Column("icao", String(32), index=True, nullable=False)
    freq = Column("freq", String(32), index=True, nullable=False)
    ack = Column("ack", String(32), nullable=False)
    mode = Column("mode", String(32), nullable=False)
    label = Column("label", String(32), index=True, nullable=False)
    block_id = Column("block_id", String(32), nullable=False)
    msgno = Column("msgno", String(32), index=True, nullable=False)
    is_response = Column("is_response", String(32), nullable=False)
    is_onground = Column("is_onground", String(32), nullable=False)
    error = Column("error", String(32), nullable=False)
    libacars = Column("libacars", Text, nullable=False)
    level = Column("level", String(32), nullable=False)


# class to save messages that matched an alert
class messages_saved(Messages):
    __tablename__ = "messages_saved"
    id = Column(Integer, primary_key=True)
    # ACARS or VDLM
    message_type = Column("message_type", String(32), nullable=False)
    # message time
    time = Column("msg_time", Integer, nullable=False)
    station_id = Column("station_id", String(32), nullable=False)
    toaddr = Column("toaddr", String(32), nullable=False)
    fromaddr = Column("fromaddr", String(32), nullable=False)
    depa = Column("depa", String(32), index=True, nullable=False)
    dsta = Column("dsta", String(32), index=True, nullable=False)
    eta = Column("eta", String(32), nullable=False)
    gtout = Column("gtout", String(32), nullable=False)
    gtin = Column("gtin", String(32), nullable=False)
    wloff = Column("wloff", String(32), nullable=False)
    wlin = Column("wlin", String(32), nullable=False)
    lat = Column("lat", String(32), nullable=False)
    lon = Column("lon", String(32), nullable=False)
    alt = Column("alt", String(32), nullable=False)
    text = Column("msg_text", Text, index=True, nullable=False)
    tail = Column("tail", String(32), index=True, nullable=False)
    flight = Column("flight", String(32), index=True, nullable=False)
    icao = Column("icao", String(32), index=True, nullable=False)
    freq = Column("freq", String(32), index=True, nullable=False)
    ack = Column("ack", String(32), nullable=False)
    mode = Column("mode", String(32), nullable=False)
    label = Column("label", String(32), index=True, nullable=False)
    block_id = Column("block_id", String(32), nullable=False)
    msgno = Column("msgno", String(32), index=True, nullable=False)
    is_response = Column("is_response", String(32), nullable=False)
    is_onground = Column("is_onground", String(32), nullable=False)
    error = Column("error", String(32), nullable=False)
    libacars = Column("libacars", Text, nullable=False)
    level = Column("level", String(32), nullable=False)
    term = Column("term", String(32), nullable=False)
    type_of_match = Column("type_of_match", String(32), nullable=False)


# Now we've created the classes for the database, we'll associate the class with the database and create any missing tables


Messages.metadata.create_all(database)
if backup:
    Messages.metadata.create_all(database_backup)


# database is init, now check and see if the fts table is there

inspector = Inspector.from_engine(database)
if "messages_fts" not in inspector.get_table_names():
    import sys

    acarshub_logging.log("Missing FTS TABLE! Aborting!", "database", level=1)
    sys.exit(1)

# messages_idx = Table(
#     "messages_fts",
#     Messages.metadata,
#     #,
#     Column("rowid", Integer(), key="id", primary_key=True),
#     Column("depa", String(32)),
#     Column("dsta", String(32)),
#     Column("text", Text()),
#     Column("tail", String(32)),
#     Column("flight", String(32)),
#     Column("icao", String(32)),
#     Column("freq", String(32)),
#     Column("label", String(32)),
# )

# MessagesIdx = aliased(messages, messages_idx, adapt_on_names=True)

# Class used to convert any search query objects to JSON

try:
    session = db_session()
    terms = session.query(alertStats).all()

    for t in terms:
        alert_terms.append(t.term.upper())

    terms = session.query(ignoreAlertTerms).all()
    for t in terms:
        alert_terms_ignore.append(t.term.upper())

except Exception as e:
    acarshub_logging.acars_traceback(e, "database")
finally:
    session.close()


def query_to_dict(obj):
    if isinstance(obj.__class__, DeclarativeMeta):
        # an SQLAlchemy class
        fields = {}
        for field in [
            x
            for x in dir(obj)
            if not x.startswith("_")
            and x != "metadata"
            and x is not None
            and x != ""
            and x != "registry"
        ]:
            fields[field] = obj.__getattribute__(field)
        return fields
    return None


def update_frequencies(freq, message_type, session):
    found_freq = (
        session.query(messagesFreq)
        .filter(
            messagesFreq.freq == f"{freq}" and messagesFreq.freq_type == message_type
        )
        .first()
    )

    if found_freq is not None:
        found_freq.count += 1
    else:
        session.add(messagesFreq(freq=f"{freq}", freq_type=message_type, count=1))


def is_message_not_empty(json_message):
    fields = [
        "text",
        "libacars",
        "dsta",
        "depa",
        "eta",
        "gtout",
        "gtin",
        "wloff",
        "wlin",
        "lat",
        "lon",
        "alt",
    ]

    for field in fields:
        if field in json_message:
            return True
    return False


def create_db_safe_params(message_from_json):
    params = {
        "time": "",
        "station_id": "",
        "toaddr": "",
        "fromaddr": "",
        "depa": "",
        "dsta": "",
        "eta": "",
        "gtout": "",
        "gtin": "",
        "wloff": "",
        "wlin": "",
        "lat": "",
        "lon": "",
        "alt": "",
        "text": "",
        "tail": "",
        "flight": "",
        "icao": "",
        "freq": "",
        "ack": "",
        "mode": "",
        "label": "",
        "block_id": "",
        "msgno": "",
        "is_response": "",
        "is_onground": "",
        "error": 0,
        "libacars": "",
        "level": "",
    }

    for index, value in message_from_json.items():
        if index == "timestamp":
            params["time"] = value
        elif index == "station_id":
            params["station_id"] = value
        elif index == "toaddr":
            params["toaddr"] = value
        elif index == "fromaddr":
            params["fromaddr"] = value
        elif index == "depa":
            params["depa"] = value
        elif index == "dsta":
            params["dsta"] = value
        elif index == "eta":
            params["eta"] = value
        elif index == "gtout":
            params["gtout"] = value
        elif index == "gtin":
            params["gtin"] = value
        elif index == "wloff":
            params["wloff"] = value
        elif index == "wlin":
            params["wlin"] = value
        elif index == "lat":
            params["lat"] = value
        elif index == "lon":
            params["lon"] = value
        elif index == "alt":
            params["alt"] = value
        elif index == "text":
            params["text"] = value
        elif index == "data":
            params["text"] = value
        elif index == "tail":
            params["tail"] = value
        elif index == "flight":
            params["flight"] = value
        elif index == "icao":
            params["icao"] = value
        elif index == "freq":
            # normalizing frequency to 7 decimal places
            params["freq"] = str(value).ljust(7, "0")
        elif index == "ack":
            params["ack"] = value
        elif index == "mode":
            params["mode"] = value
        elif index == "label":
            params["label"] = value
        elif index == "block_id":
            params["block_id"] = value
        elif index == "msgno":
            params["msgno"] = value
        elif index == "is_response":
            params["is_response"] = value
        elif index == "is_onground":
            params["is_onground"] = value
        elif index == "error":
            params["error"] = value
        elif index == "libacars":
            try:
                params["libacars"] = json.dumps(value)
            except Exception as e:
                acarshub_logging.acars_traceback(e, "database")
        # skip these
        elif index == "channel":
            pass
        elif index == "level":
            params["level"] = value
        elif index == "end":
            pass
        # FIXME: acarsdec now appears to support message reassembly?
        # https://github.com/TLeconte/acarsdec/commit/b2d0a4c27c6092a1c38943da48319a3406db74f2
        # do we need to do anything here for reassembled messages?
        elif index == "assstat":
            acarshub_logging.log(f"assstat key: {index}: {value}", "database", level=5)
            acarshub_logging.log(message_from_json, "database", level=5)
        # We have a key that we aren't saving the database. Log it
        else:
            acarshub_logging.log(
                f"Unidenitied key: {index}: {value}", "database", level=5
            )
            acarshub_logging.log(message_from_json, "database", level=5)

    return params


def add_message(params, message_type, message_from_json, backup=False):
    global database
    global alert_terms

    try:
        if backup:
            session = db_session_backup()
        else:
            session = db_session()

        update_frequencies(params["freq"], message_type, session)
        if acarshub_configuration.DB_SAVEALL or is_message_not_empty(message_from_json):
            # write the message
            session.add(messages(message_type=message_type, **params))

        # Now lets decide where to log the message count to
        # First we'll see if the message is not blank

        if is_message_not_empty(message_from_json):
            count = session.query(messagesCount).first()
            if count is not None:
                count.total += 1

                if params["error"] > 0:
                    count.errors += 1
                else:
                    count.good += 1
            else:
                session.add(
                    messagesCount(
                        total=1,
                        good=0 if params["error"] > 0 else 1,
                        errors=1 if params["error"] > 0 else 0,
                    )
                )

        else:
            count = session.query(messagesCountDropped).first()
            if count is not None:
                if params["error"] > 0:
                    count.nonlogged_errors += 1
                else:
                    count.nonlogged_good += 1
            else:
                session.add(
                    messagesCountDropped(
                        nonlogged_good=1 if params["error"] == 0 else 0,
                        nonlogged_errors=1 if params["error"] > 0 else 0,
                    )
                )

        # Log the level count
        # We'll see if the level is in the database already, and if so, increment the counter
        # If not, we'll add it in

        found_level = (
            session.query(messagesLevel)
            .filter(messagesLevel.level == params["level"])
            .first()
        )

        if found_level is not None:
            found_level.count += 1
        else:
            session.add(messagesLevel(level=params["level"], count=1))

        if len(params["text"]) > 0 and alert_terms:
            for search_term in alert_terms:
                if re.findall(r"\b{}\b".format(search_term), params["text"]):
                    should_add = True
                    for ignore_term in alert_terms_ignore:
                        if re.findall(r"\b{}\b".format(ignore_term), params["text"]):
                            should_add = False
                            break
                    if should_add:
                        found_term = (
                            session.query(alertStats)
                            .filter(alertStats.term == search_term.upper())
                            .first()
                        )
                        if found_term is not None:
                            found_term.count += 1
                        else:
                            session.add(alertStats(term=search_term.upper(), count=1))

                        session.add(
                            messages_saved(
                                message_type=message_type,
                                **params,
                                term=search_term.upper(),
                                type_of_match="text",
                            )
                        )
                        session.commit()

        # commit the db change and close the session
        session.commit()
    except Exception as e:
        acarshub_logging.acars_traceback(e, "database")
    finally:
        if session:
            session.close()


def add_message_from_json(message_type, message_from_json):
    # message time
    # all fields are set to a blank string. This is because all of the database fields
    # are set to be 'not null' so all fields require a value, even if it is blank
    params = create_db_safe_params(message_from_json)
    add_message(params, message_type, message_from_json)
    if backup:
        add_message(params, message_type, message_from_json, backup=True)


def find_airline_code_from_iata(iata):
    if iata in overrides:
        return overrides[iata]

    if iata in airlines:
        return (airlines[iata]["ICAO"], airlines[iata]["NAME"])
    else:
        return (iata, "Unknown Airline")


# FIXME: Rolled back to old database_search. Should wrap FTS table in SQL Alchemy engine
def database_search(search_term, page=0):
    result = None

    try:
        acarshub_logging.log(
            f"[database] Searching database for {search_term}", "database", level=5
        )
        match_string = ""

        for key in search_term:
            if search_term[key] is not None and search_term[key] != "":
                if match_string == "":
                    match_string += f'\'{key}:"{search_term[key]}"*'
                else:
                    match_string += f' AND {key}:"{search_term[key]}"*'

        if match_string == "":
            return [None, 50]

        match_string += "'"

        session = db_session()
        result = session.execute(
            f"SELECT * FROM messages WHERE id IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH {match_string} ORDER BY rowid DESC LIMIT 50 OFFSET {page * 50})"
        )

        count = session.execute(
            f"SELECT COUNT(*) FROM messages_fts WHERE messages_fts MATCH {match_string}"
        )

        processed_results = []
        final_count = 0
        for row in count:
            final_count = row[0]

        if final_count == 0:
            session.close()
            return [None, 50]

        for row in result:
            processed_results.append(dict(row))

        session.close()
        return (processed_results, final_count)
    except Exception as e:
        acarshub_logging.acars_traceback(e, "database")
        session.close()
        return [None, 50]


# def database_search(search_term, page=0):
#     global MessagesIdx
#     result = None
#     processed_results = None
#     count = 0
#     session = None
#     try:
#         if acarshub_configuration.DEBUG_LOGGING:
#             acarshub_logging.log(
#                 f"[database] Searching database for {search_term}", "database"
#             )
#         query_filters = []

#         for term in search_term:
#             if search_term[term]:
#                 if term == "msg_text":
#                     query_filters.append(text("message_fts MATCH 'msg_text:" + search_term[term] + "'"))
#                     # query_filters.append(
#                     #     MessagesIdx.text.like(f'%{search_term["msg_text"].upper()}%')
#                     # )
#                 # elif term == "flight":
#                 #     query_filters.append(
#                 #         MessagesIdx.flight.like(f'%{search_term["flight"].upper()}%')
#                 #     )
#                 # elif term == "depa":
#                 #     query_filters.append(
#                 #         MessagesIdx.depa.like(f'%{search_term["depa"].upper()}%')
#                 #     )
#                 # elif term == "dsta":
#                 #     query_filters.append(
#                 #         MessagesIdx.dsta.like(f'%{search_term["dsta"].upper()}%')
#                 #     )
#                 # elif term == "freq":
#                 #     query_filters.append(
#                 #         MessagesIdx.freq.like(f'%{search_term["freq"].upper()}%')
#                 #     )
#                 # elif term == "label":
#                 #     query_filters.append(
#                 #         MessagesIdx.label.like(f'%{search_term["label"].upper()}%')
#                 #     )
#                 # elif term == "tail":
#                 #     query_filters.append(
#                 #         MessagesIdx.tail.like(f'%{search_term["tail"].upper()}%')
#                 #     )

#         #     result = session.execute(
#         #     f"SELECT * FROM messages WHERE id IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH {match_string} ORDER BY rowid DESC LIMIT 50 OFFSET {page * 50})"
#         # )

#         # SELECT messages_fts.rowid AS messages_fts_rowid, messages_fts.depa AS messages_fts_depa, messages_fts.dsta AS messages_fts_dsta, messages_fts.tail AS messages_fts_tail,
#         # messages_fts.flight AS messages_fts_flight, messages_fts.icao AS messages_fts_icao, messages_fts.freq AS messages_fts_freq, messages_fts.label AS messages_fts_label
#         # FROM messages_fts, messages
#         # WHERE messages_fts.flight LIKE ? AND messages_fts.depa LIKE ? AND messages_fts.dsta LIKE ? AND messages_fts.freq LIKE ? AND messages_fts.label LIKE ?
#         # AND messages_fts.tail LIKE ? AND messages.msg_text LIKE ?
#         # LIMIT ? OFFSET ?
#         if len(query_filters) > 0:
#             session = db_session()
#             result = (
#                 session.query(messages)
#                 .select_from(MessagesIdx)
#                 .join(messages, MessagesIdx.rowid == messages.id)
#                 .filter(*query_filters)
#                 .limit(50)
#                 .offset(page * 50)
#             )
#             #print(result)
#             count = (
#                 session.query(messages)
#                 .select_from(MessagesIdx)
#                 .join(messages, MessagesIdx.rowid == messages.id)
#                 .filter(*query_filters)
#                 .count()
#             )
#             if count > 0:
#                 processed_results = [query_to_dict(d) for d in result]

#     except Exception as e:
#         acarshub_logging.acars_traceback(e, "database")
#     finally:
#         if session:
#             session.close()
#         return (processed_results, count)

# FIXME: Rolled back to old search_alerts. We should wrap this in SQL Alchemy goodness
def search_alerts(icao=None, tail=None, flight=None):
    result = None
    global alert_terms
    if (
        icao is not None
        or tail is not None
        or flight is not None
        or alert_terms is not None
    ):
        try:
            session = db_session()
            search_term = {
                "icao": icao,
                #    "msg_text": alert_terms,
                "flight": flight,
                "tail": tail,
            }
            query_string = ""

            for key in search_term:
                if search_term[key] is not None and search_term[key] != "":
                    for term in search_term[key]:
                        if query_string == "":
                            query_string += f'{key}:"{term}"*'
                        else:
                            query_string += f' OR {key}:"{term}"*'

            if query_string != "":
                query_string = f"SELECT * FROM messages WHERE id IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH '{query_string}')"

            if alert_terms is not None:
                terms_string = """SELECT id, message_type, msg_time, station_id, toaddr, fromaddr, depa, dsta, eta, gtout, gtin, wloff, wlin,
                                lat, lon, alt, msg_text, tail, flight, icao, freq, ack, mode, label, block_id, msgno, is_response, is_onground, error, libacars, level FROM messages_saved"""
            else:
                terms_string = ""

            if query_string != "" and terms_string != "":
                joiner = " UNION "
            else:
                joiner = ""

            if query_string != "" or terms_string != "":
                result = session.execute(
                    f"{query_string}{joiner}{terms_string} ORDER BY msg_time DESC LIMIT 50 OFFSET 0"
                )
            else:
                acarshub_logging.log("SKipping alert search", "database")
                return None

            processed_results = []

            for row in result:
                processed_results.insert(0, dict(row))
            if len(processed_results) == 0:
                return None
            processed_results.reverse()
            session.close()
            return processed_results
        except Exception as e:
            acarshub_logging.acars_traceback(e, "database")
            return None
    else:
        return None


# def search_alerts(icao=None, tail=None, flight=None):
#     result = None
#     processed_results = []
#     global alert_terms
#     if (
#         icao is not None
#         or tail is not None
#         or flight is not None
#         or alert_terms is not None
#     ):
#         try:
#             session = db_session()
#             # FIXME: This should really be FTS searched on messages_saved. We need to do the following:
#             # 1. Create a new fts table for messaged_saved
#             # 2. Save ALL alert terms to the db so we can match properly and save
#             # query_filter_icao = []
#             # query_filter_tail = []
#             # query_filter_flight = []
#             # query_filter_text = []
#             # if icao is not None:
#             #     for term in icao:
#             #         query_filter_icao.append(MessagesIdx.icao.like(f"%{term.upper()}%"))
#             # if tail is not None:
#             #     for term in tail:
#             #         query_filter_tail.append(MessagesIdx.tail.like(f"%{term.upper()}%"))
#             # if flight is not None:
#             #     for term in flight:
#             #         query_filter_flight.append(
#             #             MessagesIdx.flight.like(f"%{term.upper()}%")
#             #         )
#             # if alert_terms is not None:
#             #     for term in alert_terms:
#             #         query_filter_text.append(MessagesIdx.text.like(f"%{term.upper()}%"))

#             # query_filter = []

#             # if len(query_filter_icao) > 0:
#             #     query_filter.append(or_(*query_filter_icao))
#             # if len(query_filter_tail) > 0:
#             #     query_filter.append(or_(*query_filter_tail))
#             # if len(query_filter_flight) > 0:
#             #     query_filter.append(or_(*query_filter_flight))
#             # if len(query_filter_text) > 0:
#             #     query_filter.append(or_(*query_filter_text))

#             # if len(query_filter) > 0:
#             #     result = (
#             #         session.query(MessagesIdx)
#             #         .select_from(messages)
#             #         .join(MessagesIdx, MessagesIdx.id == messages.id)
#             #         .filter(or_(*query_filter))
#             #         .order_by(MessagesIdx.time.desc())
#             #         .limit(50)
#             #         .offset(0)
#             #     )

#             if result:
#                 processed_results = [query_to_dict(d) for d in result]

#         except Exception as e:
#             acarshub_logging.acars_traceback(e, "database")
#         finally:
#             session.close()
#             if len(processed_results) > 0:
#                 return processed_results
#             return None
#     else:
#         return None


def show_all(page=0):
    result = None
    processed_results = []
    count = 0
    try:
        session = db_session()
        result = (
            session.query(messages)
            .order_by(messages.time.desc())
            .limit(50)
            .offset(page * 50)
        )
        count = session.query(messages).count()

        if count > 0:
            processed_results = [query_to_dict(d) for d in result]
            processed_results.reverse()
    except Exception as e:
        acarshub_logging.acars_traceback(e, "database")
    finally:
        if session:
            session.close()
        if count == 0:
            return (None, 50)
        return (processed_results, count)


def get_freq_count():
    freq_count = []
    found_freq = []

    try:
        session = db_session()

        for item in session.query(messagesFreq).all():
            if item.freq not in found_freq:
                freq_count.append(
                    {
                        "freq_type": f"{item.freq_type}",
                        "freq": f"{item.freq}",
                        "count": item.count,
                    }
                )
    except Exception as e:
        acarshub_logging.acars_traceback(e, "database")
    finally:
        if session:
            session.close()
        if len(freq_count) == 0:
            return []
        return sorted(
            freq_count,
            reverse=True,
            key=lambda freq: (freq["freq_type"], freq["count"]),
        )


def get_errors():
    count_total, count_errors, nonlogged_good, nonlogged_errors = 0, 0, 0, 0
    try:
        session = db_session()
        count = session.query(messagesCount).first()
        nonlogged = session.query(messagesCountDropped).first()
        if count is not None:
            count_total = count.total
            count_errors = count.errors

        if nonlogged is not None:
            nonlogged_good = nonlogged.nonlogged_good
            nonlogged_errors = nonlogged.nonlogged_errors

    except Exception as e:
        acarshub_logging.acars_traceback(e, "database")
    finally:
        if session:
            session.close()
        return {
            "non_empty_total": count_total,
            "non_empty_errors": count_errors,
            "empty_total": nonlogged_good,
            "empty_errors": nonlogged_errors,
        }


def database_get_row_count():
    result = None
    size = None
    try:
        session = db_session()
        result = session.query(messages).count()
        try:
            size = os.path.getsize(db_path[10:])
        except Exception as e:
            acarshub_logging.acars_traceback(e, "database")
    except Exception as e:
        acarshub_logging.acars_traceback(e, "database")
    finally:
        if session:
            session.close()
        return (result, size)


def grab_most_recent():
    output = []
    try:
        session = db_session()
        result = session.query(messages).order_by(desc("id")).limit(150)

        if result.count() > 0:
            output = [query_to_dict(d) for d in result]
    except Exception as e:
        acarshub_logging.acars_traceback(e, "database")
    finally:
        if session:
            session.close()
        return output


def lookup_groundstation(lookup_id):
    if lookup_id in groundStations:
        return (groundStations[lookup_id]["icao"], groundStations[lookup_id]["name"])

    return (None, None)


def lookup_label(label):
    if label in message_labels["labels"]:
        return message_labels["labels"][label]["name"]
    return None


def get_message_label_json():
    return message_labels["labels"]


def get_signal_levels():
    try:
        output = []
        session = db_session()
        result = session.query(messagesLevel).order_by(messagesLevel.level)
        if result.count() > 0:
            output = [query_to_dict(d) for d in result]

    except Exception as e:
        acarshub_logging.acars_traceback(e, "database")
    finally:
        if session:
            session.close()
        if len(output) > 0:
            return output
        else:
            return []


def get_alert_counts():
    global alert_terms
    result_list = []
    try:
        session = db_session()
        result = session.query(alertStats).order_by(alertStats.count)

        if result.count() > 0:
            result_list = [query_to_dict(d) for d in result]

            for term in alert_terms:
                found = False
                for item in result_list:
                    if item["term"] == term:
                        found = True
                        continue
                if not found:
                    result_list.append({"term": term, "count": 0})
        else:
            for term in alert_terms:
                result_list.append({"term": term, "count": 0})

    except Exception as e:
        acarshub_logging.acars_traceback(e, "database")
    finally:
        if session:
            session.close()
        return result_list


def set_alert_ignore(terms=None):
    if terms is None:
        return

    global alert_terms_ignore
    alert_terms_ignore = terms

    try:
        session = db_session()
        session.query(ignoreAlertTerms).delete()
        for t in terms:
            session.add(ignoreAlertTerms(term=t))
        session.commit()
    except Exception as e:
        acarshub_logging.acars_traceback(e, "database")
    finally:
        if session:
            session.close()


def set_alert_terms(terms=None):
    if terms is None:
        return
    global alert_terms
    alert_terms = terms
    try:
        session = db_session()
        # we need to do two things. First is to loop through all of the terms we should be monitoring and make sure the db has them
        # next is to loop through what is in the db and make sure it should still be there
        for item in terms:
            result = session.query(alertStats).filter(alertStats.term == item).count()
            if result == 0:
                session.add(alertStats(term=item, count=0))

        result = session.query(alertStats).all()
        for item in result:
            if item.term not in terms:
                session.query(alertStats).filter(alertStats.term == item.term).delete()
                session.query(messages_saved).filter(
                    messages_saved.term == item.term
                ).delete()

        session.commit()
    except Exception as e:
        acarshub_logging.acars_traceback(e, "database")
    finally:
        if session:
            session.close()


def reset_alert_counts():
    try:
        session = db_session()
        result = session.query(alertStats).all()
        for item in result:
            item.count = 0

        session.commit()
    except Exception as e:
        acarshub_logging.acars_traceback(e, "database")
    finally:
        if session:
            session.close()


def get_alert_ignore():
    global alert_terms_ignore
    return alert_terms_ignore


def get_alert_terms():
    global alert_terms
    return alert_terms


def prune_database():
    try:
        acarshub_logging.log("Pruning database", "database")
        cutoff = (
            datetime.datetime.now()
            - datetime.timedelta(days=acarshub_configuration.DB_SAVE_DAYS)
        ).timestamp()

        session = db_session()
        result = session.query(messages).filter(messages.time < cutoff).delete()

        acarshub_logging.log("Pruned %s messages" % result, "database")

        session.commit()

        acarshub_logging.log("Pruning alert database", "database")

        cutoff = (
            datetime.datetime.now()
            - datetime.timedelta(days=acarshub_configuration.DB_ALERT_SAVE_DAYS)
        ).timestamp()

        result = (
            session.query(messages_saved).filter(messages_saved.time < cutoff).delete()
        )

        acarshub_logging.log("Pruned %s messages" % result, "database")

        session.commit()
    except Exception as e:
        acarshub_logging.acars_traceback(e, "database")
    finally:
        if session:
            session.close()
