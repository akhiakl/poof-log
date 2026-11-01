---
name: engine-change
description: How to change poof-log's engine in src/index.ts and its tests without breaking its invariants (zero cost when off, void return, opt-in log file, main-thread-only listeners, signal handling). Use before editing src/index.ts, the test fixtures, or anything that affects the preload behaviour.
---

# Changing the engine

`src/index.ts` is one file. Most bugs here come from breaking an invariant that still passes a quick manual run.

## Invariants (each one has a test or a reason)

1. **Gate first, work later.** `enabled` is computed once at the top. Everything that reads files, opens handles, adds listeners or inspects stacks lives in `init()`, called only when enabled. When off, `globalThis.debug` is the shared `NOOP`.
2. **Nothing per disabled call.** `NOOP` returns `undefined` and allocates nothing.
3. **`debug()` returns `void` and never waits.** The file write is chained on `tail` in the background and its failures are swallowed. Do not return the promise or make callers await it.
4. **Listeners only for the file, and only on the main thread.** `exit`, `SIGINT`, `SIGTERM` and `uncaughtException` are registered inside `if (toFile && isMainThread)`. `toFile` is `DEBUG_FILE=true`, off by default, so terminal-only use registers no listeners at all. Workers load the preload too, and a finished worker must not delete the main app's log.
5. **Signals use `once` and exit at zero listeners.** A library like signal-exit re-raises the signal only when it is the last listener. With `on` and a count of 1, both wait for each other and Ctrl+C hangs. `uncaughtException` stays `on` with a count of 1.
6. **Callsite capture restores state.** `locate()` swaps `Error.prepareStackTrace` and `Error.stackTraceLimit`, and restores both in `finally`.
7. **One open handle, ordered writes.** The log is opened once and writes are chained on `tail`, so lines keep call order and a write after cleanup lands on the unlinked file instead of recreating it.
8. **Cleanup is synchronous** (`unlinkSync`), because `exit` listeners cannot await.
9. **One log file per folder.** It is a documented shortcut, not an accident. Do not "fix" it silently; the file name is a product decision.
10. **No imports of anything but `node:` built-ins**, and no runtime dependencies.

## Steps

1. Write the failing test first in `test/debug.test.ts`. Add a fixture under `test/fixtures/app/` when it needs a real process (signals, workers, crashes). Fixtures call the global `debug` and never import poof-log.
2. Run `pnpm test` and confirm the new test fails for the right reason. A test that also passes without the fix proves nothing.
3. Make the smallest change in `src/index.ts`. Keep the comment density of the surrounding code.
4. `pnpm check`.
5. Smoke the built output both ways, with no import in the script:

   ```sh
   pnpm build
   cd test/fixtures/app
   NODE_ENV=development DEBUG_FILE=true node --import ../../../dist/index.mjs -e "debug('hi', { a: 1 })"
   NODE_ENV=development DEBUG_FILE=true node --require ../../../dist/index.cjs -e "debug('hi')"
   NODE_ENV=production node --require ../../../dist/index.cjs -e "debug('hi')"   # prints nothing
   ```

   No `.log` file may be left behind.

## Test traps

- A signal-killed child reports `code: null, signal: 'SIGINT'` from `spawn`, not 130. The shell shows 130. Assert on both or on "exited, did not hang" with your own timeout.
- Strip `NODE_ENV` from the child env: Vitest sets it to `test`.
- File writes are in the background, so a fixture that reads the log right after `debug()` must wait for it (`test/fixtures/app/wait-for-log.mjs`). Tests that need the file, or the listeners, set `DEBUG_FILE=true`.
- Environment variables over about 128 KB fail to spawn; keep test payloads below that.
- Fixtures run `src/index.ts` directly through Node's type stripping, so the source must stay erasable TypeScript (no enums, no parameter properties).
- `test/global-setup.ts` builds `dist/` once before the tests, and some tests preload `dist/index.mjs` (`--import`) and `dist/index.cjs` (`--require`), the files that ship. Preload `src` only for fast cases; anything about packaging or the CJS build belongs on `dist`.
