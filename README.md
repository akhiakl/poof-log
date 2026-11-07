# poof-log

A development-only global `poof` for Node.js. It has every `console` method (`log`, `info`, `warn`, `error`, `table`, `group`, `time`, `count`, `assert`, `dir`, ...) and they behave the same, plus `poof.enabled`. Each line is prefixed with the project name, method and caller, so you see where a log came from:

```
[my-app] [INFO] (src/server.ts:31) listening on :3000
```

- **Zero cost in production.** When off, every method is an empty function: no I/O, no listeners.
- **Optional log file.** `DEBUG_FILE=true` also writes `<project>.log` and deletes it when the process stops.
- **No dependencies**, Node 24 or newer. Named `poof`, not `debug`, which is already an npm package.

Your application code never imports it.

## Use

1. Install it as a regular dependency, not a dev one. A production install skips dev dependencies, and `node --import poof-log` then fails to start. In production it does nothing.

   ```bash
   pnpm add poof-log   # or: npm install poof-log
   ```

2. Preload it from your dev script:

   ```jsonc
   // package.json
   "scripts": {
     "dev": "NODE_ENV=development node --import poof-log src/server.js"
   }
   ```

   | App                | Flag                        |
   | ------------------ | --------------------------- |
   | ESM                | `node --import poof-log …`  |
   | CommonJS           | `node --require poof-log …` |
   | TypeScript via tsx | `tsx --import poof-log …`   |

3. Get the global type. TypeScript can't find a module nothing imports, so add one line, either in `tsconfig.json`:

   ```jsonc
   "compilerOptions": { "types": ["node", "poof-log"] }
   ```

   or in any `.d.ts` file in your project:

   ```ts
   /// <reference types="poof-log" />
   ```

4. Call it anywhere:

   ```ts
   poof.log('user loaded', user);
   poof.warn('slow query', { ms: 840 });
   ```

If a script runs without the preload flag, `poof` is undefined and calling it throws. Keep the flag in every script and let the environment gate below decide.

Every method returns nothing and never waits: don't `await` it. Printing and the file write happen in the background.

Don't set the flag through `NODE_OPTIONS`: it would load the engine into every Node process you start (npm, nodemon, build tools), and with `DEBUG_FILE=true` they would delete each other's log file.

## Use `console.log` as is

Prefer not to change any code? Set `DEBUG_CONSOLE=true` and `console.log`, `console.warn`, `console.table` and the other `console` methods behave exactly like their `poof` twins: the same prefix, location and optional log file.

```jsonc
"dev": "NODE_ENV=development DEBUG_CONSOLE=true node --import poof-log src/server.js"
```

It is opt-in and only applies while poof is on, so production never touches `console`. It also covers `console` calls made by your dependencies, which then get the project prefix too.

## Environment variables

| Variable        | Values                       | Effect                                                      |
| --------------- | ---------------------------- | ----------------------------------------------------------- |
| `NODE_ENV`      | `development` / `production` | `development` turns it on, `production` always turns it off |
| `DEBUG_ENABLED` | `true`                       | Turns it on when `NODE_ENV` is not set to either            |
| `DEBUG_CONSOLE` | `true`                       | Also route the global `console` through poof (see below)    |
| `DEBUG_FILE`    | `true` / `keep`              | Also write `<project>.log` (deleted on exit, or kept)       |
| `NO_COLOR`      | any                          | Turns terminal color off                                    |
| `FORCE_COLOR`   | any                          | Keeps color when the stream is not a TTY                    |

## When it is on

| `NODE_ENV`            | `DEBUG_ENABLED` | Result |
| --------------------- | --------------- | ------ |
| `production`          | anything        | off    |
| `development`         | anything        | on     |
| anything else / unset | `true`          | on     |
| anything else / unset | unset           | off    |

When it is off, every method is an empty function. Nothing reads `package.json`, opens a file, inspects the stack or registers process listeners.

The log file is a separate, opt-in switch, so it is off unless you set `DEBUG_FILE=true` (deleted when the process stops) or `DEBUG_FILE=keep` (kept). Without it you get terminal output only: no file is created, `package.json` is read just for the name in the prefix, and no `exit`, signal or crash listeners are registered. `DEBUG_FILE` does nothing in production.

## What it does when on

