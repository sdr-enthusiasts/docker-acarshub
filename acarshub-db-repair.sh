#!/usr/bin/env bash
# acarshub-db-repair.sh
#
# Repairs a bloated acarshub SQLite database by:
#   1. Verifying the associated container is NOT running (fail if it is)
#   2. Dropping the FTS5 triggers and table (eliminates tombstone write amplification)
#   3. Deleting messages older than MSG_DAYS and alert_matches older than ALERT_DAYS
#   4. VACUUMing the database (reclaims freed pages, rewrites the file)
#   5. Recreating the FTS5 virtual table and all three triggers
#   6. Rebuilding the FTS5 index from the retained messages
#
# Usage:
#   sudo ./acarshub-db-repair.sh [OPTIONS] <container-service> <database-path>
#
# Arguments:
#   <container-name>      Docker container name (e.g. acarshub or acarshubv4)
#   <database-path>       absolute path to the SQLite messages.db to repair
#
# Options:
#   --msg-days   N        retain messages newer than N days  (default: 90)
#   --alert-days N        retain alert_matches newer than N days (default: 360)
#   -h, --help            show this help and exit
#
# Must be run as root (data directories are root-owned; systemctl needs root).
#
# Expected runtime: 30-90 minutes depending on how much data remains after pruning.
# Disk space needed: up to ~10 GB of free space for the VACUUM temp file.

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

MSG_DAYS=90
ALERT_DAYS=360

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() { echo "[$(date '+%H:%M:%S')] $*"; }
die() {
    echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2
    exit 1
}

usage() {
    sed -n '/^# Usage:/,/^[^#]/{ /^[^#]/d; s/^# \{0,3\}//; p }' "$0"
    exit "${1:-0}"
}

require_root() {
    [[ $EUID -eq 0 ]] || die "This script must be run as root (try: sudo $0)"
}

db_size() {
    du -sh "$1" 2>/dev/null | cut -f1
}

run_sqlite() {
    local db="$1"
    local sql_file="$2"
    nix-shell -p sqlite --run "sqlite3 '${db}'" <"${sql_file}"
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
    case "$1" in
    --msg-days)
        [[ -n "${2-}" ]] || die "--msg-days requires a numeric argument"
        MSG_DAYS="$2"
        shift 2
        ;;
    --alert-days)
        [[ -n "${2-}" ]] || die "--alert-days requires a numeric argument"
        ALERT_DAYS="$2"
        shift 2
        ;;
    -h | --help)
        usage 0
        ;;
    --)
        shift
        break
        ;;
    -*)
        die "Unknown option: $1  (try --help)"
        ;;
    *)
        break
        ;;
    esac
done

