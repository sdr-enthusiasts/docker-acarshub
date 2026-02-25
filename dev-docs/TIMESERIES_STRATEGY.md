# Time-Series Data Management Strategy

## Overview

ACARS Hub collects message statistics every minute to track decoder activity over time. This document describes how we transitioned from RRD (Round Robin Database) to SQLite, and how we manage time-series data going forward.

## Historical Context: RRD to SQLite Migration

### Why Migrate?

**RRD Limitations**:

- Binary format (difficult to query, backup, or inspect)
- Fixed-size round-robin (old data automatically overwrites)
- External dependency (`rrdtool`)
- Limited query flexibility (fixed resolutions)

**SQLite Benefits**:

- Human-readable schema
- Standard SQL queries
- Flexible aggregation (downsample to any resolution)
- Integrates with existing database
- Automatic backups with database

### Original RRD Structure

The Python backend maintained 4 resolution levels:

| Resolution | Retention | Data Points | Purpose           |
| ---------- | --------- | ----------- | ----------------- |
| 1 minute   | 25 hours  | 1,500       | Recent detail     |
| 5 minutes  | 30 days   | 8,640       | Week+ trends      |
| 1 hour     | 6 months  | 4,320       | Monthly trends    |
| 6 hours    | 3 years   | 4,380       | Long-term history |

**Total**: ~23,000 rows maximum (fixed-size)

## Current Architecture: Single-Resolution Approach

### Design Decision

We chose a **single 1-minute resolution** for all data:

**Why?**

1. **Simplicity**: One resolution, one retention policy, one pruning task
2. **Flexibility**: Downsample to any resolution when querying (not just 4 fixed)
3. **Storage efficiency**: 50 MB/year for 1-minute data (trivial compared to messages)
4. **Reliability**: No risk of missing aggregation windows if server restarts
5. **SQLite performance**: Can efficiently aggregate on-the-fly (not like RRD)

### Data Expansion During Migration

**Problem**: Users have years of historical data in RRD at coarse resolutions (5min, 1hour, 6hour).

**Solution**: Expand coarse data into 1-minute resolution by replicating the average value across the time period.

**Example**:

```text
Original RRD 5-minute data point:
  timestamp: 1000, resolution='5min', acars_count=25

Expanded to 5 one-minute rows:
  timestamp: 1000, resolution='1min', acars_count=25
  timestamp: 1060, resolution='1min', acars_count=25
  timestamp: 1120, resolution='1min', acars_count=25
  timestamp: 1180, resolution='1min', acars_count=25
  timestamp: 1240, resolution='1min', acars_count=25
```

**Rationale**:

- The 5-minute value represents the _average_ over that period
- We don't have the original 1-minute data (it was never collected or was discarded)
- Replicating the average is the best approximation we have
- Users retain historical data instead of losing it

**Migration Statistics**:

From a typical RRD file with 3 years of history:

| Original Resolution | Rows       | Expanded to 1min | Result             |
| ------------------- | ---------- | ---------------- | ------------------ |
| 1 minute (25 hrs)   | 1,500      | →                | 1,500 rows         |
| 5 minute (30 days)  | 8,640      | × 5              | 43,200 rows        |
| 1 hour (6 months)   | 4,320      | × 60             | 259,200 rows       |
| 6 hour (3 years)    | 4,380      | × 360            | 1,576,800 rows     |
| **TOTAL**           | **18,840** |                  | **1,880,700 rows** |

Storage: ~188 MB for 3 years of expanded historical data.

## Ongoing Data Collection

### Stats Writer (`stats-writer.ts`)

**Purpose**: Collect live statistics every minute.

**How it works**:

1. Runs every 60 seconds (aligned to minute boundaries)
2. Reads current stats from `MessageQueue.getStats()`
3. Inserts row into `timeseries_stats` with `resolution='1min'`
4. Continues indefinitely while server runs

**Data collected** (per minute):

- `acars_count` - ACARS messages received
- `vdlm_count` - VDLM2 messages received
- `hfdl_count` - HFDL messages received
- `imsl_count` - IMSL messages received
- `irdm_count` - IRDM messages received
- `total_count` - Sum of all message types
- `error_count` - Decoding errors

### Stats Pruning (`stats-pruning.ts`)

**Purpose**: Prevent unbounded database growth.

**How it works**:

1. Runs every 24 hours
2. Deletes rows older than `TIMESERIES_RETENTION_DAYS` (default: 1095 days / 3 years)
3. If >10,000 rows deleted, runs `VACUUM` to reclaim disk space

