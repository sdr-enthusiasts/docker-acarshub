# ACARSHUB v4 Deployment Checklist

## Pre-Deployment Checklist

### 1. Review Changes

- [ ] Read `WHATS_NEW_V4.md` - Understand what's changing
- [ ] Read `DATABASE_OPTIMIZATION_V4.md` - Understand technical details
- [ ] Review migration file: `40fd0618348d_final_v4_optimization.py`
- [ ] Review new modules: `acarshub_query_builder.py`, `acarshub_query_profiler.py`

### 2. Backup Everything

- [ ] Backup database file:
  ```bash
  cp /path/to/acarshub.db /backup/acarshub.db.$(date +%Y%m%d_%H%M%S)
  ```
- [ ] Backup configuration files
- [ ] Note current database size:
  ```bash
  ls -lh /path/to/acarshub.db
  du -sh /path/to/acarshub.db
  ```
- [ ] Note current message count:
  ```bash
  sqlite3 /path/to/acarshub.db "SELECT COUNT(*) FROM messages;"
  ```

### 3. System Requirements Check

- [ ] Check SQLite version (need 3.9.0+):
  ```bash
  sqlite3 --version
  ```
- [ ] Check Python version (need 3.8+):
  ```bash
  python --version
  ```
- [ ] Check disk space (need 2x database size free):
  ```bash
  df -h /path/to/database
  ```
- [ ] Estimate migration time:
  - 100K messages: ~1 minute
  - 1M messages: ~10 minutes
  - 5M messages: ~20 minutes
  - 10M+ messages: ~30+ minutes

### 4. Schedule Maintenance Window

- [ ] Plan for migration time + 50% buffer
- [ ] Notify users of downtime
- [ ] Schedule during low-traffic period
- [ ] Have rollback plan ready

---

## Deployment Steps

### Step 1: Stop Application

```bash
# Docker
docker-compose stop

# Or systemd
systemctl stop acarshub

# Verify no processes using database
lsof | grep acarshub.db
```

### Step 2: Verify Files

```bash
cd /path/to/acarshub

# Check new files exist
ls -l rootfs/webapp/acarshub_query_builder.py
ls -l rootfs/webapp/acarshub_query_profiler.py
ls -l rootfs/webapp/migrations/versions/40fd0618348d_final_v4_optimization.py

# Verify syntax
cd rootfs/webapp
python -m py_compile acarshub_query_builder.py
python -m py_compile acarshub_query_profiler.py
python -m py_compile migrations/versions/40fd0618348d_final_v4_optimization.py
```

### Step 3: Run Migration

```bash
cd rootfs/webapp

# Check current migration status
alembic current
# Should show: 171fe2c07bd9 (or earlier)

# Run migration
alembic upgrade head

# Expected output:
# Adding aircraft_id column for future use...
# ✓ aircraft_id column added
# Creating composite indexes for query optimization...
# ✓ Composite indexes created
# Running VACUUM to reclaim disk space...
# (this may take several minutes - be patient!)
# ✓ VACUUM complete - database file optimized
# Running ANALYZE to optimize query planning...
# ✓ ANALYZE complete
# v4 migration complete!
```

### Step 4: Verify Migration

```bash
# Check migration status
alembic current
# Should show: 40fd0618348d (head)

# Check database integrity
sqlite3 /path/to/acarshub.db "PRAGMA integrity_check;"
# Should output: ok

# Verify message count (should match pre-migration)
sqlite3 /path/to/acarshub.db "SELECT COUNT(*) FROM messages;"

# Check indexes were created
sqlite3 /path/to/acarshub.db "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='messages';"
# Should include:
# - ix_messages_aircraft_id
# - ix_messages_time_icao
# - ix_messages_tail_flight
# - ix_messages_depa_dsta
# - ix_messages_type_time

# Check database size (should be smaller)
ls -lh /path/to/acarshub.db
du -sh /path/to/acarshub.db
```

### Step 5: Start Application

```bash
# Docker
docker-compose start

# Or systemd
systemctl start acarshub

# Check logs for errors
docker-compose logs -f
# or
journalctl -u acarshub -f
```

### Step 6: Verify Functionality

- [ ] Web interface loads
- [ ] Messages are being received
- [ ] Search functionality works
- [ ] Alert matching works
- [ ] No error messages in logs

---

## Post-Deployment Verification

### Functional Tests

- [ ] **Basic search**: Search by flight number
- [ ] **ICAO search**: Search by ICAO hex code
- [ ] **Route search**: Search by departure + destination
- [ ] **Alert search**: Verify alerts are being matched
- [ ] **Message viewing**: Verify messages display correctly

### Performance Tests

- [ ] **Search speed**: Search queries complete in <100ms (FTS) or 1-5s (ICAO)
- [ ] **Alert loading**: Alerts load in <500ms
- [ ] **Page load**: Web interface loads in <2s

