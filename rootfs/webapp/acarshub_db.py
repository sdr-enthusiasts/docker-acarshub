#!/usr/bin/env python3

from sqlalchemy import create_engine, Column, Numeric, Integer, String, \
    Text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from flask import jsonify
import os

if os.getenv("ACARSHUB_DB"):
    db_path = os.getenv("ACARSHUB_DB")
else:
    db_path = 'sqlite:////run/acars/messages.db'

database = create_engine(db_path)
db_session = sessionmaker(bind=database)
Messages = declarative_base()


airlines_database = create_engine('sqlite:///data/airlines.db')
airlines_db_session = sessionmaker(bind=airlines_database)
Airlines = declarative_base()


class messages(Messages):
    __tablename__ = 'messages'
    id = Column(Integer, primary_key=True)
    # ACARS or VDLM
    message_type = Column('message_type', String(32))
    # message time
    time = Column('time', String(32))
    station_id = Column('station_id', String(32))
    toaddr = Column('toaddr', String(32))
    fromaddr = Column('fromaddr', String(32))
    depa = Column('depa', String(32))
    dsta = Column('dsta', String(32))
    eta = Column('eta', String(32))
    gtout = Column('gtout', String(32))
    gtin = Column('gtin', String(32))
    wloff = Column('wloff', String(32))
    wlin = Column('wlin', String(32))
    lat = Column('lat', String(32))
    lon = Column('lon', String(32))
    alt = Column('alt', String(32))
    text = Column('text', Text)
    tail = Column('tail', String(32))
    flight = Column('flight', String(32))
    icao = Column('icao', String(32))
    freq = Column('freq', String(32))
    ack = Column('ack', String(32))
    mode = Column('mode', String(32))
    label = Column('label', String(32))
    block_id = Column('block_id', String(32))
    msgno = Column('msgno', String(32))
    is_response = Column('is_response', String(32))
    is_onground = Column('is_onground', String(32))
    error = Column('error', String(32))
    libacars = Column('libacars', Text)


class airlines(Airlines):
    __tablename__ = 'airlines'
    index = Column(Integer, primary_key=True)
    IATA = Column('IATA', Text)
    ICAO = Column('ICAO', Text)
    NAME = Column('NAME', Text)


Messages.metadata.create_all(database)
Airlines.metadata.create_all(airlines_database)


