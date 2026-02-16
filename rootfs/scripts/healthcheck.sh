#!/command/with-contenv bash
# shellcheck shell=bash
#
# ACARS Hub Docker Healthcheck Script
#
# This script validates the health of all ACARS Hub components and is called by
# Docker's HEALTHCHECK mechanism (see Dockerfile).
#
# What it checks:
# 1. Decoder servers (ACARS, VDLM2, HFDL, IMSL, IRDM) - TCP listeners and connections
# 2. Stats collectors - socat processes feeding database JSON files
# 3. Message activity - validates actual message flow in past hour
# 4. Webapp - HTTP endpoint and Socket.IO availability
# 5. Service death tallies - abnormal process exits via s6-overlay
#
# Exit codes:
# 0 = HEALTHY   - All enabled services are running and processing messages
# 1 = UNHEALTHY - One or more services failed, or no message activity detected
#
# Note on message activity checks:
# Zero messages in the past hour will cause UNHEALTHY status. This is intentional
# and validates end-to-end data flow, not just service availability. In low-traffic
# areas, this may cause false alarms, but ensures the system is actually working.
#
# Conditional checks:
# Each decoder type (ENABLE_ACARS, ENABLE_VDLM, etc.) is only checked if enabled.
# Webapp checks only run if ENABLE_WEB is true.

# Import healthchecks-framework
# shellcheck disable=SC1091
source /opt/healthchecks-framework/healthchecks.sh

# Source ACARS common functions
# shellcheck disable=SC1091
# shellcheck source=/scripts/acars_common
source /scripts/acars_common

# Default original codes
EXITCODE=0

# ===== Check imsl_server, imsl_feeder, imsl_stats processes =====

if chk_enabled "${ENABLE_IRDM}"; then

    echo "==== Checking irdm_server ====="

    # Check irdm_server is listening for TCP on 127.0.0.1:15558
    irdm_pidof_irdm_tcp_server=$(pgrep -f 'ncat -4 --keep-open --listen 0.0.0.0 15558')
    if ! check_tcp4_socket_listening_for_pid "0.0.0.0" "15558" "${irdm_pidof_irdm_tcp_server}"; then
        echo "irdm_server TCP not listening on port 15558 (pid $irdm_pidof_irdm_tcp_server): UNHEALTHY"
        EXITCODE=1
    else
        echo "irdm_server TCP listening on port 15558 (pid $irdm_pidof_irdm_tcp_server): HEALTHY"
    fi

    if [[ ${ENABLE_WEB,,} =~ true ]]; then
        if ! netstat -anp | grep -P "tcp\s+\d+\s+\d+\s+127.0.0.1:[0-9]+\s+127.0.0.1:15558\s+ESTABLISHED\s+[0-9]+/python3" >/dev/null 2>&1; then
            echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15558 for python3 established: FAIL"
            echo "irdm_server TCP connected to python server on port 15558 (pid $irdm_pidof_irdm_tcp_server): UNHEALTHY"
            EXITCODE=1
        else
            echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15558 for python3 established: PASS"
            echo "irdm_server TCP connected to python server on port 15558: HEALTHY"
        fi
    fi

    echo "==== Checking irdm_stats ====="

    # Check irdm_stats:
    irdm_pidof_irdm_stats=$(pgrep -fx 'socat -u TCP:127.0.0.1:15558 CREATE:/database/irdm.past5min.json')

    # Ensure TCP connection to irdm_server at 127.0.0.1:15558
    if ! check_tcp4_connection_established_for_pid "127.0.0.1" "ANY" "127.0.0.1" "15558" "${irdm_pidof_irdm_stats}"; then
        echo "irdm_stats (pid $irdm_pidof_irdm_stats) not connected to irdm_server (pid $irdm_pidof_irdm_tcp_server) at 127.0.0.1:15558: UNHEALTHY"
        EXITCODE=1
    else
        echo "irdm_stats (pid $irdm_pidof_irdm_stats) connected to irdm_server (pid $irdm_pidof_irdm_tcp_server) at 127.0.0.1:15558: HEALTHY"
    fi

    echo "==== Check for IRDM activity ====="

    # Check for activity
    # read .json files, ensure messages received in past hour

    irdm_num_msgs_past_hour=$(find /database -type f -name 'irdm.*.json' -cmin -60 -exec cat {} \; | sed -e 's/}{/}\n{/g' | wc -l)
    if [[ "$irdm_num_msgs_past_hour" -gt 0 ]]; then
        echo "$irdm_num_msgs_past_hour IRDM messages received in past hour: HEALTHY"
    else
        echo "$irdm_num_msgs_past_hour IRDM messages received in past hour: UNHEALTHY"
        EXITCODE=1
    fi

fi

# ===== Check imsl_server, imsl_feeder, imsl_stats processes =====

