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

# Quality checks
check:
    cd acarshub-react && npm test
    pre-commit run --all-files

# Full CI-like check (tests + linting + formatting)
ci:
    @echo "Running TypeScript checks..."
    cd acarshub-react && npx tsc --noEmit
    @echo "Running Biome checks..."
    biome check acarshub-react/
    @echo "Running tests..."
    cd acarshub-react && npm test
    @echo "Running pre-commit hooks..."
    pre-commit run --all-files
    @echo "✅ All checks passed!"

# prepare for commit

add:
    git add -A

actually-commit:
    git commit -S

commit: && add ci actually-commit
