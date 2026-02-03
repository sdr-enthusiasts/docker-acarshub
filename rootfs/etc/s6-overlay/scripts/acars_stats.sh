#!/command/with-contenv bash
#shellcheck shell=bash

# Source ACARS common functions
# shellcheck disable=SC1091
# shellcheck source=/scripts/acars_common
source /scripts/acars_common

if chk_enabled "${ENABLE_ACARS}"; then

    set -o pipefail

    # Require that acars_server is running
    if ! netstat -an | grep -P '^\s*tcp\s+\d+\s+\d+\s+0\.0\.0\.0:15550\s+(?>\d{1,3}\.{0,1}){4}:\*\s+LISTEN\s*$' >/dev/null; then
        if [[ $((MIN_LOG_LEVEL)) -ge 4 ]]; then
            # shellcheck disable=SC2016
            echo "Waiting for acars_server" | stdbuf -oL awk '{print "[acars_stats ] " strftime("%Y/%m/%d %H:%M:%S", systime()) " " $0}'
        fi
        sleep 1
        exit
    fi
    if [[ $((MIN_LOG_LEVEL)) -ge 4 ]]; then
        # shellcheck disable=SC2016
        echo "acars_server ready, starting service" | stdbuf -oL awk '{print "[acars_stats ] " strftime("%Y/%m/%d %H:%M:%S", systime()) " " $0}'
    fi

    # Start our stats loop
    while true; do

        # capture 5 mins of flows
        #timeout 300s socat -u TCP:127.0.0.1:15550 CREATE:/database/acars.past5min.json
        timeout --foreground 300s socat -u TCP:127.0.0.1:15550 CREATE:/database/acars.past5min.json 2>/dev/null || true

        # if the port isn't reachable, this file isn't created, either container is shutting down or acars_server isn't reachable
        # in both cases let's exit, if this should still be running it will be restarted
        if ! [[ -f /database/acars.past5min.json ]]; then
            exit
        fi

        # shellcheck disable=SC2016
        echo "$(sed 's/}{/}\n{/g' /database/acars.past5min.json | wc -l) ACARS messages received in last 5 mins" | stdbuf -oL awk '{print "[acars_stats ] " strftime("%Y/%m/%d %H:%M:%S", systime()) " " $0}'

        # rotate files keeping last 2 hours
        for i in {24..1}; do
            mv "/database/acars.$((i - 1)).json" "/database/acars.$i.json" >/dev/null 2>&1 || true
        done
        mv "/database/acars.past5min.json" "/database/acars.0.json" >/dev/null 2>&1 || true

    done

else
    # If here then VDLM2 is not enabled, sleep forever
    sleep 86400
fi
