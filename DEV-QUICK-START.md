# ACARS Hub Development - Quick Start

## 🚀 Prerequisites

### Option 1: Nix Flakes (Recommended)

All system-level tools managed automatically:

```bash
# With direnv (automatic)
direnv allow

# Without direnv (manual)
nix develop
```

The flake provides:

- Node.js, TypeScript, Biome
- `just` task runner
- `rrdtool`, `sqlite`, `cmake`, `pkg-config`
- Docker CLI + buildx + compose, QEMU (for cross-arch builds)
- Pre-commit hooks

Playwright is **not** flake-managed — it is installed via `npm` from
`acarshub-react/package.json` and run from `Dockerfile.e2e`. See
`AGENTS.md` for the full rationale.

### Option 2: Manual Installation

- **Node.js 20+** with npm 10+
- **Just** (command runner)
- **SQLite** 3.x
- **Docker** (for E2E tests and container builds)

---

## 🔧 One-Time Setup

```bash
# 1. Install dependencies (monorepo: acarshub-types + react + backend)
npm install

# 2. Configure environment variables
cp .env.example .env
# Edit .env with your settings (database path, decoder hosts, ADSB config, etc.)
nano .env

# 3. Seed a test database with fixture data (optional)
just seed-test-db
```

---

## 🔥 Development Mode

**Run these in separate terminal windows:**

### Terminal 1: Frontend Dev Server

```bash
just web
# or directly:
./dev-watch.sh
```

This runs Vite's dev server with HMR (hot module replacement). The
frontend talks to the backend over Socket.IO at the URL configured in
your `.env`.

### Terminal 2: Backend Dev Server

```bash
just server
# or directly:
cd acarshub-backend && npm run dev
```

This runs `tsx watch src/server.ts`, which reloads the Node.js +
Fastify + Socket.IO backend on TypeScript source changes.

**Then open:** the URL printed by the Vite dev server (typically
<http://localhost:5173>).

---

## 📝 What This Does

- **Frontend changes**: Vite HMR — modules swap without full reload
- **Backend changes**: `tsx watch` restarts the Node.js process
- **Real-time link**: Socket.IO `/main` namespace between frontend and backend
- **Database**: SQLite (path from `.env`); migrations applied automatically on backend start

---

## 🛠 Common Commands

### Development

```bash
# Start frontend dev server (Vite)
just web

# Start backend dev server (tsx watch)
just server
```

### Testing

```bash
# Run all frontend unit/integration tests
just test

# Frontend watch mode (auto-rerun on changes)
just test-watch

# Frontend interactive UI mode
just test-ui

# Frontend coverage report
just test-coverage

# Backend tests
just test-backend
just test-backend-watch
just test-backend-coverage

# E2E tests (Playwright, dockerised)
just test-e2e-docker

# Performance analysis (Lighthouse)
just lighthouse
```

### Quality Checks

```bash
# Quick check (frontend tests + pre-commit hooks)
just check

# Full CI check (types build + TypeScript + frontend build + tests + pre-commit)
just ci

# Pre-commit (before committing)
just add          # git add -A
just commit       # Runs ci-e2e + commits
```

### Database

```bash
# Seed a test database with fixture data
just seed-test-db

# Apply migrations to the database pointed at by your .env
cd acarshub-backend && npm run migrate

# Generate a new Drizzle migration from schema changes
cd acarshub-backend && npm run migrate:generate
```

### Dependency Updates

```bash
# Interactive Node.js dependency update (uses npm-chck)
just update

# Reinstall after a manual package.json change
just bump
```

---

## 🐛 Troubleshooting

### Frontend assets not updating?

1. **Hard refresh**: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
2. **DevTools**: Network → "Disable cache"
3. **Restart Vite**: stop `just web` and rerun

### Backend not reloading?

- Check the `just server` terminal for TypeScript errors
- Restart: `Ctrl+C` and `just server` again

### Port already in use?

```bash
# Find process using a port (e.g. 8080)
lsof -i :8080

# Kill if needed
kill -9 <PID>
```

### Nix environment issues?

```bash
# Update the flake lock
nix flake update

# Re-enter the shell
exit
nix develop

# With direnv
direnv reload
```

---

## 📂 File Locations

- **Frontend source**: `acarshub-react/src/`
- **Frontend build output**: `acarshub-react/dist/`
- **Backend source**: `acarshub-backend/src/`
- **Backend build output**: `acarshub-backend/dist/`
- **Shared types**: `acarshub-types/src/`
- **Database migrations**: `acarshub-backend/src/db/migrations/`
- **Environment config**: `.env` (copy from `.env.example`)
- **Container data volume**: `rootfs/webapp/data/` (created at runtime)

---

## ⚡ Pro Tips

1. **Keep DevTools open** with "Disable cache" enabled
2. **Watch the backend terminal** for Pino structured logs
3. **Use the browser console** for frontend debugging
4. **Source maps enabled** in dev mode for stepping through TypeScript
5. **Run `just ci`** before committing to catch issues early
6. **Use `just test-watch`** while developing for instant test feedback

---

## 🌐 Server Addresses

### Development Mode

- **Frontend (Vite dev server)**: <http://localhost:5173> (default)
- **Backend (Fastify)**: configured by `PORT` in `.env` (default 8080)

### Production Mode (Docker)

- **URL**: <http://localhost> (or configured host)
- **Port**: 80 (nginx proxy in front of the Node.js backend)

---

## 📚 More Documentation

- **[AGENTS.md](AGENTS.md)** — AI agent coding standards and rules
- **[dev-docs/](dev-docs/)** — Developer documentation
  - **CONTRIBUTING.md** — How to contribute
  - **SETUP.md** — Detailed environment setup
  - **CODING_STANDARDS.md** — Code quality requirements
  - **TESTING_GUIDE.md** — Testing patterns and strategies
- **[agent-docs/](agent-docs/)** — Architecture and design
  - **ARCHITECTURE.md** — System design and data flow
  - **DESIGN_LANGUAGE.md** — UI/UX patterns and components
  - **FEATURES.md** — Feature documentation
  - **TESTING.md** — Testing infrastructure and standards

---

## ❓ Questions?

- Check [GitHub Issues](https://github.com/sdr-enthusiasts/docker-acarshub/issues)
- Join Discord (link in README.md)
