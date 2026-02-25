#!/command/with-contenv bash
# shellcheck shell=bash
#
# ACARS Hub Docker Healthcheck Script
#
# What it checks:
# 1. Decoder connections (ACARS, VDLM2, HFDL, IMSL, IRDM)
#    - UDP mode (default): verifies node has a UDP socket bound on the expected port
#    - TCP/ZMQ mode: verifies node has an ESTABLISHED TCP connection to the decoder source
# 2. Message activity: queries the Node.js backend /data/stats.json API for messages
#    received in the past hour
# 3. Webapp: HTTP endpoint via nginx (port 80) and direct backend health check
# 4. Service death tallies: abnormal process exits via s6-overlay
#
# Connection type is determined from the *_CONNECTIONS environment variable:
#   "udp"                → UDP socket bound on the default port (0.0.0.0)
#   "udp://host:port"    → UDP socket bound on the specified port
#   "tcp://host:port"    → ESTABLISHED TCP connection to host:port
#   "zmq://host:port"    → ESTABLISHED ZMQ (TCP) connection to host:port
#
# Multiple descriptors (comma-separated) are supported; only the first is
# used for the socket check — if node cannot reach any endpoint, the message
# activity check will also fail.
#
# Exit codes:
# 0 = HEALTHY   - All enabled services are running and processing messages
# 1 = UNHEALTHY - One or more services failed, or no message activity detected

# Import healthchecks-framework
# shellcheck disable=SC1091
source /opt/healthchecks-framework/healthchecks.sh

# Source ACARS common functions
# shellcheck disable=SC1091
# shellcheck source=/scripts/acars_common
source /scripts/acars_common

EXITCODE=0

# Backend port — matches the PORT env var used by the Node.js server.
BACKEND_PORT="${PORT:-8888}"

# ============================================================================
# Fetch message stats from the Node.js backend API once and cache the result.
# All per-decoder activity checks parse this single response so we only make
# one HTTP request regardless of how many decoders are enabled.
#
# Falls back to an empty JSON object when the request fails (e.g. during
# startup) so that downstream arithmetic still works.
# ============================================================================
STATS_JSON=$(curl -sf --max-time 5 "http://127.0.0.1:${BACKEND_PORT}/data/stats.json" 2>/dev/null || echo '{}')

# Extract a numeric field from STATS_JSON.
# Usage: stats_count <field>  — prints the integer value, or 0 if absent.
#
# Implementation note: grep -oE extracts "field":NNN as a unit, then
# parameter expansion strips everything up to and including the colon.
# The pattern uses only ERE syntax (no PCRE features needed), so -oE is
# sufficient and more portable than -oP. This avoids python3/jq (not
# present in the runtime image) and is safe for the known flat JSON
# structure returned by /data/stats.json.
stats_count() {
    local field="$1"
    local segment
    segment=$(echo "$STATS_JSON" | grep -oE "\"${field}\":[0-9]+")
    if [[ -n "$segment" ]]; then
        echo "${segment##*:}"
    else
        echo "0"
    fi
}

# ============================================================================
# check_decoder — unified per-decoder health check
#
# Arguments:
#   $1  name          — human-readable name shown in output (e.g. "ACARS")
#   $2  connections   — value of the *_CONNECTIONS env var
#   $3  default_port  — fallback UDP port when connections is bare "udp"
#   $4  stats_field   — field name in /data/stats.json response
#
# Performs two checks for each decoder:
#   Socket check   — verifies node is actually bound/connected for this type
#   Activity check — verifies messages were received in the past hour
# ============================================================================
check_decoder() {
    local name="$1"
    local connections="${2:-udp}"
    local default_port="$3"
    local stats_field="$4"

    echo "==== Checking ${name} ===="

    # ------------------------------------------------------------------
    # Parse the first descriptor from a potentially comma-separated list.
    # Supported forms:
    #   udp                  → UDP, bind 0.0.0.0, use default_port
    #   udp://host:port      → UDP, bind on port
    #   tcp://host:port      → TCP client, connect to host:port
    #   zmq://host:port      → ZMQ subscriber (uses TCP under the hood)
    # ------------------------------------------------------------------
    local first="${connections%%,*}"
    first="${first// /}" # strip any surrounding whitespace

    local conn_type conn_host conn_port
    if [[ "$first" == "udp" ]]; then
        conn_type="udp"
        conn_host="0.0.0.0"
        conn_port="$default_port"
    elif [[ "$first" =~ ^(udp|tcp|zmq)://([^:]+):([0-9]+)$ ]]; then
        conn_type="${BASH_REMATCH[1]}"
        conn_host="${BASH_REMATCH[2]}"
        conn_port="${BASH_REMATCH[3]}"
    else
        # Unrecognised descriptor — fall back to UDP on the default port
        conn_type="udp"
        conn_host="0.0.0.0"
        conn_port="$default_port"
    fi

    # ------------------------------------------------------------------
    # Socket / connection check
    #
    # UDP: node binds a datagram socket — check ss -ulnp for the port.
    # TCP/ZMQ: node connects outward — check ss -tnp for an ESTABLISHED
    #          connection whose remote port matches conn_port.
    # ------------------------------------------------------------------
    case "$conn_type" in
    udp)
        # -ulnp: UDP, listening, numeric addresses, show processes
        if ss -ulnp 2>/dev/null | grep '"node"' | grep -q ":${conn_port}"; then
            echo "${name} UDP socket bound on port ${conn_port} (node): HEALTHY"
        else
            echo "${name} UDP socket not bound on port ${conn_port}: UNHEALTHY"
            EXITCODE=1
        fi
        ;;
    tcp | zmq)
        # -tnp state established: TCP, numeric, show processes, ESTAB only.
        # The remote port (conn_port) appears in the Peer Address:Port column.
        if ss -tnp state established 2>/dev/null |
            grep '"node"' |
            grep -q ":${conn_port}"; then
            echo "${name} TCP connected to ${conn_host}:${conn_port} (node): HEALTHY"
        else
            echo "${name} TCP not connected to ${conn_host}:${conn_port}: UNHEALTHY"
            EXITCODE=1
        fi
        ;;
    esac

    # ------------------------------------------------------------------
    # Message activity check
    #
    # Reads the cached /data/stats.json response fetched at startup.
    # The backend sums all timeseries_stats rows for the past 3600 seconds,
    # so a non-zero count means messages were actually received this hour.
    # ------------------------------------------------------------------
    echo "==== Check for ${name} activity ===="
    local count
    count=$(stats_count "$stats_field")
    if [[ "$count" -gt 0 ]]; then
        echo "$count ${name} messages received in past hour: HEALTHY"
    else
        echo "$count ${name} messages received in past hour: UNHEALTHY"
        EXITCODE=1
    fi
}

