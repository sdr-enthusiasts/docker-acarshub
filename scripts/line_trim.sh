#!/usr/bin/with-contenv bash
#shellcheck shell=bash

total_lines=$(wc -l /run/acars/vdlm.json | awk '/[0-9]+/{print $1}')

if [ $total_lines > 200 ]; then
	let lines_to_delete=total_lines-199
    sed -n "${lines_to_delete},${total_lines}p" /run/acars/acars.json > /run/acars/acars_adjusted.txt
fi

total_lines_vdlm=$(wc -l /run/acars/vdlm.json | awk '/[0-9]+/{print $1}')

if [ $total_lines_vdlm > 200 ]; then
	let lines_to_delete_vdlm=total_lines_vdlm-199
    sed -n "${lines_to_delete_vdlm},${total_lines_vdlm}p" /run/acars/vdlm.json > /run/acars/vdlm_adjusted.txt
fi