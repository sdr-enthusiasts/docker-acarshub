# ACARS Hub Development Guide

This guide explains how to set up a development environment with hot reloading for both the Flask backend and TypeScript frontend.

## Table of Contents

- [Quick Start](#quick-start)
- [Development Workflow](#development-workflow)
- [Architecture Overview](#architecture-overview)
- [Hot Reloading Setup](#hot-reloading-setup)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites

- Python 3.9+ with PDM installed
- Node.js 16+ with npm
- inotify-tools (Linux) or fswatch (macOS) - optional but recommended for auto-reload

### Initial Setup

1. **Install backend dependencies:**
   ```bash
   pdm install
   ```

2. **Install frontend dependencies:**
   ```bash
   pdm run install-frontend
   # Or manually:
   cd acarshub-typescript && npm install
   ```

3. **Build frontend assets:**
   ```bash
   pdm run build-frontend-dev
   ```

### Running Development Server

#### Option 1: Recommended - Backend with Frontend Watch (Two Terminals)

**Terminal 1 - Start the watch script (auto-copies assets to Flask):**
```bash
./dev-watch.sh
```

**Terminal 2 - Run Flask backend:**
```bash
pdm run dev
```

This setup provides:
- ✅ Automatic frontend rebuilds on file changes
- ✅ Automatic asset copying to Flask static directory
- ✅ Flask serves fresh assets (no caching in dev mode)
- ✅ Backend auto-reload on Python file changes

#### Option 2: Manual Frontend Builds

**Terminal 1 - Run webpack watch:**
```bash
cd acarshub-typescript
npm run watch
```

**Terminal 2 - Run Flask backend:**
```bash
pdm run dev
```

Then manually copy assets after each build:
```bash
cd acarshub-typescript
./copy_test_assets.sh
```

#### Option 3: Webpack Dev Server (Frontend Only)

For frontend-only development with mock backend:
```bash
cd acarshub-typescript
npm run dev
```

This starts webpack-dev-server on http://localhost:9000 with hot module replacement.

## Development Workflow

### Making Frontend Changes

1. Edit TypeScript/SCSS files in `acarshub-typescript/src/`
2. Webpack watch automatically rebuilds
3. `dev-watch.sh` automatically copies to Flask static directory
4. Refresh browser to see changes (hard refresh: Ctrl+Shift+R or Cmd+Shift+R)

### Making Backend Changes

1. Edit Python files in `rootfs/webapp/`
2. Flask automatically detects changes and reloads
3. Refresh browser if needed

### No-Cache Configuration

In development mode (`LOCAL_TEST=True`), the Flask backend is configured to:

- Disable browser caching: `SEND_FILE_MAX_AGE_DEFAULT = 0`
- Enable template auto-reload: `TEMPLATES_AUTO_RELOAD = True`
- Serve static files with no-cache headers
- Enable Flask debug mode

This ensures you always get fresh assets without manual cache clearing.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Development Setup                         │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────┐         ┌──────────────────────┐
│  TypeScript Source   │         │   Flask Backend      │
│  acarshub-typescript/│         │   rootfs/webapp/     │
│                      │         │                      │
│  src/                │         │  acarshub.py         │
│  ├── pages/          │         │  ├── Routes          │
│  ├── helpers/        │         │  ├── SocketIO        │
│  ├── css/            │         │  └── Database        │
│  └── assets/         │         │                      │
└──────────────────────┘         └──────────────────────┘
         │                                   │
         │ webpack watch                     │ Flask dev server
         ▼                                   ▼
┌──────────────────────┐         ┌──────────────────────┐
│   Built Assets       │         │   Serves Assets      │
│   dist/              │────────▶│   static/            │
│                      │  copy   │   templates/         │
│  ├── static/js/      │         │                      │
│  ├── static/images/  │         │  Browser requests    │
│  ├── static/sounds/  │         │  served with         │
│  └── index.html      │         │  no-cache headers    │
└──────────────────────┘         └──────────────────────┘
```

## Hot Reloading Setup

### Frontend Watch Script (`dev-watch.sh`)

The `dev-watch.sh` script provides automated asset management:

1. **Initial build**: Runs `npm run build-dev` to create initial assets
2. **Watch mode**: Starts webpack in watch mode
3. **Auto-copy**: Uses `inotifywait` to detect file changes in `dist/`
4. **Asset sync**: Copies changed files to Flask's `static/` and `templates/` directories

**What gets copied:**
- `dist/static/js/*` → `rootfs/webapp/static/js/`
- `dist/static/images/*` → `rootfs/webapp/static/images/`
- `dist/static/sounds/*` → `rootfs/webapp/static/sounds/`
- `dist/index.html` → `rootfs/webapp/templates/index.html`
- `dist/helppage.MD` → `rootfs/webapp/templates/helppage.MD`

### Backend No-Cache Configuration

In `acarshub.py`, when `LOCAL_TEST=True`:

```python
if acarshub_configuration.LOCAL_TEST:
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
    app.config["TEMPLATES_AUTO_RELOAD"] = True
    app.config["DEBUG"] = True
```

Custom static file route with cache-busting headers:

```python
@app.route("/static/<path:filename>")
def serve_static(filename):
    response = send_from_directory(app.static_folder, filename)
    if acarshub_configuration.LOCAL_TEST:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response
```

### Webpack Configuration

Development mode features:

- **Source maps**: Full source maps for debugging
- **Watch mode**: Auto-rebuild on file changes
- **No chunkhash**: Filenames without hashes for easier debugging
- **Dev server**: Optional webpack-dev-server with proxy to Flask backend

## Browser Auto-Reload (Optional)

For automatic browser refresh without manual page reload, you can use:

### Option 1: Browser Extension

Install a live reload extension:
- **Chrome/Edge**: [LiveReload](https://chrome.google.com/webstore/detail/livereload)
- **Firefox**: [LiveReload](https://addons.mozilla.org/en-US/firefox/addon/livereload-web-extension/)

Then run a live reload server alongside the dev setup:
```bash
# Install globally
npm install -g live-server

# Watch the static directory
cd rootfs/webapp/static
live-server --port=8080 --watch=.
```

### Option 2: Flask-LiveReload

Add Flask-LiveReload for automatic reload (requires installation):

```bash
pdm add flask-livereload
```

Then in development mode, Flask will inject LiveReload scripts automatically.

## PDM Scripts Reference

```bash
# Backend development (Flask with hot reload)
pdm run dev

# Frontend watch (webpack watch only)
pdm run dev-watch-frontend

# Frontend build (production)
pdm run build-frontend

# Frontend build (development)
pdm run build-frontend-dev

# Watch script with auto-copy
pdm run watch-frontend

# Install frontend dependencies
pdm run install-frontend
```

## Troubleshooting

### Assets Not Updating in Browser

1. **Hard refresh**: Press Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (macOS)
2. **Check dev mode**: Ensure `LOCAL_TEST=True` is set in your environment
3. **Verify copy**: Check that files exist in `rootfs/webapp/static/`
4. **Clear browser cache**: Open DevTools → Network tab → Check "Disable cache"

### Webpack Watch Not Detecting Changes

```bash
# Increase file watcher limit (Linux)
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Check if webpack is running
ps aux | grep webpack
```

### Flask Not Reloading

1. **Check LOCAL_TEST**: Ensure environment variable is set
2. **File permissions**: Verify Python files are writable
3. **Syntax errors**: Check Flask console for Python errors

### Assets Not Copying

```bash
# Check if inotifywait is installed
which inotifywait

# Install on Ubuntu/Debian
sudo apt-get install inotify-tools

# Install on macOS
brew install fswatch

# Manually trigger copy
cd acarshub-typescript
./copy_test_assets.sh
```

### Port Already in Use

```bash
# Find process using port 5000 (Flask)
lsof -i :5000
# Kill if needed
kill -9 <PID>

# Find process using port 9000 (webpack-dev-server)
lsof -i :9000
```

### Build Errors

```bash
# Clean and rebuild frontend
cd acarshub-typescript
rm -rf node_modules dist
npm install
npm run build-dev

# Clean Python cache
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null
```

## Production Build

When ready to build for production:

```bash
# Build optimized frontend assets
pdm run build-frontend

# Copy to Flask directories
cd acarshub-typescript
./installer.sh  # or copy_test_assets.sh for local testing
```

This creates minified, optimized bundles with:
- Code splitting
- CSS minimization
- JS minification (Terser)
- Content hashing for cache busting

## Tips

- **Keep DevTools open**: Enable "Disable cache" in Network tab during development
- **Use browser extensions**: React DevTools, Redux DevTools work great
- **Monitor console**: Keep browser console open for JavaScript errors
- **Check Flask logs**: Watch terminal for backend errors and requests
- **Use source maps**: Enable source maps in DevTools for easier debugging

## Questions?

Check the main README.md or open an issue on GitHub.