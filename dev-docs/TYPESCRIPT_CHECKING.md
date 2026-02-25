# TypeScript Checking Strategy

## Overview

This project uses **TypeScript Project References** to manage type checking across multiple packages in the monorepo. This ensures consistent, comprehensive type checking in both CI and pre-commit hooks.

## Architecture

### Project Structure

```text
docker-acarshub/
├── tsconfig.json              # Root config with project references
├── tsconfig.base.json         # Shared compiler options
├── acarshub-react/
│   ├── tsconfig.json          # Frontend root (references app + node)
│   ├── tsconfig.app.json      # Main app + tests (composite)
│   └── tsconfig.node.json     # Vite config (composite)
└── acarshub-backend/
    └── tsconfig.json          # Backend (composite)
```

### Root Configuration

The root `tsconfig.json` uses TypeScript's project references feature:

```json
{
  "files": [],
  "references": [
    { "path": "./acarshub-react" },
    { "path": "./acarshub-backend" }
  ]
}
```

This tells TypeScript to:

1. Check all referenced projects
2. Follow their internal references (frontend has 2 sub-configs)
3. Respect `composite: true` settings
4. Use incremental compilation where possible

## Type Checking Commands

### CI (Complete Check)

```bash
just ci
```

Runs `npx tsc --build --force` which:

- Type-checks **all** projects via project references
- Includes frontend source, tests, Vite config, and backend
- Uses `--force` to ignore incremental cache (clean build)
- Fails fast on first error

### Pre-Commit (Comprehensive Type Checking)

```bash
git commit
```

Pre-commit hooks run **both Biome linting and TypeScript checking**:

- Fast feedback on style/formatting issues
- Comprehensive type checking via `tsc --build`
- Checks all source files AND test files
- Configured in `flake.nix`:

```nix
javascript = {
  enableBiome = true;
  enableTsc = true;
  tsConfig = "./tsconfig.json";  # Uses project references
};
```

The custom pre-commit hook (FredSystems/pre-commit-checks) uses `tsc --build` which properly handles project references and checks all referenced configs.

**Note**: Pre-commit type checking is more comprehensive than `tsc --noEmit` because it checks test files too (via project references).

### Manual Check (Per Project)

You can check individual projects if needed:

```bash
# Frontend app + tests
cd acarshub-react && npx tsc --noEmit --project tsconfig.app.json

# Frontend Vite config
cd acarshub-react && npx tsc --noEmit --project tsconfig.node.json

# Backend
cd acarshub-backend && npx tsc --noEmit
```

## Why Project References?

### Before (Per-Directory Checking)

```bash
cd acarshub-react && npx tsc --noEmit   # Which config? Ambiguous!
cd acarshub-backend && npx tsc --noEmit # Duplicated commands
```

**Problems**:

- Had to specify config explicitly (`--project`) or hope for correct default
- Easy to miss a config (e.g., `tsconfig.node.json`)
- Tests could be excluded if config wasn't set up right
- No coordination between frontend/backend checks
- `tsc --noEmit` with root project references config doesn't check anything!

### After (Project References)

```bash
npx tsc --build --force  # From root
```

**Benefits**:

- ✅ Single command checks everything
- ✅ TypeScript-native solution for monorepos
- ✅ Explicit declaration of what to check (`references`)
- ✅ Incremental compilation support (use `tsc --build` without `--force` locally)
- ✅ Catches cross-package type errors
- ✅ IDE integration (VS Code understands project references)
- ✅ Actually type-checks all referenced projects (unlike `--noEmit` with empty root)

## Composite Projects

All sub-configs use `composite: true`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo"
  }
}
```

This enables:

- Incremental compilation (faster rebuilds)
- Project references support
- Better IDE performance
- Build info caching

## Test Files

**Critical**: Test files ARE included in type checking.

- `tsconfig.app.json` includes `src/**/*` (which includes `__tests__`)
- Tests must pass strict TypeScript checks
- This catches type errors in test fixtures, mocks, and assertions
- Revealed ~107 pre-existing test type errors when `paths` mapping was added

## Common Issues

### "Tests aren't being type-checked"

Check that your `tsconfig.app.json`:

1. Includes the test directory in `include`
2. Has `composite: true` set
3. Is referenced by the parent `tsconfig.json`
4. Has proper `paths` mapping if using `@/` aliases

### "Pre-commit passes but CI fails"

This should **not** happen - pre-commit uses the same `tsc --build` command as CI. If you see this:

1. Ensure you've regenerated pre-commit hooks after updating `flake.nix`:

   ```bash
   nix develop  # or direnv allow
   ```

2. Run pre-commit manually to verify:

   ```bash
   pre-commit run tsc --all-files
   ```

3. Check that `.pre-commit-config.yaml` includes the tsc hook

### "tsc --build is slow"

For local development, omit `--force` to use incremental compilation:

```bash
npx tsc --build  # Uses .tsbuildinfo cache files
```

This is much faster on subsequent runs. CI uses `--force` to ensure clean builds and catch all errors.

### "Difference between tsc --noEmit and tsc --build?"

- `tsc --noEmit`: Type-checks files directly specified in the config, but **skips test files** if they're excluded
- `tsc --build`: Follows project references, checks **all referenced projects including tests**, uses incremental compilation

Our setup:

- **Pre-commit**: Uses `tsc --build` via custom hook (FredSystems/pre-commit-checks)
- **CI**: Uses `tsc --build --force` for clean builds
- **Local dev**: Use `tsc --build` (without `--force`) for faster incremental checks

This ensures test files are type-checked everywhere, catching errors early.

## Migration Notes

If you need to add a new package:

1. Create its `tsconfig.json` with `composite: true`
2. Add reference in root `tsconfig.json`:

   ```json
   {
     "references": [
       { "path": "./acarshub-react" },
       { "path": "./acarshub-backend" },
       { "path": "./new-package" }
     ]
   }
   ```

3. Run `npx tsc --build` to verify
4. Pre-commit will automatically pick it up

## References

- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [Composite Projects](https://www.typescriptlang.org/tsconfig#composite)
- [git-hooks.nix JavaScript Hooks](https://github.com/cachix/git-hooks.nix)
