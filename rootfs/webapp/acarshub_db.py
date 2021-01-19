#!/usr/bin/env python3

from sqlalchemy import create_engine, Column, Integer, String, \
    Text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
import os
from sqlalchemy.ext.declarative import DeclarativeMeta
import json
import urllib.request
import acarshub_error

# Download station IDs

try:
    print("[database] Downloading Station IDs")
    with urllib.request.urlopen("https://raw.githubusercontent.com/airframesio/data/master/json/vdl/ground-stations.json") as url:
        groundStations = json.loads(url.read().decode())
    print("[database] Completed downloading Station IDs")
except Exception as e:
    acarshub_error.acars_traceback(e, "database")

# Load Message Labels

try:
    print("[database] Loading message labels")
    with open('data/labels.json') as text:
        message_labels = json.load(text)
    print("[database] Completed loading message labels")
except Exception as e:
    acarshub_error.acars_traceback(e, "database")

# DB PATH MUST BE FROM ROOT

if os.getenv("ACARSHUB_DB"):
    db_path = os.getenv("ACARSHUB_DB", default=False)
else:
    db_path = 'sqlite:////run/acars/messages.db'

database = create_engine(db_path)
db_session = sessionmaker(bind=database)
Messages = declarative_base()

overrides = {}
freqs = []

airlines_database = create_engine('sqlite:///data/airlines.db')
airlines_db_session = sessionmaker(bind=airlines_database)
Airlines = declarative_base()

# Set up the override IATA/ICAO callsigns
# Input format needs to be IATA|ICAO|Airline Name
# Multiple overrides need to be separated with a ;

if os.getenv("IATA_OVERRIDE", default=False):
    iata_override = os.getenv("IATA_OVERRIDE").split(";")

    for item in iata_override:
        override_splits = item.split('|')
        if(len(override_splits) == 3):
            overrides[override_splits[0]] = (override_splits[1], override_splits[2])
        else:
            print(f"[database] error adding in {item} to IATA overrides")

# Grab the freqs

if os.getenv("ENABLE_ACARS", default=False):
    acars_freqs = os.getenv("FREQS_ACARS").split(";")

    for item in acars_freqs:
        freqs.append(("ACARS", item))

if os.getenv("ENABLE_VDLM", default=False):
    vdlm_freqs = os.getenv("FREQS_VDLM").split(";")

    for item in vdlm_freqs:
        freqs.append(("VDL-M2", item))


class messagesFreq(Messages):
    __tablename__ = 'freqs'
    it = Column(Integer, primary_key=True)
    freq = Column('freq', String(32))
    freq_type = Column('freq_type', String(32))
    count = Column('count', Integer)


class messagesCount(Messages):
    __tablename__ = 'count'
    id = Column(Integer, primary_key=True)
    total = Column('total', Integer)
    errors = Column('errors', Integer)
    good = Column('good', Integer)


class messagesCountDropped(Messages):
    __tablename__ = 'nonlogged_count'
    id = Column(Integer, primary_key=True)
    nonlogged_errors = Column('errors', Integer)
    nonlogged_good = Column('good', Integer)


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

# Class used to convert any search query objects to JSON


class AlchemyEncoder(json.JSONEncoder):

    def default(self, obj):
        if isinstance(obj.__class__, DeclarativeMeta):
            # an SQLAlchemy class
            fields = {}
            for field in [x for x in dir(obj) if not x.startswith('_') and x != 'metadata']:
                data = obj.__getattribute__(field)
                try:
                    json.dumps(data)  # this will fail on non-encodable values, like other classes
                    fields[field] = data
                except TypeError:
                    fields[field] = None
            # a json-encodable dict
            return fields

        return json.JSONEncoder.default(self, obj)