if chk_enabled "${ENABLE_IMSL}"; then

    echo "==== Checking imsl_server ====="

    # Check imsl_server is listening for TCP on 127.0.0.1:15557
    imsl_pidof_imsl_tcp_server=$(pgrep -f 'ncat -4 --keep-open --listen 0.0.0.0 15557')
    if ! check_tcp4_socket_listening_for_pid "0.0.0.0" "15557" "${imsl_pidof_imsl_tcp_server}"; then
        echo "imsl_server TCP not listening on port 15557 (pid $imsl_pidof_imsl_tcp_server): UNHEALTHY"
        EXITCODE=1
    else
        echo "imsl_server TCP listening on port 15557 (pid $imsl_pidof_imsl_tcp_server): HEALTHY"
    fi

    if [[ ${ENABLE_WEB,,} =~ true ]]; then
        if ! netstat -anp | grep -P "tcp\s+\d+\s+\d+\s+127.0.0.1:[0-9]+\s+127.0.0.1:15557\s+ESTABLISHED\s+[0-9]+/python3" >/dev/null 2>&1; then
            echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15557 for python3 established: FAIL"
            echo "imsl_server TCP connected to python server on port 15557 (pid $imsl_pidof_imsl_tcp_server): UNHEALTHY"
            EXITCODE=1
        else
            echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15557 for python3 established: PASS"
            echo "imsl_server TCP connected to python server on port 15557: HEALTHY"
        fi
    fi

    echo "==== Checking imsl_stats ====="

    # Check imsl_stats:
    imsl_pidof_imsl_stats=$(pgrep -fx 'socat -u TCP:127.0.0.1:15557 CREATE:/database/imsl.past5min.json')

    # Ensure TCP connection to imsl_server at 127.0.0.1:15557
    if ! check_tcp4_connection_established_for_pid "127.0.0.1" "ANY" "127.0.0.1" "15557" "${imsl_pidof_imsl_stats}"; then
        echo "imsl_stats (pid $imsl_pidof_imsl_stats) not connected to imsl_server (pid $imsl_pidof_imsl_tcp_server) at 127.0.0.1:15557: UNHEALTHY"
        EXITCODE=1
    else
        echo "imsl_stats (pid $imsl_pidof_imsl_stats) connected to imsl_server (pid $imsl_pidof_imsl_tcp_server) at 127.0.0.1:15557: HEALTHY"
    fi

    echo "==== Check for IMSL activity ====="

    # Check for activity
    # read .json files, ensure messages received in past hour

    imsl_num_msgs_past_hour=$(find /database -type f -name 'imsl.*.json' -cmin -60 -exec cat {} \; | sed -e 's/}{/}\n{/g' | wc -l)
    if [[ "$imsl_num_msgs_past_hour" -gt 0 ]]; then
        echo "$imsl_num_msgs_past_hour IMSL messages received in past hour: HEALTHY"
    else
        echo "$imsl_num_msgs_past_hour IMSL messages received in past hour: UNHEALTHY"
        EXITCODE=1
    fi

fi

# ===== Check hfdl_server, hfdl_feeder, hfdl_stats processes =====

if chk_enabled "${ENABLE_HFDL}"; then

    echo "==== Checking hfdl_server ====="

    # Check hfdl_server is listening for TCP on 127.0.0.1:15556
    hfdl_pidof_hfdl_tcp_server=$(pgrep -f 'ncat -4 --keep-open --listen 0.0.0.0 15556')
    if ! check_tcp4_socket_listening_for_pid "0.0.0.0" "15556" "${hfdl_pidof_hfdl_tcp_server}"; then
        echo "hfdl_server TCP not listening on port 15556 (pid $hfdl_pidof_hfdl_tcp_server): UNHEALTHY"
        EXITCODE=1
    else
        echo "hfdl_server TCP listening on port 15556 (pid $hfdl_pidof_hfdl_tcp_server): HEALTHY"
    fi

    if [[ ${ENABLE_WEB,,} =~ true ]]; then
        if ! netstat -anp | grep -P "tcp\s+\d+\s+\d+\s+127.0.0.1:[0-9]+\s+127.0.0.1:15556\s+ESTABLISHED\s+[0-9]+/python3" >/dev/null 2>&1; then
            echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15556 for python3 established: FAIL"
            echo "hfdl_server TCP connected to python server on port 15556 (pid $hfdl_pidof_hfdl_tcp_server): UNHEALTHY"
            EXITCODE=1
        else
            echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15556 for python3 established: PASS"
            echo "hfdl_server TCP connected to python server on port 15556: HEALTHY"
        fi
    fi

    echo "==== Checking hfdl_stats ====="

    # Check hfdl_stats:
    hfdl_pidof_hfdl_stats=$(pgrep -fx 'socat -u TCP:127.0.0.1:15556 CREATE:/database/hfdl.past5min.json')

    # Ensure TCP connection to hfdl_server at 127.0.0.1:15556
    if ! check_tcp4_connection_established_for_pid "127.0.0.1" "ANY" "127.0.0.1" "15556" "${hfdl_pidof_hfdl_stats}"; then
        echo "hfdl_stats (pid $hfdl_pidof_hfdl_stats) not connected to hfdl_server (pid $hfdl_pidof_hfdl_tcp_server) at 127.0.0.1:15556: UNHEALTHY"
        EXITCODE=1
    else
        echo "hfdl_stats (pid $hfdl_pidof_hfdl_stats) connected to hfdl_server (pid $hfdl_pidof_hfdl_tcp_server) at 127.0.0.1:15556: HEALTHY"
    fi

    echo "==== Check for HFDL activity ====="

    # Check for activity
    # read .json files, ensure messages received in past hour

    hfdl_num_msgs_past_hour=$(find /database -type f -name 'hfdl.*.json' -cmin -60 -exec cat {} \; | sed -e 's/}{/}\n{/g' | wc -l)
    if [[ "$hfdl_num_msgs_past_hour" -gt 0 ]]; then
        echo "$hfdl_num_msgs_past_hour HFDL messages received in past hour: HEALTHY"
    else
        echo "$hfdl_num_msgs_past_hour HFDL messages received in past hour: UNHEALTHY"
        EXITCODE=1
    fi

