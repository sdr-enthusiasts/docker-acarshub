# Environment Variables Setup

## Quick Setup

1. **Copy the example file:**

   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your settings:**

   ```bash
   nano .env  # or your preferred editor
   ```

3. **Run development server:**

   ```bash
   ./run-dev.sh
   # or
   pdm run dev
   ```

## Environment Variables Reference

### Required Variables

| Variable      | Description                | Example                      |
| ------------- | -------------------------- | ---------------------------- |
| `LOCAL_TEST`  | Enable development mode    | `true`                       |
| `ACARSHUB_DB` | Database connection string | `sqlite:////path/to/test.db` |

### ACARS Data Sources

| Variable           | Description                | Options                                            |
| ------------------ | -------------------------- | -------------------------------------------------- |
| `ENABLE_ACARS`     | Enable ACARS messages      | `true`, `false` (legacy: `external` is deprecated) |
| `ENABLE_VDLM`      | Enable VDLM messages       | `true`, `false` (legacy: `external` is deprecated) |
| `ENABLE_HFDL`      | Enable HFDL messages       | `true`, `false` (legacy: `external` is deprecated) |
| `ENABLE_IMSL`      | Enable IMSL messages       | `true`, `false` (legacy: `external` is deprecated) |
| `ENABLE_IRDM`      | Enable IRDM messages       | `true`, `false` (legacy: `external` is deprecated) |
| `LIVE_DATA_SOURCE` | IP/hostname of data source | `192.168.1.100`                                    |

### ADSB Configuration

| Variable          | Description            | Example                                |
| ----------------- | ---------------------- | -------------------------------------- |
| `ENABLE_ADSB`     | Enable ADSB tracking   | `true`, `false`                        |
| `ADSB_URL`        | ADSB data feed URL     | `http://ip/tar1090/data/aircraft.json` |
| `ADSB_LAT`        | Base station latitude  | `37.7749`                              |
| `ADSB_LON`        | Base station longitude | `-122.4194`                            |
| `ADSB_BYPASS_URL` | Skip URL validation    | `true`, `false`                        |
| `OVERRIDE_TILE_URL`  | Override URL for Live Map tile layer | `https://tiles.stadiamaps.com/styles/stamen_toner_dark/{z}/{x}/{y}.png` |

## Usage Methods

### Method 1: PDM Scripts (Automatic .env loading)

```bash
pdm run dev
```

PDM automatically loads variables from `.env` file.

### Method 2: Shell Script

```bash
./run-dev.sh
```

Explicitly loads `.env` and runs the server.

### Method 3: Manual Export

```bash
export $(grep -v '^#' .env | xargs)
python rootfs/webapp/acarshub.py
```

### Method 4: Direct Command Line (Not Recommended)

```bash
env LOCAL_TEST=true ACARSHUB_DB=sqlite:///test.db ... python rootfs/webapp/acarshub.py
```

## Tips

- **Never commit `.env`** - It's in `.gitignore` for security
- **Use `.env.example`** - Template for other developers
- **Absolute paths** - SQLite database paths must be absolute
- **Comments** - Use `#` for comments in `.env` file

## Example Configurations

### Local Development with External Feed

```env
LOCAL_TEST=true
ACARSHUB_DB=sqlite:////home/user/acarshub-dev.db
ENABLE_ACARS=true
ENABLE_VDLM=true
ENABLE_HFDL=true
LIVE_DATA_SOURCE=192.168.1.100
ENABLE_ADSB=true
ADSB_URL=http://192.168.1.100/tar1090/data/aircraft.json
```

### Testing with Disabled Features

```env
LOCAL_TEST=true
ACARSHUB_DB=sqlite:///test.db
ENABLE_ACARS=false
ENABLE_VDLM=false
ENABLE_HFDL=false
ENABLE_ADSB=false
```

### PostgreSQL Database

```env
LOCAL_TEST=true
ACARSHUB_DB=postgresql://user:password@localhost/acarshub_dev
ENABLE_ACARS=true
LIVE_DATA_SOURCE=192.168.1.100
```

## Troubleshooting

### "Command not found: export"

Use `source` instead:

```bash
source <(grep -v '^#' .env | sed 's/^/export /')
```

### Variables Not Loading

Check for:

- Spaces around `=` (should be `KEY=value`, not `KEY = value`)
- Quotes for values with spaces: `KEY="value with spaces"`
- Special characters that need escaping

### SQLite Database Path Issues

- Use absolute paths: `sqlite:////absolute/path/to/db`
- Note the **4 slashes** for SQLite absolute paths
- Ensure directory exists and is writable

## Security Notes

- `.env` is in `.gitignore` - won't be committed to Git
- Never commit sensitive credentials
- Use different `.env` for production/development
- Keep `.env.example` generic without real credentials
