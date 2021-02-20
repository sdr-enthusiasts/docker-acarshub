#!/usr/bin/with-contenv bash
# shellcheck shell=bash

# Import healthchecks-framework
# shellcheck disable=SC1091
source /opt/healthchecks-framework/healthchecks.sh

# Default original codes
EXITCODE=0

# ===== Local Helper Functions =====

function get_pid_of_decoder {

  # $1: service_dir
  service_dir="$1"

  # Ensure variables are unset
  unset DEVICE_ID FREQS_VDLM VDLM_BIN FREQS_ACARS ACARS_BIN

  # Get DEVICE_ID
  eval "$(grep "DEVICE_ID=\"" "$service_dir"/run)"
  
  # Get FREQS_VDLM
  eval "$(grep "FREQS_VDLM=\"" "$service_dir"/run)"

  # Get VDLM_BIN
  eval "$(grep "VDLM_BIN=\"" "$service_dir"/run)"

  # Get FREQS_ACARS
  eval "$(grep "FREQS_ACARS=\"" "$service_dir"/run)"

  # Get ACARS_BIN
  eval "$(grep "ACARS_BIN=\"" "$service_dir"/run)"

  # Get PS output for the relevant process
  if [[ -n "$ACARS_BIN" ]]; then
    # shellcheck disable=SC2009
    ps_output=$(ps aux | grep "$ACARS_BIN" | grep " -r $DEVICE_ID " | grep " $FREQS_ACARS")
  elif [[ -n "$VDLM_BIN" ]]; then
    # shellcheck disable=SC2009
    ps_output=$(ps aux | grep "$VDLM_BIN" | grep " -r $DEVICE_ID " | grep " $FREQS_VDLM")
  fi

  # Find the PID of the decoder based on command line
  process_pid=$(echo "$ps_output" | tr -s " " | cut -d " " -f 2)
  
  # Return the process_pid
  echo "$process_pid"
  
}

# ===== Check acarsdec & vdlm2dec processes =====

