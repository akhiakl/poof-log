# poof-log

A development-only global `poof` (every `console` method, plus `poof.enabled`) for Node.js. Apps preload it (`node --import poof-log`, or `--require`), never import it. When on (`NODE_ENV=development` or `DEBUG_ENABLED=true`, never in production) it prints `[project] [METHOD] (file:line) message`. With `DEBUG_FILE=true` it also appends to `<project>.log` and deletes that file when the process stops. When off it does nothing.

This file is the single source of rules for every AI agent and human contributor. `CLAUDE.md` only imports it. Do not fork the rules into agent-specific files.

## Hard constraints

- **Zero cost when off.** The off path is an empty function: no `package.json` read, no file, no listeners, no stack inspection. All enabled-only work lives in `init()`, which the gate calls.
- **Every `poof` method returns `void` and never waits.** The file write is a background task. Do not make callers `await` it or return its promise.
- **The log file is opt-in** (`DEBUG_FILE=true`, or `keep` to retain it). Without it there is no file and no process listeners. `keep` is the one exception to "never waits": it appends synchronously so nothing is lost on a crash.
- **No runtime dependencies.** Node built-ins only. Dev tooling stays in `devDependencies`.
- **Never imported by app code.** The README, tests and examples use the preload flags only. The global type reaches TypeScript through `"types": ["poof-log"]`.
- **Supports Node >=24.** Do not use APIs newer than that, and keep `@types/node` on 24.x.

## Layout

| Path              | What                                                                        |
| ----------------- | --------------------------------------------------------------------------- |
| `src/index.ts`    | The whole engine, one commented file                                        |
| `test/`           | Vitest. `debug.test.ts` runs `test/fixtures/app` scripts as child processes |
| `.github/`        | Workflows, PR template, `scripts/check-pr-body.sh`, Dependabot, CODEOWNERS  |
| `.husky/`         | Git hooks: branch name, lint-staged, commitlint                             |
| `.agents/skills/` | Repo skills, readable by any agent. `.claude/skills/` symlinks to them      |

## Commands

```sh
pnpm install
pnpm check          # typecheck + lint + format:check + test; run before every handoff
pnpm test | lint | typecheck | format | build
```

Use `pnpm`, never `npm` or `npx` (a `devEngines` rule makes npm fail here); use `pnpm exec` to run a binary.

## Working rules

- **Test first.** Write the failing test, watch it fail for the right reason, then fix. Never skip, weaken or delete a test to get green.
- **Fix the root cause once**, in the shared code, not per caller.
- **Edit `src/index.ts` with the `engine-change` skill.** It has invariants that are easy to break quietly.
- **Never bypass hooks** (`--no-verify`) or disable a lint rule without a one-line reason.
- **Pin tooling deliberately.** TypeScript stays on 6.0.x because typescript-eslint supports `<6.1.0`. Check `pnpm outdated` and the peer ranges before bumping.
- Keep changes small and complete: update tests, README and fixtures your change touches.

## Git workflow

- `main` is protected. Work on a branch, open a PR, squash merge. One concern per PR.
- **Branches** follow Conventional Branch: `feature/`, `bugfix/`, `hotfix/`, `chore/` or `release/`, then lowercase-kebab-case (`feature/add-no-color`). Checked on commit and push by `.husky/check-branch-name`.
- **Commits and PR titles** are Conventional Commits: `type(scope)?: subject`. Types: `build chore ci docs feat fix perf refactor revert style test`. Body lines are at most 100 characters.
- **No AI attribution** in commit messages or PR descriptions: no `Co-authored-by` for an agent, no "generated with" lines.
- **PR descriptions** fill in every section of `.github/pull_request_template.md` and tick every checklist box (add "(n/a)" if one does not apply). CI fails otherwise.
- **Review comments:** reply to every thread, then resolve it, both after a fix (say what changed and the commit) and after rejecting one (say why). See the `pr-workflow` skill.

## Skills

Repo skills live in `.agents/skills/<name>/SKILL.md` (the open Agent Skills format). Claude Code reads `.claude/skills/`, so each skill has a symlink there. To add one, create the folder under `.agents/skills/` and the symlink; `test/agents.test.ts` fails if they drift.

- `engine-change`: editing `src/index.ts` and its tests safely.
- `pr-workflow`: branch, commit, PR, checks and review-thread handling.
- `ci-and-security`: GitHub Actions, Dependabot, Snyk and dependency overrides.
