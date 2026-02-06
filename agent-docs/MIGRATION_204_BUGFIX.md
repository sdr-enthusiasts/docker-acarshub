# Migration 204a67756b9a Bugfix - UUID Uniqueness Issue

**Date**: 2025-02-06
**Migration**: `204a67756b9a_add_message_uids.py`
**Status**: ✅ FIXED
**Severity**: CRITICAL (blocks production deployment)

---

## Problem Summary

Migration `204a67756b9a` failed in production Docker environment with:

```text
sqlite3.IntegrityError: UNIQUE constraint failed: messages.uid
[SQL: CREATE UNIQUE INDEX ix_messages_uid ON messages (uid)]
```

The migration successfully added the `uid` column and backfilled values, but **all existing messages received the same UUID**, causing the UNIQUE index creation to fail.

---

## Root Cause

### Original Code (BUGGY)

```python
# Backfill UUIDs using SQLite's randomblob() function
op.execute(
    """
    UPDATE messages
    SET uid = (
        SELECT lower(hex(randomblob(4))) || '-' ||
               lower(hex(randomblob(2))) || '-4' ||
               substr(lower(hex(randomblob(2))),2) || '-' ||
               substr('89ab',abs(random()) % 4 + 1, 1) ||
               substr(lower(hex(randomblob(2))),2) || '-' ||
               lower(hex(randomblob(6)))
    )
    WHERE uid IS NULL
"""
)
```

### SQLite Behavior Gotcha

**Expected**: Generate a unique UUID for each row
**Actual**: SQLite evaluates the subquery `SELECT lower(hex(randomblob(...)))` **ONCE** and reuses the same result for all rows

This is a well-known SQLite quirk: scalar subqueries in UPDATE statements are evaluated once per statement, not once per row.

**Result**: All existing messages got the same UUID (e.g., `f3a2b1c4-d5e6-4789-abcd-ef0123456789`), violating the UNIQUE constraint.

---

## Solution

### Fixed Code

```python
import uuid  # Added import at top of file

def upgrade() -> None:
    # Add uid column (nullable initially)
    op.add_column("messages", sa.Column("uid", sa.String(36), nullable=True))

    # Backfill UUIDs using Python loop to ensure uniqueness
    connection = op.get_bind()

    # Get all message IDs that need UIDs
    result = connection.execute(sa.text("SELECT id FROM messages WHERE uid IS NULL"))
    message_ids = [row[0] for row in result]

    # Generate and assign unique UUID to each message
    for msg_id in message_ids:
        new_uid = str(uuid.uuid4())
        connection.execute(
            sa.text("UPDATE messages SET uid = :uid WHERE id = :id"),
            {"uid": new_uid, "id": msg_id}
        )

    # Commit the backfill
    connection.commit()

    # Make uid NOT NULL after backfill
    with op.batch_alter_table("messages") as batch_op:
        batch_op.alter_column("uid", nullable=False)

    # Create unique index (now succeeds because all UIDs are unique)
    op.create_index("ix_messages_uid", "messages", ["uid"], unique=True)
```

### Why This Works

1. **Python generates UUIDs**: Uses `uuid.uuid4()` which guarantees uniqueness
2. **Row-by-row updates**: Each message gets its own `UPDATE` statement with a unique UUID
3. **Parameterized queries**: Safe from SQL injection, explicit per-row execution
4. **Explicit commit**: Ensures all UUIDs are written before proceeding to NOT NULL constraint

---

## Performance Implications

### Backfill Performance

- **Empty database**: Negligible (no rows to update)
- **10,000 messages**: ~1-2 seconds (100 UUIDs/second is conservative estimate)
- **100,000 messages**: ~10-20 seconds
- **1,000,000+ messages**: May take several minutes

**Trade-off**: Correctness over speed. The migration only runs once, and uniqueness is critical for the alert system.

### Optimization Considered (NOT IMPLEMENTED)

Batch updates with Python-generated UUIDs:

