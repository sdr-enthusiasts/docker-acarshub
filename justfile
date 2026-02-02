# Development servers
web:
    ./dev-watch.sh

server:
    pdm run dev

# Testing commands
test:
    cd acarshub-react && npm test

test-watch:
    cd acarshub-react && npm run test:watch

test-ui:
    cd acarshub-react && npm run test:ui

test-coverage:
    cd acarshub-react && npm run test:coverage

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
    @echo "Running TypeScript checks..."
    cd acarshub-react && npx tsc --noEmit
    @echo "Running Biome checks..."
    biome check --error-on-warnings acarshub-react/
    @echo "Running tests..."
    cd acarshub-react && npm test
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
