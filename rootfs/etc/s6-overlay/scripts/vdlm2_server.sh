#!/command/with-contenv bash
#shellcheck shell=bash

# Source ACARS common functions
# shellcheck disable=SC1091
# shellcheck source=/scripts/acars_common
source /scripts/acars_common

if chk_enabled "${ENABLE_VDLM}"; then

    set -o pipefail

    if true || [[ $((MIN_LOG_LEVEL)) -ge 4 ]]; then
        # shellcheck disable=SC2016
        echo "Starting service" | stdbuf -oL awk '{print "[vdlm2_server] " strftime("%Y/%m/%d %H:%M:%S", systime()) " " $0}'
    fi

    set -e

    # Listen for the output of vdlm2dec (UDP), and make it available for multiple processes at TCP port 15555
    # shellcheck disable=SC2016
    {
        socat -T 60 -u udp-listen:5555,fork,reuseaddr stdout | {
            cat
            kill -s INT 0
        } |
            ncat -4 --keep-open --listen 0.0.0.0 15555 | {
            cat
            kill -s INT 0
        }
    } 2>&1 | stdbuf -oL awk '{print "[vdlm2_server] " strftime("%Y/%m/%d %H:%M:%S", systime()) " " $0}'

else
    sleep 86400
fi
