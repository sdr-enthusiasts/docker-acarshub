#!/usr/bin/env python3

from datetime import datetime
from sqlalchemy import create_engine, Column, Numeric, Integer, String, DateTime, \
     ForeignKey, event, Text
from sqlalchemy.orm import scoped_session, sessionmaker, backref, relation
from sqlalchemy.ext.declarative import declarative_base

database = create_engine('sqlite:////Users/fred/messages.db')
db_session = scoped_session(sessionmaker(autocommit=False,
                                         autoflush=False,
                                         bind=database))

def init_db():
    Messages.metadata.create_all(bind=database)


Messages = declarative_base(name='Messages')
Messages.query = db_session.query_property()

class messages(Messages):
    __tablename__ = 'messages'
    id=Column(Integer, primary_key=True)
    # ACARS or VDLM
    type=Column('type', String(32))
    # message time
    message_time=Column('message_time', Numeric)
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


def add_message(message):
    db_session.add(message)
    db_session.commit()

init_db()
