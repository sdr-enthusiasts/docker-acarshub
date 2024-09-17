#!/usr/bin/env python3

# # Copyright (C) 2022-2024 Frederick Clausen II
# This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
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

from datetime import datetime, timezone
import json


def format_acars_message(acars_message):
    if "vdl2" in acars_message:
        return format_dumpvdl2_message(acars_message)

    if "hfdl" in acars_message:
        return format_hfdl_message(acars_message)

    if acars_message.get("source", {}).get("app", {}).get("name") == "SatDump":
        if acars_message.get("msg_name") == "ACARS":
            return format_satdump_imsl_message(acars_message)
        else:
            return None

    if acars_message.get("app", {}).get("name") == "JAERO":
        return format_jaero_imsl_message(acars_message)

    if acars_message.get("app", {}).get("name") == "iridium-toolkit":
        return format_irdm_message(acars_message)

    return acars_message


def count_errors(unformatted_message):
    total_errors = 0
    for key, value in unformatted_message.items():
        if type(value) is dict:
            total_errors += count_errors(value)
        else:
            if key == "err" and value:
                total_errors += 1
    return total_errors


def irdm_channelize_freq(freq):
    base = 1616e6
    chwid = 10e6/(30*8)
    offs = freq - base
    return base + chwid * round(offs/chwid)


def format_irdm_message(unformatted_message):
    irdm_message = dict()

    if freq := unformatted_message.get("freq"):
        irdm_message["freq"] = f"{irdm_channelize_freq(float(freq))/1e6:.6f}"

    if level := unformatted_message.get("level"):
        irdm_message["level"] = f"{level:.1f}"

    if source := unformatted_message.get("source"):
        if station_id := source.get("station_id"):
            irdm_message["station_id"] = station_id

    if acars := unformatted_message.get("acars"):
        if timestamp := acars.get("timestamp"):
            irdm_message["timestamp"] = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()

        if errors := acars.get("errors"):
            irdm_message["error"] = errors

        if block_end := acars.get("block_end"):
            irdm_message["end"] = block_end

        if mode := acars.get("mode"):
            irdm_message["mode"] = mode

        if tail := acars.get("tail"):
            irdm_message["tail"] = tail

        if flight := acars.get("flight"):
            irdm_message["flight"] = flight

        if label := acars.get("label"):
            irdm_message["label"] = label

        if block_id := acars.get("block_id"):
            irdm_message["block_id"] = block_id

        if message_number := acars.get("message_number"):
            irdm_message["msgno"] = message_number

        if ack := acars.get("ack"):
            irdm_message["ack"] = ack

        if text := acars.get("text"):
            irdm_message["text"] = text

    return irdm_message


def format_jaero_imsl_message(unformatted_message):
    imsl_message = dict()

    imsl_message["error"] = count_errors(unformatted_message)

    if t := unformatted_message.get("t"):
        if sec := t.get("sec"):
            imsl_message["timestamp"] = sec

    if station := unformatted_message.get("station"):
        imsl_message["station_id"] = station

    if isu := unformatted_message.get("isu"):
        if acars := isu.get("acars"):
            if msg_text := acars.get("msg_text"):
                imsl_message["text"] = msg_text

            if arinc622 := acars.get("arinc622"):
                imsl_message["libacars"] = json.dumps(arinc622)
                if gs_addr := arinc622.get("gs_addr"):
                    imsl_message["fromaddr_decoded"] = gs_addr

            if ack := acars.get("ack"):
                imsl_message["ack"] = ack

            if blk_id := acars.get("blk_id"):
                imsl_message["block_id"] = blk_id

            if label := acars.get("label"):
                imsl_message["label"] = label

            if mode := acars.get("mode"):
                imsl_message["mode"] = mode

            if reg := acars.get("reg"):
                imsl_message["tail"] = reg

        if dst := isu.get("dst"):
            if addr := dst.get("addr"):
                imsl_message["toaddr"] = int(addr, 16)
                imsl_message["icao"] = int(addr, 16)

        if src := isu.get("src"):
            if addr := src.get("addr"):
                imsl_message["fromaddr"] = addr

        if refno := isu.get("refno"):
            imsl_message["msgno"] = str(refno)

    return imsl_message


