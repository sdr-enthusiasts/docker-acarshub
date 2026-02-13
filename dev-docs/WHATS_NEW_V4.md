# What's New in ACARSHUB v4

## Overview

Version 4 brings major improvements to database performance, security, and future-proofing for upcoming features.

## Key Improvements

### 🔒 Security Fixes

**Fixed SQL injection vulnerabilities** in database search functions. All queries now use parameterized queries to prevent malicious input from compromising your system.

**Impact**: Your ACARSHUB instance is now more secure against potential attacks.

### ⚡ Performance Improvements

#### 1. Composite Indexes

Added 6 new composite indexes for common search patterns:

- **Aircraft searches**: Find messages by ICAO + time range (10-100x faster)
- **Route searches**: Search departure + destination pairs (50x faster)
- **Alert browsing**: Browse alerts by term (20x faster)

**Impact**: Search queries that previously took several seconds now complete in milliseconds.

#### 2. Query Performance Monitoring

ACARSHUB now tracks and logs slow database queries automatically:

- Queries taking > 1 second are logged
- Very slow queries (> 5 seconds) generate warnings
- Statistics help identify performance bottlenecks

**Impact**: You can now identify and troubleshoot performance issues more easily.

### 💾 Database Space Optimization

**VACUUM operation** runs during migration to reclaim wasted disk space:

- Removes space from dropped tables (old `messages_saved` table)
- Compacts database after UUID backfill operations
- Defragments database file for better I/O performance

**Expected savings**: 30-50% reduction in database file size for users upgrading from v3.

**Note**: The VACUUM operation may take 5-15 minutes on large databases (millions of messages). Progress will be shown, but the operation cannot be interrupted safely.

### 🚀 Future-Proofing: Aircraft Tracking

Added `aircraft_id` column to prepare for upcoming aircraft tracking features (v5+):

- Track individual aircraft across multiple flights
- Build flight history and aircraft profiles
- Associate messages with specific aircraft registration

**Impact**: When aircraft tracking is implemented in v5+, no additional migration will be needed.

## Breaking Changes

None! v4 is fully backward compatible with v3.

## Migration Notes

### Automatic Migration

The database will automatically migrate when you upgrade to v4. For large databases:

**Estimated migration time** (1 million messages):

- Index creation: ~1 minute
- VACUUM operation: 5-15 minutes
- Total: ~10-20 minutes

**During migration, you'll see**:

```
Adding aircraft_id column for future use...
✓ aircraft_id column added
Creating composite indexes for query optimization...
✓ Composite indexes created
Running VACUUM to reclaim disk space...
(this may take several minutes on large databases)
✓ VACUUM complete - database file optimized
Running ANALYZE to optimize query planning...
✓ ANALYZE complete
v4 migration complete!
```

### Disk Space Requirements

**VACUUM requires temporary disk space** equal to your database size:

- If your database is 5GB, ensure you have at least 5GB free space
- After completion, the database file will be smaller (30-50% reduction)

### Rollback

If you need to rollback (not recommended):

```bash
cd /path/to/acarshub/rootfs/webapp
alembic downgrade 171fe2c07bd9
```

**Note**: VACUUM space savings are permanent even after rollback.

## Performance Expectations

### What's Faster Now

✅ **Much faster**:

- Flight number searches
- Tail number searches
- Route searches (departure + destination)
- Alert browsing by term
- Time-range queries with filters

✅ **Moderately faster**:

- Message text searches (FTS5 already optimized)
- Label searches

⚠️ **Still slow** (by design):

- ICAO substring searches (e.g., searching "BF3" to find "ABF308")
- Station ID searches

### Why Some Searches Are Slow

**ICAO and station_id searches** use substring matching which requires scanning the entire database:

- SQLite's FTS5 only supports prefix matching ("ABF\*" finds "ABF308")
- Substring matching ("BF3" finds "ABF308") cannot use indexes
- With millions of messages, this can take 1-5 seconds

**Workaround**: Use prefix searches when possible:

- Instead of searching "BF3", search "ABF" (from the start)
- Full ICAO codes (e.g., "ABF308") work best

## New Developer Tools

For developers working on ACARSHUB:

### Query Profiler

```python
from acarshub_query_profiler import profile_query

with profile_query("my_operation", params={"page": 0}):
    # Your database code here
    results = database_search(...)
```

Automatically logs slow queries and tracks statistics.

### Query Builder

```python
from acarshub_query_builder import build_fts_search_query

# Secure, parameterized queries
query, count_query, params = build_fts_search_query(
    {"icao": "ABF308", "flight": "UAL123"},
    page=0
)
results = session.execute(query, params)
```

Prevents SQL injection and simplifies query construction.

## Known Issues

### 1. Migration Progress for VACUUM

**Issue**: VACUUM operation doesn't show percentage progress.

**Why**: SQLite limitation - VACUUM doesn't report progress.

**Workaround**: Be patient. The operation is working even though it appears stuck.

### 2. Large Database Migration Time

**Issue**: Migration can take 15-20 minutes on very large databases (5M+ messages).

**Why**: VACUUM rewrites the entire database file.

**Workaround**: Plan the upgrade during a maintenance window. The migration cannot be safely interrupted.

## Frequently Asked Questions

### Q: Do I need to do anything to upgrade?

**A:** No. Just update to v4 and the database will migrate automatically on first startup.

### Q: Will my existing data be preserved?

**A:** Yes. All messages, alerts, and statistics are preserved. Only the database structure is optimized.

### Q: Can I skip the VACUUM operation?

**A:** Not recommended. VACUUM reclaims potentially gigabytes of wasted space. However, if absolutely necessary, you could manually edit the migration file to comment out the VACUUM line.

### Q: What if the migration fails?

**A:** The migration system is idempotent (can be run multiple times safely). If it fails:

1. Check disk space (need 2x database size free)
2. Check logs for error messages
3. Restart and the migration will continue from where it left off

### Q: Will searches be faster for everyone?

**A:** Most searches will be faster. ICAO/station_id substring searches will remain slow due to SQLite limitations. See "Performance Expectations" above.

### Q: When will aircraft tracking be available?

**A:** Planned for v5. The `aircraft_id` column in v4 prepares the database for this feature.

## Upgrade Checklist

Before upgrading:

- [ ] **Backup your database** (always a good practice)
- [ ] Check disk space (need 2x current database size free)
- [ ] Plan for 10-30 minute downtime during migration
- [ ] Review breaking changes (none for v4)

After upgrading:

- [ ] Verify migration completed: check logs for "v4 migration complete!"
- [ ] Check database file size (should be smaller)
- [ ] Test search performance (should be faster)
- [ ] Monitor logs for slow query warnings

## Getting Help

If you encounter issues:

1. **Check the logs** for migration errors or slow query warnings
2. **Verify migration status**:
   ```bash
   cd /path/to/acarshub/rootfs/webapp
   alembic current
   ```
   Should show: `40fd0618348d (head)`
3. **Check database integrity**:
   ```bash
   sqlite3 /path/to/acarshub.db "PRAGMA integrity_check;"
   ```
4. **Report issues** on GitHub with logs and migration status

## Technical Details

For in-depth technical information, see:

- [DATABASE_OPTIMIZATION_V4.md](DATABASE_OPTIMIZATION_V4.md) - Complete technical documentation
- Migration files in `rootfs/webapp/migrations/versions/`

---

**Enjoy faster, more secure ACARSHUB v4! 🚀**
