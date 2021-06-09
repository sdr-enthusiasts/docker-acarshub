import pyModeS as pms
from pyModeS.extra.tcpclient import TcpClient
import acarshub_helpers
import os
import time
import sys
from threading import Thread
import signal
import traceback
import zmq
import socket


class ADSBClient(TcpClient):
    lat_ref = 35.18808
    lon_ref = -106.56953

    def __init__(self, host, port, rawtype):
        super(ADSBClient, self).__init__(host, port, rawtype)
        self.tracked_planes = {}
        self.decoder = Decode()
        self.reset_local_buffer()
        self.do_work = True

    def reset_local_buffer(self):
        self.local_buffer_adsb_msg = []
        self.local_buffer_adsb_ts = []
        self.local_buffer_commb_msg = []
        self.local_buffer_commb_ts = []

    # overriding the library method to properly exit the program...sigh
    def run(self):
        self.connect()
        while self.do_work:
            try:
                received = [i for i in self.socket.recv(4096)]

                self.buffer.extend(received)
                # print(''.join(x.encode('hex') for x in self.buffer))

                if self.datatype == "beast":
                    messages = self.read_beast_buffer()
                elif self.datatype == "raw":
                    messages = self.read_raw_buffer()
                elif self.datatype == "skysense":
                    messages = self.read_skysense_buffer()

                if not messages:
                    continue
                else:
                    self.handle_messages(messages)

                # raise RuntimeError("test exception")

            except zmq.error.Again:
                continue
            except Exception as e:
                tb = traceback.format_exc()
                if self.exception_queue is not None:
                    self.exception_queue.put(tb)
                raise e
        return

    # overriding the parent method to correctly terminate the socket
    def stop(self):
        self.do_work = False
        self.socket.disconnect("tcp://%s:%s" % (self.host, self.port))

    def get_aircraft(self):
        return self.decoder.get_aircraft()

    def handle_messages(self, messages):
        if self.do_work:
            for msg, t in messages:
                if len(msg) < 28:  # only process long messages
                    continue

                df = pms.df(msg)

                if df == 17 or df == 18:
                    self.local_buffer_adsb_msg.append(msg)
                    self.local_buffer_adsb_ts.append(t)
                elif df == 20 or df == 21:
                    self.local_buffer_commb_msg.append(msg)
                    self.local_buffer_commb_ts.append(t)
                else:
                    continue

            if len(self.local_buffer_adsb_msg) > 1:
                self.decoder.process_raw(
                    adsb_ts=self.local_buffer_adsb_ts,
                    adsb_msg=self.local_buffer_adsb_msg,
                    commb_ts=self.local_buffer_commb_ts,
                    commb_msg=self.local_buffer_commb_msg,
                )
                self.reset_local_buffer()


