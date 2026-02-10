# ACARS Hub Development - Quick Start

## 🚀 Prerequisites

### Option 1: Nix Flakes (Recommended)

All development tools managed automatically:

```bash
# With direnv (automatic)
direnv allow

# Without direnv (manual)
nix develop
```

This provides:

- Node.js, npm, TypeScript
- Python 3.13, PDM
- Biome, Playwright
- Pre-commit hooks
- All test runners

### Option 2: Manual Installation

- **Python 3.9+** with PDM
- **Node.js 18+** with npm
- **Just** (command runner)
- **SQLite**

---

## 🔧 One-Time Setup

```bash
# 1. Install dependencies
pdm install
cd acarshub-react && npm install && cd ..

# 2. Configure environment variables
cp .env.example .env
# Edit .env with your settings (database path, ADSB config, etc.)
# Set LOCAL_TEST=true for development mode
nano .env

# 3. Initialize test database (optional)
just db-init test.db
```

---

## 🔥 Development Mode

**Run these in separate terminal windows:**

### Terminal 1: Frontend Watch + Auto-Copy

```bash
./dev-watch.sh
```

Automatically:

- ✅ Rebuilds React app on file changes
- ✅ Copies assets to Flask static directory
- ✅ Enables source maps for debugging

### Terminal 2: Flask Backend

```bash
pdm run dev
```

Automatically:

- ✅ Reloads on Python file changes
- ✅ Serves with no-cache headers
- ✅ Auto-reloads templates

**Then open:** <http://localhost:8080>

---

## 📝 What This Does

- **Frontend changes**: Auto-rebuild + auto-copy to Flask
- **Backend changes**: Auto-reload Flask server
- **No caching**: Fresh assets on every refresh
- **Templates**: Auto-reload on changes
- **Environment**: Auto-loads `.env` file

---

## 🛠 Common Commands

### Development

```bash
# Start frontend watch + auto-copy
./dev-watch.sh

# Start backend server
pdm run dev
# OR
./run-dev.sh

# Frontend build (production)
pdm run build-frontend

# Frontend build (development)
pdm run build-frontend-dev
```

### Testing

```bash
# Run all unit/integration tests
just test

# Watch mode (auto-rerun on changes)
just test-watch

# Interactive UI mode
just test-ui

# Coverage report
just test-coverage

# E2E tests (requires dev server running)
just test-e2e

# Accessibility tests
just test-a11y

# Performance analysis
just lighthouse
```

### Quality Checks

```bash
# Quick check (tests + pre-commit hooks)
just check

# Full CI check (TypeScript + Biome + tests + pre-commit)
just ci

# Pre-commit (before committing)
just add          # git add -A
just commit       # Runs ci + commits with GPG signature
```

### Database

```bash
# Create fresh database with migrations
just db-init test.db

# Apply migrations to existing database
just db-migrate test.db
```

---

## 🐛 Troubleshooting

### Assets not updating?

1. **Hard refresh**: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
2. **DevTools**: Network → "Disable cache"
3. **Verify copy**: `ls -la rootfs/webapp/static/js/`
4. **Check .env**: Ensure `LOCAL_TEST=true` is set

### Watch script not working?

```bash
# Install inotify-tools (Linux)
sudo apt-get install inotify-tools

# macOS
brew install fswatch

# Or use manual watch mode
cd acarshub-react && npm run watch
# Then manually run ./copy_test_assets.sh after builds
```

### Flask not reloading?

- Check `LOCAL_TEST=true` in `.env`
- Check terminal for Python errors
- Restart: `Ctrl+C` and `pdm run dev` again

### Port already in use?

```bash
# Find process using port 8080
lsof -i :8080

# Kill if needed
kill -9 <PID>
```

### Nix environment issues?

```bash
# Rebuild flake
nix flake update

# Re-enter environment
exit
nix develop

# With direnv
direnv reload
```

---

## 📂 File Locations

- **Frontend source**: `acarshub-react/src/`
- **Built assets**: `acarshub-react/dist/`
- **Flask static**: `rootfs/webapp/static/`
- **Flask templates**: `rootfs/webapp/templates/`
- **Backend code**: `rootfs/webapp/`
- **Environment config**: `.env` (copy from `.env.example`)
- **Database migrations**: `rootfs/webapp/alembic/versions/`

---

## ⚡ Pro Tips

1. **Keep DevTools open** with "Disable cache" enabled
2. **Watch Flask terminal** for backend logs and errors
3. **Use browser console** for frontend debugging
4. **Source maps enabled** in dev mode for debugging TypeScript
5. **Run `just ci`** before committing to catch issues early
6. **Use `just test-watch`** while developing for instant feedback

---

## 🌐 Server Addresses

### Development Mode (`LOCAL_TEST=true`)

- **URL**: <http://localhost:8080>
- **Port**: 8080 (auto-configured)

### Production Mode (Docker)

- **URL**: <http://localhost> (or configured host)
- **Port**: 80 (nginx proxy to 8888)

---

## 📚 More Documentation

- **[AGENTS.md](AGENTS.md)** - AI agent coding standards and rules
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Complete development guide
- **[dev-docs/](dev-docs/)** - Developer documentation
  - **CONTRIBUTING.md** - How to contribute
  - **SETUP.md** - Detailed environment setup
  - **CODING_STANDARDS.md** - Code quality requirements
  - **TESTING_GUIDE.md** - Testing patterns and strategies
  - **TROUBLESHOOTING.md** - Common issues and solutions
- **[agent-docs/](agent-docs/)** - Architecture and design
  - **ARCHITECTURE.md** - System design and data flow
  - **DESIGN_LANGUAGE.md** - UI/UX patterns and components
  - **FEATURES.md** - Feature documentation
  - **TESTING.md** - Testing infrastructure and standards

---

## ❓ Questions?

- Check [TROUBLESHOOTING.md](dev-docs/TROUBLESHOOTING.md)
- Check [GitHub Issues](https://github.com/sdr-enthusiasts/docker-acarshub/issues)
- Join Discord (link in README.md)