def format_satdump_imsl_message(unformatted_message):
    imsl_message = dict()

    if timestamp := unformatted_message.get("timestamp"):
        imsl_message["timestamp"] = timestamp

    if station_id := unformatted_message.get("source", {}).get("station_id"):
        imsl_message["station_id"] = station_id

    if freq := unformatted_message.get("freq"):
        imsl_message["freq"] = freq

    if level := unformatted_message.get("level"):
        imsl_message["level"] = level

    imsl_message["error"] = count_errors(unformatted_message)

    if mode := unformatted_message.get("mode"):
        imsl_message["mode"] = mode

    if label := unformatted_message.get("label"):
        imsl_message["label"] = label.replace("\x7f", "d")

    if bi := unformatted_message.get("bi"):
        imsl_message["block_id"] = bi

    if message := unformatted_message.get("message"):
        imsl_message["text"] = message

    if more_to_come := unformatted_message.get("more_to_come"):
        imsl_message["end"] = not more_to_come

    if plane_reg := unformatted_message.get("plane_reg"):
        imsl_message["tail"] = plane_reg.replace(".", "")

    if tak := unformatted_message.get("tak"):
        imsl_message["ack"] = chr(tak).replace(chr(0x15), "!")

    if libacars := unformatted_message.get("libacars"):
        imsl_message["libacars"] = json.dumps(libacars)

    if flight := unformatted_message.get("flight"):
        imsl_message["flight"] = flight

    if fromaddr_decoded := unformatted_message.get("fromaddr_decoded"):
        imsl_message["fromaddr_decoded"] = fromaddr_decoded

    if sigunit := unformatted_message.get("signal_unit"):
        if aes_id := sigunit.get("aes_id"):
            imsl_message["toaddr"] = aes_id
            imsl_message["icao"] = aes_id
        if ges_id := sigunit.get("ges_id"):
            imsl_message["fromaddr"] = ges_id
        if ref_no := sigunit.get("ref_no"):
            imsl_message["msgno"] = str(ref_no)

    return imsl_message


def format_hfdl_freq(unformatted_freq):
    # input is in Hz
    # output is in MHz
    output = float(unformatted_freq) / 1000000.0

    # normalize to 3 decimal places
    truncated = str(int(output * 1000) / 1000)

    if str.endswith(truncated, "0"):
        truncated = truncated[:-2]

    return truncated