class Decode:
    def __init__(self, latlon=None, dumpto=None):

        self.acs = dict()

        if latlon is not None:
            self.lat0 = float(latlon[0])
            self.lon0 = float(latlon[1])
        else:
            self.lat0 = None
            self.lon0 = None

        self.t = 0
        self.cache_timeout = 60  # seconds

        if dumpto is not None and os.path.isdir(dumpto):
            self.dumpto = dumpto
        else:
            self.dumpto = None

    def process_raw(self, adsb_ts, adsb_msg, commb_ts, commb_msg, tnow=None):
        """process a chunk of adsb and commb messages received in the same
        time period.
        """
        if tnow is None:
            tnow = time.time()

        self.t = tnow

        local_updated_acs_buffer = []

        # process adsb message
        for t, msg in zip(adsb_ts, adsb_msg):
            icao = pms.icao(msg)
            tc = pms.adsb.typecode(msg)

            if icao not in self.acs:
                self.acs[icao] = {
                    "live": None,
                    "call": None,
                    "lat": None,
                    "lon": None,
                    "alt": None,
                    "gs": None,
                    "trk": None,
                    "roc": None,
                    "tas": None,
                    "roll": None,
                    "rtrk": None,
                    "ias": None,
                    "mach": None,
                    "hdg": None,
                    "ver": None,
                    "HPL": None,
                    "RCu": None,
                    "RCv": None,
                    "HVE": None,
                    "VVE": None,
                    "Rc": None,
                    "VPL": None,
                    "EPU": None,
                    "VEPU": None,
                    "HFOMr": None,
                    "VFOMr": None,
                    "PE_RCu": None,
                    "PE_VPL": None,
                }

            self.acs[icao]["t"] = t
            self.acs[icao]["live"] = int(t)

            if 1 <= tc <= 4:
                cs = pms.adsb.callsign(msg)
                self.acs[icao]["call"] = cs

            if (5 <= tc <= 8) or (tc == 19):
                try:  # catch a bug in the upstream library
                    vdata = pms.adsb.velocity(msg)
                except Exception as e:
                    vdata = None
                if vdata is None:
                    continue

                spd, trk, roc, tag = vdata
                if tag != "GS":
                    continue
                if (spd is None) or (trk is None):
                    continue

                self.acs[icao]["gs"] = spd
                self.acs[icao]["trk"] = trk
                self.acs[icao]["roc"] = roc
                self.acs[icao]["tv"] = t

            if 5 <= tc <= 18:
                oe = pms.adsb.oe_flag(msg)
                self.acs[icao][oe] = msg
                self.acs[icao]["t" + str(oe)] = t

                if ("tpos" in self.acs[icao]) and (t - self.acs[icao]["tpos"] < 180):
                    # use single message decoding
                    rlat = self.acs[icao]["lat"]
                    rlon = self.acs[icao]["lon"]
                    latlon = pms.adsb.position_with_ref(msg, rlat, rlon)
                elif (
                    ("t0" in self.acs[icao])
                    and ("t1" in self.acs[icao])
                    and (abs(self.acs[icao]["t0"] - self.acs[icao]["t1"]) < 10)
                ):
                    # use multi message decoding
                    try:
                        latlon = pms.adsb.position(
                            self.acs[icao][0],
                            self.acs[icao][1],
                            self.acs[icao]["t0"],
                            self.acs[icao]["t1"],
                            self.lat0,
                            self.lon0,
                        )
                    except:
                        # mix of surface and airborne position message
                        continue
                else:
                    latlon = None

                if latlon is not None:
                    self.acs[icao]["tpos"] = t
                    self.acs[icao]["lat"] = latlon[0]
                    self.acs[icao]["lon"] = latlon[1]

                    alt = pms.adsb.altitude(msg)
                    self.acs[icao]["alt"] = alt

                    local_updated_acs_buffer.append(icao)

            # Uncertainty & accuracy
            ac = self.acs[icao]

            if 9 <= tc <= 18:
                ac["nic_bc"] = pms.adsb.nic_b(msg)

            if (5 <= tc <= 8) or (9 <= tc <= 18) or (20 <= tc <= 22):
                ac["HPL"], ac["RCu"], ac["RCv"] = pms.adsb.nuc_p(msg)

                if (ac["ver"] == 1) and ("nic_s" in ac.keys()):
                    ac["Rc"], ac["VPL"] = pms.adsb.nic_v1(msg, ac["nic_s"])
                elif (
                    (ac["ver"] == 2)
                    and ("nic_a" in ac.keys())
                    and ("nic_bc" in ac.keys())
                ):
                    ac["Rc"] = pms.adsb.nic_v2(msg, ac["nic_a"], ac["nic_bc"])

            if tc == 19:
                ac["HVE"], ac["VVE"] = pms.adsb.nuc_v(msg)
                if ac["ver"] in [1, 2]:
                    ac["HFOMr"], ac["VFOMr"] = pms.adsb.nac_v(msg)

            if tc == 29:
                ac["PE_RCu"], ac["PE_VPL"], ac["base"] = pms.adsb.sil(msg, ac["ver"])
                ac["EPU"], ac["VEPU"] = pms.adsb.nac_p(msg)

            if tc == 31:
                ac["ver"] = pms.adsb.version(msg)
                ac["EPU"], ac["VEPU"] = pms.adsb.nac_p(msg)
                ac["PE_RCu"], ac["PE_VPL"], ac["sil_base"] = pms.adsb.sil(
                    msg, ac["ver"]
                )

                if ac["ver"] == 1:
                    ac["nic_s"] = pms.adsb.nic_s(msg)
                elif ac["ver"] == 2:
                    ac["nic_a"], ac["nic_bc"] = pms.adsb.nic_a_c(msg)

        # process commb message
        for t, msg in zip(commb_ts, commb_msg):
            icao = pms.icao(msg)

            if icao not in self.acs:
                continue

            self.acs[icao]["live"] = int(t)

            bds = pms.bds.infer(msg)

            if bds == "BDS50":
                roll50 = pms.commb.roll50(msg)
                trk50 = pms.commb.trk50(msg)
                rtrk50 = pms.commb.rtrk50(msg)
                gs50 = pms.commb.gs50(msg)
                tas50 = pms.commb.tas50(msg)

                self.acs[icao]["t50"] = t
                if tas50:
                    self.acs[icao]["tas"] = tas50
                if roll50:
                    self.acs[icao]["roll"] = roll50
                if rtrk50:
                    self.acs[icao]["rtrk"] = rtrk50

            elif bds == "BDS60":
                ias60 = pms.commb.ias60(msg)
                hdg60 = pms.commb.hdg60(msg)
                mach60 = pms.commb.mach60(msg)
                roc60baro = pms.commb.vr60baro(msg)
                roc60ins = pms.commb.vr60ins(msg)

                if ias60 or hdg60 or mach60:
                    self.acs[icao]["t60"] = t
                if ias60:
                    self.acs[icao]["ias"] = ias60
                if hdg60:
                    self.acs[icao]["hdg"] = hdg60
                if mach60:
                    self.acs[icao]["mach"] = mach60

        # clear up old data
        for icao in list(self.acs.keys()):
            if self.t - self.acs[icao]["live"] > self.cache_timeout:
                del self.acs[icao]
                continue

        return

    def get_aircraft(self):
        """all aircraft that are stored in memory"""
        acs = self.acs
        return acs


