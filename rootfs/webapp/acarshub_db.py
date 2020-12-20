#!/usr/bin/env python3

## TODO:
# 1) Prune old entries (maybe in the add_message_from_json method to keep scheduling simple?)
# 2) Query the db method. Will need to figure out thread safe/scoped sessions/sessions so the webapp can call when needed

from datetime import datetime
from sqlalchemy import create_engine, Column, Numeric, Integer, String, DateTime, \
     ForeignKey, event, Text
from sqlalchemy.orm import scoped_session, sessionmaker, backref, relation
from sqlalchemy.ext.declarative import declarative_base
import json
import sys
import os

if os.getenv("ACARS_DB"):
    db_path=os.getenv("ACARS_DB")
else:
    db_path='sqlite:////run/acars/messages.db'



database = create_engine(db_path)
db_session = sessionmaker(bind=database)
Messages = declarative_base()
Messages.metadata.create_all(database)

class messages(Messages):
    __tablename__ = 'messages'
    id=Column(Integer, primary_key=True)
    # ACARS or VDLM
    message_type=Column('message_type', String(32))
    # message time
    time=Column('time', Numeric)
    station_id=Column('station_id', String(32))
    toaddr=Column('toaddr', String(32))
    fromaddr=Column('fromaddr', String(32))
    depa=Column('depa', String(32))
    dsta=Column('dsta', String(32))
    eta=Column('eta', String(32))
    gtout=Column('gtout', String(32))
    gtin=Column('gtin', String(32))
    wloff=Column('wloff', String(32))
    wlin=Column('wlin', String(32))
    lat=Column('lat', Numeric)
    lon=Column('lon', Numeric)
    alt=Column('alt', Numeric)
    text=Column('text', Text)
    tail=Column('tail', String(32))
    flight=Column('flight', String(32))
    icao=Column('icao', String(32))
    freq=Column('freq', Numeric)
    ack=Column('ack', String(32))
    mode=Column('mode', String(32))
    label=Column('label', String(32))
    block_id=Column('block_id', String(32))
    msgno=Column('msgno', String(32))
    is_response=Column('is_response', String(32))
    is_onground=Column('is_onground', String(32))
    error=Column('error', String(32))

def add_message_from_json(message_type, message_from_json):
    global database
    # message time
    time=None
    station_id=None
    toaddr=None
    fromaddr=None
    depa=None
    dsta=None
    eta=None
    gtout=None
    gtin=None
    wloff=None
    wlin=None
    lat=None
    lon=None
    alt=None
    text=None
    tail=None
    flight=None
    icao=None
    freq=None
    ack=None
    mode=None
    label=None
    block_id=None
    msgno=None
    is_response=None
    is_onground=None
    error=None

    for index in message_from_json:
        if index == 'timestamp': time = message_from_json[index]
        if index == 'station_id': station_id = message_from_json[index]
        if index == 'toaddr': toaddr = message_from_json[index]
        if index == 'fromaddr': fromaddr = message_from_json[index]
        if index == 'depa': depa = message_from_json[index]
        if index == 'dsta': dsta = message_from_json[index]
        if index == 'eta': eta = message_from_json[index]
        if index == 'gtout': gtout = message_from_json[index]
        if index == 'gtin': gtin = message_from_json[index]
        if index == 'wloff': wloff = message_from_json[index]
        if index == 'wlin': wlin = message_from_json[index]
        if index == 'lat': lat = message_from_json[index]
        if index == 'lon': lon = message_from_json[index]
        if index == 'alt': alt = message_from_json[index]
        if index == 'text': text = message_from_json[index]
        if index == 'tail': tail = message_from_json[index]
        if index == 'flight': flight = message_from_json[index]
        if index == 'icao': icao = message_from_json[index]
        if index == 'freq': freq = message_from_json[index]
        if index == 'ack': ack = message_from_json[index]
        if index == 'mode': mode = message_from_json[index]
        if index == 'label': label = message_from_json[index]
        if index == 'block_id': block_id = message_from_json[index]
        if index == 'msgno': msgno = message_from_json[index]
        if index == 'is_response': is_response = message_from_json[index]
        if index == 'is_onground': is_onground = message_from_json[index]
        if index == 'error': error = message_from_json[index]

    # create a session for this thread to write
    session = db_session()
    # write the message
    session.add(messages(message_type=message_type, time=time, station_id=station_id, toaddr=toaddr,
       fromaddr=fromaddr, depa=depa, dsta=dsta, eta=eta, gtout=gtout, gtin=gtin,
       wloff=wloff, wlin=wlin, lat=lat, lon=lon, alt=alt, text=text, tail=tail,
       flight=flight, icao=icao, freq=freq, ack=ack, mode=mode, label=label, block_id=block_id,
       msgno=msgno, is_response=is_response, is_onground=is_onground, error=error))
    # commit the db change and close the session
    session.commit()
    session.close()