def format_hfdl_message(unformatted_message):
    hfdl_message = dict()
    libacars = dict()

    # timestamp
    hfdl_message["timestamp"] = unformatted_message["hfdl"]["t"]["sec"]
    # station
    if "station" in unformatted_message["hfdl"]:
        hfdl_message["station_id"] = unformatted_message["hfdl"]["station"]

    # error
    # walk the entire message and look for err fields. Count the total of trues
    hfdl_message["error"] = count_errors(unformatted_message["hfdl"])

    # freq
    if "freq" in unformatted_message["hfdl"]:
        hfdl_message["freq"] = format_hfdl_freq(unformatted_message["hfdl"]["freq"])

    # level
    if "sig_level" in unformatted_message["hfdl"]:
        hfdl_message["level"] = formated_dumpvdl2_level(
            unformatted_message["hfdl"]["sig_level"]
        )

    if "spdu" in unformatted_message["hfdl"]:
        libacars["spdu"] = unformatted_message["hfdl"]["spdu"]

    if "lpdu" in unformatted_message["hfdl"]:
        # toaddr
        if "dst" in unformatted_message["hfdl"]["lpdu"]:
            if "addr" in unformatted_message["hfdl"]["lpdu"]["dst"]:
                hfdl_message["toaddr"] = int(
                    unformatted_message["hfdl"]["lpdu"]["dst"]["addr"], 16
                )
        # fromaddr
        if "src" in unformatted_message["hfdl"]["lpdu"]:
            if "addr" in unformatted_message["hfdl"]["lpdu"]["src"]:
                hfdl_message["fromaddr"] = int(
                    unformatted_message["hfdl"]["lpdu"]["src"]["addr"], 16
                )
        # icao
        if "ac_info" in unformatted_message["hfdl"]["lpdu"]:
            if "icao" in unformatted_message["hfdl"]["lpdu"]["ac_info"]:
                hfdl_message["icao"] = int(
                    unformatted_message["hfdl"]["lpdu"]["ac_info"]["icao"], 16
                )

        if "hfnpdu" in unformatted_message["hfdl"]["lpdu"]:
            # flight
            if "flight_id" in unformatted_message["hfdl"]["lpdu"]["hfnpdu"]:
                hfdl_message["flight"] = unformatted_message["hfdl"]["lpdu"]["hfnpdu"][
                    "flight_id"
                ]
            # lat
            # lon
            if "pos" in unformatted_message["hfdl"]["lpdu"]["hfnpdu"]:
                position = unformatted_message["hfdl"]["lpdu"]["hfnpdu"]["pos"]
                if "lat" in position:
                    hfdl_message["lat"] = float(position["lat"])
                if "lon" in position:
                    hfdl_message["lon"] = float(position["lon"])
            if "freq_data" in unformatted_message["hfdl"]["lpdu"]["hfnpdu"]:
                # use libacars to dump the JSON
                libacars["freq_data"] = unformatted_message["hfdl"]["lpdu"]["hfnpdu"][
                    "freq_data"
                ]
            if "acars" in unformatted_message["hfdl"]["lpdu"]["hfnpdu"]:
                # ack
                if "ack" in unformatted_message["hfdl"]["lpdu"]["hfnpdu"]["acars"]:
                    hfdl_message["ack"] = unformatted_message["hfdl"]["lpdu"]["hfnpdu"][
                        "acars"
                    ]["ack"]
                # tail
                if "reg" in unformatted_message["hfdl"]["lpdu"]["hfnpdu"]["acars"]:
                    hfdl_message["tail"] = unformatted_message["hfdl"]["lpdu"][
                        "hfnpdu"
                    ]["acars"]["reg"].replace(".", "")
                # label
                if "label" in unformatted_message["hfdl"]["lpdu"]["hfnpdu"]["acars"]:
                    hfdl_message["label"] = str(
                        unformatted_message["hfdl"]["lpdu"]["hfnpdu"]["acars"]["label"]
                    )
                # block_id
                if "blk_id" in unformatted_message["hfdl"]["lpdu"]["hfnpdu"]["acars"]:
                    hfdl_message["block_id"] = unformatted_message["hfdl"]["lpdu"][
                        "hfnpdu"
                    ]["acars"]["blk_id"]
                # msgno
                if "msg_num" in unformatted_message["hfdl"]["lpdu"]["hfnpdu"]["acars"]:
                    hfdl_message["msgno"] = unformatted_message["hfdl"]["lpdu"][
                        "hfnpdu"
                    ]["acars"]["msg_num"]
                    if (
                        "msg_num_seq"
                        in unformatted_message["hfdl"]["lpdu"]["hfnpdu"]["acars"]
                    ):
                        hfdl_message["msgno"] = (
                            hfdl_message["msgno"]
                            + unformatted_message["hfdl"]["lpdu"]["hfnpdu"]["acars"][
                                "msg_num_seq"
                            ]
                        )
                # mode
                if "mode" in unformatted_message["hfdl"]["lpdu"]["hfnpdu"]["acars"]:
                    hfdl_message["mode"] = unformatted_message["hfdl"]["lpdu"][
                        "hfnpdu"
                    ]["acars"]["mode"]
                # text
                if "msg_text" in unformatted_message["hfdl"]["lpdu"]["hfnpdu"]["acars"]:
                    hfdl_message["text"] = unformatted_message["hfdl"]["lpdu"][
                        "hfnpdu"
                    ]["acars"]["msg_text"]

                # libacars
                # use the arinc622 field, dumped as JSON
                if "arinc622" in unformatted_message["hfdl"]["lpdu"]["hfnpdu"]["acars"]:
                    libacars["arinc622"] = unformatted_message["hfdl"]["lpdu"][
                        "hfnpdu"
                    ]["acars"]["arinc622"]
    if len(libacars) > 0:
        hfdl_message["libacars"] = json.dumps(libacars)

    # depa
    # dsta
    # eta
    # gtout
    # gtin
    # wloff
    # wlin

    # alt
    # data

    # is_response
    # is_onground

    return hfdl_message


def formated_dumpvdl2_level(unformatted_level):
    import math

    truncated = str(math.trunc((10.0**1) * unformatted_level) / (10.0**1))

    if str.endswith(truncated, "0"):
        truncated = truncated[:-2]

    return float(truncated)


def reformat_dumpvdl2_freq(unformatted_freq):
    formatted_freq = (
        str(unformatted_freq)[:3] + "." + str(unformatted_freq)[3:].rstrip("0")
    )

    if len(formatted_freq) == 4:
        formatted_freq = formatted_freq + "0"

    return float(formatted_freq)