def add_message_from_json(message_type, message_from_json):
    import os
    global database
    # message time
    time = None
    station_id = None
    toaddr = None
    fromaddr = None
    depa = None
    dsta = None
    eta = None
    gtout = None
    gtin = None
    wloff = None
    wlin = None
    lat = None
    lon = None
    alt = None
    text = None
    tail = None
    flight = None
    icao = None
    freq = None
    ack = None
    mode = None
    label = None
    block_id = None
    msgno = None
    is_response = None
    is_onground = None
    error = None
    libacars = None

    for index in message_from_json:
        if index == 'timestamp':
            time = message_from_json[index]
        elif index == 'station_id':
            station_id = message_from_json[index]
        elif index == 'toaddr':
            toaddr = message_from_json[index]
        elif index == 'fromaddr':
            fromaddr = message_from_json[index]
        elif index == 'depa':
            depa = message_from_json[index]
        elif index == 'dsta':
            dsta = message_from_json[index]
        elif index == 'eta':
            eta = message_from_json[index]
        elif index == 'gtout':
            gtout = message_from_json[index]
        elif index == 'gtin':
            gtin = message_from_json[index]
        elif index == 'wloff':
            wloff = message_from_json[index]
        elif index == 'wlin':
            wlin = message_from_json[index]
        elif index == 'lat':
            lat = message_from_json[index]
        elif index == 'lon':
            lon = message_from_json[index]
        elif index == 'alt':
            alt = message_from_json[index]
        elif index == 'text':
            text = message_from_json[index]
        elif index == 'data':
            text = message_from_json[index]
        elif index == 'tail':
            tail = message_from_json[index]
        elif index == 'flight':
            flight = message_from_json[index]
        elif index == 'icao':
            icao = message_from_json[index]
        elif index == 'freq':
            freq = message_from_json[index]
        elif index == 'ack':
            ack = message_from_json[index]
        elif index == 'mode':
            mode = message_from_json[index]
        elif index == 'label':
            label = message_from_json[index]
        elif index == 'block_id':
            block_id = message_from_json[index]
        elif index == 'msgno':
            msgno = message_from_json[index]
        elif index == 'is_response':
            is_response = message_from_json[index]
        elif index == 'is_onground':
            is_onground = message_from_json[index]
        elif index == 'error':
            error = message_from_json[index]
        elif index == 'libacars':
            pass
        # skip these
        elif index == 'channel':
            pass
        elif index == 'level':
            pass
        elif index == 'end':
            pass
        # We have a key that we aren't saving the database. Log it
        else:
            print(f"[database] Unidenitied key: {index}")

    # create a session for this thread to write
    session = db_session()
    # write the message
    if os.getenv("DEBUG_LOGGING", default=False):
        print("[database] writing to the database")
        print(f"[database] writing message: {message_from_json}")

    try:
        session.add(messages(message_type=message_type, time=time, station_id=station_id, toaddr=toaddr,
                             fromaddr=fromaddr, depa=depa, dsta=dsta, eta=eta, gtout=gtout, gtin=gtin,
                             wloff=wloff, wlin=wlin, lat=lat, lon=lon, alt=alt, text=text, tail=tail,
                             flight=flight, icao=icao, freq=freq, ack=ack, mode=mode, label=label, block_id=block_id,
                             msgno=msgno, is_response=is_response, is_onground=is_onground, error=error, libacars=libacars))
        # commit the db change and close the session
        session.commit()
        session.close()
        if os.getenv("DEBUG_LOGGING", default=False):
            print("[database] write to database complete")
    except Exception:
        print("[database] Error writing to the database")


def pruneOld():
    import datetime

    # Grab the current time and find 7 days ago
    dt = datetime.datetime.now()
    delta = datetime.timedelta(days=7)
    stale_time = dt - delta

    # Database is storing the timestamps of messages in unix epoch. Convert the expiry time to epoch
    epoch = stale_time.replace().timestamp()

    # Open session to db, run the query, and close session
    try:
        session = db_session()
        result = session.query(messages).filter(messages.time <= epoch).delete()
        session.commit()
        print(f"[database] Pruned database of {result} records")
        session.close()
    except Exception:
        print("[database] Error with database pruning")


def find_airline_code_from_iata(iata):
    import os
    result = None

    try:
        session = airlines_db_session()
        result = session.query(airlines).filter(airlines.IATA == iata).first()
        session.close()
    except Exception:
        print(f"[database] Error in query with IATA code {iata}")
        return (iata, "Unknown Airline")
    else:
        if result is not None:
            if os.getenv("DEBUG_LOGGING", default=False):
                print(f"[database] IATA code {iata} converted to {result.ICAO}")
            return (result.ICAO, result.NAME)
        else:
            print(f"[database] IATA code {iata} not found in database")
            return (iata, "Unknown Airline")

def database_search(field, search_term, page=0):
    import os
    import json
    result = None

    try:
        if os.getenv("DEBUG_LOGGING", default=False):
            print(f"[database] Searching database for {search_term} in {field}")
        session = db_session()
        if field == "flight":
            result = session.query(messages).filter(messages.flight.contains(search_term))
        elif field == "tail":
            result = session.query(messages).filter(messages.tail.contains(search_term))
        elif field == "depa":
            result = result = session.query(messages).filter(messages.depa.contains(search_term))
        elif field == "dsta":
            result = session.query(messages).filter(messages.dsta.contains(search_term))
        elif field == "text":
            result = session.query(messages).filter(messages.text.contains(search_term))
        session.close()
    except Exception:
        print("[database] Error running search!")

    if os.getenv("DEBUG_LOGGING", default=False):
        print("[database] Done searching")

    if result.count() > 0:
        data = [d.__dict__ for d in result[page:page+20]]
        return [data, result.count()]
    else:
        return [None, 20]
