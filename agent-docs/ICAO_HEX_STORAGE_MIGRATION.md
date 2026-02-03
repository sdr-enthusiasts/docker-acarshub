# ICAO Hex Storage Migration

**Date**: 2026-02-03
**Migration**: `3168c906fb9e_convert_icao_to_hex_string`
**Status**: ✅ Complete

## Problem

ICAO hex search was broken due to storing ICAO addresses as decimal integers instead of hex strings.

### Original Behavior (BROKEN)

1. **Decoder sends**: `icao="ABF308"` (hex string)
2. **acars_formatter.py converts**: `int("ABF308", 16)` = `11268872` (decimal)
3. **Database stores**: `"11268872"` (decimal as string)
4. **User searches**: "ABF308"
5. **Backend converts**: `int("ABF308", 16)` = `11268872`
6. **FTS query**: `icao:"11268872"*`
7. **Result**: ✅ Full match works

**But partial matching was BROKEN:**

1. **User searches**: "ABF" (partial hex)
2. **Backend converts**: `int("ABF", 16)` = `2751`
3. **FTS query**: `icao:"2751"*`
4. **Database has**: `"11268872"`
5. **Result**: ❌ NO MATCH (2751 doesn't match start of 11268872)

### Why Partial Matching Failed

- Partial hex "ABF" converts to decimal `2751`
- Full ICAO "ABF308" converts to decimal `11268872`
- String "2751" does NOT match the start of "11268872"
- **Fundamental problem**: Wrong storage format for the search use case

## Solution

**Store ICAO as uppercase hex strings** (e.g., "ABF308") instead of decimal integers.

### Benefits

1. ✅ **Partial matching works**: "ABF" matches "ABF308" (prefix match)
2. ✅ **More intuitive**: ICAO addresses are always displayed in hex
3. ✅ **Simple search**: No conversion needed
4. ✅ **Case-insensitive**: Uppercase normalization handles "abf", "ABF", "Abf"

### Implementation

#### 1. Database Migration

**File**: `rootfs/webapp/migrations/versions/3168c906fb9e_convert_icao_to_hex_string.py`

**Upgrade** (decimal → hex):

```sql
UPDATE messages
SET icao = printf('%06X', CAST(icao AS INTEGER))
WHERE icao != '' AND icao IS NOT NULL AND CAST(icao AS INTEGER) > 0
```

**Downgrade** (hex → decimal):

```sql
UPDATE messages
SET icao = CAST(printf('%d', ('0x' || icao)) AS TEXT)
WHERE icao != '' AND icao IS NOT NULL AND length(icao) = 6
```

#### 2. Message Formatter Changes

**File**: `rootfs/webapp/acars_formatter.py`

**Before**:

```python
vdlm2_message["icao"] = int(
    unformatted_message["vdl2"]["avlc"]["src"]["addr"], 16
)
```

**After**:

```python
vdlm2_message["icao"] = unformatted_message["vdl2"]["avlc"]["src"]["addr"].upper()
```

**Changes in**:

- `format_dumpvdl2_message()` - VDLM2 messages
- `format_hfdl_message()` - HFDL messages
- `format_jaero_imsl_message()` - IMSL messages

#### 3. Search Function Changes

**File**: `rootfs/webapp/acarshub_database.py`

**Before** (hex → decimal conversion):

```python
if "icao" in search_term and search_term["icao"]:
    icao_hex = search_term["icao"].strip().upper()
    if icao_hex:
        try:
            search_term["icao"] = str(int(icao_hex, 16))  # Convert to decimal
        except ValueError:
            search_term["icao"] = ""
```

**After** (simple uppercase normalization):

```python
if "icao" in search_term and search_term["icao"]:
    search_term["icao"] = search_term["icao"].strip().upper()
```

#### 4. Message Enrichment Changes

**File**: `rootfs/webapp/acarshub_helpers.py`

**Before** (convert decimal to hex for display):

```python
if has_specified_key(json_message, "icao"):
    json_message["icao_hex"] = try_format_as_int(json_message["icao"], "icao")
```

**After** (already hex, use as-is):

```python
if has_specified_key(json_message, "icao"):
    # ICAO is now stored as hex string directly (e.g., "ABF308")
    # No conversion needed - just use it as-is
    json_message["icao_hex"] = json_message["icao"]
```

## New Behavior (WORKING)

1. **Decoder sends**: `icao="ABF308"` (hex string)
2. **acars_formatter.py stores**: `"ABF308"` (uppercase hex, no conversion)
3. **Database contains**: `"ABF308"`

### Search Examples

| User Input | Normalized | FTS Query        | Result                    |
| ---------- | ---------- | ---------------- | ------------------------- |
| "ABF308"   | "ABF308"   | `icao:"ABF308"*` | ✅ Full match             |
| "ABF"      | "ABF"      | `icao:"ABF"*`    | ✅ Partial match (prefix) |
| "abf308"   | "ABF308"   | `icao:"ABF308"*` | ✅ Case-insensitive       |
| "abf"      | "ABF"      | `icao:"ABF"*`    | ✅ Partial + case-insens. |

## Testing

### Verify Migration

```bash
# Check database after migration
sqlite3 /run/acars/acarshub.db "SELECT icao FROM messages LIMIT 10;"
# Should show hex strings like "ABF308", not decimals like "11268872"
```

### Test Search

1. Search for full ICAO: "ABF308" ✅
2. Search for partial ICAO: "ABF" ✅
3. Search lowercase: "abf308" ✅
4. Search partial lowercase: "abf" ✅

## Rollback

If you need to revert to decimal storage:

```bash
cd rootfs/webapp
alembic downgrade -1
```

This will:

- Convert all hex ICAO values back to decimal
- Restore old search behavior (full match only)

**Note**: You'll also need to revert code changes in:

- `acars_formatter.py`
- `acarshub_database.py`
- `acarshub_helpers.py`

## Schema Notes

- **Column type**: `String(32)` (unchanged - already supported both formats)
- **Index**: Existing index on ICAO column still works
- **FTS**: Full-text search index automatically updated during migration
- **Data size**: Hex strings (6 chars) vs decimal strings (variable length) - similar storage

## Production Deployment

1. **Backup database** before migration
2. Run migration: `alembic upgrade head`
3. Restart application to load new code
4. Test ICAO search (full and partial)
5. Monitor logs for any formatting errors

## Related Files

- Migration: `rootfs/webapp/migrations/versions/3168c906fb9e_convert_icao_to_hex_string.py`
- Formatter: `rootfs/webapp/acars_formatter.py`
- Search: `rootfs/webapp/acarshub_database.py`
- Enrichment: `rootfs/webapp/acarshub_helpers.py`

## Future Considerations

- **ADS-B ICAO matching**: ADS-B feeds already use hex format, so pairing is now simpler
- **External integrations**: APIs expecting decimal ICAO will need to convert (use `int(icao, 16)`)
- **Display**: Frontend already expects hex format via `icao_hex` field
