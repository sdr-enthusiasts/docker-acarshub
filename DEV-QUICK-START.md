# ACARS Hub Development - Quick Start

## 🚀 One-Time Setup

```bash
# 1. Install dependencies
pdm install
cd acarshub-typescript && npm install && cd ..

# 2. Configure environment variables
cp .env.example .env
# Edit .env with your settings (database path, ADSB config, etc.)
nano .env
```

See [ENV_SETUP.md](ENV_SETUP.md) for detailed configuration options.

## 🔥 Development Mode (Recommended)

**Run these in separate terminal windows:**

### Terminal 1: Frontend Watch + Auto-Copy

```bash
./dev-watch.sh
```

### Terminal 2: Flask Backend

```bash
pdm run dev
```

**Then open:** <http://localhost:5000>

---

## 📝 What This Does

- ✅ **Frontend changes**: Auto-rebuild + auto-copy to Flask
- ✅ **Backend changes**: Auto-reload Flask server
- ✅ **No caching**: Fresh assets on every refresh
- ✅ **Templates**: Auto-reload on changes
- ✅ **Environment**: Auto-loads `.env` file with your settings

---

## 🛠 Common Commands

```bash
# Backend with .env auto-load
pdm run dev
# OR
./run-dev.sh

# Frontend build (production)
pdm run build-frontend

# Frontend build (development)
pdm run build-frontend-dev

# Frontend watch only
cd acarshub-typescript && npm run watch

# Manual asset copy
cd acarshub-typescript && ./copy_test_assets.sh

# Testing (React app)
just test                # Run all tests
just test-watch          # Run tests in watch mode
just test-ui             # Run tests with UI
just test-coverage       # Run tests with coverage report
just check               # Run tests + pre-commit hooks
just ci                  # Full CI check (TypeScript + Biome + tests + pre-commit)
```

---

---

## 🧪 Testing Commands (just)

The project uses `just` (command runner) for convenient testing:

```bash
# Run tests once
just test

# Watch mode (auto-rerun on file changes)
just test-watch

# Interactive UI mode
just test-ui

# Coverage report
just test-coverage

# Quick check (tests + pre-commit hooks)
just check

# Full CI-like check (all quality checks)
just ci
```

**Direct npm commands** (from `acarshub-react/`):

```bash
cd acarshub-react

npm test                  # Run tests once
npm run test:watch        # Watch mode
npm run test:ui           # UI mode
npm run test:coverage     # Coverage report
```

**Current test status**: 156 tests passing (string utils + date utils)

---

## 🐛 Troubleshooting

### Assets not updating?

1. Hard refresh: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
2. Check DevTools → Network → "Disable cache"
3. Verify files copied: `ls -la rootfs/webapp/static/js/`

### Watch script not working?

```bash
# Install inotify-tools (Linux)
sudo apt-get install inotify-tools

# Or use manual watch mode
cd acarshub-typescript && npm run watch
# Then manually run ./copy_test_assets.sh after each build
```

### Flask not reloading?

- Check `LOCAL_TEST=True` is set
- Check terminal for Python errors
- Restart: `Ctrl+C` and `pdm run dev` again

---

## 📂 File Locations

- **Frontend source**: `acarshub-typescript/src/`
- **Built assets**: `acarshub-typescript/dist/`
- **Flask static**: `rootfs/webapp/static/`
- **Flask templates**: `rootfs/webapp/templates/`
- **Backend code**: `rootfs/webapp/acarshub.py`
- **Environment config**: `.env` (copy from `.env.example`)

---

## ⚡ Pro Tips

1. Keep browser DevTools open with cache disabled
2. Watch the Flask terminal for backend logs
3. Use browser console to debug frontend issues
4. Source maps are enabled in dev mode for debugging

---

For full documentation:

- [DEVELOPMENT.md](DEVELOPMENT.md) - Complete dev guide
- [ENV_SETUP.md](ENV_SETUP.md) - Environment variables reference

---

## 🌐 Server Address

When running in development mode (`LOCAL_TEST=true`):

- **URL**: <http://localhost:8080>
- **Port**: 8080 (not 5000!)

The port is automatically set when `LOCAL_TEST=true` is in your `.env` file.
