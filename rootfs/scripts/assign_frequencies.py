#!/usr/bin/env python3
import sys
import argparse
from pprint import pprint

# place in javascript_msgs_threads

def is_frequency_assigned(output_dict, freq):
    for serial in output_dict.keys():
        if freq in output_dict[serial]:
            return True
    return False


def assign_freqs_to_serials(
    serials: list,
    freqs: list,
    bw: float = 2.0,    
):

    # order frequencies lowest to highest
    freqs.sort()

    # prepare output dictionary
    output = dict()
    
    # for each SDR serial...
    for serial in serials:

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
        help='List of SDR serial numbers',
        nargs='+',
        required=True,
    )

    parser.add_argument(
        '--freqs', '-f',
        type=float,
        help='List of frequencies in MHz',
        nargs='+',
        required=True,
    )

    args = parser.parse_args()
    print(args)

    output = assign_freqs_to_serials(
        serials=args.serials,
        freqs=args.freqs,
        bw=args.bandwidth,
        )

    # if any frequencies have not been assigned then error (leftover freqs)
    freqs_not_assigned = list()
    for freq in args.freqs:
        if not is_frequency_assigned(output, freq):
            freqs_not_assigned.append(freq)
    if len(freqs_not_assigned) > 0:
        log_str = "ERROR: frequencies not been assigned (insufficient SDRs): "
        for freq in freqs_not_assigned:
            log_str += str(freq)
            log_str += " "
        print(log_str[:len(log_str)-1], file=sys.stderr)
        sys.exit(1)

    # if output.keys() doesnt contain all of serials then error (leftover serials)
    serials_unused = list()
    for serial in args.serials:
        if serial not in output.keys():
            serials_unused.append(serial)
    if len(serials_unused) > 0:
        log_str = "ERROR: some SDRs are not required: "
        for serial in serials_unused:
            log_str += str(serial)
            log_str += " "
        print(log_str[:len(log_str)-1], file=sys.stderr)
        sys.exit(1)

    pprint(output)