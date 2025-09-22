# Repository Guidelines

## Project Structure & Module Organization
- `src/` — TypeScript sources for the composite action (`dependency-review.ts`, `check-ossf.ts`, `check-guarddog.ts`, `frozen-install.ts`).
- `dist/` — Built JS (committed). Keep in sync with `src/` via `pnpm build`.
- `tests/` — Jest tests (`*.test.ts`).
- `action.yml` — Composite GitHub Action entry.
- `.github/workflows/` — CI and self-test workflows.

## Build, Test, and Development Commands
- Install: `pnpm install --frozen-lockfile` (use Corepack: `corepack enable`).
- Lint: `pnpm lint` (Biome).
- Test: `pnpm test` or `pnpm test:watch` (Jest + ts-jest).
- Build: `pnpm build` (tsup → `dist/`). CI fails if `dist/` is out of date.
- Example run: `node dist/check-ossf.js changed.json /tmp/ossf`.

## Coding Style & Naming Conventions
- Language: TypeScript (`strict: true`). Target `ES2020`, module `CommonJS`.
- Indentation: 2 spaces; prefer double quotes and semicolons (match existing files).
- Files: kebab-case (e.g., `check-guarddog.ts`).
- Symbols: `camelCase` variables/functions, `PascalCase` types/classes.
- Linting/formatting: `pnpm lint` (Biome) must pass before PR.

## Testing Guidelines
- Framework: Jest (`node` env) with `ts-jest`.
- Location/pattern: `tests/**/**.test.ts` (config also picks up `src/**`).
- Behavior: avoid real network; prefer stubs/env overrides. Verify file outputs in temp dirs.
- Coverage: reports to `coverage/` (no enforced threshold). Run `pnpm test` locally.

## Commit & Pull Request Guidelines
- Use Conventional Commits seen in history: `feat:`, `fix:`, `docs:`, `refactor:`, `improve:`.
  - Example: `feat: add multi-ecosystem frozen install`
- PRs must include:
  - Clear description and linked issues (e.g., `Closes #123`).
  - Rationale and risk notes; logs/screenshots when behavior/outputs change.
  - Updated `dist/` (run `pnpm build`) and docs (`README.md`) if inputs/behavior change.
  - Green CI (lint, tests, build).

## Security & Configuration Tips
- Do not commit secrets. `dependency-review` requires `GITHUB_TOKEN` at runtime (CI provides it).
- Local Node: use `lts/*` or Node 18+; project CI builds with pnpm + Corepack.
- When adding new action inputs/steps, update `action.yml`, tests, and README accordingly.