fi

# ===== Check vdlm2_server, vdlm2_feeder, vdlm2_stats processes =====

if chk_enabled "${ENABLE_VDLM}"; then

    echo "==== Checking vdlm2_server ====="

    # Check vdlm2_server is listening for TCP on 127.0.0.1:15555
    vdlm2_pidof_vdlm2_tcp_server=$(pgrep -f 'ncat -4 --keep-open --listen 0.0.0.0 15555')
    if ! check_tcp4_socket_listening_for_pid "0.0.0.0" "15555" "${vdlm2_pidof_vdlm2_tcp_server}"; then
        echo "vdlm2_server TCP not listening on port 15555 (pid $vdlm2_pidof_vdlm2_tcp_server): UNHEALTHY"
        EXITCODE=1
    else
        echo "vdlm2_server TCP listening on port 15555 (pid $vdlm2_pidof_vdlm2_tcp_server): HEALTHY"
    fi

    if [[ ${ENABLE_WEB,,} =~ true ]]; then
        if ! netstat -anp | grep -P "tcp\s+\d+\s+\d+\s+127.0.0.1:[0-9]+\s+127.0.0.1:15555\s+ESTABLISHED\s+[0-9]+/python3" >/dev/null 2>&1; then
            echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15555 for python3 established: FAIL"
            echo "vdlm2_server TCP connected to python server on port 15555 (pid $vdlm2_pidof_vdlm2_tcp_server): UNHEALTHY"
            EXITCODE=1
        else
            echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15555 for python3 established: PASS"
            echo "vdlm2_server TCP connected to python server on port 15555: HEALTHY"
        fi
    fi

    echo "==== Checking vdlm2_stats ====="

    # Check vdlm2_stats:
    vdlm2_pidof_vdlm2_stats=$(pgrep -fx 'socat -u TCP:127.0.0.1:15555 CREATE:/database/vdlm2.past5min.json')

    # Ensure TCP connection to vdlm2_server at 127.0.0.1:15555
    if ! check_tcp4_connection_established_for_pid "127.0.0.1" "ANY" "127.0.0.1" "15555" "${vdlm2_pidof_vdlm2_stats}"; then
        echo "vdlm2_stats (pid $vdlm2_pidof_vdlm2_stats) not connected to vdlm2_server (pid $vdlm2_pidof_vdlm2_tcp_server) at 127.0.0.1:15555: UNHEALTHY"
        EXITCODE=1
    else
        echo "vdlm2_stats (pid $vdlm2_pidof_vdlm2_stats) connected to vdlm2_server (pid $vdlm2_pidof_vdlm2_tcp_server) at 127.0.0.1:15555: HEALTHY"
    fi

    echo "==== Check for VDLM2 activity ====="

    # Check for activity
    # read .json files, ensure messages received in past hour

    vdlm2_num_msgs_past_hour=$(find /database -type f -name 'vdlm2.*.json' -cmin -60 -exec cat {} \; | sed -e 's/}{/}\n{/g' | wc -l)
    if [[ "$vdlm2_num_msgs_past_hour" -gt 0 ]]; then
        echo "$vdlm2_num_msgs_past_hour VDLM2 messages received in past hour: HEALTHY"
    else
        echo "$vdlm2_num_msgs_past_hour VDLM2 messages received in past hour: UNHEALTHY"
        EXITCODE=1
    fi

