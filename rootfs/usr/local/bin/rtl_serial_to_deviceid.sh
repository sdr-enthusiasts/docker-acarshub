#!/usr/bin/env bash

function print_usage() {
    log "Usage:"
    log "  -s, --serial <serial>  RTL-SDR serial number to resolve to device ID"
    log "  -v, --verbose          Verbose logging"
    log "  -h, --help             Displays this usage info"
}

function log_verbose() {
    if [[ -n "$LOG_VERBOSE" ]]; then >&2 echo "$1"; fi
}

function log () {
    >&2 echo "$1"
}

# ===== MAIN SCRIPT =====

# If no arguments given, print help
if [[ "$#" -eq 0 ]]; then
    print_usage
    exit 1
fi

# Handle command line arguments
while [[ "$1" =~ ^- && ! "$1" == "--" ]]; do
    case $1 in
        -v | --verbose )
            LOG_VERBOSE=1
            ;;
        -s | --serial )
            shift; ARGS_SERIAL="$1"
            ;;
        -h | --help )
            print_usage
            exit
            ;;
    esac
    shift
done
if [[ "$1" == '--' ]]; then shift; fi

# Ensure we've been passed a serial
if [[ -z "$ARGS_SERIAL" ]]; then
    log "ERROR: RTL-SDR device serial required!"
    exit 1
fi

# Get list of rtl-sdr device IDs
RTL_DEVICES=$(rtl_eeprom 2>&1 | grep -P '^\s+\d+:' | tr -d ' ' | cut -d ':' -f 1)

# Resolve each number into serial numbers
for RTL_DEVICE_NUMBER in $RTL_DEVICES; do

    # Attempt to get serial of device
    RTL_SERIAL=$(rtl_eeprom -d "$RTL_DEVICE_NUMBER" 2>&1 | grep 'Serial number:' | tr -d '\t' | tr -d ' ' | cut -d ':' -f 2)

    # Log a warning if we can't find the serial
    if [[ -z "$RTL_SERIAL" ]]; then
        log_verbose "WARNING: Could not determine serial for device $RTL_DEVICE_NUMBER. The device may be in use."
        continue
    fi

    # See if we've found the device we're looking for
    if [[ "$ARGS_SERIAL" == "$RTL_SERIAL" ]]; then
        log_verbose "Serial '$ARGS_SERIAL' resolves to device ID $RTL_DEVICE_NUMBER"
        OUTPUT_DEVICE_ID="$RTL_DEVICE_NUMBER"
    fi

done

# Return result or error
if [[ -n "$OUTPUT_DEVICE_ID" ]]; then
    echo "$OUTPUT_DEVICE_ID"
    exit 0
else
    log "ERROR: Could not map serial '$ARGS_SERIAL' to an RTL-SDR device number."
    exit 1
fi
