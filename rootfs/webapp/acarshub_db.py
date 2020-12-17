#!/usr/bin/env python3

from sqlalchemy import Column, String, Integer, Date, Numeric

class messages(Base):
    __tablename__ = 'messages'
    id=Column(Integer, primary_key=True)
    # ACARS or VDLM
    type=Column('type', String(32))
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
    text=Column('text', String(2500))
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
    