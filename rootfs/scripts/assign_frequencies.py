#!/usr/bin/env python3
import sys
import os
import shutil
import argparse
import fileinput
from pprint import pprint

if os.getenv("SPAM", default=False):
    servicesd_path = "/Users/fred/services.d/"
else:
    servicesd_path = "/etc/services.d/"

# place in javascript_msgs_threads

def is_frequency_assigned(output_dict, freq):
    for serial in output_dict.keys():
        if freq in output_dict[serial]:
            return True
    return False


def assign_freqs_to_serials(
    serials: list,
    freqs: list,
    serials_used: list, 
    bw: float = 2.0, 
):

    # order frequencies lowest to highest
    freqs.sort()

    # prepare output dictionary
    output = dict()
    
    # for each SDR serial...
    for serial in serials:
        if serial in serials_used:
            continue
        # for each frequency...
        for freq in freqs:

            # ensure this serial not yet assigned
            if is_frequency_assigned(output, freq):
                # freq is already assigned move to next
                continue

            # if this is the first freq for this serial, prepare the list and put the first freq in
            if serial not in output.keys():
                output[serial] = list()
                output[serial].append(freq)
                continue    

            # ensure the current frequency is within bandwidth range
            max_freq_for_serial = output[serial][0] + bw
            if freq > max_freq_for_serial:
                # if frequency is outside frequency range for this serial, move on to next
                break
            else:
                # if frequency is inside frequency range...
                if len(output[serial]) >= 8:
                    # if we've already got 8 serials for this serial, then move to next
                    break
                else:
                    # add freq to serial
                    output[serial].append(freq)

    return output


if __name__ == "__main__":

    parser = argparse.ArgumentParser(description='Assign frequencies to SDRs')

    parser.add_argument(
        '--bandwidth', '-b',
        type=float,
        help='SDR bandwidth in MHz (default: 2.0)',
        default=2.0,
        )

    parser.add_argument(
        '--serials', '-s',
        type=str,
        help='List of SDR serial numbers with PPM and gain. Separate each item with a comma. For example:\nInput with PPM but no gain: 000001,2\nInput with just gain: 000001,,28.6\nInput with all three: 000001,2,28.6',
        nargs='+',
        required=True,
    )

    parser.add_argument(
        '--freqs-acars', '-a',
        type=float,
        help='List of frequencies for ACARS in MHz',
        nargs='+',
        required=False,
    )

    parser.add_argument(
        '--freqs-vdlm', '-v',
        type=float,
        help='List of frequencies for VDLM in MHz',
        nargs='+',
        required=False,
    )

    args = parser.parse_args()

    if args.freqs_acars:
        output_acars = assign_freqs_to_serials(
            serials=args.serials,
            freqs=args.freqs_acars,
            bw=args.bandwidth,
            serials_used=[],
            )
    else:
        output_acars = dict()

    acars_serials = []

    for serial in output_acars.keys():
        acars_serials.append(serial)

    if args.freqs_vdlm:
        output_vdlm = assign_freqs_to_serials(
            serials=args.serials,
            freqs=args.freqs_vdlm,
            bw=args.bandwidth,
            serials_used=acars_serials,
            )
    else:
        output_vdlm = dict()

#for item in [item for item in (results or [])]:
    # if any frequencies have not been assigned then error (leftover freqs)
    freqs_not_assigned = list()
    for freq in [freq for freq in (args.freqs_acars or [])]:
        if not is_frequency_assigned(output_acars, freq):
            freqs_not_assigned.append(freq)
    for freq in [freq for freq in (args.freqs_vdlm or [])]:
        if not is_frequency_assigned(output_vdlm, freq):
            freqs_not_assigned.append(freq)

    if len(freqs_not_assigned) > 0:
        log_str = "ERROR: frequencies not assigned (insufficient SDRs): "
        for freq in freqs_not_assigned:
            log_str += str(freq)
            log_str += " "
        print(log_str[:len(log_str)-1], file=sys.stderr)
        sys.exit(1)

    # if output.keys() doesnt contain all of serials then error (leftover serials)
    serials_unused = list()
    for serial in args.serials:
        if serial not in output_acars.keys() and serial not in output_vdlm.keys():
            serials_unused.append(serial)
    if len(serials_unused) > 0:
        log_str = "ERROR: SDRs are not required: "
        for serial in serials_unused:
            log_str += str(serial)
            log_str += " "
        print(log_str[:len(log_str)-1], file=sys.stderr)
        sys.exit(1)

    # Everything worked, lets create the startup files

    for serial in output_vdlm:
        freqs = ""

        for freq in output_vdlm[serial]:
            freqs += f" {freq}"

        serial_fields = serial.split(",")
        splitSerial = serial_fields[0]
        splitPPM = None
        splitGain = None
        if(len(serial_fields) == 2):
            splitPPM = serial_fields[1]
        elif(len(serial_fields) == 3):
            splitPPM = serial_fields[1]
            splitGain = serial_fields[2]

        path = servicesd_path + "vdlm2dec-" + splitSerial + "/"
        os.makedirs(path)
        shutil.copyfile("../etc/template/vdlm2dec/run", path + "run")

        for line in fileinput.input(path + "run", inplace=True):
            if line.find("FREQS_VDLM=\"\"") == 0:
                print('{}{}{}'.format("FREQS_VDLM=\"", freqs.strip(), "\"\n"), end='')
            elif line.find("SERIAL=\"\"") == 0:
                print('{}{}{}'.format("SERIAL=\"", splitSerial , "\"\n"), end='')
            elif splitPPM is not None and line.find("PPM=\"\"") == 0:
                print('{}{}{}'.format("PPM=\"", splitPPM, "\"\n"), end='')
            elif splitGain is not None and line.find("GAIN=\"\"") == 0:
                print('{}{}{}'.format("GAIN=\"", splitGain, "\"\n"), end='')
            else:
                print('{}'.format(line),end='')

    for serial in output_acars:
        freqs = ""

        for freq in output_acars[serial]:
            freqs += f" {freq}"

        serial_fields = serial.split(",")
        splitSerial = serial_fields[0]
        splitPPM = None
        splitGain = None
        if(len(serial_fields) == 2):
            splitPPM = serial_fields[1]
        elif(len(serial_fields) == 3):
            splitPPM = serial_fields[1]
            splitGain = serial_fields[2]

        path = servicesd_path + "acarsdec-" + splitSerial  + "/"
        os.makedirs(path)
        shutil.copyfile("../etc/template/acarsdec/run", path + "run")

        for line in fileinput.input(path + "run", inplace=True):
            if line.find("FREQS_ACARS=\"\"") == 0:
                print('{}{}{}'.format("FREQS_ACARS=\"", freqs.strip(), "\"\n"), end='')
            elif line.find("SERIAL=\"\"") == 0:
                print('{}{}{}'.format("SERIAL=\"", splitSerial , "\"\n"), end='')
            elif splitPPM is not None and line.find("PPM=\"\"") == 0:
                print('{}{}{}'.format("PPM=\"", splitPPM, "\"\n"), end='')
            elif splitGain is not None and line.find("GAIN=\"\"") == 0:
                print('{}{}{}'.format("GAIN=\"", splitGain, "\"\n"), end='')
            else:
                print('{}'.format(line),end='')

    pprint(output_acars)
    pprint(output_vdlm)