**Configuration**:

```bash
# Default: 3 years
TIMESERIES_RETENTION_DAYS=1095

# Alternative configurations:
# 1 year:  TIMESERIES_RETENTION_DAYS=365
# 5 years: TIMESERIES_RETENTION_DAYS=1825
# 10 years: TIMESERIES_RETENTION_DAYS=3650
```

**Storage estimates**:

| Retention | Rows      | Storage |
| --------- | --------- | ------- |
| 1 year    | 525,600   | ~50 MB  |
| 3 years   | 1,576,800 | ~150 MB |
| 5 years   | 2,628,000 | ~250 MB |
| 10 years  | 5,256,000 | ~500 MB |

_For comparison: ACARS messages table is typically 1-2 GB/year (messages are 1-2 KB each)._

## Handling Server Downtime

### What Happens When Server is Offline?

**Stats writer doesn't run** → No data is inserted for that period → **Gaps in time-series**

**Visualization**:

```text
Timeline:  10:00   10:05   10:10   10:15   10:20   10:25
Data:      ●──●──●──●──●   (gap)   (gap)   ●──●──●──●──●
           ^                                ^
           Server running             Server back online

Chart:
   50 |  ●●●●●●                    ●●●●●●●
      | ●     ●                   ●      ●
   25 |●       ●                 ●        ●
    0 |_________●_______________●__________→
      10:00    10:10         10:20      10:30
                    ↑
                  Gap shown as line break
```

Should we backfill?

No.

- If the server was offline, there's no data to collect
- Gaps are honest - they show when monitoring wasn't active
- Interpolation would misrepresent reality

**Frontend handling**:

- Chart libraries (Chart.js, Recharts) naturally handle gaps
- Set `spanGaps: false` to show breaks in lines
- Or `spanGaps: 300000` to span gaps up to 5 minutes (milliseconds)

## Query Patterns

### Simple Time-Range Query

```typescript
// Get last 24 hours of data
const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
const now = Math.floor(Date.now() / 1000);

const data = await db
  .select()
  .from(timeseriesStats)
  .where(
    and(
      eq(timeseriesStats.resolution, "1min"),
      gte(timeseriesStats.timestamp, oneDayAgo),
      lte(timeseriesStats.timestamp, now),
    ),
  )
  .orderBy(timeseriesStats.timestamp)
  .all();

// Result: 1,440 data points (one per minute)
```

### Downsampling for Long Time Ranges

For efficient chart rendering, downsample when querying long periods:

```typescript
// Get last 30 days, downsampled to ~500 points for chart
const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86400;
const now = Math.floor(Date.now() / 1000);

// 30 days = 43,200 minutes
// Target: 500 points
// Bucket size: 86 minutes (~1.5 hours)

const query = `
  SELECT
    (timestamp / 5160) * 5160 as bucket_timestamp,
    ROUND(AVG(acars_count)) as acars_count,
    ROUND(AVG(vdlm_count)) as vdlm_count,
    ROUND(AVG(hfdl_count)) as hfdl_count,
    ROUND(AVG(imsl_count)) as imsl_count,
    ROUND(AVG(irdm_count)) as irdm_count,
    ROUND(AVG(total_count)) as total_count,
    ROUND(AVG(error_count)) as error_count
  FROM timeseries_stats
  WHERE resolution = '1min'
    AND timestamp >= ${thirtyDaysAgo}
    AND timestamp <= ${now}
  GROUP BY bucket_timestamp
  ORDER BY bucket_timestamp
`;

const data = db.prepare(query).all();
// Result: ~500 aggregated data points
```

**Query performance**:

- Last 24 hours (1,440 points): Direct query, <10ms
- Last 30 days (43,200 points): Downsample to 500 points, <50ms
- Last 1 year (525,600 points): Downsample to 500 points, <200ms

## Database Schema

```sql
CREATE TABLE timeseries_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  timestamp INTEGER NOT NULL,           -- Unix timestamp (seconds)
  resolution TEXT NOT NULL,             -- Always '1min'
  acars_count INTEGER DEFAULT 0 NOT NULL,
  vdlm_count INTEGER DEFAULT 0 NOT NULL,
  hfdl_count INTEGER DEFAULT 0 NOT NULL,
  imsl_count INTEGER DEFAULT 0 NOT NULL,
  irdm_count INTEGER DEFAULT 0 NOT NULL,
  total_count INTEGER DEFAULT 0 NOT NULL,
  error_count INTEGER DEFAULT 0 NOT NULL,
  created_at INTEGER NOT NULL          -- Insertion timestamp
);

CREATE INDEX idx_timeseries_timestamp_resolution
  ON timeseries_stats (timestamp, resolution);

CREATE INDEX idx_timeseries_resolution
  ON timeseries_stats (resolution);
```