# For each service...
for service_dir in /etc/services.d/*; do 
  service_name=$(basename "$service_dir")
  
  # If the service is acarsdec-*...
  if [[ "$service_name" =~ acarsdec-.+ ]]; then

    # If acarsdec is enabled...
    if [ -n "${ENABLE_ACARS}" ]; then
      decoder_pid=$(get_pid_of_decoder "$service_dir")
      decoder_udp_port="5550"
      decoder_server_prefix="acars"
    else
      # We shouldn't ever get here because if acarsdec is disabled, the template wouldn't have been converted to a service
      echo "Found acarsdec service directory when ENABLE_ACARS not set: UNHEALTHY"
      EXITCODE=1
      continue
    fi

  # If the service is vdlm2dec-*...
  elif [[ "$service_name" =~ vdlm2dec-.+ ]]; then

    # If vdlm2dec is enabled...
    if [ -n "${ENABLE_VDLM}" ]; then
      decoder_pid=$(get_pid_of_decoder "$service_dir")
      decoder_udp_port="5555"
      decoder_server_prefix="vdlm2"
    else
      # We shouldn't ever get here because if vdlm2dec is disabled, the template wouldn't have been converted to a service
      echo "Found vdlm2dec service directory when ENABLE_VDLM not set: UNHEALTHY"
      EXITCODE=1
      continue
    fi

  # If the server isn't acarsdec-* or vdlm2dec-*...
  else
    # skip it!
    continue
  fi

  # If the process doesn't exists, then fail

  echo "==== Checking $service_name ====="

  if [[ -z "$decoder_pid" ]]; then
    echo "Cannot find PID of decoder $service_name: UNHEALTHY"
    EXITCODE=1
  else
    # If the process does exist, then make sure it has made a connection to localhost on the relevant port.
    if ! check_udp4_connection_established_for_pid "127.0.0.1" "ANY" "127.0.0.1" "$decoder_udp_port" "$decoder_pid"; then
      echo "Decoder $service_name (pid $decoder_pid) not connected to ${decoder_server_prefix}_server at 127.0.0.1:$decoder_udp_port: UNHEALTHY"
      EXITCODE=1
    else
      echo "Decoder $service_name (pid $decoder_pid) is connected to ${decoder_server_prefix}_server at 127.0.0.1:$decoder_udp_port: HEALTHY"
    fi
  fi

done

# ===== Check vdlm2_server, vdlm2_feeder, vdlm2_stats processes =====

if [ -n "${ENABLE_VDLM}" ]; then

  echo "==== Checking vdlm2_server ====="

  # Check vdlm2_server is listening for TCP on 127.0.0.1:15555
  vdlm2_pidof_vdlm2_tcp_server=$(pgrep -f 'ncat -4 --keep-open --listen 127.0.0.1 15555')
  if ! check_tcp4_socket_listening_for_pid "127.0.0.1" "15555" "${vdlm2_pidof_vdlm2_tcp_server}"  > /dev/null 2>&1; then
    echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15555 for python3 established: FAIL"
    echo "vdlm2_server TCP not listening on port 15555 (pid $vdlm2_pidof_vdlm2_tcp_server): UNHEALTHY"
    EXITCODE=1
  else
    echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15555 for python3 established: PASS"
    echo "vdlm2_server TCP listening on port 15555 (pid $vdlm2_pidof_vdlm2_tcp_server): HEALTHY"
  fi

  if [ -n "${ENABLE_WEB}" ]; then
    if ! netstat -anp | grep -P "tcp\s+\d+\s+\d+\s+127.0.0.1:[0-9]+\s+127.0.0.1:15555\s+ESTABLISHED\s+[0-9]+/python3"; then
      echo "vdlm2_server TCP not connected to python server on port 15555 (pid $vdlm2_pidof_vdlm2_tcp_server): UNHEALTHY"
      EXITCODE=1
    else
      echo "vdlm2_server TCP connected to python server on port 15555 (pid $vdlm2_pidof_vdlm2_tcp_server): HEALTHY"
    fi
  fi

  # Check vdlm2_feeder
  if [ -n "$FEED" ]; then

      echo "==== Checking vdlm2_feeder ====="

      vdlm2_pidof_vdlm2_feeder=$(pgrep -f 'socat -d TCP:127.0.0.1:15555 UDP:feed.acars.io:5555')
      
      # Ensure TCP connection to vdlm2_server at 127.0.0.1:15555
      if ! check_tcp4_connection_established_for_pid "127.0.0.1" "ANY" "127.0.0.1" "15555" "${vdlm2_pidof_vdlm2_feeder}"; then
        echo "vdlm2_feeder (pid $vdlm2_pidof_vdlm2_feeder) not connected to vdlm2_server (pid $vdlm2_pidof_vdlm2_tcp_server) at 127.0.0.1:15555: UNHEALTHY"
        EXITCODE=1
      else
        echo "vdlm2_feeder (pid $vdlm2_pidof_vdlm2_feeder) is connected to vdlm2_server (pid $vdlm2_pidof_vdlm2_tcp_server) at 127.0.0.1:15555: HEALTHY"
      fi

      # Ensure UDP connection to acars.io
      if ! check_udp4_connection_established_for_pid "ANY" "ANY" "ANY" "5555" "${vdlm2_pidof_vdlm2_feeder}"; then
        echo "vdlm2_feeder (pid $vdlm2_pidof_vdlm2_feeder) not feeding: UNHEALTHY"
        EXITCODE=1
      else
        echo "vdlm2_feeder (pid $vdlm2_pidof_vdlm2_feeder) is feeding: HEALTHY"
      fi

  fi

  echo "==== Checking vdlm2_stats ====="

  # Check vdlm2_stats:
  vdlm2_pidof_vdlm2_stats=$(pgrep -fx 'socat -u TCP:127.0.0.1:15555 CREATE:/run/acars/vdlm2.past5min.json')

  # Ensure TCP connection to vdlm2_server at 127.0.0.1:15555
  if ! check_tcp4_connection_established_for_pid "127.0.0.1" "ANY" "127.0.0.1" "15555" "${vdlm2_pidof_vdlm2_stats}"; then
    echo "vdlm2_stats (pid $vdlm2_pidof_vdlm2_stats) not connected to acars_server (pid $vdlm2_pidof_vdlm2_tcp_server) at 127.0.0.1:15555: UNHEALTHY"
    EXITCODE=1
  else
    echo "vdlm2_stats (pid $vdlm2_pidof_vdlm2_stats) connected to acars_server (pid $vdlm2_pidof_vdlm2_tcp_server) at 127.0.0.1:15555: HEALTHY"
  fi

  echo "==== Check for VDLM2 activity ====="

  # Check for activity
  # read .json files, ensure messages received in past hour
  vdlm2_num_msgs_past_hour=$(find /run/acars -type f -name 'vdlm2.*.json' -cmin -60 -exec cat {} \; | wc -l)
  if [[ "$vdlm2_num_msgs_past_hour" -gt 0 ]]; then
      echo "$vdlm2_num_msgs_past_hour VDLM2 messages received in past hour: HEALTHY"
  else
      echo "$vdlm2_num_msgs_past_hour VDLM2 messages received in past hour: UNHEALTHY"
      EXITCODE=1
  fi

fi

# ===== Check acars_server, acars_feeder, acars_stats processes =====

if [ -n "${ENABLE_ACARS}" ]; then

  echo "==== Checking acars_server ====="

  # Check acars_server is listening for TCP on 127.0.0.1:15550
  acars_pidof_acars_tcp_server=$(pgrep -f 'ncat -4 --keep-open --listen 127.0.0.1 15550')
  if ! check_tcp4_socket_listening_for_pid "127.0.0.1" "15550" "${acars_pidof_acars_tcp_server}"; then
    echo "acars_server TCP not listening on port 15550 (pid $acars_pidof_acars_tcp_server): UNHEALTHY"
    EXITCODE=1
  else
    echo "acars_server TCP listening on port 15550 (pid $acars_pidof_acars_tcp_server): HEALTHY"
  fi

  if [ -n "${ENABLE_WEB}" ]; then  
    if ! netstat -anp | grep -P "tcp\s+\d+\s+\d+\s+127.0.0.1:[0-9]+\s+127.0.0.1:15550\s+ESTABLISHED\s+[0-9]+/python3" > /dev/null 2>&1; then
      echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15550 for python3 established: FAIL"
      echo "acars_server TCP not connected to python server on port 15550 (pid $acars_pidof_acars_tcp_server): UNHEALTHY"
      EXITCODE=1
    else
      echo "TCP4 connection between 127.0.0.1:ANY and 127.0.0.1:15550 for python3 established: PASS"
      echo "acars_server TCP connected to python3 server on port 15550 (pid $acars_pidof_acars_tcp_server): HEALTHY"
    fi
  fi

  # Check acars_feeder
  if [ -n "$FEED" ]; then

      echo "==== Checking acars_feeder ====="

      acars_pidof_acars_feeder=$(pgrep -f 'socat -d TCP:127.0.0.1:15550 UDP:feed.acars.io:5550')
      
      # Ensure TCP connection to acars_server at 127.0.0.1:15550
      if ! check_tcp4_connection_established_for_pid "127.0.0.1" "ANY" "127.0.0.1" "15550" "${acars_pidof_acars_feeder}"; then
        echo "acars_feeder (pid $acars_pidof_acars_feeder) not connected to acars_server (pid $acars_pidof_acars_tcp_server) at 127.0.0.1:15550: UNHEALTHY"
        EXITCODE=1
      else
        echo "acars_feeder (pid $acars_pidof_acars_feeder) is connected to acars_server (pid $acars_pidof_acars_tcp_server) at 127.0.0.1:15550: HEALTHY"
      fi

      # Ensure UDP connection to acars.io
      if ! check_udp4_connection_established_for_pid "ANY" "ANY" "ANY" "5550" "${acars_pidof_acars_feeder}"; then
        echo "acars_feeder (pid $acars_pidof_acars_feeder) not feeding: UNHEALTHY"
        EXITCODE=1
      else
        echo "acars_feeder (pid $acars_pidof_acars_feeder) is feeding: HEALTHY"
      fi

  fi

  echo "==== Checking acars_stats ====="

  # Check acars_stats:
  acars_pidof_acars_stats=$(pgrep -fx 'socat -u TCP:127.0.0.1:15550 CREATE:/run/acars/acars.past5min.json')

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
  acars_num_msgs_past_hour=$(find /run/acars -type f -name 'acars.*.json' -cmin -60 -exec cat {} \; | wc -l)
  if [[ "$acars_num_msgs_past_hour" -gt 0 ]]; then
      echo "$acars_num_msgs_past_hour ACARS messages received in past hour: HEALTHY"
  else
      echo "$acars_num_msgs_past_hour ACARS messages received in past hour: UNHEALTHY"
      EXITCODE=1
  fi

fi

# If either ENABLE_VDLM or ENABLE_ACARS is set:
if [ -n "${ENABLE_ACARS}" ] || [ -n "${ENABLE_VDLM}" ]; then

  echo "==== Check webapp ====="

  # check webapp
  if curl --silent -o /dev/null --connect-timeout 1 http://127.0.0.1:80/; then
    echo "webapp available: HEALTHY"
  else
    echo "webapp not available: UNHEALTHY"
    EXITCODE=1
  fi

fi

echo "==== Check Service Death Tallies ====="

# Check service death tally
mapfile -t SERVICES < <(find /run/s6/services -maxdepth 1 -type d -not -name "*s6-*" | tail +2)
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
