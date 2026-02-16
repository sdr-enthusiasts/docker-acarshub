#!/command/with-contenv bash
#shellcheck shell=bash

# Generate stats.json with message counts from the last hour
# This runs continuously, updating every 60 seconds

set -o pipefail

# Function to count messages in JSON files from last hour
count_messages() {
    local pattern=$1
    find /database -type f -name "${pattern}.*.json" -cmin -60 -exec cat {} \; 2>/dev/null | sed -e 's/}{/}\n{/g' | wc -l
}

# Ensure output directory exists
mkdir -p /webapp/data

while true; do
    # Count messages for each decoder type
    acars_msgs=$(count_messages "acars")
    vdlm2_msgs=$(count_messages "vdlm2")
    hfdl_msgs=$(count_messages "hfdl")
    imsl_msgs=$(count_messages "imsl")
    irdm_msgs=$(count_messages "irdm")

    # Calculate total
    total_msgs=$((acars_msgs + vdlm2_msgs + hfdl_msgs + imsl_msgs + irdm_msgs))

    # Generate stats.json atomically (write to temp file, then move)
    stats_file="/webapp/data/stats.json"
    temp_file="/webapp/data/stats.json.tmp"

    cat >"${temp_file}" <<EOF
{
  "acars": ${acars_msgs},
  "vdlm2": ${vdlm2_msgs},
  "hfdl": ${hfdl_msgs},
  "imsl": ${imsl_msgs},
  "irdm": ${irdm_msgs},
  "total": ${total_msgs}
}
EOF

    # Atomic move
    mv "${temp_file}" "${stats_file}"

    # Log the update (only at debug level to avoid spam)
    if [[ $((MIN_LOG_LEVEL)) -ge 6 ]]; then
        # shellcheck disable=SC2016
        echo "Updated stats.json: total=${total_msgs} (acars=${acars_msgs}, vdlm2=${vdlm2_msgs}, hfdl=${hfdl_msgs}, imsl=${imsl_msgs}, irdm=${irdm_msgs})" | stdbuf -oL awk '{print "[gen_stats  ] " strftime("%Y/%m/%d %H:%M:%S", systime()) " " $0}'
    fi

    # Wait 60 seconds before next update
    sleep 60
done
