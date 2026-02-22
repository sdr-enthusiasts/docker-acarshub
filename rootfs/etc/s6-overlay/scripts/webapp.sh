#!/command/with-contenv bash
#shellcheck shell=bash

if [[ ${ENABLE_WEB,,} =~ true ]]; then
    if [[ $((MIN_LOG_LEVEL)) -ge 4 ]]; then
        # shellcheck disable=SC2016
        echo "Starting web service (Node.js)" | stdbuf -oL awk '{print "[webapp      ] " strftime("%Y/%m/%d %H:%M:%S", systime()) " " $0}'
    fi

    cd /backend || exit 1

    # shellcheck disable=SC2016
    stdbuf -oL node dist/server.js 2>&1 |
        stdbuf -oL awk '{print "[webapp      ] " strftime("%Y/%m/%d %H:%M:%S", systime()) " " $0}'
else
    # web server must be disabled. Go to sleep forever
    sleep 86400
fi