### Monitoring

- [ ] Check logs for slow query warnings:
  ```bash
  grep "SLOW QUERY" /path/to/logs
  grep "VERY SLOW QUERY" /path/to/logs
  ```
- [ ] Monitor query statistics (optional):
  ```python
  from acarshub_query_profiler import log_query_stats
  log_query_stats()
  ```

### Data Integrity

- [ ] Compare message count (should match pre-migration)
- [ ] Verify alert matches count:
  ```bash
  sqlite3 /path/to/acarshub.db "SELECT COUNT(*) FROM alert_matches;"
  ```
- [ ] Check for orphaned data:
  ```bash
  sqlite3 /path/to/acarshub.db "
  SELECT COUNT(*) FROM alert_matches am
  LEFT JOIN messages m ON am.message_uid = m.uid
  WHERE m.uid IS NULL;
  "
  # Should be 0
  ```

---

## Rollback Procedure (if needed)

### Option 1: Rollback Migration Only

```bash
cd rootfs/webapp

# Stop application
docker-compose stop

# Rollback to previous migration
alembic downgrade 171fe2c07bd9

# Verify
alembic current
# Should show: 171fe2c07bd9

# Restart application
docker-compose start
```

**Note**: VACUUM space savings are permanent (good thing!)

### Option 2: Restore from Backup

```bash
# Stop application
docker-compose stop

# Restore backup
cp /backup/acarshub.db.20260213_120000 /path/to/acarshub.db

# Restart application
docker-compose start
```

**Use this if**: Migration corrupted data or integrity check failed

---

## Troubleshooting

### Migration Stuck on VACUUM

**Symptom**: No progress for 10+ minutes

**Check**:

```bash
# Verify database is still being accessed
lsof | grep acarshub.db

# Check disk I/O activity
iostat -x 1
```

**Action**: Be patient. VACUUM can take 15-30 minutes on very large databases.

### Disk Full Error

**Symptom**: `database or disk is full`

**Check**:

```bash
df -h /path/to/database
```

**Action**:

1. Free up space (VACUUM needs 2x database size)
2. Or move database to larger partition
3. Retry migration

### Import Error

**Symptom**: `No module named 'acarshub_query_builder'`

**Check**:

```bash
ls -l rootfs/webapp/acarshub_query_builder.py
```

**Action**: Ensure new files are deployed and restart application

### Slow Searches

**Symptom**: Searches taking 2-5 seconds

**Check**: What are you searching?

- ICAO substring: Expected (by design)
- Station ID: Expected (by design)
- Everything else: Should be fast

**Action**: Review `TROUBLESHOOTING_V4.md` for details

---

## Success Criteria

✅ Migration completed without errors
✅ Database integrity check passes
✅ Message count matches pre-migration
✅ Database file size reduced by 30-50%
✅ Search queries are faster
✅ No error messages in logs
✅ All functionality working
✅ Backup retained for 30 days

---

## Communication Template

### Pre-Deployment Announcement

```
ACARSHUB Maintenance Notice

We will be upgrading to v4 on [DATE] at [TIME].

Expected downtime: [X] minutes

What's changing:
- Improved database performance (10-100x faster searches)
- Enhanced security (SQL injection fixes)
- Reduced database file size (30-50% smaller)
- Future-proofing for aircraft tracking features

What to expect:
- Application will be unavailable during upgrade
- All existing data will be preserved
- Searches will be noticeably faster after upgrade

Questions? Contact [SUPPORT]
```

### Post-Deployment Announcement

```
ACARSHUB v4 Deployment Complete

The upgrade to v4 has been successfully completed.

Results:
- Database size reduced from [X]GB to [Y]GB
- Search performance improved by [Z]x
- All data preserved and verified
- No issues detected

New features:
- Faster multi-field searches
- Automatic slow query logging
- Improved security

Thank you for your patience!
```

---

## Support Contacts

- **GitHub Issues**: https://github.com/sdr-enthusiasts/docker-acarshub/issues
- **Documentation**: See `dev-docs/` directory
  - `WHATS_NEW_V4.md` - User guide
  - `TROUBLESHOOTING_V4.md` - Common issues
  - `DATABASE_OPTIMIZATION_V4.md` - Technical details

---

## Notes for Next Deployment

Record actual migration times and issues for future reference:

**Deployment Date**: ******\_\_\_******

**Database Size**: ****\_**** GB

**Message Count**: ****\_****

**Migration Time**: ****\_**** minutes

**Issues Encountered**:

-
-
-

**Lessons Learned**:

-
-
-

**Performance Improvements Observed**:

- Search speed: **\_** ms (before) → **\_** ms (after)
- Database size: **\_** GB (before) → **\_** GB (after)
- Slow queries: **\_** (before) → **\_** (after)

---

**Remember**: Always keep backups for at least 30 days after deployment!