class ADSB:
    def __init__(self):
        self.client = ADSBClient(
            host=acarshub_helpers.ADSB_URL,
            port=acarshub_helpers.ADSB_PORT,
            rawtype=acarshub_helpers.ADSB_TYPE,
        )
        self.do_work = True

    def run(self):
        if self.do_work:
            # run new client, change the host, port, and rawtype if needed
            if self.client is None:
                self.client = ADSBClient(
                    host=acarshub_helpers.ADSB_URL,
                    port=acarshub_helpers.ADSB_PORT,
                    rawtype=acarshub_helpers.ADSB_TYPE,
                )
            self.client.run()

    def stop(self):
        if self.client is not None:
            self.client.stop()
        self.do_work = False

    def get_aircraft(self):
        return self.client.get_aircraft()


class socket_listen:
    def __init__(self):
        self.do_work = True
        self.receiver = None

    def stop(self):
        self.do_work = False
        if self.receiver is not None:
            self.receiver.close()

    def run(self):
        import json

        global adsb_runner

        while self.do_work:
            try:
                self.receiver = socket.socket(
                    family=socket.AF_INET, type=socket.SOCK_STREAM
                )
                self.receiver.bind(("127.0.0.1", 29005))
                print("Waiting for connection")
                self.receiver.listen()
                (clientConnected, clientAddress) = self.receiver.accept()
                clientConnected.setblocking(0)
                clientConnected.settimeout(1)
                print("Connected")

                while True:
                    time.sleep(5)
                    clientConnected.send(
                        json.dumps(adsb_runner.get_aircraft()).encode() + b"\n"
                    )
            except Exception as e:
                print(e)
                self.receiver.close()
                time.sleep(5)

        print("exiting socket listener")
        self.receiver.close()


def closeall(signal, frame):
    # This function is garbage.............
    # It will error out with a thread issue I don't understand. In order to prevent shutdown issues
    # Using .join(1) on the thread to stop them from hanging program exit
    global adsb_runner
    global stop_flag
    global adsb_socket_thread
    global adsb_listener_socket
    global adsb_thread
    print("KeyboardInterrupt (ID: {}). Cleaning up...".format(signal))
    adsb_listener_socket.stop()
    adsb_socket_thread.join(1)
    adsb_runner.stop()
    adsb_thread.join(1)
    sys.exit(0)


adsb_runner = ADSB()
adsb_listener_socket = socket_listen()

if __name__ == "__main__":
    signal.signal(signal.SIGINT, closeall)

    adsb_thread = Thread(target=adsb_runner.run)
    adsb_thread.start()
    # adsb_thread.join()

    adsb_socket_thread = Thread(target=adsb_listener_socket.run)
    adsb_socket_thread.start()
    # adsb_socket_thread.join()
