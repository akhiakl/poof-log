/**
 * poof-log — a development-only global `poof` logger engine.
 *
 * Never imported by application code. Node preloads it from the dev script:
 *
 *   node --import poof-log src/server.js     (ESM apps)
 *   node --require poof-log src/server.js    (CJS apps)
 *
 * `poof` has every method `console` has (log, table, group, time, assert, ...) and
 * behaves the same, plus `poof.enabled`. When enabled each call prints what
 * `console` would, under a `[project] [METHOD] (file:line)` prefix: on the same
 * line for one line of output, on a header line above for several. With
 * DEBUG_FILE=true they also append a timestamped copy to `<project>.log` in the working directory,
 * and that file is deleted again when the process exits, is interrupted, is
 * killed, or crashes (DEBUG_FILE=keep leaves it in place). The methods return at once: nothing waits for the file
 * write. When disabled (production, or not opted in) every method is a no-op.
 * The global is `poof`, not `debug`, which the `debug` package already owns.
 */
import { appendFileSync, readFileSync, unlinkSync } from 'node:fs';
import { Console } from 'node:console';
import { open } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatWithOptions, inspect } from 'node:util';
import { Writable } from 'node:stream';
import { isMainThread } from 'node:worker_threads';

// Shipped in the emitted .d.mts/.d.cts. Apps opt into it with one line,
// `"types": ["node", "poof-log"]` in tsconfig or `/// <reference types="poof-log" />`,
// because nothing imports this module for TypeScript to discover it through.
type Level = 'log' | 'debug' | 'info' | 'warn' | 'error';
/** The rest of `console`, exposed as-is: the inherited docs are the ones from @types/node. */
type Inherited =
  | 'assert'
  | 'clear'
  | 'count'
  | 'countReset'
  | 'dir'
  | 'dirxml'
  | 'group'
  | 'groupCollapsed'
  | 'groupEnd'
  | 'table'
  | 'time'
  | 'timeEnd'
  | 'timeLog'
  | 'trace';
const INHERITED: readonly Inherited[] = [
  'assert',
  'clear',
  'count',
  'countReset',
  'dir',
  'dirxml',
  'group',
  'groupCollapsed',
  'groupEnd',
  'table',
  'time',
  'timeEnd',
  'timeLog',
  'trace',
];
const LEVELS: readonly Level[] = ['log', 'debug', 'info', 'warn', 'error'];

declare global {
  /**
   * The development-only logger poof-log installs as the global `poof`.
   * Every method of `console` is here and behaves the same: same arguments, same output, and
   * `log`, `debug` and `info` go to stdout while `warn`, `error`, `trace` and `assert` go to stderr.
   * Each call is prefixed `[project] [METHOD] (file:line)`, like `[my-app] [INFO] (src/a.ts:3)`.
   * Objects are fully expanded. Every method returns at once.
   * Does nothing in production, or when neither `NODE_ENV=development` nor `DEBUG_ENABLED=true` is set.
   */
  interface Poof extends Pick<Console, Inherited> {
    /** `true` when poof prints. Guard expensive arguments with it: `if (poof.enabled) poof.log(dump())`. */
    readonly enabled: boolean;
    /**
     * Prints a message with its `file:line`. With `DEBUG_FILE=true` it is also appended to `<project>.log`.
     * Returns nothing and never waits: don't `await` it.
     *
     * @example
     * poof.log('user loaded', user);
     * // Prints: [my-app] [LOG] (src/users.ts:12) user loaded { id: 1, name: 'Ada' }
     */
    log(...args: unknown[]): void;
    /**
     * Same as `log`, tagged `[DEBUG]`. For detail you only want while chasing a problem.
     *
     * @example
     * poof.debug('cache key', key);
     * // Prints: [my-app] [DEBUG] (src/cache.ts:8) cache key user:1
     */
    debug(...args: unknown[]): void;
    /**
     * Same as `log`, tagged `[INFO]`. For notable events in normal operation.
     *
     * @example
     * poof.info('server listening', { port });
     * // Prints: [my-app] [INFO] (src/server.ts:31) server listening { port: 3000 }
     */
    info(...args: unknown[]): void;
    /**
     * Same as `log`, tagged `[WARN]`, and printed to stderr. For things that are wrong but recoverable.
     *
     * @example
     * poof.warn('slow query', { ms: 840 });
     * // Prints: [my-app] [WARN] (src/db.ts:44) slow query { ms: 840 }
     */
    warn(...args: unknown[]): void;
    /**
     * Same as `log`, tagged `[ERROR]`, and printed to stderr. Does not throw.
     *
     * @example
     * poof.error('payment failed', err);
     * // Prints: [my-app] [ERROR] (src/pay.ts:20) payment failed Error: declined ...
     */
    error(...args: unknown[]): void;
  }

  // `var` is what makes this a property of `globalThis`.
  var poof: Poof;
}

