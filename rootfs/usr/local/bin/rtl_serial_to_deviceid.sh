#!/usr/bin/env bash

function print_usage() {
    log "Usage:"
    log "  -s, --serial <serial>  RTL-SDR serial number to resolve to device ID"
    log "  -f, --fail             Failes (exit 1) if device is not free"
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
        -f | --fail )
            FAIL_IF_DEVICE_NOT_FREE=1
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

# Get rtl_test output
RTL_TEST_OUTPUT=$(timeout 1s rtl_test -d 0 2>&1 | grep -P '^\s+\d+:\s+\S+?,\s+\S+?,\s+SN:\s+\S+?\s*$' || true)
IFS=$'\n'
for RTL_TEST_OUTPUT_LINE in $RTL_TEST_OUTPUT; do
  
  # Unset variables in case any regexes fail
  unset RTL_DEVICE_ID RTL_DEVICE_MAKE RTL_DEVICE_MODEL RTL_DEVICE_SERIAL

  # Pull variables from output via regex
  RTL_DEVICE_NUMBER=$(echo "$RTL_TEST_OUTPUT_LINE" | grep -oP '^\s+\K\d+(?=:\s+\S+?,\s+\S+?,\s+SN:\s+\S+?\s*$)')
  # RTL_DEVICE_MAKE=$(echo "$RTL_TEST_OUTPUT_LINE" | grep -oP '^\s+\d+:\s+\K\S+?(?=,\s+\S+?,\s+SN:\s+\S+?\s*$)')
  # RTL_DEVICE_MODEL=$(echo "$RTL_TEST_OUTPUT_LINE" | grep -oP '^\s+\d+:\s+\S+?,\s+\K\S+?(?=,\s+SN:\s+\S+?\s*$)')
  RTL_DEVICE_SERIAL=$(echo "$RTL_TEST_OUTPUT_LINE" | grep -oP '^\s+\d+:\s+\S+?,\s+\S+?,\s+SN:\s+\K\S+?(?=\s*$)')

  # See if we've found the device we're looking for
  if [[ "$ARGS_SERIAL" == "$RTL_DEVICE_SERIAL" ]]; then
      log_verbose "Serial '$ARGS_SERIAL' resolves to device ID $RTL_DEVICE_NUMBER"
      OUTPUT_DEVICE_ID="$RTL_DEVICE_NUMBER"
  fi

done

# Return result or error
if [[ -n "$OUTPUT_DEVICE_ID" ]]; then
    echo "$OUTPUT_DEVICE_ID"

    # Test if the device is free
    if ! rtl_eeprom -d "$OUTPUT_DEVICE_ID" > /dev/null 2>&1; then

      # Fail if device in use and requested
      if [[ -n "$FAIL_IF_DEVICE_NOT_FREE" ]]; then
        log "ERROR: The device is in use"
        exit 1
      else
        log "WARNING: The device is in use"
        exit 0
      fi
    
    # Exit ok if device is free
    else
      exit 0
    fi

else
    log "ERROR: Could not map serial '$ARGS_SERIAL' to an RTL-SDR device number."
    exit 1
fi
