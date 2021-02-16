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

def generate_output_files(serials, decoder, freqs_string):
    for serial in serials:
        freqs = ""

        for freq in serials[serial]:
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

        path = servicesd_path + f"{decoder}-" + splitSerial
        os.makedirs(path)
        shutil.copyfile(f"../etc/template/{decoder}/run", path + "/run")

        for line in fileinput.input(path + "/run", inplace=True):
            if line.find(f"FREQS_{freqs_string}=\"\"") == 0:
                print('{}{}{}'.format(f"FREQS_{freqs_string}=\"", freqs.strip(), "\"\n"), end='')
            elif line.find("SERIAL=\"\"") == 0:
                print('{}{}{}'.format("SERIAL=\"", splitSerial , "\"\n"), end='')
            elif splitPPM is not None and line.find("PPM=\"\"") == 0:
                print('{}{}{}'.format("PPM=\"", splitPPM, "\"\n"), end='')
            elif splitGain is not None and line.find("GAIN=\"\"") == 0:
                print('{}{}{}'.format("GAIN=\"", splitGain, "\"\n"), end='')
            else:
                print('{}'.format(line),end='')

        mode = os.stat(path + "/run").st_mode
        mode |= (mode & 0o444) >> 2    # copy R bits to X
        os.chmod(path + "/run", mode)


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
    #for item in [item for item in (results or [])]:
    for serial in [serial for serial in (serials or [])]:
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
            # casting to float just in case the input is a string...silly custom SDRs
            max_freq_for_serial = float(output[serial][0]) + bw
            if float(freq) > max_freq_for_serial:
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
        required=False,
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

    freqs_not_assigned = list()
    # if any frequencies have not been assigned then error (leftover freqs)
    # but make sure we're not potentially in a legacy mode
    if len(output_acars) > 0 or len(output_vdlm) > 0:
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
    for serial in [serial for serial in (args.serials or [])]:
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

    generate_output_files(serials=output_vdlm, decoder="vdlm2dec", freqs_string="VDLM")
    generate_output_files(serials=output_acars, decoder="acarsdec", freqs_string="ACARS")

    index = 0

    # loop through custom
    # input format:       ACARS_indexnumber=serial,ppm,gain
    # input format freqs: ACARS_FREQ_indexnumber=freq1;freq2

    while True:
        if os.getenv(f"ACARS_{index}", default=False) and os.getenv(f"ACARS_FREQ_{index}", default=False):
            acars_freqs = os.getenv(f"ACARS_FREQ_{index}").split(";")
            acars_custom = assign_freqs_to_serials(
                serials=os.getenv(f"ACARS_{index}").split(","),
                freqs=acars_freqs,
                bw=args.bandwidth,
                serials_used=[],
                )

            generate_output_files(serials=acars_custom, decoder="acarsdec", freqs_string="ACARS")
            index += 1
        else:
            break

    index = 0

    while True:
        if os.getenv(f"VDLM_{index}", default=False) and os.getenv(f"VDLM_FREQ_{index}", default=False):
            vdlm_freqs = os.getenv(f"VDLM_FREQ_{index}").split(";")
            vdlm_custom = assign_freqs_to_serials(
                serials=os.getenv(f"VDLM_{index}").split(","),
                freqs=vdlm_freqs,
                bw=args.bandwidth,
                serials_used=[],
                )

            generate_output_files(serials=vdlm_custom, decoder="vdlm2dec", freqs_string="VDLM")
            index += 1
        else:
            break

    # Okay, lets test for depricated SERIAL_ACARS/SERIAL_VDLM
    if os.getenv("SERIAL_ACARS", default=False):
        old_serial = os.getenv("SERIAL_ACARS")

        if os.getenv("ACARS_PPM", default=False):
            old_serial += "," + os.getenv("ACARS_PPM")
        else:
            old_serial += ","

        if os.getenv("GAIN_ACARS", default=False):
            old_serial += "," + os.getenv("GAIN_ACARS")
        elif os.getenv("GAIN", default=False):
            old_serial += "," + os.getenv("GAIN")

        serial_acars = [old_serial]
        print(serial_acars)
        acars = assign_freqs_to_serials(
                serials=serial_acars,
                freqs=args.freqs_acars,
                bw=args.bandwidth,
                serials_used=[],
                )
        generate_output_files(serials=acars, decoder="acarsdec", freqs_string="ACARS")

    if os.getenv("SERIAL_VDLM", default=False):
        old_serial = os.getenv("SERIAL_VDLM")

        if os.getenv("VDLM_PPM", default=False):
            old_serial += "," + os.getenv("VDLM_PPM")
        else:
            old_serial += ","

        if os.getenv("GAIN_VDLM", default=False):
            old_serial += "," + os.getenv("GAIN_VDLM")
        elif os.getenv("GAIN", default=False):
            old_serial += "," + os.getenv("GAIN")

        serial_vdlm = [old_serial]

        vdlm = assign_freqs_to_serials(
                serials=serial_vdlm,
                freqs=args.freqs_vdlm,
                bw=args.bandwidth,
                serials_used=[],
                )
        generate_output_files(serials=vdlm, decoder="vdlm2dec", freqs_string="VDLM")

    pprint(output_acars)
    pprint(output_vdlm)