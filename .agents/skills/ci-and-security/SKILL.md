---
name: ci-and-security
description: How poof-log's GitHub Actions, Dependabot, CodeQL, Snyk and dependency overrides are set up and how to change them safely. Use when editing .github/workflows, dependabot.yml, .snyk, pnpm-workspace.yaml overrides, or when a security check fails.
---

# CI and security

## Workflows (`.github/workflows/`)

| File              | What                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`          | Format, lint, typecheck, test, build, then typecheck `examples/basic`, on Node 24 and 26, then one `Quality Gate` PR comment |
| `pr-title.yml`    | Conventional PR title, via a shared workflow in `akhiakl/ci-workflows`                                                       |
| `pr-template.yml` | Runs `.github/scripts/check-pr-body.sh`; its tests are `test/pr-body.test.ts`                                                |
| `codeql.yml`      | CodeQL for `javascript-typescript`                                                                                           |

## Rules

- **Reference actions by version tag, not commit hash**: `actions/checkout@v7`, `pnpm/setup@v3`, `akhiakl/ci-workflows@v1.4.0`. Dependabot bumps them weekly.
- **Use the exact tag for `akhiakl/ci-workflows`.** Its moving `v1` tag lagged `v1.4.0`, so check `gh api repos/akhiakl/ci-workflows/tags` before choosing.
- Keep the Node matrix in sync with `engines` in `package.json`. Do not repeat versions in labels.
- Pass untrusted values (PR body, titles) to scripts through `env`, never by interpolating `${{ }}` into a `run:` script.
- Dependabot PRs skip `pr-template.yml` and the Quality Gate job (generated bodies, read-only token). Keep those `if:` guards.
- Test a workflow change by what it does, not just by `prettier --check`: run the script locally, then read the PR's check results after pushing.

## Dependencies and security findings

- **pnpm only.** A top-level `pnpm` field in `package.json` is ignored by pnpm 12. Overrides go in `pnpm-workspace.yaml` under `overrides:`. The current one forces `minimatch` to `^11.0.3` (Snyk `SNYK-JS-MINIMATCH-22111072`); remove it once ESLint depends on a fixed minimatch.
- **Snyk scans through its GitHub integration**, not a workflow, so there is no token in the repo. Unfixable dev-only findings are ignored in `.snyk`, each with a reason and an expiry (the current ones expire 2027-02-01). Remove an ignore as soon as a fix exists, and review them when they expire.
- poof-log has no runtime dependencies, so findings in dev tools never ship to users. Say so in the ignore reason, and still prefer a real fix when one exists.
- `pnpm audit` and `pnpm outdated` are the quick local checks. TypeScript and `@types/node` major bumps are ignored by Dependabot on purpose (see `AGENTS.md`).
- Secret scanning and push protection are on. Never commit tokens.
