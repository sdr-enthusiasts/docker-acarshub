#!/usr/bin/with-contenv bash
#shellcheck shell=bash

# Script to trim the log files down
# Arbitrarily picked 10000 lines as the upper limit.
# Trim half away. I could do maths to only get 5000 lines
# But I figure removing the first 4999 lines is good enough.
# I don't know why

if [ -f "/run/acars/acars.json" ]; then
	total_lines=$(wc -l /run/acars/acars.json | awk '/[0-9]+/{print $1}')

	if (( $total_lines > 10000 )); then
		echo "Trimming acars.json"
	    sed -i "5000,${total_lines}p" /run/acars/acars.json
	fi
fi

if [ -f "/run/acars/vdlm.json" ]; then
	total_lines_vdlm=$(wc -l /run/acars/vdlm.json | awk '/[0-9]+/{print $1}')

	if (( $total_lines_vdlm > 10000 )); then
	   echo "Trimming vdlm.json"
 	   sed -i "5000,${total_lines_vdlm}p" /run/acars/vdlm.json
	fi
fi