#!/usr/bin/with-contenv bash
#shellcheck shell=bash

## This entire file feels like a poor shell scripting joke you'd fine online
# If you are reading this, yes, I am aware this can be done better
# If I knew how, I'd have done it :)
# It does what I want it to, so that is something

# This file creates the output for the webpage to display
# The goal here is to take the JSON files that acarsdec and vdlm2dec generate
# trim those files down for the website to a manageable number of entries
# aggregate vdlm and acars together
# and trim that down, too

# variable to track how many files were found
aggregate_files=0

# Check to see if ACARS is writing a file
if [[ -f "/run/acars/acars.json" ]]; then
    total_lines=$(wc -l /run/acars/acars.json | awk '/[0-9]+/{print $1}')

    # If file is more that 200 lines, generate a temp file of the last 200 entries (aka most recent)
    # Then, reverse the sorting so most recent is at the top
    if (( total_lines > 200 )); then
       lines_to_delete=$((total_lines - 199))
       sed -n "${lines_to_delete},${total_lines}p" /run/acars/acars.json > /run/acars/acars_adjusted.txt
       awk '{a[i++]=$0}END{for(j=i-1;j>=0;j--)print a[j];}' /run/acars/acars_adjusted.txt > /run/acars/acars_sorted.txt
       rm /run/acars/acars_adjusted.txt
    else
      awk '{a[i++]=$0}END{for(j=i-1;j>=0;j--)print a[j];}' /run/acars/acars.json > /run/acars/acars_sorted.txt
    fi

    aggregate_files=$((aggregate_files + 1))
fi

# Same as above, but with VDLM
if [[ -f "/run/acars/vdlm.json" ]]; then
    total_lines_vdlm=$(wc -l /run/acars/vdlm.json | awk '/[0-9]+/{print $1}')

    # If file is more that 200 lines, generate a temp file of the last 200 entries (aka most recent)
    # Then, reverse the sorting so most recent is at the top
    if (( total_lines_vdlm > 200 )); then
    	lines_to_delete_vdlm=$((total_lines_vdlm - 199))
        sed -n "${lines_to_delete_vdlm},${total_lines_vdlm}p" /run/acars/vdlm.json > /run/acars/vdlm_adjusted.txt
        awk '{a[i++]=$0}END{for(j=i-1;j>=0;j--)print a[j];}' /run/acars/vdlm_adjusted.txt > /run/acars/vdlm_sorted.txt
        rm /run/acars/vdlm_adjusted.txt
    else
      awk '{a[i++]=$0}END{for(j=i-1;j>=0;j--)print a[j];}' /run/acars/vdlm.json > /run/acars/vdlm_sorted.txt
    fi

    aggregate_files=$((aggregate_files + 1))
fi

# Now we process for display.json
# If both VDLM and ACARS are processed, we'll combine the files
if (( aggregate_files > 1 )); then
    # combine the files
    cat /run/acars/vdlm_sorted.txt /run/acars/acars_sorted.txt > /run/acars/display.txt
    # sort them by date stamp 
    sort -V /run/acars/display.txt > /run/acars/display_sorted.txt 
    
    # clean up the trash
    rm /run/acars/vdlm_sorted.txt
    rm /run/acars/acars_sorted.txt
    rm /run/acars/display.txt

    # count total lines
    total_lines_agg=$(wc -l /run/acars/display_sorted.txt | awk '/[0-9]+/{print $1}')

    # probably have more than 200 lines
    # Lets trim that
    if (( total_lines_agg > 200 )); then
       lines_to_delete=$((total_lines_agg - 199))
       sed -n "${lines_to_delete},${total_lines}p" /run/acars/display_sorted.txt > /run/acars/display_adjusted.txt
       awk '{a[i++]=$0}END{for(j=i-1;j>=0;j--)print a[j];}' /run/acars/display_adjusted.txt > /var/www/html/display.json
       rm /run/acars/display_adjusted.txt
       rm /run/acars/display_sorted.txt
    else
       mv /run/acars/display_sorted.txt /var/www/html/display.json
    fi

elif [[ -f "/run/acars/vdlm.json" ]]; then
    mv /run/acars/vdlm_sorted.txt /var/www/html/display.json
elif [[ -f "/run/acars/acars.json" ]]; then
    mv /run/acars/acars_sorted.txt /var/www/html/display.json
fi