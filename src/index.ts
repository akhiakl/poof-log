/**
 * poof-log — a development-only global `debug()` engine.
 *
 * Never imported by application code. Node preloads it from the dev script:
 *
 *   node --import poof-log src/server.js     (ESM apps)
 *   node --require poof-log src/server.js    (CJS apps)
 *
 * When enabled it prints `[project] (file:line) message` to stdout. With
 * DEBUG_FILE=true it also appends a timestamped copy to `<project>.log` in the
 * working directory, and deletes that file again when the process exits, is
 * interrupted, is killed, or crashes. `debug()` returns at once: nothing waits
 * for the file write. When disabled (production, or not opted in) `debug` is a
 * pre-bound no-op.
 */
import { readFileSync, unlinkSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import { isMainThread } from 'node:worker_threads';

// Shipped in the emitted .d.mts/.d.cts. Apps opt into it with one line,
// `"types": ["node", "poof-log"]` in tsconfig or `/// <reference types="poof-log" />`,
// because nothing imports this module for TypeScript to discover it through.
declare global {
  // `var` is what makes this a property of `globalThis`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var debug: (...args: any[]) => void;
}

/** What a disabled `debug()` runs: nothing, and it allocates nothing. */
const NOOP = (): void => undefined;

/** Marks the process once, so loading both the ESM and CJS builds installs a single engine. */
const INSTALLED = Symbol.for('poof-log.installed');

const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const env = process.env;
// Decided once at boot. Production always wins over the opt-in flags.
const enabled =
  env.NODE_ENV !== 'production' && (env.NODE_ENV === 'development' || env.DEBUG_ENABLED === 'true');
// The log file is optional and off unless asked for.
const toFile = env.DEBUG_FILE === 'true';

const scope = globalThis as typeof globalThis & { [INSTALLED]?: true };
if (scope[INSTALLED] !== true) {
  scope[INSTALLED] = true;
  // Disabled: bind the no-op and stop here. No package.json read, no file,
  // no process listeners, no stack inspection on later calls.
  globalThis.debug = enabled ? init() : NOOP;
}

/** Sets up the live `debug` function, plus the log file and its cleanup listeners if asked. */
function init(): (...args: unknown[]) => void {
  const cwd = process.cwd();
  const name = readProjectName(cwd);
  // Known limit: every process started in this folder shares this one log file, and the first to
  // exit deletes it. Supporting several would mean adding the process id to the name.
  const logPath = join(cwd, `${name}.log`);
  const color = process.stdout.isTTY && env.NO_COLOR === undefined;
  const prefix = color ? `${CYAN}[${name}]${RESET}` : `[${name}]`;

  // The file is opened once and every line goes through this handle. Once
  // cleanup has unlinked the path, a write still in flight lands on the
  // unlinked file instead of creating a new one.
  const handle = toFile ? open(logPath, 'a').catch((): undefined => undefined) : undefined;
  // Writes run in the background, chained so lines reach the file in call order.
  let tail: Promise<void> = Promise.resolve();
  let closed = false;

  // Each rendering walks every argument, so build the plain one only if the terminal or file uses it.
  const needsPlain = !color || handle !== undefined;

  const debug = (...args: unknown[]): void => {
    const where = locate(cwd, debug);
    const plain = needsPlain ? format(args, false) : '';
    process.stdout.write(
      color
        ? `${prefix} ${DIM}(${where})${RESET} ${format(args, true)}\n`
        : `${prefix} (${where}) ${plain}\n`,
    );
    if (handle === undefined || closed) return;

    const line = `${new Date().toISOString()} [${where}] ${plain}\n`;
    tail = tail
      .then(async () => {
        const file = await handle;
        if (file !== undefined && !closed) await file.appendFile(line);
      })
      .catch(() => undefined);
  };

  // Without a log file there is nothing to clean up, so no process listeners at all.
  // Workers load this preload too, and their exit must not delete the main thread's log file.
  if (toFile && isMainThread) {
    /** Removes the log file. Synchronous, because 'exit' listeners cannot await. */
    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      try {
        unlinkSync(logPath);
      } catch {
        // Never created, or already removed.
      }
    };

    process.on('exit', cleanup);
    // A listener replaces Node's default "terminate" behaviour, so exit with the conventional
    // 128 + signal code ourselves. `once` removes our listener before it runs, so a library that
    // re-raises the signal only when it is the last listener (signal-exit) can finish the job.
    process.once('SIGINT', () => {
      cleanup();
      if (process.listenerCount('SIGINT') === 0) process.exit(130);
    });
    process.once('SIGTERM', () => {
      cleanup();
      if (process.listenerCount('SIGTERM') === 0) process.exit(143);
    });
    // Same for crashes: without this exit the error would be swallowed.
    process.on('uncaughtException', (error) => {
      cleanup();
      if (process.listenerCount('uncaughtException') === 1) {
        process.stderr.write(`${inspect(error)}\n`);
        process.exit(1);
      }
    });
  }

  return debug;
}

/**
 * Returns `relative/path/to/file.ts:line` for the code that called `boundary`.
 * Swaps in a V8 `prepareStackTrace` that hands back raw CallSite objects, and
 * restores the original handler and stack limit in `finally`.
 */
function locate(cwd: string, boundary: (...args: never[]) => unknown): string {
  // Saved only to be put back, never called, so `this` binding is irrelevant.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalPrepare = Error.prepareStackTrace;
  const originalLimit = Error.stackTraceLimit;
  try {
    // The caller is the only frame needed once `boundary` is cut off.
    Error.stackTraceLimit = 1;
    Error.prepareStackTrace = (_error, frames) => frames;
    const holder: { stack?: NodeJS.CallSite[] } = {};
    Error.captureStackTrace(holder, boundary);

    const frame = holder.stack?.[0];
    const file = frame?.getFileName();
    if (frame === undefined || typeof file !== 'string') return '<unknown>';
    // ESM frames report file:// URLs, CJS frames report plain paths.
    const path = file.startsWith('file://') ? fileURLToPath(file) : file;
    return `${relative(cwd, path)}:${String(frame.getLineNumber() ?? '?')}`;
  } catch {
    return '<unknown>';
  } finally {
    Error.prepareStackTrace = originalPrepare;
    Error.stackTraceLimit = originalLimit;
  }
}

/** Reads `name` from ./package.json and makes it safe to use as a file name. */
function readProjectName(cwd: string): string {
  try {
    const pkg: unknown = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    if (typeof pkg === 'object' && pkg !== null && 'name' in pkg && typeof pkg.name === 'string') {
      // "@scope/my app!" -> "scope-my-app-"
      const safe = pkg.name.replace(/^@/, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
      if (safe !== '') return safe;
    }
  } catch {
    // No package.json, or not valid JSON.
  }
  return 'app';
}

/** Strings as-is, everything else fully expanded by util.inspect. */
function format(args: readonly unknown[], colors: boolean): string {
  return args
    .map((arg) => (typeof arg === 'string' ? arg : inspect(arg, { depth: null, colors })))
    .join(' ');
}