/** What a disabled method runs: nothing, and it allocates nothing. */
const NOOP = (): void => undefined;

/** Marks the process once, so loading both the ESM and CJS builds installs a single engine. */
const INSTALLED = Symbol.for('poof-log.installed');

const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
/** Tag colors. Anything not listed (table, group, ...) is blue. */
const TAG_COLORS: Partial<Record<Level | Inherited, string>> = {
  log: '\x1b[37m',
  debug: '\x1b[35m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

const env = process.env;
// Decided once at boot. Production always wins over the opt-in flags.
const enabled =
  env.NODE_ENV !== 'production' && (env.NODE_ENV === 'development' || env.DEBUG_ENABLED === 'true');
// The log file is optional and off unless asked for.
// `true` deletes it when the process stops; `keep` leaves it, for reading after the app is gone.
const keep = env.DEBUG_FILE === 'keep';
const toFile = env.DEBUG_FILE === 'true' || keep;

const scope = globalThis as typeof globalThis & { [INSTALLED]?: true };
if (scope[INSTALLED] !== true) {
  scope[INSTALLED] = true;
  // Disabled: bind the no-op and stop here. No package.json read, no file,
  // no process listeners, no stack inspection on later calls.
  globalThis.poof = enabled ? init() : disabled();
}

/** Every method is the same shared no-op. */
function disabled(): Poof {
  const methods = Object.fromEntries([...LEVELS, ...INHERITED].map((name) => [name, NOOP]));
  return { ...methods, enabled: false } as unknown as Poof;
}

/** Sets up the live `poof` methods, plus the log file and its cleanup listeners if asked. */
function init(): Poof {
  const cwd = process.cwd();
  const name = readProjectName(cwd);
  // Known limit: every process started in this folder shares this one log file, and the first to
  // exit deletes it. Supporting several would mean adding the process id to the name.
  const logPath = join(cwd, `${name}.log`);
  // FORCE_COLOR is the usual way to ask for color when stdout is piped; NO_COLOR always wins.
  const forced =
    env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0' && env.FORCE_COLOR !== 'false';
  // Decided per stream: stdout can be a terminal while stderr goes to a file, or the reverse.
  const colorFor = (stream: NodeJS.WriteStream): boolean =>
    (stream.isTTY || forced) && env.NO_COLOR === undefined;
  const colorOut = colorFor(process.stdout);
  const colorErr = colorFor(process.stderr);

  // The file is opened once and every line goes through this handle. Once
  // cleanup has unlinked the path, a write still in flight lands on the
  // unlinked file instead of creating a new one.
  // A kept file skips the handle: each line is appended before the call returns, so a crash or a
  // kill cannot lose it, and there is nothing to clean up.
  const handle = toFile && !keep ? open(logPath, 'a').catch((): undefined => undefined) : undefined;
  // Writes run in the background, chained so lines reach the file in call order.
  let tail: Promise<void> = Promise.resolve();
  let closed = false;

  /** Appends to the kept file right away. A failed write is dropped, like the background one. */
  const writeKept = (text: string): void => {
    try {
      appendFileSync(logPath, text);
    } catch {
      // Unwritable folder: logging to the terminal still works.
    }
  };
  if (keep)
    writeKept(`${new Date().toISOString()} [poof-log] started (pid ${String(process.pid)})\n`);

  // The call being printed. `Console` writes synchronously, so the sinks below read these
  // while the method that set them is still on the stack.
  let where = '';
  let tag = '';
  // Color of the tag being printed, used by the streams that are in color.
  let hue = BLUE;

  /**
   * Prefixes every line `Console` writes. Prints to `stream`, and/or queues lines for the file.
   * `colored` also tells `Console` the sink is a terminal, so it colors the values it prints.
   */
  const sink = (stream: NodeJS.WriteStream | undefined, logged: boolean, colored: boolean) =>
    Object.assign(
      new Writable({
        decodeStrings: false,
        write(chunk: string | Buffer, _encoding, done) {
          const lines = chunk.toString().split('\n');
          if (lines.at(-1) === '') lines.pop();
          // One line stays on the header's line. Several get the header on top and the output
          // below it as console prints it, so a table or a stack trace stays readable.
          const body = (head: string) =>
            lines.length > 1 ? `${head}\n${lines.join('\n')}\n` : `${head} ${lines[0] ?? ''}\n`;
          if (stream !== undefined) {
            stream.write(
              body(
                colored
                  ? `${CYAN}[${name}]${RESET} ${hue}${tag.trim()}${RESET} ${DIM}(${where})${RESET}`
                  : `[${name}] ${tag}(${where})`,
              ),
            );
          }
          if (logged && keep) {
            writeKept(body(`${new Date().toISOString()} ${tag}[${where}]`));
          } else if (logged && handle !== undefined && !closed) {
            const text = body(`${new Date().toISOString()} ${tag}[${where}]`);
            tail = tail
              .then(async () => {
                const file = await handle;
                if (file !== undefined && !closed) await file.appendFile(text);
              })
              .catch(() => undefined);
          }
          done();
        },
      }),
      { isTTY: colored },
    );

  // A closed pipe (`node app | head`) would otherwise kill the app with an unhandled EPIPE.
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') throw error;
    });
  }

  // Objects stay fully expanded, as before.
  const inspectOptions = { depth: null };
  // A stream in color prints escape codes, so the file gets its own plain rendering. Without
  // color the terminal copy is the file copy.
  const needsPlainFile = toFile && (colorOut || colorErr);
  const terminal = new Console({
    stdout: sink(process.stdout, !needsPlainFile, colorOut),
    stderr: sink(process.stderr, !needsPlainFile, colorErr),
    colorMode: 'auto',
    inspectOptions,
  });
  const plainFile = needsPlainFile ? sink(undefined, true, false) : undefined;
  const fileOnly =
    plainFile &&
    new Console({ stdout: plainFile, stderr: plainFile, colorMode: false, inspectOptions });

  type Call = (...args: unknown[]) => void;
  const make = (method: Level | Inherited): Call => {
    // `log` is the plain form; the other methods name themselves.
    const label = `[${method.toUpperCase()}] `;
    const call: Call = (...args) => {
      // A value's own `inspect` can call `poof` while this call is being formatted. Put this
      // call's state back afterwards, or the outer line would print the inner call's location.
      const saved = { where, tag, hue };
      where = locate(cwd, call);
      tag = label;
      hue = TAG_COLORS[method] ?? BLUE;
      try {
        let name: string = method;
        if (method === 'trace') {
          // Console's own trace would list this wrapper as the first frame, so build the stack
          // here from the caller up and print it the way Console does: to stderr.
          const holder = { stack: '' };
          Error.captureStackTrace(holder, call);
          const message = args.length > 0 ? `: ${formatWithOptions({ depth: null }, ...args)}` : '';
          args = ['%s', `Trace${message}\n${holder.stack.split('\n').slice(1).join('\n')}`];
          name = 'error';
        }
        (terminal as unknown as Record<string, Call>)[name]?.(...args);
        (fileOnly as unknown as Record<string, Call> | undefined)?.[name]?.(...args);
      } finally {
        ({ where, tag, hue } = saved);
      }
    };
    return call;
  };

  // Without a log file there is nothing to clean up, so no process listeners at all.
  // Workers load this preload too, and their exit must not delete the main thread's log file.
  if (toFile && !keep && isMainThread) {
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

  const methods = Object.fromEntries([...LEVELS, ...INHERITED].map((name) => [name, make(name)]));
  return { ...methods, enabled: true } as unknown as Poof;
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
