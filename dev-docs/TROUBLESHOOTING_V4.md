# ACARSHUB v4 Troubleshooting Guide

## Quick Diagnostics

### Check Migration Status

```bash
cd /path/to/acarshub/rootfs/webapp
alembic current
```

**Expected output**: `40fd0618348d (head)`

If you see a different revision, the migration didn't complete.

### Check Database Integrity

```bash
sqlite3 /path/to/acarshub.db "PRAGMA integrity_check;"
```

**Expected output**: `ok`

### Check Index Creation

```bash
sqlite3 /path/to/acarshub.db "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='messages';"
```

**Should include**:

- `ix_messages_aircraft_id`
- `ix_messages_time_icao`
- `ix_messages_tail_flight`
- `ix_messages_depa_dsta`
- `ix_messages_type_time`

## Common Issues

### Issue 1: Migration Stuck on VACUUM

**Symptoms**: Migration appears frozen at "Running VACUUM..."

**Cause**: VACUUM is working but doesn't show progress (SQLite limitation)

**Solution**:

- Be patient (can take 5-20 minutes on large databases)
- Check disk I/O: `iostat -x 1` (should show activity)
- DO NOT interrupt the process

**How to verify it's working**:

```bash
# In another terminal
lsof | grep acarshub.db
# Should show the database file is open
```

### Issue 2: Migration Fails with "disk full"

**Symptoms**:

```
OperationalError: database or disk is full
```

**Cause**: VACUUM needs temporary space equal to database size

**Solution**:

```bash
# Check free space
df -h /path/to/database

# Free up space or move database to larger partition
# Then retry migration
alembic upgrade head
```

### Issue 3: "No module named acarshub_query_builder"

**Symptoms**:

```
ImportError: No module named 'acarshub_query_builder'
```

**Cause**: New modules not deployed or Python path issue

**Solution**:

```bash
# Verify files exist
ls -l rootfs/webapp/acarshub_query_builder.py
ls -l rootfs/webapp/acarshub_query_profiler.py

# Restart application to reload Python modules
docker-compose restart  # or equivalent
```

### Issue 4: Searches Are Slow After Migration

**Symptoms**: Searches taking 2-5 seconds

**Diagnosis**:

```python
# Check if you're using ICAO/station_id substring search
search_term = {"icao": "BF3"}  # SLOW - substring search
search_term = {"station_id": "ABC"}  # SLOW - substring search

# These are fast
search_term = {"flight": "UAL123"}  # FAST - FTS5
search_term = {"tail": "N123"}  # FAST - FTS5
```

**Solution**: This is expected behavior for ICAO/station_id searches. See "Why Some Searches Are Slow" in WHATS_NEW_V4.md

**Alternative**: Use prefix searches when possible:

```python
search_term = {"icao": "ABF"}  # Faster if you know the prefix
```

### Issue 5: Migration Fails with "table already exists"

**Symptoms**:

```
OperationalError: table alert_matches already exists
```

**Cause**: Previous migration partially completed

**Solution**:

```bash
# Check current revision
alembic current

# If stuck between revisions, force to specific revision
alembic stamp 171fe2c07bd9

# Then upgrade
alembic upgrade head
```

### Issue 6: Database Locked Error

**Symptoms**:

```
OperationalError: database is locked
```

**Cause**: Another process accessing database during migration

**Solution**:

```bash
# Stop all ACARSHUB processes
docker-compose stop  # or equivalent

# Check for lingering processes
lsof | grep acarshub.db

# Kill if necessary
kill <PID>

# Retry migration
alembic upgrade head
```

## Performance Issues

### Identifying Slow Queries

Check application logs for:

```
SLOW QUERY: database_search [page=0] took 1234.56ms
VERY SLOW QUERY: search_alerts_by_term [term=EMERGENCY] took 5432.10ms
```

### Query Performance Checklist

- [ ] **Check if index is being used**:
  ```python
  from sqlalchemy import text
  plan = session.execute(text("EXPLAIN QUERY PLAN " + your_query))
  for row in plan:
      print(row)
  ```
- [ ] **Look for "SCAN TABLE"** (bad - no index used)
- [ ] **Look for "SEARCH TABLE USING INDEX"** (good - index used)
- [ ] **Check query statistics**:
  ```python
  from acarshub_query_profiler import get_query_stats
  stats = get_query_stats()
  print(stats)
  ```

### Known Slow Query Patterns

| Query Pattern      | Expected Time | Why Slow                    | Solution                             |
| ------------------ | ------------- | --------------------------- | ------------------------------------ |
| ICAO substring     | 1-5 seconds   | Table scan (LIKE '%value%') | Use prefix search or accept slowness |
| station_id search  | 1-3 seconds   | Table scan                  | Accept or add FTS support            |
| Large GROUP_CONCAT | 500-2000ms    | Aggregation overhead        | Add caching (future)                 |
| Unindexed filter   | 1-10 seconds  | Table scan                  | Ensure indexed column exists         |

## Rollback Procedures

### Rollback to Previous Migration

```bash
cd /path/to/acarshub/rootfs/webapp

# Rollback v4 optimizations
alembic downgrade 171fe2c07bd9

# Verify
alembic current
# Should show: 171fe2c07bd9
```

**What gets rolled back**:

- Composite indexes removed
- aircraft_id column removed

