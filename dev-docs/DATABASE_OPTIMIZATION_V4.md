# ACARSHUB v4 Database Optimizations

## Overview

Version 4 introduces significant database optimizations focused on:

- **Security**: Eliminating SQL injection vulnerabilities
- **Performance**: Query profiling and composite indexes
- **Future-proofing**: Aircraft tracking support
- **Space efficiency**: VACUUM to reclaim disk space

## What Changed

### 1. Security Fixes (CRITICAL)

**Problem**: Raw SQL string concatenation created SQL injection vulnerabilities.

**Before (v3)**:

```python
# UNSAFE - SQL injection risk!
match_string = f'icao:"{user_input}"*'
query = f"SELECT * FROM messages_fts WHERE messages_fts MATCH {match_string}"
```

**After (v4)**:

```python
# SAFE - parameterized queries
from acarshub_query_builder import build_fts_search_query
query, count_query, params = build_fts_search_query(search_term, page=0)
result = session.execute(query, params)
```

### 2. Performance Improvements

#### Composite Indexes

Added 6 composite indexes for common query patterns:

| Index Name                   | Columns                       | Use Case                      |
| ---------------------------- | ----------------------------- | ----------------------------- |
| `ix_messages_time_icao`      | `msg_time DESC, icao`         | Recent messages from aircraft |
| `ix_messages_tail_flight`    | `tail, flight`                | Search by tail + flight       |
| `ix_messages_depa_dsta`      | `depa, dsta`                  | Route searches                |
| `ix_messages_type_time`      | `message_type, msg_time DESC` | Filtered time-series          |
| `ix_alert_matches_term_time` | `term, matched_at DESC`       | Alert browsing                |
| `ix_alert_matches_uid_term`  | `message_uid, term`           | Check if message matched term |

**Performance impact**: 10-100x faster for multi-column searches.

#### Query Profiling

New `acarshub_query_profiler` module tracks query performance:

```python
from acarshub_query_profiler import profile_query

# Automatic timing and slow query logging
with profile_query("database_search", params={"page": 0}):
    result = session.execute(query)

# Logs: "SLOW QUERY: database_search [page=0] took 1234.56ms"
```

Configuration:

- Queries > 1000ms logged as INFO
- Queries > 5000ms logged as WARNING
- Statistics tracked per operation type

### 3. Future-Proofing: Aircraft Tracking

Added `aircraft_id` column to messages table for future aircraft association:

```python
# Schema change
messages.aircraft_id = Column(String(36), nullable=True, index=True)

# Future usage (v5+)
# Link messages to aircraft table by ICAO, tail, or synthetic ID
# Enables: flight history, aircraft profiles, route tracking
```

**Why add it now?**

- Avoids another migration touching millions of rows in v5
- Nullable, so zero impact on existing functionality
- Indexed and ready when needed

### 4. Space Reclamation: VACUUM

The migration runs VACUUM to reclaim disk space:

**Sources of bloat**:

- Dropped `messages_saved` table (potentially GBs)
- UUID backfill operations (millions of UPDATEs)
- General database fragmentation

**Expected savings**: 30-50% reduction in database file size for migrated v3 users.

## New Modules

### `acarshub_query_builder.py`

Secure query building utilities:

```python
# FTS5 query builder with sanitization
build_fts_search_query(search_terms, page=0, limit=50)

# Alert queries with GROUP_CONCAT aggregation
build_alert_matches_query(limit=50, offset=0, before_timestamp=None)

# Search by specific alert term
build_alert_term_search_query(term, page=0, results_per_page=50)

# Parse GROUP_CONCAT results into arrays
parse_grouped_terms(row_dict)

# Validate and sanitize user input
validate_search_params(search_params)
```

### `acarshub_query_profiler.py`

Query performance monitoring:

```python
# Context manager
with profile_query("operation_name", params={"key": "value"}):
    # ... database operations ...

# Decorator
@profile_function("database_search", threshold_ms=500)
def database_search(search_term, page=0):
    # ... function code ...

# Get statistics
stats = get_query_stats()
# {
#   "total_queries": 1234,
#   "slow_queries": 45,
#   "avg_time_ms": 156.7,
#   "by_operation": {...}
# }
```

## Performance Characteristics

### FTS5 vs Non-FTS Searches

