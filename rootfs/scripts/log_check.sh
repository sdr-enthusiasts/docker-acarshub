#!/usr/bin/with-contenv bash
#shellcheck shell=bash

# Script to trim the log files down
# Arbitrarily picked 1000 lines as the upper limit.

MAX_LINES=1000

if [[ -f "/run/acars/acars.json" ]]; then
	total_lines_acars=$(wc -l < /run/acars/acars.json)

	if (( total_lines_acars > MAX_LINES )); then
		echo "Trimming acars.json"
		num_lines_to_trim_acars=$((total_lines_acars - MAX_LINES))
	    sed -i "1,${num_lines_to_trim_acars}d" /run/acars/acars.json
	fi
fi

if [[ -f "/run/acars/vdlm.json" ]]; then
	total_lines_vdlm=$(wc -l < /run/acars/vdlm.json)

	if (( total_lines_vdlm > MAX_LINES )); then
	   echo "Trimming vdlm.json"
	   num_lines_to_trim_vdlm=$((total_lines_vdlm - MAX_LINES))
 	   sed -i "1,${num_lines_to_trim_vdlm}!d" /run/acars/vdlm.json
	fi
fi
