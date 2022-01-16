#!/usr/bin/env python3

import json
import os


def format_acars_message(acars_message):
    if "vdl2" in acars_message:
        return format_dumpvdl2_message(acars_message)
    else:
        return acars_message


def formated_dumpvdl2_level(unformatted_level):
    import math

    truncated = str(math.trunc((10.0 ** 1) * unformatted_level) / (10.0 ** 1))

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
                            vdlm2_message["lat"] = str(position["lat"])
                        if "lon" in position:
                            vdlm2_message["lon"] = str(position["lon"])
                        if "alt" in item["value"]:
                            vdlm2_message["alt"] = str(item["value"]["alt"])
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

    return vdlm2_message


if __name__ == "__main__":
    import json

    try:
        # FIXME to not have hard coded
        f = open("/Users/fred/single_message.txt")

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
        print(f"error: {e}")