| Search Type | Method                      | Speed             | Limitations                              |
| ----------- | --------------------------- | ----------------- | ---------------------------------------- |
| **FTS5**    | Inverted index              | 10-100x faster    | Prefix matching only (`AB*` finds `ABC`) |
| **Non-FTS** | Table scan (LIKE '%value%') | Slow on large DBs | Substring matching (`BC` finds `ABC`)    |

**When FTS5 is used**:

- Flight, tail, label, depa, dsta, freq searches
- Message text searches
- All fields EXCEPT station_id and ICAO

**When Non-FTS is used** (slower):

- station_id searches (any value)
- ICAO searches (substring matching for hex codes)

### Known Slow Queries

**ICAO substring searches** are intentionally slow:

```python
# This searches for "BF3" in "ABF308" - requires table scan
search_term = {"icao": "BF3"}  # SLOW: O(n) where n = total messages
```

**Why?**

- FTS5 only supports prefix matching: `ABF*` finds `ABF308`
- ICAO substring search needs: `*BF3*` finds `ABF308`
- SQLite LIKE '%BF3%' cannot use indexes

**Options**:

1. **Accept it** - Document that ICAO substring searches are slow
2. **Restrict to prefix** - Change UI to only allow `ABF*` searches
3. **Add trigram extension** - Requires SQLite extension (not portable)
4. **Use prefix + filter** - Search `A*` then filter in Python

Currently using **option 1** (accept slow substring searches).

## Migration Notes

### Migration Sequence

```
e7991f1644b1 (initial_schema)
  ↓
0fc8b7cae596 (split_signal_level_table)
  ↓
a589d271a0a4 (split_freqs_table)
  ↓
94d97e655180 (create_messages_fts_table)
  ↓
3168c906fb9e (convert_icao_to_hex_string)
  ↓
204a67756b9a (add_message_uids)
  ↓
171fe2c07bd9 (create_alert_matches_table)
  ↓
40fd0618348d (final_v4_optimization) ← NEW
```

### Migration Time Estimates

For a database with **1 million messages**:

| Operation                | Time        | Notes                          |
| ------------------------ | ----------- | ------------------------------ |
| Add aircraft_id          | < 1s        | Nullable column, metadata only |
| Create composite indexes | 30-60s      | Depends on disk I/O            |
| VACUUM                   | 2-10min     | Rewrites entire database file  |
| ANALYZE                  | 5-15s       | Updates statistics             |
| **Total**                | **3-12min** | Varies by hardware             |

**Progress**: The migration shows progress messages but cannot show percentage for VACUUM (SQLite limitation).

### Rollback

Downgrade is supported but not recommended:

```bash
# Rollback to previous migration
alembic downgrade 171fe2c07bd9
```

**What happens**:

- Composite indexes removed
- aircraft_id column removed
- VACUUM space savings **kept** (file remains optimized)

## Usage Examples

### Secure Database Search

```python
# Old way (v3) - UNSAFE
match_string = f'icao:"{user_input}"*'
query = text(f"SELECT * FROM messages_fts WHERE messages_fts MATCH {match_string}")

# New way (v4) - SAFE
from acarshub_query_builder import build_fts_search_query
query, count_query, params = build_fts_search_query(
    {"icao": user_input, "flight": flight_num},
    page=0,
    limit=50
)
result = session.execute(query, params)
```

### Query Performance Monitoring

```python
from acarshub_query_profiler import profile_query

# Track slow queries automatically
with profile_query("load_alerts", params={"limit": 100}):
    alerts = load_recent_alerts(limit=100)

# If query takes > 1000ms, automatically logs:
# "SLOW QUERY: load_alerts [limit=100] took 1234.56ms"
```

### Alert Search Optimization

```python
# Old way - manual GROUP_CONCAT parsing
result = session.execute(text("""
    SELECT m.*, GROUP_CONCAT(am.term, ',') as matched_text
    FROM messages m JOIN alert_matches am ON m.uid = am.message_uid
    GROUP BY m.uid
"""))

# New way - using query builder
from acarshub_query_builder import build_alert_matches_query, parse_grouped_terms

query, params = build_alert_matches_query(limit=50)
result = session.execute(query, params)
for row in result.mappings():
    msg_dict = dict(row)
    parse_grouped_terms(msg_dict)  # Converts "A,B,C" to ["A", "B", "C"]
```

## Recommendations for Future Development

### 1. Query Caching

For expensive queries with GROUP_CONCAT:

```python
from functools import lru_cache
from datetime import datetime, timedelta

@lru_cache(maxsize=100)
def get_alert_summary(term, timestamp_hour):
    """Cache results per term per hour."""
    # Round timestamp to hour for cache key
    # Query database
    return results
```

### 2. Database Partitioning

For very large databases (10M+ messages), consider:

- Archive old messages (> 90 days) to separate table
- Use date-based partitioning (SQLite doesn't support this natively, but can be simulated)
- Implement automatic pruning/archiving

### 3. Read Replicas

For high-traffic deployments:

- Use SQLite's backup API for hot copies
- Route read queries to replicas
- Primary handles writes only

### 4. Aircraft Association (v5+)

The `aircraft_id` column is ready for:

```python
# Create aircraft table
class Aircraft(Base):
    __tablename__ = "aircraft"
    id = Column(String(36), primary_key=True)  # UUID or ICAO
    icao_hex = Column(String(6), index=True)
    registration = Column(String(10))
    operator = Column(String(100))
    # ... more fields

# Update messages.aircraft_id when inserting
message.aircraft_id = get_or_create_aircraft(icao_hex).id

# Query all messages from an aircraft
messages = session.query(Messages).filter_by(aircraft_id=aircraft_id).all()
```

## Monitoring Query Performance

### Check Statistics

```python
from acarshub_query_profiler import get_query_stats, log_query_stats

# Get current stats
stats = get_query_stats()
print(f"Total queries: {stats['total_queries']}")
print(f"Slow queries: {stats['slow_queries']}")
print(f"Average time: {stats['avg_time_ms']:.2f}ms")

# Log and optionally reset
log_query_stats(reset=True)
```

### Identify Slow Operations

Check logs for patterns:

```
SLOW QUERY: database_search [page=0] took 1234.56ms
SLOW QUERY: search_alerts_by_term [term=EMERGENCY, page=0] took 2345.67ms
VERY SLOW QUERY: database_search [page=0] took 5432.10ms  # > 5s = WARNING
```

### SQLite EXPLAIN QUERY PLAN

For debugging specific slow queries:

```python
from sqlalchemy import text

# Analyze query plan
plan = session.execute(text("EXPLAIN QUERY PLAN " + your_query))
for row in plan:
    print(row)

# Look for:
# - "SCAN TABLE" (bad - table scan, no index used)
# - "SEARCH TABLE USING INDEX" (good - index used)
# - "USING COVERING INDEX" (best - all data from index)
```

## Known Issues

### 1. ICAO Substring Searches are Slow

**Status**: By design (documented trade-off)

**Workaround**: Use prefix searches when possible:

- Instead of "BF3", search "ABF" (if known)
- Encourage users to enter full/partial ICAO from start

### 2. GROUP_CONCAT Overhead

**Status**: Acceptable for current scale

**Future**: Consider caching or denormalization if becomes bottleneck.

### 3. SQLAlchemy No Native FTS5 Support

**Status**: Using `text()` queries with parameterization (secure)

**Alternative**: Could create custom SQLAlchemy dialect extension, but not worth the effort.

## Testing

### Verify Migration

```bash
# Run migration
cd rootfs/webapp
alembic upgrade head

# Check indexes were created
sqlite3 /path/to/acarshub.db "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='messages';"

# Should include:
# - ix_messages_aircraft_id
# - ix_messages_time_icao
# - ix_messages_tail_flight
# - ix_messages_depa_dsta
# - ix_messages_type_time

# Check database size (should be smaller after VACUUM)
ls -lh /path/to/acarshub.db
```

### Performance Testing

```python
import time
from acarshub_database import database_search

# Test search performance
start = time.time()
results, count = database_search({"flight": "UAL"}, page=0)
duration = (time.time() - start) * 1000
print(f"Search took {duration:.2f}ms, found {count} results")

# Should be < 100ms for FTS searches on databases with millions of messages
# Non-FTS (ICAO/station_id) searches may take 1-5 seconds
```

## Support

For issues or questions:

1. Check logs for "SLOW QUERY" warnings
2. Run `EXPLAIN QUERY PLAN` to verify index usage
3. Check migration status: `alembic current`
4. Review query statistics: `get_query_stats()`

## References

- [SQLite FTS5 Documentation](https://www.sqlite.org/fts5.html)
- [SQLite VACUUM](https://www.sqlite.org/lang_vacuum.html)
- [SQLite Query Planning](https://www.sqlite.org/queryplanner.html)
- [Alembic Migrations](https://alembic.sqlalchemy.org/)