**What stays**:

- VACUUM space savings (permanent)
- All data preserved

### Full Rollback to v3

⚠️ **NOT RECOMMENDED** - Data loss risk

```bash
# Restore from backup instead
cp /backup/acarshub.db.backup /path/to/acarshub.db

# Or rollback all v4 migrations
alembic downgrade e7991f1644b1  # Back to initial schema
```

## Data Integrity Checks

### Verify Message Count

```bash
sqlite3 /path/to/acarshub.db "SELECT COUNT(*) FROM messages;"
```

Compare to pre-migration count (should be identical).

### Verify Alert Matches

```bash
sqlite3 /path/to/acarshub.db "SELECT COUNT(*) FROM alert_matches;"
```

Should have data if you had alerts configured.

### Verify FTS Table

```bash
sqlite3 /path/to/acarshub.db "SELECT COUNT(*) FROM messages_fts;"
```

Should match message count.

### Check for Orphaned Data

```bash
# Check for alert_matches without corresponding messages
sqlite3 /path/to/acarshub.db "
SELECT COUNT(*) FROM alert_matches am
LEFT JOIN messages m ON am.message_uid = m.uid
WHERE m.uid IS NULL;
"
```

**Expected**: 0 (no orphaned records)

## Logs to Check

### Migration Logs

Look for:

```
Adding aircraft_id column for future use...
✓ aircraft_id column added
Creating composite indexes for query optimization...
✓ Composite indexes created
Running VACUUM to reclaim disk space...
✓ VACUUM complete - database file optimized
Running ANALYZE to optimize query planning...
✓ ANALYZE complete
v4 migration complete!
```

### Error Logs

Common error patterns:

```
# Disk space
OperationalError: database or disk is full

# Locking
OperationalError: database is locked

# Missing files
ImportError: No module named 'acarshub_query_builder'

# Permission issues
PermissionError: [Errno 13] Permission denied: '/path/to/acarshub.db'
```

## Performance Monitoring

### Enable Query Profiling

Already enabled by default in v4. Check logs for slow query warnings.

### Adjust Thresholds

Edit `rootfs/webapp/acarshub_query_profiler.py`:

```python
# Default thresholds
SLOW_QUERY_THRESHOLD_MS = 1000  # Log queries > 1s
VERY_SLOW_QUERY_THRESHOLD_MS = 5000  # Warn on queries > 5s

# Adjust as needed for your hardware
SLOW_QUERY_THRESHOLD_MS = 500  # More sensitive
```

### View Query Statistics

```python
# In Python console or add to your code
from acarshub_query_profiler import log_query_stats

log_query_stats(reset=False)
```

**Output**:

```
Query Statistics: 1234 total, 45 slow (3.6%), avg 156.70ms
Per-operation statistics:
  database_search: 567 queries, 12 slow, avg 234.56ms
  search_alerts_by_term: 123 queries, 5 slow, avg 345.67ms
```

## Getting Help

### Information to Provide

When reporting issues, include:

1. **Migration status**:

   ```bash
   alembic current
   ```

2. **Database integrity**:

   ```bash
   sqlite3 /path/to/acarshub.db "PRAGMA integrity_check;"
   ```

3. **Database size**:

   ```bash
   ls -lh /path/to/acarshub.db
   du -sh /path/to/acarshub.db
   ```

4. **Disk space**:

   ```bash
   df -h /path/to/database
   ```

5. **Relevant logs** (include timestamps):
   - Migration logs
   - Error messages
   - Slow query warnings

6. **System info**:
   - OS and version
   - SQLite version: `sqlite3 --version`
   - Python version: `python --version`
   - ACARSHUB version

### Community Support

- GitHub Issues: https://github.com/sdr-enthusiasts/docker-acarshub/issues
- Include all information from "Information to Provide" above
- Search existing issues first

## Advanced Troubleshooting

### Manual VACUUM

If migration VACUUM failed:

```bash
# Backup first
cp /path/to/acarshub.db /path/to/acarshub.db.backup

# Manual VACUUM
sqlite3 /path/to/acarshub.db "VACUUM;"

# This can take 5-20 minutes on large databases
```

### Rebuild FTS Index

If searches return incorrect results:

```bash
sqlite3 /path/to/acarshub.db "INSERT INTO messages_fts(messages_fts) VALUES('rebuild');"
```

### Reanalyze Statistics

If queries are slow despite indexes:

```bash
sqlite3 /path/to/acarshub.db "ANALYZE;"
```

### Check SQLite Version

FTS5 requires SQLite 3.9.0+:

```bash
sqlite3 --version
```

If too old, upgrade SQLite before running migration.

## Prevention

### Before Upgrading

- [ ] Backup database: `cp acarshub.db acarshub.db.backup`
- [ ] Check disk space: `df -h`
- [ ] Note database size: `ls -lh acarshub.db`
- [ ] Stop application: `docker-compose stop`
- [ ] Verify SQLite version: `sqlite3 --version`

### After Upgrading

- [ ] Verify migration: `alembic current`
- [ ] Check integrity: `PRAGMA integrity_check`
- [ ] Compare message count
- [ ] Test search functionality
- [ ] Monitor logs for slow queries
- [ ] Keep backup for 30 days

---

**Remember**: Most issues are preventable with proper backups and disk space checks!