def add_message_from_json(message_type, message_from_json):
    import os
    global database
    import json
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
            try:
                libacars = json.dumps(message_from_json[index])
            except Exception as e:
                acarshub_error.acars_traceback(e, "database")
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

    try:
        session = db_session()

        found_freq = session.query(messagesFreq).filter(messagesFreq.freq == f"{freq}" and messagesFreq.freq_type == message_type).first()

        if found_freq is not None:
            found_freq.count += 1
        else:
            session.add(messagesFreq(freq=f"{freq}", freq_type=message_type, count=1))

        if os.getenv("DB_SAVEALL", default=False) or text is not None or libacars is not None or \
           dsta is not None or depa is not None or eta is not None or gtout is not None or \
           gtin is not None or wloff is not None or wlin is not None or lat is not None or \
           lon is not None or alt is not None:

            # write the message
            if os.getenv("DEBUG_LOGGING", default=False):
                print("[database] writing to the database")
                print(f"[database] writing message: {message_from_json}")

            session.add(messages(message_type=message_type, time=time, station_id=station_id, toaddr=toaddr,
                                 fromaddr=fromaddr, depa=depa, dsta=dsta, eta=eta, gtout=gtout, gtin=gtin,
                                 wloff=wloff, wlin=wlin, lat=lat, lon=lon, alt=alt, text=text, tail=tail,
                                 flight=flight, icao=icao, freq=freq, ack=ack, mode=mode, label=label, block_id=block_id,
                                 msgno=msgno, is_response=is_response, is_onground=is_onground, error=error, libacars=libacars))
        elif os.getenv("DEBUG_LOGGING", default=False):
            print(f"[database] discarding no text message: {message_from_json}")

        # Now lets decide where to log the message count to

        if text is not None or libacars is not None or \
           dsta is not None or depa is not None or eta is not None or gtout is not None or \
           gtin is not None or wloff is not None or wlin is not None or lat is not None or \
           lon is not None or alt is not None:

            count = session.query(messagesCount).first()
            count.total += 1

            if error is not None and error > 0:
                count.errors += 1
            else:
                count.good += 1

        else:
            count = session.query(messagesCountDropped).first()

            if error is not None and error > 0:
                count.nonlogged_errors += 1
            else:
                count.nonlogged_good += 1

        # commit the db change and close the session
        session.commit()
        session.close()

        if os.getenv("DEBUG_LOGGING", default=False):
            print("[database] write to database complete")
    except Exception as e:
        acarshub_error.acars_traceback(e, "database")


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
        acarshub_error.acars_traceback(e, "database")


def find_airline_code_from_iata(iata):
    import os
    result = None

    if iata in overrides:
        return overrides[iata]

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
    result = None

    try:
        if os.getenv("DEBUG_LOGGING", default=False):
            print(f"[database] Searching database for {search_term} in {field}")
        session = db_session()
        if field == "flight-iata":
            result = session.query(messages).filter(messages.flight.contains(search_term)).order_by(messages.time.desc())
        elif field == "tail":
            result = session.query(messages).filter(messages.tail.contains(search_term)).order_by(messages.time.desc())
        elif field == "depa":
            result = result = session.query(messages).filter(messages.depa.contains(search_term)).order_by(messages.time.desc())
        elif field == "dsta":
            result = session.query(messages).filter(messages.dsta.contains(search_term)).order_by(messages.time.desc())
        elif field == "text":
            result = session.query(messages).filter(messages.text.contains(search_term)).order_by(messages.time.desc())
        elif field == "msgno":
            result = session.query(messages).filter(messages.msgno.contains(search_term)).order_by(messages.time.desc())
        session.close()
    except Exception:
        print("[database] Error running search!")

    if os.getenv("DEBUG_LOGGING", default=False):
        print("[database] Done searching")

    if result.count() > 0:
        data = [json.dumps(d, cls=AlchemyEncoder) for d in result[page:page + 50]]
        return [data, result.count()]
    else:
        return [None, 50]


def show_all(page=0):
    result = None

    try:
        session = db_session()
        result = session.query(messages).order_by(messages.time.desc())
        session.close()
    except Exception as e:
        traceback = e.__traceback__
        print('[database] An error has occurred: ' + str(e))
        while traceback:
            print("{}: {}".format(traceback.tb_frame.f_code.co_filename, traceback.tb_lineno))
            traceback = traceback.tb_next

    if result.count() > 0:
        data = [json.dumps(d, cls=AlchemyEncoder) for d in result[page:page + 50]]
        return [data, result.count()]
    else:
        return [None, 50]


