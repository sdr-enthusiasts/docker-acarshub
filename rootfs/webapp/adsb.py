from itsdangerous import exc
import pyModeS as pms
from pyModeS.extra.tcpclient import TcpClient

lat_ref = 35.18808
lon_ref = -106.56953


class ADSBClient(TcpClient):
    def __init__(self, host, port, rawtype):
        super(ADSBClient, self).__init__(host, port, rawtype)

    def handle_messages(self, messages):
        for msg, ts in messages:
            if len(msg) != 28:  # wrong data length
                continue

            df = pms.df(msg)

            if df != 17:  # not ADSB
                continue

            if pms.crc(msg) != 0:  # CRC fail
                continue

            icao = pms.adsb.icao(msg)
            tc = pms.adsb.typecode(msg)

            try:
                speed = pms.adsb.speed_heading(
                    msg
                )  # Handles both surface & airborne messages
            except:
                speed = None

            try:
                velocity = pms.adsb.velocity(
                    msg
                )  # Handles both surface & airborne messages
            except:
                velocity = None

            try:
                alt = pms.adsb.altitude(msg)
            except Exception:
                alt = None

            try:
                lat, lon = pms.adsb.position_with_ref(msg, lat_ref, lon_ref)
            except Exception:
                lat, lon = None, None

            # TODO: write you magic code here
            print(ts, icao, tc, alt, lat, lon, speed, velocity)


# run new client, change the host, port, and rawtype if needed
client = ADSBClient(host="192.168.31.212", port=30005, rawtype="beast")
client.run()