fi

# ===== Check acars_server, acars_feeder, acars_stats processes =====

if chk_enabled "${ENABLE_ACARS}"; then

    echo "==== Checking acars_server ====="

    # Check acars_server is listening for TCP on 127.0.0.1:15550
    acars_pidof_acars_tcp_server=$(pgrep -f 'ncat -4 --keep-open --listen 0.0.0.0 15550')
    if ! check_tcp4_socket_listening_for_pid "0.0.0.0" "15550" "${acars_pidof_acars_tcp_server}"; then
        echo "acars_server TCP not listening on port 15550 (pid $acars_pidof_acars_tcp_server): UNHEALTHY"
        EXITCODE=1
    else
        echo "acars_server TCP listening on port 15550 (pid $acars_pidof_acars_tcp_server): HEALTHY"
    fi

    if [[ ${ENABLE_WEB,,} =~ true ]]; then
        if ! netstat -anp | grep -P "tcp\s+\d+\s+\d+\s+127.0.0.1:[0-9]+\s+127.0.0.1:15550\s+ESTABLISHED\s+[0-9]+/python3" >/dev/null 2>&1; then
            echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15550 for python3 established: FAIL"
            echo "acars_server TCP not connected to python server on port 15550: UNHEALTHY"
            EXITCODE=1
        else
            echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15550 for python3 established: PASS"
            echo "acars_server TCP connected to python3 server on port 15550: HEALTHY"
        fi
    fi

    echo "==== Checking acars_stats ====="

    # Check acars_stats:
    acars_pidof_acars_stats=$(pgrep -fx 'socat -u TCP:127.0.0.1:15550 CREATE:/database/acars.past5min.json')

    # Ensure TCP connection to acars_server at 127.0.0.1:15550
    if ! check_tcp4_connection_established_for_pid "127.0.0.1" "ANY" "127.0.0.1" "15550" "${acars_pidof_acars_stats}"; then
        echo "acars_stats (pid $acars_pidof_acars_stats) not connected to acars_server (pid $acars_pidof_acars_tcp_server) at 127.0.0.1:15550: UNHEALTHY"
        EXITCODE=1
    else
        echo "acars_stats (pid $acars_pidof_acars_stats) connected to acars_server (pid $acars_pidof_acars_tcp_server) at 127.0.0.1:15550: HEALTHY"
    fi

    echo "==== Check for ACARS activity ====="

    # Check for activity
    # read .json files, ensure messages received in past hour
    acars_num_msgs_past_hour=$(find /database -type f -name 'acars.*.json' -cmin -60 -exec cat {} \; | sed -e 's/}{/}\n{/g' | wc -l)
    if [[ "$acars_num_msgs_past_hour" -gt 0 ]]; then
        echo "$acars_num_msgs_past_hour ACARS messages received in past hour: HEALTHY"
    else
        echo "$acars_num_msgs_past_hour ACARS messages received in past hour: UNHEALTHY"
        EXITCODE=1
    fi

fi

# If ENABLE_VDLM or ENABLE_ACARS or ENABLE_HFDL or ENABLE_IMSL or ENABLE_IRDM is set:
if chk_enabled "${ENABLE_ACARS}" || chk_enabled "${ENABLE_VDLM}" || chk_enabled "${ENABLE_HFDL}" || chk_enabled "${ENABLE_IMSL}" || chk_enabled "${ENABLE_IRDM}"; then

    echo "==== Check webapp ====="

    # Check webapp HTTP endpoint is responding
    # Note: We only check the main HTTP endpoint, not Socket.IO directly
    # Probing /socket.io/ with curl triggers incomplete WebSocket handshakes
    # which generate false "unsupported version" warnings in the logs
    if curl --silent --fail --max-time 2 http://127.0.0.1:80/ >/dev/null 2>&1; then
        echo "webapp HTTP endpoint available: HEALTHY"
    else
        echo "webapp HTTP endpoint not available: UNHEALTHY"
        EXITCODE=1
    fi

fi

echo "==== Check Service Death Tallies ====="

# Check service death tally
mapfile -t SERVICES < <(find /run/service -maxdepth 1 -not -name "*s6*" | tail +2)
for service in "${SERVICES[@]}"; do
    SVDT=$(s6-svdt "$service" | grep -cv 'exitcode 0')
    if [[ "$SVDT" -gt 0 ]]; then
        echo "abnormal death tally for $(basename "$service") since last check is: $SVDT: UNHEALTHY"
        EXITCODE=1
    else
        echo "abnormal death tally for $(basename "$service") since last check is: $SVDT: HEALTHY"
    fi
    s6-svdt-clear "$service"
done

exit "$EXITCODE"