def format_dumpvdl2_message(unformatted_message):
    vdlm2_message = dict()

    vdlm2_message["timestamp"] = unformatted_message["vdl2"]["t"]["sec"]
    if "station" in unformatted_message["vdl2"]:
        vdlm2_message["station_id"] = unformatted_message["vdl2"]["station"]
    if "addr" in unformatted_message["vdl2"]["avlc"]["dst"]:
        vdlm2_message["toaddr"] = int(
            unformatted_message["vdl2"]["avlc"]["dst"]["addr"], 16
        )
    if "addr" in unformatted_message["vdl2"]["avlc"]["src"]:
        vdlm2_message["fromaddr"] = int(
            unformatted_message["vdl2"]["avlc"]["src"]["addr"], 16
        )
    # depa = Column('depa', String(32), index=True, nullable=False)
    # eta = Column('eta', String(32), nullable=False)
    # gtout = Column('gtout', String(32), nullable=False)
    # gtin = Column('gtin', String(32), nullable=False)
    # wloff = Column('wloff', String(32), nullable=False)
    # wlin = Column('wlin', String(32), nullable=False)
    if "xid" in unformatted_message["vdl2"]["avlc"]:
        if "vdl_params" in unformatted_message["vdl2"]["avlc"]["xid"]:
            for item in unformatted_message["vdl2"]["avlc"]["xid"]["vdl_params"]:
                if type(item) is dict:
                    if "name" in item and item["name"] == "dst_airport":
                        vdlm2_message["dsta"] = item["value"]
                        # lat = Column('lat', String(32), nullable=False)
                        # lon = Column('lon', String(32), nullable=False)
                        # alt = Column('alt', String(32), nullable=False)
                    elif "name" in item and item["name"] == "ac_location":
                        position = item["value"]["loc"]
                        if "lat" in position:
                            vdlm2_message["lat"] = float(position["lat"])
                        if "lon" in position:
                            vdlm2_message["lon"] = float(position["lon"])
                        if "alt" in item["value"]:
                            vdlm2_message["alt"] = int(item["value"]["alt"])
    # text = Column('msg_text', Text, index=True, nullable=False)
    if (
        "acars" in unformatted_message["vdl2"]["avlc"]
        and "msg_text" in unformatted_message["vdl2"]["avlc"]["acars"]
    ):
        vdlm2_message["text"] = unformatted_message["vdl2"]["avlc"]["acars"]["msg_text"]
    # tail = Column('tail', String(32), index=True, nullable=False)
    if (
        "acars" in unformatted_message["vdl2"]["avlc"]
        and "reg" in unformatted_message["vdl2"]["avlc"]["acars"]
    ):
        vdlm2_message["tail"] = unformatted_message["vdl2"]["avlc"]["acars"][
            "reg"
        ].replace(".", "")
    # flight = Column('flight', String(32), index=True, nullable=False)
    if (
        "acars" in unformatted_message["vdl2"]["avlc"]
        and "flight" in unformatted_message["vdl2"]["avlc"]["acars"]
    ):
        vdlm2_message["flight"] = unformatted_message["vdl2"]["avlc"]["acars"]["flight"]
    # icao = Column('icao', String(32), index=True, nullable=False)
    if (
        "src" in unformatted_message["vdl2"]["avlc"]
        and "addr" in unformatted_message["vdl2"]["avlc"]["src"]
        and unformatted_message["vdl2"]["avlc"]["src"]["type"] == "Aircraft"
    ):
        vdlm2_message["icao"] = int(
            unformatted_message["vdl2"]["avlc"]["src"]["addr"], 16
        )
    # freq = Column('freq', String(32), index=True, nullable=False)
    if "freq" in unformatted_message["vdl2"]:
        vdlm2_message["freq"] = reformat_dumpvdl2_freq(
            unformatted_message["vdl2"]["freq"]
        )
    # ack = Column('ack', String(32), nullable=False)
    if (
        "acars" in unformatted_message["vdl2"]["avlc"]
        and "ack" in unformatted_message["vdl2"]["avlc"]["acars"]
    ):
        vdlm2_message["ack"] = unformatted_message["vdl2"]["avlc"]["acars"]["ack"]
    # mode = Column('mode', String(32), nullable=False)
    if (
        "acars" in unformatted_message["vdl2"]["avlc"]
        and "mode" in unformatted_message["vdl2"]["avlc"]["acars"]
    ):
        vdlm2_message["mode"] = unformatted_message["vdl2"]["avlc"]["acars"]["mode"]
    # label = Column('label', String(32), index=True, nullable=False)
    if (
        "acars" in unformatted_message["vdl2"]["avlc"]
        and "label" in unformatted_message["vdl2"]["avlc"]["acars"]
    ):
        vdlm2_message["label"] = str(
            unformatted_message["vdl2"]["avlc"]["acars"]["label"]
        )
    # block_id = Column('block_id', String(32), nullable=False)
    if (
        "acars" in unformatted_message["vdl2"]["avlc"]
        and "blk_id" in unformatted_message["vdl2"]["avlc"]["acars"]
    ):
        vdlm2_message["block_id"] = unformatted_message["vdl2"]["avlc"]["acars"][
            "blk_id"
        ]
    # msgno = Column('msgno', String(32), index=True, nullable=False)
    if (
        "acars" in unformatted_message["vdl2"]["avlc"]
        and "msg_num" in unformatted_message["vdl2"]["avlc"]["acars"]
    ):
        vdlm2_message["msgno"] = unformatted_message["vdl2"]["avlc"]["acars"]["msg_num"]
        if "msg_num_seq" in unformatted_message["vdl2"]["avlc"]["acars"]:
            vdlm2_message["msgno"] = (
                vdlm2_message["msgno"]
                + unformatted_message["vdl2"]["avlc"]["acars"]["msg_num_seq"]
            )
    # is_response = Column('is_response', String(32), nullable=False)
    if (
        "cr" in unformatted_message["vdl2"]["avlc"]
        and unformatted_message["vdl2"]["avlc"]["cr"] == "Response"
    ):
        vdlm2_message["is_response"] = 1
    # is_onground = Column('is_onground', String(32), nullable=False)
    if (
        "src" in unformatted_message["vdl2"]["avlc"]
        and "addr" in unformatted_message["vdl2"]["avlc"]["src"]
        and unformatted_message["vdl2"]["avlc"]["src"]["type"] == "Aircraft"
    ):
        vdlm2_message["is_onground"] = (
            0
            if unformatted_message["vdl2"]["avlc"]["src"]["status"] == "Airborne"
            else 2
        )
    # error = Column('error', String(32), nullable=False)
    if "hdr_bits_fixed" in unformatted_message["vdl2"]:
        vdlm2_message["error"] = unformatted_message["vdl2"]["hdr_bits_fixed"]
    # level = Column('level', String(32), nullable=False)
    if "sig_level" in unformatted_message["vdl2"]:
        vdlm2_message["level"] = formated_dumpvdl2_level(
            unformatted_message["vdl2"]["sig_level"]
        )

    if "acars" in unformatted_message["vdl2"]["avlc"]:
        # libacars
        # use the arinc622 field, dumped as JSON
        if "arinc622" in unformatted_message["vdl2"]["avlc"]["acars"]:
            vdlm2_message["libacars"] = json.dumps(
                unformatted_message["vdl2"]["avlc"]["acars"]["arinc622"]
            )

    return vdlm2_message


if __name__ == "__main__":
    try:
        import sys
        import os
        import acarshub_logging

        if len(sys.argv) < 2:
            sys.exit("Usage: %s <message file>" % sys.argv[0])

        # make sure the message file exists
        if not os.path.isfile(sys.argv[1]):
            sys.exit("File %s does not exist" % sys.argv[1])

        f = open(sys.argv[1], "r")

        for data in f:
            message_json = []
            if data.count("}\n") == 1:
                message_json.append(data)
            elif data.count("}\n") == 0 and data.count("}{") == 0:
                message_json.append(data + "\n")
            elif data.count("}{") > 0:
                split_json = data.split("}{")
                count = 0
                for j in split_json:
                    if len(j) > 1:
                        msg = j
                        if not msg.startswith("{"):
                            msg = "{" + msg
                        if not count == len(split_json) - 1:
                            msg = msg + "}"
                        message_json.append(msg)
                        count += 1
            print(len(message_json))
            for msg in message_json:
                try:
                    vdlm2_message = format_acars_message(json.loads(msg))
                except Exception as e:
                    print(e)
                    print(msg)
                print(vdlm2_message)

    except Exception as e:
        acarshub_logging.acars_traceback(e, "acars_formatter")
