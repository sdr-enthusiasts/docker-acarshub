---
name: acarshub-tool-additions
description: Use ONLY when working in the docker-acarshub repository AND a task may require adding a system tool, npm package, or other dependency. Names exactly which manifest covers which kind of dependency in this repo (flake.nix, package.json, Dockerfile.e2e for Playwright). The generic stop-and-wait protocol for system tools lives in the shared `flake-dev-shell-discipline` skill — this skill is the acarshub-specific catalog that skill points back to.
---

# ACARS Hub: where dependencies actually live

This skill is the **acarshub-specific catalog** for the generic
`flake-dev-shell-discipline` policy. It names the manifests; the
policy on "add to flake, stop, wait for `nix develop`" lives in the
shared skill.

## What's managed where

The ACARS Hub dev environment is fully managed by `flake.nix` (Node,
TypeScript, Biome, `just`, `rrdtool`, `sqlite`, `cmake`, `pkg-config`,
Docker CLI + buildx + compose, QEMU, pre-commit hooks via
`git-hooks.nix`).

**Playwright is not flake-managed** — it's an npm dep installed via
`acarshub-react/package.json`, run from `Dockerfile.e2e`. Python and
PDM are gone (the Python backend was retired).

## Where to add what

| Kind of dep                                        | Goes in                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| React component / TS library / TS dev dep          | `acarshub-react/package.json` (then `npm install`)                                                                 |
| Root-level dev tooling (TS, biome) when applicable | the appropriate `package.json`                                                                                     |
| Playwright browser update                          | `acarshub-react/package.json` + verify `Dockerfile.e2e` still installs the matching browser                        |
| Compiler, system library, CLI utility on `PATH`    | `flake.nix` `devShells.default` packages — then follow `flake-dev-shell-discipline` (STOP, wait for `nix develop`) |
| pre-commit hook                                    | `git-hooks.nix` (via `flake.nix`)                                                                                  |

## What NOT to do

- **Do NOT add a Python or PDM dep.** That backend is gone; if you
  think you need Python, stop and surface — the answer is almost
  certainly "no".
- **Do NOT bypass `flake.nix` for system tools.** See
  `flake-dev-shell-discipline` for the full rule and rationale.
- **Do NOT add a new node version** alongside the existing one. Stop
  and confirm the pinned version is genuinely insufficient.
