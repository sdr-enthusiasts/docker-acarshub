#!/usr/bin/with-contenv bash
#shellcheck shell=bash

# Script to trim the log files down
# Arbitrarily picked 1000 lines as the upper limit.

MAX_LINES=1000
ACARS_PATH="/run/acars/acars.json" &>/dev/null
VDLM_PATH="/run/acars/vdlm.json" &>/dev/null

# create semaphore file to keep the process from starting
touch /run/acars/stoprun.job

# kill the decoders



if pgrep -x 'acarsdec' > /dev/null
then
	echo "Stopping ACARS"
	ps aux | pgrep -x 'acarsdec' | xargs kill
fi

if pgrep -x 'vdlm2dec' > /dev/null
then
	echo "Stopping VDLM"
	ps aux | pgrep -x 'vdlm2dec' | xargs kill 
fi

if [[ -f "/run/acars/acars.json" ]]; then
	total_lines_acars=$(wc -l < $ACARS_PATH)

	if (( total_lines_acars > MAX_LINES )); then
		echo "Trimming acars.json"
		num_lines_to_trim_acars=$((total_lines_acars - MAX_LINES))
	    sed -i "1,${num_lines_to_trim_acars}d" $ACARS_PATH
	fi
fi

if [[ -f $VDLM_PATH ]]; then
	total_lines_vdlm=$(wc -l < $VDLM_PATH)

	if (( total_lines_vdlm > MAX_LINES )); then
	   echo "Trimming vdlm.json"
	   num_lines_to_trim_vdlm=$((total_lines_vdlm - MAX_LINES))
 	   sed -i "1,${num_lines_to_trim_vdlm}d" $VDLM_PATH
	fi
fi

# remove the semaphore
rm /run/acars/stoprun.job
