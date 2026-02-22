# Development servers
web:
    ./dev-watch.sh

server:
    pdm run dev

server-node:
    cd acarshub-backend && env $(grep -v '^#' ../.env | xargs) npm run dev

# Node.js dependency updates
update:
    npm-chck -uE -i @acarshub/types || true

bump:
    npm i

# Python dependency updates
update-py:
    @echo "Updating Python dependencies..."
    pdm update
    @echo "Syncing requirements.txt with pyproject.toml..."
    ./sync-python-deps.sh
    @echo "✅ Python dependencies updated!"

bump-py:
    @echo "Installing Python dependencies..."
    pdm install
    @echo "✅ Python dependencies installed!"

# Update all dependencies (Node + Python)
update-all:
    @echo "Updating Node.js dependencies..."
    just update
    just bump
    @echo ""
    @echo "Updating Python dependencies..."
    just update-py
    @echo ""
    @echo "✅ All dependencies updated!"

# Database migration commands

# Usage: just db-init [path/to/db.db]
db-init DB_PATH="test_working.db":
    @echo "Creating fresh test database with all migrations..."
    @rm -f {{ DB_PATH }}
    @cd rootfs/webapp && alembic -x dbPath={{ absolute_path(DB_PATH) }} upgrade head
    @echo "✅ Database initialized at {{ DB_PATH }}"

# Usage: just db-migrate [path/to/db.db]
db-migrate DB_PATH="test_working.db":
    @echo "Applying latest migrations to existing database..."
    @cd rootfs/webapp && alembic -x dbPath={{ absolute_path(DB_PATH) }} upgrade head
    @echo "✅ Migrations applied to {{ DB_PATH }}"

# Testing commands
test:
    cd acarshub-react && npm test

test-watch:
    cd acarshub-react && npm run test:watch

test-ui:
    cd acarshub-react && npm run test:ui

test-coverage:
    cd acarshub-react && npm run test:coverage

# Backend Testing commands
test-backend:
    cd acarshub-backend && npm test

test-backend-watch:
    cd acarshub-backend && npm run test:watch

test-backend-coverage:
    cd acarshub-backend && npm run test:coverage

# E2E Testing commands
test-e2e:
    cd acarshub-react && npm run test:e2e

test-e2e-ui:
    cd acarshub-react && npm run test:e2e:ui

test-e2e-debug:
    cd acarshub-react && npm run test:e2e:debug

test-e2e-chromium:
    cd acarshub-react && npm run test:e2e:chromium

# Accessibility Testing commands
test-a11y:
    cd acarshub-react && npm run test:a11y

test-a11y-debug:
    cd acarshub-react && npm run test:a11y:debug

# Performance Testing commands
lighthouse:
    cd acarshub-react && npm run lighthouse

lighthouse-collect:
    cd acarshub-react && npm run lighthouse:collect

lighthouse-assert:
    cd acarshub-react && npm run lighthouse:assert

analyze:
    cd acarshub-react && npm run analyze

# Quality checks
check:
    cd acarshub-react && npm test
    pre-commit run --all-files

# Full CI-like check (unit/integration tests + linting + formatting)
ci:
    @echo "Building shared types package (required before TypeScript project references check)..."
    cd acarshub-types && npm run build
    @echo "Running TypeScript checks (all projects via project references)..."
    npx tsc --build --force
    @echo "Running frontend build..."
    cd acarshub-react && npm run build
    @echo "Running backend build..."
    cd acarshub-backend && npm run build
    @echo "Running Biome checks..."
    biome check --error-on-warnings acarshub-react/ acarshub-backend/
    @echo "Running frontend tests with coverage..."
    cd acarshub-react && npm run test:coverage
    @echo "Running backend tests with coverage..."
    cd acarshub-backend && npm run test:coverage
    @echo "Running pre-commit hooks..."
    pre-commit run --all-files
    @echo "✅ All checks passed!"

# Full CI + E2E tests — uses Docker-based Playwright (all browsers)
ci-e2e:
    @echo "Running all CI checks..."
    just ci
    @echo "Running E2E tests (Docker Playwright)..."
    just test-e2e-docker
    @echo "✅ All checks and E2E tests passed!"

# Run Playwright E2E tests inside Docker (supports Chromium + Firefox + WebKit)
# Starts the Vite dev server on the host, then runs Playwright in the official
# Playwright Docker image so all three browser engines have their system deps.
#
# Uses --network=host so the container can reach localhost:3000.
#
# Mounts the full monorepo root so `npm ci` can read the root package-lock.json.
# Named volumes shadow the Nix-built host node_modules with Ubuntu-compatible
# ones inside the container. Docker reuses the volumes on subsequent runs so

