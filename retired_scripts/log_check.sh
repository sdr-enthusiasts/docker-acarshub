#!/usr/bin/with-contenv bash
#shellcheck shell=bash

# Script to trim the log files down

# Number of lines that will trigger a cull
MAX_LINES=1000
# Number of lines that the log should have at the end
TARGET_LINES=500
ACARS_PATH="/run/acars/acars.json"
VDLM_PATH="/run/acars/vdlm.json"

# create semaphore file to keep the process from starting
touch /run/acars/stoprun.job

if [[ -f "/run/acars/acars.json" ]]; then
    total_lines_acars=$(wc -l < $ACARS_PATH)

    if (( total_lines_acars >= MAX_LINES )); then
        # Log file too large
        # Kill acarsdec if started
        if pgrep -x 'acarsdec' > /dev/null
        then
            echo "[logcheck] Stopping ACARS"
            ps aux | pgrep -x 'acarsdec' | xargs kill
        fi

        echo "[logcheck] Trimming acars.json"
        num_lines_to_trim_acars=$((total_lines_acars - TARGET_LINES))
        sed -i "1,${num_lines_to_trim_acars}d" $ACARS_PATH
    fi
fi

if [[ -f $VDLM_PATH ]]; then
    total_lines_vdlm=$(wc -l < $VDLM_PATH)

    if (( total_lines_vdlm >= MAX_LINES )); then
        # Log file too large
        # Kill vdlmdec if started
        if pgrep -x 'vdlm2dec' > /dev/null
        then
            echo "[logcheck] Stopping VDLM"
            ps aux | pgrep -x 'vdlm2dec' | xargs kill
        fi

        echo "[logcheck] Trimming vdlm.json"
        num_lines_to_trim_vdlm=$((total_lines_vdlm - TARGET_LINES))
        sed -i "1,${num_lines_to_trim_vdlm}d" $VDLM_PATH
    fi
fi

# remove the semaphore
rm /run/acars/stoprun.job