[[ $# -eq 2 ]] || die "Expected exactly 2 positional arguments: <container-service> <database-path>  (try --help)"

CONTAINER_SERVICE="$1"
DB_PATH="$2"

# ---------------------------------------------------------------------------
# SQL generator
# ---------------------------------------------------------------------------

write_repair_sql() {
    local msg_cutoff=$(($(date +%s) - MSG_DAYS * 86400))
    local alert_cutoff=$(($(date +%s) - ALERT_DAYS * 86400))

    local tmp
    tmp=$(mktemp /tmp/acarshub-repair-XXXXXX)

    cat >"$tmp" <<ENDSQL
-- -----------------------------------------------------------------------
-- Phase 1: Remove FTS5 so that subsequent DELETEs are plain B-tree ops
--          with no per-row tombstone writes into the FTS5 shadow tables.
-- -----------------------------------------------------------------------
DROP TRIGGER IF EXISTS messages_fts_insert;
DROP TRIGGER IF EXISTS messages_fts_delete;
DROP TRIGGER IF EXISTS messages_fts_update;
DROP TABLE  IF EXISTS messages_fts;

-- -----------------------------------------------------------------------
-- Phase 2: Prune old data
-- -----------------------------------------------------------------------
DELETE FROM messages
 WHERE msg_time < ${msg_cutoff};

DELETE FROM alert_matches
 WHERE matched_at < ${alert_cutoff};

-- -----------------------------------------------------------------------
-- Phase 3: VACUUM — rewrites the database file containing only live pages.
--          Temporarily needs up to ~10 GB of extra disk space.
-- -----------------------------------------------------------------------
VACUUM;

-- -----------------------------------------------------------------------
-- Phase 4: Recreate FTS5 virtual table
-- -----------------------------------------------------------------------
CREATE VIRTUAL TABLE messages_fts USING fts5(
  message_type  UNINDEXED,
  msg_time,
  station_id    UNINDEXED,
  toaddr        UNINDEXED,
  fromaddr      UNINDEXED,
  depa,
  dsta,
  eta           UNINDEXED,
  gtout         UNINDEXED,
  gtin          UNINDEXED,
  wloff         UNINDEXED,
  wlin          UNINDEXED,
  lat           UNINDEXED,
  lon           UNINDEXED,
  alt           UNINDEXED,
  msg_text,
  tail,
  flight,
  icao,
  freq,
  ack           UNINDEXED,
  mode          UNINDEXED,
  label,
  block_id      UNINDEXED,
  msgno         UNINDEXED,
  is_response   UNINDEXED,
  is_onground   UNINDEXED,
  error         UNINDEXED,
  libacars      UNINDEXED,
  level         UNINDEXED,
  content=messages,
  content_rowid=id
);

-- -----------------------------------------------------------------------
-- Phase 5: Recreate triggers
-- -----------------------------------------------------------------------
CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages
BEGIN
  INSERT INTO messages_fts (
    rowid, message_type, msg_time, station_id, toaddr, fromaddr,
    depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
    msg_text, tail, flight, icao, freq, ack, mode, label,
    block_id, msgno, is_response, is_onground, error, libacars, level
  ) VALUES (
    new.id, new.message_type, new.msg_time, new.station_id, new.toaddr, new.fromaddr,
    new.depa, new.dsta, new.eta, new.gtout, new.gtin, new.wloff, new.wlin,
    new.lat, new.lon, new.alt, new.msg_text, new.tail, new.flight, new.icao,
    new.freq, new.ack, new.mode, new.label, new.block_id, new.msgno,
    new.is_response, new.is_onground, new.error, new.libacars, new.level
  );
END;

CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages
BEGIN
  INSERT INTO messages_fts (
    messages_fts, rowid, message_type, msg_time, station_id, toaddr, fromaddr,
    depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
    msg_text, tail, flight, icao, freq, ack, mode, label,
    block_id, msgno, is_response, is_onground, error, libacars, level
  ) VALUES (
    'delete', old.id, old.message_type, old.msg_time, old.station_id, old.toaddr, old.fromaddr,
    old.depa, old.dsta, old.eta, old.gtout, old.gtin, old.wloff, old.wlin,
    old.lat, old.lon, old.alt, old.msg_text, old.tail, old.flight, old.icao,
    old.freq, old.ack, old.mode, old.label, old.block_id, old.msgno,
    old.is_response, old.is_onground, old.error, old.libacars, old.level
  );
END;

CREATE TRIGGER messages_fts_update AFTER UPDATE ON messages
BEGIN
  INSERT INTO messages_fts (
    messages_fts, rowid, message_type, msg_time, station_id, toaddr, fromaddr,
    depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
    msg_text, tail, flight, icao, freq, ack, mode, label,
    block_id, msgno, is_response, is_onground, error, libacars, level
  ) VALUES (
    'delete', old.id, old.message_type, old.msg_time, old.station_id, old.toaddr, old.fromaddr,
    old.depa, old.dsta, old.eta, old.gtout, old.gtin, old.wloff, old.wlin,
    old.lat, old.lon, old.alt, old.msg_text, old.tail, old.flight, old.icao,
    old.freq, old.ack, old.mode, old.label, old.block_id, old.msgno,
    old.is_response, old.is_onground, old.error, old.libacars, old.level
  );
  INSERT INTO messages_fts (
    rowid, message_type, msg_time, station_id, toaddr, fromaddr,
    depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
    msg_text, tail, flight, icao, freq, ack, mode, label,
    block_id, msgno, is_response, is_onground, error, libacars, level
  ) VALUES (
    new.id, new.message_type, new.msg_time, new.station_id, new.toaddr, new.fromaddr,
    new.depa, new.dsta, new.eta, new.gtout, new.gtin, new.wloff, new.wlin,
    new.lat, new.lon, new.alt, new.msg_text, new.tail, new.flight, new.icao,
    new.freq, new.ack, new.mode, new.label, new.block_id, new.msgno,
    new.is_response, new.is_onground, new.error, new.libacars, new.level
  );
END;

-- -----------------------------------------------------------------------
-- Phase 6: Rebuild FTS5 index from the retained messages
-- -----------------------------------------------------------------------
INSERT INTO messages_fts(messages_fts) VALUES('rebuild');
ENDSQL

    echo "$tmp"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

require_root

log "========================================"
log "acarshub database repair"
log "  container  = $CONTAINER_SERVICE"
log "  database   = $DB_PATH"
log "  MSG_DAYS   = $MSG_DAYS"
log "  ALERT_DAYS = $ALERT_DAYS"
log "========================================"

# ---------------------------------------------------------------------------
# Safety check: refuse to run if the container is still active
# ---------------------------------------------------------------------------
# docker inspect exits non-zero if the container doesn't exist at all.
if ! docker inspect --format '{{.Name}}' "$CONTAINER_SERVICE" &>/dev/null; then
    die "No Docker container named '$CONTAINER_SERVICE' found. Check the name and try again."
fi

container_status=$(docker inspect --format '{{.State.Status}}' "$CONTAINER_SERVICE")
if [[ "$container_status" == "running" ]]; then
    die "Container '$CONTAINER_SERVICE' is currently running (status: $container_status). Stop it before running this script:
    docker stop $CONTAINER_SERVICE"
fi
log "Container '$CONTAINER_SERVICE' exists and is not running (status: $container_status) — safe to proceed."

# ---------------------------------------------------------------------------
# Verify the database exists
# ---------------------------------------------------------------------------
[[ -f "$DB_PATH" ]] || die "Database not found: $DB_PATH"

# ---------------------------------------------------------------------------
# Repair
# ---------------------------------------------------------------------------
size_before=$(db_size "$DB_PATH")
log "Database size before: $size_before"

log "Writing repair SQL..."
sql_file=$(write_repair_sql)
trap 'rm -f "$sql_file"' EXIT

log "Phase 1-2: dropping FTS5 and pruning old rows..."
log "Phase 3:   VACUUMing (may take 10-30 minutes)..."
log "Phase 4-5: recreating FTS5 table and triggers..."
log "Phase 6:   rebuilding FTS5 index (may take several minutes)..."

if run_sqlite "$DB_PATH" "$sql_file"; then
    size_after=$(db_size "$DB_PATH")
    log "Done.  Size: $size_before  ->  $size_after"
else
    die "sqlite3 exited with an error. Check output above."
fi

log "========================================"
log "Repair complete."
log "Disk usage:"
df -h "$(dirname "$DB_PATH")"
log "========================================"