- **Location:** captures the caller's file and line through V8's `Error.prepareStackTrace`, shown relative to `process.cwd()`.
- **Log file** (`DEBUG_FILE=true`): `<name>.log` in `process.cwd()`, one per folder. Every Node process that loads the preload deletes it when it exits, so a `fork`ed or `cluster` child that exits early takes the log with it. Run a single instrumented process per folder. The name comes from `package.json` with special characters replaced (`@scope/my app` becomes `scope-my-app.log`), or `app.log` if there is no name.
- **Streams:** like `console`, `log`, `debug`, `info`, `table` and the rest go to stdout, and `warn`, `error`, `trace` and `assert` go to stderr. A multi-line result such as `poof.table`, or an error with a stack, gets the `[project] [METHOD] (file:line)` header on its own line with the output below it. Objects are fully expanded, not cut at depth 2 as `console` does.
- **Terminal:** the project name in cyan, the location dimmed, and the method name (`[INFO]`) colored: `debug` magenta, `info` green, `warn` yellow, `error` red, `log` white, the rest blue. Color is decided per stream, so stdout can be colored while stderr is redirected to a file. A stream that isn't a TTY gets no color, unless `FORCE_COLOR` is set. `NO_COLOR` always turns it off.
- **File:** `ISO-timestamp [METHOD] [file:line] message` (for example `… [INFO] [src/server.ts:31] listening`), with multi-line output under one such header line, appended in the background in call order. The methods do not wait for it, and lines still queued when the process exits are lost, which is fine because the file is deleted then anyway.
- **Keeping the log** (`DEBUG_FILE=keep`): the same `<name>.log`, but it is never deleted and every run appends to it, starting with a `[poof-log] started (pid …)` line. Each line is written before the call returns, so nothing is lost on a crash or a kill, and no `exit` or signal listeners are registered. It costs a small synchronous write per call, which is fine for development. Delete the file yourself when you are done; `*.log` is usually already in `.gitignore`.
- **Cleanup** (`DEBUG_FILE=true`): the file is removed synchronously on `exit`, `SIGINT`, `SIGTERM` and `uncaughtException`. For signals and crashes it then exits with 130, 143 or 1, unless your app has its own listener for that event. In that case your app decides when to exit.

## Try it

`examples/basic` is a small TypeScript HTTP server set up the way your own app should be: `poof-log` as a dependency, the preload flag in the `dev` script, and `"types": ["node", "poof-log"]` in `tsconfig.json`. From a clone:

```bash
pnpm install && pnpm build          # in the repo root
cd examples/basic
pnpm install --ignore-workspace
pnpm dev                            # or pnpm dev:file, which also writes poof-log-example.log here
curl localhost:3000/users/1         # also try /users/9 and /boom
```

The log file is named after `name` in the example's `package.json` and is deleted when you stop the server. `pnpm tour` runs `src/tour.ts`, which calls every `poof` method once: the levels, `table`, `dir`, `group`, `count`, `time`, `assert`, `trace` and `enabled`.

## Develop

```bash
pnpm check   # typecheck + lint + format:check + test
pnpm build   # dist/index.mjs, index.cjs, index.d.mts, index.d.cts
```

## Security checks

- **CodeQL** scans the code on every PR, on pushes to `main` and weekly.
- **Snyk** scans dependencies through its GitHub integration: import the repo at snyk.io (no token or workflow needed). It rescans on a schedule and adds a check to PRs.
- **Socket Firewall** (free, no token) blocks malicious packages while CI installs dependencies.
- **Dependabot** opens weekly update PRs for npm and GitHub Actions. TypeScript and `@types/node` major bumps are ignored on purpose.
- **CODEOWNERS** makes `@akhiakl` the default reviewer.

## Contributing

Git hooks (husky) install with `pnpm install`.

AI agents and humans follow the same rules in [AGENTS.md](AGENTS.md). Repo skills live in `.agents/skills/` and work with any agent that reads the Agent Skills format; Claude Code reads them through symlinks in `.claude/skills/`.

- **Branches** follow [Conventional Branch](https://conventional-branch.github.io): `feature/…`, `bugfix/…`, `hotfix/…`, `chore/…`, `release/…`, in lowercase-kebab-case. Checked on commit and push.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org), e.g. `feat: add NO_COLOR support`. Checked by commitlint.
- **Pre-commit** runs ESLint and Prettier on staged files, then a full type-check.
- **Pull requests** fill in the template (every section, every box ticked) and use a Conventional Commit title. Both are checked in CI, alongside format, lint, type-check, tests and build on Node 24 and 26.