## Configuration

### Environment Variables

```bash
# RRD migration (one-time)
RRD_PATH=/run/acars/acarshub.rrd

# Data retention (ongoing)
TIMESERIES_RETENTION_DAYS=1095  # 3 years (default)
```

### Recommended Retention Policies

| Use Case  | Retention | Storage | Rationale            |
| --------- | --------- | ------- | -------------------- |
| Home user | 365 days  | ~50 MB  | 1 year of history    |
| Hobbyist  | 1095 days | ~150 MB | 3 years (default)    |
| Research  | 1825 days | ~250 MB | 5 years of data      |
| Archive   | 3650 days | ~500 MB | 10 years, still <1GB |

**Note**: Even 10 years of 1-minute data is only ~500 MB - trivial compared to ACARS messages.

## Implementation Files

| File                                    | Purpose                               |
| --------------------------------------- | ------------------------------------- |
| `src/services/rrd-migration.ts`         | One-time migration from RRD to SQLite |
| `src/services/stats-writer.ts`          | Ongoing stats collection (every 60s)  |
| `src/services/stats-pruning.ts`         | Retention enforcement (daily)         |
| `drizzle/0001_add_timeseries_stats.sql` | Database schema migration             |

## Migration Checklist

When upgrading from Python to Node.js backend:

- [x] 1. Server starts, initializes database
- [x] 2. Checks for RRD file at `RRD_PATH`
- [x] 3. If found, runs migration (blocks startup until complete)
- [x] 4. Expands coarse data to 1-minute resolution
- [x] 5. Inserts all data into `timeseries_stats`
- [x] 6. Renames RRD to `.rrd.back` (prevents re-running)
- [x] 7. Continues startup (Socket.IO, TCP listeners)
- [x] 8. Stats writer starts collecting new data
- [x] 9. Pruning task scheduled (runs daily)

**First startup**: May take 30-60 seconds to migrate 3 years of RRD data (~1.8M rows).

**Subsequent startups**: Instant (checks for `.rrd.back`, skips migration).

## Future Considerations

### Could We Add Pre-Aggregation Later?

Yes, but it's probably not necessary. Current approach:

**Pros**:

- Simple (one resolution, one task)
- Flexible (downsample to any resolution on demand)
- Reliable (no missed aggregation windows)

**If pre-aggregation needed** (for very large time ranges or high query load):

1. Add aggregation tasks (every 5min, 1hour, 6hour)
2. Create coarse-resolution rows from 1-minute data
3. Update queries to use appropriate resolution
4. Add separate pruning policies per resolution

**When would this be needed?**

- Querying 10+ years of data frequently
- Thousands of concurrent users
- Very resource-constrained hardware

For typical ACARS Hub deployments (1-100 users), current approach is sufficient.

## Comparison: RRD vs SQLite

| Aspect           | RRD (Python)             | SQLite (Node.js)                 |
| ---------------- | ------------------------ | -------------------------------- |
| **Storage**      | Fixed 23K rows           | Configurable (default 1.6M rows) |
| **Retention**    | 3 years max              | Unlimited (recommend 3 years)    |
| **Resolutions**  | 4 fixed (1m, 5m, 1h, 6h) | 1 minute + downsample on-demand  |
| **Queries**      | rrdtool CLI              | Standard SQL                     |
| **Backups**      | Separate file            | Included in DB backup            |
| **Inspection**   | rrdtool dump             | Any SQLite client                |
| **Upgrades**     | Difficult                | Standard migrations              |
| **Storage/year** | ~2 MB (fixed)            | ~50 MB (1-minute data)           |

## Summary

**Key Points**:

1. **Single 1-minute resolution** for simplicity and flexibility
2. **Historical data preserved** by expanding coarse RRD data
3. **Configurable retention** (default 3 years, can extend to 10+ years)
4. **Storage efficient** (50 MB/year vs 1-2 GB/year for messages)
5. **Gaps are honest** (server downtime shows as missing data, no interpolation)
6. **Query flexibility** (downsample to any resolution on demand)

This approach balances **simplicity**, **performance**, and **data preservation** for typical ACARS Hub deployments.