# npm ci is fast after the first install.
test-e2e-docker:
    @echo "Building frontend for E2E tests (VITE_E2E=true exposes __ACARS_STORE__)..."
    VITE_E2E=true npm run build --workspace=acarshub-react
    @echo "Killing any stale process on port 3000..."
    fuser -k 3000/tcp 2>/dev/null || true
    @echo "Starting vite preview server in background..."
    cd acarshub-react && npx vite preview --port 3000 --strictPort &
    sleep 3
    @echo "Running Playwright in Docker (all browsers)..."
    docker run --rm --network=host \
      -v $(pwd):/work \
      -v acarshub-e2e-root-modules:/work/node_modules \
      -v acarshub-e2e-react-modules:/work/acarshub-react/node_modules \
      -v acarshub-e2e-backend-modules:/work/acarshub-backend/node_modules \
      -v acarshub-e2e-types-modules:/work/acarshub-types/node_modules \
      -w /work \
      -e CI=true \
      -e PLAYWRIGHT_DOCKER=true \
      mcr.microsoft.com/playwright:v1.58.2-noble \
      bash -c "npm ci && cd acarshub-react && npx playwright test --reporter=line" || (fuser -k 3000/tcp 2>/dev/null || true; exit 1)
    fuser -k 3000/tcp 2>/dev/null || true
    @echo "✅ E2E tests passed!"

# Debug runner for E2E tests — no CI mode so retries=0 and workers run in parallel.
# Builds the app once, then serves it via vite preview (static bundle) so the
# server handles concurrent browser workers without getting overwhelmed.

# Accepts extra Playwright args via ARGS (e.g. just test-e2e-docker-debug --grep "smoke").
test-e2e-docker-debug *ARGS='':
    @echo "Building frontend for E2E tests (VITE_E2E=true exposes __ACARS_STORE__)..."
    VITE_E2E=true npm run build --workspace=acarshub-react
    @echo "Killing any stale process on port 3000..."
    fuser -k 3000/tcp 2>/dev/null || true
    @echo "Starting vite preview server in background..."
    cd acarshub-react && npx vite preview --port 3000 --strictPort &
    sleep 3
    @echo "Running Playwright in Docker (debug mode, no retries)..."
    docker run --rm --network=host \
      -v $(pwd):/work \
      -v acarshub-e2e-root-modules:/work/node_modules \
      -v acarshub-e2e-react-modules:/work/acarshub-react/node_modules \
      -v acarshub-e2e-backend-modules:/work/acarshub-backend/node_modules \
      -v acarshub-e2e-types-modules:/work/acarshub-types/node_modules \
      -w /work \
      -e PLAYWRIGHT_DOCKER=true \
      mcr.microsoft.com/playwright:v1.58.2-noble \
      bash -c "npm ci && cd acarshub-react && npx playwright test --reporter=line {{ ARGS }}" || (fuser -k 3000/tcp 2>/dev/null || true; exit 1)
    fuser -k 3000/tcp 2>/dev/null || true
    @echo "✅ E2E tests done!"

# Build the test Docker image (ah:test) from Node.Dockerfile

# Must be run before just test-e2e-fullstack
build-test-image:
    @echo "Building test Docker image (ah:test) from Node.Dockerfile..."
    docker build -f Node.Dockerfile -t ah:test .
    @echo "✅ Test image built: ah:test"

# Run full-stack integration E2E tests via Docker Compose

# Requires the production Docker image to be built first: docker build -t ah:test .
test-e2e-fullstack:
    @echo "Running full-stack E2E tests via Docker Compose..."
    docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from playwright
    docker compose -f docker-compose.test.yml down --volumes
    @echo "✅ Full-stack E2E tests passed!"

# Generate test fixture data (requires rrdtool — available in Nix dev env)

# Run seed-test-rrd once and commit the resulting test-fixtures/test.rrd file.
seed-test-rrd:
    @echo "Generating RRD fixture (72h of 1-min data across all 4 archive resolutions)..."
    cd acarshub-backend && npx tsx scripts/generate-test-rrd.ts
    @echo "✅ RRD fixture written to test-fixtures/test.rrd — review and commit"

# Generate seed SQLite database from JSONL fixture files
seed-test-db:
    @echo "Generating test seed database from fixture JSONL files..."
    cd acarshub-backend && npx tsx scripts/seed-test-db.ts
    @echo "✅ Seed database written to test-fixtures/seed.db"

# Regenerate all test fixture data
seed-all:
    just seed-test-rrd
    just seed-test-db
    @echo "✅ All test fixtures generated — review and commit changes to test-fixtures/"

# prepare for commit

add:
    git add -A

actually-commit:
    git commit -S

commit: && add ci-e2e actually-commit
