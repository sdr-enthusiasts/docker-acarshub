#!/usr/bin/with-contenv bash
# shellcheck shell=bash

# Get netstat once to save cpu time
NETSTAT_ANP=$(netstat -anp)

# Default original codes
EXITCODE=0

# ============================= VDLM2 CHECKS =============================
if [ -n "${ENABLE_VDLM}" ]; then

  # Check vdlm2dec:
  vdlm2_pidof_vdlm2dec=$(pidof -s vdlm2dec)
  if echo "$NETSTAT_ANP" | grep -P "^\s*udp\s+\d+\s+\d+\s+(\d{1,3}\.?){4}:\d{1,5}\s+127\.0\.0\.1:5555\s+ESTABLISHED\s+${vdlm2_pidof_vdlm2dec}\/vdlm2dec\s*\$" > /dev/null; then
    echo "vdlm2dec (pid $vdlm2_pidof_vdlm2dec) connected to 127.0.0.1:5555: PASS"
  else
    echo "vdlm2dec (pid $vdlm2_pidof_vdlm2dec) not connected to 127.0.0.1:5555: FAIL"
    EXITCODE=1
  fi

  # Check vdlm2_server:
  vdlm2_pidof_vdlm2_udp_server=$(pgrep -f 'ncat -4 -u --wait 1 --listen 127.0.0.1 5555')
  if echo "$NETSTAT_ANP" | grep -P "^\s*udp\s+\d+\s+\d+\s+127\.0\.0\.1:5555\s+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{1,5}\s+ESTABLISHED\s+${vdlm2_pidof_vdlm2_udp_server}\/ncat\s*\$" > /dev/null; then
    echo "vdlm2_server UDP receiving on port 5555 (pid $vdlm2_pidof_vdlm2_udp_server): PASS"
  else
    echo "vdlm2_server UDP not receiving on port 5555 (pid $vdlm2_pidof_vdlm2_udp_server): FAIL"
    EXITCODE=1
  fi
  vdlm2_pidof_vdlm2_tcp_server=$(pgrep -f 'ncat -4 --keep-open --listen 127.0.0.1 15555')
  if echo "$NETSTAT_ANP" | grep -P "^\s*tcp\s+\d+\s+\d+\s+127\.0\.0\.1:15555\s+0\.0\.0\.0:\*\s+LISTEN\s+${vdlm2_pidof_vdlm2_tcp_server}\/ncat\s*\$" > /dev/null; then
    echo "vdlm2_server TCP listening on port 15555 (pid $vdlm2_pidof_vdlm2_tcp_server): PASS"
  else
    echo "vdlm2_server TCP not listening on port 15555 (pid $vdlm2_pidof_vdlm2_tcp_server): FAIL"
    EXITCODE=1
  fi

  if [ -n "$FEED" ]; then
    # Check vdlm2_feeder:
    vdlm2_pidof_vdlm2_feeder=$(pgrep -f 'socat -d TCP:127.0.0.1:15555 UDP:feed.acars.io:5555')
    if echo "$NETSTAT_ANP" | grep -P "^\s*udp\s+\d+\s+\d+\s+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{1,5}\s+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:5555\s+ESTABLISHED\s+${vdlm2_pidof_vdlm2_feeder}\/socat\s*\$" > /dev/null; then
      vdlm2_feeder_dest=$(echo "$NETSTAT_ANP" | grep -P "^\s*udp\s+\d+\s+\d+\s+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{1,5}\s+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:5555\s+ESTABLISHED\s+${vdlm2_pidof_vdlm2_feeder}\/socat\s*\$" | awk '{print $5}')
      echo "vdlm2_feeder sending data to $vdlm2_feeder_dest (pid $vdlm2_pidof_vdlm2_feeder): PASS"
    else
      echo "vdlm2_feeder TCP not sending data (pid $vdlm2_pidof_vdlm2_feeder): FAIL"
      EXITCODE=1
    fi
  fi

  # Check vdlm2_stats:
  vdlm2_pidof_vdlm2_stats=$(pgrep -fx 'socat -u TCP:127.0.0.1:15555 CREATE:/run/acars/vdlm2.past5min.json')
  if echo "$NETSTAT_ANP" | grep -P "^\s*tcp\s+\d+\s+\d+\s+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{1,5}\s+127\.0\.0\.1:15555\s+ESTABLISHED\s+${vdlm2_pidof_vdlm2_stats}\/socat\s*\$" > /dev/null; then
    echo "vdlm2_stats connected to acars_server (pid $vdlm2_pidof_vdlm2_stats): PASS"
  else
    echo "vdlm2_stats not connected to acars_server (pid $vdlm2_pidof_vdlm2_stats): FAIL"
    EXITCODE=1
  fi

  # Check for activity
  # read .json files, ensure messages received in past hour
  vdlm2_num_msgs_past_hour=$(find /run/acars -type f -name 'vdlm2.*.json' -cmin -60 -exec cat {} \; | wc -l)
  if [[ "$vdlm2_num_msgs_past_hour" -gt 0 ]]; then
      echo "$vdlm2_num_msgs_past_hour VDLM2 messages received in past hour: PASS"
  else
      echo "$vdlm2_num_msgs_past_hour VDLM2 messages received in past hour: FAIL"
      EXITCODE=1
  fi

fi

