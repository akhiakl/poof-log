# poof-log

A development-only global `debug()` for Node.js. It prints `[project] (file:line) message` to the terminal, keeps a timestamped copy in `<project>.log`, and deletes that file when the process exits, is interrupted, is killed, or crashes. In production it is a no-op that does no I/O.

Your application code never imports it.

## Use

1. Install it as a dev dependency.
2. Preload it from your dev script:

   ```jsonc
   // package.json
   "scripts": {
     "dev": "NODE_ENV=development node --import poof-log src/server.js"
   }
   ```

   | App                | Flag                               |
   | ------------------ | ---------------------------------- |
   | ESM                | `node --import poof-log …`         |
   | CommonJS           | `node --require poof-log …`        |
   | TypeScript via tsx | `tsx --import poof-log …`          |
   | No script change   | `NODE_OPTIONS="--import poof-log"` |

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
   await debug('user loaded', user);
   ```

If a script runs without the preload flag, `debug` is undefined and calling it throws. Keep the flag in every script and let the environment gate below decide.

## When it is on

| `NODE_ENV`            | `DEBUG_ENABLED` | Result |
| --------------------- | --------------- | ------ |
| `production`          | anything        | off    |
| `development`         | anything        | on     |
| anything else / unset | `true`          | on     |
| anything else / unset | unset           | off    |

When it is off, `debug` returns one shared resolved promise. Nothing reads `package.json`, opens a file, inspects the stack or registers process listeners.

## What it does when on

- **Location:** captures the caller's file and line through V8's `Error.prepareStackTrace`, shown relative to `process.cwd()`.
- **Log file:** `<name>.log` in `process.cwd()`. The name comes from `package.json` with special characters replaced (`@scope/my app` becomes `scope-my-app.log`), or `app.log` if there is no name.
- **Terminal:** the project name in cyan and the location dimmed. Color is skipped when stdout isn't a TTY or `NO_COLOR` is set.
- **File:** `ISO-timestamp [file:line] message`, appended asynchronously in call order. The returned promise resolves once the line is written.
- **Cleanup:** the file is removed synchronously on `exit`, `SIGINT`, `SIGTERM` and `uncaughtException`. For signals and crashes it then exits with 130, 143 or 1, unless your app has its own listener for that event. In that case your app decides when to exit.

## Develop

```bash
pnpm check   # typecheck + lint + format:check + test
pnpm build   # dist/index.mjs, index.cjs, index.d.mts, index.d.cts
```

## Contributing

Git hooks (husky) install with `pnpm install`.

- **Branches** follow [Conventional Branch](https://conventional-branch.github.io): `feature/…`, `bugfix/…`, `hotfix/…`, `chore/…`, `release/…`, in lowercase-kebab-case. Checked on commit and push.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org), e.g. `feat: add NO_COLOR support`. Checked by commitlint.
- **Pre-commit** runs ESLint and Prettier on staged files, then a full type-check.
- **Pull requests** fill in the template (every section, every box ticked) and use a Conventional Commit title. Both are checked in CI, alongside format, lint, type-check, tests and build on Node 24 and 26.
