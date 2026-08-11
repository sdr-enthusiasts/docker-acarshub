# ACARS Hub -- AI Agent Guide

This document is the always-on orientation for AI coding agents
working in ACARS Hub. **Operational procedures are no longer inlined
here** -- they live as opencode skills (sourced from fred's nixos
config repo at `~/GitHub/nixos/.opencode/skills/`, wired in via this
repo's `opencode.json`) and are loaded on demand.

## READ THIS DOCUMENT BEFORE MAKING ANY CHANGES

## Overview

ACARS Hub is a web application for receiving, decoding, and displaying
ACARS (Aircraft Communications Addressing and Reporting System)
messages.

- **Frontend**: React 19 + TypeScript with Catppuccin theming
- **Backend**: Node.js + Fastify + Socket.IO for real-time messaging
- **Database**: SQLite with Drizzle ORM (custom migration runner, no
  Alembic)
- **Deployment**: Docker container with nginx + Node.js

## Documentation Structure

**Start here**, then refer to specialized docs:

- **AGENTS.md** (this file) -- orientation, document map, skill index.
- **agent-docs/ARCHITECTURE.md** -- system design, data flow,
  deployment architecture
- **agent-docs/DESIGN_LANGUAGE.md** -- UI/UX patterns, component usage,
  accessibility
- **agent-docs/CATPPUCCIN.md** -- color palette reference for theming
- **agent-docs/FEATURES.md** -- feature documentation (decoders,
  search, alerts, map)
- **agent-docs/TESTING.md** -- test strategy, patterns, infrastructure
- **agent-docs/V4.3.md** -- v4.3 aircraft session architecture and
  implementation plan
- **agent-docs/DECODER_CONNECTIONS.md** -- authoritative reference for
  decoder ingress (TCP/UDP/ZMQ, listener wiring)
- **agent-docs/DB_OPTIMIZATION.md** -- database size optimization
  (dead-index removal, UUID->integer FK migration)
- **agent-docs/MEMORY_OPTIMIZATION.md** -- backend memory reduction via
  time-series compaction
- **agent-docs/MESSAGE_RING_BUFFER.md** -- on-connect warm-state ring
  buffer (replaces per-connect DB query)

---

## Skills you will need in this repo

| Skill                        | When it fires                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `acarshub-design-language`   | Building UI -- React components, SCSS, theming, accessibility, mobile responsiveness.                  |
| `acarshub-tool-additions`    | Adding any dependency -- names which manifest (flake.nix / package.json / Dockerfile.e2e) covers what. |
| `acarshub-socket-namespace`  | Touching any Socket.IO code on frontend or backend.                                                    |
| `typescript-best-practices`  | Any `.ts` / `.tsx` edit. No `any`, no `@ts-ignore`, structured logger.                                 |
| `flake-dev-shell-discipline` | Adding any system-level tool. Modify `flake.nix`, stop, wait for `nix develop`.                        |
| `flaky-tests-are-bugs`       | A test fails sporadically, a retry / longer timeout / `it.skip` is being considered.                   |
| `precommit-fix-loop`         | A `just ci` / commit hook rejects the change.                                                          |
| `commit-discipline`          | Before any commit / PR.                                                                                |
| `testing-mandate`            | Before declaring any task done -- tests for every new code path, regression tests for every bugfix.    |
| `no-summary-documents`       | Before creating any new markdown file. The PHASE_X_SUMMARY.md / IMPLEMENTATION_PROGRESS.md ban.        |
| `markdown-lint-discipline`   | Before writing or editing any `.md` file. Common markdownlint pitfalls (MD031, MD040, table widths).   |

---

## Critical Rules (headlines)

### Testing mandate

Every new function, service, module, or bug fix needs tests. "It
compiles and existing tests pass" is insufficient. Bug fixes need
**regression tests** that demonstrably fail without the fix. Full rules
in `testing-mandate`; flake handling in `flaky-tests-are-bugs`.

### No summary documents

Never create `PHASE_X_SUMMARY.md`, `IMPLEMENTATION_PROGRESS.md`,
`REFACTOR_NOTES.md`, or any other "what I did" markdown. Document the
system, not the work. Full prohibition list and allowed-doc patterns
in `no-summary-documents`.

### Markdown standards

- Language specifier on every code block (`bash`, `typescript`, `json`,
  ...)
- Headings, not bold, for section titles
- No duplicate headings with same content in same document
- Blank lines around headings and code blocks
- GitHub-flavored markdown with strict linting

Document **WHY**, not **WHAT**. Code shows what.

---

## Code Quality

### Continuous Integration

All changes MUST pass:

```bash
just ci
```

Runs Biome lint+format, TypeScript strict compile, markdown lint, and
all tests (unit, integration, E2E).

### TypeScript

Strict mode always. No `any`, explicit return types, explicit parameter
types, interfaces for complex objects, generics where they earn it.
The structured logger (`createLogger("<area>:<module>")`) replaces all
`console.*`. Full rules in `typescript-best-practices`.

### Styling

No inline styles. No CSS frameworks. Catppuccin via CSS variables.
SCSS `@use` / `@forward`. Mobile-first (320px base, 768px tablet,
1024px desktop). 44x44px touch targets. WCAG 2.1 AA. Full rules in
`acarshub-design-language`.

---

## Development Environment

### Nix Flakes

All system-level tools managed via `flake.nix`: Node.js, TypeScript,
Biome, `just`, `rrdtool`, `sqlite`, `cmake`, `pkg-config`, Docker CLI

- buildx + compose, QEMU (cross-arch builds), pre-commit hooks (via
  `git-hooks.nix`).

Playwright is **not** flake-managed -- it's an npm dep in
`acarshub-react/package.json`, run from `Dockerfile.e2e`. Python and
PDM are no longer in the flake (the Python backend was retired).

**Adding a new tool**: see `acarshub-tool-additions` (the catalog of
where each kind of dep lives) and `flake-dev-shell-discipline` (the
generic stop-and-wait protocol). The headline: for system tools, add
to `flake.nix`, **STOP**, tell the user to `nix develop` /
`direnv allow`, wait for confirmation, then continue.

### Git commands

Always use `--no-pager` for programmatic git usage:

```bash
git --no-pager diff
git --no-pager log --oneline -10
git --no-pager show HEAD
```

---

## Code Organization

### File structure

```text
acarshub-react/
├── src/
│   ├── components/     # Reusable React components
│   ├── pages/          # Page components (Live Messages, Map, etc.)
│   ├── hooks/          # Custom React hooks
│   ├── store/          # Zustand state management
│   ├── services/       # Socket.IO, API services
│   ├── types/          # TypeScript interfaces
│   ├── utils/          # Utility functions
│   └── styles/         # SCSS modules
├── e2e/                # Playwright E2E tests
├── public/             # Static assets
└── tests/              # Test fixtures
```

### Component patterns, state, Socket.IO

The canonical examples (Button component, Zustand store, Socket.IO
events) live in `acarshub-design-language` and
`acarshub-socket-namespace`. The Socket.IO `/main` namespace is bound
at construction; **do NOT pass `"/main"` as an extra arg to
`emit(...)`** -- that's a Flask-SocketIO Python-client artifact that
was removed in TYPE-01 / TYPE-02 and must not return. Full context in
`acarshub-socket-namespace`.

Logger namespaces are **colon-namespaced** (`services:adsb-poller`,
`db:migrate`, `socket:handlers`). Single-token namespaces reserved for
true aggregators (`app`, `config`, `server`). The generic strict-mode /
no-`any` / structured-logger rules live in `typescript-best-practices`;
the acarshub-specific namespace convention and the "no inline styles /
SCSS only / Catppuccin via CSS vars / mobile-first" stack live in
`acarshub-design-language`.

---

## Testing Standards

> The full **testing-mandate** skill expands this. Coverage goals are
> a floor, not a ceiling.

### Coverage goals

- Utilities: 90%+
- Stores: 80%+
- Components: 70%+
- Backend services: 80%+
- Backend formatters/enrichment: 90%+

### Test types

- **Frontend unit** (Vitest + RTL):
  `acarshub-react/src/{utils,store,components}/__tests__/`
- **Backend unit** (Vitest):
  `acarshub-backend/src/{,db,services,formatters,socket}/__tests__/`
- **Integration** (Vitest): real SQLite in-memory DB for DB/migration
  tests; mocked Socket.IO events.
- **E2E** (Playwright): critical user flows, WCAG 2.1 AA audits,
  Lighthouse perf validation.

See `agent-docs/TESTING.md` for patterns and strategies.

---

## Accessibility & performance

**WCAG 2.1 AA**: 4.5:1 contrast, 44x44px touch targets, keyboard nav,
ARIA, focus management. `just test-a11y` runs axe-core.

**Bundle**: <500KB per chunk gzipped (`npm run analyze`). **Runtime**:
60fps with 100+ aircraft on map; no memory leaks in long-running
sessions; `React.memo` / `useMemo` / `useCallback` where they earn it.
`just lighthouse` runs Lighthouse CI.

---

## Quality Gates (before committing)

1. `just ci` passes (all linting, tests, TypeScript)
2. No `any` types introduced
3. No inline styles
4. No `console.*` statements (use logger)
5. Mobile responsiveness verified
6. Accessibility checked (keyboard nav, screen reader)
7. Component patterns match DESIGN_LANGUAGE.md
8. Tests written for ALL new code
9. Regression test written if this is a bug fix

---

## Agent Workflow

### Before starting

1. Read AGENTS.md (this file).
2. Read `agent-docs/DESIGN_LANGUAGE.md` for UI patterns.
3. Read `agent-docs/ARCHITECTURE.md` for system understanding.
4. Check if new system tools needed -> `acarshub-tool-additions` +
   `flake-dev-shell-discipline`.
5. Understand current task scope.

### During development

- Incremental changes; run `biome check` / `tsc --noEmit` frequently.
- Test in browser regularly.
- Follow `DESIGN_LANGUAGE.md` patterns.
- Mobile responsive at 375px, 768px, 1024px.
- Document WHY, not WHAT.
- Write tests as you go; do not defer to the end.
- If unclear, ask.

### Before completing

1. `just ci` green.
2. No `any` types introduced.
3. No inline styles.
4. Mobile responsiveness verified.
5. Patterns match `DESIGN_LANGUAGE.md`.
6. Every new function/service/module has test coverage.
7. Bug fixes have regression tests.
8. `git --no-pager diff` to review.
9. Suggest next steps.

### Communication

Direct and technical. Explain architectural decisions. Highlight
trade-offs. Point out potential issues proactively. Code examples when
explaining. No apologies for expected behavior.

---

## Getting help

**Topics**:

- UI/UX -> `agent-docs/DESIGN_LANGUAGE.md` + `acarshub-design-language` skill
- Color usage -> `agent-docs/CATPPUCCIN.md`
- Feature details -> `agent-docs/FEATURES.md`
- Testing -> `agent-docs/TESTING.md` + `testing-mandate` skill
- System design -> `agent-docs/ARCHITECTURE.md`

**Debugging**: Settings -> Advanced -> Log Viewer; set level to Debug
or Trace; reproduce; export.

---

## Questions before making changes

1. Does this follow TypeScript strict mode? (no `any`)
2. Does this use the logger? (no `console.*`)
3. Is styling in SCSS files? (no inline styles)
4. Is it mobile-first responsive? (test at 320px+)
5. Does it match `DESIGN_LANGUAGE.md` patterns?
6. Will `just ci` pass?
7. Are tests written for ALL new code?
8. If this is a bug fix, is there a regression test?
9. Is the documentation updated (if needed)?