def get_freq_count():
    result = None
    freq_count = []
    found_freq = []

    # output: freq_count.append(f"{f[0]}|{f[1]}|{result}")

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

            result = session.query(messagesFreq).filter(messagesFreq.freq).filter(messagesFreq.freq == freq and messagesFreq.freq_type == f[0]).first()

            if(result is not None):
                freq_count.append({'freq_type': f"{result.freq_type}", 'freq': f"{result.freq}", 'count': result.count})
                found_freq.append(freq)
            else:
                freq_count.append({'freq_type': f"{f[0]}", 'freq': f"{f[1]}", 'count': 0})

        for item in session.query(messagesFreq).all():
            if item.freq not in found_freq:
                freq_count.append({'freq_type': f"{item.freq_type}", 'freq': f"{item.freq}", 'count': item.count})

        session.close()

        return sorted(freq_count, reverse=True, key=lambda freq: (freq['freq_type'], freq['count']))

    except Exception as e:
        acarshub_error.acars_traceback(e, "database")


def get_errors_direct():
    try:
        session = db_session()
        total_messages = session.query(messages).count()
        total_errors = session.query(messages).filter(messages.error != "0").count()
        session.close()

        return (total_messages, total_errors)

    except Exception as e:
        acarshub_error.acars_traceback(e, "database")


def get_errors():
    try:
        session = db_session()
        count = session.query(messagesCount).first()
        nonlogged = session.query(messagesCountDropped).first()
        session.close()

        return (count.total, count.errors, nonlogged.nonlogged_good, nonlogged.nonlogged_errors)

    except Exception as e:
        acarshub_error.acars_traceback(e, "database")


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
            acarshub_error.acars_traceback(e, "database")
            size = None

        return (result, size)
    except Exception as e:
        acarshub_error.acars_traceback(e, "database")


def grab_most_recent():
    from sqlalchemy import desc
    try:
        session = db_session()
        result = session.query(messages).order_by(desc('time')).limit(20)

        if result.count() > 0:
            return [json.dumps(d, cls=AlchemyEncoder) for d in result]
        else:
            return None
    except Exception as e:
        acarshub_error.acars_traceback(e, "database")


def lookup_groundstation(lookup_id):
    for i in range(len(groundStations['ground_stations'])):
        if 'id' in groundStations['ground_stations'][i]:
            if groundStations['ground_stations'][i]['id'] == lookup_id:
                return (groundStations['ground_stations'][i]['airport']['icao'], groundStations['ground_stations'][i]['airport']['name'])

    return (None, None)


def lookup_label(label):
    for i in range(len(message_labels)):
        if 'Code' in message_labels[i]:
            if message_labels[i]['Code'] == label:
                return message_labels[i]['Message Type']
    print(f"[database] Unknown message label: {label}")
    return None


# We will pre-populate the count table if this is a new db
# Or the user doesn't have the table already


try:
    total_messages, total_errors = get_errors_direct()
    good_msgs = total_messages - total_errors
    session = db_session()

    if session.query(messagesCount).count() == 0:
        print("[database] Initializing count database")
        session.add(messagesCount(total=total_messages, errors=total_errors, good=good_msgs))
        session.commit()
        print("[database] Count database initialized")

    if session.query(messagesCountDropped).count() == 0:
        print("[database] Initializing dropped count database")
        session.add(messagesCountDropped(nonlogged_good=0, nonlogged_errors=0))
        session.commit()
        print("[database] Dropped count database initialized")

    # now we pre-populate the freq db if empty

    if session.query(messagesFreq).count() == 0:
        print("[database] Initializing freq database")
        found_freq = {}
        for item in session.query(messages).all():
            if item.freq not in found_freq:
                found_freq[item.freq] = [item.freq, item.message_type, session.query(messages).filter(messages.freq == item.freq).count()]

        for item in found_freq:
            session.add(messagesFreq(freq=found_freq[item][0], count=found_freq[item][2], freq_type=found_freq[item][1]))
        session.commit()
        print("[database] Freq database initialized")

    session.close()
except Exception as e:
    acarshub_error.acars_traceback(e, "database")
