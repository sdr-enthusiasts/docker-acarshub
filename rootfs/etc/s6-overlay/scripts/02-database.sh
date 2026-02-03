#!/command/with-contenv bash
# shellcheck shell=bash

#shellcheck disable=SC2016
python3 /scripts/upgrade_db.py | stdbuf -oL awk '{print "[02-database ] " strftime("%Y/%m/%d %H:%M:%S", systime()) " " $0}' || exit 1
