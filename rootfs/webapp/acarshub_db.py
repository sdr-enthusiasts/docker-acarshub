#!/usr/bin/env python3

from sqlalchemy import create_engine, Column, Integer, String, Text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.ext.declarative import DeclarativeMeta
import json
import urllib.request
import acarshub_helpers
import re

groundStations = dict()
alert_terms = list()

# Download station IDs

try:
    acarshub_helpers.log("Downloading Station IDs", "database")
    with open("./data/ground-stations.json", "r") as f:
        groundStations_json = json.load(f)

    for station in groundStations_json["ground_stations"]:
        stationId = station.get("id")
        if stationId:
            groundStations[stationId] = {
                "icao": station["airport"]["icao"],
                "name": station["airport"]["name"],
            }

    acarshub_helpers.log("Completed loading Station IDs", "database")
except Exception as e:
    acarshub_helpers.acars_traceback(e, "database")

# Load Message Labels

try:
    acarshub_helpers.log("Downloading message labels", "database")
    with open("./data/metadata.json", "r") as f:
        message_labels = json.load(f)
    acarshub_helpers.log("Completed loading message labels", "database")
except Exception as e:
    message_labels = {"labels": {}}  # handle URL exception
    acarshub_helpers.acars_traceback(e, "database")

# DB PATH MUST BE FROM ROOT!
# default database
db_path = acarshub_helpers.ACARSHUB_DB
database = create_engine(db_path)
db_session = sessionmaker(bind=database)
Messages = declarative_base()

# second database for backup
# required input format is SQL Alchemy DB URL

if acarshub_helpers.DB_BACKUP:
    backup = True
    database_backup = create_engine(acarshub_helpers.DB_BACKUP)
    db_session_backup = sessionmaker(bind=database_backup)
else:
    backup = False

overrides = {}
freqs = []

try:
    acarshub_helpers.log("Loading Airline Codes", "database")
    f = open("data/airlines.json")
    airlines = json.load(f)
    acarshub_helpers.log("Completed Loading Airline Codes", "database")
except Exception as e:
    airlines = {}
    acarshub_helpers.acars_traceback(e, database)


# Set up the override IATA/ICAO callsigns
# Input format needs to be IATA|ICAO|Airline Name
# Multiple overrides need to be separated with a ;

if len(acarshub_helpers.IATA_OVERRIDE) > 0:
    iata_override = acarshub_helpers.IATA_OVERRIDE.split(";")
else:
    iata_override = ""

for item in iata_override:
    override_splits = item.split("|")
    if len(override_splits) == 3:
        overrides[override_splits[0]] = (override_splits[1], override_splits[2])
    else:
        acarshub_helpers.log(f"Error adding in {item} to IATA overrides", "database")

# Grab the freqs from the environment so we know what is being monitored

if acarshub_helpers.ENABLE_ACARS:
    acars_freqs = acarshub_helpers.FREQS_ACARS.split(";")

    for item in acars_freqs:
        freqs.append(("ACARS", item))

if acarshub_helpers.ENABLE_VDLM:
    vdlm_freqs = acarshub_helpers.FREQS_VDLM.split(";")

    for item in vdlm_freqs:
        freqs.append(("VDL-M2", item))

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

# Class used to convert any search query objects to JSON

session = db_session()
terms = session.query(alertStats).all()

for t in terms:
    if t.term.isupper() == False:
        t.term = t.term.upper()

    alert_terms.append(t.term.upper())
session.commit()
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


