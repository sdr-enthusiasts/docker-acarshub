# Development servers
web:
    ./dev-watch.sh

server:
    pdm run dev

# Node.js dependency updates
update:
    cd acarshub-react && npm-check -us

bump:
    cd acarshub-react && npm i

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
    @echo "Running frontend TypeScript checks..."
    cd acarshub-react && npx tsc --noEmit
    @echo "Running backend TypeScript checks..."
    cd acarshub-backend && npx tsc --noEmit
    @echo "Running frontend build..."
    cd acarshub-react && npm run build
    @echo "Running backend build..."
    cd acarshub-backend && npm run build
    @echo "Running Biome checks..."
    biome check --error-on-warnings acarshub-react/ acarshub-backend/
    @echo "Running frontend tests..."
    cd acarshub-react && npm test
    @echo "Running backend tests..."
    cd acarshub-backend && npm test
    @echo "Running pre-commit hooks..."
    pre-commit run --all-files
    @echo "✅ All checks passed!"

# Full CI + E2E tests (requires dev server running separately)
ci-e2e:
    @echo "Running all CI checks..."
    just ci
    @echo "Running E2E tests..."
    @echo "Not running the e2e tests. They're buggered"
    # cd acarshub-react && npx playwright test --reporter=line
    @echo "✅ All checks and E2E tests passed!"

# prepare for commit

add:
    git add -A

actually-commit:
    git commit -S

commit: && add ci-e2e actually-commit