# ============================================================================
# Per-decoder checks — only runs when the decoder is enabled
# ============================================================================

if chk_enabled "${ENABLE_IRDM}"; then
    check_decoder "IRDM" "${IRDM_CONNECTIONS:-udp}" "5558" "irdm"
fi

if chk_enabled "${ENABLE_IMSL}"; then
    check_decoder "IMSL" "${IMSL_CONNECTIONS:-udp}" "5557" "imsl"
fi

if chk_enabled "${ENABLE_HFDL}"; then
    check_decoder "HFDL" "${HFDL_CONNECTIONS:-udp}" "5556" "hfdl"
fi

if chk_enabled "${ENABLE_VDLM}"; then
    check_decoder "VDLM2" "${VDLM_CONNECTIONS:-udp}" "5555" "vdlm2"
fi

if chk_enabled "${ENABLE_ACARS}"; then
    check_decoder "ACARS" "${ACARS_CONNECTIONS:-udp}" "5550" "acars"
fi

# ============================================================================
# Webapp availability — only checked when at least one decoder is enabled
# ============================================================================
if chk_enabled "${ENABLE_ACARS}" ||
    chk_enabled "${ENABLE_VDLM}" ||
    chk_enabled "${ENABLE_HFDL}" ||
    chk_enabled "${ENABLE_IMSL}" ||
    chk_enabled "${ENABLE_IRDM}"; then

    echo "==== Check webapp ===="

    # nginx → Node.js pipeline (serves the React SPA)
    if curl --silent --fail --max-time 2 http://127.0.0.1:80/ >/dev/null 2>&1; then
        echo "webapp HTTP endpoint available: HEALTHY"
    else
        echo "webapp HTTP endpoint not available: UNHEALTHY"
        EXITCODE=1
    fi

    # Node.js backend health endpoint (direct, bypasses nginx)
    # Confirms the Fastify server and SQLite database are both operational.
    if curl --silent --fail --max-time 2 "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null 2>&1; then
        echo "webapp backend health endpoint available: HEALTHY"
    else
        echo "webapp backend health endpoint not available: UNHEALTHY"
        EXITCODE=1
    fi

fi

# ============================================================================
# Service death tallies
#
# Uses `grep -v … | wc -l` instead of `grep -cv` because `grep -cv` returns
# exit code 1 when the count is zero (no non-matching lines), which would
# trigger the shell error handler and print a spurious [ERROR] line even
# when the service is perfectly healthy.
# ============================================================================
echo "==== Check Service Death Tallies ===="

mapfile -t SERVICES < <(find /run/service -maxdepth 1 -not -name "*s6*" | tail +2)
for service in "${SERVICES[@]}"; do
    SVDT=$(s6-svdt "$service" | awk '!/exitcode 0/{c++} END{print c+0}')
    if [[ "$SVDT" -gt 0 ]]; then
        echo "abnormal death tally for $(basename "$service") since last check is: $SVDT: UNHEALTHY"
        EXITCODE=1
    else
        echo "abnormal death tally for $(basename "$service") since last check is: $SVDT: HEALTHY"
    fi
    s6-svdt-clear "$service"
done

exit "$EXITCODE"