```python
# Generate all UUIDs upfront
uids = [(str(uuid.uuid4()), msg_id) for msg_id in message_ids]

# Batch executemany (SQLite limitation: only ~999 params per query)
for i in range(0, len(uids), 500):
    batch = uids[i:i+500]
    connection.execute(
        sa.text("UPDATE messages SET uid = :uid WHERE id = :id"),
        [{"uid": uid, "id": msg_id} for uid, msg_id in batch]
    )
```

**Decision**: Keep simple row-by-row approach for clarity and reliability. Batch optimization can be added later if needed.

---

## Testing Checklist

Before deploying to production:

- [ ] **Backup production database** (`/run/acars/acars.db`)
- [ ] **Test on production snapshot**:
  - [ ] Copy production DB to test environment
  - [ ] Run migration: `alembic upgrade head`
  - [ ] Verify all messages have unique UIDs: `SELECT uid, COUNT(*) FROM messages GROUP BY uid HAVING COUNT(*) > 1;` (should return 0 rows)
  - [ ] Verify index exists: `.indexes messages` (should show `ix_messages_uid`)
  - [ ] Test rollback: `alembic downgrade -1`
  - [ ] Verify uid column dropped: `.schema messages` (no uid column)
  - [ ] Test re-upgrade: `alembic upgrade head`
  - [ ] Verify uniqueness again
- [ ] **Performance test**:
  - [ ] Measure migration time on production-sized database
  - [ ] If >30 seconds, consider batch optimization
- [ ] **Integration test**:
  - [ ] Start application with upgraded database
  - [ ] Verify new messages get UUIDs
  - [ ] Verify alert matching writes to `alert_matches` table
  - [ ] Verify Socket.IO emits `uid` and alert metadata
  - [ ] Verify React frontend receives and uses UIDs

---

## Commit History

1. **6b30b17**: `feat: Backend-authoritative alert matching with stable UIDs`
   - Initial implementation with buggy UUID backfill

2. **a599e5e**: `fix: Remove legacy alert_matches event, add missing AcarsMsg import`
   - Fixed TypeScript build issues

3. **5c30c5a**: `fix(migration): ensure unique UIDs in 204a67756b9a backfill` ← **THIS FIX**
   - Changed backfill from SQLite randomblob() to Python uuid.uuid4() loop
   - Added documentation of the bug and solution

---

## Lessons Learned

### SQLite Gotchas

1. **Scalar subqueries in UPDATE are evaluated once**: Don't use `UPDATE SET col = (SELECT random_value())` expecting per-row randomness
2. **Use Python for complex data generation**: Alembic migrations have full Python access - use it
3. **Test migrations on realistic data**: Empty database tests don't catch uniqueness violations

### Migration Best Practices

1. **Backfill before constraints**: Add column nullable → backfill → make NOT NULL → add index
2. **Explicit commits in migrations**: Call `connection.commit()` when doing multi-step data transformations
3. **Document quirks**: Add comments explaining non-obvious behavior (especially SQLite-specific)
4. **Test upgrade AND downgrade**: Ensure migrations are reversible

### Code Review Process

1. **Question "clever" SQL**: If UUID generation looks like a complex SQLite expression, consider Python instead
2. **Test with production-sized data**: Migration performance can surprise you
3. **Verify UNIQUE constraints actually work**: Query for duplicates after backfill, before index creation

---

## References

- SQLite documentation: [Core Functions - random()](https://www.sqlite.org/lang_corefunc.html#random)
- Alembic documentation: [Operations Reference](https://alembic.sqlalchemy.org/en/latest/ops.html)
- Python uuid module: [uuid.uuid4()](https://docs.python.org/3/library/uuid.html#uuid.uuid4)
- Stack Overflow: [SQLite UPDATE with random values per row](https://stackoverflow.com/q/7389255)

---

## Status

**Migration Status**: ✅ Fixed and ready for production testing
**Code Status**: ✅ Committed to `backend-authoritative-alerts` branch
**Next Steps**: Integration testing on production snapshot before merge to `react` branch