def add_message_from_json(message_type, message_from_json):
    global database
    global alert_terms
    import json

    # message time
    # all fields are set to a blank string. This is because all of the database fields
    # are set to be 'not null' so all fields require a value, even if it is blank
    time = ""
    station_id = ""
    toaddr = ""
    fromaddr = ""
    depa = ""
    dsta = ""
    eta = ""
    gtout = ""
    gtin = ""
    wloff = ""
    wlin = ""
    lat = ""
    lon = ""
    alt = ""
    text = ""
    tail = ""
    flight = ""
    icao = ""
    freq = ""
    ack = ""
    mode = ""
    label = ""
    block_id = ""
    msgno = ""
    is_response = ""
    is_onground = ""
    error = 0
    libacars = ""
    level = ""

    for index in message_from_json:
        if index == "timestamp":
            time = message_from_json[index]
        elif index == "station_id":
            station_id = message_from_json[index]
        elif index == "toaddr":
            toaddr = message_from_json[index]
        elif index == "fromaddr":
            fromaddr = message_from_json[index]
        elif index == "depa":
            depa = message_from_json[index]
        elif index == "dsta":
            dsta = message_from_json[index]
        elif index == "eta":
            eta = message_from_json[index]
        elif index == "gtout":
            gtout = message_from_json[index]
        elif index == "gtin":
            gtin = message_from_json[index]
        elif index == "wloff":
            wloff = message_from_json[index]
        elif index == "wlin":
            wlin = message_from_json[index]
        elif index == "lat":
            lat = message_from_json[index]
        elif index == "lon":
            lon = message_from_json[index]
        elif index == "alt":
            alt = message_from_json[index]
        elif index == "text":
            text = message_from_json[index]
        elif index == "data":
            text = message_from_json[index]
        elif index == "tail":
            tail = message_from_json[index]
        elif index == "flight":
            flight = message_from_json[index]
        elif index == "icao":
            icao = message_from_json[index]
        elif index == "freq":
            freq = message_from_json[index]
        elif index == "ack":
            ack = message_from_json[index]
        elif index == "mode":
            mode = message_from_json[index]
        elif index == "label":
            label = message_from_json[index]
        elif index == "block_id":
            block_id = message_from_json[index]
        elif index == "msgno":
            msgno = message_from_json[index]
        elif index == "is_response":
            is_response = message_from_json[index]
        elif index == "is_onground":
            is_onground = message_from_json[index]
        elif index == "error":
            error = message_from_json[index]
        elif index == "libacars":
            try:
                libacars = json.dumps(message_from_json[index])
            except Exception as e:
                acarshub_helpers.acars_traceback(e, "database")
        # skip these
        elif index == "channel":
            pass
        elif index == "level":
            level = message_from_json["level"]
        elif index == "end":
            pass
        # We have a key that we aren't saving the database. Log it
        else:
            acarshub_helpers.log(f"Unidenitied key: {index}", "database")

    try:
        session = db_session()
        if backup:
            session_backup = db_session_backup()

        found_freq = (
            session.query(messagesFreq)
            .filter(
                messagesFreq.freq == f"{freq}"
                and messagesFreq.freq_type == message_type
            )
            .first()
        )

        if found_freq is not None:
            found_freq.count += 1
        else:
            session.add(messagesFreq(freq=f"{freq}", freq_type=message_type, count=1))

        if backup:
            found_freq_backup = (
                session_backup.query(messagesFreq)
                .filter(
                    messagesFreq.freq == f"{freq}"
                    and messagesFreq.freq_type == message_type
                )
                .first()
            )

            if found_freq_backup is not None:
                found_freq_backup.count += 1
            else:
                session_backup.add(
                    messagesFreq(freq=f"{freq}", freq_type=message_type, count=1)
                )

        if (
            acarshub_helpers.DB_SAVEALL
            or text != ""
            or libacars != ""
            or dsta != ""
            or depa != ""
            or eta != ""
            or gtout != ""
            or gtin != ""
            or wloff != ""
            or wlin != ""
            or lat != ""
            or lon != ""
            or alt != ""
        ):

            # write the message

            session.add(
                messages(
                    message_type=message_type,
                    time=time,
                    station_id=station_id,
                    toaddr=toaddr,
                    fromaddr=fromaddr,
                    depa=depa,
                    dsta=dsta,
                    eta=eta,
                    gtout=gtout,
                    gtin=gtin,
                    wloff=wloff,
                    wlin=wlin,
                    lat=lat,
                    lon=lon,
                    alt=alt,
                    text=text,
                    tail=tail,
                    flight=flight,
                    icao=icao,
                    freq=freq,
                    ack=ack,
                    mode=mode,
                    label=label,
                    block_id=block_id,
                    msgno=msgno,
                    is_response=is_response,
                    is_onground=is_onground,
                    error=error,
                    libacars=libacars,
                    level=level,
                )
            )

            if backup:
                session_backup.add(
                    messages(
                        message_type=message_type,
                        time=time,
                        station_id=station_id,
                        toaddr=toaddr,
                        fromaddr=fromaddr,
                        depa=depa,
                        dsta=dsta,
                        eta=eta,
                        gtout=gtout,
                        gtin=gtin,
                        wloff=wloff,
                        wlin=wlin,
                        lat=lat,
                        lon=lon,
                        alt=alt,
                        text=text,
                        tail=tail,
                        flight=flight,
                        icao=icao,
                        freq=freq,
                        ack=ack,
                        mode=mode,
                        label=label,
                        block_id=block_id,
                        msgno=msgno,
                        is_response=is_response,
                        is_onground=is_onground,
                        error=error,
                        libacars=libacars,
                        level=level,
                    )
                )

        # Now lets decide where to log the message count to
        # First we'll see if the message is not blank

        if (
            text != ""
            or libacars != ""
            or dsta != ""
            or depa != ""
            or eta != ""
            or gtout != ""
            or gtin != ""
            or wloff != ""
            or wlin != ""
            or lat != ""
            or lon != ""
            or alt != ""
        ):

            count = session.query(messagesCount).first()
            count.total += 1

            if error > 0:
                count.errors += 1
            else:
                count.good += 1

            if backup:
                count_backup = session_backup.query(messagesCount).first()
                count.total += 1

                if error > 0:
                    count_backup.errors += 1
                else:
                    count_backup.good += 1

        else:
            count = session.query(messagesCountDropped).first()

            if error > 0:
                count.nonlogged_errors += 1
            else:
                count.nonlogged_good += 1

            if backup:
                count_backup = session_backup.query(messagesCountDropped).first()

                if error > 0:
                    count_backup.nonlogged_errors += 1
                else:
                    count_backup.nonlogged_good += 1

        # Log the level count
        # We'll see if the level is in the database already, and if so, increment the counter
        # If not, we'll add it in

        found_level = (
            session.query(messagesLevel).filter(messagesLevel.level == level).first()
        )

        if found_level is not None:
            found_level.count += 1
        else:
            session.add(messagesLevel(level=level, count=1))

        if backup:
            found_level_backup = (
                session_backup.query(messagesLevel)
                .filter(messagesLevel.level == level)
                .first()
            )

            if found_level_backup is not None:
                found_level_backup.count += 1
            else:
                session_backup.add(messagesLevel(level=level, count=1))

        if len(text) > 0 and alert_terms:
            for search_term in alert_terms:
                if re.findall(r"\b{}\b".format(search_term), text):

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
                            time=time,
                            station_id=station_id,
                            toaddr=toaddr,
                            fromaddr=fromaddr,
                            depa=depa,
                            dsta=dsta,
                            eta=eta,
                            gtout=gtout,
                            gtin=gtin,
                            wloff=wloff,
                            wlin=wlin,
                            lat=lat,
                            lon=lon,
                            alt=alt,
                            text=text,
                            tail=tail,
                            flight=flight,
                            icao=icao,
                            freq=freq,
                            ack=ack,
                            mode=mode,
                            label=label,
                            block_id=block_id,
                            msgno=msgno,
                            is_response=is_response,
                            is_onground=is_onground,
                            error=error,
                            libacars=libacars,
                            level=level,
                            term=search_term.upper(),
                            type_of_match="text",
                        )
                    )
                    session.commit()
                    if backup:
                        found_term_backup = (
                            session_backup.query(alertStats)
                            .filter(alertStats.term == search_term.upper())
                            .first()
                        )
                        if found_term_backup is not None:
                            found_term_backup.count += 1
                        else:
                            session_backup.add(
                                alertStats(term=search_term.upper(), count=1)
                            )
                        session_backup.add(
                            messages_saved(
                                message_type=message_type,
                                time=time,
                                station_id=station_id,
                                toaddr=toaddr,
                                fromaddr=fromaddr,
                                depa=depa,
                                dsta=dsta,
                                eta=eta,
                                gtout=gtout,
                                gtin=gtin,
                                wloff=wloff,
                                wlin=wlin,
                                lat=lat,
                                lon=lon,
                                alt=alt,
                                text=text,
                                tail=tail,
                                flight=flight,
                                icao=icao,
                                freq=freq,
                                ack=ack,
                                mode=mode,
                                label=label,
                                block_id=block_id,
                                msgno=msgno,
                                is_response=is_response,
                                is_onground=is_onground,
                                error=error,
                                libacars=libacars,
                                level=level,
                                term=search_term.upper(),
                                type_of_match="text",
                            )
                        )
                        session_backup.commit()
        # commit the db change and close the session
        session.commit()
        session.close()

        if backup:
            session_backup.commit()
            session_backup.close()

    except Exception as e:
        acarshub_helpers.acars_traceback(e, "database")