# ============================= ACARS CHECKS =============================
if [ -n "${ENABLE_ACARS}" ]; then

  # Check acarsdec:
  acars_pidof_acarsdec=$(pidof -s acarsdec)
  if echo "$NETSTAT_ANP" | grep -P "^\s*udp\s+\d+\s+\d+\s+(\d{1,3}\.?){4}:\d{1,5}\s+127\.0\.0\.1:5550\s+ESTABLISHED\s+${acars_pidof_acarsdec}\/acarsdec\s*\$" > /dev/null; then
    echo "acarsdec (pid $acars_pidof_acarsdec) connected to 127.0.0.1:5550: PASS"
  else
    echo "acarsdec (pid $acars_pidof_acarsdec) not connected to 127.0.0.1:5550: FAIL"
    EXITCODE=1
  fi
  
  # Check acars_server:
  acars_pidof_acars_udp_server=$(pgrep -f 'ncat -4 -u --wait 1 --listen 127.0.0.1 5550')
  if echo "$NETSTAT_ANP" | grep -P "^\s*udp\s+\d+\s+\d+\s+127\.0\.0\.1:5550\s+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{1,5}\s+ESTABLISHED\s+${acars_pidof_acars_udp_server}\/ncat\s*\$" > /dev/null; then
    echo "acars_server UDP receiving on port 5550 (pid $acars_pidof_acars_udp_server): PASS"
  else
    echo "acars_server UDP not receiving on port 5550 (pid $acars_pidof_acars_udp_server): FAIL"
    EXITCODE=1
  fi
  acars_pidof_acars_tcp_server=$(pgrep -f 'ncat -4 --keep-open --listen 127.0.0.1 15550')
  if echo "$NETSTAT_ANP" | grep -P "^\s*tcp\s+\d+\s+\d+\s+127\.0\.0\.1:15550\s+0\.0\.0\.0:\*\s+LISTEN\s+${acars_pidof_acars_tcp_server}\/ncat\s*\$" > /dev/null; then
    echo "acars_server TCP listening on port 15550 (pid $acars_pidof_acars_tcp_server): PASS"
  else
    echo "acars_server TCP not listening on port 15550 (pid $acars_pidof_acars_tcp_server): FAIL"
    EXITCODE=1
  fi

  if [ -n "$FEED" ]; then
    # Check acars_feeder:
    acars_pidof_acars_feeder=$(pgrep -f 'socat -d TCP:127.0.0.1:15550 UDP:feed.acars.io:5550')
    if echo "$NETSTAT_ANP" | grep -P "^\s*udp\s+\d+\s+\d+\s+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{1,5}\s+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:5550\s+ESTABLISHED\s+${acars_pidof_acars_feeder}\/socat\s*\$" > /dev/null; then
      acars_feeder_dest=$(echo "$NETSTAT_ANP" | grep -P "^\s*udp\s+\d+\s+\d+\s+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{1,5}\s+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:5550\s+ESTABLISHED\s+${acars_pidof_acars_feeder}\/socat\s*\$" | awk '{print $5}')
      echo "acars_feeder sending data to $acars_feeder_dest (pid $acars_pidof_acars_feeder): PASS"
    else
      echo "acars_server TCP not sending data (pid $acars_pidof_acars_feeder): FAIL"
      EXITCODE=1
    fi
  fi

  # Check acars_stats:
  acars_pidof_acars_stats=$(pgrep -fx 'socat -u TCP:127.0.0.1:15550 CREATE:/run/acars/acars.past5min.json')
  if echo "$NETSTAT_ANP" | grep -P "^\s*tcp\s+\d+\s+\d+\s+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{1,5}\s+127\.0\.0\.1:15550\s+ESTABLISHED\s+${acars_pidof_acars_stats}\/socat\s*\$" > /dev/null; then
    echo "acars_stats connected to acars_server (pid $acars_pidof_acars_stats): PASS"
  else
    echo "acars_stats not connected to acars_server (pid $acars_pidof_acars_stats): FAIL"
    EXITCODE=1
  fi

  # Check for activity
  # read .json files, ensure messages received in past hour
  acars_num_msgs_past_hour=$(find /run/acars -type f -name 'acars.*.json' -cmin -60 -exec cat {} \; | wc -l)
  if [[ "$acars_num_msgs_past_hour" -gt 0 ]]; then
      echo "$acars_num_msgs_past_hour ACARS messages received in past hour: PASS"
  else
      echo "$acars_num_msgs_past_hour ACARS messages received in past hour: FAIL"
      EXITCODE=1
  fi

fi

# If either ENABLE_VDLM or ENABLE_ACARS is set:
if [ -n "${ENABLE_ACARS}" ] || [ -n "${ENABLE_VDLM}" ]; then

  # check webapp
  if curl --silent -o /dev/null --connect-timeout 1 http://127.0.0.1:80/; then
    echo "webapp available: PASS"
  else
    echo "webapp not available: FAIL"
    EXITCODE=1
  fi

fi

# Check service death tally
mapfile -t SERVICES < <(find /run/s6/services -maxdepth 1 -type d -not -name "*s6-*" | tail +2)
for service in "${SERVICES[@]}"; do
  SVDT=$(s6-svdt "$service" | grep -cv 'exitcode 0')
  if [[ "$SVDT" -gt 0 ]]; then
    echo "abnormal death tally for $(basename "$service") since last check is: $SVDT: FAIL"
    EXITCODE=1
  else
    echo "abnormal death tally for $(basename "$service") since last check is: $SVDT: PASS"
  fi
  s6-svdt-clear "$service"
done

exit "$EXITCODE"
