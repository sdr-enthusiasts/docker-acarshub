#!/usr/bin/with-contenv bash
#shellcheck shell=bash

let aggregate_files=0

if [ -f "/run/acars/acars.json" ]; then
    total_lines=$(wc -l /run/acars/acars.json | awk '/[0-9]+/{print $1}')

    if (( $total_lines > 200 )); then
       let lines_to_delete=total_lines-199
       sed -n "${lines_to_delete},${total_lines}p" /run/acars/acars.json > /run/acars/acars_adjusted.txt
       awk '{a[i++]=$0}END{for(j=i-1;j>=0;j--)print a[j];}' /run/acars/acars_adjusted.txt > /run/acars/acars_sorted.txt
       rm /run/acars/acars_adjusted.txt
    fi

    let aggregate_files=1
fi

if [ -f "/run/acars/vdlm.json" ]; then
    total_lines_vdlm=$(wc -l /run/acars/vdlm.json | awk '/[0-9]+/{print $1}')

    if (( $total_lines_vdlm > 200 )); then
    	let lines_to_delete_vdlm=total_lines_vdlm-199
        sed -n "${lines_to_delete_vdlm},${total_lines_vdlm}p" /run/acars/vdlm.json > /run/acars/vdlm_adjusted.txt
        awk '{a[i++]=$0}END{for(j=i-1;j>=0;j--)print a[j];}' /run/acars/vdlm_adjusted.txt > /run/acars/vdlm_sorted.txt
        rm /run/acars/vdlm_adjusted.txt
    fi

    let aggregate_files+=1

fi

if (( $aggregate_files > 1 )); then
    cat /run/acars/vdlm_sorted.txt /run/acars/acars_sorted.txt > /run/acars/display.txt
    sort -V /run/acars/display.txt > /run/acars/display_sorted.txt
    rm /run/acars/vdlm_sorted.txt
    rm /run/acars/acars_sorted.txt
    rm /run/acars/display.txt

    total_lines_agg=$(wc -l /run/acars/display_sorted.txt | awk '/[0-9]+/{print $1}')

    if (( $total_lines_agg > 200 )); then
       let lines_to_delete=total_lines_agg-199
       sed -n "${lines_to_delete},${total_lines}p" /run/acars/display_sorted.txt > /run/acars/display_adjusted.txt
       awk '{a[i++]=$0}END{for(j=i-1;j>=0;j--)print a[j];}' /run/acars/display_adjusted.txt > /var/www/html/display.json
       rm /run/acars/display_adjusted.txt
       rm /run/acars/display_sorted.txt
    else
       mv /run/acars/display_sorted.txt /var/www/html/display.json
    fi

elif [ -f "/run/acars/vdlm.json" ]; then
    mv /run/acars/vdlm_sorted.txt /var/www/html/display.json
elif [ -f "/run/acars/acars.json" ]; then
    mv /run/acars/acars_sorted.txt /var/www/html/display.json
fi