def find_airline_code_from_iata(iata):
    if iata in overrides:
        return overrides[iata]

    if iata in airlines:
        return (airlines[iata]["ICAO"], airlines[iata]["NAME"])
    else:
        return (iata, "Unknown Airline")


def database_search(search_term, page=0):
    result = None

    try:
        if acarshub_helpers.DEBUG_LOGGING:
            acarshub_helpers.log(
                f"[database] Searching database for {search_term}", "database"
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
        acarshub_helpers.acars_traceback(e, "database")
        session.close()
        return [None, 50]


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
                terms_string = f"""SELECT id, message_type, msg_time, station_id, toaddr, fromaddr, depa, dsta, eta, gtout, gtin, wloff, wlin,
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
                acarshub_helpers.log(f"SKipping alert search", "database")
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
            acarshub_helpers.acars_traceback(e, "database")
            return None
    else:
        return None


def show_all(page=0):
    result = None

    try:
        session = db_session()
        result = session.execute(
            f"SELECT * from messages ORDER BY rowid DESC LIMIT 50 OFFSET {page * 50}"
        )
        count = session.execute("SELECT COUNT(*) from messages")

        processed_results = []
        final_count = 0
        for row in count:
            final_count = row[0]

        if final_count == 0:
            return [None, 50]

        for row in result:
            processed_results.append(dict(row))

        session.close()
        processed_results.reverse()
        return (processed_results, final_count)
    except Exception as e:
        acarshub_helpers.acars_traceback(e, "database")


def get_freq_count():
    result = None
    freq_count = []
    found_freq = []

    try:
        session = db_session()

        for f in freqs:
            if f[1].endswith("00"):
                freq = f[1][:-2]
            elif f[1].endswith(".0"):
                freq = f[1]
            elif f[1].endswith("0"):
                freq = f[1][:-1]
            else:
                freq = f[1]

            result = (
                session.query(messagesFreq)
                .filter(messagesFreq.freq)
                .filter(messagesFreq.freq == freq and messagesFreq.freq_type == f[0])
                .first()
            )

            if result is not None:
                freq_count.append(
                    {
                        "freq_type": f"{result.freq_type}",
                        "freq": f"{result.freq}",
                        "count": result.count,
                    }
                )
                found_freq.append(freq)
            else:
                freq_count.append(
                    {"freq_type": f"{f[0]}", "freq": f"{f[1]}", "count": 0}
                )

        for item in session.query(messagesFreq).all():
            if item.freq not in found_freq:
                freq_count.append(
                    {
                        "freq_type": f"{item.freq_type}",
                        "freq": f"{item.freq}",
                        "count": item.count,
                    }
                )

        session.close()

        return sorted(
            freq_count,
            reverse=True,
            key=lambda freq: (freq["freq_type"], freq["count"]),
        )

    except Exception as e:
        acarshub_helpers.acars_traceback(e, "database")


def get_errors_direct():
    try:
        session = db_session()
        total_messages = session.query(messages).count()
        total_errors = session.query(messages).filter(messages.error != "0").count()
        session.close()

        return (total_messages, total_errors)

    except Exception as e:
        acarshub_helpers.acars_traceback(e, "database")


def get_errors():
    try:
        session = db_session()
        count = session.query(messagesCount).first()
        nonlogged = session.query(messagesCountDropped).first()
        session.close()

        return {
            "non_empty_total": count.total,
            "non_empty_errors": count.errors,
            "empty_total": nonlogged.nonlogged_good,
            "empty_errors": nonlogged.nonlogged_errors,
        }

    except Exception as e:
        acarshub_helpers.acars_traceback(e, "database")


def database_get_row_count():
    import os

    result = None

    try:
        session = db_session()
        result = session.query(messages).count()
        session.close()

        try:
            size = os.path.getsize(db_path[10:])
        except Exception as e:
            acarshub_helpers.acars_traceback(e, "database")
            size = None

        return (result, size)
    except Exception as e:
        acarshub_helpers.acars_traceback(e, "database")


def grab_most_recent():
    from sqlalchemy import desc

    try:
        session = db_session()
        result = session.query(messages).order_by(desc("id")).limit(150)

        if result.count() > 0:
            return [query_to_dict(d) for d in result]
        else:
            return []
    except Exception as e:
        acarshub_helpers.acars_traceback(e, "database")


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
        session = db_session()
        result = session.query(messagesLevel).order_by(messagesLevel.level)
        if result.count() > 0:
            return [query_to_dict(d) for d in result]

        else:
            return []

    except Exception as e:
        acarshub_helpers.acars_traceback(e, "database")


def get_alert_counts():
    try:
        session = db_session()
        result = session.query(alertStats).order_by(alertStats.count)
        global alert_terms
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

            return result_list
        else:
            result_list = []

            for term in alert_terms:
                result_list.append({"term": term, "count": 0})
            return result_list
    except Exception as e:
        acarshub_helpers.acars_traceback(e, "database")


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
                drop = (
                    session.query(alertStats)
                    .filter(alertStats.term == item.term)
                    .delete()
                )
                drop_term = (
                    session.query(messages_saved)
                    .filter(messages_saved.term == item.term)
                    .delete()
                )

        session.commit()
        session.close()
    except Exception as e:
        acarshub_helpers.acars_traceback(e, "database")


def get_alert_terms():
    global alert_terms
    return alert_terms


def init_database(backup_db=False):
    try:
        # We will pre-populate the count table if this is a new db
        # Or the user doesn't have the table already

        total_messages, total_errors = get_errors_direct()
        good_msgs = total_messages - total_errors
        if not backup_db:
            session = db_session()
        else:
            session = db_session_backup()

        if session.query(messagesCount).count() == 0:
            acarshub_helpers.log("Initializing table database", "database")
            session.add(
                messagesCount(total=total_messages, errors=total_errors, good=good_msgs)
            )
            session.commit()
            acarshub_helpers.log("Count table initialized", "database")

        if session.query(messagesCountDropped).count() == 0:
            acarshub_helpers.log("Initializing dropped count database", "database")
            session.add(messagesCountDropped(nonlogged_good=0, nonlogged_errors=0))
            session.commit()
            acarshub_helpers.log("Dropped count table initialized", "database")

        # now we pre-populate the freq db if empty

        if session.query(messagesFreq).count() == 0:
            acarshub_helpers.log("Initializing freq table", "database")
            found_freq = {}
            for item in session.query(messages).all():
                if item.freq not in found_freq:
                    found_freq[item.freq] = [
                        item.freq,
                        item.message_type,
                        session.query(messages)
                        .filter(messages.freq == item.freq)
                        .count(),
                    ]

            for item in found_freq:
                session.add(
                    messagesFreq(
                        freq=found_freq[item][0],
                        count=found_freq[item][2],
                        freq_type=found_freq[item][1],
                    )
                )
            session.commit()
            acarshub_helpers.log("Freq table initialized", "database")

        session.close()
    except Exception as e:
        acarshub_helpers.acars_traceback(e, "database")


init_database()

if backup:
    init_database(backup_db=True)
